"""
OHS / Environmental Meeting Minutes (QMSF 25).

Stores monthly OHS/Environmental committee meeting minutes for Ultimate Laser.
Each meeting has:
  - a fixed (but editable) Objectives column on the left of the printed form,
  - attendees / apologies / next-meeting-date,
  - any number of "sections" (e.g. "Housekeeping Audit completed 2/10/2024",
    "HOUSEKEEPING AUDIT 16/1/2025"), each with a list of action items grouped
    by factory and each tracked with by-whom / by-when / completed status,
  - a `carryover_items` list — actions brought forward from the previous
    meeting that need to be reviewed at the next one (Done? Yes / No / Ongoing).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/ohs-meetings", tags=["OHS Meetings"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
COLLECTION = "ohs_meetings"
SETTINGS_COLL = "ohs_settings"
SETTINGS_DOC_ID = "default"

# Default Objectives list (left-most column on the printed form). Editable per
# meeting so wording can drift if the company updates its IMS objectives.
DEFAULT_OBJECTIVES: List[str] = [
    "Provide a Safe Work Environment",
    "Eliminate Hazards in the workplace",
    "Committed in achieving the highest safety standard",
    "Promote a Safety Structure",
    "Accidents / Injuries – Target Zero",
    "Practice and promote the conservation of resources to minimize wastes, improve processes and protect the environment",
    "Eliminate hazards",
    "Promote an Environmental culture",
    "Promote, consultation and communication",
    "Training",
    "Traffic Management",
]

DEFAULT_ATTENDEES = ["Bob", "Gabor", "John", "Sandun", "c.c.", "Peter"]

# Default locations (Factory / Building / Workstation list). Editable via the
# "Manage Locations" UI so each customer can configure their own areas.
DEFAULT_LOCATIONS: List[str] = [
    "Factory 1",
    "Factory 2",
    "Factory 3",
    "Factory 4 & 5",
    "Factory 6",
]


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


class OHSItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    factory: Optional[str] = ""           # "Factory 1" / "All Factories" / ""
    description: Optional[str] = ""
    action_by_whom: Optional[str] = ""
    action_when: Optional[str] = ""
    completed: Optional[str] = ""         # "Yes" | "No" | "Ongoing" | "N/A" | ""
    # Provenance for carry-overs
    source_meeting_id: Optional[str] = None
    source_meeting_date: Optional[str] = None
    source_section_title: Optional[str] = None


class OHSSection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = ""                        # e.g. "HOUSEKEEPING AUDIT 16/1/2025"
    items: List[OHSItem] = Field(default_factory=list)
    notes: Optional[str] = ""              # free-form (e.g. "No injuries reported")


class OHSMeetingIn(BaseModel):
    date: Optional[str] = ""
    company_name: Optional[str] = "ULTIMATE LASER PTY. LTD."
    attendees: List[str] = Field(default_factory=lambda: list(DEFAULT_ATTENDEES))
    apologies: Optional[str] = ""
    objectives: List[str] = Field(default_factory=lambda: list(DEFAULT_OBJECTIVES))
    carryover_items: List[OHSItem] = Field(default_factory=list)
    sections: List[OHSSection] = Field(default_factory=list)
    next_meeting: Optional[str] = "TBA"


@router.get("/defaults")
async def get_defaults(current_user=Depends(get_current_user)):
    locations = await _load_locations()
    return {
        "objectives": DEFAULT_OBJECTIVES,
        "attendees": DEFAULT_ATTENDEES,
        "locations": locations,
    }


async def _load_locations() -> List[str]:
    """Load the configured Factory/Location list (falls back to defaults)."""
    doc = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID})
    if doc and isinstance(doc.get("locations"), list) and doc["locations"]:
        return [str(x) for x in doc["locations"]]
    return list(DEFAULT_LOCATIONS)


class LocationsIn(BaseModel):
    locations: List[str]


@router.get("/locations")
async def get_locations(current_user=Depends(get_current_user)):
    return {"locations": await _load_locations()}


@router.put("/locations")
async def update_locations(payload: LocationsIn, current_user=Depends(get_current_user)):
    cleaned = [s.strip() for s in (payload.locations or []) if s and s.strip()]
    # de-dupe while preserving order
    seen, ordered = set(), []
    for v in cleaned:
        if v not in seen:
            seen.add(v)
            ordered.append(v)
    await db[SETTINGS_COLL].update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"locations": ordered, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"locations": ordered}


# ----- Quick-fill phrase library ------------------------------------------
# Common values for the per-item Description / Action by Whom / Action by When
# fields. Same model as Management Review phrases — auto-collected from past
# meetings + any phrases the user explicitly saves.
PHRASE_FIELDS = ("description", "action_by_whom", "action_when")


class OhsPhraseIn(BaseModel):
    field: str   # "description" | "action_by_whom" | "action_when"
    text: str


class OhsPhraseDelete(BaseModel):
    field: str
    text: str


@router.get("/phrases")
async def ohs_get_phrases(current_user=Depends(get_current_user)):
    counts: Dict[str, Dict[str, int]] = {f: {} for f in PHRASE_FIELDS}

    cursor = db[COLLECTION].find({}, {"_id": 0, "sections": 1, "carryover_items": 1})
    async for mtg in cursor:
        for sec in (mtg.get("sections") or []):
            for it in (sec.get("items") or []):
                for f in PHRASE_FIELDS:
                    v = (it.get(f) or "").strip()
                    if v:
                        counts[f][v] = counts[f].get(v, 0) + 1
        for it in (mtg.get("carryover_items") or []):
            for f in PHRASE_FIELDS:
                v = (it.get(f) or "").strip()
                if v:
                    counts[f][v] = counts[f].get(v, 0) + 1

    # Merge manually-saved entries (count = 0 so they sort after auto ones).
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID})
    manual = ((settings or {}).get("phrases") or {})
    for f in PHRASE_FIELDS:
        for t in manual.get(f) or []:
            t = (t or "").strip()
            if t and t not in counts[f]:
                counts[f][t] = 0

    out = {
        f: [
            {"text": t, "count": c}
            for t, c in sorted(counts[f].items(), key=lambda kv: (-kv[1], kv[0].lower()))
        ]
        for f in PHRASE_FIELDS
    }
    return {"phrases": out}


@router.post("/phrases")
async def ohs_add_phrase(payload: OhsPhraseIn, current_user=Depends(get_current_user)):
    if payload.field not in PHRASE_FIELDS:
        raise HTTPException(status_code=400, detail="invalid field")
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID}) or {}
    phrases = settings.get("phrases") or {}
    cur = list(phrases.get(payload.field) or [])
    if text not in cur:
        cur.append(text)
        phrases[payload.field] = cur
    await db[SETTINGS_COLL].update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"phrases": phrases, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "phrases": cur}


@router.post("/phrases/delete")
async def ohs_delete_phrase(payload: OhsPhraseDelete, current_user=Depends(get_current_user)):
    if payload.field not in PHRASE_FIELDS:
        raise HTTPException(status_code=400, detail="invalid field")
    settings = await db[SETTINGS_COLL].find_one({"_id": SETTINGS_DOC_ID}) or {}
    phrases = settings.get("phrases") or {}
    cur = [p for p in (phrases.get(payload.field) or []) if p != payload.text]
    phrases[payload.field] = cur
    await db[SETTINGS_COLL].update_one(
        {"_id": SETTINGS_DOC_ID}, {"$set": {"phrases": phrases}}, upsert=True
    )
    return {"ok": True, "phrases": cur}


@router.get("")
async def list_meetings(current_user=Depends(get_current_user)):
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(length=None)
    return items


@router.get("/carryover-suggestions")
async def carryover_suggestions(current_user=Depends(get_current_user)):
    """Return open action items from the most recent meeting plus any
    previously-carried items that are still not done."""
    last = await db[COLLECTION].find({}, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).limit(1).to_list(length=1)
    if not last:
        return {"items": [], "source_meeting": None}
    src = last[0]
    suggestions: List[dict] = []

    def _open(status: str) -> bool:
        return (status or "").strip().lower() not in ("yes", "n/a", "closed", "done")

    # Items inside sections
    for sec in (src.get("sections") or []):
        for it in (sec.get("items") or []):
            if not _open(it.get("completed", "")):
                continue
            if not any([it.get("description"), it.get("action_by_whom"), it.get("action_when")]):
                continue
            suggestions.append({
                "id": str(uuid.uuid4()),
                "factory": it.get("factory") or "",
                "description": it.get("description") or "",
                "action_by_whom": it.get("action_by_whom") or "",
                "action_when": it.get("action_when") or "",
                "completed": "",  # to be set at THIS meeting
                "source_meeting_id": src.get("id"),
                "source_meeting_date": src.get("date"),
                "source_section_title": sec.get("title"),
            })

    # Previously-carried items that are still open
    for it in (src.get("carryover_items") or []):
        if not _open(it.get("completed", "")):
            continue
        suggestions.append({
            "id": str(uuid.uuid4()),
            "factory": it.get("factory") or "",
            "description": it.get("description") or "",
            "action_by_whom": it.get("action_by_whom") or "",
            "action_when": it.get("action_when") or "",
            "completed": "",
            "source_meeting_id": it.get("source_meeting_id") or src.get("id"),
            "source_meeting_date": it.get("source_meeting_date") or src.get("date"),
            "source_section_title": it.get("source_section_title"),
        })

    return {
        "items": suggestions,
        "source_meeting": {"id": src.get("id"), "date": src.get("date")},
    }


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    doc = await db[COLLECTION].find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return doc


@router.post("")
async def create_meeting(payload: OHSMeetingIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": _user_label(current_user),
    })
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{meeting_id}")
async def update_meeting(meeting_id: str, payload: OHSMeetingIn, current_user=Depends(get_current_user)):
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
