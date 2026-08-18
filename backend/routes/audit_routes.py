from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from typing import List
from datetime import datetime, timezone
from models import (AuditReport, AuditReportCreate, AuditReportUpdate, 
                   AuditFinding, AuditFindingCreate, AuditFindingUpdate,
                   FollowUpItem, FollowUpItemCreate, FollowUpItemUpdate)
from auth import get_current_user, check_module_access
from services.pdf_generator import generate_audit_pdf
from services.audit_trail import log_trail, get_trail
import os
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/audits", tags=["Audits"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Default ISO clauses structure
DEFAULT_CLAUSES = [
    {"clause_number": "1.0", "clause_title": "Management of Previous Audit Issues", "iso_clause_reference": ""},
    {"clause_number": "2.1", "clause_title": "Context of the Organisation, IMS Scope and Process Interaction", "iso_clause_reference": "ISO 9001:2015 4.1-4.4 / ISO 14001:2015 4.1-4.4 / ISO 45001:2018 4.1-4.4"},
    {"clause_number": "2.2", "clause_title": "Documented Information Requirements", "iso_clause_reference": "ISO 9001:2015 7.5 / ISO 14001:2015 7.5 / ISO 45001:2018 7.5"},
    {"clause_number": "2.3", "clause_title": "Quality / Environmental / OHS Manual", "iso_clause_reference": ""},
    {"clause_number": "2.4", "clause_title": "Documented Information Procedure", "iso_clause_reference": ""},
    {"clause_number": "2.5", "clause_title": "Records", "iso_clause_reference": "ISO 9001:2015 7.5.3 / ISO 14001:2015 7.5 / ISO 45001:2018 7.5"},
    {"clause_number": "2.6", "clause_title": "Management Review", "iso_clause_reference": "ISO 9001:2015 9.3 / ISO 14001:2015 9.3 / ISO 45001:2018 9.3"},
    {"clause_number": "2.7", "clause_title": "Leadership & Commitment", "iso_clause_reference": "ISO 9001:2015 5.1 / ISO 14001:2015 5.1 / ISO 45001:2018 5.1"},
    {"clause_number": "2.8", "clause_title": "Quality / Environmental / OHS Policy", "iso_clause_reference": "ISO 9001:2015 5.2 / ISO 14001:2015 5.2 / ISO 45001:2018 5.2"},
    {"clause_number": "2.9", "clause_title": "Objectives & Planning", "iso_clause_reference": "ISO 9001:2015 6.2 / ISO 14001:2015 6.2 / ISO 45001:2018 6.2"},
    {"clause_number": "2.10", "clause_title": "Risk Management", "iso_clause_reference": "ISO 9001:2015 6.1 / ISO 14001:2015 6.1 / ISO 45001:2018 6.1"},
    {"clause_number": "2.11", "clause_title": "Competence & Training", "iso_clause_reference": "ISO 9001:2015 7.2 / ISO 14001:2015 7.2 / ISO 45001:2018 7.2"},
    {"clause_number": "2.12", "clause_title": "Communication & Consultation", "iso_clause_reference": "ISO 9001:2015 7.4 / ISO 14001:2015 7.4 / ISO 45001:2018 7.4"},
    {"clause_number": "2.13", "clause_title": "Operational Control", "iso_clause_reference": "ISO 9001:2015 8.1 / ISO 14001:2015 8.1 / ISO 45001:2018 8.1"},
    {"clause_number": "2.14", "clause_title": "Customer Requirements", "iso_clause_reference": "ISO 9001:2015 8.2"},
    {"clause_number": "2.15", "clause_title": "Purchasing / Outsourcing", "iso_clause_reference": "ISO 9001:2015 8.4"},
    {"clause_number": "2.16", "clause_title": "Production & Service Provision", "iso_clause_reference": "ISO 9001:2015 8.5"},
    {"clause_number": "2.17", "clause_title": "Control of Monitoring & Measuring Equipment", "iso_clause_reference": "ISO 9001:2015 7.1.5"},
    {"clause_number": "2.18", "clause_title": "Monitoring & Measurement", "iso_clause_reference": "ISO 9001:2015 9.1 / ISO 14001:2015 9.1 / ISO 45001:2018 9.1"},
    {"clause_number": "2.19", "clause_title": "Internal Audit", "iso_clause_reference": "ISO 9001:2015 9.2 / ISO 14001:2015 9.2 / ISO 45001:2018 9.2"},
    {"clause_number": "2.20", "clause_title": "Non-Conformity & Corrective Action", "iso_clause_reference": "ISO 9001:2015 10.2 / ISO 14001:2015 10.2 / ISO 45001:2018 10.2"},
    {"clause_number": "2.21", "clause_title": "Continual Improvement", "iso_clause_reference": "ISO 9001:2015 10.3 / ISO 14001:2015 10.3 / ISO 45001:2018 10.3"},
    {"clause_number": "2.22", "clause_title": "Customer Satisfaction", "iso_clause_reference": "ISO 9001:2015 9.1.2"},
    {"clause_number": "2.23", "clause_title": "Use of Logos / Certification Marks", "iso_clause_reference": "ISO 9001:2015 8.5.5 / ISO 14001:2015 7.4.3 / ISO 45001:2018 7.4.3"},
    {"clause_number": "2.24", "clause_title": "Emergency Preparedness & Response", "iso_clause_reference": "ISO 14001:2015 8.2 / ISO 45001:2018 8.2"},
    {"clause_number": "2.25", "clause_title": "Compliance Obligations / Legal Register Review", "iso_clause_reference": "ISO 14001:2015 6.1.3 / ISO 45001:2018 6.1.3"},
    {"clause_number": "2.26", "clause_title": "Environmental Aspects & Impacts", "iso_clause_reference": "ISO 14001:2015 6.1.2"},
    {"clause_number": "2.27", "clause_title": "Hazard Identification & OHS Risk Control", "iso_clause_reference": "ISO 45001:2018 6.1.2"},
    {"clause_number": "2.28", "clause_title": "Consultation with Workers (OHS-specific)", "iso_clause_reference": "ISO 45001:2018 5.4"},
    {"clause_number": "2.29", "clause_title": "Supplier Performance Review", "iso_clause_reference": "ISO 9001:2015 8.4.3"},
    {"clause_number": "2.30", "clause_title": "Digital IMS & ERP System Controls", "iso_clause_reference": "ISO 9001:2015 7.5 / ISO 14001:2015 7.5 / ISO 45001:2018 7.5"},
    {"clause_number": "2.31", "clause_title": "Automated Registers & System Alerts", "iso_clause_reference": "ISO 9001:2015 7.5.3 / ISO 14001:2015 7.5 / ISO 45001:2018 7.5"},
    {"clause_number": "2.32", "clause_title": "Nesting Module & Operational Planning", "iso_clause_reference": "ISO 9001:2015 8.1 / ISO 14001:2015 8.1"},
    {"clause_number": "2.33", "clause_title": "Production Traceability & Material Location", "iso_clause_reference": "ISO 9001:2015 8.5.2"},
    {"clause_number": "2.34", "clause_title": "Offcut Inventory Management", "iso_clause_reference": "ISO 9001:2015 8.5.2 / ISO 14001:2015 8.1"},
    {"clause_number": "2.35", "clause_title": "ERP-based NCR & Corrective Action Workflow", "iso_clause_reference": "ISO 9001:2015 10.2 / ISO 14001:2015 10.2 / ISO 45001:2018 10.2"},
    {"clause_number": "2.36", "clause_title": "Supplier Performance Metrics (Automated)", "iso_clause_reference": "ISO 9001:2015 8.4.3"},
    {"clause_number": "2.37", "clause_title": "Change Management (MoC)", "iso_clause_reference": "ISO 9001:2015 6.3 / ISO 14001:2015 6.1 & 8.1 / ISO 45001:2018 8.1.3"},
    {"clause_number": "2.38", "clause_title": "IT Backup & Disaster Recovery", "iso_clause_reference": "ISO 9001:2015 7.5.3"},
    {"clause_number": "2.39", "clause_title": "KPI Dashboard & Data Analytics", "iso_clause_reference": "ISO 9001:2015 9.1 / ISO 14001:2015 9.1 / ISO 45001:2018 9.1"},
    {"clause_number": "2.40", "clause_title": "ERP Access Control & Security", "iso_clause_reference": "ISO 9001:2015 7.5.3 / ISO 14001:2015 7.5 / ISO 45001:2018 7.5"},
    {"clause_number": "2.41", "clause_title": "Audit Trail / Change History Review", "iso_clause_reference": "ISO 9001:2015 7.5.3 / ISO 14001:2015 7.5 / ISO 45001:2018 7.5"},
    {"clause_number": "3.0", "clause_title": "Follow-Up Work", "iso_clause_reference": ""},
    {"clause_number": "4.0", "clause_title": "Conclusion & Recommendations", "iso_clause_reference": ""}
]

