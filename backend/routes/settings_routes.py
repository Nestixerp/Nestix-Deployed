from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from typing import Optional
import os
import shutil
import uuid
import base64

from models import CompanySettings, CompanySettingsCreate, CompanySettingsUpdate
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# Settings ID - we only have one settings document
SETTINGS_ID = "company_settings_singleton"

@router.get("", response_model=CompanySettings)
@router.get("/", response_model=CompanySettings, include_in_schema=False)
async def get_settings(current_user: dict = Depends(get_current_user)):
    """
    Get company settings (available to all authenticated users)
    """
    settings = await db.company_settings.find_one({"id": SETTINGS_ID})
    
    if not settings:
        # Return default settings if none exist
        default_settings = CompanySettings(id=SETTINGS_ID)
        return default_settings
    
    return CompanySettings(**settings)

@router.post("/", response_model=CompanySettings)
async def create_or_update_settings(
    settings_data: CompanySettingsUpdate,
    current_user: dict = Depends(require_admin)
):
    """
    Create or update company settings (admin only)
    """
    existing = await db.company_settings.find_one({"id": SETTINGS_ID})
    
    if existing:
        # Update existing settings
        update_data = settings_data.dict(exclude_unset=True)
        update_data['updated_at'] = datetime.now(timezone.utc)
        update_data['updated_by'] = current_user.get('username')
        
        await db.company_settings.update_one(
            {"id": SETTINGS_ID},
            {"$set": update_data}
        )
        
        updated_settings = await db.company_settings.find_one({"id": SETTINGS_ID})
        return CompanySettings(**updated_settings)
    else:
        # Create new settings
        new_settings = CompanySettings(
            id=SETTINGS_ID,
            **settings_data.dict(exclude_unset=True)
        )
        new_settings.updated_by = current_user.get('username')
        
        await db.company_settings.insert_one(new_settings.dict())
        return new_settings

@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """
    Upload company logo (admin only)
    Accepts PNG, JPG, JPEG, SVG
    Stores as base64 in database for persistent storage in deployed environments
    """
    # Validate file type
    allowed_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: PNG, JPG, JPEG, SVG"
        )
    
    # Validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Convert to base64 for database storage
    base64_data = base64.b64encode(content).decode('utf-8')
    data_url = f"data:{file.content_type};base64,{base64_data}"
    
    # Update settings with base64 data URL
    await db.company_settings.update_one(
        {"id": SETTINGS_ID},
        {
            "$set": {
                "company_logo_url": data_url,
                "logo_filename": file.filename,
                "logo_content_type": file.content_type,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": current_user.get('username')
            }
        },
        upsert=True
    )
    
    return {
        "message": "Logo uploaded successfully",
        "logo_url": data_url
    }

@router.delete("/logo")
async def delete_logo(current_user: dict = Depends(require_admin)):
    """
    Delete company logo (admin only)
    """
    settings = await db.company_settings.find_one({"id": SETTINGS_ID})
    
    if not settings or not settings.get('company_logo_url'):
        raise HTTPException(status_code=404, detail="No logo found")
    
    # Remove logo data from settings (no filesystem deletion needed for base64 data)
    await db.company_settings.update_one(
        {"id": SETTINGS_ID},
        {
            "$unset": {
                "company_logo_url": "",
                "logo_filename": "",
                "logo_content_type": ""
            },
            "$set": {
                "updated_at": datetime.now(timezone.utc),
                "updated_by": current_user.get('username')
            }
        }
    )
    
    return {"message": "Logo deleted successfully"}

@router.get("/timezones")
async def get_timezones(current_user: dict = Depends(get_current_user)):
    """
    Get list of common Australian timezones
    """
    return {
        "timezones": [
            {"value": "Australia/Melbourne", "label": "Melbourne (AEST/AEDT)"},
            {"value": "Australia/Sydney", "label": "Sydney (AEST/AEDT)"},
            {"value": "Australia/Brisbane", "label": "Brisbane (AEST)"},
            {"value": "Australia/Adelaide", "label": "Adelaide (ACST/ACDT)"},
            {"value": "Australia/Perth", "label": "Perth (AWST)"},
            {"value": "Australia/Darwin", "label": "Darwin (ACST)"},
            {"value": "Australia/Hobart", "label": "Hobart (AEST/AEDT)"},
        ]
    }

