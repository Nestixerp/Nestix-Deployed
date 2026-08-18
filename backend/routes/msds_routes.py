"""
MSDS Register Routes (Material Safety Data Sheets)
ISO 14001 / OHS — track gases, chemicals etc. with 5-year SDS validity.
PDF uploads stored as base64 in MongoDB (same pattern as drawings).
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import base64

from auth import get_current_user

router = APIRouter(prefix="/api/msds", tags=["MSDS Register"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "msds_register"
FILES_COLLECTION = "msds_files"  # base64 blobs

MAX_PDF_BYTES = 15 * 1024 * 1024  # 15 MB
VALIDITY_YEARS = 5


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


def _add_years_iso(iso_str: str, years: int) -> str:
    """Return ISO date that is `years` years after `iso_str` (YYYY-MM-DD)."""
    if not iso_str:
        return ""
    try:
        # Accept YYYY-MM-DD or full ISO
        d = datetime.fromisoformat(iso_str.replace('Z', '+00:00').split('T')[0])
        try:
            new = d.replace(year=d.year + years)
        except ValueError:
            # Handle Feb 29
            new = d.replace(year=d.year + years, day=28)
        return new.strftime('%Y-%m-%d')
    except Exception:
        return ""


class MsdsItemBase(BaseModel):
    name: str
    supplier: Optional[str] = ""
    hazardous: Optional[str] = "NO"  # "YES" | "NO"
    dangerous_goods_class: Optional[str] = ""
    date_of_issue: Optional[str] = ""   # YYYY-MM-DD
    date_of_expiry: Optional[str] = ""  # auto-derived if not provided
    volume: Optional[str] = ""
    notes: Optional[str] = ""
    pdf_file_id: Optional[str] = None
    pdf_filename: Optional[str] = None


class MsdsCreate(MsdsItemBase):
    pass


class MsdsUpdate(BaseModel):
    name: Optional[str] = None
    supplier: Optional[str] = None
    hazardous: Optional[str] = None
    dangerous_goods_class: Optional[str] = None
    date_of_issue: Optional[str] = None
    date_of_expiry: Optional[str] = None
    volume: Optional[str] = None
    notes: Optional[str] = None
    pdf_file_id: Optional[str] = None
    pdf_filename: Optional[str] = None


def _normalise(doc: dict) -> dict:
    """Auto-fill expiry as issue + 5 years if not explicitly set."""
    if doc.get("date_of_issue") and not doc.get("date_of_expiry"):
        doc["date_of_expiry"] = _add_years_iso(doc["date_of_issue"], VALIDITY_YEARS)
    if doc.get("hazardous"):
        doc["hazardous"] = str(doc["hazardous"]).upper()
        if doc["hazardous"] not in ("YES", "NO"):
            doc["hazardous"] = "NO"
    return doc


# ==================== CRUD ====================

@router.get("")
async def list_msds(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("name", 1)]).to_list(length=None)
    return items


@router.post("")
async def create_msds(payload: MsdsCreate, current_user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc = _normalise(doc)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now
    doc["updated_at"] = now
    doc["created_by"] = _user_label(current_user)
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{msds_id}")
async def get_msds(msds_id: str, current_user=Depends(get_current_user)):
    item = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.put("/{msds_id}")
async def update_msds(msds_id: str, payload: MsdsUpdate, current_user=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    existing = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    merged = {**existing, **update_data}
    # If issue changed and expiry not explicitly provided in this update, recompute
    if "date_of_issue" in update_data and "date_of_expiry" not in update_data:
        merged["date_of_expiry"] = _add_years_iso(merged["date_of_issue"], VALIDITY_YEARS)
    merged = _normalise(merged)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged["updated_by"] = _user_label(current_user)
    merged.pop("id", None)
    merged.pop("created_at", None)
    merged.pop("created_by", None)
    await db[COLLECTION].update_one({"id": msds_id}, {"$set": merged})
    item = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    return item


@router.delete("/{msds_id}")
async def delete_msds(msds_id: str, current_user=Depends(get_current_user)):
    existing = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    # Best-effort: drop attached PDF too
    if existing.get("pdf_file_id"):
        await db[FILES_COLLECTION].delete_one({"id": existing["pdf_file_id"]})
    await db[COLLECTION].delete_one({"id": msds_id})
    return {"success": True}


# ==================== PDF UPLOAD / DOWNLOAD ====================

@router.post("/{msds_id}/upload")
async def upload_pdf(
    msds_id: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    existing = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="MSDS not found")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB)")
    # Remove old file if present
    if existing.get("pdf_file_id"):
        await db[FILES_COLLECTION].delete_one({"id": existing["pdf_file_id"]})
    file_id = str(uuid.uuid4())
    await db[FILES_COLLECTION].insert_one({
        "id": file_id,
        "msds_id": msds_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/pdf",
        "size": len(content),
        "base64_data": base64.b64encode(content).decode("utf-8"),
        "uploaded_by": _user_label(current_user),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    })
    await db[COLLECTION].update_one(
        {"id": msds_id},
        {"$set": {
            "pdf_file_id": file_id,
            "pdf_filename": file.filename,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": _user_label(current_user)
        }}
    )
    return {"file_id": file_id, "filename": file.filename, "size": len(content)}


@router.get("/{msds_id}/pdf")
async def download_pdf(
    msds_id: str,
    inline: bool = False,
    current_user=Depends(get_current_user)
):
    existing = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    if not existing or not existing.get("pdf_file_id"):
        raise HTTPException(status_code=404, detail="No PDF attached")
    f = await db[FILES_COLLECTION].find_one({"id": existing["pdf_file_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File missing")
    data = base64.b64decode(f["base64_data"])
    disposition = "inline" if inline else "attachment"
    safe_name = (existing.get("pdf_filename") or f.get("filename") or "msds.pdf").replace('"', "'")
    return Response(
        content=data,
        media_type=f.get("content_type", "application/pdf"),
        headers={"Content-Disposition": f'{disposition}; filename="{safe_name}"'}
    )


@router.delete("/{msds_id}/pdf")
async def delete_pdf(msds_id: str, current_user=Depends(get_current_user)):
    existing = await db[COLLECTION].find_one({"id": msds_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="MSDS not found")
    if existing.get("pdf_file_id"):
        await db[FILES_COLLECTION].delete_one({"id": existing["pdf_file_id"]})
    await db[COLLECTION].update_one(
        {"id": msds_id},
        {"$set": {"pdf_file_id": None, "pdf_filename": None,
                  "updated_at": datetime.now(timezone.utc).isoformat(),
                  "updated_by": _user_label(current_user)}}
    )
    return {"success": True}
