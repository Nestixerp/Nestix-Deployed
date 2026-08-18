"""Audit Templates — create audits from configurable templates.

  GET/POST/PUT/DELETE /api/audit-templates
  POST /api/audit-templates/{id}/create-audit   → creates audit_report + section findings
  POST /api/audit-templates/seed                → idempotent seed of the 14 standard templates
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user
from services.audit_trail import log_trail
from services.ims_framework_seed import IMS_FRAMEWORK_SECTIONS, TEMPLATE_DEFS

router = APIRouter(prefix="/api/audit-templates", tags=["Audit Templates"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "audit_templates"

_SECTIONS_BY_NUM = {s["number"]: s for s in IMS_FRAMEWORK_SECTIONS}


def _now():
    return datetime.now(timezone.utc).isoformat()


class TemplateSection(BaseModel):
    number: str = ""
    title: str = ""
    clause_refs: Optional[str] = None
    audit_prompt: Optional[str] = None
    evidence_requirements: Optional[str] = None
    mandatory: bool = True


class TemplateIn(BaseModel):
    name: str
    template_type: str = "Full IMS Internal Audit"
    description: Optional[str] = None
    standards: List[str] = []
    sections: List[TemplateSection] = []
    active: bool = True


class CreateAuditIn(BaseModel):
    auditor_name: str
    client_name: str = "Ultimate Laser Pty Ltd"
    assessed_sites: str = "36-40 Micro Circuit, Dandenong South, VIC 3175"
    scope_of_audit: Optional[str] = None
    exclusions: Optional[str] = None
    audit_start_date: Optional[str] = None
    audit_end_date: Optional[str] = None


def _expand_section(num: str) -> Dict[str, Any]:
    sec = _SECTIONS_BY_NUM[num]
    return {
        "number": num, "title": sec["title"], "clause_refs": sec.get("clause_refs") or "",
        "audit_prompt": sec["help"].get("what_to_check") or "",
        "evidence_requirements": sec["help"].get("evidence_examples") or "",
        "mandatory": True,
    }


@router.get("")
async def list_templates(current_user=Depends(get_current_user)):
    items = await db[COL].find({"active": {"$ne": False}}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"items": items}


@router.post("")
async def create_template(payload: TemplateIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now(),
                "created_by": current_user.get("username", "system")})
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "created", "template", doc["id"], new_value=doc["name"])
    return doc


@router.put("/{tid}")
async def update_template(tid: str, payload: TemplateIn, current_user=Depends(get_current_user)):
    old = await db[COL].find_one({"id": tid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": tid}, {"$set": upd})
    await log_trail(current_user, "template_edited", "template", tid, old_value=old.get("name"), new_value=upd.get("name"))
    return await db[COL].find_one({"id": tid}, {"_id": 0})


@router.delete("/{tid}")
async def delete_template(tid: str, current_user=Depends(get_current_user)):
    res = await db[COL].update_one({"id": tid}, {"$set": {"active": False, "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}


@router.post("/{tid}/create-audit")
async def create_audit_from_template(tid: str, payload: CreateAuditIn, current_user=Depends(get_current_user)):
    tpl = await db[COL].find_one({"id": tid}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "Template not found")

    # Next report number: AR-YYYY-nnn
    year = datetime.now(timezone.utc).year
    count = await db.audit_reports.count_documents({}) + 1
    report_number = f"AR-{year}-{count:03d}"

    now = datetime.now(timezone.utc)
    audit = {
        "id": str(now.timestamp()).replace(".", ""),
        "report_number": report_number,
        "auditor_name": payload.auditor_name,
        "report_date": now,
        "report_type": f"{tpl['name'].upper()} — {' / '.join(tpl.get('standards') or [])}",
        "client_name": payload.client_name,
        "assessed_sites": payload.assessed_sites,
        "standards_audited": tpl.get("standards") or [],
        "scope_of_audit": payload.scope_of_audit or tpl.get("description") or tpl["name"],
        "exclusions": payload.exclusions,
        "conclusion": None,
        "overall_recommendation": None,
        "audit_start_date": now,
        "audit_end_date": None,
        "template_id": tid,
        "template_name": tpl["name"],
        "locked": False,
        "created_by": current_user.get("username", "system"),
        "created_at": now,
        "updated_at": now,
    }
    await db.audit_reports.insert_one({**audit})
    audit.pop("_id", None)

    # One finding row per template section
    for i, sec in enumerate(tpl.get("sections") or [], start=1):
        finding = {
            "id": str(uuid.uuid4()),
            "report_id": audit["id"],
            "clause_number": sec.get("number") or str(i),
            "clause_title": sec.get("title") or "",
            "iso_clause_reference": sec.get("clause_refs") or "",
            "audit_prompt": sec.get("audit_prompt") or "",
            "evidence_requirements": sec.get("evidence_requirements") or "",
            "evidence": "",
            "findings": "",
            "finding_type": "Conformity",
            "status": "Not Started",
            "risk_rating": None,
            "mandatory": sec.get("mandatory", True),
            "is_follow_up_required": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.audit_findings.insert_one({**finding})

    await log_trail(current_user, "created", "audit", audit["id"],
                    new_value=f"{report_number} from template {tpl['name']}")
    return {"success": True, "audit_id": audit["id"], "report_number": report_number}


async def ensure_seed():
    """Idempotent template seed — safe on every startup."""
    created = 0
    for t in TEMPLATE_DEFS:
        if await db[COL].find_one({"name": t["name"]}):
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "name": t["name"],
            "template_type": t["template_type"],
            "description": f"{t['name']} — {' / '.join(t['standards'])}",
            "standards": t["standards"],
            "sections": [_expand_section(n) for n in t["sections"]],
            "active": True,
            "created_at": _now(), "updated_at": _now(), "created_by": "seed",
        }
        await db[COL].insert_one(doc)
        created += 1
    return created


@router.post("/seed")
async def seed_templates(current_user=Depends(get_current_user)):
    created = await ensure_seed()
    return {"success": True, "created": created}
