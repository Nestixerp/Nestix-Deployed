"""Sidebar menu configuration — per-organisation ordering, labels and visibility.

Only display labels / order / hidden flags are stored. Internal module keys,
routes, permissions and data references remain stable in the frontend registry.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

from auth import get_current_user
from services.audit_trail import log_trail

router = APIRouter(prefix="/api/menu-config", tags=["Menu Config"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "menu_config"
ORG_KEY = "default"  # single-tenant today; multi-tenant ready (one doc per org)


class MenuItem(BaseModel):
    id: str
    label: Optional[str] = None
    hidden: bool = False


class MenuSection(BaseModel):
    id: str
    label: Optional[str] = None
    hidden: bool = False
    items: List[MenuItem] = []


class MenuConfigIn(BaseModel):
    sections: List[MenuSection]


def _require_admin(user):
    if (user or {}).get("role") != "Administrator":
        raise HTTPException(403, "Administrator role required to change the menu layout")


@router.get("")
async def get_menu_config(current_user=Depends(get_current_user)):
    doc = await db[COL].find_one({"org": ORG_KEY}, {"_id": 0})
    return {"config": doc}


@router.put("")
async def save_menu_config(payload: MenuConfigIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    doc = {
        "org": ORG_KEY,
        "sections": [s.model_dump() for s in payload.sections],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("username", "system"),
    }
    await db[COL].update_one({"org": ORG_KEY}, {"$set": doc}, upsert=True)
    await log_trail(current_user, "edited", "menu_config", ORG_KEY, summary="Sidebar menu layout saved")
    return {"success": True}


@router.delete("")
async def restore_default_menu(current_user=Depends(get_current_user)):
    _require_admin(current_user)
    await db[COL].delete_one({"org": ORG_KEY})
    await log_trail(current_user, "restored_default", "menu_config", ORG_KEY, summary="Sidebar menu restored to default IMS structure")
    return {"success": True, "message": "Default IMS menu restored"}
