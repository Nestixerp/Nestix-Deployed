"""Training Record / Appraisal register — QMSF 08."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import uuid
from auth import get_current_user

router = APIRouter(prefix="/api/training-appraisals", tags=["Training Appraisal"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "training_appraisals"
CTRS = "ncr_counters"

TRAINING_SOURCES = ["Internal", "External"]
EFFECTIVENESS_RATINGS = [
    {"v": 1, "label": "1 — Not effective"},
    {"v": 2, "label": "2 — Slightly effective"},
    {"v": 3, "label": "3 — Effective"},
    {"v": 4, "label": "4 — Highly effective"},
    {"v": 5, "label": "5 — Outstanding"},
]


def _now(): return datetime.now(timezone.utc).isoformat()


async def _next_no() -> int:
    res = await db[CTRS].find_one_and_update(
        {"_id": "training_appraisal_no"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


class TrainingAppraisalIn(BaseModel):
    employee_id: Optional[str] = None
    employee_name: str = ""
    department: Optional[str] = None
    date_of_training: Optional[str] = None
    description: Optional[str] = None
    provider: Optional[str] = None
    source: Optional[str] = None  # "Internal" | "External"
    total_hours: Optional[float] = None
    # ISO improvements
    training_objectives: Optional[str] = None
    learning_outcomes: Optional[str] = None
    effectiveness_rating: Optional[int] = None  # 1..5
    # Appraisal
    appraisal_comments: Optional[str] = None
    date_of_appraisal: Optional[str] = None
    trainee_signature: Optional[str] = None
    manager_name: Optional[str] = None
    manager_signature: Optional[str] = None


@router.get("/reference")
async def reference(current_user=Depends(get_current_user)):
    return {"sources": TRAINING_SOURCES, "effectiveness_ratings": EFFECTIVENESS_RATINGS}


@router.get("")
async def list_items(
    search: Optional[str] = None,
    source: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if source: q["source"] = source
    if employee_id: q["employee_id"] = employee_id
    if search:
        s = search.strip()
        q["$or"] = [
            {"employee_name": {"$regex": s, "$options": "i"}},
            {"department": {"$regex": s, "$options": "i"}},
            {"description": {"$regex": s, "$options": "i"}},
            {"provider": {"$regex": s, "$options": "i"}},
        ]
        if s.isdigit():
            q["$or"].append({"ta_no": int(s)})
    items = await db[COL].find(q, {"_id": 0}).sort("ta_no", -1).to_list(length=2000)
    return {"items": items, "count": len(items)}


@router.get("/stats")
async def stats(current_user=Depends(get_current_user)):
    total = await db[COL].count_documents({})
    internal = await db[COL].count_documents({"source": "Internal"})
    external = await db[COL].count_documents({"source": "External"})
    pipeline = [{"$group": {"_id": None, "total_hours": {"$sum": "$total_hours"}}}]
    agg = await db[COL].aggregate(pipeline).to_list(length=1)
    hrs = float((agg[0] or {}).get("total_hours") or 0) if agg else 0
    return {"total": total, "internal": internal, "external": external, "total_hours": hrs}


@router.post("")
async def create(payload: TrainingAppraisalIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["ta_no"] = await _next_no()
    doc["created_at"] = doc["updated_at"] = _now()
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/{tid}")
async def get_one(tid: str, current_user=Depends(get_current_user)):
    doc = await db[COL].find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.put("/{tid}")
async def update(tid: str, payload: TrainingAppraisalIn, current_user=Depends(get_current_user)):
    if not await db[COL].find_one({"id": tid}, {"_id": 0}):
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": tid}, {"$set": upd})
    return await db[COL].find_one({"id": tid}, {"_id": 0})


@router.delete("/{tid}")
async def remove(tid: str, current_user=Depends(get_current_user)):
    res = await db[COL].delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}
