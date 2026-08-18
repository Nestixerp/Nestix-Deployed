"""
Internal Audit Schedule — annual matrix of audit elements x 12 months.

Each year has its own document. Cells now store either:
  * a category id  (after the user marks the cell via the UI), OR
  * a legacy free-text mark (X, C, O, M, P, A, S — from the pre-colour version)

A separate **audit_schedule_categories** collection holds the shared, globally
editable list of audit categories — each with a name, short label, colour and a
list of `legacy_chars` so old text marks render with the correct colour until
the user re-saves the schedule.

Edits are not change-tracked per business owner's instruction.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/audit-schedule", tags=["Audit Schedule"])

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "audit_schedules"
CATEGORIES = "audit_schedule_categories"

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

# Defaults seeded the first time a year is opened.
DEFAULT_ELEMENTS = [
    {"name": "Control of Documented Information", "priority": True},
    {"name": "Competency & Awareness", "priority": False},
    {"name": "Purchasing", "priority": False},
    {"name": "Production", "priority": False},
    {"name": "Calibration", "priority": False},
    {"name": "Sales", "priority": False},
    {"name": "Control of Non Conforming Product / Corrective Action", "priority": True},
    {"name": "Management Review", "priority": True},
    {"name": "Legal and Regulatory Requirements", "priority": True},
    {"name": "Objectives", "priority": False},
    {"name": "Aspects and Impacts", "priority": True},
    {"name": "Risk Assessments", "priority": False},
    {"name": "Internal Audits", "priority": True},
]

# Default audit-categories seed (used once, then editable from the UI).
DEFAULT_CATEGORIES = [
    {
        "name": "Internal Audit",
        "short": "INT",
        "color": "#2563eb",
        "legacy_chars": ["X", "x"],
    },
    {
        "name": "External Audit – COMPASS",
        "short": "COMPASS",
        "color": "#dc2626",
        "legacy_chars": ["C", "O", "M", "P", "A", "S"],
    },
]


def _empty_cells() -> Dict[str, str]:
    return {m: "" for m in MONTHS}


def _make_default_doc(year: int) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "year": int(year),
        "title": f"Internal Audit Schedule {year}",
        "company": "ULTIMATE LASER",
        "elements": [
            {
                "id": str(uuid.uuid4()),
                "name": el["name"],
                "priority": el["priority"],
                "order": i,
                "cells": _empty_cells(),
            }
            for i, el in enumerate(DEFAULT_ELEMENTS)
        ],
        "signed_by": "",
        "signed_date": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _normalise_elements(elements: List[dict]) -> List[dict]:
    """Ensure every element has id / order / cells with all 12 months."""
    out = []
    for i, el in enumerate(elements or []):
        cells = el.get("cells") or {}
        norm_cells = {m: str(cells.get(m, "")) for m in MONTHS}
        out.append({
            "id": el.get("id") or str(uuid.uuid4()),
            "name": str(el.get("name") or "").strip(),
            "priority": bool(el.get("priority")),
            "order": int(el.get("order", i)),
            "cells": norm_cells,
        })
    out.sort(key=lambda x: x["order"])
    return out


async def _ensure_categories_seeded() -> List[dict]:
    """Return the categories list, seeding the defaults on first access."""
    existing = await db[CATEGORIES].find({}, {"_id": 0}).sort("order", 1).to_list(length=None)
    if existing:
        return existing
    seeded = []
    for i, c in enumerate(DEFAULT_CATEGORIES):
        doc = {
            "id": str(uuid.uuid4()),
            "name": c["name"],
            "short": c["short"],
            "color": c["color"],
            "legacy_chars": list(c.get("legacy_chars") or []),
            "order": i,
        }
        await db[CATEGORIES].insert_one({**doc})
        seeded.append(doc)
    return seeded


# ---------- CATEGORIES (global, shared across all years) ----------


class CategoryIn(BaseModel):
    id: Optional[str] = None
    name: str = ""
    short: str = ""
    color: str = "#2563eb"
    legacy_chars: List[str] = Field(default_factory=list)
    order: int = 0


class CategoriesPayload(BaseModel):
    categories: List[CategoryIn] = Field(default_factory=list)


@router.get("/categories")
async def list_categories(current_user=Depends(get_current_user)):
    cats = await _ensure_categories_seeded()
    return {"categories": cats}


@router.put("/categories")
async def replace_categories(payload: CategoriesPayload, current_user=Depends(get_current_user)):
    """Replace the entire categories list (simplest, since the UI manages it as a single editable list)."""
    # Wipe then reinsert with normalised order
    await db[CATEGORIES].delete_many({})
    out = []
    for i, c in enumerate(payload.categories):
        cid = c.id
        if not cid or cid.startswith("tmp-"):
            cid = str(uuid.uuid4())
        doc = {
            "id": cid,
            "name": c.name.strip(),
            "short": c.short.strip(),
            "color": c.color or "#2563eb",
            "legacy_chars": [s for s in (c.legacy_chars or []) if s],
            "order": i,
        }
        await db[CATEGORIES].insert_one({**doc})
        out.append(doc)
    return {"categories": out}


# ---------- SCHEDULE (per-year) ----------


@router.get("/years")
async def list_years(current_user=Depends(get_current_user)):
    cursor = db[COLLECTION].find({}, {"_id": 0, "year": 1}).sort("year", -1)
    years = sorted({doc["year"] async for doc in cursor}, reverse=True)
    return {"years": years}


@router.get("/{year}")
async def get_schedule(year: int, current_user=Depends(get_current_user)):
    doc = await db[COLLECTION].find_one({"year": int(year)}, {"_id": 0})
    if not doc:
        doc = _make_default_doc(year)
        await db[COLLECTION].insert_one({**doc})
    # Convenience: include categories so the UI can render in a single fetch.
    doc["categories"] = await _ensure_categories_seeded()
    return doc


class ElementIn(BaseModel):
    id: Optional[str] = None
    name: str = ""
    priority: bool = False
    order: int = 0
    cells: Dict[str, str] = Field(default_factory=dict)


class ScheduleUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    elements: List[ElementIn] = Field(default_factory=list)
    signed_by: Optional[str] = None
    signed_date: Optional[str] = None


@router.put("/{year}")
async def update_schedule(year: int, payload: ScheduleUpdate, current_user=Depends(get_current_user)):
    existing = await db[COLLECTION].find_one({"year": int(year)}, {"_id": 0})
    if not existing:
        existing = _make_default_doc(year)
        await db[COLLECTION].insert_one({**existing})

    elements = _normalise_elements([e.model_dump() for e in payload.elements])

    update = {
        "title": payload.title if payload.title is not None else existing.get("title"),
        "company": payload.company if payload.company is not None else existing.get("company"),
        "elements": elements,
        "signed_by": payload.signed_by if payload.signed_by is not None else existing.get("signed_by", ""),
        "signed_date": payload.signed_date if payload.signed_date is not None else existing.get("signed_date", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db[COLLECTION].update_one({"year": int(year)}, {"$set": update}, upsert=True)
    doc = await db[COLLECTION].find_one({"year": int(year)}, {"_id": 0})
    doc["categories"] = await _ensure_categories_seeded()
    return doc


@router.post("/{from_year}/duplicate-to/{to_year}")
async def duplicate_schedule(from_year: int, to_year: int, current_user=Depends(get_current_user)):
    if int(from_year) == int(to_year):
        raise HTTPException(status_code=400, detail="from_year and to_year must differ")
    src = await db[COLLECTION].find_one({"year": int(from_year)}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail=f"No schedule found for {from_year}")
    if await db[COLLECTION].find_one({"year": int(to_year)}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Schedule for {to_year} already exists")
    new_doc = {
        **src,
        "id": str(uuid.uuid4()),
        "year": int(to_year),
        "title": f"Internal Audit Schedule {to_year}",
        "elements": [
            {**el, "id": str(uuid.uuid4())}  # fresh element ids; cells kept verbatim
            for el in src.get("elements", [])
        ],
        "signed_by": "",
        "signed_date": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db[COLLECTION].insert_one({**new_doc})
    new_doc.pop("_id", None)
    new_doc["categories"] = await _ensure_categories_seeded()
    return new_doc


@router.delete("/{year}")
async def delete_schedule(year: int, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"year": int(year)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}
