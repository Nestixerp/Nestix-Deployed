from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from models import Quote, QuoteCreate, QuoteUpdate
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

async def get_next_item_number() -> int:
    """Get next item number by incrementing the counter"""
    counter = await db.counters.find_one_and_update(
        {"_id": "item_number"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True
    )
    return counter.get("value", 1) if counter else 1

async def calculate_material_cost(material_data: dict) -> float:
    """Calculate average material cost from inventory + 10% markup"""
    # Find matching materials in inventory
    query = {
        "name": material_data.get("type"),
        "thickness": material_data.get("thickness"),
        "grade": material_data.get("grade"),
        "finish": material_data.get("finish")
    }
    
    materials = await db.materials.find(query).to_list(100)
    
    if not materials:
        # Return default if no materials found
        return 0.0
    
    # Calculate average cost
    total_cost = sum(m["cost_per_sheet"] for m in materials)
    avg_cost = total_cost / len(materials)
    
    # Add 10% markup
    markup_cost = avg_cost * 1.10
    
    return round(markup_cost, 2)

@router.post("", response_model=Quote, status_code=status.HTTP_201_CREATED)
async def create_quote(
    quote_data: QuoteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new quote"""
    check_module_access(current_user, "quotes")
    
    # Get next item number
    item_number = await get_next_item_number()
    
    # Calculate material cost from inventory if not provided
    if quote_data.material.sheet_cost is None:
        material_cost = await calculate_material_cost(quote_data.material.dict())
        quote_data.material.sheet_cost = material_cost
    
    # Create quote object
    quote = Quote(
        item_number=item_number,
        **quote_data.dict()
    )
    
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
    status_filter: str = None,
    customer: str = None
):
    """Get all quotes with optional filters"""
    check_module_access(current_user, "quotes")
    
    query = {}
    if status_filter:
        query["status"] = status_filter
    if customer:
        query["customer"] = {"$regex": customer, "$options": "i"}
    
    quotes = await db.quotes.find(query).sort("item_number", -1).to_list(1000)
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

@router.get("/item-number/{item_number}", response_model=Quote)
async def get_quote_by_item_number(
    item_number: int,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific quote by item number"""
    check_module_access(current_user, "quotes")
    
    quote = await db.quotes.find_one({"item_number": item_number})
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    return Quote(**quote)

@router.put("/{quote_id}", response_model=Quote)
async def update_quote(
    quote_id: str,
    quote_update: QuoteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a quote"""
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
    
    # Recalculate material cost if material changed
    if "material" in update_data:
        material_cost = await calculate_material_cost(update_data["material"])
        update_data["material"]["sheet_cost"] = material_cost
    
    result = await db.quotes.update_one(
        {"id": quote_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update quote"
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
    
    material_data = {
        "type": material_type,
        "thickness": thickness,
        "grade": grade,
        "finish": finish
    }
    
    cost = await calculate_material_cost(material_data)
    
    return {
        "material_type": material_type,
        "thickness": thickness,
        "grade": grade,
        "finish": finish,
        "calculated_cost": cost,
        "note": "Average inventory cost + 10% markup"
    }


# Get cutting parameters (feed rates)
@router.get("/cutting-parameters/all")
async def get_cutting_parameters(
    current_user: dict = Depends(get_current_user)
):
    """Get all cutting parameters for feed rate lookup"""
    check_module_access(current_user, "quotes")
    
    params = await db.cutting_parameters.find({}, {"_id": 0}).to_list(1000)
    return params

# Get feed rate for specific material and thickness
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
        return {"feed_rate": 0, "pierce_time": 2.0, "setup_time": 5.0}
    
    return {
        "feed_rate": param.get("feed_rate", 0),
        "pierce_time": param.get("pierce_time", 2.0),
        "setup_time": param.get("setup_time", 5.0)
    }

# Calculate cutting time from geometry
@router.post("/calculate-cutting-time")
async def calculate_cutting_time(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Calculate cutting time based on geometry and feed rate"""
    check_module_access(current_user, "quotes")
    
    perimeter = data.get("perimeter", 0)  # mm
    holes_quantity = data.get("holes_quantity", 0)
    feed_rate = data.get("feed_rate", 0)  # mm/min
    pierce_time = data.get("pierce_time", 2.0)  # seconds
    setup_time = data.get("setup_time", 5.0)  # minutes
    
    if feed_rate == 0:
        return {"cutting_time_minutes": 0}
    
    # Calculate cutting time
    cutting_time = (perimeter / feed_rate) if feed_rate > 0 else 0  # minutes for perimeter
    pierce_time_total = (holes_quantity * pierce_time) / 60  # convert to minutes
    total_time = cutting_time + pierce_time_total + setup_time
    
    return {"cutting_time_minutes": round(total_time, 2)}