@router.get("/admin/fix-invoiced-packing-slips/preview")
async def preview_packing_slip_fix(current_user: dict = Depends(require_admin)):
    """
    Preview which packing slips would be marked as invoiced.
    This scans invoice items to find packing slips that are referenced but not marked.
    (Admin only)
    """
    # Get all invoices
    invoices = await db.invoices.find({}, {'_id': 0, 'invoice_number': 1, 'items': 1}).to_list(1000)
    
    # Extract packing slip numbers from invoice items
    ps_numbers_in_invoices = set()
    invoice_mapping = {}  # Track which invoice contains which PS
    
    for inv in invoices:
        invoice_num = inv.get('invoice_number')
        if 'items' in inv:
            for item in inv['items']:
                ps_num = None
                if 'packing_slip_number' in item:
                    ps_num = item['packing_slip_number']
                elif 'ps' in item and isinstance(item['ps'], str):
                    ps_num = item['ps'].replace('PS: ', '').strip()
                
                if ps_num and ps_num.startswith('PS-'):
                    ps_numbers_in_invoices.add(ps_num)
                    invoice_mapping[ps_num] = invoice_num
    
    # Find packing slips that need to be marked as invoiced
    packing_slips_to_fix = []
    
    for ps_num in ps_numbers_in_invoices:
        ps = await db.packing_slips.find_one({'packing_slip_number': ps_num}, {'_id': 0})
        if ps and not ps.get('is_invoiced'):
            packing_slips_to_fix.append({
                'packing_slip_number': ps_num,
                'job_sheet_number': ps.get('job_sheet_number'),
                'customer_name': ps.get('customer_name'),
                'invoice_number': invoice_mapping.get(ps_num)
            })
    
    # Get current database state
    total_ps = await db.packing_slips.count_documents({})
    invoiced_ps = await db.packing_slips.count_documents({'is_invoiced': True})
    uninvoiced_completed = await db.packing_slips.count_documents({
        'status': 'Completed',
        '$or': [
            {'is_invoiced': False},
            {'is_invoiced': {'$exists': False}}
        ]
    })
    
    return {
        "packing_slips_to_fix": packing_slips_to_fix,
        "count_to_fix": len(packing_slips_to_fix),
        "database_stats": {
            "total_packing_slips": total_ps,
            "currently_marked_invoiced": invoiced_ps,
            "completed_but_not_invoiced": uninvoiced_completed
        }
    }

@router.post("/admin/fix-invoiced-packing-slips/execute")
async def execute_packing_slip_fix(current_user: dict = Depends(require_admin)):
    """
    Execute the fix: Mark packing slips as invoiced if they are referenced in invoice items.
    (Admin only)
    """
    # Get all invoices
    invoices = await db.invoices.find({}, {'_id': 0, 'invoice_number': 1, 'items': 1}).to_list(1000)
    
    # Extract packing slip numbers from invoice items
    ps_numbers_in_invoices = set()
    
    for inv in invoices:
        if 'items' in inv:
            for item in inv['items']:
                ps_num = None
                if 'packing_slip_number' in item:
                    ps_num = item['packing_slip_number']
                elif 'ps' in item and isinstance(item['ps'], str):
                    ps_num = item['ps'].replace('PS: ', '').strip()
                
                if ps_num and ps_num.startswith('PS-'):
                    ps_numbers_in_invoices.add(ps_num)
    
    # Fix packing slips
    updated_count = 0
    fixed_items = []
    
    for ps_num in ps_numbers_in_invoices:
        ps = await db.packing_slips.find_one({'packing_slip_number': ps_num}, {'_id': 0})
        if ps and not ps.get('is_invoiced'):
            result = await db.packing_slips.update_one(
                {'packing_slip_number': ps_num},
                {'$set': {'is_invoiced': True}}
            )
            if result.modified_count > 0:
                updated_count += 1
                fixed_items.append(ps_num)
    
    # Get updated database state
    total_ps = await db.packing_slips.count_documents({})
    invoiced_ps = await db.packing_slips.count_documents({'is_invoiced': True})
    uninvoiced_completed = await db.packing_slips.count_documents({
        'status': 'Completed',
        '$or': [
            {'is_invoiced': False},
            {'is_invoiced': {'$exists': False}}
        ]
    })
    
    return {
        "success": True,
        "updated_count": updated_count,
        "fixed_items": fixed_items,
        "database_stats": {
            "total_packing_slips": total_ps,
            "now_marked_invoiced": invoiced_ps,
            "remaining_completed_not_invoiced": uninvoiced_completed
        }
    }


@router.get("/admin/database-health")
async def get_database_health(current_user: dict = Depends(require_admin)):
    """
    Get database health statistics and counts for all collections.
    (Admin only)
    """
    collections_stats = {}
    
    # Get counts for all main collections
    collections = [
        'quotes', 'job_sheets', 'packing_slips', 'invoices', 
        'customers', 'suppliers', 'materials', 'purchase_orders',
        'users', 'jsa', 'calibration_records', 'audit_reports'
    ]
    
    for collection in collections:
        try:
            count = await db[collection].count_documents({})
            collections_stats[collection] = count
        except Exception:
            collections_stats[collection] = 0
    
    # Get status breakdowns for key collections
    quote_statuses = {}
    async for doc in db.quotes.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]):
        quote_statuses[doc['_id'] or 'Unknown'] = doc['count']
    
    job_sheet_statuses = {}
    async for doc in db.job_sheets.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]):
        job_sheet_statuses[doc['_id'] or 'Unknown'] = doc['count']
    
    invoice_statuses = {}
    async for doc in db.invoices.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]):
        invoice_statuses[doc['_id'] or 'Unknown'] = doc['count']
    
    # Calculate health indicators
    total_records = sum(collections_stats.values())
    
    return {
        "collections": collections_stats,
        "total_records": total_records,
        "status_breakdowns": {
            "quotes": quote_statuses,
            "job_sheets": job_sheet_statuses,
            "invoices": invoice_statuses
        },
        "health_score": "Good" if total_records > 0 else "Empty Database"
    }


