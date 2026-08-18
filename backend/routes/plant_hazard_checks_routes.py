"""Plant Hazard Check / Risk Assessment register — QMSF 22 Issue 3, June 2026.

Faithful digitisation of the master 11-page PHC checklist used during ISO audits.
- 16 hazard sections (A–P), each with multiple sub-questions
- Risk scoring matrix (Consequence 1–5 × Likelihood A–E)
- Free-form final comments + dual sign-off
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import uuid
from auth import get_current_user

router = APIRouter(prefix="/api/plant-hazard-checks", tags=["Plant Hazard Checks"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "plant_hazard_checks"
CTRS = "ncr_counters"

FORM_NO = "QMSF 22"
FORM_ISSUE = "3"
FORM_REVISION = "June 2026"

# Reference tables (display + scoring)
CONSEQUENCE_LEVELS = [
    {"level": 1, "descriptor": "Negligible",    "measure": "No Injuries, no First Aid required"},
    {"level": 2, "descriptor": "Minor",         "measure": "First Aid treatment required, contained within Ultimate Laser"},
    {"level": 3, "descriptor": "Major",         "measure": "Medical treatment required"},
    {"level": 4, "descriptor": "Critical",      "measure": "Reportable incident to Work Safe Victoria"},
    {"level": 5, "descriptor": "Catastrophic",  "measure": "Death"},
]
LIKELIHOOD_LEVELS = [
    {"code": "A", "descriptor": "Frequent",              "measure": "Is expected to occur in most circumstances (Daily)"},
    {"code": "B", "descriptor": "Reasonable / Probable", "measure": "Will probably occur in most circumstances (Weekly exposure)"},
    {"code": "C", "descriptor": "Occasional",            "measure": "Might occur at some time (Weekly – monthly exposure)"},
    {"code": "D", "descriptor": "Remote",                "measure": "Could occur at some time (Monthly)"},
    {"code": "E", "descriptor": "Rare",                  "measure": "May occur in extraordinary circumstances"},
]
RISK_ACTION_GUIDELINE = [
    {"score": "6, 7, 8", "level": "High Risk",   "action": "Requires Corrective Action"},
    {"score": "4, 5",    "level": "Medium Risk", "action": "Requires corrective action review, implement as required"},
    {"score": "1, 2, 3", "level": "Low Risk",    "action": "Requires corrective action review, implement where practicable"},
]
HIERARCHY_OF_CONTROLS = [
    {"name": "Elimination",                "description": "of hazard or risk e.g., removal of faulty equipment, repair of damaged equipment, change of dangerous substances, etc."},
    {"name": "Substitution",               "description": "of substances or equipment or process to reduce the identified hazard or risk."},
    {"name": "Engineering controls",       "description": "that place a barrier between the risk or hazard and people, e.g. signage, guarding."},
    {"name": "Administrative controls",    "description": "that will limit the risk or hazard such as new procedures, training and supervision."},
    {"name": "Personal Protective Equipment and Clothing", "description": "that will protect from the identified risk or hazard."},
]

# Master list of all 16 sections + every sub-question (from PHC 01)
DEFAULT_SECTIONS: List[Dict[str, Any]] = [
    {"code": "A", "name": "ENTANGLEMENT", "prompt": None, "questions": [
        "Can anyone's hair, clothing, gloves, jewellery, cleaning brushes, rags or other materials become entangled with moving parts of the plant or materials in motion?",
    ]},
    {"code": "B", "name": "CRUSHING", "prompt": "Can anyone be crushed due to:", "questions": [
        "Material falling off the plant?",
        "Uncontrolled or unexpected movement of the plant or its load?",
        "Lack of capacity for the plant to be slowed, stopped or immobilised?",
        "The plant tipping or rolling over?",
        "Parts of the plant collapsing?",
        "Coming in contact with moving parts of the plant during testing, inspection, operation, maintenance, cleaning or repair?",
        "Being trapped between the plant and materials or fixed structures?",
        "Other factors not mentioned?",
    ]},
    {"code": "C", "name": "CUTTING, STABBING AND PUNCTURING", "prompt": "Can anyone be cut, stabbed or punctured due to:", "questions": [
        "Coming in contact with sharp or flying objects?",
        "Coming in contact with moving parts of the plant during testing, inspection, operation, maintenance, cleaning or repair of the plant?",
        "The plant, parts of the plant or work pieces disintegrating?",
        "Work pieces being ejected?",
        "The mobility of the plant?",
        "Uncontrolled or unexpected movement of the plant?",
        "Other factors not mentioned?",
    ]},
    {"code": "D", "name": "SHEARING", "prompt": None, "questions": [
        "Can anyone's body parts be sheared between two parts of the plant, or between a part of the plant and a work place or structure?",
    ]},
    {"code": "E", "name": "FRICTION", "prompt": None, "questions": [
        "Can anyone be burnt due to contact with moving parts or surfaces of the plant, or material handled by the plant?",
    ]},
    {"code": "F", "name": "STRIKING", "prompt": "Can anyone be struck by moving objects due to:", "questions": [
        "Uncontrolled or unexpected movement of the plant or material handled by the plant?",
        "The plant, parts of the plant or material handled by the plant?",
        "Work pieces being ejected?",
        "Mobility of the plant?",
        "Other factors not mentioned?",
    ]},
    {"code": "G", "name": "HIGH PRESSURE FLUID", "prompt": None, "questions": [
        "Can anyone come into contact with fluids under high pressure?",
    ]},
    {"code": "H", "name": "EXPLOSION", "prompt": None, "questions": [
        "Can anyone be injured by explosion or gasses, vapours, liquids, dust or other substances triggered by the operation of the plant or by material handled by the plant?",
    ]},
    {"code": "I", "name": "ELECTRICAL", "prompt": "Can anyone be injured by electrical shock or burnt due to:", "questions": [
        "The plant working in close proximity to electrical conductors?",
        "The plant contacting live electrical conductors?",
        "Overload of electrical circuits?",
        "Damaged or poorly maintained electrical leads or cables?",
        "Damaged electrical switches?",
        "Water near electrical equipment?",
        "Lack of isolation procedures?",
        "Other factors not mentioned?",
    ]},
    {"code": "J", "name": "SUFFOCATION", "prompt": None, "questions": [
        "Can anyone be suffocated due to lack of oxygen, or atmospheric contamination?",
    ]},
    {"code": "K", "name": "TEMPERATURE [THERMAL COMFORT]", "prompt": None, "questions": [
        "Can anyone suffer ill-health due to exposure to high or low temperatures?",
    ]},
    {"code": "L", "name": "HIGH TEMPERATURE OR FIRE", "prompt": None, "questions": [
        "Can anyone come into contact with objects at high temperatures?",
        "Can anyone be injured by fire?",
    ]},
    {"code": "M", "name": "SLIPPING, TRIPPING AND FALLING", "prompt": "Can anyone using the plant or in the vicinity of the plant, slip, trip or fall due to:", "questions": [
        "Uneven or slippery work surfaces?",
        "Poor housekeeping, e.g., swarf in the vicinity of the plant?",
        "Obstacles being placed in the vicinity of the plant?",
        "Other factors not mentioned?",
        "Lack of a proper work platform? (falling from height)",
        "Lack of proper stairs or ladders? (falling from height)",
        "Lack of guardrails or other suitable edge protection? (falling from height)",
        "Unprotected holes or gaps? (falling from height)",
        "Poor floor or walking surfaces, such as the lack of a slip resilient surface?",
        "Collapse of a supporting structure?",
        "Steep walking surfaces?",
        "Other factors not mentioned?",
    ]},
    {"code": "N", "name": "ERGONOMIC", "prompt": "Can anyone be injured due to:", "questions": [
        "Poorly designed seating?",
        "Repetitive bodily movement?",
        "Constrained body posture or the need for excessive effort?",
        "Design deficiency causing mental or psychological stress?",
        "Inadequate or poorly placed lighting?",
        "Lack of consideration given to human error or human behaviour?",
        "Mismatch of the plant with human traits and natural limitations?",
        "Other factors not mentioned?",
    ]},
    {"code": "O", "name": "OTHER HAZARDS", "prompt": "Can anyone be injured or suffer ill-health from exposure to:", "questions": [
        "Chemicals?",
        "Toxic gasses or vapours?",
        "Fumes?",
        "Dust?",
        "Noise?",
        "Vibration?",
        "Radiation?",
        "Other factors not mentioned?",
    ]},
    {"code": "P", "name": "TECHNICAL DATA", "prompt": None, "questions": [
        "Are there any details of Technical Data available i.e., Operating Manuals, Work Instructions?",
    ]},
]


def _now(): return datetime.now(timezone.utc).isoformat()


def _build_default_sections() -> List[Dict[str, Any]]:
    """Expand the master DEFAULT_SECTIONS into the structured payload returned to
    the frontend (each question with empty applies / consequence / likelihood)."""
    out = []
    for sec in DEFAULT_SECTIONS:
        questions = []
        for i, q in enumerate(sec["questions"], start=1):
            questions.append({
                "n": i, "question": q,
                "applies": None, "consequence": None, "likelihood": None,
                "risk": None, "controls": None, "comments": None,
            })
        out.append({"code": sec["code"], "name": sec["name"], "prompt": sec.get("prompt"), "questions": questions})
    return out


async def _next_phc_no() -> int:
    res = await db[CTRS].find_one_and_update(
        {"_id": "phc_no"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


class HazardQuestion(BaseModel):
    n: Optional[int] = None
    question: str = ""
    applies: Optional[str] = None  # "Yes" | "No" | "N/A"
    consequence: Optional[int] = None
    likelihood: Optional[str] = None
    risk: Optional[str] = None
    controls: Optional[str] = None
    comments: Optional[str] = None  # Section P uses this


class HazardSection(BaseModel):
    code: str = ""
    name: str = ""
    prompt: Optional[str] = None
    questions: List[HazardQuestion] = Field(default_factory=list)


class PHCIn(BaseModel):
    risk_assessment_no: Optional[int] = None
    machine_name: str = ""
    area: Optional[str] = None
    assessment_team: List[str] = Field(default_factory=list)
    reason: Optional[str] = None
    date_of_assessment: Optional[str] = None
    next_review_date: Optional[str] = None
    sections: List[HazardSection] = Field(default_factory=list)
    final_comments: Optional[str] = None
    # Review record (who actually performed the review and when)
    reviewed_date: Optional[str] = None
    reviewed_by: Optional[str] = None
    signed_by_1: Optional[str] = None
    signed_by_2: Optional[str] = None
    signature_date: Optional[str] = None


@router.get("/reference")
async def reference(current_user=Depends(get_current_user)):
    return {
        "form_no": FORM_NO, "issue": FORM_ISSUE, "revision": FORM_REVISION,
        "consequence_levels": CONSEQUENCE_LEVELS,
        "likelihood_levels": LIKELIHOOD_LEVELS,
        "risk_action_guideline": RISK_ACTION_GUIDELINE,
        "hierarchy_of_controls": HIERARCHY_OF_CONTROLS,
        "default_sections": _build_default_sections(),
    }


# Keep legacy hazard-categories endpoint for backwards compat (returns short list)
@router.get("/hazard-categories")
async def hazard_categories(current_user=Depends(get_current_user)):
    return {"categories": [{"code": s["code"], "name": s["name"]} for s in DEFAULT_SECTIONS]}


@router.get("")
async def list_phc(search: Optional[str] = None, current_user=Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if search:
        s = search.strip()
        q["$or"] = [
            {"machine_name": {"$regex": s, "$options": "i"}},
            {"area": {"$regex": s, "$options": "i"}},
            {"reason": {"$regex": s, "$options": "i"}},
        ]
        if s.isdigit():
            q["$or"].append({"phc_no": int(s)})
    items = await db[COL].find(q, {"_id": 0}).sort("phc_no", -1).to_list(length=2000)
    return {"items": items, "count": len(items)}


@router.get("/stats")
async def stats(current_user=Depends(get_current_user)):
    total = await db[COL].count_documents({})
    today = datetime.now(timezone.utc).date().isoformat()
    decommissioned = await db[COL].count_documents({"status": "decommissioned"})
    overdue = await db[COL].count_documents({
        "next_review_date": {"$lt": today, "$ne": None},
        "status": {"$ne": "decommissioned"},
    })
    return {"total": total, "overdue_for_review": overdue, "decommissioned": decommissioned}


@router.post("")
async def create_phc(payload: PHCIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["phc_no"] = await _next_phc_no()
    if not doc.get("risk_assessment_no"):
        doc["risk_assessment_no"] = doc["phc_no"]
    doc["created_at"] = doc["updated_at"] = _now()
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/{phc_id}")
async def get_phc(phc_id: str, current_user=Depends(get_current_user)):
    doc = await db[COL].find_one({"id": phc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.put("/{phc_id}")
async def update_phc(phc_id: str, payload: PHCIn, current_user=Depends(get_current_user)):
    if not await db[COL].find_one({"id": phc_id}, {"_id": 0}):
        raise HTTPException(404, "Not found")
    upd = payload.model_dump()
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": phc_id}, {"$set": upd})
    return await db[COL].find_one({"id": phc_id}, {"_id": 0})


class DecommissionIn(BaseModel):
    decommissioned_date: Optional[str] = None
    decommissioned_reason: Optional[str] = None
    decommissioned_by: Optional[str] = None


@router.post("/{phc_id}/decommission")
async def decommission_phc(phc_id: str, payload: DecommissionIn, current_user=Depends(get_current_user)):
    if not await db[COL].find_one({"id": phc_id}, {"_id": 0}):
        raise HTTPException(404, "Not found")
    upd = {
        "status": "decommissioned",
        "decommissioned_date": payload.decommissioned_date or datetime.now(timezone.utc).date().isoformat(),
        "decommissioned_reason": payload.decommissioned_reason,
        "decommissioned_by": payload.decommissioned_by,
        "updated_at": _now(),
    }
    await db[COL].update_one({"id": phc_id}, {"$set": upd})
    return await db[COL].find_one({"id": phc_id}, {"_id": 0})


@router.post("/{phc_id}/reactivate")
async def reactivate_phc(phc_id: str, current_user=Depends(get_current_user)):
    if not await db[COL].find_one({"id": phc_id}, {"_id": 0}):
        raise HTTPException(404, "Not found")
    await db[COL].update_one({"id": phc_id}, {
        "$set": {"status": "active", "updated_at": _now()},
        "$unset": {"decommissioned_date": "", "decommissioned_reason": "", "decommissioned_by": ""},
    })
    return await db[COL].find_one({"id": phc_id}, {"_id": 0})


@router.delete("/{phc_id}")
async def delete_phc(phc_id: str, current_user=Depends(get_current_user)):
    res = await db[COL].delete_one({"id": phc_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"success": True}
