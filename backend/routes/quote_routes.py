from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import Quote, QuoteCreate, QuoteUpdate, CuttingParameter
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from datetime import datetime

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/quotes", tags=["Quotes"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# GST rate constant
GST_RATE = 0.10  # 10% GST


async def get_next_quote_number() -> str:
    """Get next auto-incrementing quote number"""
    counter = await db.counters.find_one_and_update(
        {"_id": "quote_number"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True
    )
    value = counter.get("value", 1) if counter else 1
    return str(value)


async def get_next_drawing_number() -> str:
    """Get next auto-incrementing drawing number"""
    counter = await db.counters.find_one_and_update(
        {"_id": "drawing_number"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True
    )
    value = counter.get("value", 1) if counter else 1
    return f"DRW-{value:05d}"


async def calculate_all_costs(quote_data: dict) -> dict:
    """
    Calculate all costs for a quote based on M1 ERP logic
    
    Calculation flow:
    1. Material Cost per Part = (selling_price_per_sheet / parts_per_sheet)
    2. Cutting Cost per Part = cutting_time_minutes * charge_rate_per_min
    3. Press Brake Cost per Part = (setup_cost / qty) + (bends × time_per_bend × rate) + (packing_time × rate)
    4. Fixed Cost per Part = (setup_cost + programming_cost + laser_cleaning_cost) / quantity
    5. Cost per Part (no GST) = Material + Cutting + Press Brake + Fixed + other costs
    6. Total Job Cost = Cost per Part * quantity_required
    7. GST Value = Total Job Cost * GST_RATE
    8. Cost per Part (plus GST) = Cost per Part (no GST) * (1 + GST_RATE)
    9. Quote Total = Total Job Cost + GST Value (or sales_adjusted_quote_total if set)
    10. Net Profit = Quote Total - Total Job Cost - GST Value
    11. Gross Profit = Quote Total - Total Job Cost
    12. Profit % = (Net Profit / Total Job Cost) * 100
    """
    
    # Extract values with defaults
    buying_cost_per_sheet = quote_data.get('buying_cost_per_sheet', 0.0)
    selling_price_per_sheet = quote_data.get('selling_price_per_sheet', 0.0)
    parts_per_sheet = quote_data.get('parts_per_sheet', 1) or 1  # Prevent division by zero
    quantity_required = quote_data.get('quantity_required', 1)
    
    # Material markup calculation
    if buying_cost_per_sheet > 0 and selling_price_per_sheet > 0:
        material_markup_percent = ((selling_price_per_sheet - buying_cost_per_sheet) / buying_cost_per_sheet) * 100
    else:
        material_markup_percent = 0.0
    
    # 1. Material Cost per Part
    material_cost_per_part = (selling_price_per_sheet / parts_per_sheet) if parts_per_sheet > 0 else 0.0
    
    # 2. Cutting Cost per Part (Laser Cutting)
    cutting_time_minutes = quote_data.get('sales_adjusted_cutting_time') or quote_data.get('cutting_time_minutes', 0.0)
    charge_rate_per_min = quote_data.get('charge_rate_per_min', 0.0)
    cutting_cost_per_part = cutting_time_minutes * charge_rate_per_min
    
    # 3. Press Brake Cost per Part
    press_brake_enabled = quote_data.get('press_brake_enabled', False)
    press_brake_cost_per_part = 0.0
    press_brake_total_cost = 0.0
    
    if press_brake_enabled:
        press_brake_setup_cost = quote_data.get('press_brake_setup_cost', 0.0)
        number_of_bends = quote_data.get('number_of_bends', 0)
        time_per_bend = quote_data.get('time_per_bend', 0.0)
        time_per_bend_unit = quote_data.get('time_per_bend_unit', 'sec per bend')
        packing_time_per_part = quote_data.get('packing_time_per_part', 0.0)
        packing_time_unit = quote_data.get('packing_time_unit', 'sec per part')
        press_brake_hourly_rate = quote_data.get('press_brake_hourly_rate', 0.0)
        
        # Convert times to minutes if necessary
        time_per_bend_minutes = time_per_bend if 'min' in time_per_bend_unit else time_per_bend / 60.0
        packing_time_minutes = packing_time_per_part if 'min' in packing_time_unit else packing_time_per_part / 60.0
        
        # Calculate press brake cost per part
        # Formula: (Setup Cost / Qty) + (Bends × Time per Bend × Rate) + (Packing Time × Rate)
        setup_cost_per_part = press_brake_setup_cost / quantity_required if quantity_required > 0 else 0.0
        bend_time_cost = (number_of_bends * time_per_bend_minutes) * (press_brake_hourly_rate / 60.0)  # Convert hourly to per-minute
        packing_cost = packing_time_minutes * (press_brake_hourly_rate / 60.0)  # Convert hourly to per-minute
        
        press_brake_cost_per_part = setup_cost_per_part + bend_time_cost + packing_cost
        press_brake_total_cost = press_brake_cost_per_part * quantity_required
    
    # 4. Fixed Costs per Part (Laser cutting setup costs)
    setup_cost = quote_data.get('setup_cost', 0.0)
    programming_cost = quote_data.get('programming_cost', 0.0)
    laser_cleaning_cost = quote_data.get('laser_cleaning_cost', 0.0)
    fixed_cost_per_part = (setup_cost + programming_cost + laser_cleaning_cost) / quantity_required if quantity_required > 0 else 0.0
    
    # 5. Other costs per part
    delivery_cost = quote_data.get('delivery_cost', 0.0)
    other_costs = quote_data.get('other_costs', 0.0)
    other_costs_per_part = (delivery_cost + other_costs) / quantity_required if quantity_required > 0 else 0.0
    
    # 6. Cost per Part (no GST) - includes all operations
    cost_per_part_no_gst = material_cost_per_part + cutting_cost_per_part + press_brake_cost_per_part + fixed_cost_per_part + other_costs_per_part
    
    # 7. Total Job Cost (before GST)
    total_job_cost = cost_per_part_no_gst * quantity_required
    
    # 8. GST Value
    gst_value = total_job_cost * GST_RATE
    
    # 9. Cost per Part (plus GST)
    cost_per_part_plus_gst = cost_per_part_no_gst * (1 + GST_RATE)
    
    # 10. Quote Total (allow sales adjustment)
    sales_adjusted_quote_total = quote_data.get('sales_adjusted_quote_total')
    if sales_adjusted_quote_total is not None:
        quote_total = sales_adjusted_quote_total
    else:
        quote_total = total_job_cost + gst_value
    
    # 11. Profit Calculations
    net_profit = quote_total - total_job_cost - gst_value  # Profit after GST
    gross_profit = quote_total - total_job_cost  # Profit before GST
    profit_percent = (net_profit / total_job_cost * 100) if total_job_cost > 0 else 0.0
    
    # 12. Break Even Value (point where profit = 0)
    break_even_value = total_job_cost + gst_value
    
    # 13. Calculate Quantity Breaks (if base cost is available)
    quantity_breaks = []
    if cost_per_part_no_gst > 0:
        # Get existing quantity breaks or create default ones
        existing_breaks = quote_data.get('quantity_breaks', [])
        if existing_breaks:
            # Recalculate existing quantity breaks
            for break_item in existing_breaks:
                qty = break_item.get('quantity', 0)
                if qty > 0:
                    # Recalculate with setup cost distribution
                    adjusted_fixed_cost = (setup_cost + programming_cost + laser_cleaning_cost) / qty if qty > 0 else fixed_cost_per_part
                    adjusted_pb_setup = (press_brake_setup_cost / qty) if press_brake_enabled and qty > 0 else 0.0
                    adjusted_pb_cost = adjusted_pb_setup + bend_time_cost + packing_cost if press_brake_enabled else 0.0
                    adjusted_other = (delivery_cost + other_costs) / qty if qty > 0 else other_costs_per_part
                    
                    price_per_part = material_cost_per_part + cutting_cost_per_part + adjusted_pb_cost + adjusted_fixed_cost + adjusted_other
                    price_per_part_with_gst = price_per_part * (1 + GST_RATE)
                    total = price_per_part_with_gst * qty
                    
                    quantity_breaks.append({
                        'quantity': qty,
                        'price_per_part': round(price_per_part_with_gst, 2),
                        'total': round(total, 2)
                    })
    
    return {
        'material_markup_percent': round(material_markup_percent, 2),
        'material_cost_per_part': round(material_cost_per_part, 2),
        'cutting_cost_per_part': round(cutting_cost_per_part, 2),
        'press_brake_cost_per_part': round(press_brake_cost_per_part, 2),
        'press_brake_total_cost': round(press_brake_total_cost, 2),
        'fixed_cost_per_part': round(fixed_cost_per_part, 2),
        'cost_per_part_no_gst': round(cost_per_part_no_gst, 2),
        'total_job_cost': round(total_job_cost, 2),
        'gst_value': round(gst_value, 2),
        'cost_per_part_plus_gst': round(cost_per_part_plus_gst, 2),
        'quote_total': round(quote_total, 2),
        'net_profit': round(net_profit, 2),
        'gross_profit': round(gross_profit, 2),
        'profit_percent': round(profit_percent, 2),
        'break_even_value': round(break_even_value, 2),
        'quantity_breaks': quantity_breaks
    }


async def calculate_material_cost_from_inventory(material_type: str, grade: str, finish: str, thickness: str) -> dict:
    """
    Calculate material cost from inventory average + 10% markup
    Returns buying cost, selling price, and markup percentage
    """
    query = {
        "name": material_type,
        "thickness": thickness,
        "grade": grade,
        "finish": finish
    }
    
    materials = await db.materials.find(query).to_list(100)
    
    if not materials:
        return {
            "buying_cost_per_sheet": 0.0,
            "selling_price_per_sheet": 0.0,
            "material_markup_percent": 0.0
        }
    
    # Calculate average buying cost (cost_average from inventory)
    total_cost = sum(m.get("cost_average", 0) for m in materials)
    avg_buying_cost = total_cost / len(materials)
    
    # Add 10% markup for selling price
    selling_price = avg_buying_cost * 1.10
    
    return {
        "buying_cost_per_sheet": round(avg_buying_cost, 2),
        "selling_price_per_sheet": round(selling_price, 2),
        "material_markup_percent": 10.0
    }


@router.get("/next-number")
async def get_next_number(
    current_user: dict = Depends(get_current_user)
):
    """Get the next quote number without creating a quote"""
    check_module_access(current_user, "quotes")
    
    # Peek at next number without incrementing
    counter = await db.counters.find_one({"_id": "quote_number"})
    next_value = counter.get("value", 0) + 1 if counter else 1
    
    return {
        "next_quote_number": str(next_value),
        "next_item_reference": str(next_value)
    }


@router.post("", response_model=Quote, status_code=status.HTTP_201_CREATED)
async def create_quote(
    quote_data: QuoteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new quote with auto-incrementing quote number"""
    check_module_access(current_user, "quotes")
    
    # Get next quote number and drawing number
    quote_number = await get_next_quote_number()
    drawing_number = await get_next_drawing_number()
    
    # Prepare quote dict
    quote_dict = quote_data.dict()
    quote_dict['quote_number'] = quote_number
    quote_dict['item_reference'] = quote_number  # Same as quote_number
    quote_dict['drawing_number'] = drawing_number
    quote_dict['created_by'] = current_user.get('username', 'system')
    
    # Handle quote_date properly - if it's a date string from frontend, convert it
    if 'quote_date' in quote_dict and isinstance(quote_dict['quote_date'], str):
        try:
            # Parse the date string (YYYY-MM-DD) and create datetime at start of day
            from datetime import datetime
            quote_dict['quote_date'] = datetime.fromisoformat(quote_dict['quote_date'] + 'T00:00:00')
        except (ValueError, TypeError):
            # If parsing fails, use current datetime
            quote_dict['quote_date'] = datetime.utcnow()
    
    # Check if this is a multi-item quote
    is_multi_item = quote_dict.get('is_multi_item', False)
    
    if is_multi_item:
        # Multi-item quote: line_items contain all costs already calculated by frontend
        # quote_total is sum of all line items, already calculated
        # No need to recalculate - frontend has done all the work
        line_items = quote_dict.get('line_items', [])
        if not line_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Multi-item quote must have at least one line item"
            )
        
        # Ensure quote_total is set (should be sum of all line items)
        if not quote_dict.get('quote_total'):
            quote_dict['quote_total'] = sum(item.get('total', 0) for item in line_items)
        
        # For multi-item quotes, set default values for legacy fields if not provided
        if not quote_dict.get('part_description'):
            quote_dict['part_description'] = 'Multi-Item Quote'
        if not quote_dict.get('material_type'):
            quote_dict['material_type'] = 'Various'
        if not quote_dict.get('grade'):
            quote_dict['grade'] = 'Various'
        if not quote_dict.get('finish'):
            quote_dict['finish'] = 'Various'
        if not quote_dict.get('thickness'):
            quote_dict['thickness'] = 'Various'
        if not quote_dict.get('sheet_width'):
            quote_dict['sheet_width'] = 1220.0
        if not quote_dict.get('sheet_length'):
            quote_dict['sheet_length'] = 2440.0
    else:
        # Single-item quote: validate required fields
        required_fields = ['part_description', 'material_type', 'grade', 'finish', 'thickness', 'sheet_width', 'sheet_length']
        missing_fields = [field for field in required_fields if not quote_dict.get(field)]
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Single-item quote missing required fields: {', '.join(missing_fields)}"
            )
        
        # Single-item quote: existing logic
        # Always trust frontend calculations if processes exist AND quote_total is provided
        # This prevents recalculation that would overwrite process-based costs
        has_processes = quote_dict.get('processes') and len(quote_dict.get('processes', [])) > 0
        has_quote_total = quote_dict.get('quote_total', 0) > 0
        
        if has_processes and has_quote_total:
            # Modern quotes with processes - frontend has already calculated correctly
            # Don't recalculate, just use what was provided
            pass
        elif has_processes and not has_quote_total:
            # Processes exist but no quote_total - calculate from process costs
            total_material = quote_dict.get('total_material_cost', 0.0)
            total_process = quote_dict.get('total_process_cost', 0.0)
            total_before_gst = total_material + total_process
            gst = total_before_gst * 0.10
            quote_dict['quote_total'] = total_before_gst + gst
            quote_dict['gst_value'] = gst
            quote_dict['total_job_cost'] = total_before_gst
        else:
            # No processes - legacy calculation for old-style quotes (laser cutting only)
            calculated_costs = await calculate_all_costs(quote_dict)
            quote_dict.update(calculated_costs)
    
    # Create quote object
    quote = Quote(**quote_dict)
    
    # Insert into database
    result = await db.quotes.insert_one(quote.dict())
    
    if not result.inserted_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create quote"
        )
    
    return quote


@router.get("", response_model=List[Quote])
async def get_quotes(
    current_user: dict = Depends(get_current_user),
    status_filter: Optional[str] = None,
    customer: Optional[str] = None
):
    """Get all quotes with optional filtering"""
    check_module_access(current_user, "quotes")
    
    query = {}
    if status_filter:
        query["status"] = status_filter
    if customer:
        query["customer_name"] = {"$regex": customer, "$options": "i"}
    
    # Get ALL quotes sorted by quote number (newest first)
    quotes = await db.quotes.find(query).sort("quote_number", -1).to_list(length=None)
    return [Quote(**quote) for quote in quotes]


@router.get("/{quote_id}", response_model=Quote)
async def get_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific quote by ID"""
    check_module_access(current_user, "quotes")
    
    quote = await db.quotes.find_one({"id": quote_id})
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    return Quote(**quote)


@router.get("/by-number/{quote_number}", response_model=Quote)
async def get_quote_by_number(
    quote_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific quote by quote number"""
    check_module_access(current_user, "quotes")
    
    quote = await db.quotes.find_one({"quote_number": quote_number})
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quote {quote_number} not found"
        )
    
    return Quote(**quote)


@router.put("/{quote_id}", response_model=Quote)
async def update_quote(
    quote_id: str,
    quote_update: QuoteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a quote and recalculate all costs"""
    check_module_access(current_user, "quotes")
    
    # Check if quote exists
    existing_quote = await db.quotes.find_one({"id": quote_id})
    if not existing_quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    # Update only provided fields
    update_data = quote_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    # Merge with existing data for recalculation
    merged_data = {**existing_quote, **update_data}
    
    # CRITICAL: Only recalculate if the quote uses legacy calculations (no processes)
    # Quotes with processes array should NEVER be recalculated by backend
    # The frontend handles all process-based calculations
    has_processes = merged_data.get('processes') and len(merged_data.get('processes', [])) > 0
    
    if has_processes:
        # Quote has processes - NEVER recalculate process costs
        # The frontend sends all calculated values, backend just stores them
        # This prevents material changes or any edits from zeroing out costs
        pass  # Don't call calculate_all_costs() at all
    else:
        # Legacy quote (no processes) - check if cost fields changed
        cost_affecting_fields = {'material_type', 'grade', 'thickness', 'sheet_width', 'sheet_length',
                               'buying_cost_per_sheet', 'selling_price_per_sheet', 'quantity_required',
                               'cutting_time_minutes', 'charge_rate_per_min', 'setup_cost',
                               'programming_cost', 'laser_cleaning_cost', 'delivery_cost', 'other_costs'}

        fields_being_updated = set(update_data.keys())
        cost_fields_updated = cost_affecting_fields.intersection(fields_being_updated)

        if cost_fields_updated:
            # Legacy quote and cost fields changed - recalculate using old logic
            calculated_costs = await calculate_all_costs(merged_data)
            update_data.update(calculated_costs)

    # CRITICAL: For multi-item quotes, always recompute quote_total from line item totals
    # (each line_item.total is inc-GST). Without this, line item edits would leave the
    # parent quote_total at $0.00 even though the individual line prices are correct.
    if merged_data.get('is_multi_item') and isinstance(merged_data.get('line_items'), list):
        def _to_float(v):
            try:
                if v is None or v == '':
                    return 0.0
                return float(v)
            except (TypeError, ValueError):
                return 0.0
        total_inc_gst = sum(
            _to_float(li.get('total')) or _to_float(li.get('line_total_with_gst'))
            for li in (merged_data.get('line_items') or [])
        )
        # If frontend explicitly sent a higher value (e.g. sales-adjusted), prefer that
        sent_total = _to_float(update_data.get('quote_total'))
        update_data['quote_total'] = round(max(sent_total, total_inc_gst), 2)
    
    # Update in database
    result = await db.quotes.update_one(
        {"id": quote_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update quote"
        )
    
    # Return updated quote
    updated_quote = await db.quotes.find_one({"id": quote_id})
    return Quote(**updated_quote)


@router.post("/{quote_id}/calculate", response_model=Quote)
async def recalculate_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Recalculate all costs for a quote"""
    check_module_access(current_user, "quotes")
    
    # Check if quote exists
    existing_quote = await db.quotes.find_one({"id": quote_id})
    if not existing_quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    # Recalculate all costs
    calculated_costs = await calculate_all_costs(existing_quote)
    update_data = {
        **calculated_costs,
        "updated_at": datetime.utcnow()
    }
    
    # Update in database
    await db.quotes.update_one(
        {"id": quote_id},
        {"$set": update_data}
    )
    
    # Return updated quote
    updated_quote = await db.quotes.find_one({"id": quote_id})
    return Quote(**updated_quote)


@router.patch("/{quote_id}/status")
async def update_quote_status(
    quote_id: str,
    status_update: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update only the status of a quote (for Print/Email/Job Sheet actions)"""
    check_module_access(current_user, "quotes")
    
    # Check if quote exists
    existing_quote = await db.quotes.find_one({"id": quote_id})
    if not existing_quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    new_status = status_update.get('status')
    if not new_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status field is required"
        )
    
    # Valid statuses
    valid_statuses = ["Draft", "Sent", "Accepted", "Rejected", "Job Created", "Ready for Invoice"]
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
    
    # Update status
    result = await db.quotes.update_one(
        {"id": quote_id},
        {"$set": {"status": new_status, "updated_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update quote status"
        )
    
    # Return updated quote
    updated_quote = await db.quotes.find_one({"id": quote_id})
    return Quote(**updated_quote)



@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a quote"""
    check_module_access(current_user, "quotes")
    
    result = await db.quotes.delete_one({"id": quote_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    return None


# ============================================
# HELPER ENDPOINTS
# ============================================

@router.get("/material-cost/calculate")
async def calculate_material_cost_endpoint(
    material_type: str,
    thickness: str,
    grade: str,
    finish: str,
    current_user: dict = Depends(get_current_user)
):
    """Calculate material cost from inventory (avg + 10%)"""
    check_module_access(current_user, "quotes")
    
    result = await calculate_material_cost_from_inventory(
        material_type, grade, finish, thickness
    )
    
    return {
        "material_type": material_type,
        "thickness": thickness,
        "grade": grade,
        "finish": finish,
        **result,
        "note": "Average inventory cost + 10% markup"
    }


@router.get("/cutting-parameters/all")
async def get_cutting_parameters(
    current_user: dict = Depends(get_current_user)
):
    """Get all cutting parameters for feed rate lookup"""
    check_module_access(current_user, "quotes")
    
    params = await db.cutting_parameters.find({}).to_list(1000)
    return params


@router.get("/cutting-parameters/feed-rate")
async def get_feed_rate(
    material_type: str,
    thickness: str,
    current_user: dict = Depends(get_current_user)
):
    """Get feed rate for specific material type and thickness"""
    check_module_access(current_user, "quotes")
    
    param = await db.cutting_parameters.find_one({
        "material_type": material_type,
        "thickness": thickness
    })
    
    if not param:
        return {
            "feed_rate": 0,
            "pierce_time": 2.0,
            "setup_time": 5.0,
            "hourly_rate": 0.0
        }
    
    return {
        "feed_rate": param.get("feed_rate", 0),
        "pierce_time": param.get("pierce_time", 2.0),
        "setup_time": param.get("setup_time", 5.0),
        "hourly_rate": param.get("hourly_rate", 0.0)
    }


@router.post("/calculate-cutting-time")
async def calculate_cutting_time(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate cutting time based on geometry and feed rate
    
    Expected data:
    - total_perimeter or geometry_for_time_calculation: mm
    - holes_quantity: number of holes
    - feed_rate: mm/min
    - pierce_time: seconds per pierce
    - setup_time: minutes
    """
    check_module_access(current_user, "quotes")
    
    # Get geometry (use total_perimeter or geometry_for_time_calculation)
    geometry = data.get("geometry_for_time_calculation") or data.get("total_perimeter", 0)
    holes_quantity = data.get("holes_quantity", 0)
    feed_rate = data.get("feed_rate", 0)
    pierce_time = data.get("pierce_time", 2.0)
    setup_time = data.get("setup_time", 5.0)
    
    if feed_rate == 0:
        return {"cutting_time_minutes": 0}
    
    # Calculate cutting time
    cutting_time = (geometry / feed_rate) if feed_rate > 0 else 0  # minutes for geometry
    pierce_time_total = (holes_quantity * pierce_time) / 60  # convert to minutes
    total_time = cutting_time + pierce_time_total + setup_time
    
    return {"cutting_time_minutes": round(total_time, 2)}



@router.post("/{quote_id}/mark-ready-to-invoice")
async def mark_quote_ready_to_invoice(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Admin override: Manually mark a quote as Ready to Invoice
    Use when packing slips are completed but status didn't auto-update
    """
    check_module_access(current_user, "quotes")
    
    # Only admins can override
    if current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can manually override quote status"
        )
    
    # Get the quote
    quote = await db.quotes.find_one({"id": quote_id})
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    # Update status to ready-to-invoice
    await db.quotes.update_one(
        {"id": quote_id},
        {
            "$set": {
                "status": "ready-to-invoice",
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return {
        "message": f"Quote {quote.get('quote_number')} manually marked as Ready to Invoice",
        "quote_id": quote_id,
        "new_status": "ready-to-invoice"
    }

