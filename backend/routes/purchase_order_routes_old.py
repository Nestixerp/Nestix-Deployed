from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from models import PurchaseOrder, PurchaseOrderCreate
from auth import get_current_user, check_module_access
from services.inventory_service import calculate_cost_average, receive_purchase_order
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/purchase-orders", tags=["Purchase Orders"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

@router.post("", response_model=PurchaseOrder, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    po_data: PurchaseOrderCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new purchase order"""
    check_module_access(current_user, "inventory")
    
    # Check if material exists
    material = await db.materials.find_one({"id": po_data.material_id})
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found"
        )
    
    # Create PO
    po = PurchaseOrder(
        **po_data.dict(),
        quantity_remaining=po_data.quantity_received,
        status="Received" if po_data.quantity_received >= po_data.quantity_ordered else "Partial"
    )
    
    await db.purchase_orders.insert_one(po.dict())
    
    # Update material stock if quantity received
    if po_data.quantity_received > 0:
        await db.materials.update_one(
            {"id": po_data.material_id},
            {"$inc": {"stock": po_data.quantity_received}}
        )
        
        # Recalculate cost average
        await calculate_cost_average(db, po_data.material_id)
    
    return po

@router.get("", response_model=List[PurchaseOrder])
async def get_purchase_orders(
    current_user: dict = Depends(get_current_user),
    material_id: str = None,
    status_filter: str = None
):
    """Get all purchase orders"""
    check_module_access(current_user, "inventory")
    
    query = {}
    if material_id:
        query["material_id"] = material_id
    if status_filter:
        query["status"] = status_filter
    
    pos = await db.purchase_orders.find(query).sort("order_date", -1).to_list(1000)
    return [PurchaseOrder(**po) for po in pos]

@router.get("/{po_id}", response_model=PurchaseOrder)
async def get_purchase_order(
    po_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific purchase order"""
    check_module_access(current_user, "inventory")
    
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    return PurchaseOrder(**po)

@router.post("/{po_id}/receive")
async def receive_po(
    po_id: str,
    quantity: int,
    current_user: dict = Depends(get_current_user)
):
    """Receive stock from a purchase order"""
    check_module_access(current_user, "inventory")
    
    try:
        result = await receive_purchase_order(db, po_id, quantity)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase_order(
    po_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a purchase order"""
    check_module_access(current_user, "inventory")
    
    result = await db.purchase_orders.delete_one({"id": po_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    return None
