"""
Non-Conformance Report (NCR) Register — QMSF 03.

Each NCR carries the full legacy Filemaker layout (PO/Invoice/QTY/Customer/
Supplier/Cost etc.), plus:
  • category = "NCR" | "Concern"
  • credit_request block (with separate Credit Request log entry)
  • recut block (with its own NCR Job Sheet)

Stats endpoint returns this-month / YTD counts split by category, plus an
optional from/to date range filter.

Departments live in a separate editable picklist collection
`ncr_departments` so the dropdown can be extended at runtime.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user
from pymongo import ReturnDocument

router = APIRouter(prefix="/api/ncr", tags=["NCR"])

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

NCRS = "ncrs"
COUNTERS = "ncr_counters"
DEPARTMENTS = "ncr_departments"
CREDIT_REQUESTS = "credit_requests"

DEFAULT_DEPARTMENTS = [
    "Sales", "Programming", "Production", "Packing",
    "Scheduling", "Accounts", "Dispatch", "Inwards",
    "Quality", "Stores", "Maintenance",
]


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


async def _next_ncr_no() -> int:
    res = await db[COUNTERS].find_one_and_update(
        {"_id": "ncr_no"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


# ---------- Departments picklist ----------

class DepartmentsPayload(BaseModel):
    departments: List[str] = Field(default_factory=list)


async def _ensure_departments_seeded() -> List[str]:
    doc = await db[DEPARTMENTS].find_one({"_id": "list"}, {"_id": 0})
    if not doc:
        await db[DEPARTMENTS].insert_one({"_id": "list", "values": list(DEFAULT_DEPARTMENTS)})
        return list(DEFAULT_DEPARTMENTS)
    return list(doc.get("values") or DEFAULT_DEPARTMENTS)


@router.get("/departments")
async def list_departments(current_user=Depends(get_current_user)):
    return {"departments": await _ensure_departments_seeded()}


@router.put("/departments")
async def replace_departments(payload: DepartmentsPayload, current_user=Depends(get_current_user)):
    vals = [s.strip() for s in payload.departments if (s or "").strip()]
    # dedupe preserving order
    seen, uniq = set(), []
    for v in vals:
        if v.lower() not in seen:
            seen.add(v.lower())
            uniq.append(v)
    await db[DEPARTMENTS].update_one({"_id": "list"}, {"$set": {"values": uniq}}, upsert=True)
    return {"departments": uniq}


# ---------- NCR model ----------

class CreditRequest(BaseModel):
    enabled: bool = False
    customer: Optional[str] = None
    invoice_no: Optional[str] = None
    po_no: Optional[str] = None
    qty: Optional[float] = None
    unit_cost: Optional[float] = None
    total_amount: Optional[float] = None
    reason: Optional[str] = None
    requested_by: Optional[str] = None
    requested_date: Optional[str] = None
    approved_by: Optional[str] = None
    approved_date: Optional[str] = None
    status: Optional[str] = "Pending"  # Pending | Approved | Rejected | Issued
    credit_note_no: Optional[str] = None
    credit_request_no: Optional[int] = None  # auto-assigned when first enabled


class NCRJobSheet(BaseModel):
    required: bool = False
    job_sheet_no: Optional[str] = None
    original_po_no: Optional[str] = None
    original_job_no: Optional[str] = None
    recut_qty: Optional[float] = None
    reason: Optional[str] = None
    instructions: Optional[str] = None
    target_completion_date: Optional[str] = None
    material_cost: Optional[float] = None
    labour_cost: Optional[float] = None
    completed_by: Optional[str] = None
    completed_date: Optional[str] = None
    signed_off_by: Optional[str] = None
    signed_off_date: Optional[str] = None
    status: Optional[str] = "Open"  # Open | In Progress | Completed | Signed Off


class NCRBase(BaseModel):
    # Filemaker top-left block
    ult_lsr_po_no: Optional[str] = None
    ult_lsr_invoice_no: Optional[str] = None
    ult_lsr_posc_no: Optional[str] = None
    ult_lsr_pot_no: Optional[str] = None
    qty: Optional[float] = None
    date_raised: Optional[str] = None        # YYYY-MM-DD
    return_item_no: Optional[str] = None
    customer: Optional[str] = None
    supplier: Optional[str] = None
    location: Optional[str] = None
    product: Optional[str] = None
    ultimate_laser_item_no: Optional[str] = None
    pn_code: Optional[str] = None
    # Description + cost
    description: Optional[str] = None
    cost_per_item: Optional[float] = None
    entered_by: Optional[str] = None
    signature: Optional[str] = None
    notified_by_customer: Optional[str] = None      # Yes/No
    supplier_notified: Optional[str] = None
    internal: Optional[str] = None
    quality_assurance: Optional[str] = None         # who did QA (person name)
    downgrade_use: Optional[str] = None
    scrap: Optional[str] = None
    rework: Optional[str] = None
    # Right column — QA block
    root_cause: Optional[str] = None
    name: Optional[str] = None                       # contact/person raising
    qa_date: Optional[str] = None
    corrective_action_against_recurrence: Optional[str] = None
    signed_by: Optional[str] = None
    implementation_date: Optional[str] = None
    comments: Optional[str] = None
    action_completed_verified: Optional[str] = None  # Yes/No
    # Category + audit
    category: Optional[str] = "NCR"                 # "NCR" | "Concern"
    creditor_note: Optional[str] = None
    creditor_date: Optional[str] = None
    verified_by: Optional[str] = None
    verified_date: Optional[str] = None
    total_cost: Optional[float] = None
    loss_status: Optional[str] = None               # "Loss" | "No Loss"
    department: Optional[str] = None
    allocated_person_sales: Optional[str] = None
    allocated_person_programming: Optional[str] = None
    allocated_person_production: Optional[str] = None
    # Nested
    credit_request: CreditRequest = Field(default_factory=CreditRequest)
    ncr_job_sheet: NCRJobSheet = Field(default_factory=NCRJobSheet)


class NCRCreate(NCRBase):
    pass


class NCRUpdate(NCRBase):
    pass


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _next_credit_request_no() -> int:
    res = await db[COUNTERS].find_one_and_update(
        {"_id": "cr_no"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


async def _persist_credit_request_log(ncr: dict, cr: dict):
    """Mirror the credit request into the searchable credit_requests collection."""
    if not cr or not cr.get("enabled"):
        return
    if not cr.get("credit_request_no"):
        cr["credit_request_no"] = await _next_credit_request_no()
    log_doc = {
        "id": str(uuid.uuid4()),
        "credit_request_no": cr["credit_request_no"],
        "ncr_id": ncr["id"],
        "ncr_no": ncr.get("ncr_no"),
        "customer": cr.get("customer") or ncr.get("customer"),
        "invoice_no": cr.get("invoice_no") or ncr.get("ult_lsr_invoice_no"),
        "po_no": cr.get("po_no") or ncr.get("ult_lsr_po_no"),
        "qty": cr.get("qty") or ncr.get("qty"),
        "unit_cost": cr.get("unit_cost") or ncr.get("cost_per_item"),
        "total_amount": cr.get("total_amount") or ncr.get("total_cost"),
        "reason": cr.get("reason") or ncr.get("description"),
        "requested_by": cr.get("requested_by"),
        "requested_date": cr.get("requested_date") or _now_iso()[:10],
        "approved_by": cr.get("approved_by"),
        "approved_date": cr.get("approved_date"),
        "status": cr.get("status") or "Pending",
        "credit_note_no": cr.get("credit_note_no"),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    # Upsert one log entry per ncr_id
    await db[CREDIT_REQUESTS].update_one(
        {"ncr_id": ncr["id"]},
        {"$set": log_doc},
        upsert=True,
    )


# ---------- CRUD ----------

@router.get("")
async def list_ncrs(
    search: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 500,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if category:
        q["category"] = category
    if status:
        q["action_completed_verified"] = status
    if date_from or date_to:
        rng: Dict[str, Any] = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        q["date_raised"] = rng
    if search:
        s = search.strip()
        ors: List[Dict[str, Any]] = [
            {"customer": {"$regex": s, "$options": "i"}},
            {"supplier": {"$regex": s, "$options": "i"}},
            {"product": {"$regex": s, "$options": "i"}},
            {"description": {"$regex": s, "$options": "i"}},
            {"ult_lsr_po_no": {"$regex": s, "$options": "i"}},
            {"ult_lsr_invoice_no": {"$regex": s, "$options": "i"}},
            {"ultimate_laser_item_no": {"$regex": s, "$options": "i"}},
            {"pn_code": {"$regex": s, "$options": "i"}},
            {"entered_by": {"$regex": s, "$options": "i"}},
            {"name": {"$regex": s, "$options": "i"}},
            {"department": {"$regex": s, "$options": "i"}},
        ]
        if s.isdigit():
            ors.append({"ncr_no": int(s)})
        q["$or"] = ors
    cursor = db[NCRS].find(q, {"_id": 0}).sort("ncr_no", -1).limit(int(limit))
    items = await cursor.to_list(length=int(limit))
    return {"items": items, "count": len(items)}


@router.get("/stats")
async def stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Counts of NCRs vs Concerns for: this-month, YTD, and an optional date range."""
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    year_start = today.replace(month=1, day=1).isoformat()
    today_iso = today.isoformat()

    async def _count(category: str, dfrom: str, dto: str) -> int:
        return await db[NCRS].count_documents({
            "category": category,
            "date_raised": {"$gte": dfrom, "$lte": dto},
        })

    out: Dict[str, Any] = {
        "this_month": {
            "NCR": await _count("NCR", month_start, today_iso),
            "Concern": await _count("Concern", month_start, today_iso),
            "from": month_start, "to": today_iso,
        },
        "ytd": {
            "NCR": await _count("NCR", year_start, today_iso),
            "Concern": await _count("Concern", year_start, today_iso),
            "from": year_start, "to": today_iso,
        },
    }
    if date_from and date_to:
        out["range"] = {
            "NCR": await _count("NCR", date_from, date_to),
            "Concern": await _count("Concern", date_from, date_to),
            "from": date_from, "to": date_to,
        }
    # Last 12 months bar chart data (for inline use)
    monthly: List[Dict[str, Any]] = []
    cur = date(today.year, today.month, 1)
    for _ in range(12):
        if cur.month == 1:
            prev = date(cur.year - 1, 12, 1)
        else:
            prev = date(cur.year, cur.month - 1, 1)
        # determine end-of-month for `cur` as start of next month - 1 day
        if cur.month == 12:
            end_of = date(cur.year, 12, 31)
        else:
            end_of = date(cur.year, cur.month + 1, 1) - timedelta(days=1)
        monthly.insert(0, {
            "label": cur.strftime("%b %Y"),
            "year": cur.year,
            "month": cur.month,
            "NCR": await _count("NCR", cur.isoformat(), end_of.isoformat()),
            "Concern": await _count("Concern", cur.isoformat(), end_of.isoformat()),
        })
        cur = prev
    out["monthly"] = monthly
    return out


