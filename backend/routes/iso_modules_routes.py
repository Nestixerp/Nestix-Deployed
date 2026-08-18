"""
Central registry of all ISO/printable modules in the app.

Used by the Document Control register UI so the "Related Module" field can be
a dropdown rather than a free-text input. Each module entry lists its
canonical name (used for auto-pull lookups) and a suggested form_no prefix.

NOTE: Modules that have BOTH a Register/Index view AND an individual Form
view are listed as TWO separate entries (one for each), so each can be
linked to its own QMSF number / Issue in the Document Control register.

To add a new ISO module: append a dict here. The dropdown updates automatically.
"""

from fastapi import APIRouter, Depends
from auth import get_current_user

router = APIRouter(prefix="/api/iso-modules", tags=["ISO Modules"])

# Canonical list of printable / ISO-controlled modules. The `name` value is
# what will be stored in document_control.related_module and what the
# frontend's getControlledDocumentByModule() matches against.
#
# `default_form_no` is informational only — the actual form number/issue
# is pulled live from the Document Control register at print time.
ISO_MODULES = [
    # ─── QUALITY ────────────────────────────────────────────────────────
    {"name": "ISO Audit Schedule", "group": "Quality", "default_form_no": "QMSF 02"},
    {"name": "ISO Audit Report", "group": "Quality", "default_form_no": "QMSF 02A"},
    {"name": "Management Review Form", "group": "Quality", "default_form_no": "QMSF 05"},
    {"name": "Supplier Review Register", "group": "Quality", "default_form_no": "QMSF 10"},
    {"name": "Supplier Review Form", "group": "Quality", "default_form_no": "QMSF 10A"},
    {"name": "Customer Satisfaction Survey Form", "group": "Quality", "default_form_no": "QMSF 01"},
    {"name": "Customer Satisfaction Analysis Report", "group": "Quality", "default_form_no": "QMSF 01A"},
    {"name": "Employment Application Form", "group": "Quality", "default_form_no": "QMSF 02"},
    {"name": "NCR Register", "group": "Quality", "default_form_no": "QMSF 03"},
    {"name": "NCR Form", "group": "Quality", "default_form_no": "QMSF 03"},
    {"name": "Credit Request Form", "group": "Quality", "default_form_no": "QMSF 03A"},
    {"name": "NCR Job Sheet (Recut)", "group": "Quality", "default_form_no": "QMSF 03B"},
    {"name": "Housekeeping Audit Form", "group": "Quality", "default_form_no": "QMSF 06"},

    # ─── SAFETY ─────────────────────────────────────────────────────────
    {"name": "JSA Register", "group": "Safety", "default_form_no": "QMSF 15"},
    {"name": "JSA Form", "group": "Safety", "default_form_no": "QMSF 14"},
    {"name": "OHS Meeting Register", "group": "Safety", "default_form_no": "QMSF 25"},
    {"name": "OHS Meeting Minutes Form", "group": "Safety", "default_form_no": "QMSF 25A"},
    {"name": "Injury Register", "group": "Safety", "default_form_no": "QMSF 19"},
    {"name": "Injury Report Form", "group": "Safety", "default_form_no": "QMSF 19A"},
    {"name": "Injury Graph", "group": "Safety", "default_form_no": "QMSF 27"},
    {"name": "Evacuation Drill Register", "group": "Safety", "default_form_no": "QMSF 16"},
    {"name": "Evacuation Drill Form", "group": "Safety", "default_form_no": "QMSF 16A"},
    {"name": "MSDS Register", "group": "Safety", "default_form_no": "QMSF 17"},
    {"name": "Legal Requirements Register", "group": "Safety", "default_form_no": "QMSF 18"},
    {"name": "Plant Hazard Check Register", "group": "Safety", "default_form_no": "QMSF 27"},
    {"name": "Plant Hazard Audit Form", "group": "Safety", "default_form_no": "QMSF 27A"},
    {"name": "Near Miss Register", "group": "Safety", "default_form_no": "QMSF 31"},
    {"name": "Near Miss / Hazard Form", "group": "Safety", "default_form_no": "QMSF 32"},
    {"name": "Forklift License Register", "group": "Safety", "default_form_no": "QMSF 29"},
    {"name": "First Aid Certificate Register", "group": "Safety", "default_form_no": "QMSF 30"},

    # ─── HR ─────────────────────────────────────────────────────────────
    {"name": "Skills Matrix Register", "group": "HR", "default_form_no": "QMSF 13"},
    {"name": "Skills Matrix Form", "group": "HR", "default_form_no": "QMSF 13A"},
    {"name": "Training Appraisal Form", "group": "HR", "default_form_no": "QMSF 33"},
    {"name": "Leave of Absence Form", "group": "HR", "default_form_no": "QMSF 34"},

    # ─── IMS ────────────────────────────────────────────────────────────
    {"name": "Risk & Opportunities Register", "group": "IMS", "default_form_no": "QMSF 35"},
    {"name": "Risk & Opportunity Form", "group": "IMS", "default_form_no": "QMSF 36"},

    # ─── ENVIRONMENT ────────────────────────────────────────────────────
    {"name": "Environmental Risk Assessment Register", "group": "Environment", "default_form_no": "QMSF 19"},
    {"name": "Environmental Risk Assessment Form", "group": "Environment", "default_form_no": "QMSF 19A"},
    {"name": "Electricity Usage", "group": "Environment", "default_form_no": "QMSF 20"},
    {"name": "Recycled Metal", "group": "Environment", "default_form_no": "QMSF 21"},

    # ─── EQUIPMENT ──────────────────────────────────────────────────────
    {"name": "Calibration Records", "group": "Equipment", "default_form_no": "QMSF 04"},
    {"name": "Calibration Schedule", "group": "Equipment", "default_form_no": "QMSF 07"},

    # ─── OPERATIONS / KPI ───────────────────────────────────────────────
    {"name": "Courier KPI", "group": "Operations", "default_form_no": "QMSF 40"},

    # ─── SYSTEM ─────────────────────────────────────────────────────────
    {"name": "Document Control Register", "group": "System", "default_form_no": "QMSF 00"},
]


@router.get("/modules")
async def list_modules(current_user=Depends(get_current_user)):
    """Return the canonical list of ISO modules, grouped by area, for use in
    Document Control register dropdowns and any other 'pick a module' UI."""
    grouped = {}
    for m in ISO_MODULES:
        grouped.setdefault(m["group"], []).append(m)
    return {
        "modules": ISO_MODULES,
        "grouped": grouped,
    }
