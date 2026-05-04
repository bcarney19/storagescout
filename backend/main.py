import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Integer, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db, init_db, settings
from entity_linker import rebuild_entities
from intelligence import (
    is_chain,
    is_non_target,
    lead_thesis,
    lead_tier,
    target_score,
    weakness_flags,
)
from models import Entity, Facility, FacilityEntityLink
from places_fetcher import (
    US_STATES,
    _component,
    _get_import_details,
    _state_from_components,
    _street_address,
    fetch_facilities_for_state,
)
from scorer import score_facility

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Storage Scout API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory scan state (resets on server restart, which is fine for a tool)
active_scans: dict[str, dict] = {}


@app.on_event("startup")
async def startup():
    await init_db()


# ---------------------------------------------------------------------------
# Facilities
# ---------------------------------------------------------------------------

@app.get("/api/facilities")
async def get_facilities(
    state: Optional[str] = None,
    facility_type: Optional[str] = None,
    min_score: Optional[int] = None,
    max_score: Optional[int] = None,
    scan_status: Optional[str] = None,
    deal_stage: Optional[str] = None,
    search: Optional[str] = None,
    independent_only: bool = False,
    no_website: bool = False,
    no_phone: bool = False,
    zero_reviews: bool = False,
    dead_website: bool = False,
    min_target_score: Optional[int] = None,
    exclude_non_targets: bool = True,
    limit: int = 5000,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Facility)
    if state:
        q = q.where(Facility.state == state)
    if facility_type:
        q = q.where(Facility.facility_type == facility_type)
    if min_score is not None:
        q = q.where(Facility.opportunity_score >= min_score)
    if max_score is not None:
        q = q.where(Facility.opportunity_score <= max_score)
    if scan_status:
        q = q.where(Facility.scan_status == scan_status)
    if deal_stage:
        q = q.where(Facility.deal_stage == deal_stage)
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(
            Facility.name.ilike(term),
            Facility.city.ilike(term),
            Facility.address.ilike(term),
            Facility.google_website.ilike(term),
            Facility.google_phone.ilike(term),
        ))
    if no_website:
        q = q.where(Facility.google_website.is_(None))
    if no_phone:
        q = q.where(Facility.google_phone.is_(None))
    if zero_reviews:
        q = q.where(Facility.google_review_count == 0)
    if dead_website:
        q = q.where(Facility.website_alive.is_(False))
    q = (
        q.order_by(Facility.opportunity_score.desc().nullslast())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(q)).scalars().all()
    ids = [facility.id for facility in rows]
    linked_counts = {}
    if ids:
        linked_counts = dict(
            (
                await db.execute(
                    select(
                        FacilityEntityLink.facility_id,
                        func.count(FacilityEntityLink.id),
                    )
                    .where(FacilityEntityLink.facility_id.in_(ids))
                    .group_by(FacilityEntityLink.facility_id)
                )
            ).all()
        )
    result = []
    for facility in rows:
        data = await _to_dict_with_intelligence(
            db,
            facility,
            linked_count=linked_counts.get(facility.id, 0),
        )
        if independent_only and data["is_chain"]:
            continue
        if exclude_non_targets and data["is_non_target"]:
            continue
        if min_target_score is not None and data["target_score"] < min_target_score:
            continue
        result.append(data)
    return result[:limit]


