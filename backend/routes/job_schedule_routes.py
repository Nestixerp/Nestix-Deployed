from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime, timezone, timedelta
from models import JobSchedule, JobScheduleCreate, JobScheduleUpdate
from auth import get_current_user, check_module_access
import os
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/job-schedules", tags=["Job Schedules"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

@router.get("", response_model=List[JobSchedule])
async def get_job_schedules(
    start_date: str = None,
    end_date: str = None,
    machine_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all job schedules with optional filters"""
    check_module_access(current_user, "scheduling")
    
    query = {}
    
    # Filter by machine
    if machine_id:
        query["machine_id"] = machine_id
    
    # Filter by date range
    if start_date and end_date:
        query["scheduled_start"] = {
            "$gte": datetime.fromisoformat(start_date.replace('Z', '+00:00')),
            "$lte": datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        }
    
    schedules = await db.job_schedules.find(query).to_list(length=None)
    
    # Enhance schedules with job sheet status
    job_ids = [s.get('job_sheet_id') for s in schedules if s.get('job_sheet_id')]
    job_statuses = {}
    
    if job_ids:
        jobs = await db.job_sheets.find({'id': {'$in': job_ids}}).to_list(length=None)
        job_statuses = {job['id']: job.get('status', 'In Progress') for job in jobs}
    
    # Add job_status to each schedule
    for schedule in schedules:
        job_id = schedule.get('job_sheet_id')
        schedule['job_status'] = job_statuses.get(job_id, 'In Progress')
    
    return [JobSchedule(**schedule) for schedule in schedules]

@router.get("/{schedule_id}", response_model=JobSchedule)
async def get_job_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific job schedule"""
    check_module_access(current_user, "scheduling")
    
    schedule = await db.job_schedules.find_one({"id": schedule_id})
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job schedule not found"
        )
    return JobSchedule(**schedule)

@router.post("", response_model=JobSchedule, status_code=status.HTTP_201_CREATED)
async def create_job_schedule(
    schedule: JobScheduleCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new job schedule"""
    check_module_access(current_user, "scheduling")
    
    # Get job sheet to fetch duration and details
    job_sheet = await db.job_sheets.find_one({"id": schedule.job_sheet_id})
    if not job_sheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job sheet not found"
        )
    
    # Get machine
    machine = await db.machines.find_one({"id": schedule.machine_id})
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Machine not found"
        )
    
    # Calculate duration from job sheet using the same formula as Job Sheets page
    setup_time = job_sheet.get('setup_time', 0) or 0
    number_of_bends = job_sheet.get('number_of_bends', 0) or 0
    time_per_bend = job_sheet.get('time_per_bend', 30) or 30
    packing_time = job_sheet.get('packing_time', 0) or 0
    quantity = job_sheet.get('quantity', 1) or 1
    
    # Duration in minutes (same formula as Job Sheets)
    total_bend_time_minutes = (number_of_bends * time_per_bend * quantity) / 60
    total_packing_time_minutes = (packing_time * quantity) / 60
    estimated_duration = setup_time + total_bend_time_minutes + total_packing_time_minutes
    
    # Parse start time and calculate end time
    scheduled_start = datetime.fromisoformat(schedule.scheduled_start.replace('Z', '+00:00'))
    scheduled_end = scheduled_start + timedelta(minutes=estimated_duration)
    
    schedule_dict = {
        "id": str(datetime.now().timestamp()).replace('.', ''),
        "job_sheet_id": schedule.job_sheet_id,
        "job_sheet_number": job_sheet.get('job_sheet_number', ''),
        "machine_id": schedule.machine_id,
        "machine_name": machine.get('machine_name', ''),
        "scheduled_start": scheduled_start,
        "scheduled_end": scheduled_end,
        "estimated_duration_minutes": estimated_duration,
        "status": "Scheduled",
        "notes": schedule.notes,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.job_schedules.insert_one(schedule_dict)
    
    return JobSchedule(**schedule_dict)

@router.put("/{schedule_id}", response_model=JobSchedule)
async def update_job_schedule(
    schedule_id: str,
    schedule_update: JobScheduleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a job schedule (for drag-and-drop rescheduling)"""
    check_module_access(current_user, "scheduling")
    
    # Check if schedule exists
    existing_schedule = await db.job_schedules.find_one({"id": schedule_id})
    if not existing_schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job schedule not found"
        )
    
    # Update fields
    update_data = schedule_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # If machine changed, update machine name
    if "machine_id" in update_data:
        machine = await db.machines.find_one({"id": update_data["machine_id"]})
        if machine:
            update_data["machine_name"] = machine.get('machine_name', '')
    
    # If start time changed, recalculate end time
    if "scheduled_start" in update_data:
        new_start = datetime.fromisoformat(update_data["scheduled_start"].replace('Z', '+00:00'))
        duration = existing_schedule.get('estimated_duration_minutes', 60)
        update_data["scheduled_start"] = new_start
        update_data["scheduled_end"] = new_start + timedelta(minutes=duration)
    
    await db.job_schedules.update_one(
        {"id": schedule_id},
        {"$set": update_data}
    )
    
    updated_schedule = await db.job_schedules.find_one({"id": schedule_id})
    return JobSchedule(**updated_schedule)

@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a job schedule"""
    check_module_access(current_user, "scheduling")
    
    result = await db.job_schedules.delete_one({"id": schedule_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job schedule not found"
        )
    
    return None
