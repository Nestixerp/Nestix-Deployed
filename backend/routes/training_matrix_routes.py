"""
Training / Skills Matrix Module
- Multiple matrices (e.g. Workshop, Office, Sales)
- Each matrix has dynamic Skills (columns) and People (rows)
- Each cell stores C (Capable) / T (Training) / N/A / blank
- Document control: form_no, issue, revision_date, reviewed_date
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/training-matrices", tags=["Training Matrix"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "training_matrices"


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class TrainingSkill(BaseModel):
    id: Optional[str] = None
    name: str = ""  # e.g. "Laser Cutting"


class TrainingPerson(BaseModel):
    id: Optional[str] = None
    name: str = ""
    scores: Dict[str, str] = {}  # skill_id -> "C" | "T" | "N/A" | ""


class TrainingMatrix(BaseModel):
    id: Optional[str] = None
    name: str = ""          # e.g. "Workshop", "Office"
    description: Optional[str] = ""
    skills: List[TrainingSkill] = []
    people: List[TrainingPerson] = []
    reviewed_date: Optional[str] = ""  # YYYY-MM-DD
    # Document control
    form_no: Optional[str] = ""        # e.g. "QMSF 13"
    issue: Optional[str] = ""          # e.g. "2"
    revision_date: Optional[str] = ""  # YYYY-MM-DD or text like "June 2023"


class TrainingMatrixUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    skills: Optional[List[TrainingSkill]] = None
    people: Optional[List[TrainingPerson]] = None
    reviewed_date: Optional[str] = None
    form_no: Optional[str] = None
    issue: Optional[str] = None
    revision_date: Optional[str] = None


def _normalise(doc: dict) -> dict:
    # Assign IDs where missing
    for sk in (doc.get("skills") or []):
        if not sk.get("id"):
            sk["id"] = str(uuid.uuid4())
    for p in (doc.get("people") or []):
        if not p.get("id"):
            p["id"] = str(uuid.uuid4())
        if not isinstance(p.get("scores"), dict):
            p["scores"] = {}
    return doc


@router.get("")
async def list_matrices(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("name", 1)]).to_list(length=None)
    return items


@router.post("")
async def create_matrix(payload: TrainingMatrix, current_user=Depends(get_current_user)):
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


@router.get("/{matrix_id}")
async def get_matrix(matrix_id: str, current_user=Depends(get_current_user)):
    item = await db[COLLECTION].find_one({"id": matrix_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.put("/{matrix_id}")
async def update_matrix(matrix_id: str, payload: TrainingMatrixUpdate, current_user=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    existing = await db[COLLECTION].find_one({"id": matrix_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    merged = {**existing, **update_data}
    merged = _normalise(merged)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged["updated_by"] = _user_label(current_user)
    merged.pop("id", None)
    merged.pop("created_at", None)
    merged.pop("created_by", None)
    await db[COLLECTION].update_one({"id": matrix_id}, {"$set": merged})
    return await db[COLLECTION].find_one({"id": matrix_id}, {"_id": 0})


@router.delete("/{matrix_id}")
async def delete_matrix(matrix_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": matrix_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}
