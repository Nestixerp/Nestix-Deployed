from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
from typing import List, Dict
import os
import pytz

from auth import get_current_user

router = APIRouter(prefix="/api/production-dashboard", tags=["production-dashboard"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]


def get_date_range_melbourne():
    """Get today's date range in Melbourne timezone"""
    melbourne_tz = pytz.timezone('Australia/Melbourne')
    now_melbourne = datetime.now(melbourne_tz)
    
    # Start of today in Melbourne
    start_of_day = now_melbourne.replace(hour=0, minute=0, second=0, microsecond=0)
    # End of today in Melbourne
    end_of_day = now_melbourne.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # Convert to UTC for database queries
    start_utc = start_of_day.astimezone(timezone.utc)
    end_utc = end_of_day.astimezone(timezone.utc)
    
    return start_utc.isoformat(), end_utc.isoformat()


@router.get("/live-metrics")
async def get_live_production_metrics(current_user: dict = Depends(get_current_user)):
    """Get real-time production metrics"""
    
    # Active jobs (people currently working)
    active_time_entries = await db.time_entries.find({
        "status": {"$in": ["active", "paused"]}
    }).to_list(length=None)
    
    # Log for debugging
    import logging
    logging.info(f"[Production Dashboard] Found {len(active_time_entries)} active/paused time entries")
    for entry in active_time_entries:
        logging.info(f"[Production Dashboard] Entry: {entry.get('job_sheet_number')} - {entry.get('status')} - {entry.get('operator_name')}")
    
    # Group by operator
    operators_working = {}
    for entry in active_time_entries:
        operator_name = entry.get("operator_name", "Unknown")
        if operator_name not in operators_working:
            operators_working[operator_name] = []
        operators_working[operator_name].append({
            "job_number": entry.get("job_sheet_number"),
            "process": entry.get("process_name"),
            "status": entry.get("status"),
            "started": entry.get("start_time")
        })
    
    # Today's completed jobs
    start_utc, end_utc = get_date_range_melbourne()
    completed_today = await db.time_entries.count_documents({
        "status": "completed",
        "end_time": {"$gte": start_utc, "$lte": end_utc}
    })
    
    # Jobs in progress today
    jobs_in_progress = await db.job_sheets.count_documents({
        "status": "In Progress"
    })
    
    # Pending jobs
    pending_jobs = await db.job_sheets.count_documents({
        "status": "Pending"
    })
    
    return {
        "active_operators": len(operators_working),
        "operators_working": operators_working,
        "active_jobs_count": len(active_time_entries),
        "completed_today": completed_today,
        "jobs_in_progress": jobs_in_progress,
        "pending_jobs": pending_jobs,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/machine-utilization")
async def get_machine_utilization(current_user: dict = Depends(get_current_user)):
    """Get machine/process utilization metrics"""
    
    # Get all time entries from today
    start_utc, end_utc = get_date_range_melbourne()
    
    today_entries = await db.time_entries.find({
        "start_time": {"$gte": start_utc, "$lte": end_utc}
    }).to_list(length=None)
    
    # Group by process
    process_stats = {}
    for entry in today_entries:
        process = entry.get("process_name", "Unknown")
        if process not in process_stats:
            process_stats[process] = {
                "active": 0,
                "completed": 0,
                "total_minutes": 0,
                "jobs": []
            }
        
        if entry.get("status") in ["active", "paused"]:
            process_stats[process]["active"] += 1
        elif entry.get("status") == "completed":
            process_stats[process]["completed"] += 1
            process_stats[process]["total_minutes"] += entry.get("actual_duration_minutes", 0)
        
        process_stats[process]["jobs"].append(entry.get("job_sheet_number"))
    
    # Calculate utilization percentage (assuming 8 hour work day)
    for process, stats in process_stats.items():
        available_minutes = 480  # 8 hours
        utilization = (stats["total_minutes"] / available_minutes * 100) if available_minutes > 0 else 0
        stats["utilization_percent"] = round(utilization, 1)
        stats["total_hours"] = round(stats["total_minutes"] / 60, 2)
    
    return {
        "processes": process_stats,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/bottlenecks")
async def identify_bottlenecks(current_user: dict = Depends(get_current_user)):
    """Identify production bottlenecks"""
    
    # Get jobs with efficiency data
    jobs_with_efficiency = await db.job_sheets.find({
        "efficiency_percent": {"$exists": True},
        "status": {"$in": ["In Progress", "Completed"]}
    }).sort("efficiency_percent", 1).limit(10).to_list(length=None)
    
    # Get jobs significantly over estimated time
    slowest_jobs = []
    for job in jobs_with_efficiency:
        eff_percent = job.get("efficiency_percent")
        # Handle None values - skip if efficiency is None
        if eff_percent is None:
            continue
        if eff_percent < 80:  # More than 20% over estimate
            slowest_jobs.append({
                "job_number": job.get("job_sheet_number"),
                "customer": job.get("customer_name"),
                "process": job.get("process_name"),
                "efficiency_percent": eff_percent,
                "estimated_hours": job.get("estimated_hours"),
                "actual_hours": job.get("actual_hours"),
                "hours_over": round((job.get("actual_hours", 0) or 0) - (job.get("estimated_hours", 0) or 0), 2)
            })
    
    # Get processes that are running behind
    all_jobs = await db.job_sheets.find({
        "efficiency_percent": {"$exists": True}
    }).to_list(length=None)
    
    process_efficiency = {}
    for job in all_jobs:
        process = job.get("process_name", "Unknown")
        if process not in process_efficiency:
            process_efficiency[process] = {
                "total_efficiency": 0,
                "count": 0,
                "jobs_behind": 0
            }
        
        eff = job.get("efficiency_percent")
        # Skip jobs with None efficiency
        if eff is None:
            continue
        process_efficiency[process]["total_efficiency"] += eff
        process_efficiency[process]["count"] += 1
        if eff < 100:
            process_efficiency[process]["jobs_behind"] += 1
    
    # Calculate average efficiency per process
    process_performance = []
    for process, data in process_efficiency.items():
        avg_efficiency = data["total_efficiency"] / data["count"] if data["count"] > 0 else 100
        process_performance.append({
            "process": process,
            "avg_efficiency": round(avg_efficiency, 1),
            "total_jobs": data["count"],
            "jobs_behind": data["jobs_behind"],
            "performance_rating": "good" if avg_efficiency >= 100 else "needs_attention" if avg_efficiency >= 80 else "critical"
        })
    
    # Sort by efficiency (worst first)
    process_performance.sort(key=lambda x: x["avg_efficiency"])
    
    return {
        "slowest_jobs": slowest_jobs[:5],
        "process_performance": process_performance,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/daily-summary")
async def get_daily_summary(current_user: dict = Depends(get_current_user)):
    """Get daily production summary"""
    
    start_utc, end_utc = get_date_range_melbourne()
    
    # Jobs completed today
    completed_jobs = await db.time_entries.find({
        "status": "completed",
        "end_time": {"$gte": start_utc, "$lte": end_utc}
    }).to_list(length=None)
    
    # Calculate totals
    total_actual_hours = sum(e.get("actual_duration_minutes", 0) / 60 for e in completed_jobs)
    total_pause_hours = sum(e.get("total_pause_minutes", 0) / 60 for e in completed_jobs)
    
    # Get unique job sheets completed
    unique_jobs = set(e.get("job_sheet_number") for e in completed_jobs)
    
    # Calculate average efficiency for today
    jobs_today = await db.job_sheets.find({
        "updated_at": {"$gte": start_utc, "$lte": end_utc},
        "efficiency_percent": {"$exists": True}
    }).to_list(length=None)
    
    avg_efficiency = 0
    if jobs_today:
        avg_efficiency = sum(j.get("efficiency_percent", 0) for j in jobs_today) / len(jobs_today)
    
    return {
        "date": datetime.now(pytz.timezone('Australia/Melbourne')).strftime("%Y-%m-%d"),
        "jobs_completed": len(unique_jobs),
        "time_entries_completed": len(completed_jobs),
        "total_work_hours": round(total_actual_hours, 2),
        "total_break_hours": round(total_pause_hours, 2),
        "average_efficiency": round(avg_efficiency, 1),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }



@router.get("/debug/time-entries")
async def debug_time_entries(current_user: dict = Depends(get_current_user)):
    """Debug endpoint to see all time entries status - helps diagnose why jobs aren't showing"""
    
    # Get all active/paused entries
    active_entries = await db.time_entries.find({
        "status": {"$in": ["active", "paused"]}
    }).to_list(length=None)
    
    # Get recent entries (last 24 hours)
    from datetime import timedelta
    recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    recent_entries = await db.time_entries.find({
        "created_at": {"$gte": recent_cutoff.isoformat()}
    }).sort("created_at", -1).to_list(length=20)
    
    # Format for response
    def format_entry(e):
        return {
            "id": e.get("id"),
            "job_sheet_number": e.get("job_sheet_number"),
            "status": e.get("status"),
            "operator_name": e.get("operator_name"),
            "start_time": e.get("start_time"),
            "end_time": e.get("end_time"),
            "created_at": e.get("created_at")
        }
    
    return {
        "active_paused_count": len(active_entries),
        "active_paused_entries": [format_entry(e) for e in active_entries],
        "recent_entries_count": len(recent_entries),
        "recent_entries": [format_entry(e) for e in recent_entries],
        "debug_info": {
            "message": "If job is started but not showing, check: 1) Was API call successful? 2) Is status correctly set to 'active'? 3) Check console for errors",
            "expected_status": "active or paused"
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