# Audit Reports CRUD
@router.get("", response_model=List[AuditReport])
async def get_audit_reports(
    current_user: dict = Depends(get_current_user),
    limit: int = 50
):
    """Get audit reports with pagination for performance"""
    check_module_access(current_user, "quality_audits")
    
    # Fetch only summary data (exclude large findings arrays for list view)
    reports = await db.audit_reports.find(
        {},
        {
            "_id": 1,
            "id": 1, 
            "report_number": 1,
            "auditor_name": 1,
            "client_name": 1,
            "audit_start_date": 1,
            "audit_end_date": 1,
            "report_date": 1,
            "status": 1,
            "created_at": 1,
            "assessed_sites": 1,
            "standards_audited": 1,
            "scope_of_audit": 1,
            "created_by": 1,
            "updated_at": 1,
            "report_type": 1
            # Exclude findings array for performance
        }
    ).sort("report_date", -1).limit(limit).to_list(limit)
    
    # Add empty findings array for Pydantic validation
    for report in reports:
        report['findings'] = []
    
    return [AuditReport(**report) for report in reports]

@router.get("/{report_id}", response_model=AuditReport)
async def get_audit_report(report_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific audit report"""
    check_module_access(current_user, "quality_audits")
    
    report = await db.audit_reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit report not found")
    
    return AuditReport(**report)

@router.post("", response_model=AuditReport, status_code=status.HTTP_201_CREATED)
async def create_audit_report(audit_data: AuditReportCreate, current_user: dict = Depends(get_current_user)):
    """Create a new audit report with default clauses"""
    check_module_access(current_user, "quality_audits")
    
    # Create audit report
    audit_dict = audit_data.dict()
    audit_dict['created_by'] = current_user.get('username', 'system')
    audit_dict['id'] = str(datetime.now().timestamp()).replace('.', '')
    audit_dict['created_at'] = datetime.now(timezone.utc)
    audit_dict['updated_at'] = datetime.now(timezone.utc)
    
    # Remove _id if present to avoid MongoDB issues
    audit_dict.pop('_id', None)
    
    # Insert audit report
    await db.audit_reports.insert_one(audit_dict)
    
    # Create default findings for all clauses
    for clause in DEFAULT_CLAUSES:
        finding_dict = {
            'id': str(datetime.now().timestamp()).replace('.', '') + str(len(DEFAULT_CLAUSES)),
            'report_id': audit_dict['id'],
            'clause_number': clause['clause_number'],
            'clause_title': clause['clause_title'],
            'iso_clause_reference': clause['iso_clause_reference'],
            'evidence': '',
            'findings': '',
            'finding_type': 'Conformity',
            'ofi_reference': None,
            'ncr_number': None,
            'ncr_date': None,
            'ncr_customer_supplier': None,
            'ncr_root_cause': None,
            'ncr_action_taken': None,
            'is_follow_up_required': False,
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc)
        }
        finding_dict.pop('_id', None)
        await db.audit_findings.insert_one(finding_dict)
    
    return AuditReport(**audit_dict)

@router.put("/{report_id}", response_model=AuditReport)
async def update_audit_report(report_id: str, audit_data: AuditReportUpdate, current_user: dict = Depends(get_current_user)):
    """Update an audit report"""
    check_module_access(current_user, "quality_audits")
    
    # Check if report exists
    existing_report = await db.audit_reports.find_one({"id": report_id})
    if not existing_report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit report not found")
    
    # Update fields
    update_data = audit_data.dict(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    await db.audit_reports.update_one({"id": report_id}, {"$set": update_data})
    
    updated_report = await db.audit_reports.find_one({"id": report_id})
    return AuditReport(**updated_report)

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audit_report(report_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an audit report and all its findings"""
    check_module_access(current_user, "quality_audits")
    
    # Delete the report
    result = await db.audit_reports.delete_one({"id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit report not found")
    
    # Delete all findings for this report
    await db.audit_findings.delete_many({"report_id": report_id})
    
    # Delete all follow-up items for this report
    await db.follow_up_items.delete_many({"report_id": report_id})
    
    return None

# Audit Findings CRUD
@router.get("/{report_id}/findings", response_model=List[AuditFinding])
async def get_audit_findings(report_id: str, current_user: dict = Depends(get_current_user)):
    """Get all findings for a specific audit report"""
    check_module_access(current_user, "quality_audits")
    
    findings = await db.audit_findings.find({"report_id": report_id}).to_list(length=None)
    def _ck(f):
        try:
            return [int(p) for p in str(f.get("clause_number", "0")).split(".")]
        except ValueError:
            return [999]
    findings.sort(key=_ck)
    return [AuditFinding(**finding) for finding in findings]

@router.put("/findings/{finding_id}", response_model=AuditFinding)
async def update_audit_finding(finding_id: str, finding_data: AuditFindingUpdate, current_user: dict = Depends(get_current_user)):
    """Update an audit finding"""
    check_module_access(current_user, "quality_audits")
    
    # Check if finding exists
    existing_finding = await db.audit_findings.find_one({"id": finding_id})
    if not existing_finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit finding not found")
    
    # Block edits when the parent audit is locked
    parent = await db.audit_reports.find_one({"id": existing_finding["report_id"]})
    if parent and parent.get("locked"):
        raise HTTPException(status_code=423, detail="Audit is locked. Reopen it before editing.")
    
    # Update fields
    update_data = finding_data.dict(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    await db.audit_findings.update_one({"id": finding_id}, {"$set": update_data})
    
    # Audit trail for material changes
    for fld, action in (("finding_type", "finding_changed"), ("status", "status_changed"), ("evidence", "evidence_added")):
        if fld in update_data and update_data[fld] != existing_finding.get(fld):
            await log_trail(current_user, action, "finding", finding_id,
                            old_value=existing_finding.get(fld), new_value=update_data[fld],
                            summary=f"Clause {existing_finding.get('clause_number')} — {existing_finding.get('clause_title')}")
    
    updated_finding = await db.audit_findings.find_one({"id": finding_id})
    return AuditFinding(**updated_finding)

# Follow-up Items
@router.get("/{report_id}/follow-ups", response_model=List[FollowUpItem])
async def get_follow_up_items(report_id: str, current_user: dict = Depends(get_current_user)):
    """Get all follow-up items for a specific audit report"""
    check_module_access(current_user, "quality_audits")
    
    items = await db.follow_up_items.find({"report_id": report_id}).to_list(length=None)
    return [FollowUpItem(**item) for item in items]

@router.post("/{report_id}/follow-ups", response_model=FollowUpItem, status_code=status.HTTP_201_CREATED)
async def create_follow_up_item(follow_up_data: FollowUpItemCreate, current_user: dict = Depends(get_current_user)):
    """Create a new follow-up item"""
    check_module_access(current_user, "quality_audits")
    
    item_dict = follow_up_data.dict()
    item_dict['id'] = str(datetime.now().timestamp()).replace('.', '')
    item_dict['created_at'] = datetime.now(timezone.utc)
    item_dict['updated_at'] = datetime.now(timezone.utc)
    
    item_dict.pop('_id', None)
    await db.follow_up_items.insert_one(item_dict)
    


# PDF Generation
def _norm_module(s: str) -> str:
    """Case/punctuation-insensitive normaliser used to match Document Control
    `related_module` values (e.g. 'ISO Audit Report', 'Audit Schedule')."""
    if not s:
        return ''
    return ''.join(ch for ch in str(s).lower() if ch.isalnum())


async def _resolve_doc_control_for_module(primary: str, fallback: str = '', doc_type: str = '') -> dict:
    """Look up the active Document Control register entry that drives a
    printed form's footer (Form No / Issue / Revision Date / Owner / Title).

    Tries strict match on the canonical `primary` key first, then falls
    back to a legacy short name (`fallback`), disambiguating multiple
    legacy matches by `doc_type` ('Form' / 'Register')."""
    docs = await db.document_register.find({}).to_list(length=None)
    p = _norm_module(primary)
    # Strict pass
    for d in docs:
        if _norm_module(d.get('related_module')) == p:
            d.pop('_id', None)
            return d
    # Legacy fallback pass
    fb = _norm_module(fallback)
    if fb:
        candidates = [d for d in docs if _norm_module(d.get('related_module')) == fb]
        if len(candidates) == 1:
            candidates[0].pop('_id', None)
            return candidates[0]
        if len(candidates) > 1:
            if doc_type:
                dt = doc_type.lower()
                typed = next((c for c in candidates if str(c.get('doc_type') or '').lower() == dt), None)
                if typed:
                    typed.pop('_id', None)
                    return typed
            candidates[0].pop('_id', None)
            return candidates[0]
    return {}


@router.get("/{report_id}/pdf")
async def generate_audit_report_pdf(report_id: str, current_user: dict = Depends(get_current_user)):
    """Generate PDF for audit report matching John Tsoukalas template"""
    check_module_access(current_user, "quality_audits")
    
    # Get audit report
    audit = await db.audit_reports.find_one({"id": report_id})
    if not audit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit report not found")
    
    # Get all findings for this audit
    findings = await db.audit_findings.find({"report_id": report_id}).sort("clause_number").to_list(length=None)
    
    # Remove MongoDB _id fields
    audit.pop('_id', None)
    for finding in findings:
        finding.pop('_id', None)
    
    # Look up the Document Control entry to drive the footer
    doc_control = await _resolve_doc_control_for_module(
        primary='ISO Audit Report',
        fallback='ISO Audits',
        doc_type='Form',
    )
    audit['doc_control'] = doc_control  # consumed by FooterCanvas via audit_info.get('doc_control')
    
    # Generate PDF
    try:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Generating PDF for audit report: {report_id}")
        logger.info(f"Found {len(findings)} findings")
        logger.info(f"Doc control entry: {doc_control.get('form_no')} / Issue {doc_control.get('issue')}")
        
        samples = await db.audit_samples.find({"report_id": report_id}, {"_id": 0}).to_list(length=1000)
        pdf_buffer = generate_audit_pdf(audit, findings, samples)
        
        # Create filename
        report_number = audit['report_number'].replace(' ', '_')
        filename = f"Audit_Report_{report_number}.pdf"
        
        logger.info(f"PDF generated successfully: {filename}")
        
        # Return PDF as streaming response
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        import traceback
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error generating PDF for report {report_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF: {str(e)}"
        )

    return FollowUpItem(**item_dict)

# ═══════════════ IMS FRAMEWORK EXTENSIONS ═══════════════
from pydantic import BaseModel as _BM
from typing import Optional as _Opt
import uuid as _uuid


class SampleIn(_BM):
    report_id: str
    finding_id: _Opt[str] = None
    sample_type: str = "Other"
    sample_id: _Opt[str] = None
    name: _Opt[str] = None                 # customer / supplier / asset / employee name
    document_number: _Opt[str] = None
    job_number: _Opt[str] = None
    purchase_order_number: _Opt[str] = None
    location: _Opt[str] = None
    date_checked: _Opt[str] = None
    result: _Opt[str] = None               # OK / Issue found / N/A
    notes: _Opt[str] = None
    attachments: _Opt[list] = None


class LockIn(_BM):
    reason: _Opt[str] = None


class ReopenIn(_BM):
    reason: str
    authorised_by: str


@router.get("/{report_id}/samples")
async def list_samples(report_id: str, finding_id: str = None, current_user: dict = Depends(get_current_user)):
    q = {"report_id": report_id}
    if finding_id:
        q["finding_id"] = finding_id
    items = await db.audit_samples.find(q, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    return {"items": items}


@router.post("/{report_id}/samples")
async def add_sample(report_id: str, payload: SampleIn, current_user: dict = Depends(get_current_user)):
    audit = await db.audit_reports.find_one({"id": report_id})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    if audit.get("locked"):
        raise HTTPException(status_code=423, detail="Audit is locked")
    doc = payload.dict()
    doc.update({"id": str(_uuid.uuid4()), "report_id": report_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user.get("username", "system")})
    await db.audit_samples.insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "sample_added", "audit", report_id,
                    new_value=f"{doc['sample_type']} {doc.get('sample_id') or ''}")
    return doc


@router.put("/samples/{sample_id}")
async def update_sample(sample_id: str, payload: SampleIn, current_user: dict = Depends(get_current_user)):
    if not await db.audit_samples.find_one({"id": sample_id}):
        raise HTTPException(status_code=404, detail="Sample not found")
    upd = payload.dict()
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.audit_samples.update_one({"id": sample_id}, {"$set": upd})
    return await db.audit_samples.find_one({"id": sample_id}, {"_id": 0})


@router.delete("/samples/{sample_id}")
async def delete_sample(sample_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.audit_samples.delete_one({"id": sample_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sample not found")
    return {"success": True}


@router.post("/{report_id}/lock")
async def lock_audit(report_id: str, payload: LockIn, current_user: dict = Depends(get_current_user)):
    audit = await db.audit_reports.find_one({"id": report_id})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    await db.audit_reports.update_one({"id": report_id}, {"$set": {
        "locked": True, "locked_by": current_user.get("username"),
        "locked_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc)}})
    await log_trail(current_user, "audit_locked", "audit", report_id, reason=payload.reason)
    return {"success": True, "locked": True}


@router.post("/{report_id}/reopen")
async def reopen_audit(report_id: str, payload: ReopenIn, current_user: dict = Depends(get_current_user)):
    audit = await db.audit_reports.find_one({"id": report_id})
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    if not payload.reason.strip() or not payload.authorised_by.strip():
        raise HTTPException(status_code=400, detail="Reason and Authorised By are required to reopen")
    await db.audit_reports.update_one({"id": report_id}, {"$set": {
        "locked": False, "reopened_by": current_user.get("username"),
        "reopen_reason": payload.reason, "reopen_authorised_by": payload.authorised_by,
        "reopened_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc)}})
    await log_trail(current_user, "audit_reopened", "audit", report_id,
                    reason=f"{payload.reason} (authorised by {payload.authorised_by})")
    return {"success": True, "locked": False}


@router.get("/{report_id}/trail")
async def audit_trail_for_report(report_id: str, current_user: dict = Depends(get_current_user)):
    audit_entries = await get_trail("audit", report_id)
    finding_ids = [f["id"] async for f in db.audit_findings.find({"report_id": report_id}, {"id": 1})]
    finding_entries = await db.audit_trail.find(
        {"entity_type": "finding", "entity_id": {"$in": finding_ids}}, {"_id": 0}
    ).sort("timestamp", -1).to_list(length=500)
    entries = sorted(audit_entries + finding_entries, key=lambda e: e.get("timestamp") or "", reverse=True)
    return {"items": entries}


@router.get("/{report_id}/coverage-report")
async def coverage_report(report_id: str, current_user: dict = Depends(get_current_user)):
    """Clause Coverage Report — audited / not audited / N/A / findings / no evidence."""
    findings = await db.audit_findings.find({"report_id": report_id}, {"_id": 0}).to_list(length=500)
    def _status(f):
        return f.get("status") or ("Not Started" if not (f.get("evidence") or f.get("findings")) else "In Progress")
    audited, not_audited, na, with_findings, no_evidence = [], [], [], [], []
    for f in findings:
        row = {"clause_number": f.get("clause_number"), "clause_title": f.get("clause_title"),
               "status": _status(f), "finding_type": f.get("finding_type")}
        st = _status(f)
        if st in ("Not Applicable",):
            na.append(row)
        elif st in ("Not Started", "Not Audited"):
            not_audited.append(row)
        else:
            audited.append(row)
        if f.get("finding_type") not in (None, "", "Conformity") or st in (
                "Minor Nonconformity", "Major Nonconformity", "Observation",
                "Opportunity for Improvement", "Correction Required"):
            with_findings.append(row)
        if not (f.get("evidence") or f.get("objective_evidence")):
            no_evidence.append(row)
    return {"total": len(findings), "audited": audited, "not_audited": not_audited,
            "not_applicable": na, "with_findings": with_findings, "no_evidence": no_evidence}


@router.get("/reports/open-findings")
async def open_findings_report(current_user: dict = Depends(get_current_user)):
    """Open Findings Report across all audits."""
    bad_types = ["Minor NCR", "Major NCR", "OFI", "Minor Nonconformity", "Major Nonconformity",
                 "Observation", "Opportunity for Improvement", "Correction Required"]
    findings = await db.audit_findings.find({
        "$or": [{"finding_type": {"$in": bad_types}}, {"status": {"$in": bad_types}}],
        "final_status": {"$nin": ["Closed", "Verified"]},
        "status": {"$nin": ["Closed", "Verified"]},
    }, {"_id": 0}).to_list(length=1000)
    audits = {a["id"]: a async for a in db.audit_reports.find({}, {"_id": 0, "id": 1, "report_number": 1})}
    today = datetime.now(timezone.utc).date()
    rows = []
    for f in findings:
        due = f.get("due_date")
        days_overdue = None
        if due:
            try:
                y, m, d = map(int, str(due)[:10].split("-"))
                from datetime import date as _date
                days_overdue = max(0, (today - _date(y, m, d)).days)
            except Exception:
                pass
        rows.append({
            "finding_id": f["id"], "report_id": f.get("report_id"),
            "audit_number": (audits.get(f.get("report_id")) or {}).get("report_number", ""),
            "clause": f.get("clause_number"), "clause_title": f.get("clause_title"),
            "finding_type": f.get("finding_type"), "status": f.get("status") or "Open",
            "responsible_person": f.get("responsible_person"), "due_date": due,
            "days_overdue": days_overdue, "risk_rating": f.get("risk_rating"),
        })
    return {"items": rows, "count": len(rows)}


@router.get("/dashboard/summary")
async def audits_dashboard(current_user: dict = Depends(get_current_user)):
    """IMS audit dashboard metrics."""
    total_audits = await db.audit_reports.count_documents({})
    locked_audits = await db.audit_reports.count_documents({"locked": True})
    total_findings = await db.audit_findings.count_documents({})
    no_evidence = await db.audit_findings.count_documents({
        "$and": [{"$or": [{"evidence": None}, {"evidence": ""}]},
                 {"$or": [{"objective_evidence": None}, {"objective_evidence": ""}]}]})
    bad_types = ["Minor NCR", "Major NCR", "OFI", "Minor Nonconformity", "Major Nonconformity",
                 "Observation", "Opportunity for Improvement", "Correction Required"]
    open_findings = await db.audit_findings.count_documents({
        "$or": [{"finding_type": {"$in": bad_types}}, {"status": {"$in": bad_types}}],
        "final_status": {"$nin": ["Closed", "Verified"]}, "status": {"$nin": ["Closed", "Verified"]}})
    today = datetime.now(timezone.utc).date().isoformat()
    overdue_findings = await db.audit_findings.count_documents({
        "due_date": {"$lt": today, "$nin": [None, ""]},
        "final_status": {"$nin": ["Closed", "Verified"]}, "status": {"$nin": ["Closed", "Verified"]}})
    by_severity = {}
    for sev in ("Low", "Medium", "High", "Critical"):
        by_severity[sev] = await db.audit_findings.count_documents({"risk_rating": sev})
    repeat = await db.audit_findings.count_documents({"repeat_issue": True})
    ca_total = await db.audit_findings.count_documents({"corrective_action_required": True})
    ca_closed = await db.audit_findings.count_documents({
        "corrective_action_required": True, "$or": [{"final_status": {"$in": ["Closed", "Verified"]}},
                                                    {"status": {"$in": ["Closed", "Verified"]}}]})
    # Asset compliance
    assets_due = {}
    for rt in ("fire_equipment", "test_tag", "first_aid", "spill_kit"):
        assets_due[rt] = await db.asset_register_items.count_documents(
            {"register_type": rt, "next_due": {"$lt": today, "$nin": [None, ""]}})
    # Transition progress
    tr_total = await db.transition_items.count_documents({})
    tr_closed = await db.transition_items.count_documents({"status": "Closed"})
    return {
        "total_audits": total_audits, "locked_audits": locked_audits,
        "total_findings": total_findings, "clauses_no_evidence": no_evidence,
        "open_findings": open_findings, "overdue_findings": overdue_findings,
        "findings_by_severity": by_severity, "repeat_findings": repeat,
        "corrective_action_closure_rate": round(ca_closed / ca_total * 100, 1) if ca_total else None,
        "transition_progress": round(tr_closed / tr_total * 100, 1) if tr_total else 0,
        "transition_open": tr_total - tr_closed,
        "assets_overdue": assets_due,
    }
