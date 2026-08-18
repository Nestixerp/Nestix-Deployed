"""IMS Risk & Opportunities Register — supports ISO 9001 / 14001 / 45001.

Auto-incrementing RO-NNNN IDs, file attachments, automatic risk-rating /
risk-level calculation, validation rules, role-based permissions and CSV export.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import io
import csv
import uuid
import base64
from auth import get_current_user

router = APIRouter(prefix="/api/risk-opportunities", tags=["Risk & Opportunities"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]
COL = "risk_opportunities"
CTRS = "ncr_counters"
FILES = "risk_opportunity_files"

# --- Reference data ----------------------------------------------------------

AREAS = ["Quality", "Safety", "Environment", "Compliance", "Supplier", "Customer", "Equipment", "Process", "Business", "Training", "Document Control"]
TYPES = ["Risk", "Opportunity"]
SOURCES = [
    "General IMS Review", "NCR", "Customer Complaint", "Internal Audit", "External Audit",
    "Near Miss / Hazard", "Management Review", "Supplier Review", "Legal Compliance Review",
    "Environmental Aspects & Impacts", "Equipment / Maintenance", "Training / Competency",
    "Document Control", "Customer Satisfaction",
]
LINKED_MODULES = [
    "NCR Register", "ISO Audits", "Audit Schedule", "Near Miss / Hazard", "Management Review",
    "Customer Complaints", "Supplier Reviews", "Environmental Aspects & Impacts",
    "Legal Requirements", "Calibration", "Training Matrix", "Document Control", "Other",
]
INTERESTED_PARTIES = ["Customer", "Employee", "Supplier", "Regulator", "Community", "Business"]
PROCESSES = ["Production", "Purchasing", "Sales", "Dispatch", "HR", "Maintenance", "IMS", "Quality", "Safety", "Environment", "Administration", "Other"]
TREATMENT_DECISIONS = ["Accept", "Reduce", "Transfer", "Avoid", "Pursue Opportunity"]
ACTION_STATUSES = ["Not Started", "In Progress", "Completed", "Not Required"]
REVIEW_FREQUENCIES = ["Monthly", "Quarterly", "Six Monthly", "Annually"]
STATUSES = ["Open", "Monitoring", "Closed"]
LIKELIHOOD_LABELS = {1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost Certain"}
CONSEQUENCE_LABELS = {1: "Minor", 2: "Moderate", 3: "Significant", 4: "Major", 5: "Severe"}


def _risk_level(rating: Optional[int]) -> Optional[str]:
    if rating is None:
        return None
    if rating <= 4:
        return "Low"
    if rating <= 9:
        return "Medium"
    if rating <= 16:
        return "High"
    return "Extreme"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _next_ro_no() -> int:
    res = await db[CTRS].find_one_and_update(
        {"_id": "ro_no"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int((res or {}).get("seq", 1))


# --- Models ------------------------------------------------------------------

class Attachment(BaseModel):
    id: str
    filename: str
    size: int
    uploaded_at: Optional[str] = None


class RiskOpportunityIn(BaseModel):
    # Identification
    date_raised: Optional[str] = None
    raised_by: Optional[str] = None
    area: Optional[str] = None
    type: Optional[str] = None  # "Risk" | "Opportunity"
    source: Optional[str] = None
    linked_module: Optional[str] = None
    linked_record_id: Optional[str] = None
    # Details
    title: str = ""
    description: Optional[str] = None
    potential_impact: Optional[str] = None
    existing_controls: Optional[str] = None
    interested_parties: List[str] = Field(default_factory=list)
    process_affected: Optional[str] = None
    # Risk rating
    likelihood: Optional[int] = None
    consequence: Optional[int] = None
    # Treatment
    treatment_decision: Optional[str] = None
    further_action_required: Optional[str] = None  # "Yes" | "No"
    proposed_action: Optional[str] = None
    responsible_person: Optional[str] = None
    due_date: Optional[str] = None
    action_status: Optional[str] = "Not Started"
    # Review
    review_frequency: Optional[str] = None
    next_review_date: Optional[str] = None
    review_comments: Optional[str] = None
    residual_likelihood: Optional[int] = None
    residual_consequence: Optional[int] = None
    # Closure
    status: Optional[str] = "Open"
    closure_notes: Optional[str] = None
    closed_by: Optional[str] = None
    closed_date: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate(self):
        # Title, Area, Type, Source, Description, Existing Controls, Likelihood, Consequence are mandatory
        required = {
            "title": self.title,
            "area": self.area,
            "type": self.type,
            "source": self.source,
            "description": self.description,
            "existing_controls": self.existing_controls,
            "likelihood": self.likelihood,
            "consequence": self.consequence,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            raise ValueError(f"Missing mandatory field(s): {', '.join(missing)}")
        if self.likelihood and (self.likelihood < 1 or self.likelihood > 5):
            raise ValueError("likelihood must be 1..5")
        if self.consequence and (self.consequence < 1 or self.consequence > 5):
            raise ValueError("consequence must be 1..5")
        if self.further_action_required == "Yes":
            if not self.proposed_action or not self.responsible_person or not self.due_date:
                raise ValueError("When Further Action Required is Yes, Proposed Action, Responsible Person and Due Date are mandatory")
        if self.treatment_decision == "Pursue Opportunity" and self.type != "Opportunity":
            raise ValueError("Treatment Decision 'Pursue Opportunity' requires Type = Opportunity")
        if self.status == "Closed":
            if not self.closure_notes or not self.closed_by or not self.closed_date:
                raise ValueError("When Status is Closed, Closure Notes, Closed By and Closed Date are mandatory")
        return self


def _compute_derived(d: Dict[str, Any]) -> Dict[str, Any]:
    if d.get("likelihood") and d.get("consequence"):
        d["risk_rating"] = int(d["likelihood"]) * int(d["consequence"])
        d["risk_level"] = _risk_level(d["risk_rating"])
    else:
        d["risk_rating"] = None
        d["risk_level"] = None
    if d.get("residual_likelihood") and d.get("residual_consequence"):
        d["residual_rating"] = int(d["residual_likelihood"]) * int(d["residual_consequence"])
        d["residual_risk_level"] = _risk_level(d["residual_rating"])
    else:
        d["residual_rating"] = None
        d["residual_risk_level"] = None
    # Auto-fill closed_date when closed
    if d.get("status") == "Closed" and not d.get("closed_date"):
        d["closed_date"] = date.today().isoformat()
    return d


# --- Permissions -------------------------------------------------------------

def _can_edit(user: dict, record: dict) -> bool:
    role = (user or {}).get("role")
    if role in ("Administrator", "Manager"):
        return True
    if record.get("status") == "Closed":
        return False
    # Standard users may edit only own records while open
    return record.get("created_by") == user.get("username")


def _can_delete(user: dict) -> bool:
    return (user or {}).get("role") == "Administrator"


def _can_close(user: dict) -> bool:
    return (user or {}).get("role") in ("Administrator", "Manager")


# --- Endpoints ---------------------------------------------------------------

@router.get("/reference")
async def reference(current_user=Depends(get_current_user)):
    return {
        "areas": AREAS, "types": TYPES, "sources": SOURCES,
        "linked_modules": LINKED_MODULES, "interested_parties": INTERESTED_PARTIES,
        "processes": PROCESSES, "treatment_decisions": TREATMENT_DECISIONS,
        "action_statuses": ACTION_STATUSES, "review_frequencies": REVIEW_FREQUENCIES,
        "statuses": STATUSES,
        "likelihood_labels": LIKELIHOOD_LABELS,
        "consequence_labels": CONSEQUENCE_LABELS,
    }


@router.get("/users")
async def list_users(current_user=Depends(get_current_user)):
    """Return employees as the canonical people source for dropdowns."""
    rows = await db.employees.find(
        {"status": {"$ne": "Terminated"}},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "role": 1, "department": 1},
    ).sort([("last_name", 1), ("first_name", 1)]).to_list(length=5000)
    return rows


@router.get("/stats")
async def stats(current_user=Depends(get_current_user)):
    today = date.today().isoformat()
    in_30 = (date.today().toordinal() + 30)
    open_count = await db[COL].count_documents({"status": {"$in": ["Open", "Monitoring"]}})
    high_extreme = await db[COL].count_documents({"risk_level": {"$in": ["High", "Extreme"]}, "status": {"$ne": "Closed"}})
    overdue = await db[COL].count_documents({"due_date": {"$lt": today, "$ne": None}, "action_status": {"$nin": ["Completed", "Not Required"]}})
    # Reviews due in next 30 days
    reviews_due = 0
    cursor = db[COL].find({"next_review_date": {"$gte": today, "$ne": None}, "status": {"$ne": "Closed"}}, {"_id": 0, "next_review_date": 1})
    async for d in cursor:
        try:
            if date.fromisoformat(d["next_review_date"]).toordinal() <= in_30:
                reviews_due += 1
        except Exception:
            pass
    # Group by area / source / status
    by_area: Dict[str, int] = {}
    by_source: Dict[str, int] = {}
    by_status: Dict[str, int] = {}
    async for rec in db[COL].find({}, {"_id": 0, "area": 1, "source": 1, "status": 1}):
        by_area[rec.get("area") or "—"] = by_area.get(rec.get("area") or "—", 0) + 1
        by_source[rec.get("source") or "—"] = by_source.get(rec.get("source") or "—", 0) + 1
        by_status[rec.get("status") or "—"] = by_status.get(rec.get("status") or "—", 0) + 1
    return {
        "open": open_count, "high_extreme": high_extreme,
        "overdue_actions": overdue, "reviews_due_30": reviews_due,
        "by_area": by_area, "by_source": by_source, "by_status": by_status,
    }


@router.get("")
async def list_records(
    search: Optional[str] = None,
    area: Optional[str] = None,
    type: Optional[str] = None,
    source: Optional[str] = None,
    risk_level: Optional[str] = None,
    residual_risk_level: Optional[str] = None,
    responsible_person: Optional[str] = None,
    status: Optional[str] = None,
    linked_module: Optional[str] = None,
    overdue: Optional[bool] = False,
    review_due: Optional[bool] = False,
    current_user=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if area:
        q["area"] = area
    if type:
        q["type"] = type
    if source:
        q["source"] = source
    if risk_level:
        q["risk_level"] = risk_level
    if residual_risk_level:
        q["residual_risk_level"] = residual_risk_level
    if responsible_person:
        q["responsible_person"] = responsible_person
    if status:
        q["status"] = status
    if linked_module:
        q["linked_module"] = linked_module
    if overdue:
        q["due_date"] = {"$lt": date.today().isoformat(), "$ne": None}
        q["action_status"] = {"$nin": ["Completed", "Not Required"]}
    if review_due:
        in30 = date.fromordinal(date.today().toordinal() + 30).isoformat()
        q["next_review_date"] = {"$lte": in30, "$ne": None}
        q["status"] = {"$ne": "Closed"}
    if search:
        s = search.strip()
        ors = [
            {"title": {"$regex": s, "$options": "i"}},
            {"description": {"$regex": s, "$options": "i"}},
            {"ro_id": {"$regex": s, "$options": "i"}},
            {"linked_record_id": {"$regex": s, "$options": "i"}},
        ]
        q["$or"] = ors
    items = await db[COL].find(q, {"_id": 0}).sort("ro_no", -1).to_list(length=5000)
    return {"items": items, "count": len(items)}


@router.get("/export.csv")
async def export_csv(current_user=Depends(get_current_user)):
    items = await db[COL].find({}, {"_id": 0}).sort("ro_no", 1).to_list(length=10000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "ID", "Date Raised", "Raised By", "Area", "Type", "Source", "Linked Module", "Linked Record ID",
        "Title", "Description", "Potential Impact", "Existing Controls", "Interested Parties", "Process Affected",
        "Likelihood", "Consequence", "Risk Rating", "Risk Level",
        "Treatment Decision", "Further Action Required", "Proposed Action", "Responsible Person", "Due Date", "Action Status",
        "Review Frequency", "Next Review Date", "Review Comments",
        "Residual Likelihood", "Residual Consequence", "Residual Rating", "Residual Risk Level",
        "Status", "Closure Notes", "Closed By", "Closed Date",
    ])
    for r in items:
        w.writerow([
            r.get("ro_id"), r.get("date_raised"), r.get("raised_by"), r.get("area"), r.get("type"),
            r.get("source"), r.get("linked_module"), r.get("linked_record_id"),
            r.get("title"), r.get("description"), r.get("potential_impact"), r.get("existing_controls"),
            ", ".join(r.get("interested_parties") or []), r.get("process_affected"),
            r.get("likelihood"), r.get("consequence"), r.get("risk_rating"), r.get("risk_level"),
            r.get("treatment_decision"), r.get("further_action_required"), r.get("proposed_action"),
            r.get("responsible_person"), r.get("due_date"), r.get("action_status"),
            r.get("review_frequency"), r.get("next_review_date"), r.get("review_comments"),
            r.get("residual_likelihood"), r.get("residual_consequence"), r.get("residual_rating"), r.get("residual_risk_level"),
            r.get("status"), r.get("closure_notes"), r.get("closed_by"), r.get("closed_date"),
        ])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=risk_opportunities.csv"})


@router.post("")
async def create_record(payload: RiskOpportunityIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc = _compute_derived(doc)
    no = await _next_ro_no()
    doc["ro_no"] = no
    doc["ro_id"] = f"RO-{no:04d}"
    doc["id"] = str(uuid.uuid4())
    doc["created_by"] = current_user.get("username")
    doc["created_at"] = doc["updated_at"] = _now()
    if not doc.get("date_raised"):
        doc["date_raised"] = date.today().isoformat()
    if not doc.get("raised_by"):
        doc["raised_by"] = current_user.get("username") or "—"
    await db[COL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/{ro_id}")
async def get_record(ro_id: str, current_user=Depends(get_current_user)):
    doc = await db[COL].find_one({"id": ro_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.put("/{ro_id}")
async def update_record(ro_id: str, payload: RiskOpportunityIn, current_user=Depends(get_current_user)):
    existing = await db[COL].find_one({"id": ro_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not _can_edit(current_user, existing):
        raise HTTPException(403, "You do not have permission to edit this record")
    if payload.status == "Closed" and not _can_close(current_user):
        raise HTTPException(403, "Only Admin or Manager users can close records")
    upd = payload.model_dump()
    upd = _compute_derived(upd)
    upd["updated_at"] = _now()
    await db[COL].update_one({"id": ro_id}, {"$set": upd})
    return await db[COL].find_one({"id": ro_id}, {"_id": 0})


@router.delete("/{ro_id}")
async def delete_record(ro_id: str, current_user=Depends(get_current_user)):
    if not _can_delete(current_user):
        raise HTTPException(403, "Only Administrators can delete records")
    existing = await db[COL].find_one({"id": ro_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    # cascade delete file attachments
    for att in existing.get("attachments") or []:
        await db[FILES].delete_one({"id": att.get("id")})
    await db[COL].delete_one({"id": ro_id})
    return {"success": True}


@router.post("/{ro_id}/attachments")
async def upload_attachment(ro_id: str, file: UploadFile = File(...), current_user=Depends(get_current_user)):
    existing = await db[COL].find_one({"id": ro_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not _can_edit(current_user, existing):
        raise HTTPException(403, "You cannot upload to this record")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 20 MB)")
    fid = str(uuid.uuid4())
    await db[FILES].insert_one({
        "id": fid,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(data),
        "data_b64": base64.b64encode(data).decode("ascii"),
        "uploaded_at": _now(),
        "uploaded_by": current_user.get("username"),
        "ro_id": ro_id,
    })
    att = {"id": fid, "filename": file.filename, "size": len(data), "uploaded_at": _now()}
    await db[COL].update_one({"id": ro_id}, {"$push": {"attachments": att}, "$set": {"updated_at": _now()}})
    return att


@router.get("/attachments/{file_id}")
async def download_attachment(file_id: str, current_user=Depends(get_current_user)):
    f = await db[FILES].find_one({"id": file_id})
    if not f:
        raise HTTPException(404, "File not found")
    return Response(
        base64.b64decode(f["data_b64"]),
        media_type=f.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename={f.get('filename', 'file')}"},
    )


@router.delete("/{ro_id}/attachments/{file_id}")
async def delete_attachment(ro_id: str, file_id: str, current_user=Depends(get_current_user)):
    existing = await db[COL].find_one({"id": ro_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not _can_edit(current_user, existing):
        raise HTTPException(403, "You cannot modify this record")
    await db[FILES].delete_one({"id": file_id})
    await db[COL].update_one({"id": ro_id}, {"$pull": {"attachments": {"id": file_id}}, "$set": {"updated_at": _now()}})
    return {"success": True}
