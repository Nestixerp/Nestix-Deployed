from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from auth import get_current_user
from models import User
import os
from motor.motor_asyncio import AsyncIOMotorClient
import pytz

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

@router.get("/metrics")
async def get_dashboard_metrics(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Get all dashboard metrics for the main dashboard page
    Uses system timezone from Settings for accurate date calculations
    """
    try:
        # Get system timezone from Settings (default to Australia/Melbourne)
        settings = await db.settings.find_one({"setting_type": "system"})
        system_timezone = settings.get('timezone', 'Australia/Melbourne') if settings else 'Australia/Melbourne'
        tz = pytz.timezone(system_timezone)
        
        # Get current time in system timezone
        now = datetime.now(tz)
        
        # Calculate date ranges in system timezone, then convert to UTC for MongoDB queries
        year_start_local = tz.localize(datetime(now.year, 1, 1, 0, 0, 0))
        month_start_local = tz.localize(datetime(now.year, now.month, 1, 0, 0, 0))
        today_start_local = tz.localize(datetime(now.year, now.month, now.day, 0, 0, 0))
        
        # Calculate week start (Monday) in local timezone
        days_since_monday = now.weekday()  # Monday is 0
        week_start_local = tz.localize(datetime(now.year, now.month, now.day, 0, 0, 0)) - timedelta(days=days_since_monday)
        
        # Convert to UTC for MongoDB queries (stored dates are in UTC)
        year_start = year_start_local.astimezone(pytz.utc).replace(tzinfo=None)
        month_start = month_start_local.astimezone(pytz.utc).replace(tzinfo=None)
        today_start = today_start_local.astimezone(pytz.utc).replace(tzinfo=None)
        week_start = week_start_local.astimezone(pytz.utc).replace(tzinfo=None)
        
        # Get current UTC time for comparisons
        now_utc = datetime.now(pytz.utc).replace(tzinfo=None)
        
        # 1. Low Stock Levels - Materials where stock <= reorder_level (matches Inventory page logic)
        # Using "stock" field (not "current_stock") and <= comparison (not <)
        low_stock_materials = await db.materials.find({
            "$expr": {"$lte": ["$stock", "$reorder_level"]}
        }).to_list(length=None)
        
        low_stock_count = len(low_stock_materials)
        
        # 2. Overdue Purchase Orders - POs with status Draft/Sent/Partial where expected_delivery_date < today
        # Matches Purchase Orders page logic which includes Draft status
        overdue_pos = await db.purchase_orders.find({
            "status": {"$in": ["Draft", "Sent", "Partial"]},
            "expected_delivery_date": {"$lt": now_utc}
        }).to_list(length=None)
        
        overdue_po_count = len(overdue_pos)
        
        # 3. Recent Quotes - Last 5 quotes
        recent_quotes = await db.quotes.find().sort("created_at", -1).limit(5).to_list(length=5)
        
        # 4. Total Revenue YTD - Sum of invoices (actual revenue when jobs are finished)
        # Revenue should come from invoices that are Sent or Paid (not Draft)
        # Handle both string and datetime date formats
        
        # Helper function to parse dates that could be string or datetime
        def parse_date(date_val):
            if date_val is None:
                return None
            if isinstance(date_val, datetime):
                return date_val.replace(tzinfo=None) if date_val.tzinfo else date_val
            if isinstance(date_val, str):
                try:
                    # Try parsing ISO format
                    dt = datetime.fromisoformat(date_val.replace('Z', '+00:00'))
                    return dt.replace(tzinfo=None)
                except ValueError:
                    return None
            return None
        
        # Get all valid invoices and filter in Python for robustness
        all_invoices = await db.invoices.find({
            "status": {"$in": ["Sent", "Paid", "Partially Paid"]}
        }).to_list(length=None)
        
        ytd_revenue = 0.0
        mtd_revenue = 0.0
        
        for inv in all_invoices:
            inv_date = parse_date(inv.get("invoice_date"))
            if inv_date is None:
                continue
            
            # Get the amount - try multiple field names
            amount = inv.get("total_inc_gst") or inv.get("grand_total") or inv.get("total") or 0
            
            if inv_date >= year_start:
                ytd_revenue += amount
            if inv_date >= month_start:
                mtd_revenue += amount
        
        # 5. Jobs Created Today - Count
        # Fetch all job sheets and filter in Python for robustness with date formats
        all_job_sheets = await db.job_sheets.find().to_list(length=None)
        jobs_today = []
        for js in all_job_sheets:
            js_date = parse_date(js.get("created_at"))
            if js_date and js_date >= today_start:
                jobs_today.append(js)
        jobs_today_count = len(jobs_today)
        
        # 6. Quotes - Fetch all and filter in Python for consistent date handling
        all_quotes = await db.quotes.find().to_list(length=None)
        
        quotes_today = []
        quotes_week = []
        quotes_month = []
        
        for q in all_quotes:
            q_date = parse_date(q.get("created_at"))
            if q_date is None:
                continue
            if q_date >= today_start:
                quotes_today.append(q)
            if q_date >= week_start:
                quotes_week.append(q)
            if q_date >= month_start:
                quotes_month.append(q)
        
        quotes_today_count = len(quotes_today)
        quotes_today_value = sum((q.get('quote_total') or 0) for q in quotes_today)
        quotes_week_count = len(quotes_week)
        quotes_week_value = sum((q.get('quote_total') or 0) for q in quotes_week)
        quotes_month_count = len(quotes_month)
        quotes_month_value = sum((q.get('quote_total') or 0) for q in quotes_month)
        
        # 6. Inventory Spend MTD - POs received/completed this month + POs due this month
        # Get POs received this month
        received_mtd_pipeline = [
            {
                "$match": {
                    "status": {"$in": ["Received", "Closed"]},
                    "actual_delivery_date": {"$gte": month_start}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$total"}
                }
            }
        ]
        
        received_mtd_result = await db.purchase_orders.aggregate(received_mtd_pipeline).to_list(length=1)
        received_mtd = received_mtd_result[0]["total"] if received_mtd_result else 0.0
        
        # Get POs due this month (expected_delivery_date in current month)
        next_month_start = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc) if now.month < 12 else datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        
        due_mtd_pipeline = [
            {
                "$match": {
                    "status": {"$in": ["Pending", "Sent", "Partial"]},
                    "expected_delivery_date": {
                        "$gte": month_start,
                        "$lt": next_month_start
                    }
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$total"}
                }
            }
        ]
        
        due_mtd_result = await db.purchase_orders.aggregate(due_mtd_pipeline).to_list(length=1)
        due_mtd = due_mtd_result[0]["total"] if due_mtd_result else 0.0
        
        inventory_spend_mtd = received_mtd + due_mtd
        
        # 7. Hours Active Work & Active Work Value - Total hours and value from IN-PROGRESS and PENDING job sheets
        # Use already fetched job sheets and filter by status
        active_job_sheets = [js for js in all_job_sheets if js.get("status") in ["In Progress", "Pending"]]
        
        hours_active_work = 0.0
        active_work_value = 0.0
        
        # Create a set of unique quote IDs to fetch quotes
        quote_ids = set()
        for job_sheet in active_job_sheets:
            if job_sheet.get("quote_id"):
                quote_ids.add(job_sheet["quote_id"])
        
        # Fetch all related quotes to get values (reuse all_quotes if possible)
        quotes_map = {}
        for quote in all_quotes:
            if quote.get("id") in quote_ids:
                quotes_map[quote["id"]] = quote.get("quote_total") or 0
        
        # Calculate hours and add up quote values
        for job_sheet in active_job_sheets:
            # Add quote value (only once per quote)
            if job_sheet.get("quote_id") and job_sheet["quote_id"] in quotes_map:
                active_work_value += quotes_map[job_sheet["quote_id"]]
                # Remove from map so we don't count it twice
                del quotes_map[job_sheet["quote_id"]]
            
            # Calculate hours
            # Check if job sheet has processes array (new format)
            processes = job_sheet.get("processes", [])
            
            if processes and len(processes) > 0:
                # New format: processes array
                for process in processes:
                    setup_time = process.get("setup_time") or 0
                    time_per_part = process.get("time_per_part") or 0
                    quantity = job_sheet.get("quantity") or job_sheet.get("quantity_accepted") or job_sheet.get("quantity_required") or 0
                    
                    total_minutes = setup_time + (time_per_part * quantity)
                    hours_active_work += total_minutes / 60.0
            else:
                # Old format: fields at job sheet level (Press Brake specific)
                # Use 'or 0' to handle None values (dict.get returns None if key exists but value is None)
                setup_time = job_sheet.get("setup_time") or 0
                number_of_bends = job_sheet.get("number_of_bends") or 0
                time_per_bend = job_sheet.get("time_per_bend") or 0
                packing_time = job_sheet.get("packing_time") or 0
                # Default to 1 if quantity is missing to show at least the setup time
                quantity = job_sheet.get("quantity") or job_sheet.get("quantity_accepted") or job_sheet.get("quantity_required") or 1
                
                # Also check for estimated_hours field (used when timing comes from quote)
                estimated_hours = job_sheet.get("estimated_hours") or 0
                
                # For Press Brake: total = setup + (bends × time_per_bend × qty) + (packing × qty)
                # setup_time is in MINUTES
                # time_per_bend is in SECONDS per bend
                # packing_time is in SECONDS per part
                
                # Calculate time per part in minutes
                bend_time_per_part_seconds = number_of_bends * time_per_bend
                time_per_part_minutes = (bend_time_per_part_seconds + packing_time) / 60.0
                
                # Total time = setup + (time per part × quantity)
                total_minutes = setup_time + (time_per_part_minutes * quantity)
                calculated_hours = total_minutes / 60.0
                
                # Use estimated_hours if calculated hours is 0 (no timing data in job sheet)
                hours_active_work += calculated_hours if calculated_hours > 0 else estimated_hours
        
        # 8. Hours Entered Today - Total hours from job sheets created/updated today
        # Use the same job sheets that were already fetched for "Jobs Created Today" (jobs_today)
        # This ensures consistency and avoids duplicate queries
        today_job_sheets = jobs_today
        
        hours_today = 0.0
        for job_sheet in today_job_sheets:
            # Check if job sheet has processes array (new format)
            processes = job_sheet.get("processes", [])
            
            if processes and len(processes) > 0:
                # New format: processes array
                for process in processes:
                    setup_time = process.get("setup_time") or 0
                    time_per_part = process.get("time_per_part") or 0
                    quantity = job_sheet.get("quantity") or job_sheet.get("quantity_accepted") or job_sheet.get("quantity_required") or 0
                    
                    total_minutes = setup_time + (time_per_part * quantity)
                    hours_today += total_minutes / 60.0
            else:
                # Old format: fields at job sheet level (Press Brake specific)
                # Use 'or 0' to handle None values
                setup_time = job_sheet.get("setup_time") or 0
                number_of_bends = job_sheet.get("number_of_bends") or 0
                time_per_bend = job_sheet.get("time_per_bend") or 0
                packing_time = job_sheet.get("packing_time") or 0
                # Default to 1 if quantity is missing to show at least the setup time
                quantity = job_sheet.get("quantity") or job_sheet.get("quantity_accepted") or job_sheet.get("quantity_required") or 1
                
                # Also check for estimated_hours field
                estimated_hours = job_sheet.get("estimated_hours") or 0
                
                # For Press Brake: total = setup + (bends × time_per_bend × qty) + (packing × qty)
                # setup_time is in MINUTES
                # time_per_bend is in SECONDS per bend
                # packing_time is in SECONDS per part
                
                # Calculate time per part in minutes
                bend_time_per_part_seconds = number_of_bends * time_per_bend
                time_per_part_minutes = (bend_time_per_part_seconds + packing_time) / 60.0
                
                # Total time = setup + (time per part × quantity)
                total_minutes = setup_time + (time_per_part_minutes * quantity)
                calculated_hours = total_minutes / 60.0
                hours_today += calculated_hours if calculated_hours > 0 else estimated_hours
        
        # 9. Jobs Entered Today - Count and hours for job sheets created today
        # Note: jobs_today and jobs_today_count were already calculated above (lines 117-120)
        # Reuse those results instead of querying again
        
        jobs_entered_today = jobs_today_count  # Already calculated above
        jobs_entered_today_hours = 0.0
        
        for job_sheet in jobs_today:  # jobs_today list already fetched above
            # Calculate hours using same logic as above
            processes = job_sheet.get("processes", [])
            
            if processes and len(processes) > 0:
                for process in processes:
                    setup_time = process.get("setup_time") or 0
                    time_per_part = process.get("time_per_part") or 0
                    quantity = job_sheet.get("quantity") or job_sheet.get("quantity_accepted") or job_sheet.get("quantity_required") or 0
                    
                    total_minutes = setup_time + (time_per_part * quantity)
                    jobs_entered_today_hours += total_minutes / 60.0
            else:
                setup_time = job_sheet.get("setup_time") or 0
                number_of_bends = job_sheet.get("number_of_bends") or 0
                time_per_bend = job_sheet.get("time_per_bend") or 0
                packing_time = job_sheet.get("packing_time") or 0
                quantity = job_sheet.get("quantity") or job_sheet.get("quantity_accepted") or job_sheet.get("quantity_required") or 1
                
                # Also check for estimated_hours field
                estimated_hours = job_sheet.get("estimated_hours") or 0
                
                bend_time_per_part_seconds = number_of_bends * time_per_bend
                time_per_part_minutes = (bend_time_per_part_seconds + packing_time) / 60.0
                total_minutes = setup_time + (time_per_part_minutes * quantity)
                calculated_hours = total_minutes / 60.0
                jobs_entered_today_hours += calculated_hours if calculated_hours > 0 else estimated_hours
        
        # Format recent quotes for response
        formatted_recent_quotes = []
        for quote in recent_quotes:
            formatted_recent_quotes.append({
                "id": quote.get("id"),
                "quote_number": quote.get("quote_number"),
                "customer_name": quote.get("customer_name"),
                "part_description": quote.get("part_description"),
                "quote_total": quote.get("quote_total", 0.0),
                "status": quote.get("status"),
                "created_at": quote.get("created_at").isoformat() if quote.get("created_at") else None
            })
        
        # Return all metrics
        return {
            "low_stock": {
                "count": low_stock_count,
                "materials": [
                    {
                        "id": m.get("id"),
                        "material_type": m.get("material_type"),
                        "grade": m.get("grade"),
                        "thickness": m.get("thickness"),
                        "current_stock": m.get("stock", m.get("current_stock", 0)),  # Try "stock" first, fallback to "current_stock"
                        "reorder_level": m.get("reorder_level", 0)
                    }
                    for m in low_stock_materials[:10]  # Limit to 10 for dashboard
                ]
            },
            "overdue_pos": {
                "count": overdue_po_count,
                "pos": [
                    {
                        "id": po.get("id"),
                        "po_number": po.get("po_number"),
                        "supplier_name": po.get("supplier_name"),
                        "expected_delivery_date": po.get("expected_delivery_date").isoformat() if po.get("expected_delivery_date") else None,
                        "total": po.get("total", 0.0),
                        "status": po.get("status")
                    }
                    for po in overdue_pos[:10]  # Limit to 10 for dashboard
                ]
            },
            "recent_quotes": formatted_recent_quotes,
            "revenue_ytd": ytd_revenue,
            "revenue_mtd": mtd_revenue,
            "inventory_spend_mtd": inventory_spend_mtd,
            "hours_active_work": hours_active_work,
            "active_work_value": active_work_value,
            "hours_today": hours_today,
            "jobs_entered_today": jobs_entered_today,
            "jobs_entered_today_hours": jobs_entered_today_hours,
            "jobs_created_today": jobs_today_count,  # New: actual job sheets created today
            "quotes_today_count": quotes_today_count,
            "quotes_today_value": quotes_today_value,
            "quotes_week_count": quotes_week_count,
            "quotes_week_value": quotes_week_value,
            "quotes_month_count": quotes_month_count,
            "quotes_month_value": quotes_month_value,
            "is_time_tracking_placeholder": False  # Flag to indicate time tracking is live
        }
        
    except Exception as e:
        print(f"Error fetching dashboard metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard metrics: {str(e)}")


@router.get("/debug")
async def debug_dashboard_data(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Debug endpoint to check data formats and diagnose why metrics might be wrong
    """
    try:
        # Get system timezone
        settings = await db.settings.find_one({"setting_type": "system"})
        system_timezone = settings.get('timezone', 'Australia/Melbourne') if settings else 'Australia/Melbourne'
        tz = pytz.timezone(system_timezone)
        now = datetime.now(tz)
        
        # Check invoice data format
        sample_invoices = await db.invoices.find().limit(3).to_list(length=3)
        invoice_debug = []
        for inv in sample_invoices:
            invoice_debug.append({
                "id": inv.get("id"),
                "invoice_date": inv.get("invoice_date"),
                "invoice_date_type": type(inv.get("invoice_date")).__name__,
                "status": inv.get("status"),
                "total_inc_gst": inv.get("total_inc_gst"),
                "total": inv.get("total"),
                "grand_total": inv.get("grand_total")
            })
        
        # Check quote data format
        sample_quotes = await db.quotes.find().sort("created_at", -1).limit(3).to_list(length=3)
        quote_debug = []
        for q in sample_quotes:
            quote_debug.append({
                "id": q.get("id"),
                "quote_number": q.get("quote_number"),
                "created_at": str(q.get("created_at")),
                "created_at_type": type(q.get("created_at")).__name__,
                "quote_total": q.get("quote_total"),
                "status": q.get("status")
            })
        
        # Check job sheet data format
        sample_jobs = await db.job_sheets.find({"status": {"$in": ["In Progress", "Pending"]}}).limit(3).to_list(length=3)
        job_debug = []
        for j in sample_jobs:
            job_debug.append({
                "id": j.get("id"),
                "job_sheet_number": j.get("job_sheet_number"),
                "status": j.get("status"),
                "created_at": str(j.get("created_at")),
                "created_at_type": type(j.get("created_at")).__name__,
                "quote_id": j.get("quote_id"),
                "setup_time": j.get("setup_time"),
                "time_per_bend": j.get("time_per_bend"),
                "number_of_bends": j.get("number_of_bends"),
                "estimated_hours": j.get("estimated_hours"),
                "processes": j.get("processes")
            })
        
        # Get total counts
        total_invoices = await db.invoices.count_documents({})
        total_quotes = await db.quotes.count_documents({})
        total_jobs = await db.job_sheets.count_documents({})
        active_jobs = await db.job_sheets.count_documents({"status": {"$in": ["In Progress", "Pending"]}})
        
        # Check invoice statuses in use
        invoice_statuses = await db.invoices.distinct("status")
        
        # Check job sheet statuses in use  
        job_statuses = await db.job_sheets.distinct("status")
        
        return {
            "current_time": now.isoformat(),
            "timezone": system_timezone,
            "counts": {
                "total_invoices": total_invoices,
                "total_quotes": total_quotes,
                "total_job_sheets": total_jobs,
                "active_job_sheets": active_jobs
            },
            "statuses_in_use": {
                "invoice_statuses": invoice_statuses,
                "job_statuses": job_statuses
            },
            "sample_invoices": invoice_debug,
            "sample_quotes": quote_debug,
            "sample_active_jobs": job_debug
        }
        
    except Exception as e:
        return {"error": str(e)}
