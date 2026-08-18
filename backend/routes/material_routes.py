from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from models import Material, MaterialCreate, MaterialUpdate, StockAdjustment, StockAdjustmentCreate, MaterialAttribute, MaterialAttributeCreate
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from datetime import datetime

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/materials", tags=["Materials/Inventory"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

@router.get("", response_model=List[Material])
async def get_materials(
    current_user: dict = Depends(get_current_user),
    name: str = None,
    thickness: str = None,
    grade: str = None,
    finish: str = None
):
    """Get all materials with optional filters"""
    # Check if user has inventory OR quotes access (quotes need to see materials)
    has_access = "inventory" in current_user.get("modules", []) or "quotes" in current_user.get("modules", [])
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to materials"
        )
    
    query = {}
    if name:
        query["name"] = {"$regex": name, "$options": "i"}
    if thickness:
        query["thickness"] = thickness
    if grade:
        query["grade"] = grade
    if finish:
        query["finish"] = finish
    
    materials = await db.materials.find(query).sort("name", 1).to_list(1000)
    return [Material(**material) for material in materials]

@router.get("/for-quoting", response_model=List[Material])
async def get_materials_for_quoting(
    current_user: dict = Depends(get_current_user)
):
    """Get all materials available for quoting (no filters, just for dropdown)"""
    check_module_access(current_user, "quotes")
    
    # Get all materials with stock > 0
    materials = await db.materials.find({"stock": {"$gt": 0}}).sort("name", 1).to_list(1000)
    return [Material(**material) for material in materials]

@router.get("/{material_id}", response_model=Material)
async def get_material(
    material_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific material by ID"""
    check_module_access(current_user, "inventory")
    
    material = await db.materials.find_one({"id": material_id})
    
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    return Material(**material)

@router.post("", response_model=Material, status_code=status.HTTP_201_CREATED)
async def create_material(
    material_data: MaterialCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new material"""
    check_module_access(current_user, "inventory")
    
    material = Material(**material_data.dict())
    
    result = await db.materials.insert_one(material.dict())
    
    if not result.inserted_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create material"
        )
    
    return material

@router.post("/adjust-stock", status_code=status.HTTP_200_OK)
async def adjust_stock(
    adjustment: StockAdjustmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add or remove stock from a material"""
    check_module_access(current_user, "inventory")
    
    # Get material
    material = await db.materials.find_one({"id": adjustment.material_id})
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    # Calculate new stock
    if adjustment.type == "add" or adjustment.type == "purchase":
        new_stock = material["stock"] + adjustment.quantity
    elif adjustment.type == "remove" or adjustment.type == "usage":
        new_stock = max(0, material["stock"] - adjustment.quantity)
    else:
        new_stock = material["stock"] + adjustment.quantity  # Can be negative for adjustments
    
    # Update stock
    await db.materials.update_one(
        {"id": adjustment.material_id},
        {"$set": {"stock": new_stock, "updated_at": datetime.utcnow()}}
    )
    
    # Record adjustment
    stock_adjustment = StockAdjustment(
        **adjustment.dict(),
        user=current_user.get("username")
    )
    await db.stock_adjustments.insert_one(stock_adjustment.dict())
    
    return {
        "success": True,
        "material_id": adjustment.material_id,
        "old_stock": material["stock"],
        "new_stock": new_stock,
        "adjustment": adjustment.quantity
    }

@router.put("/{material_id}", response_model=Material)
async def update_material(
    material_id: str,
    material_update: MaterialUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a material"""
    check_module_access(current_user, "inventory")
    
    # Check if material exists
    existing = await db.materials.find_one({"id": material_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    # Update only provided fields
    update_data = material_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.materials.update_one(
        {"id": material_id},
        {"$set": update_data}
    )
    
    # Return updated material
    updated = await db.materials.find_one({"id": material_id})
    return Material(**updated)

@router.get("/{material_id}/history", response_model=List[StockAdjustment])
async def get_material_history(
    material_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get stock adjustment history for a material"""
    check_module_access(current_user, "inventory")
    
    adjustments = await db.stock_adjustments.find(
        {"material_id": material_id}
    ).sort("created_at", -1).to_list(100)
    
    return [StockAdjustment(**adj) for adj in adjustments]

@router.get("/{material_id}/cost-breakdown")
async def get_cost_breakdown(
    material_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed cost breakdown showing PO allocation"""
    check_module_access(current_user, "inventory")
    
    # Get material
    material = await db.materials.find_one({"id": material_id})
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    # Get POs
    pos = await db.purchase_orders.find(
        {"material_id": material_id, "quantity_remaining": {"$gt": 0}}
    ).sort("received_date", 1).to_list(1000)
    
    # Calculate allocation
    current_stock = material["stock"]
    breakdown = []
    remaining_to_allocate = current_stock
    
    for po in pos:
        if remaining_to_allocate <= 0:
            break
        
        available = po.get("quantity_remaining", po["quantity_received"])
        allocated = min(available, remaining_to_allocate)
        
        breakdown.append({
            "po_number": po["po_number"],
            "price_per_sheet": po["price_per_sheet"],
            "allocated_qty": allocated,
            "total_cost": allocated * po["price_per_sheet"],
            "order_date": po["order_date"]
        })
        
        remaining_to_allocate -= allocated
    
    total_cost = sum(item["total_cost"] for item in breakdown)
    total_qty = sum(item["allocated_qty"] for item in breakdown)
    
    return {
        "material_id": material_id,
        "material_name": f"{material['name']} {material['thickness']} {material['grade']} {material['finish']}",
        "current_stock": current_stock,
        "cost_average": material.get("cost_average", 0),
        "selling_price": material.get("selling_price", 0),
        "markup_percentage": material.get("markup_percentage", 15),
        "breakdown": breakdown,
        "total_allocated": total_qty,
        "total_cost": round(total_cost, 2)
    }

# Material Attribute Management (for dropdowns)
@router.post("/attributes", response_model=MaterialAttribute, status_code=status.HTTP_201_CREATED)
async def create_material_attribute(
    attribute: MaterialAttributeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a new material attribute (grade, finish, type, thickness)"""
    check_module_access(current_user, "inventory")
    
    # Check if already exists
    existing = await db.material_attributes.find_one({
        "attribute_type": attribute.attribute_type,
        "value": attribute.value
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{attribute.attribute_type} '{attribute.value}' already exists"
        )
    
    attr = MaterialAttribute(**attribute.dict())
    await db.material_attributes.insert_one(attr.dict())
    
    return attr

@router.get("/attributes/{attribute_type}")
async def get_material_attributes(
    attribute_type: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all values for a specific attribute type"""
    check_module_access(current_user, "inventory")
    
    attributes = await db.material_attributes.find(
        {"attribute_type": attribute_type}
    ).sort("value", 1).to_list(1000)
    
    return [attr["value"] for attr in attributes]
