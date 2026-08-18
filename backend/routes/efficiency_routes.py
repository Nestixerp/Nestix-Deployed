"""
Job Efficiency Tracking Routes

Provides endpoints for:
- Recording actual start/end times for processes
- Fetching efficiency reports (per job, per process, summary)
- Dashboard metrics for efficiency
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel
from auth import get_current_user
from models import User
from services.efficiency_service import (
    calculate_job_efficiency,
    calculate_per_process_efficiency,
    aggregate_efficiency_by_period,
    get_date_range
)
import os
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(tags=["Efficiency"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ==================== REQUEST MODELS ====================

class ProcessTimeUpdate(BaseModel):
    """Model for updating process actual times"""
    process_id: str  # ID of the process in the job sheet's processes array
    actual_start_time: datetime
    actual_end_time: datetime
    operator_name: Optional[str] = None
    notes: Optional[str] = None


class JobSheetTimeUpdate(BaseModel):
    """Model for updating job sheet start/end times"""
    started_at: datetime
    completed_at: datetime
    actual_time_taken: Optional[float] = None  # minutes
    operator_name: Optional[str] = None
    notes: Optional[str] = None


# ==================== ENDPOINTS ====================

@router.post("/api/job-sheets/{job_sheet_id}/record-time")
async def record_job_sheet_time(
    job_sheet_id: str,
    time_data: JobSheetTimeUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Record actual start and end times for a job sheet
    Calculates efficiency metrics automatically
    """
    
    # Fetch job sheet
    job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    if not job_sheet:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    
    # Calculate actual time if not provided
    actual_time_minutes = time_data.actual_time_taken
    if not actual_time_minutes:
        time_diff = time_data.completed_at - time_data.started_at
        actual_time_minutes = time_diff.total_seconds() / 60
    
    # Update job sheet with actual times
    update_data = {
        "started_at": time_data.started_at,
        "completed_at": time_data.completed_at,
        "actual_time_taken": actual_time_minutes,
        "status": "Completed",
        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)
    }
    
    if time_data.operator_name:
        update_data["operator_name"] = time_data.operator_name
    
    if time_data.notes:
        update_data["production_notes"] = time_data.notes
    
    # Update job sheet
    await db.job_sheets.update_one(
        {"id": job_sheet_id},
        {"$set": update_data}
    )
    
    # Fetch updated job sheet
    updated_job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    
    # Fetch quote for hourly rate
    quote_id = updated_job_sheet.get("quote_id")
    quote_data = None
    if quote_id:
        quote_data = await db.quotes.find_one({"id": quote_id})
    
    # Calculate efficiency
    efficiency_metrics = calculate_job_efficiency(updated_job_sheet, quote_data)
    
    # Update job sheet with efficiency metrics
    await db.job_sheets.update_one(
        {"id": job_sheet_id},
        {"$set": {
            "estimated_hours": efficiency_metrics["estimated_hours"],
            "actual_hours": efficiency_metrics["actual_hours"],
            "hours_saved": efficiency_metrics["hours_saved"],
            "efficiency_percent": efficiency_metrics["efficiency_percent"],
            "money_impact": efficiency_metrics["money_impact"]
        }}
    )
    
    return {
        "message": "Time recorded successfully",
        "job_sheet_id": job_sheet_id,
        "job_sheet_number": updated_job_sheet.get("job_sheet_number"),
        "efficiency_metrics": efficiency_metrics
    }