@router.get("/admin/orphan-records")
async def detect_orphan_records(current_user: dict = Depends(require_admin)):
    """
    Detect orphan records - records that reference non-existent parent records.
    (Admin only)
    """
    orphans = {
        "job_sheets_without_quotes": [],
        "packing_slips_without_job_sheets": [],
        "invoices_with_missing_items": []
    }
    
    # Find job sheets referencing non-existent quotes
    all_quote_numbers = set()
    async for q in db.quotes.find({}, {'quote_number': 1, '_id': 0}):
        if q.get('quote_number'):
            all_quote_numbers.add(q['quote_number'])
    
    async for js in db.job_sheets.find({}, {'job_sheet_number': 1, 'quote_number': 1, 'customer_name': 1, '_id': 0}):
        quote_num = js.get('quote_number')
        if quote_num and quote_num not in all_quote_numbers:
            orphans["job_sheets_without_quotes"].append({
                "job_sheet_number": js.get('job_sheet_number'),
                "missing_quote": quote_num,
                "customer": js.get('customer_name')
            })
    
    # Find packing slips referencing non-existent job sheets
    all_job_sheet_numbers = set()
    async for js in db.job_sheets.find({}, {'job_sheet_number': 1, '_id': 0}):
        if js.get('job_sheet_number'):
            all_job_sheet_numbers.add(js['job_sheet_number'])
    
    async for ps in db.packing_slips.find({}, {'packing_slip_number': 1, 'job_sheet_number': 1, 'customer_name': 1, '_id': 0}):
        js_num = ps.get('job_sheet_number')
        if js_num and js_num not in all_job_sheet_numbers:
            orphans["packing_slips_without_job_sheets"].append({
                "packing_slip_number": ps.get('packing_slip_number'),
                "missing_job_sheet": js_num,
                "customer": ps.get('customer_name')
            })
    
    # Count totals
    total_orphans = (
        len(orphans["job_sheets_without_quotes"]) +
        len(orphans["packing_slips_without_job_sheets"]) +
        len(orphans["invoices_with_missing_items"])
    )
    
    return {
        "orphans": orphans,
        "total_orphan_count": total_orphans,
        "status": "Clean" if total_orphans == 0 else f"Found {total_orphans} orphan records"
    }


@router.get("/admin/data-integrity")
async def check_data_integrity(current_user: dict = Depends(require_admin)):
    """
    Check data integrity - find records with missing required fields.
    (Admin only)
    """
    issues = {
        "quotes_missing_customer": [],
        "quotes_missing_total": [],
        "job_sheets_missing_quantity": [],
        "customers_missing_name": [],
        "invoices_missing_items": []
    }
    
    # Quotes without customer info
    async for q in db.quotes.find(
        {"$or": [
            {"customer_name": {"$exists": False}},
            {"customer_name": ""},
            {"customer_name": None}
        ]},
        {"quote_number": 1, "created_at": 1, "_id": 0}
    ):
        issues["quotes_missing_customer"].append({
            "quote_number": q.get('quote_number'),
            "created_at": str(q.get('created_at', ''))[:10]
        })
    
    # Quotes without total
    async for q in db.quotes.find(
        {"$or": [
            {"quote_total": {"$exists": False}},
            {"quote_total": None},
            {"quote_total": 0}
        ]},
        {"quote_number": 1, "customer_name": 1, "_id": 0}
    ):
        issues["quotes_missing_total"].append({
            "quote_number": q.get('quote_number'),
            "customer": q.get('customer_name', 'Unknown')
        })
    
    # Job sheets without quantity
    async for js in db.job_sheets.find(
        {"$or": [
            {"quantity_required": {"$exists": False}},
            {"quantity_required": None},
            {"quantity_required": 0}
        ]},
        {"job_sheet_number": 1, "customer_name": 1, "_id": 0}
    ):
        issues["job_sheets_missing_quantity"].append({
            "job_sheet_number": js.get('job_sheet_number'),
            "customer": js.get('customer_name', 'Unknown')
        })
    
    # Customers without name
    async for c in db.customers.find(
        {"$or": [
            {"name": {"$exists": False}},
            {"name": ""},
            {"name": None}
        ]},
        {"id": 1, "email": 1, "_id": 0}
    ):
        issues["customers_missing_name"].append({
            "id": c.get('id'),
            "email": c.get('email', 'No email')
        })
    
    # Invoices without items
    async for inv in db.invoices.find(
        {"$or": [
            {"items": {"$exists": False}},
            {"items": []},
            {"items": None}
        ]},
        {"invoice_number": 1, "customer_name": 1, "_id": 0}
    ):
        issues["invoices_missing_items"].append({
            "invoice_number": inv.get('invoice_number'),
            "customer": inv.get('customer_name', 'Unknown')
        })
    
    # Count totals
    total_issues = sum(len(v) for v in issues.values())
    
    return {
        "issues": issues,
        "total_issue_count": total_issues,
        "status": "All Clear" if total_issues == 0 else f"Found {total_issues} data integrity issues"
    }
