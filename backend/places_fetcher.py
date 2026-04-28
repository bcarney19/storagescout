"""
Discovers self-storage and mobile home parks using the Google Places Nearby Search API.
Covers a state by laying a lat/lon grid and searching within a radius at each point.
Deduplicates by place_id so overlapping grid cells don't produce duplicate records.
"""
import asyncio
import logging
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from database import settings

logger = logging.getLogger(__name__)

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"

# Bounding boxes (min_lat, min_lon, max_lat, max_lon)
STATE_BBOXES: dict[str, tuple] = {
    "AL": (30.22, -88.47, 35.01, -84.89),
    "AK": (54.56, -162.00, 71.51, -141.00),
    "AZ": (31.33, -114.82, 37.00, -109.05),
    "AR": (33.00, -94.62, 36.50, -89.64),
    "CA": (32.53, -124.49, 42.01, -114.13),
    "CO": (36.99, -109.06, 41.00, -102.04),
    "CT": (40.99, -73.73, 42.05, -71.79),
    "DE": (38.45, -75.79, 39.84, -75.05),
    "FL": (24.52, -87.64, 31.00, -80.03),
    "GA": (30.36, -85.61, 35.00, -80.84),
    "HI": (18.91, -160.25, 22.24, -154.81),
    "ID": (41.99, -117.24, 49.00, -111.04),
    "IL": (36.97, -91.51, 42.51, -87.02),
    "IN": (37.77, -88.10, 41.77, -84.78),
    "IA": (40.38, -96.64, 43.50, -90.14),
    "KS": (36.99, -102.05, 40.00, -94.59),
    "KY": (36.50, -89.57, 39.15, -81.96),
    "LA": (28.93, -94.04, 33.02, -88.82),
    "ME": (43.06, -71.08, 47.46, -66.95),
    "MD": (37.91, -79.49, 39.72, -75.05),
    "MA": (41.24, -73.50, 42.89, -69.93),
    "MI": (41.70, -90.42, 48.19, -82.41),
    "MN": (43.50, -97.24, 49.38, -89.48),
    "MS": (30.19, -91.66, 35.00, -88.10),
    "MO": (35.99, -95.77, 40.61, -89.10),
    "MT": (44.36, -116.05, 49.00, -104.04),
    "NE": (39.99, -104.05, 43.00, -95.31),
    "NV": (35.00, -120.01, 42.01, -114.04),
    "NH": (42.70, -72.56, 45.31, -70.70),
    "NJ": (38.93, -75.57, 41.36, -73.89),
    "NM": (31.33, -109.05, 37.00, -103.00),
    "NY": (40.50, -79.76, 45.01, -71.86),
    "NC": (33.84, -84.32, 36.59, -75.46),
    "ND": (45.93, -104.05, 49.00, -96.55),
    "OH": (38.40, -84.82, 41.98, -80.52),
    "OK": (33.62, -103.00, 37.00, -94.43),
    "OR": (41.99, -124.57, 46.24, -116.46),
    "PA": (39.72, -80.52, 42.27, -74.69),
    "RI": (41.15, -71.86, 42.02, -71.12),
    "SC": (32.03, -83.36, 35.22, -78.54),
    "SD": (42.48, -104.06, 45.94, -96.44),
    "TN": (34.98, -90.31, 36.68, -81.65),
    "TX": (25.84, -106.65, 36.50, -93.51),
    "UT": (36.99, -114.05, 42.00, -109.04),
    "VT": (42.73, -73.44, 45.02, -71.47),
    "VA": (36.54, -83.68, 39.47, -75.24),
    "WA": (45.54, -124.74, 49.00, -116.92),
    "WV": (37.20, -82.64, 40.64, -77.72),
    "WI": (42.49, -92.89, 47.31, -86.25),
    "WY": (40.99, -111.06, 45.01, -104.05),
    "DC": (38.79, -77.12, 38.99, -76.91),
}

US_STATES = set(STATE_BBOXES.keys())

# ~55-mile grid cells, 50km search radius = good overlap, reasonable API cost
GRID_SPACING_DEG = 0.80
SEARCH_RADIUS_M = 50000

SEARCH_KEYWORDS = {
    "self_storage": "self storage",
    "mobile_home_park": "mobile home park",
}


async def fetch_facilities_for_state(state_code: str, facility_types: list[str]) -> list[dict]:
    if not settings.google_places_api_key:
        logger.warning("No Google Places API key — cannot fetch facilities")
        return []

    bbox = STATE_BBOXES.get(state_code)
    if not bbox:
        raise ValueError(f"Unknown state: {state_code}")

    grid = _make_grid(bbox)
    logger.info("%s: %d grid points, %d types", state_code, len(grid), len(facility_types))

    seen_ids: set[str] = set()
    results: list[dict] = []
    lock = asyncio.Lock()
    sem = asyncio.Semaphore(5)

    async def search_one(lat: float, lon: float, ftype: str, keyword: str):
        async with sem:
            places = await _nearby_search(lat, lon, keyword)
            async with lock:
                for p in places:
                    pid = p.get("place_id")
                    if pid and pid not in seen_ids:
                        seen_ids.add(pid)
                        results.append(_map_place(p, ftype, state_code))

    tasks = []
    for ftype in facility_types:
        kw = SEARCH_KEYWORDS.get(ftype)
        if not kw:
            continue
        for lat, lon in grid:
            tasks.append(search_one(lat, lon, ftype, kw))

    await asyncio.gather(*tasks)
    logger.info("%s: found %d unique facilities", state_code, len(results))
    return results


def _make_grid(bbox: tuple) -> list[tuple]:
    min_lat, min_lon, max_lat, max_lon = bbox
    points = []
    lat = min_lat
    while lat <= max_lat + GRID_SPACING_DEG:
        lon = min_lon
        while lon <= max_lon + GRID_SPACING_DEG:
            points.append((round(lat, 4), round(lon, 4)))
            lon += GRID_SPACING_DEG
        lat += GRID_SPACING_DEG
    return points


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
async def _nearby_search(lat: float, lon: float, keyword: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=12) as client:
        r = await client.get(
            f"{PLACES_BASE}/nearbysearch/json",
            params={
                "location": f"{lat},{lon}",
                "radius": SEARCH_RADIUS_M,
                "keyword": keyword,
                "key": settings.google_places_api_key,
            },
        )
        data = r.json()
        status = data.get("status")
        if status not in ("OK", "ZERO_RESULTS"):
            logger.warning("Nearby search status %s at (%s, %s): %s", status, lat, lon, data.get("error_message", ""))
        return data.get("results", [])


def _map_place(p: dict, ftype: str, state_code: str) -> dict:
    loc = p.get("geometry", {}).get("location", {})
    vicinity = p.get("vicinity", "")
    # vicinity is usually "Street Address, City"
    parts = [x.strip() for x in vicinity.split(",")]
    city = parts[-1] if len(parts) > 1 else None
    address = parts[0] if parts else None

    return {
        "osm_id": None,
        "google_place_id": p.get("place_id"),
        "name": p.get("name"),
        "facility_type": ftype,
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "address": address,
        "city": city,
        "state": state_code,
        "zip_code": None,
        # Prefill partial Google data from the Nearby Search response
        "google_name": p.get("name"),
        "google_rating": p.get("rating"),
        "google_review_count": p.get("user_ratings_total"),
        "google_business_status": p.get("business_status", "OPERATIONAL"),
    }
