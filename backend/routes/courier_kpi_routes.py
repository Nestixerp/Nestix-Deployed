"""
Courier KPI Module

Records monthly delivery performance for each courier company:
  - 3 Hours on-time / late  (percentages)
  - 4 Hours on-time / late  (percentages)

Two collections:
  • couriers                 → the courier companies (manageable)
  • courier_kpi_entries      → one row per (courier_id, month) with the % values

Endpoints (all mounted under /api/courier-kpi):

  Couriers CRUD:
    GET    /couriers              list all (active first, then by sort_order)
    POST   /couriers              create courier
    PUT    /couriers/{id}         update courier
    DELETE /couriers/{id}         soft-delete (sets active=false) — preserves history

  KPI entry CRUD:
    GET    /entries?courier_id&start_month&end_month
    PUT    /entries               upsert single (courier_id, month) row
    DELETE /entries/{id}          delete one entry

  Aggregated data (for charts):
    GET    /data?period=rolling|calendar&end_month=YYYY-MM
           returns 12 months of data for ALL couriers ready for charting
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/courier-kpi", tags=["Courier KPI"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COURIERS = "couriers"
ENTRIES = "courier_kpi_entries"


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _parse_month_key(key: str):
    """Parse 'YYYY-MM' → (year, month). Raise 400 if invalid."""
    try:
        y, m = key.split("-")
        y_i, m_i = int(y), int(m)
        if m_i < 1 or m_i > 12:
            raise ValueError
        return y_i, m_i
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid month key '{key}'. Expected YYYY-MM.")


def _month_key(y: int, m: int) -> str:
    return f"{y:04d}-{m:02d}"


def _prev_month(y: int, m: int):
    if m == 1:
        return y - 1, 12
    return y, m - 1


def _month_label(y: int, m: int) -> str:
    """Format 2025, 7 → 'JUL-25'."""
    names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
             "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    return f"{names[m - 1]}-{str(y)[-2:]}"


# ─────────────────────────── COURIERS CRUD ───────────────────────────

class CourierIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = None
    color: Optional[str] = None  # hex e.g. "#3b82f6" for charts
    sort_order: Optional[int] = 0
    active: Optional[bool] = True


class CourierUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None


DEFAULT_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#9333ea", "#0891b2"]


@router.get("/couriers")
async def list_couriers(
    include_inactive: bool = False,
    current_user=Depends(get_current_user),
):
    filt = {} if include_inactive else {"active": {"$ne": False}}
    cursor = db[COURIERS].find(filt).sort([("sort_order", 1), ("name", 1)])
    items = []
    async for doc in cursor:
        items.append(_clean(doc))
    return {"couriers": items}


@router.post("/couriers")
async def create_courier(payload: CourierIn, current_user=Depends(get_current_user)):
    # Auto-pick a chart colour if not provided
    existing_count = await db[COURIERS].count_documents({})
    color = payload.color or DEFAULT_COLORS[existing_count % len(DEFAULT_COLORS)]

    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "code": (payload.code or "").strip() or None,
        "color": color,
        "sort_order": payload.sort_order or existing_count,
        "active": payload.active if payload.active is not None else True,
        "created_at": _now_iso(),
        "created_by": _user_label(current_user),
    }
    await db[COURIERS].insert_one(doc.copy())
    return _clean(doc)


@router.put("/couriers/{courier_id}")
async def update_courier(
    courier_id: str,
    payload: CourierUpdate,
    current_user=Depends(get_current_user),
):
    existing = await db[COURIERS].find_one({"id": courier_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Courier not found")
    # Use exclude_unset so callers only patch the fields they actually sent
    updates = payload.dict(exclude_unset=True)
    updates["updated_at"] = _now_iso()
    updates["updated_by"] = _user_label(current_user)
    await db[COURIERS].update_one({"id": courier_id}, {"$set": updates})
    updated = await db[COURIERS].find_one({"id": courier_id})
    return _clean(updated)


@router.delete("/couriers/{courier_id}")
async def delete_courier(courier_id: str, current_user=Depends(get_current_user)):
    existing = await db[COURIERS].find_one({"id": courier_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Courier not found")
    # Soft-delete to preserve historical KPI entries
    await db[COURIERS].update_one(
        {"id": courier_id},
        {"$set": {"active": False, "deleted_at": _now_iso(), "deleted_by": _user_label(current_user)}},
    )
    return {"success": True, "message": "Courier deactivated. Historical KPI entries preserved."}


# ─────────────────────────── KPI ENTRIES CRUD ───────────────────────────

def _pct(v):
    """Return v as float clamped 0-100 (nullable)."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid percentage value '{v}'")
    if f < 0 or f > 100:
        raise HTTPException(status_code=400, detail=f"Percentage {f} out of range 0-100")
    return round(f, 2)


class EntryIn(BaseModel):
    courier_id: str
    month: str  # 'YYYY-MM'
    on_time_3hr_percent: Optional[float] = None
    late_3hr_percent: Optional[float] = None
    on_time_4hr_percent: Optional[float] = None
    late_4hr_percent: Optional[float] = None
    total_jobs: Optional[int] = None
    notes: Optional[str] = None


