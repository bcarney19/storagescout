import re
from typing import Optional
from urllib.parse import urlparse

from models import Facility

CHAIN_DOMAINS = {
    "uhaul.com",
    "publicstorage.com",
    "extraspace.com",
    "cubesmart.com",
    "smartstopselfstorage.com",
    "storquest.com",
    "storagekingusa.com",
    "sroa.com",
    "nsastorage.com",
    "storage-mart.com",
    "devonselfstorage.com",
    "westcoastselfstorage.com",
    "urbanstorage.com",
    "glacierwestselfstorage.com",
    "securespace.com",
    "storagestar.com",
    "mhvillage.com",
    "bayshorehomesales.com",
    "cal-am.com",
    "boavidacommunities.com",
}

CHAIN_NAME_PATTERNS = (
    "u-haul",
    "uhaul",
    "public storage",
    "extra space",
    "cubesmart",
    "smartstop",
    "storquest",
    "storage rentals of america",
    "life storage",
    "storage mart",
    "devon self storage",
)

NON_TARGET_PATTERNS = (
    "airbnb",
    "bed and breakfast",
    "cabin",
    "campground",
    "cottage",
    "guest house",
    "guesthouse",
    "hotel",
    "inn",
    "lodge",
    "motel",
    "rv park",
    "rv resort",
    "short term rental",
    "tiny home",
    "trailer parking",
    "vacation rental",
)

REAL_MHP_PATTERNS = (
    "manufactured home",
    "mobile home",
    "mhp",
    "trailer court",
    "trailer park",
)


def domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc.lower().split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host or None


def is_chain(facility: Facility) -> bool:
    host = domain(facility.google_website)
    if host and any(host == d or host.endswith(f".{d}") for d in CHAIN_DOMAINS):
        return True
    name = (facility.name or facility.google_name or "").lower()
    return any(pattern in name for pattern in CHAIN_NAME_PATTERNS)


def is_probably_independent(facility: Facility) -> bool:
    return not is_chain(facility)


def is_non_target(facility: Facility) -> bool:
    name = " ".join(
        str(part or "").lower()
        for part in (facility.name, facility.google_name, facility.address)
    )
    if any(pattern in name for pattern in REAL_MHP_PATTERNS):
        return False
    return any(pattern in name for pattern in NON_TARGET_PATTERNS)


def target_score(facility: Facility, linked_count: int = 0) -> int:
    score = facility.opportunity_score or 0
    if facility.facility_type == "mobile_home_park":
        score += 8
    if is_chain(facility):
        score -= 35
    if is_non_target(facility):
        score -= 70
    if linked_count >= 2:
        score += min(12, linked_count * 3)
    if facility.google_review_count is not None and facility.google_review_count <= 3:
        score += 5
    if not facility.google_phone:
        score += 4
    if not facility.google_website:
        score += 8
    return max(0, min(100, score))


def weakness_flags(facility: Facility) -> list[str]:
    flags = []
    if not facility.google_website:
        flags.append("no website")
    elif facility.website_alive is False:
        flags.append("dead website")
    if not facility.google_phone:
        flags.append("no phone")
    if facility.google_review_count == 0:
        flags.append("zero reviews")
    elif facility.google_review_count is not None and facility.google_review_count < 10:
        flags.append("few reviews")
    if is_chain(facility):
        flags.append("chain/operator")
    if is_non_target(facility):
        flags.append("likely non-target")
    return flags


def lead_tier(score: Optional[int]) -> str:
    if score is None:
        return "unscored"
    if score >= 80:
        return "prime"
    if score >= 60:
        return "strong"
    if score >= 40:
        return "watch"
    return "low"


def lead_thesis(facility: Facility, linked_count: int = 0) -> str:
    flags = weakness_flags(facility)
    parts = []
    if facility.facility_type == "mobile_home_park":
        parts.append("MHP target")
    else:
        parts.append("self-storage target")
    if is_chain(facility):
        parts.append("likely institutional/chain")
    elif is_non_target(facility):
        parts.append("likely non-target")
    else:
        parts.append("independent-looking")
    if flags:
        parts.append(", ".join(flag for flag in flags if flag != "chain/operator"))
    if linked_count >= 2:
        parts.append(f"{linked_count} linked facilities")
    if facility.city and facility.state:
        parts.append(f"{facility.city}, {facility.state}")
    return " | ".join(p for p in parts if p)
