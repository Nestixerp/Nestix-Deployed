"""
Outstanding Actions — unified action register.

Aggregates open / in-progress actions across:
  - Management Review meetings (agenda actions + carry-over items)
  - ISO Audit follow-up items
  - Injury Register entries flagged for follow-up

Returned as a flat list, sorted by due-date soonest-first (records with no
due date fall to the bottom). Used by the Dashboard "Outstanding Actions"
widget so management has a single place to track work before the next audit.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re

from auth import get_current_user

router = APIRouter(prefix="/api/outstanding-actions", tags=["Outstanding Actions"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# --- date parsing -----------------------------------------------------------

_MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6, 'july': 7,
    'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
}


def parse_due_date(raw) -> Optional[str]:
    """Best-effort coerce a due-date string (free-form) to YYYY-MM-DD for sorting.

    Accepts: ISO datetimes, '2024-10-15', '15/10/2024', 'Oct 2024', 'September 2025',
    'TBA', etc. Returns None when nothing usable could be parsed.
    """
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date().isoformat()
    s = str(raw).strip()
    if not s or s.lower() in ('tba', 'tbd', 'n/a'):
        return None
    # ISO YYYY-MM-DD
    m = re.match(r'^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3) or 1)
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None
    # DD/MM/YYYY or D/M/YYYY
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})', s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None
    # "October 2024" / "Oct 2024"
    m = re.match(r'^([A-Za-z]+)\s+(\d{4})', s)
    if m and m.group(1).lower() in _MONTHS:
        try:
            return date(int(m.group(2)), _MONTHS[m.group(1).lower()], 1).isoformat()
        except ValueError:
            return None
    return None


def _is_open(status: str) -> bool:
    """True if a status string represents an action that still needs work."""
    s = (status or '').strip().lower()
    return s not in ('yes', 'n/a', 'closed', 'done', 'complete', 'completed')


@router.get("")
async def list_outstanding_actions(current_user=Depends(get_current_user)) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []

    # --- Management Review meetings ---------------------------------------
    meetings = await db["management_review_meetings"].find({}, {"_id": 0}).sort([("date", -1)]).to_list(length=None)
    for mtg in meetings:
        mtg_date = mtg.get("date")
        mtg_id = mtg.get("id")
        for row in (mtg.get("agenda_rows") or []):
            actions = row.get("actions") or [{
                "minutes": row.get("minutes") or "",
                "action_by_whom": row.get("action_by_whom") or "",
                "action_when": row.get("action_when") or "",
                "completed": row.get("completed") or "",
            }]
            for ai, action in enumerate(actions):
                if not _is_open(action.get("completed", "")):
                    continue
                if not any([action.get("minutes"), action.get("action_by_whom"), action.get("action_when")]):
                    continue
                items.append({
                    "source": "Management Review",
                    "source_label": f"Mgmt Review {mtg_date or ''}".strip() + f" — Agenda #{row.get('agenda_no')}",
                    "description": (action.get("minutes") or "")[:400],
                    "owner": action.get("action_by_whom") or "",
                    "due_label": action.get("action_when") or "",
                    "due_date": parse_due_date(action.get("action_when")),
                    "status": action.get("completed") or "Open",
                    "raised_date": mtg_date,
                    "link": f"/quality/management-review/{mtg_id}",
                    "target": {
                        "kind": "mgmt_action",
                        "meeting_id": mtg_id,
                        "agenda_no": row.get("agenda_no"),
                        "action_idx": ai,
                    },
                })
        for c in (mtg.get("carryover_items") or []):
            if not _is_open(c.get("completed", "")):
                continue
            if not c.get("description"):
                continue
            items.append({
                "source": "Management Review",
                "source_label": f"Mgmt Review {mtg_date or ''} — Carry-over".strip(),
                "description": (c.get("description") or "")[:400],
                "owner": c.get("action_by_whom") or "",
                "due_label": c.get("action_when") or "",
                "due_date": parse_due_date(c.get("action_when")),
                "status": c.get("completed") or "Open",
                "raised_date": c.get("source_meeting_date") or mtg_date,
                "link": f"/quality/management-review/{mtg_id}",
                "target": {
                    "kind": "mgmt_carry",
                    "meeting_id": mtg_id,
                    "carry_id": c.get("id"),
                },
            })

    # --- Audit Follow-Up Items -------------------------------------------
    follow_ups = await db["audit_follow_ups"].find({}, {"_id": 0}).to_list(length=None)
    # Some installs name it differently — fall back to scanning related collections.
    if not follow_ups:
        for coll_name in ("audit_followups", "follow_up_items", "audit_follow_up_items"):
            follow_ups = await db[coll_name].find({}, {"_id": 0}).to_list(length=None)
            if follow_ups:
                break
    for f in follow_ups or []:
        status = (f.get("status") or "Open").strip()
        if status.lower() in ("closed", "completed", "done"):
            continue
        report_id = f.get("report_id")
        due_raw = f.get("due_date")
        items.append({
            "source": "ISO Audit",
            "source_label": "Audit follow-up",
            "description": (f.get("description") or "")[:400],
            "owner": "",
            "due_label": parse_due_date(due_raw) or (str(due_raw) if due_raw else ""),
            "due_date": parse_due_date(due_raw),
            "status": status,
            "raised_date": str(f.get("created_at") or "")[:10] or None,
            "link": f"/quality/audits/{report_id}" if report_id else "/quality/audits",
            "target": {
                "kind": "audit_followup",
                "follow_up_id": f.get("id"),
            },
        })

    # --- Injury Register (recent referred / ceased-work cases) -------------
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    injuries = await db["injury_register"].find({}, {"_id": 0}).to_list(length=None)
    for inj in injuries:
        # Only surface recent injuries with an external referral OR where work was ceased
        # (anything else is just a closed record).
        ev_date = inj.get("date_of_event") or inj.get("date")
        if ev_date and ev_date < cutoff:
            continue
        ceased = (inj.get("ceased_work") or "").lower()
        referral = (inj.get("referral_treatment") or "").strip()
        if not referral and (not ceased or ceased == "no"):
            continue
        name = " ".join([inj.get("given_name") or "", inj.get("surname") or ""]).strip() or "(no name)"
        items.append({
            "source": "Injury",
            "source_label": f"Injury #{inj.get('record_number_label') or ''}".strip(),
            "description": f"{name}: {(inj.get('injury_description') or '')[:200]}".strip(),
            "owner": inj.get("first_aid_person") or "",
            "due_label": referral or "",
            "due_date": None,
            "status": "Follow-up",
            "raised_date": ev_date,
            "link": f"/safety/injury-register/{inj.get('id')}" if inj.get("id") else "/safety/injury-register",
        })

    # --- Sort: due_date soonest first, then raised_date oldest first ------
    def sort_key(it):
        due = it.get("due_date") or "9999-12-31"  # null due dates → bottom
        raised = it.get("raised_date") or "0000-01-01"
        return (due, raised)

    items.sort(key=sort_key)

    # Summary counts per source
    counts = {"management_review": 0, "iso_audit": 0, "injury": 0, "total": len(items)}
    for it in items:
        s = it["source"]
        if s == "Management Review":
            counts["management_review"] += 1
        elif s == "ISO Audit":
            counts["iso_audit"] += 1
        elif s == "Injury":
            counts["injury"] += 1

    return {"items": items, "counts": counts}


class InlinePatch(BaseModel):
    target: Dict[str, Any]
    owner: Optional[str] = None         # action_by_whom
    due_label: Optional[str] = None     # action_when (free-form date)
    status: Optional[str] = None        # completed / followup status


@router.patch("/update")
async def inline_update(payload: InlinePatch, current_user=Depends(get_current_user)) -> Dict[str, Any]:
    """Apply an inline edit from the dashboard widget back to the source record.

    Supports three target kinds: `mgmt_action`, `mgmt_carry`, `audit_followup`.
    Only the fields supplied in the payload are written through; everything else
    is left untouched. Returns the updated item shape so the UI can re-render
    immediately without a full refetch.
    """
    target = payload.target or {}
    kind = (target.get("kind") or "").strip()
    if not kind:
        raise HTTPException(status_code=400, detail="target.kind is required")

    now = datetime.now(timezone.utc).isoformat()

    if kind == "mgmt_action":
        meeting_id = target.get("meeting_id")
        agenda_no = target.get("agenda_no")
        action_idx = target.get("action_idx")
        if not meeting_id or agenda_no is None or action_idx is None:
            raise HTTPException(status_code=400, detail="meeting_id / agenda_no / action_idx required")
        meeting = await db["management_review_meetings"].find_one({"id": meeting_id}, {"_id": 0})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        rows = meeting.get("agenda_rows") or []
        row = next((r for r in rows if r.get("agenda_no") == agenda_no), None)
        if not row:
            raise HTTPException(status_code=404, detail="Agenda row not found")
        actions = row.get("actions")
        if not actions:
            # Migrate legacy single-line shape on the fly.
            actions = [{
                "minutes": row.get("minutes") or "",
                "action_by_whom": row.get("action_by_whom") or "",
                "action_when": row.get("action_when") or "",
                "completed": row.get("completed") or "",
            }]
            row["actions"] = actions
        if action_idx < 0 or action_idx >= len(actions):
            raise HTTPException(status_code=404, detail="Action index out of range")
        act = actions[action_idx]
        if payload.owner is not None:
            act["action_by_whom"] = payload.owner
        if payload.due_label is not None:
            act["action_when"] = payload.due_label
        if payload.status is not None:
            act["completed"] = payload.status
        await db["management_review_meetings"].update_one(
            {"id": meeting_id},
            {"$set": {"agenda_rows": rows, "updated_at": now}},
        )
        return {"ok": True, "updated": act}

    if kind == "mgmt_carry":
        meeting_id = target.get("meeting_id")
        carry_id = target.get("carry_id")
        if not meeting_id or not carry_id:
            raise HTTPException(status_code=400, detail="meeting_id / carry_id required")
        meeting = await db["management_review_meetings"].find_one({"id": meeting_id}, {"_id": 0})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        carry = meeting.get("carryover_items") or []
        item = next((c for c in carry if c.get("id") == carry_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Carry-over item not found")
        if payload.owner is not None:
            item["action_by_whom"] = payload.owner
        if payload.due_label is not None:
            item["action_when"] = payload.due_label
        if payload.status is not None:
            item["completed"] = payload.status
        await db["management_review_meetings"].update_one(
            {"id": meeting_id},
            {"$set": {"carryover_items": carry, "updated_at": now}},
        )
        return {"ok": True, "updated": item}

    if kind == "audit_followup":
        fid = target.get("follow_up_id")
        if not fid:
            raise HTTPException(status_code=400, detail="follow_up_id required")
        # Find the actual collection name where audit follow-ups live.
        for coll_name in ("audit_follow_ups", "audit_followups", "follow_up_items", "audit_follow_up_items"):
            doc = await db[coll_name].find_one({"id": fid}, {"_id": 0})
            if doc:
                set_doc: Dict[str, Any] = {"updated_at": now}
                if payload.status is not None:
                    set_doc["status"] = payload.status
                if payload.due_label is not None:
                    set_doc["due_date"] = parse_due_date(payload.due_label) or payload.due_label
                if payload.owner is not None:
                    set_doc["owner"] = payload.owner
                await db[coll_name].update_one({"id": fid}, {"$set": set_doc})
                return {"ok": True, "updated": {**doc, **set_doc}}
        raise HTTPException(status_code=404, detail="Follow-up not found")

    raise HTTPException(status_code=400, detail=f"Unsupported target kind: {kind}")
