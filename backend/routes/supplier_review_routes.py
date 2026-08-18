"""
Top 10 Supplier Review (QMSF 10) Routes
Periodic supplier performance reviews with auto-calculated NCR% and quality grade.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/supplier-reviews", tags=["Supplier Reviews"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "supplier_reviews"


# Grade auto-derivation per QMSF 10 legend
def _grade_from_pct(pct: float) -> str:
    if pct <= 3.0:
        return "A"
    if pct <= 6.0:
        return "B"
    if pct <= 10.0:
        return "C"
    return "D"


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or user.get("name") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


# ==================== MODELS ====================

DECISION_OPTIONS = [
    "Continue with controls",
    "Restricted use only",
    "Supplier corrective action required",
    "Suspended",
    "Removed from approved supplier list",
]


class SupplierRow(BaseModel):
    id: Optional[str] = None
    company_name: str = ""
    orders_raised: float = 0
    ncrs: float = 0
    delivery_reliability: str = "A"  # manual A/B/C/D
    product_supplied: str = ""
    # Auto-calculated (server-authoritative)
    quality_percent: Optional[float] = 0.0
    product_quality_grade: Optional[str] = "A"
    # Escalation fields — required detail when a supplier scores C or D
    escalation_reason_approved: Optional[str] = None    # reason supplier is still approved
    escalation_risk_controls: Optional[str] = None
    escalation_corrective_action: Optional[str] = None
    escalation_supplier_contacted: Optional[bool] = None
    escalation_date_contacted: Optional[str] = None
    escalation_followup_date: Optional[str] = None
    escalation_approved_by: Optional[str] = None
    escalation_decision: Optional[str] = None           # one of DECISION_OPTIONS (mandatory for D)


class SupplierReviewBase(BaseModel):
    review_date: str  # ISO date YYYY-MM-DD
    comments: Optional[str] = ""
    suppliers: List[SupplierRow] = []


class SupplierReviewCreate(SupplierReviewBase):
    pass


class SupplierReviewUpdate(BaseModel):
    review_date: Optional[str] = None
    comments: Optional[str] = None
    suppliers: Optional[List[SupplierRow]] = None


def _compute_supplier(row: dict) -> dict:
    """Auto-calculate quality_percent and product_quality_grade for a supplier row."""
    orders = float(row.get("orders_raised") or 0)
    ncrs = float(row.get("ncrs") or 0)
    pct = (ncrs / orders * 100.0) if orders > 0 else 0.0
    pct = round(pct, 2)
    row["quality_percent"] = pct
    row["product_quality_grade"] = _grade_from_pct(pct)
    if not row.get("id"):
        row["id"] = str(uuid.uuid4())
    return row


def _normalise_review(payload: dict) -> dict:
    payload["suppliers"] = [_compute_supplier(s if isinstance(s, dict) else s.model_dump()) for s in (payload.get("suppliers") or [])]
    # A "D"-rated supplier must have an explicit management decision — auditors expect
    # documented risk control, not a silent D.
    for s in payload["suppliers"]:
        if s.get("product_quality_grade") == "D" and not (s.get("escalation_decision") or "").strip():
            raise HTTPException(
                status_code=422,
                detail=f"Supplier '{s.get('company_name') or 'unnamed'}' is rated D "
                       f"({s.get('quality_percent')}% NCR rate). A management decision is mandatory: "
                       + " / ".join(DECISION_OPTIONS))
    return payload


# ==================== ROUTES ====================

@router.get("")
async def list_reviews(current_user=Depends(get_current_user)):
    """List all supplier reviews (newest first by review_date)."""
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("review_date", -1), ("created_at", -1)]).to_list(length=None)
    return items


@router.post("")
async def create_review(payload: SupplierReviewCreate, current_user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc = _normalise_review(doc)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now
    doc["updated_at"] = now
    doc["created_by"] = _user_label(current_user)
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{review_id}")
async def get_review(review_id: str, current_user=Depends(get_current_user)):
    item = await db[COLLECTION].find_one({"id": review_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Review not found")
    return item


@router.put("/{review_id}")
async def update_review(review_id: str, payload: SupplierReviewUpdate, current_user=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "suppliers" in update_data:
        update_data["suppliers"] = [_compute_supplier(s if isinstance(s, dict) else dict(s)) for s in update_data["suppliers"]]
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = _user_label(current_user)
    result = await db[COLLECTION].update_one({"id": review_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    item = await db[COLLECTION].find_one({"id": review_id}, {"_id": 0})
    return item


@router.delete("/{review_id}")
async def delete_review(review_id: str, current_user=Depends(get_current_user)):
    result = await db[COLLECTION].delete_one({"id": review_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    return {"success": True}


@router.post("/{review_id}/duplicate")
async def duplicate_review(review_id: str, current_user=Depends(get_current_user)):
    """Create a new review pre-populated from an existing one (today's date, blank NCRs/orders cleared)."""
    item = await db[COLLECTION].find_one({"id": review_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Review not found")
    now = datetime.now(timezone.utc).isoformat()
    new_doc = {
        "id": str(uuid.uuid4()),
        "review_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "comments": item.get("comments", ""),
        "suppliers": [
            _compute_supplier({
                "id": str(uuid.uuid4()),
                "company_name": s.get("company_name", ""),
                "orders_raised": 0,
                "ncrs": 0,
                "delivery_reliability": s.get("delivery_reliability", "A"),
                "product_supplied": s.get("product_supplied", ""),
            })
            for s in (item.get("suppliers") or [])
        ],
        "created_at": now,
        "updated_at": now,
        "created_by": _user_label(current_user),
        "duplicated_from": review_id,
    }
    await db[COLLECTION].insert_one(new_doc)
    new_doc.pop("_id", None)
    return new_doc
