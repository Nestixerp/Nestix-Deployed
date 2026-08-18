"""
Injury Register (QMSF 19).

Each record auto-increments the record_number (starting at 1) and is stored
for company record-keeping. Body-diagram markers (x/y coordinates with an
injury-type code) are stored alongside the standard form fields.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/injury-register", tags=["Injury Register"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "injury_register"


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class BodyMarker(BaseModel):
    side: str = "front"          # "front" | "back"
    x: float = 0.0               # percentage 0-100 of diagram width
    y: float = 0.0               # percentage 0-100 of diagram height
    code: str = ""               # A / Bl / Bu / C / D / F / L / P / S / T
    note: Optional[str] = ""


class InjuryRecordIn(BaseModel):
    # Header
    date: Optional[str] = ""
    # Worker
    surname: Optional[str] = ""
    given_name: Optional[str] = ""
    sex: Optional[str] = ""
    worker_address: Optional[str] = ""
    # Employer (defaults — overridable)
    company_name: Optional[str] = "ULTIMATE Laser Pty Ltd."
    company_address: Optional[str] = "36-40 Micro Circuit, Dandenong, Vic 3175"
    # Incident
    date_of_event: Optional[str] = ""
    time_of_event: Optional[str] = ""
    activity_area: Optional[str] = ""
    # Injury details
    injury_description: Optional[str] = ""
    body_markers: List[BodyMarker] = Field(default_factory=list)
    cause_of_injury: Optional[str] = ""
    treatment_given: Optional[str] = ""
    first_aid_person: Optional[str] = ""
    referral_treatment: Optional[str] = ""
    ceased_work: Optional[str] = ""
    # Sign-off
    date_completed: Optional[str] = ""
    time_completed: Optional[str] = ""
    completed_by: Optional[str] = ""


def _format_record_no(n: int) -> str:
    return f"{n:05d}"


@router.get("")
async def list_records(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("record_number", -1)]).to_list(length=None)
    return items


@router.get("/next-number")
async def next_number(current_user=Depends(get_current_user)):
    """Return the next sequential record_number that would be assigned."""
    last = await db[COLLECTION].find({}, {"_id": 0, "record_number": 1}).sort([("record_number", -1)]).limit(1).to_list(length=1)
    next_n = ((last[0]["record_number"] if last else 0) or 0) + 1
    return {"next_number": next_n, "next_number_label": _format_record_no(next_n)}


@router.get("/{record_id}")
async def get_record(record_id: str, current_user=Depends(get_current_user)):
    doc = await db[COLLECTION].find_one({"id": record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return doc


@router.post("")
async def create_record(payload: InjuryRecordIn, current_user=Depends(get_current_user)):
    # Allocate the next sequential record number atomically-ish (max + 1).
    last = await db[COLLECTION].find({}, {"_id": 0, "record_number": 1}).sort([("record_number", -1)]).limit(1).to_list(length=1)
    next_n = ((last[0]["record_number"] if last else 0) or 0) + 1
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "record_number": next_n,
        "record_number_label": _format_record_no(next_n),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": _user_label(current_user),
    })
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{record_id}")
async def update_record(record_id: str, payload: InjuryRecordIn, current_user=Depends(get_current_user)):
    update = payload.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = _user_label(current_user)
    res = await db[COLLECTION].update_one({"id": record_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    doc = await db[COLLECTION].find_one({"id": record_id}, {"_id": 0})
    return doc


@router.delete("/{record_id}")
async def delete_record(record_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": record_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True}
