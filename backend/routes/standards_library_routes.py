"""Standards & Clause Library + Help Content + Clause Mappings + Transition Items.

Admin-editable library that drives the IMS audit framework:
  /api/standards-library/standards        CRUD
  /api/standards-library/clauses          CRUD (per standard)
  /api/standards-library/mappings         CRUD (clause transition mappings)
  /api/standards-library/help             CRUD (help content per audit section/heading)
  /api/standards-library/help/lookup      GET help by section title (incl. legacy title mapping)
  /api/standards-library/transition-items CRUD (transition gap register)
  /api/standards-library/transition-report GET
  /api/standards-library/framework        GET the 17-section IMS framework
  /api/standards-library/seed             POST idempotent seed
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user
from services.audit_trail import log_trail
from services.ims_framework_seed import (
    SEED_STANDARDS, SEED_CLAUSE_MAPPINGS, IMS_FRAMEWORK_SECTIONS,
    LEGACY_TITLE_MAP, STATUS_OPTIONS, SAMPLE_TYPES, default_clauses_for,
)

router = APIRouter(prefix="/api/standards-library", tags=["Standards Library"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]

STANDARDS, CLAUSES, MAPPINGS, HELP, TRANSITION = (
    "standards", "standard_clauses", "clause_mappings", "audit_help_content", "transition_items")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _is_admin(user) -> bool:
    role = (user or {}).get("role", "")
    return role in ("Administrator", "Admin", "Quality Manager")


def _require_admin(user):
    if not _is_admin(user):
        raise HTTPException(403, "Admin or Quality Manager role required to edit the Standards Library")


# ── Models (all fields editable) ─────────────────────────────────────
class StandardIn(BaseModel):
    name: str
    version: str
    type: str = "Quality"          # Quality / Environmental / OHS / Audit Guidance / Other
    status: str = "Current"        # Current / Superseded / Draft / Transition / Archived
    effective_date: Optional[str] = None
    transition_deadline: Optional[str] = None
    notes: Optional[str] = None


class ClauseIn(BaseModel):
    standard_id: str
    clause_number: str
    clause_title: str = ""
    clause_summary: Optional[str] = None
    parent_clause: Optional[str] = None
    audit_prompt: Optional[str] = None
    evidence_guidance: Optional[str] = None
    typical_records: Optional[str] = None
    applicable_to: Optional[str] = "IMS"   # Quality / Environmental / OHS / IMS
    help_title: Optional[str] = None
    help_text: Optional[str] = None
    help_evidence_examples: Optional[str] = None
    help_sample_wording: Optional[str] = None
    active: bool = True


class MappingIn(BaseModel):
    current_standard: str
    current_clause: str
    new_standard: str
    new_clause: str
    mapping_type: str = "Equivalent"  # Equivalent / Changed / New / Removed / Expanded
    transition_notes: Optional[str] = None
    action_required: Optional[str] = None


class HelpIn(BaseModel):
    section_key: str                # canonical section title, e.g. "Emergency Preparedness and Response"
    help_title: Optional[str] = None
    purpose: Optional[str] = None
    what_to_check: Optional[str] = None
    evidence_examples: Optional[str] = None
    sample_records: Optional[str] = None
    people_to_interview: Optional[str] = None
    areas_to_inspect: Optional[str] = None
    red_flags: Optional[str] = None
    wording_conformity: Optional[str] = None
    wording_nonconformity: Optional[str] = None
    related_clauses: Optional[str] = None
    related_registers: Optional[str] = None
    related_forms: Optional[str] = None
    admin_notes: Optional[str] = None
    show_in_reports: bool = False   # help is on-screen only unless admin enables


class TransitionItemIn(BaseModel):
    current_standard: str = ""
    new_standard: str = ""
    current_clause: Optional[str] = None
    new_clause: Optional[str] = None
    existing_process: Optional[str] = None
    gap_identified: Optional[str] = None
    risk_level: Optional[str] = "Medium"   # Low / Medium / High / Critical
    action_required: Optional[str] = None
    responsible_person: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = "Open"         # Open / In Progress / Closed
    evidence_of_closure: Optional[str] = None


# ── Reference / framework ────────────────────────────────────────────
@router.get("/framework")
async def get_framework(current_user=Depends(get_current_user)):
    return {
        "sections": IMS_FRAMEWORK_SECTIONS,
        "legacy_title_map": LEGACY_TITLE_MAP,
        "status_options": STATUS_OPTIONS,
        "sample_types": SAMPLE_TYPES,
    }


# ── Standards CRUD ───────────────────────────────────────────────────
@router.get("/standards")
async def list_standards(current_user=Depends(get_current_user)):
    items = await db[STANDARDS].find({}, {"_id": 0}).sort([("name", 1), ("version", 1)]).to_list(200)
    return {"items": items}


@router.post("/standards")
async def create_standard(payload: StandardIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now()})
    await db[STANDARDS].insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "created", "standard", doc["id"], new_value=f"{doc['name']}:{doc['version']}")
    return doc


@router.put("/standards/{sid}")
async def update_standard(sid: str, payload: StandardIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    old = await db[STANDARDS].find_one({"id": sid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[STANDARDS].update_one({"id": sid}, {"$set": upd})
    await log_trail(current_user, "edited", "standard", sid, old_value=old.get("status"), new_value=upd.get("status"))
    return await db[STANDARDS].find_one({"id": sid}, {"_id": 0})


@router.delete("/standards/{sid}")
async def delete_standard(sid: str, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    res = await db[STANDARDS].update_one({"id": sid}, {"$set": {"status": "Archived", "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_trail(current_user, "archived", "standard", sid)
    return {"success": True, "message": "Standard archived (not deleted)"}


# ── Clauses CRUD ─────────────────────────────────────────────────────
@router.get("/clauses")
async def list_clauses(standard_id: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"standard_id": standard_id} if standard_id else {}
    items = await db[CLAUSES].find(q, {"_id": 0}).to_list(2000)
    items.sort(key=lambda c: [int(p) if p.isdigit() else 0 for p in str(c.get("clause_number", "0")).split(".")])
    return {"items": items}


@router.post("/clauses")
async def create_clause(payload: ClauseIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now()})
    await db[CLAUSES].insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "created", "clause", doc["id"], new_value=doc["clause_number"])
    return doc


@router.put("/clauses/{cid}")
async def update_clause(cid: str, payload: ClauseIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    old = await db[CLAUSES].find_one({"id": cid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[CLAUSES].update_one({"id": cid}, {"$set": upd})
    await log_trail(current_user, "edited", "clause", cid, old_value=old.get("clause_title"), new_value=upd.get("clause_title"))
    return await db[CLAUSES].find_one({"id": cid}, {"_id": 0})


@router.delete("/clauses/{cid}")
async def delete_clause(cid: str, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    res = await db[CLAUSES].update_one({"id": cid}, {"$set": {"active": False, "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_trail(current_user, "deactivated", "clause", cid)
    return {"success": True}


# ── Clause Mappings CRUD ─────────────────────────────────────────────
@router.get("/mappings")
async def list_mappings(current_standard: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"current_standard": current_standard} if current_standard else {}
    items = await db[MAPPINGS].find(q, {"_id": 0}).to_list(2000)
    return {"items": items}


@router.post("/mappings")
async def create_mapping(payload: MappingIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now()})
    await db[MAPPINGS].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.put("/mappings/{mid}")
async def update_mapping(mid: str, payload: MappingIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    if not await db[MAPPINGS].find_one({"id": mid}):
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[MAPPINGS].update_one({"id": mid}, {"$set": upd})
    return await db[MAPPINGS].find_one({"id": mid}, {"_id": 0})


@router.delete("/mappings/{mid}")
async def delete_mapping(mid: str, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    res = await db[MAPPINGS].delete_one({"id": mid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}


# ── Help content CRUD + lookup ───────────────────────────────────────
@router.get("/help")
async def list_help(current_user=Depends(get_current_user)):
    items = await db[HELP].find({}, {"_id": 0}).sort("section_key", 1).to_list(500)
    return {"items": items}


@router.get("/help/lookup")
async def lookup_help(section: str, current_user=Depends(get_current_user)):
    """Find help for a section heading. Legacy audit headings map to new framework titles."""
    key = LEGACY_TITLE_MAP.get(section.strip(), section.strip())
    doc = await db[HELP].find_one({"section_key": key}, {"_id": 0})
    if not doc:
        # fuzzy: case-insensitive exact
        doc = await db[HELP].find_one({"section_key": {"$regex": f"^{key}$", "$options": "i"}}, {"_id": 0})
    return {"found": bool(doc), "mapped_key": key, "help": doc}


@router.put("/help")
async def upsert_help(payload: HelpIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    old = await db[HELP].find_one({"section_key": payload.section_key}, {"_id": 0})
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    doc["updated_by"] = current_user.get("username", "system")
    if old:
        await db[HELP].update_one({"section_key": payload.section_key}, {"$set": doc})
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = _now()
        await db[HELP].insert_one({**doc})
        doc.pop("_id", None)
    await log_trail(current_user, "help_text_edited", "help_content", payload.section_key,
                    old_value=(old or {}).get("purpose"), new_value=doc.get("purpose"))
    return await db[HELP].find_one({"section_key": payload.section_key}, {"_id": 0})


# ── Transition gap register ──────────────────────────────────────────
@router.get("/transition-items")
async def list_transition_items(status: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"status": status} if status else {}
    items = await db[TRANSITION].find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"items": items}


@router.post("/transition-items")
async def create_transition_item(payload: TransitionItemIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now(),
                "created_by": current_user.get("username", "system")})
    await db[TRANSITION].insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "created", "transition_item", doc["id"], new_value=doc.get("gap_identified"))
    return doc


@router.put("/transition-items/{tid}")
async def update_transition_item(tid: str, payload: TransitionItemIn, current_user=Depends(get_current_user)):
    old = await db[TRANSITION].find_one({"id": tid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[TRANSITION].update_one({"id": tid}, {"$set": upd})
    if old.get("status") != upd.get("status"):
        await log_trail(current_user, "status_changed", "transition_item", tid,
                        old_value=old.get("status"), new_value=upd.get("status"))
    return await db[TRANSITION].find_one({"id": tid}, {"_id": 0})


@router.delete("/transition-items/{tid}")
async def delete_transition_item(tid: str, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    res = await db[TRANSITION].delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}


@router.get("/transition-report")
async def transition_report(current_user=Depends(get_current_user)):
    items = await db[TRANSITION].find({}, {"_id": 0}).to_list(2000)
    mappings = await db[MAPPINGS].find({}, {"_id": 0}).to_list(2000)
    by_status = {}
    for it in items:
        by_status[it.get("status") or "Open"] = by_status.get(it.get("status") or "Open", 0) + 1
    total = len(items)
    closed = by_status.get("Closed", 0)
    return {
        "items": items, "mappings": mappings, "by_status": by_status,
        "total": total, "closed": closed,
        "progress_percent": round(closed / total * 100, 1) if total else 0,
    }


# ── Idempotent seed ──────────────────────────────────────────────────
async def ensure_seed():
    """Idempotent seed — safe to run on every startup (creates only what's missing)."""
    created = {"standards": 0, "clauses": 0, "mappings": 0, "help": 0}
    for s in SEED_STANDARDS:
        key = {"name": s["name"], "version": s["version"]}
        if not await db[STANDARDS].find_one(key):
            doc = {**s, "id": str(uuid.uuid4()), "effective_date": None,
                   "transition_deadline": None, "notes": s.get("notes"),
                   "created_at": _now(), "updated_at": _now()}
            await db[STANDARDS].insert_one(doc)
            created["standards"] += 1
            for c in default_clauses_for(s["name"], s["version"]):
                await db[CLAUSES].insert_one({**c, "id": str(uuid.uuid4()), "standard_id": doc["id"],
                                              "help_title": None, "help_text": None,
                                              "help_evidence_examples": None, "help_sample_wording": None,
                                              "created_at": _now(), "updated_at": _now()})
                created["clauses"] += 1
    for m in SEED_CLAUSE_MAPPINGS:
        key = {k: m[k] for k in ("current_standard", "current_clause", "new_standard", "new_clause")}
        if not await db[MAPPINGS].find_one(key):
            await db[MAPPINGS].insert_one({**m, "id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now()})
            created["mappings"] += 1
    for sec in IMS_FRAMEWORK_SECTIONS:
        if not await db[HELP].find_one({"section_key": sec["title"]}):
            h = {**sec["help"], "section_key": sec["title"], "id": str(uuid.uuid4()),
                 "show_in_reports": False, "created_at": _now(), "updated_at": _now()}
            await db[HELP].insert_one(h)
            created["help"] += 1
    return created


@router.post("/seed")
async def seed_library(current_user=Depends(get_current_user)):
    created = await ensure_seed()
    return {"success": True, "created": created}
