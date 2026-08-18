"""
Document Control Register — central register of all ISO/QMS forms and their current issue/revision.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/document-control", tags=["Document Control"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "document_register"


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class ControlledDocument(BaseModel):
    id: Optional[str] = None
    form_no: str = ""           # e.g. "QMSF 13"
    title: str = ""             # e.g. "Skills Matrix - Workshop"
    doc_type: Optional[str] = ""  # Form / Policy / Procedure / Register / Other
    issue: Optional[str] = ""   # e.g. "2"
    revision_date: Optional[str] = ""  # YYYY-MM-DD
    owner: Optional[str] = ""
    location: Optional[str] = ""
    related_module: Optional[str] = ""  # e.g. "Training Matrix", "Calibration"
    notes: Optional[str] = ""


class ControlledDocumentUpdate(BaseModel):
    form_no: Optional[str] = None
    title: Optional[str] = None
    doc_type: Optional[str] = None
    issue: Optional[str] = None
    revision_date: Optional[str] = None
    owner: Optional[str] = None
    location: Optional[str] = None
    related_module: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_docs(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("form_no", 1)]).to_list(length=None)
    return items


@router.post("")
async def create_doc(payload: ControlledDocument, current_user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now
    doc["updated_at"] = now
    doc["created_by"] = _user_label(current_user)
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{doc_id}")
async def update_doc(doc_id: str, payload: ControlledDocumentUpdate, current_user=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    existing = await db[COLLECTION].find_one({"id": doc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = _user_label(current_user)
    await db[COLLECTION].update_one({"id": doc_id}, {"$set": update_data})
    return await db[COLLECTION].find_one({"id": doc_id}, {"_id": 0})


@router.delete("/{doc_id}")
async def delete_doc(doc_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": doc_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}
