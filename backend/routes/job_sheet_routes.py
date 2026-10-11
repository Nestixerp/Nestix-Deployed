from fastapi import APIRouter, HTTPException, Depends
from typing import List
from models import JobSheet, JobSheetCreate, JobSheetUpdate, JobSheetComplete
from auth import get_current_user
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

router = APIRouter(prefix="/api", tags=["Job Sheets"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

def prepare_for_mongo(data: dict) -> dict:
    """Convert datetime objects to ISO strings for MongoDB storage"""
    for key, value in data.items():
        if isinstance(value, datetime):
            data[key] = value.isoformat()
    return data

def parse_from_mongo(item: dict) -> dict:
    """Convert ISO strings back to datetime objects"""
    if not item:
        return item
    
    datetime_fields = ['due_date', 'started_at', 'completed_at', 'created_at', 'updated_at']
    for field in datetime_fields:
        if field in item and isinstance(item[field], str):
            try:
                item[field] = datetime.fromisoformat(item[field])
            except Exception:
                pass
    return item

async def get_next_job_sheet_number():
    """Generate next job sheet number in sequence"""
    last_job_sheet = await db.job_sheets.find_one(
        sort=[("job_sheet_number", -1)]
    )
    
    if last_job_sheet and last_job_sheet.get('job_sheet_number'):
        # Extract number from "JS-001" format
        try:
            last_num = int(last_job_sheet['job_sheet_number'].split('-')[1])
            next_num = last_num + 1
        except Exception:
            next_num = 1
    else:
        next_num = 1
    
    return f"JS-{next_num:04d}"

@router.post("/job-sheets", response_model=JobSheet)
async def create_job_sheet(
    job_sheet_data: JobSheetCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new job sheet from a quote process"""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Creating job sheet for quote_id: {job_sheet_data.quote_id}, process_id: {job_sheet_data.process_id}")
    
    # Get the quote
    quote = await db.quotes.find_one({"id": job_sheet_data.quote_id})
    if not quote:
        logger.error(f"Quote not found: {job_sheet_data.quote_id}")
        raise HTTPException(status_code=404, detail=f"Quote not found with id: {job_sheet_data.quote_id}")
    
    logger.info(f"Found quote: {quote.get('quote_number', 'N/A')}")
    
    # Check if this is a multi-item quote with line items
    is_multi_item = quote.get('is_multi_item', False)
    line_item_id = job_sheet_data.line_item_id if hasattr(job_sheet_data, 'line_item_id') else None
    
    # Find the process
    process = None
    part_description = quote.get('part_description', '')
    drawing_url = quote.get('drawing_url')
    # Default material spec from top-level quote (overridden below if multi-item)
    line_item_material_type = quote.get('material_type')
    line_item_grade = quote.get('grade')
    line_item_finish = quote.get('finish')
    line_item_thickness = quote.get('thickness')
    
    if is_multi_item and line_item_id:
        # Multi-item quote: Look for process in the specific line item
        line_items = quote.get('line_items', [])
        logger.info(f"Multi-item quote with {len(line_items)} line items, looking for line_item_id: {line_item_id}")
        
        target_line_item = None
        for item in line_items:
            if item.get('id') == line_item_id:
                target_line_item = item
                break
        
        if not target_line_item:
            logger.error(f"Line item not found: {line_item_id}")
            raise HTTPException(status_code=404, detail=f"Line item not found with id: {line_item_id}")
        
        # Get part description and drawing from line item
        part_description = target_line_item.get('part_description', '')
        drawing_url = target_line_item.get('drawing_url')
        # Material spec: prefer line item, fallback to top-level quote
        line_item_material_type = target_line_item.get('material_type') or quote.get('material_type')
        line_item_grade = target_line_item.get('grade') or quote.get('grade')
        line_item_finish = target_line_item.get('finish') or quote.get('finish')
        line_item_thickness = target_line_item.get('thickness') or quote.get('thickness')
        
        # Find process in line item
        line_item_processes = target_line_item.get('processes', [])
        logger.info(f"Line item has {len(line_item_processes)} processes")
        
        for p in line_item_processes:
            logger.info(f"Checking line item process: {p.get('id')} == {job_sheet_data.process_id}")
            if p.get('id') == job_sheet_data.process_id:
                process = p
                break
    else:
        # Single-item quote: Look for process in main quote
        processes = quote.get('processes', [])
        logger.info(f"Quote has {len(processes)} processes")
        
        for p in processes:
            logger.info(f"Checking process: {p.get('id')} == {job_sheet_data.process_id}")
            if p.get('id') == job_sheet_data.process_id:
                process = p
                break
    
    if not process:
        logger.error(f"Process not found: {job_sheet_data.process_id}")
        raise HTTPException(status_code=404, detail=f"Process not found in quote. Process ID: {job_sheet_data.process_id}")
    
    # Generate job sheet number
    job_sheet_number = await get_next_job_sheet_number()
    
    # Create job sheet
    job_sheet = JobSheet(
        job_sheet_number=job_sheet_number,
        quote_id=job_sheet_data.quote_id,
        quote_number=quote.get('quote_number', ''),
        process_id=job_sheet_data.process_id,
        process_name=process.get('name', 'Process'),
        customer_id=quote.get('customer_id', ''),
        customer_name=quote.get('customer_name', ''),
        part_description=part_description,  # Use part_description from line item or quote
        drawing_number=quote.get('drawing_number'),
        drawing_url=drawing_url,  # Use drawing_url from line item or quote
        quantity=job_sheet_data.quantity,
        purchase_order_number=job_sheet_data.purchase_order_number,
        due_date=job_sheet_data.due_date,
        process_notes=process.get('process_notes') or process.get('notes'),
        setup_time=process.get('setup_time'),
        time_per_part=process.get('time_per_part'),
        hourly_rate=process.get('hourly_rate'),
        material=process.get('material'),
        thickness=str(process.get('thickness')) if process.get('thickness') is not None else (line_item_thickness or None),
        material_type=line_item_material_type,
        grade=line_item_grade,
        finish=line_item_finish,
        number_of_bends=process.get('number_of_bends'),
        time_per_bend=process.get('time_per_bend'),
        packing_time=process.get('packing_time'),
        bend_length=process.get('bend_length'),
        vdie_size=process.get('vdie_size'),
        tonnage=process.get('tonnage'),
        bend_angles=process.get('bend_angles'),
        tooling_required=process.get('tooling_required'),
        status="Pending",
        created_by=current_user['username'],
        # Quality Assurance Inspection
        inspection_interval=job_sheet_data.inspection_interval,
        qa_inspection_items=quote.get('qa_inspection_items', [])  # Copy from quote
    )
    
    # Prepare for MongoDB
    job_sheet_dict = job_sheet.dict()
    job_sheet_dict = prepare_for_mongo(job_sheet_dict)
    
    await db.job_sheets.insert_one(job_sheet_dict)
    
    return job_sheet

@router.get("/job-sheets", response_model=List[JobSheet])
async def get_all_job_sheets(current_user: dict = Depends(get_current_user)):
    """Get all job sheets (enriched with material spec from quote if missing)"""
    job_sheets = await db.job_sheets.find().sort("job_sheet_number", -1).to_list(length=None)
    return [await _enrich_with_quote_material(js) for js in job_sheets]

@router.get("/job-sheets/{job_sheet_id}", response_model=JobSheet)
async def get_job_sheet(
    job_sheet_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific job sheet (enriched with material spec from quote if missing)"""
    job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    if not job_sheet:
        raise HTTPException(status_code=404, detail="Job sheet not found")

    return await _enrich_with_quote_material(job_sheet)


async def _enrich_with_quote_material(js: dict) -> JobSheet:
    """Fill in material_type/grade/finish/thickness from the linked quote when missing on the job sheet."""
    if not (js.get("material_type") and js.get("grade") and js.get("finish") and js.get("thickness")):
        quote_id = js.get("quote_id")
        if quote_id:
            quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
            if quote:
                # Prefer line item if we can find it via part_description
                line_item = None
                if quote.get("is_multi_item") and js.get("part_description"):
                    for li in quote.get("line_items", []) or []:
                        if (li.get("part_description") or "") == js.get("part_description"):
                            line_item = li
                            break
                src = line_item or quote
                if not js.get("material_type"):
                    js["material_type"] = src.get("material_type") or quote.get("material_type")
                if not js.get("grade"):
                    js["grade"] = src.get("grade") or quote.get("grade")
                if not js.get("finish"):
                    js["finish"] = src.get("finish") or quote.get("finish")
                if not js.get("thickness"):
                    js["thickness"] = src.get("thickness") or quote.get("thickness")
                if not js.get("material"):
                    # Legacy 'material' field — combine type for display
                    js["material"] = js.get("material_type")
    return JobSheet(**parse_from_mongo(js))

@router.post("/job-sheets/{job_sheet_id}/sync-from-quote", response_model=JobSheet)
async def sync_job_sheet_from_quote(
    job_sheet_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Re-pull material specs (type/grade/finish/thickness) from the linked quote,
    overwriting stale values so the job sheet can be reprinted with corrected data."""
    js = await db.job_sheets.find_one({"id": job_sheet_id})
    if not js:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    quote = await db.quotes.find_one({"id": js.get("quote_id")}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Linked quote not found")
    line_item = None
    if quote.get("is_multi_item"):
        for li in quote.get("line_items", []) or []:
            if (li.get("part_description") or "") == (js.get("part_description") or ""):
                line_item = li
                break
    src = line_item or quote
    upd = {
        "material_type": src.get("material_type") or quote.get("material_type"),
        "grade": src.get("grade") or quote.get("grade"),
        "finish": src.get("finish") or quote.get("finish"),
        "thickness": src.get("thickness") or quote.get("thickness"),
    }
    upd["material"] = upd["material_type"]
    await db.job_sheets.update_one({"id": job_sheet_id}, {"$set": upd})
    js.update(upd)
    return JobSheet(**parse_from_mongo(js))


@router.get("/job-sheets/quote/{quote_id}", response_model=List[JobSheet])
async def get_job_sheets_by_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all job sheets for a specific quote"""
    job_sheets = await db.job_sheets.find({"quote_id": quote_id}).to_list(length=None)
    return [await _enrich_with_quote_material(js) for js in job_sheets]

@router.put("/job-sheets/{job_sheet_id}", response_model=JobSheet)
async def update_job_sheet(
    job_sheet_id: str,
    updates: JobSheetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a job sheet"""
    existing = await db.job_sheets.find_one({"id": job_sheet_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    
    # Prepare updates
    update_data = {k: v for k, v in updates.dict(exclude_unset=True).items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc)
    update_data = prepare_for_mongo(update_data)
    
    await db.job_sheets.update_one(
        {"id": job_sheet_id},
        {"$set": update_data}
    )
    
    updated_job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    return JobSheet(**parse_from_mongo(updated_job_sheet))

@router.delete("/job-sheets/{job_sheet_id}")
async def delete_job_sheet(
    job_sheet_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a job sheet"""
    result = await db.job_sheets.delete_one({"id": job_sheet_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    


@router.post("/job-sheets/{job_sheet_id}/complete")
async def complete_job_sheet(
    job_sheet_id: str,
    completion_data: JobSheetComplete,
    current_user: dict = Depends(get_current_user)
):
    """
    Complete a job sheet with operator data.
    If all job sheets for a quote are complete, update quote status to 'Ready for Invoice'
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Get the job sheet
    job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    if not job_sheet:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    
    # Validate quantities
    # Only validate that quantity_completed doesn't exceed job quantity
    # Allow total (completed + rejected) to exceed if needed (e.g., made 51 parts, 50 good + 1 reject)
    if completion_data.quantity_completed > job_sheet['quantity']:
        raise HTTPException(
            status_code=400, 
            detail=f"Quantity completed ({completion_data.quantity_completed}) cannot exceed job quantity ({job_sheet['quantity']})"
        )
    
    # Calculate actual time taken if start and end times provided
    actual_time_taken = None
    if completion_data.start_time and completion_data.end_time:
        time_diff = completion_data.end_time - completion_data.start_time
        actual_time_taken = time_diff.total_seconds() / 60  # Convert to minutes
    
    # Update job sheet with completion data
    update_data = {
        "status": "Completed",
        "operator_name": completion_data.operator_name,
        "quantity_completed": completion_data.quantity_completed,
        "quantity_rejected": completion_data.quantity_rejected,
        "reject_reason": completion_data.reject_reason,
        "started_at": completion_data.start_time.isoformat() if completion_data.start_time else None,
        "completed_at": completion_data.end_time.isoformat(),
        "actual_time_taken": actual_time_taken,
        "production_notes": completion_data.production_notes,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.job_sheets.update_one(
        {"id": job_sheet_id},
        {"$set": update_data}
    )
    
    logger.info(f"Job sheet {job_sheet['job_sheet_number']} completed by {completion_data.operator_name}")
    
    # Check if all job sheets for this quote are completed
    quote_id = job_sheet['quote_id']
    all_job_sheets = await db.job_sheets.find({"quote_id": quote_id}).to_list(None)
    
    logger.info(f"Found {len(all_job_sheets)} job sheets for quote {quote_id}")
    
    all_completed = all(js.get('status') == 'Completed' for js in all_job_sheets)
    
    if all_completed:
        logger.info(f"All job sheets for quote {quote_id} are completed. Updating quote status to 'Ready for Invoice'")
        
        # Update quote status to "Ready for Invoice"
        await db.quotes.update_one(
            {"id": quote_id},
            {"$set": {"status": "Ready for Invoice", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        logger.info(f"Quote {quote_id} status updated to 'Ready for Invoice'")
    
    # Return updated job sheet
    updated_job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    return {
        "job_sheet": JobSheet(**parse_from_mongo(updated_job_sheet)),
        "quote_status_updated": all_completed,
        "message": "Job sheet completed successfully" + (" and quote marked as 'Ready for Invoice'" if all_completed else "")
    }

    return {"message": "Job sheet deleted successfully"}


@router.patch("/job-sheets/{job_sheet_id}/reopen")
async def reopen_job_sheet(
    job_sheet_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Reopen a completed job sheet to allow additional production entries
    """
    # Get the job sheet
    job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    if not job_sheet:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    
    if job_sheet.get('status') != 'Completed':
        raise HTTPException(status_code=400, detail="Only completed job sheets can be reopened")
    
    # Update job sheet status back to "In Progress"
    update_data = {
        "status": "In Progress",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.job_sheets.update_one(
        {"id": job_sheet_id},
        {"$set": update_data}
    )
    
    # Update quote status back to "In Production" if it was "Ready for Invoice"
    quote_id = job_sheet.get('quote_id')
    if quote_id:
        quote = await db.quotes.find_one({"id": quote_id})
        if quote and quote.get('status') == 'Ready for Invoice':
            await db.quotes.update_one(
                {"id": quote_id},
                {"$set": {"status": "In Production", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    # Return updated job sheet
    updated_job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    return {
        "job_sheet": JobSheet(**parse_from_mongo(updated_job_sheet)),
        "message": "Job sheet reopened successfully"
    }


@router.get("/job-sheets/overdue/list")
async def get_overdue_jobs(current_user: dict = Depends(get_current_user)):
    """
    Get all overdue job sheets (due today or past due dates that are not completed)
    """
    try:
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        today_end = datetime(now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc)
        
        # Get all non-completed job sheets with due dates
        # We need to fetch all and filter in Python because due_date may be stored as string
        all_jobs = await db.job_sheets.find({
            "status": {"$ne": "Completed"},
            "due_date": {"$exists": True, "$ne": None}
        }).to_list(length=None)
        
        # Filter and calculate days overdue
        formatted_jobs = []
        for job in all_jobs:
            due_date = job.get("due_date")
            
            # Convert string to datetime if needed
            if isinstance(due_date, str):
                try:
                    # Handle ISO format strings
                    due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                except ValueError:
                    continue
            
            # Make sure due_date is timezone aware
            if due_date and due_date.tzinfo is None:
                due_date = due_date.replace(tzinfo=timezone.utc)
            
            if not due_date:
                continue
                
            # Only include jobs due today or earlier
            if due_date.date() > now.date():
                continue  # Future jobs - skip
            
            # Calculate days overdue
            days_diff = (now.date() - due_date.date()).days
            days_overdue = days_diff if days_diff > 0 else 0
            is_due_today = days_diff == 0
            
            formatted_jobs.append({
                "id": job.get("id"),
                "job_sheet_number": job.get("job_sheet_number"),
                "customer_name": job.get("customer_name"),
                "part_description": job.get("part_description"),
                "quote_number": job.get("quote_number"),
                "quantity_required": job.get("quantity"),
                "quantity_accepted": job.get("quantity_completed", 0),
                "quantity_rejected": job.get("quantity_rejected", 0),
                "due_date": due_date.isoformat() if due_date else None,
                "status": job.get("status"),
                "process_type": job.get("process_name"),
                "days_overdue": days_overdue,
                "is_due_today": is_due_today,
                "created_at": job.get("created_at")
            })
        
        # Sort by days overdue (most overdue first)
        formatted_jobs.sort(key=lambda x: x["days_overdue"], reverse=True)
        
        return {
            "overdue_jobs": formatted_jobs,
            "count": len(formatted_jobs)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching overdue jobs: {str(e)}")
