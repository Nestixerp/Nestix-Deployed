"""
Injury Graph (LTI / MTI) — ISO/IMS.

Returns 3 rolling years of Lost-Time-Injury (LTI) and Medical-Treatment-Injury
(MTI) counts aggregated per month from the Injury Register, with the option to
manually override any (year, month, type) cell.

Classification rule (auto-aggregate):
  • LTI = an injury_register record where `ceased_work` == "Yes"
  • MTI = any other injury_register record (still recorded but worker did not
    cease work — i.e. medical treatment / first aid case)

Manual overrides are stored in `injury_stats_overrides` keyed on
(year, month_index, type) and take precedence over the auto count when present.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

from auth import get_current_user

router = APIRouter(prefix="/api/injury-graph", tags=["Injury Graph"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

REGISTER = "injury_register"
OVERRIDES = "injury_stats_overrides"

MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
]


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


def _parse_date(s: Optional[str]):
    """Parse an ISO date string (YYYY-MM-DD) — return (year, month_index 0-11) or None."""
    if not s or not isinstance(s, str):
        return None
    try:
        # Allow full ISO datetime too
        d = datetime.fromisoformat(s[:10])
        return d.year, d.month - 1
    except Exception:
        return None


async def _auto_counts(start_year: int, end_year: int) -> Dict[int, Dict[str, List[int]]]:
    """Aggregate LTI/MTI counts per (year, month) from injury_register."""
    result: Dict[int, Dict[str, List[int]]] = {
        y: {"LTI": [0] * 12, "MTI": [0] * 12} for y in range(start_year, end_year + 1)
    }
    cursor = db[REGISTER].find(
        {},
        {"_id": 0, "date_of_event": 1, "date": 1, "ceased_work": 1},
    )
    async for doc in cursor:
        parsed = _parse_date(doc.get("date_of_event")) or _parse_date(doc.get("date"))
        if not parsed:
            continue
        year, m_idx = parsed
        if year < start_year or year > end_year:
            continue
        is_lti = (str(doc.get("ceased_work") or "").strip().lower() == "yes")
        key = "LTI" if is_lti else "MTI"
        result[year][key][m_idx] += 1
    return result


async def _overrides_map(start_year: int, end_year: int) -> Dict[str, int]:
    """Return {f'{year}-{month_idx}-{type}': value} for stored overrides."""
    cursor = db[OVERRIDES].find(
        {"year": {"$gte": start_year, "$lte": end_year}},
        {"_id": 0},
    )
    out: Dict[str, int] = {}
    async for doc in cursor:
        key = f"{doc['year']}-{doc['month_index']}-{doc['type']}"
        out[key] = int(doc.get("value") or 0)
    return out


@router.get("/data")
async def graph_data(end_year: Optional[int] = None, current_user=Depends(get_current_user)):
    """Return 3 rolling years of LTI + MTI monthly data ending at end_year.

    Response shape:
    {
      "years": [Y-2, Y-1, Y],
      "lti": { Y-2: [12 ints], Y-1: [...], Y: [...] },
      "mti": { ... },
      "auto_lti": { same shape — pre-override numbers from register },
      "auto_mti": { ... },
      "totals": { Y: {LTI: int, MTI: int}, ... }
    }
    """
    if end_year is None:
        end_year = datetime.now(timezone.utc).year
    start_year = end_year - 2

    auto = await _auto_counts(start_year, end_year)
    overrides = await _overrides_map(start_year, end_year)

    lti: Dict[int, List[int]] = {}
    mti: Dict[int, List[int]] = {}
    auto_lti: Dict[int, List[int]] = {}
    auto_mti: Dict[int, List[int]] = {}
    totals: Dict[int, Dict[str, int]] = {}

    for y in range(start_year, end_year + 1):
        a_lti = auto[y]["LTI"]
        a_mti = auto[y]["MTI"]
        f_lti = [overrides.get(f"{y}-{m}-LTI", a_lti[m]) for m in range(12)]
        f_mti = [overrides.get(f"{y}-{m}-MTI", a_mti[m]) for m in range(12)]
        lti[y] = f_lti
        mti[y] = f_mti
        auto_lti[y] = a_lti
        auto_mti[y] = a_mti
        totals[y] = {"LTI": sum(f_lti), "MTI": sum(f_mti)}

    return {
        "years": list(range(start_year, end_year + 1)),
        "lti": {str(k): v for k, v in lti.items()},
        "mti": {str(k): v for k, v in mti.items()},
        "auto_lti": {str(k): v for k, v in auto_lti.items()},
        "auto_mti": {str(k): v for k, v in auto_mti.items()},
        "totals": {str(k): v for k, v in totals.items()},
    }


class OverrideIn(BaseModel):
    year: int
    month_index: int = Field(ge=0, le=11)
    type: str  # "LTI" or "MTI"
    value: int = Field(ge=0)


@router.put("/override")
async def upsert_override(payload: OverrideIn, current_user=Depends(get_current_user)):
    if payload.type not in ("LTI", "MTI"):
        raise HTTPException(status_code=400, detail="type must be LTI or MTI")
    filt = {"year": payload.year, "month_index": payload.month_index, "type": payload.type}
    update = {
        "$set": {
            **filt,
            "value": int(payload.value),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": _user_label(current_user),
        }
    }
    await db[OVERRIDES].update_one(filt, update, upsert=True)
    return {"success": True}


class YearOverrideIn(BaseModel):
    year: int
    type: str  # "LTI" or "MTI"
    values: List[int]  # 12 integers


@router.put("/override-year")
async def upsert_year(payload: YearOverrideIn, current_user=Depends(get_current_user)):
    if payload.type not in ("LTI", "MTI"):
        raise HTTPException(status_code=400, detail="type must be LTI or MTI")
    if len(payload.values) != 12:
        raise HTTPException(status_code=400, detail="values must have 12 entries")
    when = datetime.now(timezone.utc).isoformat()
    who = _user_label(current_user)
    for m_idx, v in enumerate(payload.values):
        filt = {"year": payload.year, "month_index": m_idx, "type": payload.type}
        await db[OVERRIDES].update_one(
            filt,
            {"$set": {**filt, "value": int(v or 0), "updated_at": when, "updated_by": who}},
            upsert=True,
        )
    return {"success": True}


@router.delete("/override/{year}/{month_index}/{type_}")
async def clear_override(year: int, month_index: int, type_: str, current_user=Depends(get_current_user)):
    if type_ not in ("LTI", "MTI"):
        raise HTTPException(status_code=400, detail="type must be LTI or MTI")
    await db[OVERRIDES].delete_one({"year": year, "month_index": month_index, "type": type_})
    return {"success": True}


@router.delete("/override-year/{year}/{type_}")
async def clear_year(year: int, type_: str, current_user=Depends(get_current_user)):
    if type_ not in ("LTI", "MTI"):
        raise HTTPException(status_code=400, detail="type must be LTI or MTI")
    await db[OVERRIDES].delete_many({"year": year, "type": type_})
    return {"success": True}
