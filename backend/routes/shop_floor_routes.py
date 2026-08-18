from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from typing import List, Optional
import os

from models import (
    TimeEntry, TimeEntryCreate, TimeEntryUpdate, 
    TimeEntryPauseRequest, TimeEntryNoteRequest,
    TimeEntryNote, TimeEntryPause
)
from auth import get_current_user

router = APIRouter(prefix="/api/shop-floor", tags=["shop-floor"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]


def calculate_duration(start_time: str, end_time: Optional[str], pauses: List[TimeEntryPause]) -> tuple:
    """Calculate actual duration excluding pauses"""
    if not end_time:
        end_dt = datetime.now(timezone.utc)
    else:
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    
    start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    total_minutes = (end_dt - start_dt).total_seconds() / 60
    
    # Calculate pause time
    pause_minutes = 0
    for pause in pauses:
        pause_start = datetime.fromisoformat(pause.pause_start.replace('Z', '+00:00'))
        if pause.pause_end:
            pause_end = datetime.fromisoformat(pause.pause_end.replace('Z', '+00:00'))
        else:
            pause_end = datetime.now(timezone.utc)
        pause_minutes += (pause_end - pause_start).total_seconds() / 60
    
    actual_minutes = total_minutes - pause_minutes
    return actual_minutes, pause_minutes


@router.post("/time-entries", response_model=TimeEntry)
async def start_time_entry(
    entry: TimeEntryCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Start a new time entry for shop floor work.
    Validates process-specific rules (Press Brake: 1 job, Laser: multiple)
    """
    import logging
    logging.info(f"[Shop Floor] Starting job: {entry.job_sheet_number} for operator: {entry.operator_name} (ID: {entry.operator_id})")
    logging.info(f"[Shop Floor] Process: {entry.process_name}, Job Sheet ID: {entry.job_sheet_id}")
    
    # Check for active entries for this operator
    active_entries = await db.time_entries.find({
        "operator_id": entry.operator_id,
        "status": {"$in": ["active", "paused"]}
    }).to_list(length=None)
    
    logging.info(f"[Shop Floor] Found {len(active_entries)} active entries for operator {entry.operator_id}")
    
    # Enforce process-specific rules
    if entry.process_name.lower() in ["press brake", "pressbrake"]:
        # Press Brake: Only one active job at a time
        if active_entries:
            logging.warning(f"[Shop Floor] Press Brake operator already has active job: {active_entries[0]['job_sheet_number']}")
            raise HTTPException(
                status_code=400,
                detail=f"Press Brake operators can only work on one job at a time. Currently active: {active_entries[0]['job_sheet_number']}"
            )
    # Laser can have multiple jobs - no restriction
    
    # Create new time entry
    new_entry = TimeEntry(
        **entry.dict(),
        start_time=datetime.now(timezone.utc).isoformat(),
        status="active"
    )
    
    await db.time_entries.insert_one(new_entry.dict())
    
    logging.info(f"[Shop Floor] ✓ Time entry created: {new_entry.id} for job {entry.job_sheet_number}")
    
    return new_entry


@router.get("/time-entries/active", response_model=List[TimeEntry])
async def get_active_time_entries(
    operator_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all active time entries, optionally filtered by operator"""
    query = {"status": {"$in": ["active", "paused"]}}
    if operator_id:
        query["operator_id"] = operator_id
    
    entries = await db.time_entries.find(query).sort("start_time", -1).to_list(length=None)
    return [TimeEntry(**entry) for entry in entries]


@router.get("/time-entries/{entry_id}", response_model=TimeEntry)
async def get_time_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific time entry"""
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    return TimeEntry(**entry)


@router.post("/time-entries/{entry_id}/pause")
async def pause_time_entry(
    entry_id: str,
    pause_request: TimeEntryPauseRequest,
    current_user: dict = Depends(get_current_user)
):
    """Pause an active time entry"""
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    if entry["status"] != "active":
        raise HTTPException(status_code=400, detail="Can only pause active entries")
    
    # Create pause record
    pause = TimeEntryPause(
        pause_start=datetime.now(timezone.utc).isoformat(),
        reason=pause_request.reason
    )
    
    # Update entry
    await db.time_entries.update_one(
        {"id": entry_id},
        {
            "$set": {
                "status": "paused",
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"pauses": pause.dict()}
        }
    )
    
    return {"success": True, "message": "Time entry paused"}


@router.post("/time-entries/{entry_id}/resume")
async def resume_time_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Resume a paused time entry"""
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    if entry["status"] != "paused":
        raise HTTPException(status_code=400, detail="Can only resume paused entries")
    
    # Update the last pause with end time
    pauses = entry.get("pauses", [])
    if pauses and not pauses[-1].get("pause_end"):
        pauses[-1]["pause_end"] = datetime.now(timezone.utc).isoformat()
    
    await db.time_entries.update_one(
        {"id": entry_id},
        {
            "$set": {
                "status": "active",
                "pauses": pauses,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"success": True, "message": "Time entry resumed"}


@router.post("/time-entries/{entry_id}/stop")
async def stop_time_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop a time entry and mark as completed"""
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    if entry["status"] == "completed":
        raise HTTPException(status_code=400, detail="Time entry already completed")
    
    end_time = datetime.now(timezone.utc).isoformat()
    
    # If currently paused, close the pause
    pauses = entry.get("pauses", [])
    if entry["status"] == "paused" and pauses and not pauses[-1].get("pause_end"):
        pauses[-1]["pause_end"] = end_time
    
    # Calculate durations
    actual_minutes, pause_minutes = calculate_duration(
        entry["start_time"],
        end_time,
        [TimeEntryPause(**p) for p in pauses]
    )
    
    # Update entry
    await db.time_entries.update_one(
        {"id": entry_id},
        {
            "$set": {
                "status": "completed",
                "end_time": end_time,
                "pauses": pauses,
                "actual_duration_minutes": actual_minutes,
                "total_pause_minutes": pause_minutes,
                "updated_at": end_time
            }
        }
    )
    
    # Update job sheet with actual hours
    job_sheet = await db.job_sheets.find_one({"id": entry["job_sheet_id"]})
    
    if job_sheet:
        # Get all time entries for this job to calculate total actual time
        all_entries = await db.time_entries.find({
            "job_sheet_id": entry["job_sheet_id"],
            "status": "completed"
        }).to_list(length=None)
        
        total_actual_minutes = sum(e.get("actual_duration_minutes", 0) for e in all_entries)
        
        # Calculate estimated time
        estimated_minutes = 0
        if job_sheet.get('processes') and len(job_sheet.get('processes', [])) > 0:
            for process in job_sheet['processes']:
                setup = process.get('setup_time', 0) or 0
                time_per_part = process.get('time_per_part', 0) or 0
                quantity = job_sheet.get('quantity', 1)
                estimated_minutes += setup + (time_per_part * quantity)
        else:
            # Old format
            setup_time = job_sheet.get('setup_time', 0) or 0
            number_of_bends = job_sheet.get('number_of_bends', 0) or 0
            time_per_bend = job_sheet.get('time_per_bend', 0) or 0
            packing_time = job_sheet.get('packing_time', 0) or 0
            quantity = job_sheet.get('quantity', 1)
            bend_time_per_part_seconds = number_of_bends * time_per_bend
            packing_time_per_part_seconds = packing_time
            time_per_part_minutes = (bend_time_per_part_seconds + packing_time_per_part_seconds) / 60.0
            estimated_minutes = setup_time + (time_per_part_minutes * quantity)
        
        # Calculate efficiency metrics
        hours_saved = (estimated_minutes - total_actual_minutes) / 60
        efficiency_percent = (estimated_minutes / total_actual_minutes * 100) if total_actual_minutes > 0 else 0
        hourly_rate = job_sheet.get('hourly_rate', 100)
        money_impact = hours_saved * hourly_rate
        
        # Update job sheet with efficiency data
        await db.job_sheets.update_one(
            {"id": entry["job_sheet_id"]},
            {
                "$set": {
                    "actual_hours": total_actual_minutes / 60,
                    "estimated_hours": estimated_minutes / 60,
                    "hours_saved": hours_saved,
                    "efficiency_percent": round(efficiency_percent, 1),
                    "money_impact": round(money_impact, 2),
                    "updated_at": end_time
                }
            }
        )
        
        efficiency_data = {
            "estimated_hours": round(estimated_minutes / 60, 2),
            "actual_hours": round(total_actual_minutes / 60, 2),
            "hours_saved": round(hours_saved, 2),
            "efficiency_percent": round(efficiency_percent, 1),
            "money_impact": round(money_impact, 2),
            "status": "ahead" if hours_saved > 0 else "behind" if hours_saved < 0 else "on_time"
        }
    else:
        efficiency_data = None
    
    return {
        "success": True,
        "message": "Time entry completed",
        "actual_duration_minutes": actual_minutes,
        "total_pause_minutes": pause_minutes,
        "efficiency": efficiency_data
    }


@router.post("/time-entries/{entry_id}/notes")
async def add_note_to_time_entry(
    entry_id: str,
    note_request: TimeEntryNoteRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a note to a time entry"""
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    # Create note
    note = TimeEntryNote(
        category=note_request.category,
        note=note_request.note
    )
    
    # Add note to entry
    await db.time_entries.update_one(
        {"id": entry_id},
        {
            "$push": {"notes": note.dict()},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {"success": True, "message": "Note added", "note": note}


@router.get("/time-entries/job-sheet/{job_sheet_id}", response_model=List[TimeEntry])
async def get_time_entries_for_job(
    job_sheet_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all time entries for a specific job sheet"""
    entries = await db.time_entries.find(
        {"job_sheet_id": job_sheet_id}
    ).sort("start_time", -1).to_list(length=None)
    
    return [TimeEntry(**entry) for entry in entries]


@router.get("/time-entries/operator/{operator_id}/history", response_model=List[TimeEntry])
async def get_operator_time_history(
    operator_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get time entry history for an operator"""
    entries = await db.time_entries.find(
        {"operator_id": operator_id}
    ).sort("start_time", -1).limit(limit).to_list(length=None)
    
    return [TimeEntry(**entry) for entry in entries]


@router.get("/active-jobs")
async def get_active_jobs(current_user: dict = Depends(get_current_user)):
    """Get all active job sheets for selection"""
    jobs = await db.job_sheets.find(
        {"status": {"$in": ["Pending", "In Progress"]}}
    ).sort("created_at", -1).to_list(length=None)
    
    # Remove MongoDB _id field for JSON serialization
    for job in jobs:
        if '_id' in job:
            del job['_id']
    
    return jobs