@router.post("")
async def create_ncr(payload: NCRCreate, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["ncr_no"] = await _next_ncr_no()
    doc["created_at"] = _now_iso()
    doc["updated_at"] = _now_iso()
    doc["created_by"] = _user_label(current_user)
    # auto-assign credit request number if enabled
    if doc.get("credit_request", {}).get("enabled") and not doc["credit_request"].get("credit_request_no"):
        doc["credit_request"]["credit_request_no"] = await _next_credit_request_no()
    # NCR Job Sheet number mirrors the NCR number per business rule
    if doc.get("ncr_job_sheet", {}).get("required"):
        doc["ncr_job_sheet"]["job_sheet_no"] = str(doc["ncr_no"])
    await db[NCRS].insert_one({**doc})
    doc.pop("_id", None)
    await _persist_credit_request_log(doc, doc.get("credit_request") or {})
    return doc


@router.get("/{ncr_id}")
async def get_ncr(ncr_id: str, current_user=Depends(get_current_user)):
    doc = await db[NCRS].find_one({"id": ncr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="NCR not found")
    return doc


@router.put("/{ncr_id}")
async def update_ncr(ncr_id: str, payload: NCRUpdate, current_user=Depends(get_current_user)):
    existing = await db[NCRS].find_one({"id": ncr_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="NCR not found")
    upd = payload.model_dump(exclude_unset=False)
    upd["updated_at"] = _now_iso()
    # auto-assign credit request number on first enable
    cr = upd.get("credit_request") or {}
    if cr.get("enabled") and not cr.get("credit_request_no"):
        existing_cr_no = (existing.get("credit_request") or {}).get("credit_request_no")
        cr["credit_request_no"] = existing_cr_no or await _next_credit_request_no()
        upd["credit_request"] = cr
    # NCR Job Sheet number mirrors the NCR number per business rule
    js = upd.get("ncr_job_sheet") or {}
    if js.get("required"):
        js["job_sheet_no"] = str(existing.get("ncr_no"))
        upd["ncr_job_sheet"] = js
    await db[NCRS].update_one({"id": ncr_id}, {"$set": upd})
    doc = await db[NCRS].find_one({"id": ncr_id}, {"_id": 0})
    await _persist_credit_request_log(doc, doc.get("credit_request") or {})
    return doc


@router.delete("/{ncr_id}")
async def delete_ncr(ncr_id: str, current_user=Depends(get_current_user)):
    res = await db[NCRS].delete_one({"id": ncr_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="NCR not found")
    await db[CREDIT_REQUESTS].delete_many({"ncr_id": ncr_id})
    return {"success": True}


# ---------- Credit Requests log (searchable separately) ----------

@router.get("/credit-requests/list")
async def list_credit_requests(
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    if search:
        s = search.strip()
        ors = [
            {"customer": {"$regex": s, "$options": "i"}},
            {"invoice_no": {"$regex": s, "$options": "i"}},
            {"po_no": {"$regex": s, "$options": "i"}},
            {"credit_note_no": {"$regex": s, "$options": "i"}},
        ]
        if s.isdigit():
            ors.append({"credit_request_no": int(s)})
            ors.append({"ncr_no": int(s)})
        q["$or"] = ors
    cursor = db[CREDIT_REQUESTS].find(q, {"_id": 0}).sort("credit_request_no", -1).limit(500)
    items = await cursor.to_list(length=500)
    return {"items": items, "count": len(items)}
