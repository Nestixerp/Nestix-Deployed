"""IMS Manual Builder — live editable Quality/Environmental/OHS manual.

  /api/ims-manual                      GET (manual + sections + stats), PUT (meta)
  /api/ims-manual/approve              POST approve whole manual (bumps revision)
  /api/ims-manual/sections             POST create section
  /api/ims-manual/sections/{sid}       PUT edit (snapshots revision, back to Draft), DELETE archive
  /api/ims-manual/sections/{sid}/approve POST single-approver sign-off
  /api/ims-manual/sections-reorder     PUT {order:[ids]}
  /api/ims-manual/revisions            GET ?section_id=
  /api/ims-manual/export/pdf           GET full manual PDF
  /api/ims-manual/sections/{sid}/export/pdf GET section PDF
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import uuid
from pathlib import Path

from auth import get_current_user
from services.audit_trail import log_trail
from services.ims_manual_pdf import build_manual_pdf

router = APIRouter(prefix="/api/ims-manual", tags=["IMS Manual"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]

MANUALS, SECTIONS, REVISIONS = "ims_manuals", "ims_manual_sections", "ims_manual_revisions"
SEED_FILE = Path(__file__).parent.parent / "services" / "ims_manual_default_content.json"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _user_name(user):
    return user.get("full_name") or user.get("username", "system")


def _is_approver(user) -> bool:
    return (user or {}).get("role", "") in ("Administrator", "Admin", "Quality Manager")


class ManualMetaIn(BaseModel):
    title: str
    doc_number: Optional[str] = None
    company_name: Optional[str] = None
    issue_date: Optional[str] = None
    notes: Optional[str] = None


class MappedClause(BaseModel):
    standard_name: str
    version: str = ""
    clause_number: str
    clause_title: str = ""


class SectionIn(BaseModel):
    part: str = "manual"            # manual / procedure
    section_number: str
    title: str
    clause_refs: Optional[str] = ""
    content: Optional[str] = ""
    mapped_clauses: List[MappedClause] = []
    change_summary: Optional[str] = ""


async def ensure_manual_seed():
    """Idempotent — creates the default manual + sections from the reference DOCX content."""
    if await db[MANUALS].find_one({}):
        return 0
    manual = {
        "id": str(uuid.uuid4()),
        "title": "QUALITY / ENVIRONMENTAL / OHS MANUAL",
        "doc_number": "IMS-MAN-001",
        "company_name": "Ultimate Laser Pty. Ltd.",
        "revision": 1, "status": "Draft",
        "approved_by": None, "approved_at": None,
        "issue_date": None, "notes": "",
        "created_at": _now(), "updated_at": _now(),
    }
    await db[MANUALS].insert_one({**manual})
    count = 0
    with open(SEED_FILE) as f:
        defaults = json.load(f)
    for s in defaults:
        await db[SECTIONS].insert_one({
            "id": str(uuid.uuid4()), "manual_id": manual["id"], "key": s["key"],
            "part": s["part"], "section_number": s["section_number"], "title": s["title"],
            "clause_refs": s["clause_refs"], "content": s["content"],
            "mapped_clauses": [], "order": s["order"], "revision": 1,
            "status": "Draft", "approved_by": None, "approved_at": None,
            "archived": False, "updated_at": _now(), "updated_by": "system",
        })
        count += 1
    return count


async def _get_manual():
    manual = await db[MANUALS].find_one({}, {"_id": 0})
    if not manual:
        await ensure_manual_seed()
        manual = await db[MANUALS].find_one({}, {"_id": 0})
    return manual


async def _get_sections(manual_id):
    return await db[SECTIONS].find({"manual_id": manual_id, "archived": {"$ne": True}}, {"_id": 0}).sort("order", 1).to_list(500)


async def _log_rev(manual_id, section, action, user, summary=""):
    await db[REVISIONS].insert_one({
        "id": str(uuid.uuid4()), "manual_id": manual_id,
        "section_id": section.get("id") if section else None,
        "section_title": section.get("title") if section else None,
        "section_number": section.get("section_number") if section else None,
        "rev_number": section.get("revision") if section else None,
        "action": action, "summary": summary,
        "changed_by": _user_name(user), "changed_at": _now(),
        "snapshot": {k: section.get(k) for k in ("title", "content", "clause_refs", "mapped_clauses")} if section else None,
    })


@router.get("")
async def get_manual(current_user=Depends(get_current_user)):
    manual = await _get_manual()
    sections = await _get_sections(manual["id"])
    total = len(sections)
    approved = sum(1 for s in sections if s.get("status") == "Approved")
    return {
        "manual": manual, "sections": sections,
        "stats": {"total": total, "approved": approved, "draft": total - approved,
                  "completion_percent": round(approved / total * 100, 1) if total else 0},
    }


@router.put("")
async def update_manual(payload: ManualMetaIn, current_user=Depends(get_current_user)):
    manual = await _get_manual()
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[MANUALS].update_one({"id": manual["id"]}, {"$set": upd})
    await log_trail(current_user, "edited", "ims_manual", manual["id"], new_value=upd.get("title"))
    return await db[MANUALS].find_one({"id": manual["id"]}, {"_id": 0})


@router.post("/approve")
async def approve_manual(current_user=Depends(get_current_user)):
    if not _is_approver(current_user):
        raise HTTPException(403, "Admin or Quality Manager role required to approve the manual")
    manual = await _get_manual()
    name = _user_name(current_user)
    now = _now()
    new_rev = manual.get("revision", 1) + (1 if manual.get("status") == "Approved" or manual.get("approved_at") else 0)
    await db[SECTIONS].update_many(
        {"manual_id": manual["id"], "archived": {"$ne": True}, "status": {"$ne": "Approved"}},
        {"$set": {"status": "Approved", "approved_by": name, "approved_at": now}})
    await db[MANUALS].update_one({"id": manual["id"]}, {"$set": {
        "status": "Approved", "approved_by": name, "approved_at": now,
        "revision": new_rev, "updated_at": now}})
    await _log_rev(manual["id"], None, "manual_approved", current_user,
                   f"Manual approved at revision {new_rev} by {name}")
    await log_trail(current_user, "approved", "ims_manual", manual["id"], new_value=f"Rev {new_rev}")
    return await db[MANUALS].find_one({"id": manual["id"]}, {"_id": 0})


@router.post("/sections")
async def create_section(payload: SectionIn, current_user=Depends(get_current_user)):
    manual = await _get_manual()
    existing = await _get_sections(manual["id"])
    doc = payload.model_dump()
    doc.pop("change_summary", None)
    doc.update({
        "id": str(uuid.uuid4()), "manual_id": manual["id"], "key": f"custom_{uuid.uuid4().hex[:8]}",
        "order": (max((s.get("order", 0) for s in existing), default=0) + 1),
        "revision": 1, "status": "Draft", "approved_by": None, "approved_at": None,
        "archived": False, "updated_at": _now(), "updated_by": _user_name(current_user),
    })
    await db[SECTIONS].insert_one({**doc})
    doc.pop("_id", None)
    await _log_rev(manual["id"], doc, "created", current_user, "Section created")
    await log_trail(current_user, "created", "ims_manual_section", doc["id"], new_value=doc["title"])
    return doc


@router.put("/sections/{sid}")
async def update_section(sid: str, payload: SectionIn, current_user=Depends(get_current_user)):
    old = await db[SECTIONS].find_one({"id": sid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Section not found")
    await _log_rev(old["manual_id"], old, "edited", current_user,
                   payload.change_summary or "Content updated (previous version snapshotted)")
    upd = payload.model_dump()
    upd.pop("change_summary", None)
    upd.update({"revision": old.get("revision", 1) + 1, "status": "Draft",
                "approved_by": None, "approved_at": None,
                "updated_at": _now(), "updated_by": _user_name(current_user)})
    await db[SECTIONS].update_one({"id": sid}, {"$set": upd})
    await db[MANUALS].update_one({"id": old["manual_id"]}, {"$set": {"status": "Draft", "updated_at": _now()}})
    await log_trail(current_user, "edited", "ims_manual_section", sid, new_value=upd.get("title"))
    return await db[SECTIONS].find_one({"id": sid}, {"_id": 0})


@router.post("/sections/{sid}/approve")
async def approve_section(sid: str, current_user=Depends(get_current_user)):
    if not _is_approver(current_user):
        raise HTTPException(403, "Admin or Quality Manager role required to approve sections")
    sec = await db[SECTIONS].find_one({"id": sid}, {"_id": 0})
    if not sec:
        raise HTTPException(404, "Section not found")
    name = _user_name(current_user)
    await db[SECTIONS].update_one({"id": sid}, {"$set": {
        "status": "Approved", "approved_by": name, "approved_at": _now()}})
    sec.update({"status": "Approved", "approved_by": name})
    await _log_rev(sec["manual_id"], sec, "approved", current_user, f"Section approved by {name}")
    await log_trail(current_user, "approved", "ims_manual_section", sid, new_value=sec.get("title"))
    return await db[SECTIONS].find_one({"id": sid}, {"_id": 0})


@router.delete("/sections/{sid}")
async def archive_section(sid: str, current_user=Depends(get_current_user)):
    if not _is_approver(current_user):
        raise HTTPException(403, "Admin or Quality Manager role required to remove sections")
    sec = await db[SECTIONS].find_one({"id": sid}, {"_id": 0})
    if not sec:
        raise HTTPException(404, "Section not found")
    await db[SECTIONS].update_one({"id": sid}, {"$set": {"archived": True, "updated_at": _now()}})
    await _log_rev(sec["manual_id"], sec, "archived", current_user, "Section archived (content snapshotted)")
    return {"success": True}


class ReorderIn(BaseModel):
    order: List[str]


@router.put("/sections-reorder")
async def reorder_sections(payload: ReorderIn, current_user=Depends(get_current_user)):
    for i, sid in enumerate(payload.order):
        await db[SECTIONS].update_one({"id": sid}, {"$set": {"order": i}})
    return {"success": True}


@router.get("/revisions")
async def list_revisions(section_id: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"section_id": section_id} if section_id else {}
    items = await db[REVISIONS].find(q, {"_id": 0}).sort("changed_at", -1).to_list(300)
    return {"items": items}


@router.get("/export/pdf")
async def export_manual_pdf(current_user=Depends(get_current_user)):
    manual = await _get_manual()
    sections = await _get_sections(manual["id"])
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}
    buf = build_manual_pdf(manual, sections, company=company)
    fname = f"{manual.get('doc_number', 'IMS-Manual')}_Rev{manual.get('revision', 1)}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/sections/{sid}/export/pdf")
async def export_section_pdf(sid: str, current_user=Depends(get_current_user)):
    sec = await db[SECTIONS].find_one({"id": sid}, {"_id": 0})
    if not sec:
        raise HTTPException(404, "Section not found")
    manual = await _get_manual()
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}
    buf = build_manual_pdf(manual, [], single_section=sec, company=company)
    fname = f"IMS-Manual_Section_{sec.get('section_number', '')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})
