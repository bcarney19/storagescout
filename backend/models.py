from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from database import Base


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(String, primary_key=True)
    osm_id = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=True)
    facility_type = Column(String, nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True, index=True)
    zip_code = Column(String, nullable=True)

    # Google Places data
    google_place_id = Column(String, nullable=True)
    google_name = Column(String, nullable=True)
    google_website = Column(String, nullable=True)
    google_phone = Column(String, nullable=True)
    google_rating = Column(Float, nullable=True)
    google_review_count = Column(Integer, nullable=True)
    google_business_status = Column(String, nullable=True)

    # Scoring — higher = better lead (less online presence)
    opportunity_score = Column(Integer, nullable=True, index=True)
    score_breakdown = Column(Text, nullable=True)  # JSON
    website_alive = Column(Boolean, nullable=True)

    scan_status = Column(String, default="pending", index=True)
    scanned_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # CRM pipeline
    deal_stage = Column(String, default="new", index=True)
    notes = Column(Text, nullable=True)
