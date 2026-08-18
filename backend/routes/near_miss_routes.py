"""Near Miss / Incident / Hazard Identification register — QMSF 32."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import uuid
from auth import get_current_user

router = APIRouter(prefix="/api/near-miss", tags=["Near Miss"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "near_miss_reports"
CTRS = "ncr_counters"  # reuse counter collection (different key)

INCIDENT_TYPES = ["Near Miss", "Hazard", "Injury", "Property Damage", "Environmental"]
SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"]


def _now(): return datetime.now(timezone.utc).isoformat()


async def _next_nm_no() -> int:
    res = await db[CTRS].find_one_and_update(
        {"_id": "near_miss_no"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


class SignBlock(BaseModel):
    name: Optional[str] = None
    signature: Optional[str] = None  # typed name acts as electronic signature
    date: Optional[str] = None


class NearMissIn(BaseModel):
    # Section 1 — Reporter
    surname: str = ""
    first_name: str = ""
    location: Optional[str] = None
    date_reported: Optional[str] = None
    ohs_rep_notified: Optional[str] = None  # "Yes" | "No"
    # Categorisation (ISO improvements)
    incident_type: Optional[str] = None  # one of INCIDENT_TYPES
    severity: Optional[str] = None  # one of SEVERITY_LEVELS
    # Section 2 — Description
    description: Optional[str] = None
    # Section 3 — Corrective action
    corrective_required: Optional[str] = None  # "Yes"|"No"
    corrective_details: Optional[str] = None
    corrective_date: Optional[str] = None
    corrective_signed: Optional[str] = None
    # Section 4 — Asset / maintenance
    asset_required: Optional[str] = None  # "Yes"|"No"
    asset_details: Optional[str] = None
    # Section 5 — Management workflow
    mgmt_representative: SignBlock = Field(default_factory=SignBlock)
    action_completion: SignBlock = Field(default_factory=SignBlock)
    revised_closed: SignBlock = Field(default_factory=SignBlock)
    status: Optional[str] = "Open"  # Open | In Progress | Closed


@router.get("/reference")
async def reference(current_user=Depends(get_current_user)):
    return {"incident_types": INCIDENT_TYPES, "severity_levels": SEVERITY_LEVELS}


@router.get("")
async def list_nm(
    search: Optional[str] = None,
    status: Optional[str] = None,
    incident_type: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if status: q["status"] = status
    if incident_type: q["incident_type"] = incident_type
    if search:
        s = search.strip()
        q["$or"] = [
            {"surname": {"$regex": s, "$options": "i"}},
            {"first_name": {"$regex": s, "$options": "i"}},
            {"location": {"$regex": s, "$options": "i"}},
            {"description": {"$regex": s, "$options": "i"}},
        ]
        if s.isdigit():
            q["$or"].append({"nm_no": int(s)})
    items = await db[COL].find(q, {"_id": 0}).sort("nm_no", -1).to_list(length=2000)
    return {"items": items, "count": len(items)}


@router.get("/stats")
async def stats(current_user=Depends(get_current_user)):
    total = await db[COL].count_documents({})
    open_count = await db[COL].count_documents({"status": {"$in": ["Open", "In Progress"]}})
    closed = await db[COL].count_documents({"status": "Closed"})
    by_type: Dict[str, int] = {}
    for t in INCIDENT_TYPES:
        by_type[t] = await db[COL].count_documents({"incident_type": t})
    return {"total": total, "open": open_count, "closed": closed, "by_type": by_type}


@router.post("")
async def create_nm(payload: NearMissIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["nm_no"] = await _next_nm_no()
    doc["created_at"] = doc["updated_at"] = _now()
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/{nm_id}")
async def get_nm(nm_id: str, current_user=Depends(get_current_user)):
    doc = await db[COL].find_one({"id": nm_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.put("/{nm_id}")
async def update_nm(nm_id: str, payload: NearMissIn, current_user=Depends(get_current_user)):
    if not await db[COL].find_one({"id": nm_id}, {"_id": 0}):
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": nm_id}, {"$set": upd})
    return await db[COL].find_one({"id": nm_id}, {"_id": 0})


@router.delete("/{nm_id}")
async def delete_nm(nm_id: str, current_user=Depends(get_current_user)):
    res = await db[COL].delete_one({"id": nm_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}
