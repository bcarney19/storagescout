import json
import re
import uuid
from collections import Counter, defaultdict
from typing import Iterable, Optional
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Entity, Facility, FacilityEntityLink

GENERIC_NAME_TOKENS = {
    "a",
    "and",
    "at",
    "co",
    "community",
    "home",
    "homes",
    "inc",
    "llc",
    "ltd",
    "manufactured",
    "mini",
    "mobile",
    "park",
    "parks",
    "rv",
    "self",
    "storage",
    "storages",
    "the",
    "trailer",
    "village",
}


async def rebuild_entities(db: AsyncSession) -> dict:
    facilities = (await db.execute(select(Facility))).scalars().all()
    groups = _build_groups(facilities)

    await db.execute(delete(FacilityEntityLink))
    await db.execute(delete(Entity))

    entity_count = 0
    link_count = 0
    for key, group in groups.items():
        if len(group["facilities"]) < 2:
            continue
        entity = Entity(
            id=str(uuid.uuid4()),
            entity_type="operator_candidate",
            name=_entity_name(group),
            normalized_key=key,
            confidence=group["confidence"],
            signals=json.dumps(group["signals"]),
        )
        db.add(entity)
        entity_count += 1

        for facility in group["facilities"]:
            db.add(
                FacilityEntityLink(
                    id=str(uuid.uuid4()),
                    facility_id=facility.id,
                    entity_id=entity.id,
                    link_type=group["link_type"],
                    strength=group["confidence"],
                    evidence=json.dumps(_evidence(facility, group)),
                )
            )
            link_count += 1

    await db.commit()
    return {
        "entities": entity_count,
        "links": link_count,
        "facilities": len(facilities),
    }


def _build_groups(facilities: Iterable[Facility]) -> dict[str, dict]:
    buckets: dict[str, dict] = {}
    grouped_facilities: dict[str, list[Facility]] = defaultdict(list)

    for facility in facilities:
        for key, link_type, confidence, value in _facility_keys(facility):
            grouped_facilities[key].append(facility)
            buckets[key] = {
                "link_type": link_type,
                "confidence": confidence,
                "signals": {"type": link_type, "value": value},
            }

    return {
        key: {**buckets[key], "facilities": values}
        for key, values in grouped_facilities.items()
    }


def _facility_keys(facility: Facility):
    domain = _domain(facility.google_website)
    if domain:
        yield f"domain:{domain}", "shared_domain", 0.9, domain

    phone = _phone(facility.google_phone)
    if phone:
        yield f"phone:{phone}", "shared_phone", 0.85, phone

    name = _name_key(facility.name)
    if name and facility.state:
        yield f"name_state:{facility.state}:{name}", "same_state_name", 0.55, name


def _domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc.lower().split("@")[-1].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host or None


def _phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D+", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


def _name_key(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    tokens = re.findall(r"[a-z0-9]+", name.lower())
    tokens = [token for token in tokens if token not in GENERIC_NAME_TOKENS]
    if not tokens:
        return None
    key = " ".join(tokens)
    return key if len(key) >= 4 else None


def _entity_name(group: dict) -> str:
    link_type = group["link_type"]
    value = group["signals"]["value"]
    if link_type == "shared_domain":
        return value

    names = [f.name for f in group["facilities"] if f.name]
    if names:
        return Counter(names).most_common(1)[0][0]
    return value


def _evidence(facility: Facility, group: dict) -> dict:
    signal_type = group["signals"]["type"]
    if signal_type == "shared_domain":
        value = _domain(facility.google_website)
    elif signal_type == "shared_phone":
        value = facility.google_phone
    else:
        value = facility.name
    return {
        "signal": signal_type,
        "value": value,
        "confidence": group["confidence"],
    }
