from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel, Field
from auth import get_current_user
import os
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/tooling", tags=["Press Brake Tooling"])

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
COLL = "press_brake_tooling"

TOOLING_TYPES = ("top_punch", "v_die")


class ToolingItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tooling_type: str  # top_punch | v_die
    name: str
    description: Optional[str] = None
    status: str = "Active"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ToolingCreate(BaseModel):
    tooling_type: str
    name: str
    description: Optional[str] = None


class ToolingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


async def _seed_from_history():
    """One-off seed: pull distinct tooling already recorded on completed job sheets."""
    if await db[COLL].count_documents({}) > 0:
        return
    for field, ttype in (("top_punch_used", "top_punch"), ("v_die_used", "v_die")):
        values = await db.job_sheets.distinct(field, {field: {"$nin": [None, ""]}})
        for v in values:
            item = ToolingItem(tooling_type=ttype, name=v.strip())
            await db[COLL].insert_one(item.model_dump())


@router.get("", response_model=List[ToolingItem])
async def get_tooling(tooling_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    await _seed_from_history()
    query = {"tooling_type": tooling_type} if tooling_type else {}
    items = await db[COLL].find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return [ToolingItem(**i) for i in items]


@router.post("", response_model=ToolingItem, status_code=201)
async def create_tooling(payload: ToolingCreate, current_user: dict = Depends(get_current_user)):
    if payload.tooling_type not in TOOLING_TYPES:
        raise HTTPException(status_code=400, detail="tooling_type must be top_punch or v_die")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db[COLL].find_one({
        "tooling_type": payload.tooling_type,
        "name": {"$regex": f"^{__import__('re').escape(name)}$", "$options": "i"}
    }, {"_id": 0})
    if existing:
        return ToolingItem(**existing)
    item = ToolingItem(tooling_type=payload.tooling_type, name=name, description=payload.description)
    await db[COLL].insert_one(item.model_dump())
    return item


@router.put("/{tooling_id}", response_model=ToolingItem)
async def update_tooling(tooling_id: str, payload: ToolingUpdate, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    result = await db[COLL].update_one({"id": tooling_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tooling not found")
    doc = await db[COLL].find_one({"id": tooling_id}, {"_id": 0})
    return ToolingItem(**doc)


@router.delete("/{tooling_id}", status_code=204)
async def delete_tooling(tooling_id: str, current_user: dict = Depends(get_current_user)):
    result = await db[COLL].delete_one({"id": tooling_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tooling not found")
