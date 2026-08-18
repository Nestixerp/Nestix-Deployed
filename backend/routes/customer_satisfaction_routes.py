"""
Customer Satisfaction Survey Module
ISO 9001 — yearly customer satisfaction campaigns with public submission,
confidential response storage, year-on-year analysis, and AI-powered
recommended actions.

Each year (campaign) has ONE generic public token. The link is shared by Sales.
Customers fill it in; each submission gets a sequential Response No. (e.g.
"CSS-2026-001"). Admin / Quality Manager review and print the report.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import secrets

from auth import get_current_user

router = APIRouter(prefix="/api/customer-satisfaction", tags=["Customer Satisfaction"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

CAMPAIGNS = "customer_satisfaction_campaigns"
RESPONSES = "customer_satisfaction_responses"

# 7 scored questions on the QMSF 01A questionnaire
SCORED_QUESTIONS = [
    ("q_overall_quality", "Overall Satisfaction with Laser Cutting"),
    ("q_accuracy", "Accuracy & Precision"),
    ("q_deadlines", "Timeliness (Deadlines Met)"),
    ("q_communication", "Communication"),
    ("q_professionalism", "Staff Professionalism"),
    ("q_responsiveness", "Responsiveness"),
    ("q_recommend", "Likelihood to Recommend"),
]

DEFAULT_INTRO = (
    "Dear valued customer, At Ultimate Laser, we are committed to providing the "
    "highest quality Cutting Services. Your feedback is crucial in helping us "
    "maintain and improve our services. Kindly take a few moments to complete this "
    "Customer Satisfaction Survey. Your responses will contribute to the continual "
    "enhancement of our ISO 9001 Quality Management System."
)
DEFAULT_CLOSING = (
    "Thank you for taking the time to complete this survey. Your feedback is "
    "instrumental in helping us maintain our ISO 9001 Quality Management System "
    "and continuously enhance our laser cutting services."
)


def _user_label(user) -> str:
    if user is None:
        return "system"
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or getattr(user, "email", None) or "system"


# ==================== MODELS ====================

class CampaignCreate(BaseModel):
    year: int
    title: Optional[str] = None
    form_no: Optional[str] = "QMSF 01A"
    report_form_no: Optional[str] = None
    intro_message: Optional[str] = None
    closing_message: Optional[str] = None
    status: Optional[str] = "Active"  # Active | Closed


class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    form_no: Optional[str] = None
    report_form_no: Optional[str] = None
    intro_message: Optional[str] = None
    closing_message: Optional[str] = None
    status: Optional[str] = None


class AiSelectionUpdate(BaseModel):
    selected_indexes: List[int] = Field(default_factory=list)


class ResponseSubmit(BaseModel):
    # Section 1: General
    customer_name: str = ""
    company: str = ""
    contact_email: str = ""
    contact_number: str = ""

    # Section 2 + 3 + 5: 1-5 scores (5 = best)
    q_overall_quality: Optional[int] = None
    q_accuracy: Optional[int] = None
    q_deadlines: Optional[int] = None
    q_communication: Optional[int] = None
    q_professionalism: Optional[int] = None
    q_responsiveness: Optional[int] = None
    q_recommend: Optional[int] = None

    # Section 4 + 6: free text
    improvements_text: Optional[str] = ""
    suggestions_text: Optional[str] = ""
    additional_comments: Optional[str] = ""


# ==================== HELPERS ====================

def _serialise(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _compute_response_pct(resp: Dict[str, Any]) -> Dict[str, Any]:
    """Return (per-question %, overall %, raw score, max). 5 = 100%, 1 = 20%."""
    per_q = {}
    total = 0
    max_total = 0
    answered = 0
    for key, _label in SCORED_QUESTIONS:
        v = resp.get(key)
        if isinstance(v, int) and 1 <= v <= 5:
            per_q[key] = round(v / 5 * 100, 2)
            total += v
            max_total += 5
            answered += 1
        else:
            per_q[key] = None
    overall_pct = round(total / max_total * 100, 2) if max_total > 0 else 0
    return {
        "per_question_pct": per_q,
        "overall_pct": overall_pct,
        "score": total,
        "max_score": max_total,
        "answered": answered,
    }


async def _next_response_no(year: int) -> str:
    count = await db[RESPONSES].count_documents({"campaign_year": year})
    return f"CSS-{year}-{(count + 1):03d}"


# ==================== ADMIN: CAMPAIGNS ====================

@router.get("/campaigns")
async def list_campaigns(current_user=Depends(get_current_user)):
    items = await db[CAMPAIGNS].find({}, {"_id": 0}).sort([("year", -1)]).to_list(length=None)
    # Add response counts
    for it in items:
        it["response_count"] = await db[RESPONSES].count_documents({"campaign_id": it.get("id")})
    return items


@router.post("/campaigns")
async def create_campaign(payload: CampaignCreate, current_user=Depends(get_current_user)):
    # One campaign per year
    existing = await db[CAMPAIGNS].find_one({"year": payload.year}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Campaign for {payload.year} already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "year": payload.year,
        "title": payload.title or f"Customer Satisfaction Survey {payload.year}",
        "form_no": payload.form_no or "QMSF 01A",
        "report_form_no": payload.report_form_no or None,
        "intro_message": payload.intro_message or DEFAULT_INTRO,
        "closing_message": payload.closing_message or DEFAULT_CLOSING,
        "status": payload.status or "Active",
        "public_token": secrets.token_urlsafe(16),
        "created_at": now,
        "updated_at": now,
        "created_by": _user_label(current_user),
    }
    await db[CAMPAIGNS].insert_one(doc)
    return _serialise(doc)


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, current_user=Depends(get_current_user)):
    doc = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return doc


@router.put("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, payload: CampaignUpdate, current_user=Depends(get_current_user)):
    existing = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = _user_label(current_user)
    await db[CAMPAIGNS].update_one({"id": campaign_id}, {"$set": update})
    return await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})


@router.post("/campaigns/{campaign_id}/rotate-token")
async def rotate_token(campaign_id: str, current_user=Depends(get_current_user)):
    existing = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    new_token = secrets.token_urlsafe(16)
    await db[CAMPAIGNS].update_one(
        {"id": campaign_id},
        {"$set": {
            "public_token": new_token,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": _user_label(current_user)
        }}
    )
    return {"public_token": new_token}


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user=Depends(get_current_user)):
    existing = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    response_count = await db[RESPONSES].count_documents({"campaign_id": campaign_id})
    if response_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete campaign with {response_count} response(s). Close it instead."
        )
    await db[CAMPAIGNS].delete_one({"id": campaign_id})
    return {"success": True}


# ==================== ADMIN: RESPONSES ====================

@router.get("/campaigns/{campaign_id}/responses")
async def list_responses(campaign_id: str, current_user=Depends(get_current_user)):
    items = await db[RESPONSES].find({"campaign_id": campaign_id}, {"_id": 0}).sort([("submitted_at", 1)]).to_list(length=None)
    for it in items:
        it["computed"] = _compute_response_pct(it)
    return items


@router.get("/responses/{response_id}")
async def get_response(response_id: str, current_user=Depends(get_current_user)):
    doc = await db[RESPONSES].find_one({"id": response_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Response not found")
    doc["computed"] = _compute_response_pct(doc)
    return doc


@router.delete("/responses/{response_id}")
async def delete_response(response_id: str, current_user=Depends(get_current_user)):
    res = await db[RESPONSES].delete_one({"id": response_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Response not found")
    return {"success": True}


# ==================== ADMIN: ANALYSIS REPORT ====================

@router.get("/campaigns/{campaign_id}/report")
async def get_campaign_report(campaign_id: str, current_user=Depends(get_current_user)):
    campaign = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    responses = await db[RESPONSES].find({"campaign_id": campaign_id}, {"_id": 0}).sort([("submitted_at", 1)]).to_list(length=None)

    company_scores = []  # [{company, contact, score, max, pct}]
    category_totals = {key: {"sum": 0, "count": 0} for key, _ in SCORED_QUESTIONS}

    for r in responses:
        comp = _compute_response_pct(r)
        company_scores.append({
            "response_id": r.get("id"),
            "response_no": r.get("response_no"),
            "company": r.get("company") or "(Unnamed)",
            "customer_name": r.get("customer_name") or "",
            "contact_email": r.get("contact_email") or "",
            "score": comp["score"],
            "max_score": comp["max_score"],
            "pct": comp["overall_pct"],
            "submitted_at": r.get("submitted_at"),
        })
        for key, _ in SCORED_QUESTIONS:
            v = r.get(key)
            if isinstance(v, int) and 1 <= v <= 5:
                category_totals[key]["sum"] += v
                category_totals[key]["count"] += 1

    category_averages = []
    for key, label in SCORED_QUESTIONS:
        tot = category_totals[key]
        avg_pct = round(tot["sum"] / tot["count"] / 5 * 100, 2) if tot["count"] > 0 else 0
        category_averages.append({"key": key, "label": label, "average_pct": avg_pct, "responses": tot["count"]})

    # Overall %
    total_score = sum(c["score"] for c in company_scores)
    max_score = sum(c["max_score"] for c in company_scores)
    overall_pct = round(total_score / max_score * 100, 2) if max_score > 0 else 0

    # Aggregate free-text feedback
    improvements = [{"company": r.get("company"), "response_no": r.get("response_no"), "text": r.get("improvements_text", "")} for r in responses if (r.get("improvements_text") or "").strip()]
    suggestions = [{"company": r.get("company"), "response_no": r.get("response_no"), "text": r.get("suggestions_text", "")} for r in responses if (r.get("suggestions_text") or "").strip()]
    additional = [{"company": r.get("company"), "response_no": r.get("response_no"), "text": r.get("additional_comments", "")} for r in responses if (r.get("additional_comments") or "").strip()]

    return {
        "campaign": campaign,
        "stats": {
            "response_count": len(responses),
            "overall_pct": overall_pct,
            "total_score": total_score,
            "max_score": max_score,
        },
        "category_averages": category_averages,
        "company_scores": sorted(company_scores, key=lambda x: -x["pct"]),
        "improvements": improvements,
        "suggestions": suggestions,
        "additional_comments": additional,
        "ai_recommendations": campaign.get("ai_recommendations") or "",
        "ai_generated_at": campaign.get("ai_generated_at") or "",
        "ai_selected_indexes": campaign.get("ai_selected_indexes") if campaign.get("ai_selected_indexes") is not None else None,
    }


@router.post("/campaigns/{campaign_id}/ai-recommendations")
async def generate_ai_recommendations(campaign_id: str, current_user=Depends(get_current_user)):
    """Use Gemini to summarise free-text feedback into Recommended Actions."""
    campaign = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI key not configured")

    responses = await db[RESPONSES].find({"campaign_id": campaign_id}, {"_id": 0}).to_list(length=None)
    if not responses:
        raise HTTPException(status_code=400, detail="No responses to analyse yet")

    # Build feedback summary for the prompt
    lines = []
    for r in responses:
        comp = _compute_response_pct(r)
        lines.append(f"\n— {r.get('company', '(unknown)')} (Score: {comp['overall_pct']}%):")
        if (r.get("improvements_text") or "").strip():
            lines.append(f"  • Improvement needed: {r['improvements_text'].strip()}")
        if (r.get("suggestions_text") or "").strip():
            lines.append(f"  • Suggestion: {r['suggestions_text'].strip()}")
        if (r.get("additional_comments") or "").strip():
            lines.append(f"  • Additional: {r['additional_comments'].strip()}")

    feedback_block = "\n".join(lines) if lines else "(no free-text feedback provided)"

    # Category averages for context
    cat_lines = []
    for key, label in SCORED_QUESTIONS:
        scores = [r.get(key) for r in responses if isinstance(r.get(key), int)]
        if scores:
            avg_pct = round(sum(scores) / len(scores) / 5 * 100, 2)
            cat_lines.append(f"  • {label}: {avg_pct}% ({len(scores)} responses)")
    cat_block = "\n".join(cat_lines) or "(no scored responses)"

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id=f"cs-recommend-{uuid.uuid4()}",
            system_message=(
                "You are an ISO 9001 quality management assistant for Ultimate Laser, "
                "an Australian metal laser cutting business. Analyse customer satisfaction "
                "survey results and produce concrete, prioritised Recommended Actions aligned "
                "with continuous improvement principles. Be specific and operational."
            )
        ).with_model("gemini", "gemini-2.5-pro")
        prompt = (
            f"Customer Satisfaction Campaign: {campaign.get('title')} (Year {campaign.get('year')})\n"
            f"Total responses: {len(responses)}\n\n"
            f"CATEGORY AVERAGES:\n{cat_block}\n\n"
            f"VERBATIM CUSTOMER FEEDBACK:\n{feedback_block}\n\n"
            f"Produce a section titled 'Recommended Actions' with 5-8 numbered, "
            f"prioritised actions. Each action should: state the action in one clear "
            f"sentence, identify the responsible role (e.g. Operations Manager, Quality "
            f"Manager, Sales), and cite the customer or category it addresses. "
            f"No preamble. End with a one-line 'Conclusion:' summary."
        )
        response_text = await chat.send_message(UserMessage(text=prompt))
        text = response_text.strip()
        now = datetime.now(timezone.utc).isoformat()
        await db[CAMPAIGNS].update_one(
            {"id": campaign_id},
            {"$set": {
                "ai_recommendations": text,
                "ai_generated_at": now,
                "ai_generated_by": _user_label(current_user),
                # Reset print-selections; user will pick from the fresh list
                "ai_selected_indexes": None,
            }}
        )
        return {"recommendations": text, "generated_at": now}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)[:200]}")


@router.put("/campaigns/{campaign_id}/ai-selections")
async def update_ai_selections(campaign_id: str, payload: AiSelectionUpdate, current_user=Depends(get_current_user)):
    """Persist which AI recommendation indexes the admin wants included on the printed report.
    selected_indexes is a list of zero-based indexes into the parsed numbered list."""
    campaign = await db[CAMPAIGNS].find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    # De-duplicate and sort
    cleaned = sorted({int(i) for i in payload.selected_indexes if isinstance(i, int) and i >= 0})
    await db[CAMPAIGNS].update_one(
        {"id": campaign_id},
        {"$set": {
            "ai_selected_indexes": cleaned,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": _user_label(current_user),
        }}
    )
    return {"ai_selected_indexes": cleaned}


# ==================== PUBLIC: SURVEY ====================

@router.get("/public/campaign/{token}")
async def public_get_campaign(token: str):
    """Public endpoint - customer opens the link, page calls this to fetch
    survey metadata (intro, status, year, title, form_no)."""
    campaign = await db[CAMPAIGNS].find_one({"public_token": token}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Survey link not found")
    if campaign.get("status") != "Active":
        return {
            "active": False,
            "title": campaign.get("title"),
            "year": campaign.get("year"),
            "form_no": campaign.get("form_no"),
            "message": "This survey has been closed. Thank you."
        }
    return {
        "active": True,
        "campaign_id": campaign.get("id"),
        "year": campaign.get("year"),
        "title": campaign.get("title"),
        "form_no": campaign.get("form_no"),
        "intro_message": campaign.get("intro_message"),
        "closing_message": campaign.get("closing_message"),
    }


@router.post("/public/submit/{token}")
async def public_submit_response(token: str, payload: ResponseSubmit, request: Request):
    campaign = await db[CAMPAIGNS].find_one({"public_token": token}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Survey link not found")
    if campaign.get("status") != "Active":
        raise HTTPException(status_code=400, detail="This survey is closed")

    # Validate score range 1-5
    for key, _ in SCORED_QUESTIONS:
        v = getattr(payload, key, None)
        if v is not None and not (1 <= int(v) <= 5):
            raise HTTPException(status_code=400, detail=f"{key} must be between 1 and 5")

    response_no = await _next_response_no(campaign["year"])
    now = datetime.now(timezone.utc).isoformat()

    # Best-effort IP capture (audit trail)
    submitter_ip = request.client.host if request and request.client else ""
    if "x-forwarded-for" in request.headers:
        submitter_ip = request.headers["x-forwarded-for"].split(",")[0].strip()

    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "response_no": response_no,
        "campaign_id": campaign["id"],
        "campaign_year": campaign["year"],
        "submitted_at": now,
        "submitter_ip": submitter_ip,
    })
    await db[RESPONSES].insert_one(doc)
    doc.pop("_id", None)
    return {
        "success": True,
        "response_no": response_no,
        "message": campaign.get("closing_message") or DEFAULT_CLOSING,
    }


# ==================== METADATA ====================

@router.get("/meta/questions")
async def get_question_metadata(current_user=Depends(get_current_user)):
    """Return the scored question metadata (keys + labels) used in reports."""
    return {"scored_questions": [{"key": k, "label": label} for k, label in SCORED_QUESTIONS]}
