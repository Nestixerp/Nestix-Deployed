"""
Environmental Aspect / Impact Risk Assessment Routes
ISO 14001 — tracked register with 12-month review cycle.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/environmental-risks", tags=["Environmental Risks"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

COLLECTION = "environmental_risks"
SETTINGS_COLLECTION = "environmental_risk_settings"
BY_WHOM_DEFAULTS = ["Operations Manager", "Quality Manager", "Programmers", "Maintenance", "Operators", "All"]


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


# 5x5 Risk Matrix (ISO 14001 Revision 3)
# Rows = Consequence (1=Negligible -> 5=Catastrophic)
# Cols = Likelihood (A=Frequent -> E=Rare)
RISK_MATRIX = {
    5: {"A": 8, "B": 7, "C": 6, "D": 5, "E": 5},  # Catastrophic
    4: {"A": 7, "B": 6, "C": 5, "D": 4, "E": 3},  # Critical
    3: {"A": 6, "B": 5, "C": 4, "D": 3, "E": 2},  # Major
    2: {"A": 5, "B": 4, "C": 3, "D": 2, "E": 1},  # Minor
    1: {"A": 4, "B": 3, "C": 2, "D": 1, "E": 0},  # Negligible
}


def _compute_score(consequence, likelihood) -> int:
    try:
        c = int(consequence or 0)
    except (ValueError, TypeError):
        return 0
    if not c or not likelihood:
        return 0
    return RISK_MATRIX.get(c, {}).get(str(likelihood).upper(), 0)


def _level_from_score(score) -> str:
    try:
        s = int(score)
    except (ValueError, TypeError):
        return "None"
    if s == 0:
        return "None"
    if s <= 3:
        return "Low"
    if s <= 5:
        return "Medium"
    return "High"


class ImpactRow(BaseModel):
    id: Optional[str] = None
    aspect: Optional[str] = ""  # per-row aspect (e.g. "Energy consumption during operation")
    impact: str = ""
    consequence: Optional[int] = 0  # 1-5
    likelihood: Optional[str] = ""  # A-E
    risk_level: Optional[str] = ""  # auto-derived
    risk_score: Optional[int] = 0   # auto-derived from matrix
    actions: Optional[str] = ""
    by_whom: Optional[str] = ""
    by_when: Optional[str] = ""
    revised_consequence: Optional[int] = 0
    revised_likelihood: Optional[str] = ""
    revised_risk_level: Optional[str] = ""
    revised_risk_score: Optional[int] = 0
    revised_date: Optional[str] = ""  # ISO date when "Mark as Revised" was clicked


class EnvironmentalRiskBase(BaseModel):
    aspect: str  # e.g. "Cigarette butts in drains"
    date_created: str  # ISO date YYYY-MM-DD
    review_date: Optional[str] = ""  # defaults to date_created + 12 months
    impacts: List[ImpactRow] = []
    actions_summary: Optional[str] = ""
    reviewed_dates: Optional[List[str]] = []  # historical review timestamps
    is_revised: Optional[bool] = False  # flips true when user marks revised


class EnvRiskCreate(EnvironmentalRiskBase):
    pass


class EnvRiskUpdate(BaseModel):
    aspect: Optional[str] = None
    date_created: Optional[str] = None
    review_date: Optional[str] = None
    impacts: Optional[List[ImpactRow]] = None
    actions_summary: Optional[str] = None
    reviewed_dates: Optional[List[str]] = None
    is_revised: Optional[bool] = None


def _normalise(doc: dict) -> dict:
    # Default review_date to +12 months if missing
    if not doc.get("review_date") and doc.get("date_created"):
        try:
            dt = datetime.fromisoformat(doc["date_created"])
            doc["review_date"] = (dt + timedelta(days=365)).strftime("%Y-%m-%d")
        except Exception:
            pass
    # Auto-compute score from Consequence x Likelihood matrix (single source of truth)
    for row in (doc.get("impacts") or []):
        if not row.get("id"):
            row["id"] = str(uuid.uuid4())
        # Normalise likelihood to uppercase letter
        if row.get("likelihood"):
            row["likelihood"] = str(row["likelihood"]).upper()
        if row.get("revised_likelihood"):
            row["revised_likelihood"] = str(row["revised_likelihood"]).upper()
        # Compute initial score
        row["risk_score"] = _compute_score(row.get("consequence"), row.get("likelihood"))
        row["risk_level"] = _level_from_score(row["risk_score"])
        # Compute revised score (only if both revised_* are set)
        if row.get("revised_consequence") and row.get("revised_likelihood"):
            row["revised_risk_score"] = _compute_score(row.get("revised_consequence"), row.get("revised_likelihood"))
            row["revised_risk_level"] = _level_from_score(row["revised_risk_score"])
        else:
            row["revised_risk_score"] = 0
            row["revised_risk_level"] = ""
    return doc


@router.get("")
async def list_risks(current_user=Depends(get_current_user)):
    """List all environmental risk records, newest by date_created."""
    items = await db[COLLECTION].find({}, {"_id": 0}).sort([("date_created", -1), ("created_at", -1)]).to_list(length=None)
    return items


@router.post("")
async def create_risk(payload: EnvRiskCreate, current_user=Depends(get_current_user)):
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


@router.get("/{risk_id}")
async def get_risk(risk_id: str, current_user=Depends(get_current_user)):
    item = await db[COLLECTION].find_one({"id": risk_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.put("/{risk_id}")
async def update_risk(risk_id: str, payload: EnvRiskUpdate, current_user=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data = _normalise({**(await db[COLLECTION].find_one({"id": risk_id}, {"_id": 0}) or {}), **update_data})
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = _user_label(current_user)
    # Strip internal keys we don't want to overwrite blindly
    update_data.pop("id", None)
    update_data.pop("created_at", None)
    update_data.pop("created_by", None)
    result = await db[COLLECTION].update_one({"id": risk_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    item = await db[COLLECTION].find_one({"id": risk_id}, {"_id": 0})
    return item


@router.delete("/{risk_id}")
async def delete_risk(risk_id: str, current_user=Depends(get_current_user)):
    result = await db[COLLECTION].delete_one({"id": risk_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


# ==================== AI ACTION SUGGESTION ====================

class AiSuggestPayload(BaseModel):
    aspect: str
    impact: str = ""
    risk_level: Optional[str] = ""


class AiRatingPayload(BaseModel):
    aspect: str
    impact: str = ""


@router.post("/ai-suggest-rating")
async def ai_suggest_rating(payload: AiRatingPayload, current_user=Depends(get_current_user)):
    """Use AI to suggest Consequence (1-5) and Likelihood (A-E) for an environmental aspect/impact."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI key not configured")
    try:
        import json as _json
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id=f"env-risk-rate-{uuid.uuid4()}",
            system_message=(
                "You are an ISO 14001 environmental risk assessor for an Australian "
                "metalworking / press brake manufacturing business. You rate environmental "
                "aspects using a 5x5 Consequence x Likelihood matrix.\n\n"
                "CONSEQUENCE (1-5):\n"
                "1 = Negligible (infringement of regulations but not significant environmental effect, e.g. clean water to drains)\n"
                "2 = Minor (moderate pollution, small quantity of toxic material, breach that could lead to regulator complaint)\n"
                "3 = Major (significant release of polluting substances, e.g. liquid spill not requiring emergency services, major breach likely to be complained about)\n"
                "4 = Critical (high release of polluting substances, major breach, likely prosecution)\n"
                "5 = Catastrophic (major emergency, e.g. toxic gas cloud requiring external emergency services, serious regulatory breach risking prosecution)\n\n"
                "LIKELIHOOD (A-E):\n"
                "A = Frequent (expected daily)\n"
                "B = Reasonable/Probable (weekly exposure)\n"
                "C = Occasional (weekly to monthly)\n"
                "D = Remote (monthly)\n"
                "E = Rare (extraordinary circumstances)\n\n"
                "You MUST respond with ONLY a valid JSON object - no markdown, no preamble. Format:\n"
                '{"consequence": <1-5>, "likelihood": "<A|B|C|D|E>", "reasoning": "<one short sentence>"}'
            )
        ).with_model("gemini", "gemini-2.5-pro")
        prompt = (
            f"Environmental Aspect: {payload.aspect}\n"
            f"Impact: {payload.impact or '(not provided)'}\n\n"
            f"Rate this risk. Return ONLY the JSON object."
        )
        response_text = await chat.send_message(UserMessage(text=prompt))
        # Strip markdown fences if present
        txt = response_text.strip()
        if txt.startswith("```"):
            txt = txt.strip("`")
            # remove possible language tag like "json\n..."
            if txt.lower().startswith("json"):
                txt = txt[4:].lstrip()
        # Find first '{' and last '}' to be safe
        start = txt.find("{")
        end = txt.rfind("}")
        if start != -1 and end != -1:
            txt = txt[start:end + 1]
        data = _json.loads(txt)
        # Validate
        c = int(data.get("consequence", 0))
        likelihood = str(data.get("likelihood", "")).upper().strip()
        if c < 1 or c > 5:
            raise ValueError(f"Invalid consequence: {c}")
        if likelihood not in ("A", "B", "C", "D", "E"):
            raise ValueError(f"Invalid likelihood: {likelihood}")
        score = _compute_score(c, likelihood)
        return {
            "consequence": c,
            "likelihood": likelihood,
            "score": score,
            "level": _level_from_score(score),
            "reasoning": str(data.get("reasoning", ""))[:300]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI rating failed: {str(e)[:200]}")


@router.post("/ai-suggest-actions")
async def ai_suggest_actions(payload: AiSuggestPayload, current_user=Depends(get_current_user)):
    """Use AI to suggest corrective actions for an environmental aspect/impact (ISO 14001 friendly)."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI key not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id=f"env-risk-{uuid.uuid4()}",
            system_message=(
                "You are an ISO 14001 environmental compliance assistant for an Australian "
                "metalworking / press brake manufacturing business. Suggest practical, achievable "
                "corrective actions. Be specific and concise."
            )
        ).with_model("gemini", "gemini-2.5-pro")
        prompt = (
            f"Environmental Aspect: {payload.aspect}\n"
            f"Impact: {payload.impact or '(not provided)'}\n"
            f"Current risk level: {payload.risk_level or '(not provided)'}\n\n"
            f"Provide 3-5 concrete corrective actions this business can implement to reduce the risk. "
            f"Format as a numbered list (1., 2., 3., ...). Each action should be ONE clear sentence "
            f"covering what to do and ideally why. No preamble, no closing remarks."
        )
        response_text = await chat.send_message(UserMessage(text=prompt))
        return {"suggestions": response_text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI suggestion failed: {str(e)[:200]}")


# ==================== SETTINGS: By Whom options ====================

class ByWhomOptions(BaseModel):
    options: List[str]


@router.get("/settings/by-whom")
async def get_by_whom_options(current_user=Depends(get_current_user)):
    doc = await db[SETTINGS_COLLECTION].find_one({"key": "by_whom"}, {"_id": 0})
    if not doc or not doc.get("options"):
        return {"options": BY_WHOM_DEFAULTS}
    return {"options": doc["options"]}


@router.put("/settings/by-whom")
async def set_by_whom_options(payload: ByWhomOptions, current_user=Depends(get_current_user)):
    cleaned = [o.strip() for o in payload.options if o and o.strip()]
    # de-duplicate while preserving order
    seen = set()
    unique = []
    for o in cleaned:
        if o.lower() not in seen:
            seen.add(o.lower())
            unique.append(o)
    await db[SETTINGS_COLLECTION].update_one(
        {"key": "by_whom"},
        {"$set": {"key": "by_whom", "options": unique, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": _user_label(current_user)}},
        upsert=True
    )
    return {"options": unique}
