"""
Scores each facility's online presence 0–100 (higher = weaker presence = better lead).

Since facilities are discovered via Google Places, the "not in Google" bonus doesn't apply.
Scoring weights the quality/depth of their online footprint instead:

  +45   No website at all
  +30   Website exists but is dead / parked
  +25   Zero Google reviews (sliding: +15 if <10, +8 if <25)
  +15   No phone number listed
  +10   No photos, or business not operational
  = 100 max for a completely dark facility
"""
import json
import logging
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from database import settings

logger = logging.getLogger(__name__)
PLACES_BASE = "https://maps.googleapis.com/maps/api/place"


async def score_facility(facility: dict) -> dict:
    place_id = facility.get("google_place_id")

    if place_id:
        details = await _get_place_details(place_id)
    else:
        details = await _find_place(
            _build_query(facility), facility["lat"], facility["lng"]
        )

    if not details:
        # Still can't find it — treat as max opportunity
        return {
            "opportunity_score": 100,
            "score_breakdown": json.dumps({
                "website": {"found": False, "points": 45},
                "reviews": {"count": 0, "points": 25},
                "phone": {"found": False, "points": 15},
                "photos": {"found": False, "points": 10},
                "status": {"status": "UNKNOWN", "points": 5},
            }),
            "google_place_id": place_id,
            "google_name": facility.get("google_name"),
            "google_website": None,
            "google_phone": None,
            "google_rating": facility.get("google_rating"),
            "google_review_count": facility.get("google_review_count"),
            "google_business_status": None,
            "website_alive": None,
        }

    score = 0
    breakdown: dict = {}

    # Website
    website = details.get("website")
    website_alive = None
    if not website:
        score += 45
        breakdown["website"] = {"found": False, "points": 45}
    else:
        website_alive = await _check_website(website)
        pts = 30 if not website_alive else 0
        score += pts
        breakdown["website"] = {"found": True, "alive": website_alive, "points": pts}

    # Reviews
    review_count = details.get("user_ratings_total") or facility.get("google_review_count") or 0
    if review_count == 0:
        pts = 25
    elif review_count < 10:
        pts = 15
    elif review_count < 25:
        pts = 8
    else:
        pts = 0
    score += pts
    breakdown["reviews"] = {"count": review_count, "points": pts}

    # Phone
    phone = details.get("formatted_phone_number")
    if not phone:
        score += 15
        breakdown["phone"] = {"found": False, "points": 15}
    else:
        breakdown["phone"] = {"found": True, "points": 0}

    # Photos
    photos = details.get("photos", [])
    if not photos:
        score += 10
        breakdown["photos"] = {"count": 0, "points": 10}
    else:
        breakdown["photos"] = {"count": len(photos), "points": 0}

    # Business status
    status = details.get("business_status") or facility.get("google_business_status", "OPERATIONAL")
    if status != "OPERATIONAL":
        score += 5
        breakdown["status"] = {"status": status, "points": 5}

    rating = details.get("rating") or facility.get("google_rating")

    return {
        "opportunity_score": min(score, 100),
        "score_breakdown": json.dumps(breakdown),
        "google_place_id": details.get("place_id") or place_id,
        "google_name": details.get("name") or facility.get("google_name"),
        "google_website": website,
        "google_phone": phone,
        "google_rating": rating,
        "google_review_count": review_count,
        "google_business_status": status,
        "website_alive": website_alive,
    }


def _build_query(f: dict) -> str:
    type_label = "self storage" if f.get("facility_type") == "self_storage" else "mobile home park"
    parts = [f.get("name") or type_label, f.get("city") or "", f.get("state") or ""]
    return " ".join(p for p in parts if p).strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def _get_place_details(place_id: str) -> Optional[dict]:
    if not settings.google_places_api_key:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{PLACES_BASE}/details/json",
            params={
                "place_id": place_id,
                "fields": "name,website,formatted_phone_number,rating,user_ratings_total,business_status,photos",
                "key": settings.google_places_api_key,
            },
        )
        result = r.json().get("result", {})
        if result:
            result["place_id"] = place_id
        return result or None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def _find_place(query: str, lat: float, lng: float) -> Optional[dict]:
    if not settings.google_places_api_key:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{PLACES_BASE}/findplacefromtext/json",
            params={
                "input": query,
                "inputtype": "textquery",
                "fields": "place_id,name",
                "locationbias": f"circle:5000@{lat},{lng}",
                "key": settings.google_places_api_key,
            },
        )
        candidates = r.json().get("candidates", [])
        if not candidates:
            return None
        return await _get_place_details(candidates[0]["place_id"])


async def _check_website(url: str) -> bool:
    for method in ("head", "get"):
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                fn = client.head if method == "head" else client.get
                r = await fn(url, headers={"User-Agent": "Mozilla/5.0"})
                return r.status_code < 400
        except Exception:
            continue
    return False
