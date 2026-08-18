"""
Legal Requirements (Compliance Register) Routes
Manage Acts, Regulations, Standards, and Codes of Practice with AI-powered version checking.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import json
import re
import asyncio
import logging

from auth import get_current_user
from models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/legal-requirements", tags=["Legal Requirements"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "legal_requirements"


def _user_label(user) -> str:
    """Extract a human-readable label from JWT payload (dict) or User model."""
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or user.get("name") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or getattr(user, "name", None) or "system"


# ==================== MODELS ====================

class LegalRequirementBase(BaseModel):
    name: str
    category: str  # e.g. "Victorian Legislation", "Victorian Codes of Practice", "Industry Standards"
    subcategory: Optional[str] = ""  # e.g. "Victorian Compliance Codes", "OHS Acts and Regulations", "Environmental Policies"
    year: Optional[str] = ""  # Free text e.g. "2004", "2017"
    last_review_date: Optional[str] = ""  # ISO date string
    responsible_person: Optional[str] = ""
    notes: Optional[str] = ""
    # AI check fields
    ai_status: Optional[str] = ""  # "current", "outdated", "unknown"
    ai_latest_version: Optional[str] = ""
    ai_summary: Optional[str] = ""
    ai_sources: Optional[List[str]] = []
    ai_checked_at: Optional[str] = ""


class LegalRequirementCreate(LegalRequirementBase):
    pass


class LegalRequirementUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    year: Optional[str] = None
    last_review_date: Optional[str] = None
    responsible_person: Optional[str] = None
    notes: Optional[str] = None


class LegalRequirement(LegalRequirementBase):
    id: str
    created_at: str
    updated_at: str


# ==================== CRUD ROUTES ====================

@router.get("")
async def list_legal_requirements(current_user: User = Depends(get_current_user)):
    """List all legal requirements grouped under their category."""
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("category", 1), ("subcategory", 1), ("name", 1)]).to_list(length=None)
    return items


@router.post("")
async def create_legal_requirement(
    payload: LegalRequirementCreate,
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now
    doc["updated_at"] = now
    doc["change_history"] = [{
        "id": str(uuid.uuid4()),
        "at": now,
        "by": _user_label(current_user),
        "action": "created",
        "snapshot": {
            "name": doc.get("name", ""),
            "category": doc.get("category", ""),
            "year": doc.get("year", ""),
        }
    }]
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{req_id}")
async def get_legal_requirement(req_id: str, current_user: User = Depends(get_current_user)):
    item = await db[COLLECTION].find_one({"id": req_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Legal requirement not found")
    return item


@router.put("/{req_id}")
async def update_legal_requirement(
    req_id: str,
    payload: LegalRequirementUpdate,
    current_user: User = Depends(get_current_user)
):
    existing = await db[COLLECTION].find_one({"id": req_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Legal requirement not found")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    now_iso = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now_iso

    # Build a diff of changed fields for the audit trail
    changes = {}
    for k, new_val in update_data.items():
        if k == "updated_at":
            continue
        old_val = existing.get(k, "")
        if (old_val or "") != (new_val or ""):
            changes[k] = {"from": old_val, "to": new_val}

    push_op = {}
    if changes:
        history_entry = {
            "id": str(uuid.uuid4()),
            "at": now_iso,
            "by": _user_label(current_user),
            "action": "manual_edit",
            "changes": changes,
        }
        push_op = {"change_history": history_entry}

    mongo_update = {"$set": update_data}
    if push_op:
        mongo_update["$push"] = push_op
    await db[COLLECTION].update_one({"id": req_id}, mongo_update)
    item = await db[COLLECTION].find_one({"id": req_id}, {"_id": 0})
    return item


@router.delete("/{req_id}")
async def delete_legal_requirement(req_id: str, current_user: User = Depends(get_current_user)):
    result = await db[COLLECTION].delete_one({"id": req_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Legal requirement not found")
    return {"success": True}


# ==================== AI CHECK ====================

def _build_check_prompt(name: str, current_year: str, category: str = "") -> str:
    return (
        f"You are a legal compliance assistant for an Australian (Victoria) manufacturing business. "
        f"Determine whether the following legislation/standard is the latest version, or whether it has been amended, repealed or superseded.\n\n"
        f"Item to check:\n"
        f"  Name: {name}\n"
        f"  Year/Version on file: {current_year or 'unspecified'}\n"
        f"  Category: {category or 'unspecified'}\n\n"
        f"Use your most recent knowledge of Australian Commonwealth and Victorian legislation, codes of practice, and standards (Standards Australia, EPA, WorkSafe Victoria). "
        f"Note: your knowledge may have a cutoff and recent amendments may not be captured. Be honest about uncertainty.\n\n"
        f"Respond ONLY with a single JSON object (no markdown fences, no commentary) using exactly these keys:\n"
        f"{{\n"
        f'  "is_current": boolean,                // true if the on-file version appears to still be the latest\n'
        f'  "latest_version": "string",           // e.g. "2024" or "Act 2004 (current as at 1 July 2024)"\n'
        f'  "last_amended_date": "string",        // most recent amendment date if known, else ""\n'
        f'  "summary": "string",                  // 1-3 sentence plain-English explanation of status and any key amendments\n'
        f'  "confidence": "high|medium|low",      // your confidence in this assessment\n'
        f'  "source_urls": ["string", ...]        // 1-3 official source URLs (legislation.vic.gov.au, legislation.gov.au, worksafe.vic.gov.au, epa.vic.gov.au, standards.org.au) where the user can verify\n'
        f"}}\n"
        f"Important: If you are not confident or the item is ambiguous, set is_current=false, confidence=\"low\", and explain what should be verified manually."
    )


async def _ai_check_single(name: str, year: str, category: str = "") -> Dict[str, Any]:
    """Call Gemini to check if a legal requirement is current."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return {
            "is_current": False,
            "latest_version": "",
            "last_amended_date": "",
            "summary": "AI key not configured. Please contact administrator.",
            "confidence": "low",
            "source_urls": [],
            "error": "no_api_key"
        }

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=api_key,
            session_id=f"legal-check-{uuid.uuid4()}",
            system_message="You are a legal compliance assistant. You return strict JSON only."
        ).with_model("gemini", "gemini-2.5-pro")

        prompt = _build_check_prompt(name, year, category)
        msg = UserMessage(text=prompt)
        response_text = await chat.send_message(msg)

        # Strip code fences if model returned them
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```\s*$", "", cleaned)

        # Extract first JSON object
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            cleaned = m.group(0)

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return {
                "is_current": False,
                "latest_version": "",
                "last_amended_date": "",
                "summary": f"AI response could not be parsed. Raw: {response_text[:300]}",
                "confidence": "low",
                "source_urls": [],
                "error": "parse_error"
            }

        # Sanitise
        return {
            "is_current": bool(parsed.get("is_current", False)),
            "latest_version": str(parsed.get("latest_version", ""))[:300],
            "last_amended_date": str(parsed.get("last_amended_date", ""))[:100],
            "summary": str(parsed.get("summary", ""))[:1500],
            "confidence": str(parsed.get("confidence", "low"))[:20],
            "source_urls": [str(u)[:500] for u in (parsed.get("source_urls") or [])][:5],
        }
    except Exception as e:
        logger.exception("AI legal check failed")
        return {
            "is_current": False,
            "latest_version": "",
            "last_amended_date": "",
            "summary": f"AI check failed: {str(e)[:200]}",
            "confidence": "low",
            "source_urls": [],
            "error": "ai_error"
        }


@router.post("/{req_id}/ai-check")
async def ai_check_single(req_id: str, current_user: User = Depends(get_current_user)):
    """Use AI to check if a single legal requirement is the current version. Auto-applies any newer year detected and logs the change."""
    item = await db[COLLECTION].find_one({"id": req_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Legal requirement not found")

    result = await _ai_check_single(
        name=item.get("name", ""),
        year=item.get("year", ""),
        category=item.get("category", "")
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "ai_status": "current" if result.get("is_current") else "outdated",
        "ai_latest_version": result.get("latest_version", ""),
        "ai_summary": result.get("summary", ""),
        "ai_sources": result.get("source_urls", []),
        "ai_last_amended_date": result.get("last_amended_date", ""),
        "ai_confidence": result.get("confidence", "low"),
        "ai_checked_at": now_iso,
        "updated_at": now_iso,
    }

    # Auto-apply newer year if AI confidently identifies one and it's different
    auto_updated = False
    old_year = item.get("year", "") or ""
    new_year = _extract_year(result.get("latest_version", ""))
    confidence = (result.get("confidence") or "low").lower()
    if (new_year
            and new_year != old_year
            and not result.get("is_current")
            and confidence in ("high", "medium")):
        update["year"] = new_year
        update["ai_status"] = "current"  # year now matches latest
        auto_updated = True

    # Append audit log entry
    history_entry = {
        "id": str(uuid.uuid4()),
        "at": now_iso,
        "by": _user_label(current_user),
        "action": "ai_auto_update" if auto_updated else "ai_check",
        "old_year": old_year,
        "new_year": update.get("year", old_year),
        "ai_latest_version": result.get("latest_version", ""),
        "ai_summary": result.get("summary", ""),
        "ai_confidence": confidence,
        "ai_sources": result.get("source_urls", []),
    }

    await db[COLLECTION].update_one(
        {"id": req_id},
        {"$set": update, "$push": {"change_history": history_entry}}
    )

    return {**result, "ai_checked_at": now_iso, "id": req_id, "auto_updated": auto_updated, "old_year": old_year, "new_year": update.get("year", old_year)}


def _extract_year(text: str) -> str:
    """Extract a 4-digit year (1900-2099) from arbitrary text."""
    if not text:
        return ""
    m = re.search(r"\b(19|20)\d{2}\b", text)
    return m.group(0) if m else ""


class AcceptUpdatePayload(BaseModel):
    new_year: str


@router.post("/{req_id}/accept-ai-update")
async def accept_ai_update(
    req_id: str,
    payload: AcceptUpdatePayload,
    current_user: User = Depends(get_current_user)
):
    """One-click apply AI's suggested latest year/version to the record (manually triggered)."""
    item = await db[COLLECTION].find_one({"id": req_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Legal requirement not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    old_year = item.get("year", "") or ""
    update = {
        "year": payload.new_year,
        "ai_status": "current",
        "updated_at": now_iso,
    }
    history_entry = {
        "id": str(uuid.uuid4()),
        "at": now_iso,
        "by": _user_label(current_user),
        "action": "manual_accept_ai_update",
        "old_year": old_year,
        "new_year": payload.new_year,
        "ai_latest_version": item.get("ai_latest_version", ""),
        "ai_summary": item.get("ai_summary", ""),
        "ai_confidence": item.get("ai_confidence", ""),
        "ai_sources": item.get("ai_sources", []),
    }
    await db[COLLECTION].update_one(
        {"id": req_id},
        {"$set": update, "$push": {"change_history": history_entry}}
    )
    item = await db[COLLECTION].find_one({"id": req_id}, {"_id": 0})
    return item


@router.post("/ai-check-all")
async def ai_check_all(current_user: User = Depends(get_current_user)):
    """Run AI check across every legal requirement (sequential, capped concurrency)."""
    items = await db[COLLECTION].find({}, {"_id": 0}).to_list(length=None)
    if not items:
        return {"results": [], "checked_count": 0}

    sem = asyncio.Semaphore(3)  # cap to 3 concurrent calls

    async def check_one(it):
        async with sem:
            res = await _ai_check_single(
                name=it.get("name", ""),
                year=it.get("year", ""),
                category=it.get("category", "")
            )
            now_iso = datetime.now(timezone.utc).isoformat()
            old_year = it.get("year", "") or ""
            new_year = _extract_year(res.get("latest_version", ""))
            confidence = (res.get("confidence") or "low").lower()
            auto_updated = (
                bool(new_year)
                and new_year != old_year
                and not res.get("is_current")
                and confidence in ("high", "medium")
            )
            update = {
                "ai_status": "current" if (res.get("is_current") or auto_updated) else "outdated",
                "ai_latest_version": res.get("latest_version", ""),
                "ai_summary": res.get("summary", ""),
                "ai_sources": res.get("source_urls", []),
                "ai_last_amended_date": res.get("last_amended_date", ""),
                "ai_confidence": confidence,
                "ai_checked_at": now_iso,
                "updated_at": now_iso,
            }
            if auto_updated:
                update["year"] = new_year

            history_entry = {
                "id": str(uuid.uuid4()),
                "at": now_iso,
                "by": _user_label(current_user),
                "action": "ai_auto_update" if auto_updated else "ai_check",
                "old_year": old_year,
                "new_year": update.get("year", old_year),
                "ai_latest_version": res.get("latest_version", ""),
                "ai_summary": res.get("summary", ""),
                "ai_confidence": confidence,
                "ai_sources": res.get("source_urls", []),
            }
            await db[COLLECTION].update_one(
                {"id": it["id"]},
                {"$set": update, "$push": {"change_history": history_entry}}
            )
            return {"id": it["id"], "name": it.get("name", ""), **res, "ai_checked_at": now_iso, "auto_updated": auto_updated, "old_year": old_year, "new_year": update.get("year", old_year)}

    results = await asyncio.gather(*[check_one(it) for it in items])
    return {"results": results, "checked_count": len(results)}