@router.get("/entries")
async def list_entries(
    courier_id: Optional[str] = None,
    start_month: Optional[str] = None,  # inclusive 'YYYY-MM'
    end_month: Optional[str] = None,    # inclusive 'YYYY-MM'
    current_user=Depends(get_current_user),
):
    filt: Dict[str, Any] = {}
    if courier_id:
        filt["courier_id"] = courier_id
    if start_month or end_month:
        filt["month"] = {}
        if start_month:
            _parse_month_key(start_month)
            filt["month"]["$gte"] = start_month
        if end_month:
            _parse_month_key(end_month)
            filt["month"]["$lte"] = end_month
    cursor = db[ENTRIES].find(filt).sort([("month", 1), ("courier_id", 1)])
    items = []
    async for doc in cursor:
        items.append(_clean(doc))
    return {"entries": items}


@router.put("/entries")
async def upsert_entry(payload: EntryIn, current_user=Depends(get_current_user)):
    """Upsert one (courier_id, month) KPI row. All percentages optional."""
    _parse_month_key(payload.month)

    courier = await db[COURIERS].find_one({"id": payload.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")

    filt = {"courier_id": payload.courier_id, "month": payload.month}
    existing = await db[ENTRIES].find_one(filt)

    entry_id = existing["id"] if existing and existing.get("id") else str(uuid.uuid4())
    doc = {
        "id": entry_id,
        "courier_id": payload.courier_id,
        "month": payload.month,
        "on_time_3hr_percent": _pct(payload.on_time_3hr_percent),
        "late_3hr_percent": _pct(payload.late_3hr_percent),
        "on_time_4hr_percent": _pct(payload.on_time_4hr_percent),
        "late_4hr_percent": _pct(payload.late_4hr_percent),
        "total_jobs": int(payload.total_jobs) if payload.total_jobs is not None else None,
        "notes": (payload.notes or "").strip() or None,
        "updated_at": _now_iso(),
        "updated_by": _user_label(current_user),
    }
    if not existing:
        doc["created_at"] = _now_iso()
        doc["created_by"] = _user_label(current_user)

    await db[ENTRIES].update_one(filt, {"$set": doc}, upsert=True)
    return _clean(doc)


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, current_user=Depends(get_current_user)):
    result = await db[ENTRIES].delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"success": True}


# ─────────────────────────── AGGREGATED CHART DATA ───────────────────────────

@router.get("/data")
async def chart_data(
    period: str = Query("rolling", pattern="^(rolling|calendar)$"),
    end_month: Optional[str] = None,   # 'YYYY-MM' — inclusive last month (rolling mode)
    year: Optional[int] = None,        # calendar mode
    current_user=Depends(get_current_user),
):
    """Return 12 months of KPI data for all active couriers.

    Response:
    {
      "period_type": "rolling" | "calendar",
      "months":   [{"key":"2025-03","label":"MAR-25"}, ... 12 items ...],
      "couriers": [{"id","name","color","sort_order"}, ...],
      "series_3hr": {
        courier_id: {
          "on_time": [12 nullable floats],
          "late":    [12 nullable floats],
          "avg_on_time": float | null,
          "avg_late": float | null
        }
      },
      "series_4hr": { ... same shape ... }
    }
    """
    # Build the 12-month window
    if period == "calendar":
        if year is None:
            year = datetime.now(timezone.utc).year
        months = [(year, m) for m in range(1, 13)]
    else:
        if end_month:
            y_e, m_e = _parse_month_key(end_month)
        else:
            now = datetime.now(timezone.utc)
            y_e, m_e = now.year, now.month
        months = []
        y, m = y_e, m_e
        for _ in range(12):
            months.append((y, m))
            y, m = _prev_month(y, m)
        months.reverse()  # oldest → newest

    month_keys = [_month_key(y, m) for y, m in months]
    month_labels = [{"key": _month_key(y, m), "label": _month_label(y, m)} for y, m in months]

    # Active couriers
    couriers_cursor = db[COURIERS].find({"active": {"$ne": False}}).sort([("sort_order", 1), ("name", 1)])
    couriers = []
    async for c in couriers_cursor:
        couriers.append({
            "id": c["id"],
            "name": c["name"],
            "color": c.get("color") or "#3b82f6",
            "sort_order": c.get("sort_order", 0),
        })

    # Entries in window
    entries_cursor = db[ENTRIES].find({"month": {"$in": month_keys}})
    # Index: (courier_id, month) → entry
    idx: Dict[str, Dict[str, dict]] = {}
    async for e in entries_cursor:
        idx.setdefault(e["courier_id"], {})[e["month"]] = e

    def _series(kind_on: str, kind_late: str):
        out: Dict[str, Any] = {}
        for c in couriers:
            on_arr, late_arr = [], []
            for k in month_keys:
                entry = idx.get(c["id"], {}).get(k)
                on_arr.append(entry.get(kind_on) if entry else None)
                late_arr.append(entry.get(kind_late) if entry else None)
            non_null_on = [v for v in on_arr if v is not None]
            non_null_late = [v for v in late_arr if v is not None]
            out[c["id"]] = {
                "on_time": on_arr,
                "late": late_arr,
                "avg_on_time": round(sum(non_null_on) / len(non_null_on), 2) if non_null_on else None,
                "avg_late": round(sum(non_null_late) / len(non_null_late), 2) if non_null_late else None,
            }
        return out

    return {
        "period_type": period,
        "months": month_labels,
        "couriers": couriers,
        "series_3hr": _series("on_time_3hr_percent", "late_3hr_percent"),
        "series_4hr": _series("on_time_4hr_percent", "late_4hr_percent"),
    }
