from fastapi import APIRouter, Depends, Query
from auth import get_current_user
import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
from services.efficiency_service import calculate_job_efficiency

router = APIRouter(prefix="/api/part-history", tags=["Part History"])

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


def sanitize_doc(doc):
    """Remove _id and convert non-serializable fields"""
    if doc and '_id' in doc:
        del doc['_id']
    return doc


def _build_job_sheet_with_efficiency(js: dict, quote_data: dict) -> dict:
    """Build a job sheet response dict with computed efficiency metrics."""
    # Calculate efficiency on-the-fly using the same service as efficiency reports
    efficiency = calculate_job_efficiency(js, quote_data)
    
    return {
        "id": js.get("id"),
        "job_sheet_number": js.get("job_sheet_number"),
        "status": js.get("status"),
        "quantity": js.get("quantity"),
        "quantity_completed": js.get("quantity_completed"),
        "operator_name": js.get("operator_name"),
        "production_notes": js.get("production_notes"),
        "actual_time_taken": js.get("actual_time_taken"),
        # Use computed values from efficiency service
        "estimated_hours": efficiency.get("estimated_hours"),
        "actual_hours": efficiency.get("actual_hours"),
        "efficiency_percent": efficiency.get("efficiency_percent") if efficiency.get("actual_hours", 0) > 0 else None,
        "hours_saved": efficiency.get("hours_saved") if efficiency.get("actual_hours", 0) > 0 else None,
        "money_impact": efficiency.get("money_impact") if efficiency.get("actual_hours", 0) > 0 else None,
        "started_at": str(js.get("started_at", "")) if js.get("started_at") else None,
        "completed_at": str(js.get("completed_at", "")) if js.get("completed_at") else None,
        "process_name": js.get("process_name"),
        "purchase_order_number": js.get("purchase_order_number"),
    }


@router.get("/search")
async def search_parts(
    q: Optional[str] = Query(None, description="Search query"),
    current_user: dict = Depends(get_current_user)
):
    """Search quotes by part description, quote number, or customer name.
    Returns a flat list of all matching quotes with summary info."""
    
    query = {}
    if q and q.strip():
        search_term = q.strip()
        query = {
            "$or": [
                {"part_description": {"$regex": search_term, "$options": "i"}},
                {"drawing_number": {"$regex": search_term, "$options": "i"}},
                {"customer_name": {"$regex": search_term, "$options": "i"}},
                {"quote_number": {"$exists": True}},
            ]
        }
        # Try numeric match for quote_number (stored as string)
        try:
            num = int(search_term)
            query["$or"].append({"quote_number": str(num)})  # Match as string
            query["$or"].append({"quote_number": num})  # Also try as int for backwards compatibility
        except ValueError:
            pass
        # Remove the generic exists clause
        query["$or"] = [c for c in query["$or"] if "$exists" not in str(c)]

    quotes = await db.quotes.find(query, {"_id": 0}).sort("quote_number", -1).to_list(length=500)
    
    results = []
    for q_doc in quotes:
        results.append({
            "id": q_doc.get("id"),
            "quote_number": q_doc.get("quote_number"),
            "part_description": q_doc.get("part_description", ""),
            "drawing_number": q_doc.get("drawing_number", ""),
            "customer_name": q_doc.get("customer_name", ""),
            "quantity_required": q_doc.get("quantity_required", 0),
            "quote_total": q_doc.get("quote_total", 0),
            "price_per_part": q_doc.get("price_per_part", 0),
            "status": q_doc.get("status", "Draft"),
            "quote_date": q_doc.get("quote_date", q_doc.get("created_at", "")),
            "material_type": q_doc.get("material_type", ""),
            "thickness": q_doc.get("thickness", ""),
            "grade": q_doc.get("grade", ""),
            "processes": [p.get("name", "") for p in q_doc.get("processes", [])],
        })
    
    return results


