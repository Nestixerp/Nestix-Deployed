"""Asset-based registers for audit sampling & compliance tracking.

One collection `asset_register_items` with register_type in:
  fire_equipment · test_tag · first_aid · spill_kit

  GET/POST/PUT/DELETE /api/asset-registers/items
  GET /api/asset-registers/compliance-report   (items due / overdue per register)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user
from services.audit_trail import log_trail

router = APIRouter(prefix="/api/asset-registers", tags=["Asset Registers"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "asset_register_items"

REGISTER_TYPES = ["fire_equipment", "test_tag", "first_aid", "spill_kit"]


def _now():
    return datetime.now(timezone.utc).isoformat()


class AssetItemIn(BaseModel):
    register_type: str                       # fire_equipment / test_tag / first_aid / spill_kit
    asset_id: str = ""                       # Asset ID / Kit ID
    equipment_type: Optional[str] = None     # e.g. Fire Extinguisher CO2 / Extension lead / First aid kit
    location: str = ""
    serial_number: Optional[str] = None
    tag_number: Optional[str] = None
    service_provider: Optional[str] = None
    tested_by: Optional[str] = None
    last_date: Optional[str] = None          # last service / test / inspection date
    next_due: Optional[str] = None
    inspection_frequency: Optional[str] = None   # e.g. 6-monthly / annual
    result: Optional[str] = None             # Pass / Fail
    access_clear: Optional[bool] = None
    signage_visible: Optional[bool] = None
    condition: Optional[str] = None          # Satisfactory / Unsatisfactory / notes
    removed_from_service: Optional[bool] = None
    expired_items_found: Optional[bool] = None
    restock_required: Optional[bool] = None
    contents_checked: Optional[bool] = None
    first_aid_officer: Optional[str] = None
    notes: Optional[str] = None
    attachments: Optional[list] = None


@router.get("/items")
async def list_items(register_type: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"register_type": register_type} if register_type else {}
    items = await db[COL].find(q, {"_id": 0}).sort([("register_type", 1), ("location", 1)]).to_list(2000)
    today = datetime.now(timezone.utc).date().isoformat()
    for it in items:
        it["overdue"] = bool(it.get("next_due") and it["next_due"] < today)
    return {"items": items}


@router.post("/items")
async def create_item(payload: AssetItemIn, current_user=Depends(get_current_user)):
    if payload.register_type not in REGISTER_TYPES:
        raise HTTPException(400, f"register_type must be one of {REGISTER_TYPES}")
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now(),
                "created_by": current_user.get("username", "system")})
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "created", "asset_register_item", doc["id"],
                    new_value=f"{doc['register_type']}:{doc.get('asset_id')}")
    return doc


@router.put("/items/{iid}")
async def update_item(iid: str, payload: AssetItemIn, current_user=Depends(get_current_user)):
    old = await db[COL].find_one({"id": iid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": iid}, {"$set": upd})
    return await db[COL].find_one({"id": iid}, {"_id": 0})


@router.delete("/items/{iid}")
async def delete_item(iid: str, current_user=Depends(get_current_user)):
    res = await db[COL].delete_one({"id": iid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await log_trail(current_user, "deleted", "asset_register_item", iid)
    return {"success": True}


@router.get("/compliance-report")
async def compliance_report(current_user=Depends(get_current_user)):
    """Asset Compliance Report: due / overdue counts + items per register."""
    today = datetime.now(timezone.utc).date().isoformat()
    out = {}
    for rt in REGISTER_TYPES:
        items = await db[COL].find({"register_type": rt}, {"_id": 0}).to_list(2000)
        overdue = [i for i in items if i.get("next_due") and i["next_due"] < today]
        due_soon = [i for i in items if i.get("next_due") and today <= i["next_due"] <= _plus_days(today, 30)]
        out[rt] = {
            "total": len(items),
            "overdue": len(overdue),
            "due_30_days": len(due_soon),
            "overdue_items": overdue,
            "due_items": due_soon,
        }
    return out


def _plus_days(iso_date: str, days: int) -> str:
    from datetime import date, timedelta
    y, m, d = map(int, iso_date.split("-"))
    return (date(y, m, d) + timedelta(days=days)).isoformat()
