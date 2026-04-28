import logging

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
}


async def fetch_facilities_for_state(state_code: str, facility_types: list[str]) -> list[dict]:
    filters = []
    if "self_storage" in facility_types:
        filters += [
            'node["amenity"="self_storage"](area.st);',
            'way["amenity"="self_storage"](area.st);',
        ]
    if "mobile_home_park" in facility_types:
        filters += [
            'node["landuse"="mobile_home_park"](area.st);',
            'way["landuse"="mobile_home_park"](area.st);',
            'node["residential"="mobile_home"](area.st);',
            'way["residential"="mobile_home"](area.st);',
        ]

    if not filters:
        return []

    block = "\n  ".join(filters)
    query = f"""[out:json][timeout:120];
area["ISO3166-2"="US-{state_code}"][admin_level=4]->.st;
(
  {block}
);
out center tags;"""

    headers = {
        "User-Agent": "StorageScout/1.0 (real-estate-research-tool)",
    }
    logger.info("Querying Overpass for %s", state_code)
    async with httpx.AsyncClient(timeout=130) as client:
        resp = await client.post(OVERPASS_URL, data={"data": query}, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    results = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})

        if el["type"] == "way":
            center = el.get("center", {})
            lat, lng = center.get("lat"), center.get("lon")
        else:
            lat, lng = el.get("lat"), el.get("lon")

        if not lat or not lng:
            continue

        amenity = tags.get("amenity", "")
        landuse = tags.get("landuse", "")
        residential = tags.get("residential", "")

        if amenity == "self_storage":
            ftype = "self_storage"
        elif landuse == "mobile_home_park" or residential == "mobile_home":
            ftype = "mobile_home_park"
        else:
            continue

        address = " ".join(
            p for p in [tags.get("addr:housenumber", ""), tags.get("addr:street", "")] if p
        ) or None

        results.append({
            "osm_id": f"{el['type']}/{el['id']}",
            "name": tags.get("name"),
            "facility_type": ftype,
            "lat": lat,
            "lng": lng,
            "address": address,
            "city": tags.get("addr:city"),
            "state": state_code,
            "zip_code": tags.get("addr:postcode"),
        })

    logger.info("Overpass returned %d facilities for %s", len(results), state_code)
    return results
