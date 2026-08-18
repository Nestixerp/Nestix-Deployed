"""
Evacuation Drill Records — ISO 14001 / OHS
- Multiple drills (date, time taken, wardens, notes)
- Each drill has dynamic locations (Factory 1, 2, 3...) — add as many as needed
- Each location has Present + Absent name lists
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/evacuation-drills", tags=["Evacuation Drills"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "evacuation_drills"


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class EvacuationLocation(BaseModel):
    id: Optional[str] = None
    name: str = ""  # e.g. "Factory 1"
    present: List[str] = []
    absent: List[str] = []


class CorrectiveAction(BaseModel):
    id: Optional[str] = None
    action: str = ""
    responsible: Optional[str] = ""
    due_date: Optional[str] = ""
    completed_date: Optional[str] = ""
    status: Optional[str] = "Open"  # Open | In Progress | Completed


class EvacuationDrill(BaseModel):
    id: Optional[str] = None
    drill_date: str = ""  # YYYY-MM-DD
    time_taken: Optional[str] = ""  # e.g. "3 Min 15 Seconds"
    wardens: Optional[str] = ""
    notes: Optional[str] = ""
    locations: List[EvacuationLocation] = []

    # ---- AS 3745:2010 drill report fields ----
    start_time: Optional[str] = ""             # HH:MM
    finish_time: Optional[str] = ""            # HH:MM
    scenario: Optional[str] = ""               # Fire / Chemical Spill / Medical / Gas Leak / Power Failure / Other
    scenario_other: Optional[str] = ""         # only when scenario == "Other"
    alarm_method: Optional[str] = ""           # Siren / Verbal / Phone / PA / Other
    alarm_method_other: Optional[str] = ""
    assembly_point: Optional[str] = ""
    chief_warden: Optional[str] = ""
    area_wardens: Optional[str] = ""           # comma-separated
    first_aider: Optional[str] = ""
    services_called_by: Optional[str] = ""
    services_notified: Optional[str] = ""      # "Yes" | "No" | ""
    all_accounted_for: Optional[str] = ""      # "Yes" | "No" | ""
    visitors_present: Optional[str] = ""       # "Yes" | "No" | ""
    visitors_names: List[str] = []
    issues_found: Optional[str] = ""
    corrective_actions: List[CorrectiveAction] = []
    drill_outcome: Optional[str] = ""          # "Satisfactory" | "Requires Improvement" | ""
    chief_warden_signoff_name: Optional[str] = ""
    chief_warden_signoff_date: Optional[str] = ""
    manager_signoff_name: Optional[str] = ""
    manager_signoff_date: Optional[str] = ""


class EvacuationDrillUpdate(BaseModel):
    drill_date: Optional[str] = None
    time_taken: Optional[str] = None
    wardens: Optional[str] = None
    notes: Optional[str] = None
    locations: Optional[List[EvacuationLocation]] = None
    start_time: Optional[str] = None
    finish_time: Optional[str] = None
    scenario: Optional[str] = None
    scenario_other: Optional[str] = None
    alarm_method: Optional[str] = None
    alarm_method_other: Optional[str] = None
    assembly_point: Optional[str] = None
    chief_warden: Optional[str] = None
    area_wardens: Optional[str] = None
    first_aider: Optional[str] = None
    services_called_by: Optional[str] = None
    services_notified: Optional[str] = None
    all_accounted_for: Optional[str] = None
    visitors_present: Optional[str] = None
    visitors_names: Optional[List[str]] = None
    issues_found: Optional[str] = None
    corrective_actions: Optional[List[CorrectiveAction]] = None
    drill_outcome: Optional[str] = None
    chief_warden_signoff_name: Optional[str] = None
    chief_warden_signoff_date: Optional[str] = None
    manager_signoff_name: Optional[str] = None
    manager_signoff_date: Optional[str] = None


def _normalise(doc: dict) -> dict:
    for loc in (doc.get("locations") or []):
        if not loc.get("id"):
            loc["id"] = str(uuid.uuid4())
        loc["present"] = [n for n in (loc.get("present") or []) if n and n.strip()]
        loc["absent"] = [n for n in (loc.get("absent") or []) if n and n.strip()]
    # Auto-compute total time from start/finish (HH:MM) only if user didn't override
    start = (doc.get("start_time") or "").strip()
    finish = (doc.get("finish_time") or "").strip()
    manual_time = (doc.get("time_taken") or "").strip()
    if start and finish and (not manual_time or _looks_auto(manual_time)):
        try:
            sh, sm = [int(x) for x in start.split(":")[:2]]
            fh, fm = [int(x) for x in finish.split(":")[:2]]
            diff = (fh * 60 + fm) - (sh * 60 + sm)
            if diff < 0:
                diff += 24 * 60  # rolled over midnight
            mins, secs = divmod(diff, 1)
            doc["time_taken"] = f"{int(diff)} Min" if int(diff) > 0 else "Under 1 Min"
        except (ValueError, IndexError):
            pass
    # Tag corrective action ids + clean visitor names
    for ca in (doc.get("corrective_actions") or []):
        if not ca.get("id"):
            ca["id"] = str(uuid.uuid4())
    doc["visitors_names"] = [n for n in (doc.get("visitors_names") or []) if n and n.strip()]
    return doc


def _looks_auto(s: str) -> bool:
    """Return True if time_taken looks like an auto-computed string we previously wrote."""
    s = (s or "").strip().lower()
    return s.endswith(" min") or s == "under 1 min"


@router.get("")
async def list_drills(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("drill_date", -1)]).to_list(length=None)
    return items


@router.post("")
async def create_drill(payload: EvacuationDrill, current_user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc = _normalise(doc)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now
    doc["updated_at"] = now
    doc["created_by"] = _user_label(current_user)
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{drill_id}")
async def get_drill(drill_id: str, current_user=Depends(get_current_user)):
    item = await db[COLLECTION].find_one({"id": drill_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.put("/{drill_id}")
async def update_drill(drill_id: str, payload: EvacuationDrillUpdate, current_user=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    existing = await db[COLLECTION].find_one({"id": drill_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    merged = {**existing, **update_data}
    merged = _normalise(merged)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged["updated_by"] = _user_label(current_user)
    merged.pop("id", None)
    merged.pop("created_at", None)
    merged.pop("created_by", None)
    await db[COLLECTION].update_one({"id": drill_id}, {"$set": merged})
    return await db[COLLECTION].find_one({"id": drill_id}, {"_id": 0})


@router.delete("/{drill_id}")
async def delete_drill(drill_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": drill_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}
