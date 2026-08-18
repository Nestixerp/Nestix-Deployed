from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderLineItem
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from datetime import datetime

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/purchase-orders", tags=["Purchase Orders"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

async def generate_po_number():
    """Generate next PO number in format PO-2025-0001"""
    current_year = datetime.utcnow().year
    
    # Get the highest PO number for current year
    pos = await db.purchase_orders.find({
        "po_number": {"$regex": f"^PO-{current_year}-"}
    }).sort("po_number", -1).limit(1).to_list(1)
    
    if not pos:
        return f"PO-{current_year}-0001"
    
    last_po = pos[0].get("po_number", f"PO-{current_year}-0000")
    try:
        last_num = int(last_po.split('-')[2])
        new_num = last_num + 1
        return f"PO-{current_year}-{new_num:04d}"
    except:
        return f"PO-{current_year}-0001"

@router.post("", response_model=PurchaseOrder, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    po_data: PurchaseOrderCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new purchase order"""
    check_module_access(current_user, "purchase_orders")
    
    # Get supplier details
    supplier = await db.suppliers.find_one({"id": po_data.supplier_id})
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )
    
    # Generate PO number
    po_number = await generate_po_number()
    
    # Process line items
    line_items = []
    subtotal = 0.0
    
    for item in po_data.line_items:
        # For stock POs, validate material exists in inventory
        if po_data.po_type == "Stock" and item.get("material_id"):
            material = await db.materials.find_one({"id": item["material_id"]})
            if not material:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Material {item['material_id']} not found"
                )
        
        line_total = item["quantity_ordered"] * item["price_per_unit"]
        subtotal += line_total
        
        line_item = PurchaseOrderLineItem(
            material_id=item.get("material_id"),
            material_type=item["material_type"],
            grade=item["grade"],
            finish=item["finish"],
            thickness=item["thickness"],
            width=item["width"],
            length=item["length"],
            quantity_ordered=item["quantity_ordered"],
            price_per_unit=item["price_per_unit"],
            line_total=line_total,
            notes=item.get("notes")
        )
        line_items.append(line_item)
    
    # Calculate totals (no tax for now)
    total = subtotal
    
    # Create PO
    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=po_data.supplier_id,
        supplier_name=supplier["company_name"],
        supplier_code=supplier["supplier_code"],
        po_type=po_data.po_type,
        job_number=po_data.job_number,
        test_cert_required=po_data.test_cert_required if hasattr(po_data, 'test_cert_required') else False,
        expected_delivery_date=po_data.expected_delivery_date,
        line_items=[item.dict() for item in line_items],
        subtotal=subtotal,
        total=total,
        notes=po_data.notes,
        internal_notes=po_data.internal_notes,
        created_by=current_user["username"]
    )
    
    await db.purchase_orders.insert_one(po.dict())
    
    return po

@router.get("", response_model=List[PurchaseOrder])
async def get_purchase_orders(
    current_user: dict = Depends(get_current_user),
    supplier_id: Optional[str] = None,
    status: Optional[str] = None,
    po_type: Optional[str] = None,
    overdue: Optional[bool] = None
):
    """Get all purchase orders with optional filters"""
    check_module_access(current_user, "purchase_orders")
    
    query = {}
    if supplier_id:
        query["supplier_id"] = supplier_id
    if status:
        query["status"] = status
    if po_type:
        query["po_type"] = po_type
    
    # Filter for overdue orders
    if overdue:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        query["expected_delivery_date"] = {"$lte": today}
        query["status"] = {"$in": ["Draft", "Sent", "Partial"]}  # Not yet fully received
    
    pos = await db.purchase_orders.find(query).sort("created_at", -1).to_list(1000)
    return [PurchaseOrder(**po) for po in pos]

@router.get("/{po_id}", response_model=PurchaseOrder)
async def get_purchase_order(
    po_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific purchase order"""
    check_module_access(current_user, "purchase_orders")
    
    po = await db.purchase_orders.find_one({"id": po_id})
    
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    return PurchaseOrder(**po)

@router.put("/{po_id}", response_model=PurchaseOrder)
async def update_purchase_order(
    po_id: str,
    po_update: PurchaseOrderUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a purchase order"""
    check_module_access(current_user, "purchase_orders")
    
    # Check if PO exists
    existing = await db.purchase_orders.find_one({"id": po_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    # Update only provided fields
    update_data = po_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": update_data}
    )
    
    # Return updated PO
    updated = await db.purchase_orders.find_one({"id": po_id})
    return PurchaseOrder(**updated)

@router.post("/{po_id}/receive")
async def receive_purchase_order(
    po_id: str,
    receive_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Receive a purchase order (full or partial)"""
    check_module_access(current_user, "purchase_orders")
    
    # Get PO
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    actual_delivery_date = datetime.utcnow()
    
    # Calculate days late
    expected = po["expected_delivery_date"]
    days_late = (actual_delivery_date - expected).days
    
    # Update line items with received quantities
    updated_line_items = []
    all_received = True
    
    for item in po["line_items"]:
        received_qty = receive_data.get("line_items", {}).get(item["id"], 0)
        item["quantity_received"] += received_qty
        
        if item["quantity_received"] < item["quantity_ordered"]:
            all_received = False
        
        updated_line_items.append(item)
        
        # Update inventory stock ONLY for Stock POs
        if received_qty > 0 and po["po_type"] == "Stock" and item.get("material_id"):
            await db.materials.update_one(
                {"id": item["material_id"]},
                {"$inc": {"stock": received_qty}}
            )
            
            # Record stock adjustment
            await db.stock_adjustments.insert_one({
                "material_id": item["material_id"],
                "type": "PO Receipt",
                "quantity": received_qty,
                "reference": po["po_number"],
                "note": f"Received from {po['supplier_name']}",
                "user": current_user["username"],
                "created_at": datetime.utcnow()
            })
        elif received_qty > 0 and po["po_type"] == "Job-Specific":
            # For job-specific materials, link to job record
            # TODO: Update job/job sheet with received materials
            pass
    
    # Determine new status
    new_status = "Received" if all_received else "Partial"
    
    # Update PO
    await db.purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "line_items": updated_line_items,
                "actual_delivery_date": actual_delivery_date,
                "days_late": days_late,
                "status": new_status,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # Update supplier metrics
    from services.supplier_service import SupplierService
    supplier_service = SupplierService(db)
    
# Email PO endpoint
@router.post("/{po_id}/email")
async def email_purchase_order(
    po_id: str,
    email_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Send PO via email to supplier contact"""
    check_module_access(current_user, "purchase_orders")
    
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    # TODO: Implement actual email sending logic
    # For now, just log the email request
    print(f"Email PO {po['po_number']} to {email_data.get('contact_email')}")
    print(f"Subject: {email_data.get('subject')}")
    print(f"Message: {email_data.get('message')}")
    
    # Update status from Draft to Sent
    if po["status"] == "Draft":
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$set": {"status": "Sent", "updated_at": datetime.utcnow()}}
        )
    
    return {
        "success": True,
        "message": f"PO {po['po_number']} email sent to {email_data.get('contact_name')}"
    }
    await supplier_service.update_supplier_metrics(po["supplier_id"])
    
    return {
        "message": "Purchase order received successfully",
        "status": new_status,
        "days_late": days_late
    }

@router.delete("/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_purchase_order(
    po_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a purchase order"""
    check_module_access(current_user, "purchase_orders")
    
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"status": "Cancelled", "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found"
        )
    
    return None
