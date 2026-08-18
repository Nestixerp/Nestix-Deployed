"""Leave of Absence Form register — QMSF 12."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import uuid
from auth import get_current_user

router = APIRouter(prefix="/api/leave-of-absence", tags=["Leave of Absence"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "leave_of_absence"
CTRS = "ncr_counters"

PAID_LEAVE_TYPES = [
    "Annual Leave", "Sick Leave", "Rostered Days", "Long Service Leave",
    "Carers Leave", "Public Holidays", "Bereavement Leave", "Special Leave",
]
UNPAID_LEAVE_TYPES = ["Sick Leave", "Special Leave"]


def _now(): return datetime.now(timezone.utc).isoformat()


async def _next_no() -> int:
    res = await db[CTRS].find_one_and_update(
        {"_id": "loa_no"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


class LeaveSelections(BaseModel):
    paid_types: List[str] = Field(default_factory=list)
    paid_special_reason: Optional[str] = None
    unpaid_types: List[str] = Field(default_factory=list)
    unpaid_special_reason: Optional[str] = None


class Approval(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    approved: Optional[bool] = None  # null until decided


class LOAIn(BaseModel):
    title: Optional[str] = None  # Mr | Mrs | Ms | Miss | Dr
    surname: str = ""
    first_name: str = ""
    employee_id: Optional[str] = None
    employee_no: Optional[str] = None
    work_area: Optional[str] = None
    shift: Optional[str] = None
    # Duration
    last_date_of_work: Optional[str] = None
    last_time_of_work: Optional[str] = None  # "HH:MM"
    date_work_resumes: Optional[str] = None
    time_work_resumes: Optional[str] = None
    total_days_absent: Optional[float] = None
    # Leave selections
    leave: LeaveSelections = Field(default_factory=LeaveSelections)
    # Approvals
    employee_signature: Optional[str] = None
    employee_sig_date: Optional[str] = None
    supervisor: Approval = Field(default_factory=Approval)
    operations_manager: Approval = Field(default_factory=Approval)
    # Pay office use only
    pay_office_notification_name: Optional[str] = None
    pay_office_notification_date: Optional[str] = None
    pay_office_notification_time: Optional[str] = None
    anticipated_return_date: Optional[str] = None
    pay_office_signature: Optional[str] = None
    pay_office_explanation: Optional[str] = None
    # Status
    status: Optional[str] = "Pending"  # Pending | Approved | Declined | Completed
    date_of_request: Optional[str] = None


@router.get("/reference")
async def reference(current_user=Depends(get_current_user)):
    return {
        "paid_leave_types": PAID_LEAVE_TYPES,
        "unpaid_leave_types": UNPAID_LEAVE_TYPES,
        "titles": ["Mr", "Mrs", "Ms", "Miss", "Dr"],
    }


@router.get("")
async def list_items(
    search: Optional[str] = None,
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if status: q["status"] = status
    if employee_id: q["employee_id"] = employee_id
    if search:
        s = search.strip()
        q["$or"] = [
            {"surname": {"$regex": s, "$options": "i"}},
            {"first_name": {"$regex": s, "$options": "i"}},
            {"employee_no": {"$regex": s, "$options": "i"}},
            {"work_area": {"$regex": s, "$options": "i"}},
        ]
        if s.isdigit():
            q["$or"].append({"loa_no": int(s)})
    items = await db[COL].find(q, {"_id": 0}).sort("loa_no", -1).to_list(length=2000)
    return {"items": items, "count": len(items)}


@router.get("/stats")
async def stats(current_user=Depends(get_current_user)):
    total = await db[COL].count_documents({})
    pending = await db[COL].count_documents({"status": "Pending"})
    approved = await db[COL].count_documents({"status": "Approved"})
    declined = await db[COL].count_documents({"status": "Declined"})
    return {"total": total, "pending": pending, "approved": approved, "declined": declined}


@router.post("")
async def create(payload: LOAIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["loa_no"] = await _next_no()
    doc["created_at"] = doc["updated_at"] = _now()
    if not doc.get("date_of_request"):
        doc["date_of_request"] = datetime.now(timezone.utc).date().isoformat()
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/{lid}")
async def get_one(lid: str, current_user=Depends(get_current_user)):
    doc = await db[COL].find_one({"id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.put("/{lid}")
async def update(lid: str, payload: LOAIn, current_user=Depends(get_current_user)):
    if not await db[COL].find_one({"id": lid}, {"_id": 0}):
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": lid}, {"$set": upd})
    return await db[COL].find_one({"id": lid}, {"_id": 0})


@router.delete("/{lid}")
async def remove(lid: str, current_user=Depends(get_current_user)):
    res = await db[COL].delete_one({"id": lid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}
