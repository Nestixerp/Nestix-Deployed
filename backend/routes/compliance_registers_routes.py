"""
ISO compliance registers — Forklift Licenses (QMSF 29) and First Aid Certificates
(QMSF 30). Each register stores name + key fields + an expiry date; the stats
endpoint returns current vs expiring-soon vs expired counts.

First Aid records keep a renewal history (each entry has its own certificate
file attached). Files are stored base64 in the `compliance_files` collection
and downloadable via `/api/compliance/files/{id}`.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import base64

from auth import get_current_user

router = APIRouter(prefix="/api/compliance", tags=["Compliance Registers"])

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

FORKLIFT = "forklift_licenses"
FIRSTAID = "first_aid_certificates"
ATTAIN = "first_aid_attainment_codes"
FILES = "compliance_files"

DEFAULT_ATTAINMENT_CODES = [
    "HLTAID009",  # Provide CPR (1-year refresh)
    "HLTAID010",  # Provide basic emergency life support
    "HLTAID011",  # Provide first aid (3-year refresh)
    "HLTAID012",  # Provide first aid in an education and care setting
    "HLTAID013",  # Provide first aid in remote or isolated site
    "HLTAID014",  # Provide advanced first aid
]


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


# ---------- Attainment picklist (First Aid) ----------

class AttainmentPayload(BaseModel):
    codes: List[str] = Field(default_factory=list)


async def _ensure_attainment_seeded() -> List[str]:
    doc = await db[ATTAIN].find_one({"_id": "list"}, {"_id": 0})
    if not doc:
        await db[ATTAIN].insert_one({"_id": "list", "values": list(DEFAULT_ATTAINMENT_CODES)})
        return list(DEFAULT_ATTAINMENT_CODES)
    return list(doc.get("values") or DEFAULT_ATTAINMENT_CODES)


@router.get("/first-aid/attainment-codes")
async def list_attainment(current_user=Depends(get_current_user)):
    return {"codes": await _ensure_attainment_seeded()}


@router.put("/first-aid/attainment-codes")
async def replace_attainment(payload: AttainmentPayload, current_user=Depends(get_current_user)):
    vals = []
    seen = set()
    for c in (payload.codes or []):
        c = (c or "").strip()
        if c and c.lower() not in seen:
            seen.add(c.lower())
            vals.append(c)
    await db[ATTAIN].update_one({"_id": "list"}, {"$set": {"values": vals}}, upsert=True)
    return {"codes": vals}


# ---------- File storage (shared by both registers) ----------

ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic']


@router.post("/files/upload")
async def upload_certificate_file(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File must be < 10 MB")
    file_id = str(uuid.uuid4())
    doc = {
        "id": file_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "extension": ext,
        "base64_data": base64.b64encode(content).decode("utf-8"),
        "size": len(content),
        "uploaded_by": _user_label(current_user),
        "uploaded_at": _now_iso(),
    }
    await db[FILES].insert_one({**doc})
    return {"id": file_id, "filename": file.filename, "size": len(content)}


@router.get("/files/{file_id}")
async def download_certificate_file(file_id: str, current_user=Depends(get_current_user)):
    doc = await db[FILES].find_one({"id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=base64.b64decode(doc["base64_data"]),
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


@router.delete("/files/{file_id}")
async def delete_certificate_file(file_id: str, current_user=Depends(get_current_user)):
    res = await db[FILES].delete_one({"id": file_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}


# ---------- Stats helper ----------

def _classify(expiry_str: Optional[str]) -> str:
    """Return one of: 'current' | 'expiring_soon' | 'expired' | 'missing'."""
    if not expiry_str:
        return "missing"
    try:
        d = date.fromisoformat(expiry_str[:10])
    except Exception:
        return "missing"
    today = date.today()
    if d < today:
        return "expired"
    if d <= today + timedelta(days=90):
        return "expiring_soon"
    return "current"


def _stats_from(items: List[dict]) -> Dict[str, int]:
    out = {"current": 0, "expiring_soon": 0, "expired": 0, "missing": 0, "total": len(items)}
    for it in items:
        out[_classify(it.get("expiry_date"))] += 1
    return out


# ---------- FORKLIFT LICENSE REGISTER (QMSF 29) ----------

class ForkliftLicenseIn(BaseModel):
    name: str = ""
    license_number: Optional[str] = None
    issue_date: Optional[str] = None       # YYYY-MM-DD
    expiry_date: Optional[str] = None      # YYYY-MM-DD
    employee_id: Optional[str] = None
    notes: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None


@router.get("/forklift")
async def list_forklift(
    search: Optional[str] = None,
    status: Optional[str] = None,  # current | expiring_soon | expired | missing
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if search:
        s = search.strip()
        q["$or"] = [
            {"name": {"$regex": s, "$options": "i"}},
            {"license_number": {"$regex": s, "$options": "i"}},
            {"notes": {"$regex": s, "$options": "i"}},
        ]
    items = await db[FORKLIFT].find(q, {"_id": 0}).sort("name", 1).to_list(length=2000)
    if status:
        items = [it for it in items if _classify(it.get("expiry_date")) == status]
    for it in items:
        it["status"] = _classify(it.get("expiry_date"))
    return {"items": items, "count": len(items)}


@router.get("/forklift/stats")
async def forklift_stats(current_user=Depends(get_current_user)):
    items = await db[FORKLIFT].find({}, {"_id": 0, "expiry_date": 1}).to_list(length=10000)
    return _stats_from(items)


@router.post("/forklift")
async def create_forklift(payload: ForkliftLicenseIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = _now_iso()
    doc["updated_at"] = _now_iso()
    doc["created_by"] = _user_label(current_user)
    await db[FORKLIFT].insert_one({**doc})
    doc.pop("_id", None)
    doc["status"] = _classify(doc.get("expiry_date"))
    return doc


@router.put("/forklift/{lic_id}")
async def update_forklift(lic_id: str, payload: ForkliftLicenseIn, current_user=Depends(get_current_user)):
    existing = await db[FORKLIFT].find_one({"id": lic_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="License not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now_iso()
    # If file was replaced, drop the old one
    old_fid = existing.get("file_id")
    new_fid = upd.get("file_id")
    if old_fid and old_fid != new_fid:
        await db[FILES].delete_one({"id": old_fid})
    await db[FORKLIFT].update_one({"id": lic_id}, {"$set": upd})
    doc = await db[FORKLIFT].find_one({"id": lic_id}, {"_id": 0})
    doc["status"] = _classify(doc.get("expiry_date"))
    return doc


@router.delete("/forklift/{lic_id}")
async def delete_forklift(lic_id: str, current_user=Depends(get_current_user)):
    existing = await db[FORKLIFT].find_one({"id": lic_id}, {"_id": 0, "file_id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="License not found")
    if existing.get("file_id"):
        await db[FILES].delete_one({"id": existing["file_id"]})
    await db[FORKLIFT].delete_one({"id": lic_id})
    return {"success": True}


# ---------- FIRST AID REGISTER (QMSF 30) ----------

class FirstAidCertEntry(BaseModel):
    id: Optional[str] = None
    certificate_number: Optional[str] = None
    attainments: List[str] = Field(default_factory=list)
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issuer: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    uploaded_at: Optional[str] = None


class FirstAidRecordIn(BaseModel):
    name: str = ""
    employee_id: Optional[str] = None
    notes: Optional[str] = None
    certificates: List[FirstAidCertEntry] = Field(default_factory=list)


def _current_cert(record: dict) -> Optional[dict]:
    """Pick the latest (greatest expiry_date) certificate for stats."""
    certs = record.get("certificates") or []
    if not certs:
        return None
    def key(c):
        return c.get("expiry_date") or ""
    return sorted(certs, key=key, reverse=True)[0]


def _expand_record(record: dict) -> dict:
    cur = _current_cert(record)
    record["current_certificate"] = cur
    record["status"] = _classify(cur.get("expiry_date") if cur else None)
    record["all_attainments"] = sorted({a for c in (record.get("certificates") or []) for a in (c.get("attainments") or [])})
    return record


@router.get("/first-aid")
async def list_first_aid(
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if search:
        s = search.strip()
        q["$or"] = [
            {"name": {"$regex": s, "$options": "i"}},
            {"notes": {"$regex": s, "$options": "i"}},
            {"certificates.certificate_number": {"$regex": s, "$options": "i"}},
            {"certificates.attainments": {"$regex": s, "$options": "i"}},
        ]
    items = await db[FIRSTAID].find(q, {"_id": 0}).sort("name", 1).to_list(length=2000)
    items = [_expand_record(it) for it in items]
    if status:
        items = [it for it in items if it["status"] == status]
    return {"items": items, "count": len(items)}


@router.get("/first-aid/stats")
async def first_aid_stats(current_user=Depends(get_current_user)):
    items = await db[FIRSTAID].find({}, {"_id": 0, "certificates": 1}).to_list(length=10000)
    # Use latest cert expiry per record
    cur = []
    for it in items:
        c = _current_cert(it)
        cur.append({"expiry_date": c.get("expiry_date") if c else None})
    return _stats_from(cur)


def _normalise_certs(certs: List[FirstAidCertEntry]) -> List[dict]:
    out = []
    for c in certs:
        d = c.model_dump() if hasattr(c, "model_dump") else dict(c)
        if not d.get("id"):
            d["id"] = str(uuid.uuid4())
        d["attainments"] = [a for a in (d.get("attainments") or []) if a]
        out.append(d)
    return out


@router.post("/first-aid")
async def create_first_aid(payload: FirstAidRecordIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["certificates"] = _normalise_certs(payload.certificates or [])
    doc["created_at"] = _now_iso()
    doc["updated_at"] = _now_iso()
    doc["created_by"] = _user_label(current_user)
    await db[FIRSTAID].insert_one({**doc})
    doc.pop("_id", None)
    return _expand_record(doc)


@router.get("/first-aid/{rec_id}")
async def get_first_aid(rec_id: str, current_user=Depends(get_current_user)):
    doc = await db[FIRSTAID].find_one({"id": rec_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return _expand_record(doc)


@router.put("/first-aid/{rec_id}")
async def update_first_aid(rec_id: str, payload: FirstAidRecordIn, current_user=Depends(get_current_user)):
    existing = await db[FIRSTAID].find_one({"id": rec_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    upd = payload.model_dump()
    upd["certificates"] = _normalise_certs(payload.certificates or [])
    upd["updated_at"] = _now_iso()
    await db[FIRSTAID].update_one({"id": rec_id}, {"$set": upd})
    doc = await db[FIRSTAID].find_one({"id": rec_id}, {"_id": 0})
    return _expand_record(doc)


@router.delete("/first-aid/{rec_id}")
async def delete_first_aid(rec_id: str, current_user=Depends(get_current_user)):
    rec = await db[FIRSTAID].find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    # Cascade delete attached files
    for c in rec.get("certificates") or []:
        if c.get("file_id"):
            await db[FILES].delete_one({"id": c["file_id"]})
    await db[FIRSTAID].delete_one({"id": rec_id})
    return {"success": True}