@app.get("/api/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count(Facility.id)))
    scanned = await db.scalar(
        select(func.count(Facility.id)).where(Facility.scan_status == "complete")
    )
    high_opp = await db.scalar(
        select(func.count(Facility.id)).where(Facility.opportunity_score >= 70)
    )
    return {
        "total_facilities": total or 0,
        "scanned": scanned or 0,
        "high_opportunity": high_opp or 0,
        "pending": (total or 0) - (scanned or 0),
        "has_api_key": bool(settings.google_places_api_key),
        "active_scans": list(active_scans.values()),
        "chains": await db.scalar(select(func.count(Facility.id)).where(
            or_(
                Facility.name.ilike("%u-haul%"),
                Facility.name.ilike("%public storage%"),
                Facility.name.ilike("%extra space%"),
                Facility.name.ilike("%cubesmart%"),
            )
        )) or 0,
    }


VALID_STAGES = {"new", "contacted", "interested", "under_loi", "closed", "dead"}


async def require_import_token(
    authorization: Optional[str] = Header(default=None),
    x_import_token: Optional[str] = Header(default=None),
):
    if not settings.import_api_token:
        return
    bearer = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    if x_import_token != settings.import_api_token and bearer != settings.import_api_token:
        raise HTTPException(401, "Import token required")


@app.patch("/api/facilities/{facility_id}")
async def update_facility(
    facility_id: str,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    allowed = {"deal_stage", "notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "deal_stage" in updates and updates["deal_stage"] not in VALID_STAGES:
        raise HTTPException(400, "Invalid deal stage")
    if not updates:
        raise HTTPException(400, "Nothing to update")
    await db.execute(
        update(Facility).where(Facility.id == facility_id).values(**updates)
    )
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Entity links
# ---------------------------------------------------------------------------

@app.get("/api/facilities/{facility_id}/entities")
async def get_facility_entities(
    facility_id: str,
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Entity, FacilityEntityLink)
            .join(FacilityEntityLink, FacilityEntityLink.entity_id == Entity.id)
            .where(FacilityEntityLink.facility_id == facility_id)
            .order_by(FacilityEntityLink.strength.desc())
        )
    ).all()

    result = []
    for entity, link in rows:
        linked_facilities = (
            await db.execute(
                select(Facility)
                .join(FacilityEntityLink, FacilityEntityLink.facility_id == Facility.id)
                .where(FacilityEntityLink.entity_id == entity.id)
                .where(Facility.id != facility_id)
                .order_by(Facility.opportunity_score.desc().nullslast())
                .limit(12)
            )
        ).scalars().all()
        result.append({
            **_entity_to_dict(entity),
            "link": _link_to_dict(link),
                "linked_facilities": [await _to_dict_with_intelligence(db, f) for f in linked_facilities],
        })
    return result


@app.get("/api/entities")
async def get_entities(
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Entity)
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(
            Entity.name.ilike(term),
            Entity.normalized_key.ilike(term),
        ))
    rows = (
        await db.execute(
            q
            .order_by(Entity.confidence.desc(), Entity.name.asc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [await _entity_to_dict_with_rollup(db, e) for e in rows]


@app.get("/api/entities/{entity_id}")
async def get_entity(
    entity_id: str,
    db: AsyncSession = Depends(get_db),
):
    entity = await db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(404, "Entity not found")
    return await _entity_to_dict_with_rollup(db, entity, facility_limit=50)


@app.post("/api/entities/rebuild")
async def rebuild_entity_links(
    _: None = Depends(require_import_token),
    db: AsyncSession = Depends(get_db),
):
    return await rebuild_entities(db)


@app.post("/api/facilities/revalidate-states")
async def revalidate_facility_states(
    _: None = Depends(require_import_token),
    db: AsyncSession = Depends(get_db),
):
    facilities = (
        await db.execute(
            select(Facility).where(Facility.google_place_id.is_not(None))
        )
    ).scalars().all()

    checked = 0
    updated = 0
    deleted = 0
    skipped = 0
    for facility in facilities:
        details = await _get_import_details(facility.google_place_id)
        checked += 1
        if not details:
            skipped += 1
            continue

        components = details.get("address_components", [])
        actual_state = _state_from_components(components)
        if actual_state not in US_STATES:
            await db.delete(facility)
            deleted += 1
            continue

        values = {
            "state": actual_state,
            "address": _street_address(components) or details.get("formatted_address"),
            "city": (
                _component(components, "locality")
                or _component(components, "postal_town")
                or _component(components, "administrative_area_level_2")
            ),
            "zip_code": _component(components, "postal_code"),
            "google_name": details.get("name") or facility.google_name,
            "google_rating": details.get("rating"),
            "google_review_count": details.get("user_ratings_total"),
            "google_business_status": details.get("business_status", facility.google_business_status),
        }
        changed = any(getattr(facility, key) != value for key, value in values.items())
        if changed:
            await db.execute(
                update(Facility)
                .where(Facility.id == facility.id)
                .values(**values)
            )
            updated += 1

    await db.commit()
    await rebuild_entities(db)
    return {
        "checked": checked,
        "updated": updated,
        "deleted_non_us": deleted,
        "skipped": skipped,
    }


# ---------------------------------------------------------------------------
# Import / scan
# ---------------------------------------------------------------------------

class ImportRequest(BaseModel):
    facility_types: list[str] = ["self_storage", "mobile_home_park"]


@app.post("/api/import/{state_code}")
async def import_state(
    state_code: str,
    body: ImportRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_import_token),
):
    state_code = state_code.upper()
    if state_code not in US_STATES:
        raise HTTPException(400, f"Unknown state code: {state_code}")

    scan_id = str(uuid.uuid4())
    active_scans[scan_id] = {
        "id": scan_id,
        "status": "starting",
        "state": state_code,
        "progress": 0,
        "total": 0,
        "fetched": 0,
        "new_count": 0,
    }
    background_tasks.add_task(_run_import, scan_id, state_code, body.facility_types)
    return {"scan_id": scan_id}


@app.get("/api/scan/{scan_id}")
async def get_scan(scan_id: str):
    if scan_id not in active_scans:
        raise HTTPException(404, "Scan not found")
    return active_scans[scan_id]


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

async def _run_import(scan_id: str, state_code: str, facility_types: list[str]):
    try:
        active_scans[scan_id]["status"] = "fetching"
        facilities_data = await fetch_facilities_for_state(state_code, facility_types)
        active_scans[scan_id]["fetched"] = len(facilities_data)

        # Persist new facilities — deduplicate by google_place_id
        async with AsyncSessionLocal() as db:
            new_count = 0
            for fdata in facilities_data:
                place_id = fdata.get("google_place_id")
                if place_id:
                    exists = await db.scalar(
                        select(Facility.id).where(Facility.google_place_id == place_id)
                    )
                else:
                    exists = None
                if not exists:
                    db.add(Facility(id=str(uuid.uuid4()), **fdata))
                    new_count += 1
            await db.commit()

        active_scans[scan_id]["new_count"] = new_count

        if not settings.google_places_api_key:
            async with AsyncSessionLocal() as db:
                await rebuild_entities(db)
            active_scans[scan_id]["status"] = "complete_no_key"
            active_scans[scan_id]["message"] = (
                "Imported without scoring — paste your Google Places API key into backend/.env and restart"
            )
            return

        # Score all pending facilities for this state
        active_scans[scan_id]["status"] = "scoring"
        async with AsyncSessionLocal() as db:
            pending = (
                await db.execute(
                    select(Facility)
                    .where(Facility.state == state_code)
                    .where(Facility.scan_status == "pending")
                )
            ).scalars().all()

        active_scans[scan_id]["total"] = len(pending)
        sem = asyncio.Semaphore(5)

        async def _score_one(f: Facility):
            async with sem:
                try:
                    result = await score_facility({
                        "name": f.name,
                        "address": f.address,
                        "city": f.city,
                        "state": f.state,
                        "lat": f.lat,
                        "lng": f.lng,
                        "facility_type": f.facility_type,
                        "google_place_id": f.google_place_id,
                        "google_name": f.google_name,
                        "google_rating": f.google_rating,
                        "google_review_count": f.google_review_count,
                        "google_business_status": f.google_business_status,
                    })
                    async with AsyncSessionLocal() as db2:
                        await db2.execute(
                            update(Facility)
                            .where(Facility.id == f.id)
                            .values(
                                **result,
                                scan_status="complete",
                                scanned_at=datetime.utcnow(),
                            )
                        )
                        await db2.commit()
                except Exception as e:
                    logger.error("Score failed for %s: %s", f.id, e)
                finally:
                    active_scans[scan_id]["progress"] += 1

        await asyncio.gather(*[_score_one(f) for f in pending])
        async with AsyncSessionLocal() as db:
            await rebuild_entities(db)
        active_scans[scan_id]["status"] = "complete"

    except Exception as e:
        logger.error("Import %s failed: %s", scan_id, e)
        active_scans[scan_id]["status"] = "error"
        active_scans[scan_id]["error"] = str(e)


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------

def _to_dict(f: Facility) -> dict:
    return {
        "id": f.id,
        "osm_id": f.osm_id,
        "name": f.name,
        "facility_type": f.facility_type,
        "lat": f.lat,
        "lng": f.lng,
        "address": f.address,
        "city": f.city,
        "state": f.state,
        "zip_code": f.zip_code,
        "google_place_id": f.google_place_id,
        "google_name": f.google_name,
        "google_website": f.google_website,
        "google_phone": f.google_phone,
        "google_rating": f.google_rating,
        "google_review_count": f.google_review_count,
        "google_business_status": f.google_business_status,
        "opportunity_score": f.opportunity_score,
        "score_breakdown": json.loads(f.score_breakdown) if f.score_breakdown else None,
        "website_alive": f.website_alive,
        "scan_status": f.scan_status,
        "scanned_at": f.scanned_at.isoformat() if f.scanned_at else None,
        "deal_stage": f.deal_stage,
        "notes": f.notes,
    }


def _entity_to_dict(e: Entity) -> dict:
    return {
        "id": e.id,
        "entity_type": e.entity_type,
        "name": e.name,
        "normalized_key": e.normalized_key,
        "confidence": e.confidence,
        "signals": json.loads(e.signals) if e.signals else None,
    }


async def _entity_to_dict_with_rollup(
    db: AsyncSession,
    entity: Entity,
    facility_limit: int = 8,
) -> dict:
    facilities = (
        await db.execute(
            select(Facility)
            .join(FacilityEntityLink, FacilityEntityLink.facility_id == Facility.id)
            .where(FacilityEntityLink.entity_id == entity.id)
            .order_by(Facility.opportunity_score.desc().nullslast())
            .limit(facility_limit)
        )
    ).scalars().all()
    metrics = (
        await db.execute(
            select(
                func.count(Facility.id),
                func.max(Facility.opportunity_score),
                func.avg(Facility.opportunity_score),
                func.sum(
                    (Facility.opportunity_score >= 70).cast(Integer)
                ),
            )
            .join(FacilityEntityLink, FacilityEntityLink.facility_id == Facility.id)
            .where(FacilityEntityLink.entity_id == entity.id)
        )
    ).one()
    return {
        **_entity_to_dict(entity),
        "facility_count": metrics[0] or 0,
        "max_score": metrics[1],
        "avg_score": round(metrics[2], 1) if metrics[2] is not None else None,
        "high_opportunity_count": metrics[3] or 0,
        "linked_facilities": [await _to_dict_with_intelligence(db, f) for f in facilities],
    }


async def _linked_count(db: AsyncSession, facility_id: str) -> int:
    return await db.scalar(
        select(func.count(FacilityEntityLink.id))
        .where(FacilityEntityLink.facility_id == facility_id)
    ) or 0


async def _to_dict_with_intelligence(
    db: AsyncSession,
    f: Facility,
    linked_count: Optional[int] = None,
) -> dict:
    if linked_count is None:
        linked_count = await _linked_count(db, f.id)
    score = target_score(f, linked_count)
    return {
        **_to_dict(f),
        "target_score": score,
        "lead_tier": lead_tier(score),
        "is_chain": is_chain(f),
        "is_non_target": is_non_target(f),
        "weakness_flags": weakness_flags(f),
        "lead_thesis": lead_thesis(f, linked_count),
        "entity_link_count": linked_count,
    }


def _link_to_dict(link: FacilityEntityLink) -> dict:
    return {
        "id": link.id,
        "facility_id": link.facility_id,
        "entity_id": link.entity_id,
        "link_type": link.link_type,
        "strength": link.strength,
        "evidence": json.loads(link.evidence) if link.evidence else None,
    }
