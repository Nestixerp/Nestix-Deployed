"""
Housekeeping Audit Summary (QMSF 26).

Each audit captures findings per location (Factory / Building / Workstation,
sourced from the same configurable list that drives OHS Meetings) plus
auditor name, signature and date.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/housekeeping-audits", tags=["Housekeeping Audits"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
COLLECTION = "housekeeping_audits"


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class AuditEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    location: str = ""
    findings: str = "No Concerns"


class HousekeepingAuditIn(BaseModel):
    date: Optional[str] = ""
    title: Optional[str] = ""
    entries: List[AuditEntry] = Field(default_factory=list)
    auditor: Optional[str] = ""
    signature: Optional[str] = ""
    signed_date: Optional[str] = ""


@router.get("")
async def list_audits(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(length=None)
    return items


@router.get("/{audit_id}")
async def get_audit(audit_id: str, current_user=Depends(get_current_user)):
    doc = await db[COLLECTION].find_one({"id": audit_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Audit not found")
    return doc


@router.post("")
async def create_audit(payload: HousekeepingAuditIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": _user_label(current_user),
    })
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{audit_id}")
async def update_audit(audit_id: str, payload: HousekeepingAuditIn, current_user=Depends(get_current_user)):
    update = payload.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = _user_label(current_user)
    res = await db[COLLECTION].update_one({"id": audit_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Audit not found")
    doc = await db[COLLECTION].find_one({"id": audit_id}, {"_id": 0})
    return doc


@router.delete("/{audit_id}")
async def delete_audit(audit_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": audit_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Audit not found")
    return {"success": True}