@router.get("/detail/{quote_id}")
async def get_part_detail(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get full production history for a specific quote/part.
    Includes all job sheets, time entries, invoices, and packing slips linked to this quote."""
    
    # Get the quote
    quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not quote:
        return {"error": "Quote not found"}
    
    part_desc = quote.get("part_description", "")
    
    # Get all job sheets for this quote
    job_sheets = await db.job_sheets.find(
        {"quote_id": quote_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)
    
    # Get time entries for all job sheets of this quote
    js_ids = [js.get("id") for js in job_sheets]
    time_entries = []
    if js_ids:
        time_entries = await db.time_entries.find(
            {"job_sheet_id": {"$in": js_ids}}, {"_id": 0}
        ).sort("start_time", -1).to_list(length=500)
    
    # Get invoices that reference this quote
    invoices = await db.invoices.find(
        {"quote_id": quote_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)
    
    # Get packing slips for this quote
    packing_slips = await db.packing_slips.find(
        {"quote_id": quote_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)
    
    # Also find OTHER quotes with same part_description (repeat orders)
    related_quotes = []
    if part_desc:
        related = await db.quotes.find(
            {"part_description": {"$regex": f"^{part_desc}$", "$options": "i"}, "id": {"$ne": quote_id}},
            {"_id": 0}
        ).sort("quote_number", -1).to_list(length=50)
        
        for rq in related:
            # Get job sheets for related quote
            rq_jobs = await db.job_sheets.find(
                {"quote_id": rq.get("id")}, {"_id": 0}
            ).sort("created_at", -1).to_list(length=50)
            
            rq_js_ids = [js.get("id") for js in rq_jobs]
            rq_time_entries = []
            if rq_js_ids:
                rq_time_entries = await db.time_entries.find(
                    {"job_sheet_id": {"$in": rq_js_ids}}, {"_id": 0}
                ).sort("start_time", -1).to_list(length=200)
            
            rq_invoices = await db.invoices.find(
                {"quote_id": rq.get("id")}, {"_id": 0}
            ).sort("created_at", -1).to_list(length=50)
            
            related_quotes.append({
                "id": rq.get("id"),
                "quote_number": rq.get("quote_number"),
                "customer_name": rq.get("customer_name"),
                "quantity_required": rq.get("quantity_required", 0),
                "quote_total": rq.get("quote_total", 0),
                "price_per_part": rq.get("price_per_part", 0),
                "status": rq.get("status"),
                "quote_date": rq.get("quote_date", rq.get("created_at", "")),
                "job_sheets": [_build_job_sheet_with_efficiency(js, rq) for js in rq_jobs],
                "time_entries": [{
                    "operator_name": te.get("operator_name"),
                    "process_name": te.get("process_name"),
                    "start_time": te.get("start_time"),
                    "end_time": te.get("end_time"),
                    "actual_duration_minutes": te.get("actual_duration_minutes"),
                    "status": te.get("status"),
                    "notes": te.get("notes", []),
                } for te in rq_time_entries],
                "invoices": [{
                    "invoice_number": inv.get("invoice_number"),
                    "total": inv.get("total"),
                    "status": inv.get("status"),
                    "created_at": str(inv.get("created_at", "")),
                } for inv in rq_invoices],
            })
    
    # Build response for current quote
    job_sheet_details = []
    for js in job_sheets:
        js_time_entries = [te for te in time_entries if te.get("job_sheet_id") == js.get("id")]
        detail = _build_job_sheet_with_efficiency(js, quote)
        detail["quantity_rejected"] = js.get("quantity_rejected")
        detail["quality_notes"] = js.get("quality_notes")
        detail["hours_saved"] = detail.get("hours_saved")
        detail["money_impact"] = detail.get("money_impact")
        detail["time_entries"] = [{
            "operator_name": te.get("operator_name"),
            "process_name": te.get("process_name"),
            "start_time": te.get("start_time"),
            "end_time": te.get("end_time"),
            "actual_duration_minutes": te.get("actual_duration_minutes"),
            "total_pause_minutes": te.get("total_pause_minutes"),
            "status": te.get("status"),
            "notes": te.get("notes", []),
        } for te in js_time_entries]
        job_sheet_details.append(detail)
    
    invoice_details = [{
        "invoice_number": inv.get("invoice_number"),
        "total": inv.get("total"),
        "status": inv.get("status"),
        "created_at": str(inv.get("created_at", "")),
    } for inv in invoices]
    
    packing_slip_details = [{
        "packing_slip_number": ps.get("packing_slip_number"),
        "quantity_shipped": ps.get("quantity_shipped"),
        "status": ps.get("status"),
        "created_at": str(ps.get("created_at", "")),
    } for ps in packing_slips]
    
    return {
        "quote": {
            "id": quote.get("id"),
            "quote_number": quote.get("quote_number"),
            "part_description": quote.get("part_description"),
            "drawing_number": quote.get("drawing_number"),
            "customer_name": quote.get("customer_name"),
            "quantity_required": quote.get("quantity_required", 0),
            "quote_total": quote.get("quote_total", 0),
            "price_per_part": quote.get("price_per_part", 0),
            "status": quote.get("status"),
            "quote_date": quote.get("quote_date", quote.get("created_at", "")),
            "material_type": quote.get("material_type"),
            "thickness": quote.get("thickness"),
            "grade": quote.get("grade"),
            "finish": quote.get("finish"),
            "processes": [{
                "name": p.get("name"),
                "hourly_rate": p.get("hourly_rate"),
                "total_cost": p.get("total_cost"),
                "setup_cost": p.get("setup_cost"),
            } for p in quote.get("processes", [])],
        },
        "job_sheets": job_sheet_details,
        "invoices": invoice_details,
        "packing_slips": packing_slip_details,
        "related_quotes": related_quotes,
        "summary": {
            "times_quoted": 1 + len(related_quotes),
            "times_produced": len(job_sheets) + sum(len(rq.get("job_sheets", [])) for rq in related_quotes),
            "times_invoiced": len(invoices) + sum(len(rq.get("invoices", [])) for rq in related_quotes),
            "total_quantity_produced": sum(js.get("quantity_completed") or js.get("quantity") or 0 for js in job_sheets),
        }
    }
