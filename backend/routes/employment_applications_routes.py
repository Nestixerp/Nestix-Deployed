"""
Employment Application submissions (QMSF 02).

Candidates fill in the form via a public link (no auth required) and submit.
HR / Admin view submissions through the platform and can print each
applicant's filled form with the Document Control footer.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid

from auth import get_current_user

router = APIRouter(prefix="/api/employment-applications", tags=["Employment Applications"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "employment_applications"


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class ApplicationSubmit(BaseModel):
    last_name: Optional[str] = ""
    first_name: Optional[str] = ""
    application_date: Optional[str] = ""
    street_address: Optional[str] = ""
    apartment: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    postcode: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    date_available: Optional[str] = ""
    desired_salary: Optional[str] = ""
    position: Optional[str] = ""
    is_citizen: Optional[str] = ""
    work_auth: Optional[str] = ""
    worked_before: Optional[str] = ""
    worked_before_when: Optional[str] = ""
    criminal: Optional[str] = ""
    criminal_explain: Optional[str] = ""
    education: List[Dict[str, Any]] = Field(default_factory=list)
    references: List[Dict[str, Any]] = Field(default_factory=list)
    previous_employment: List[Dict[str, Any]] = Field(default_factory=list)
    signature: Optional[str] = ""
    signature_date: Optional[str] = ""
    marital_status: Optional[str] = ""
    dependants: Optional[str] = ""


@router.post("/public/submit")
async def submit_application(payload: ApplicationSubmit, request: Request):
    """Public endpoint — candidate submits filled application. No auth required."""
    if not (payload.last_name or "").strip() or not (payload.first_name or "").strip():
        raise HTTPException(status_code=400, detail="Last name and first name are required")
    count = await db[COLLECTION].count_documents({})
    submission_no = f"EA-{datetime.now(timezone.utc).year}-{(count + 1):04d}"
    submitter_ip = request.client.host if request and request.client else ""
    if "x-forwarded-for" in request.headers:
        submitter_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "submission_no": submission_no,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "submitter_ip": submitter_ip,
        "status": "New",
    })
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "submission_no": submission_no}


@router.get("")
async def list_applications(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("submitted_at", -1)]).to_list(length=None)
    return items


@router.get("/{app_id}")
async def get_application(app_id: str, current_user=Depends(get_current_user)):
    doc = await db[COLLECTION].find_one({"id": app_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found")
    return doc


class StatusUpdate(BaseModel):
    status: str


@router.put("/{app_id}/status")
async def update_status(app_id: str, payload: StatusUpdate, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].update_one(
        {"id": app_id},
        {"$set": {"status": payload.status, "status_updated_by": _user_label(current_user),
                  "status_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"success": True}


@router.delete("/{app_id}")
async def delete_application(app_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": app_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"success": True}
