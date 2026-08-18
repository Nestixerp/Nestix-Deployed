"""RFQ (Request for Quote) module — material purchasing enquiries sent to
suppliers via a public link (no email integration needed, like customer surveys).

Auth:   POST/GET /api/rfqs, GET /api/rfqs/{id}, PUT /api/rfqs/{id}/status, DELETE /api/rfqs/{id}
Public: GET /api/rfqs/public/{token}, POST /api/rfqs/public/{token}/respond
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import secrets

from auth import get_current_user

router = APIRouter(prefix="/api/rfqs", tags=["RFQs"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]

RFQS, RESPONSES = "rfqs", "rfq_responses"


def _now():
    return datetime.now(timezone.utc).isoformat()


class RFQItem(BaseModel):
    id: Optional[str] = None
    description: str
    material_type: Optional[str] = ""
    size: Optional[str] = ""
    quantity: float = 1
    notes: Optional[str] = ""


class RFQIn(BaseModel):
    title: str
    notes: Optional[str] = ""
    required_by: Optional[str] = ""
    items: List[RFQItem]


class ResponseItem(BaseModel):
    item_id: str
    price: Optional[float] = None
    available: bool = True
    alternative_size: Optional[str] = ""
    alternative_price: Optional[float] = None
    notes: Optional[str] = ""


class SupplierResponse(BaseModel):
    supplier_company: str
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    overall_notes: Optional[str] = ""
    items: List[ResponseItem]


async def _next_number():
    n = await db[RFQS].count_documents({})
    return f"RFQ-{n + 1:04d}"


@router.post("")
async def create_rfq(payload: RFQIn, current_user=Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(400, "At least one material item is required")
    items = []
    for it in payload.items:
        d = it.model_dump()
        d["id"] = d.get("id") or str(uuid.uuid4())
        items.append(d)
    doc = {
        "id": str(uuid.uuid4()),
        "rfq_number": await _next_number(),
        "title": payload.title,
        "notes": payload.notes,
        "required_by": payload.required_by,
        "items": items,
        "public_token": secrets.token_urlsafe(24),
        "status": "Open",
        "created_at": _now(),
        "created_by": current_user.get("full_name") or current_user.get("username", ""),
    }
    await db[RFQS].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_rfqs(current_user=Depends(get_current_user)):
    rfqs = await db[RFQS].find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    for r in rfqs:
        r["response_count"] = await db[RESPONSES].count_documents({"rfq_id": r["id"]})
    return {"items": rfqs}


@router.get("/{rfq_id}")
async def get_rfq(rfq_id: str, current_user=Depends(get_current_user)):
    rfq = await db[RFQS].find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    rfq["responses"] = await db[RESPONSES].find({"rfq_id": rfq_id}, {"_id": 0}).sort("submitted_at", 1).to_list(100)
    return rfq


class StatusIn(BaseModel):
    status: str  # Open / Closed


@router.put("/{rfq_id}/status")
async def set_status(rfq_id: str, payload: StatusIn, current_user=Depends(get_current_user)):
    if payload.status not in ("Open", "Closed"):
        raise HTTPException(400, "Status must be Open or Closed")
    res = await db[RFQS].update_one({"id": rfq_id}, {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(404, "RFQ not found")
    return {"success": True, "status": payload.status}


@router.delete("/{rfq_id}")
async def delete_rfq(rfq_id: str, current_user=Depends(get_current_user)):
    res = await db[RFQS].delete_one({"id": rfq_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "RFQ not found")
    await db[RESPONSES].delete_many({"rfq_id": rfq_id})
    return {"success": True}


# ==================== PUBLIC (supplier-facing, no auth) ====================

@router.get("/public/{token}")
async def public_get_rfq(token: str):
    rfq = await db[RFQS].find_one({"public_token": token}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "Enquiry link not found")
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}
    if rfq.get("status") != "Open":
        return {"active": False, "title": rfq.get("title"), "rfq_number": rfq.get("rfq_number"),
                "company_name": company.get("company_name", ""),
                "message": "This enquiry has been closed. Thank you for your interest."}
    return {
        "active": True,
        "rfq_number": rfq.get("rfq_number"),
        "title": rfq.get("title"),
        "notes": rfq.get("notes"),
        "required_by": rfq.get("required_by"),
        "items": rfq.get("items", []),
        "company_name": company.get("company_name", ""),
        "company_logo_url": company.get("company_logo_url", ""),
    }


@router.post("/public/{token}/respond")
async def public_respond(token: str, payload: SupplierResponse):
    rfq = await db[RFQS].find_one({"public_token": token}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "Enquiry link not found")
    if rfq.get("status") != "Open":
        raise HTTPException(400, "This enquiry is closed")
    if not payload.supplier_company.strip():
        raise HTTPException(400, "Company name is required")
    valid_ids = {it["id"] for it in rfq.get("items", [])}
    items = [it.model_dump() for it in payload.items if it.item_id in valid_ids]
    doc = {
        "id": str(uuid.uuid4()),
        "rfq_id": rfq["id"],
        "supplier_company": payload.supplier_company.strip(),
        "contact_name": payload.contact_name,
        "email": payload.email,
        "phone": payload.phone,
        "overall_notes": payload.overall_notes,
        "items": items,
        "submitted_at": _now(),
    }
    await db[RESPONSES].insert_one({**doc})
    return {"success": True, "message": "Thank you — your pricing has been submitted."}
