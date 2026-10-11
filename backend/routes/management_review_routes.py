"""
Management Review Meetings (QMSF 05).

Stores ISO 9001/14001/45001 Management Review meeting minutes. Each meeting has
14 standard agenda items with minutes, action owners, due dates and completion
status. The "carryover_items" list captures actions from prior meetings that
were not marked Completed=Yes so they can be reviewed at the next meeting.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/management-review", tags=["Management Review"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
COLLECTION = "management_review_meetings"
SETTINGS_COLL = "management_review_settings"
SETTINGS_DOC_ID = "default"

# Standard 14-item agenda (Ultimate Laser QMSF 05). The list is fixed and
# returned to the frontend so wording stays consistent across meetings.
STANDARD_AGENDA = [
    "Review actions from previous Management Review.",
    "Review the Non-conformance Reports (NCR's) raised since last meeting and status of outstanding NCR's.",
    "Review customer satisfaction & dissatisfaction and effectiveness of the Integrated Management System (IMS) in general, including any changes affecting the IMS.",
    "Review organization goals/objectives and preventive action issues i.e., review Business/Process Plans/Cont. Improvement.",
    "Review internal and external audit results including characteristics/trends of processes and products and any resulting opportunities for preventive action.",
    "Review the conformity to product requirements.",
    "Review training needs and resource issues.",
    "Are organization structure, authorities and responsibilities current and stable?",
    "Is there effectiveness of internal communications between various levels of the organization?",
    "Review suppliers quality performance, are there any problems with them?",
    "Are there any Occupational Health and Safety issues?",
    "Are there any environmental and community issues?",
    "Review changing circumstances, including developments in legal and other requirements related to the QMS/EMS and OHS.",
    "Review Risks and Opportunities.",
]


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class ActionDetail(BaseModel):
    minutes: Optional[str] = ""
    action_by_whom: Optional[str] = ""
    action_when: Optional[str] = ""
    completed: Optional[str] = ""        # "Yes" | "No" | "Ongoing" | "N/A" | ""


class AgendaRow(BaseModel):
    agenda_no: int                       # 1-14
    agenda_text: Optional[str] = ""      # snapshot of agenda wording at time of meeting
    # New: multiple action lines per agenda item. Each line tracks its own
    # owner, due date and completion status so a single agenda topic can have
    # several follow-ups (e.g. "Audit complete = Yes" + "Next audit due Sep").
    actions: List[ActionDetail] = Field(default_factory=lambda: [ActionDetail()])
    # Legacy single-line fields (kept for backwards-compat with old records).
    minutes: Optional[str] = ""
    action_by_whom: Optional[str] = ""
    action_when: Optional[str] = ""
    completed: Optional[str] = ""


class CarryoverItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""                # editable summary of what was outstanding
    action_by_whom: Optional[str] = ""
    action_when: Optional[str] = ""
    completed: Optional[str] = ""        # current status at THIS meeting
    source_meeting_id: Optional[str] = None
    source_meeting_date: Optional[str] = None
    source_agenda_no: Optional[int] = None


class ManagementReviewIn(BaseModel):
    date: Optional[str] = ""
    attendees: Optional[str] = ""
    apologies: Optional[str] = ""
    company_name: Optional[str] = "ULTIMATE LASER PTY.LTD."
    agenda_rows: List[AgendaRow] = Field(default_factory=list)
    carryover_items: List[CarryoverItem] = Field(default_factory=list)
    next_meeting: Optional[str] = "TBA"


@router.get("/agenda-template")
async def get_agenda_template(current_user=Depends(get_current_user)):
    """Return the agenda used to seed new meetings (custom if saved, else standard)."""
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID})
    custom = (settings or {}).get("agenda")
    return {"agenda": custom or STANDARD_AGENDA, "is_custom": bool(custom), "default_agenda": STANDARD_AGENDA}


class AgendaTemplateIn(BaseModel):
    agenda: List[str]


@router.put("/agenda-template")
async def update_agenda_template(payload: AgendaTemplateIn, current_user=Depends(get_current_user)):
    items = [(t or "").strip() for t in payload.agenda if (t or "").strip()]
    if not items:
        raise HTTPException(status_code=400, detail="Agenda must contain at least one item")
    await db[SETTINGS_COLL].update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {
            "agenda": items,
            "agenda_updated_at": datetime.now(timezone.utc).isoformat(),
            "agenda_updated_by": _user_label(current_user),
        }},
        upsert=True,
    )
    return {"agenda": items, "is_custom": True}


@router.delete("/agenda-template")
async def reset_agenda_template(current_user=Depends(get_current_user)):
    await db[SETTINGS_COLL].update_one({"_id": SETTINGS_DOC_ID}, {"$unset": {"agenda": ""}})
    return {"agenda": STANDARD_AGENDA, "is_custom": False}


@router.get("")
async def list_meetings(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(length=None)
    return items


@router.get("/carryover-suggestions")
async def carryover_suggestions(current_user=Depends(get_current_user)):
    """Return outstanding actions (completed != 'Yes') from the most recent meeting.
    Used when creating a new meeting so prior unfinished work auto-loads.
    """
    last = await db[COLLECTION].find({}, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).limit(1).to_list(length=1)
    if not last:
        return {"items": [], "source_meeting": None}
    src = last[0]
    suggestions: List[dict] = []

    # 1) Outstanding rows from main agenda table — iterate over each action.
    for row in (src.get("agenda_rows") or []):
        # Support both new (`actions: [...]`) and legacy (`minutes`/etc. on row)
        actions = row.get("actions") or [{
            "minutes": row.get("minutes") or "",
            "action_by_whom": row.get("action_by_whom") or "",
            "action_when": row.get("action_when") or "",
            "completed": row.get("completed") or "",
        }]
        for action in actions:
            completed = (action.get("completed") or "").strip().lower()
            if completed in ("yes", "n/a"):
                continue
            if not any([action.get("minutes"), action.get("action_by_whom"), action.get("action_when")]):
                continue  # blank action — nothing to carry
            suggestions.append({
                "id": str(uuid.uuid4()),
                "description": f"(Agenda #{row.get('agenda_no')}) {(action.get('minutes') or '')[:300]}",
                "action_by_whom": action.get("action_by_whom") or "",
                "action_when": action.get("action_when") or "",
                "completed": "",
                "source_meeting_id": src.get("id"),
                "source_meeting_date": src.get("date"),
                "source_agenda_no": row.get("agenda_no"),
            })

    # 2) Carryover items from the previous meeting that are still not done
    for item in (src.get("carryover_items") or []):
        if (item.get("completed") or "").strip().lower() in ("yes", "n/a"):
            continue
        suggestions.append({
            "id": str(uuid.uuid4()),
            "description": item.get("description") or "",
            "action_by_whom": item.get("action_by_whom") or "",
            "action_when": item.get("action_when") or "",
            "completed": "",
            "source_meeting_id": item.get("source_meeting_id") or src.get("id"),
            "source_meeting_date": item.get("source_meeting_date") or src.get("date"),
            "source_agenda_no": item.get("source_agenda_no"),
        })

    return {
        "items": suggestions,
        "source_meeting": {"id": src.get("id"), "date": src.get("date")},
    }


@router.get("/phrases")
async def get_phrases(current_user=Depends(get_current_user)):
    """Quick-fill phrase library, keyed by agenda_no.

    Auto-collects every distinct `minutes` value previously used in saved
    meetings (most common first) plus any phrases the user manually added via
    `POST /phrases`. The frontend renders this as a dropdown above each
    Minutes textarea so common boilerplate (e.g. "No new risks or
    opportunities") can be picked with one click.
    """
    by_agenda: Dict[str, List[Dict[str, Any]]] = {}

    pipeline = [
        {"$unwind": "$agenda_rows"},
        {"$unwind": "$agenda_rows.actions"},
        {"$match": {"agenda_rows.actions.minutes": {"$nin": ["", None]}}},
        {"$group": {
            "_id": {
                "agenda_no": "$agenda_rows.agenda_no",
                "minutes": "$agenda_rows.actions.minutes",
            },
            "count": {"$sum": 1},
        }},
    ]
    async for row in db[COLLECTION].aggregate(pipeline):
        ag = row["_id"].get("agenda_no")
        text = (row["_id"].get("minutes") or "").strip()
        if ag is None or not text:
            continue
        by_agenda.setdefault(str(ag), []).append({"text": text, "count": row["count"]})

    # Manual additions stored in settings collection.
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID})
    manual = ((settings or {}).get("phrases") or {})
    for ag, items in manual.items():
        existing_texts = {p["text"] for p in by_agenda.get(str(ag), [])}
        for t in items or []:
            t = (t or "").strip()
            if t and t not in existing_texts:
                by_agenda.setdefault(str(ag), []).append({"text": t, "count": 0})

    for ag in by_agenda:
        by_agenda[ag].sort(key=lambda x: (-x.get("count", 0), x["text"].lower()))

    return {"phrases": by_agenda}


class PhrasePayload(BaseModel):
    agenda_no: int
    text: str


@router.post("/phrases")
async def add_phrase(payload: PhrasePayload, current_user=Depends(get_current_user)):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID}) or {}
    phrases = settings.get("phrases") or {}
    key = str(payload.agenda_no)
    existing = list(phrases.get(key) or [])
    if text not in existing:
        existing.append(text)
        phrases[key] = existing
    await db[SETTINGS_COLL].update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"phrases": phrases, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "phrases": existing}


class DeletePhrasePayload(BaseModel):
    agenda_no: int
    text: str


@router.post("/phrases/delete")
async def delete_phrase(payload: DeletePhrasePayload, current_user=Depends(get_current_user)):
    """Remove a manually-saved phrase. Auto-collected phrases (from past
    meetings) cannot be deleted from here — edit the source meeting instead."""
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID}) or {}
    phrases = settings.get("phrases") or {}
    key = str(payload.agenda_no)
    cur = list(phrases.get(key) or [])
    new = [p for p in cur if p != payload.text]
    phrases[key] = new
    await db[SETTINGS_COLL].update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"phrases": phrases}},
        upsert=True,
    )
    return {"ok": True, "phrases": new}


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    doc = await db[COLLECTION].find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return doc


@router.post("")
async def create_meeting(payload: ManagementReviewIn, current_user=Depends(get_current_user)):
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID})
    agenda = (settings or {}).get("agenda") or STANDARD_AGENDA
    # If the caller didn't pre-seed agenda_rows, seed from the current agenda template.
    rows = payload.agenda_rows or [
        AgendaRow(agenda_no=i + 1, agenda_text=t) for i, t in enumerate(agenda)
    ]
    doc = payload.model_dump()
    doc["agenda_rows"] = [r.model_dump() if hasattr(r, "model_dump") else r for r in rows]
    # Snapshot agenda wording so later template edits never rewrite past minutes.
    for r in doc["agenda_rows"]:
        if not r.get("agenda_text"):
            idx = (r.get("agenda_no") or 0) - 1
            r["agenda_text"] = agenda[idx] if 0 <= idx < len(agenda) else ""
    doc.update({
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": _user_label(current_user),
    })
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{meeting_id}")
async def update_meeting(meeting_id: str, payload: ManagementReviewIn, current_user=Depends(get_current_user)):
    update = payload.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = _user_label(current_user)
    res = await db[COLLECTION].update_one({"id": meeting_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    doc = await db[COLLECTION].find_one({"id": meeting_id}, {"_id": 0})
    return doc


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    res = await db[COLLECTION].delete_one({"id": meeting_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"success": True}