@router.post("/api/job-sheets/{job_sheet_id}/processes/{process_id}/record-time")
async def record_process_time(
    job_sheet_id: str,
    process_id: str,
    time_data: ProcessTimeUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Record actual start and end times for a specific process in a job sheet
    """
    
    # Fetch job sheet
    job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    if not job_sheet:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    
    # Find the process in the processes array
    processes = job_sheet.get("processes", [])
    process_found = False
    
    for process in processes:
        if str(process.get("id")) == process_id:
            process["actual_start_time"] = time_data.actual_start_time.isoformat()
            process["actual_end_time"] = time_data.actual_end_time.isoformat()
            
            # Calculate duration
            time_diff = time_data.actual_end_time - time_data.actual_start_time
            process["actual_duration_minutes"] = time_diff.total_seconds() / 60
            
            if time_data.operator_name:
                process["operator_name"] = time_data.operator_name
            
            if time_data.notes:
                process["notes"] = time_data.notes
            
            process_found = True
            break
    
    if not process_found:
        raise HTTPException(status_code=404, detail="Process not found in job sheet")
    
    # Update the processes array
    await db.job_sheets.update_one(
        {"id": job_sheet_id},
        {
            "$set": {
                "processes": processes,
                "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)
            }
        }
    )
    
    # Calculate per-process efficiency
    quantity = job_sheet.get("quantity", 1)
    process_efficiencies = calculate_per_process_efficiency(processes, quantity)
    
    return {
        "message": "Process time recorded successfully",
        "job_sheet_id": job_sheet_id,
        "process_id": process_id,
        "process_efficiency": process_efficiencies
    }


@router.get("/api/efficiency/job-sheet/{job_sheet_id}")
async def get_job_sheet_efficiency(
    job_sheet_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get efficiency metrics for a specific job sheet
    """
    
    # Fetch job sheet
    job_sheet = await db.job_sheets.find_one({"id": job_sheet_id})
    if not job_sheet:
        raise HTTPException(status_code=404, detail="Job sheet not found")
    
    # Fetch quote for hourly rate
    quote_id = job_sheet.get("quote_id")
    quote_data = None
    if quote_id:
        quote_data = await db.quotes.find_one({"id": quote_id})
    
    # Calculate overall efficiency
    overall_efficiency = calculate_job_efficiency(job_sheet, quote_data)
    
    # Calculate per-process efficiency if processes exist
    per_process_efficiency = []
    if job_sheet.get("processes"):
        quantity = job_sheet.get("quantity", 1)
        per_process_efficiency = calculate_per_process_efficiency(
            job_sheet["processes"],
            quantity
        )
    
    return {
        "job_sheet_id": job_sheet_id,
        "job_sheet_number": job_sheet.get("job_sheet_number"),
        "customer_name": job_sheet.get("customer_name"),
        "part_description": job_sheet.get("part_description"),
        "status": job_sheet.get("status"),
        "quantity": job_sheet.get("quantity"),
        "overall_efficiency": overall_efficiency,
        "per_process_efficiency": per_process_efficiency
    }


@router.get("/api/efficiency/summary")
async def get_efficiency_summary(
    period: str = Query("week", description="week or month"),
    process_name: Optional[str] = Query(None, description="Filter by process name"),
    customer_name: Optional[str] = Query(None, description="Filter by customer name"),
    current_user: User = Depends(get_current_user)
):
    """
    Get efficiency summary for a time period
    Provides aggregated metrics across all completed jobs
    """
    
    # Get date range for the period
    start_date, end_date = get_date_range(period)
    
    # Build query
    query = {
        "status": "Completed",
        "completed_at": {"$gte": start_date, "$lte": end_date}
    }
    
    if process_name:
        query["process_name"] = process_name
    
    if customer_name:
        query["customer_name"] = {"$regex": customer_name, "$options": "i"}
    
    # Fetch completed job sheets
    job_sheets = await db.job_sheets.find(query).to_list(length=None)
    
    # Aggregate efficiency
    aggregated = aggregate_efficiency_by_period(job_sheets, period)
    
    return {
        "period": period,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "filters": {
            "process_name": process_name,
            "customer_name": customer_name
        },
        "summary": aggregated
    }


@router.get("/api/efficiency/by-process")
async def get_efficiency_by_process(
    period: str = Query("month", description="week or month (currently returns all jobs)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get efficiency breakdown by process type
    Currently returns ALL completed jobs (date filtering disabled)
    """
    
    # Fetch ALL completed job sheets with times
    query = {
        "status": "Completed",
        "started_at": {"$ne": None},
        "completed_at": {"$ne": None}
    }
    
    job_sheets = await db.job_sheets.find(query).to_list(length=None)
    
    # Group by process name
    process_groups = {}
    
    for job in job_sheets:
        process_name = job.get("process_name", "Unknown")
        
        if process_name not in process_groups:
            process_groups[process_name] = []
        
        process_groups[process_name].append(job)
    
    # Calculate efficiency for each process group
    results = []
    
    for process_name, jobs in process_groups.items():
        aggregated = aggregate_efficiency_by_period(jobs, period)
        
        results.append({
            "process_name": process_name,
            "jobs_completed": aggregated["jobs_completed"],
            "total_estimated_hours": aggregated["total_estimated_hours"],
            "total_actual_hours": aggregated["total_actual_hours"],
            "hours_saved": aggregated["hours_saved"],
            "efficiency_percent": aggregated["efficiency_percent"],
            "money_impact": aggregated["money_impact"]
        })
    
    # Sort by money impact (best to worst)
    results.sort(key=lambda x: x["money_impact"], reverse=True)
    
    return {
        "period": period,
        "start_date": None,
        "end_date": None,
        "process_breakdown": results
    }


@router.get("/api/efficiency/by-customer")
async def get_efficiency_by_customer(
    period: str = Query("month", description="week or month (currently returns all jobs)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get efficiency breakdown by customer
    Currently returns ALL completed jobs (date filtering disabled)
    """
    
    # Fetch ALL completed job sheets with times
    query = {
        "status": "Completed",
        "started_at": {"$ne": None},
        "completed_at": {"$ne": None}
    }
    
    job_sheets = await db.job_sheets.find(query).to_list(length=None)
    
    # Group by customer name
    customer_groups = {}
    
    for job in job_sheets:
        customer_name = job.get("customer_name", "Unknown")
        
        if customer_name not in customer_groups:
            customer_groups[customer_name] = []
        
        customer_groups[customer_name].append(job)
    
    # Calculate efficiency for each customer group
    results = []
    
    for customer_name, jobs in customer_groups.items():
        aggregated = aggregate_efficiency_by_period(jobs, period)
        
        results.append({
            "customer_name": customer_name,
            "jobs_completed": aggregated["jobs_completed"],
            "total_estimated_hours": aggregated["total_estimated_hours"],
            "total_actual_hours": aggregated["total_actual_hours"],
            "hours_saved": aggregated["hours_saved"],
            "efficiency_percent": aggregated["efficiency_percent"],
            "money_impact": aggregated["money_impact"]
        })
    
    # Sort by money impact (best to worst)
    results.sort(key=lambda x: x["money_impact"], reverse=True)
    
    return {
        "period": period,
        "start_date": None,
        "end_date": None,
        "customer_breakdown": results
    }


@router.get("/api/efficiency/dashboard-metrics")
async def get_efficiency_dashboard_metrics(
    current_user: User = Depends(get_current_user)
):
    """
    Get efficiency metrics for dashboard display
    Returns quick stats for ALL completed jobs (not filtered by week/month)
    """
    
    # Fetch ALL completed jobs with times
    all_jobs = await db.job_sheets.find({
        "status": "Completed",
        "started_at": {"$ne": None},
        "completed_at": {"$ne": None}
    }).to_list(length=None)
    
    # Calculate metrics for all jobs
    all_metrics = aggregate_efficiency_by_period(all_jobs, "all")
    
    # For now, show same metrics for week and month (all jobs)
    # TODO: Fix date filtering once database timezone issues are resolved
    return {
        "this_week": {
            "jobs_completed": all_metrics["jobs_completed"],
            "hours_saved": all_metrics["hours_saved"],
            "efficiency_percent": all_metrics["efficiency_percent"],
            "money_impact": all_metrics["money_impact"]
        },
        "this_month": {
            "jobs_completed": all_metrics["jobs_completed"],
            "hours_saved": all_metrics["hours_saved"],
            "efficiency_percent": all_metrics["efficiency_percent"],
            "money_impact": all_metrics["money_impact"]
        }
    }


@router.get("/api/efficiency/recent-jobs")
async def get_recent_efficiency_jobs(
    limit: int = Query(100, description="Number of recent jobs to return (default: 100 to show all)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get efficiency metrics for ALL completed jobs
    Includes flag for jobs missing start/end times (needs_time_entry)
    """
    
    # Fetch ALL completed job sheets (sorted by job sheet number descending)
    job_sheets = await db.job_sheets.find(
        {"status": "Completed"}
    ).sort("job_sheet_number", -1).limit(limit).to_list(length=None)
    
    results = []
    
    for job in job_sheets:
        # Check if times are recorded
        has_started_at = job.get("started_at") is not None
        has_completed_at = job.get("completed_at") is not None
        needs_time_entry = not (has_started_at and has_completed_at)
        
        # Fetch quote for hourly rate
        quote_id = job.get("quote_id")
        quote_data = None
        if quote_id:
            quote_data = await db.quotes.find_one({"id": quote_id})
        
        # Calculate efficiency (even if times are missing, it will return 0s)
        efficiency = calculate_job_efficiency(job, quote_data)
        
        results.append({
            "job_sheet_id": job.get("id"),
            "job_sheet_number": job.get("job_sheet_number"),
            "customer_name": job.get("customer_name"),
            "part_description": job.get("part_description"),
            "process_name": job.get("process_name"),
            "completed_at": job.get("completed_at").isoformat() if job.get("completed_at") and hasattr(job.get("completed_at"), 'isoformat') else job.get("completed_at"),
            "estimated_hours": efficiency["estimated_hours"],
            "actual_hours": efficiency["actual_hours"],
            "hours_saved": efficiency["hours_saved"],
            "efficiency_percent": efficiency["efficiency_percent"],
            "money_impact": efficiency["money_impact"],
            "needs_time_entry": needs_time_entry  # NEW: Flag for missing times
        })
    
    return {
        "recent_jobs": results,
        "count": len(results)
    }
