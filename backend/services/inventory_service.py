"""
Inventory Service - Handles cost averaging and PO tracking
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict
from datetime import datetime

async def calculate_cost_average(db: AsyncIOMotorDatabase, material_id: str) -> Dict:
    """
    Calculate weighted average cost based on FIFO logic
    
    Logic:
    1. Get all POs for this material (ordered by date)
    2. Allocate current stock from oldest to newest POs
    3. Calculate weighted average from allocated POs only
    4. Update material's cost_average and selling_price
    """
    
    # Get material
    material = await db.materials.find_one({"id": material_id})
    if not material:
        raise ValueError("Material not found")
    
    current_stock = material["stock"]
    
    # Get all POs for this material, ordered by date (FIFO)
    purchase_orders = await db.purchase_orders.find(
        {"material_id": material_id, "quantity_received": {"$gt": 0}}
    ).sort("received_date", 1).to_list(1000)
    
    if not purchase_orders or current_stock == 0:
        # No POs or no stock, use default or set to 0
        cost_average = 0.0
        selling_price = 0.0
    else:
        # FIFO allocation
        total_cost = 0.0
        allocated_qty = 0
        remaining_to_allocate = current_stock
        
        for po in purchase_orders:
            if remaining_to_allocate <= 0:
                break
            
            # How much can we allocate from this PO?
            available_from_po = po.get("quantity_remaining", po["quantity_received"])
            qty_from_this_po = min(available_from_po, remaining_to_allocate)
            
            # Add to total cost
            total_cost += qty_from_this_po * po["price_per_sheet"]
            allocated_qty += qty_from_this_po
            remaining_to_allocate -= qty_from_this_po
        
        # Calculate average
        if allocated_qty > 0:
            cost_average = round(total_cost / allocated_qty, 2)
        else:
            cost_average = 0.0
        
        # Calculate selling price with markup
        markup = material.get("markup_percentage", 15.0)
        selling_price = round(cost_average * (1 + markup / 100), 2)
    
    # Update material
    await db.materials.update_one(
        {"id": material_id},
        {
            "$set": {
                "cost_average": cost_average,
                "selling_price": selling_price,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return {
        "material_id": material_id,
        "current_stock": current_stock,
        "cost_average": cost_average,
        "markup_percentage": markup,
        "selling_price": selling_price,
        "allocated_from_pos": allocated_qty if current_stock > 0 else 0
    }

async def receive_purchase_order(
    db: AsyncIOMotorDatabase,
    po_id: str,
    quantity_received: int
) -> Dict:
    """
    Receive stock from a purchase order and update inventory
    """
    
    # Get PO
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise ValueError("Purchase order not found")
    
    # Update PO
    new_qty_received = po["quantity_received"] + quantity_received
    new_qty_remaining = new_qty_received  # For FIFO tracking
    
    status = "Received" if new_qty_received >= po["quantity_ordered"] else "Partial"
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {
            "$set": {
                "quantity_received": new_qty_received,
                "quantity_remaining": new_qty_remaining,
                "status": status,
                "received_date": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # Update material stock
    await db.materials.update_one(
        {"id": po["material_id"]},
        {
            "$inc": {"stock": quantity_received},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    # Recalculate cost average
    cost_info = await calculate_cost_average(db, po["material_id"])
    
    # Record stock adjustment
    await db.stock_adjustments.insert_one({
        "id": str(datetime.utcnow().timestamp()),
        "material_id": po["material_id"],
        "type": "purchase",
        "quantity": quantity_received,
        "reference": f"PO-{po['po_number']}",
        "note": f"Received {quantity_received} sheets from PO {po['po_number']}",
        "user": "system",
        "created_at": datetime.utcnow()
    })
    
    return {
        "po_id": po_id,
        "quantity_received": quantity_received,
        "total_received": new_qty_received,
        "status": status,
        "cost_info": cost_info
    }

async def consume_material(
    db: AsyncIOMotorDatabase,
    material_id: str,
    quantity: int,
    reference: str = None
) -> Dict:
    """
    Consume material from stock (e.g., for a quote/job)
    Updates stock and PO remaining quantities using FIFO
    """
    
    # Get material
    material = await db.materials.find_one({"id": material_id})
    if not material:
        raise ValueError("Material not found")
    
    if material["stock"] < quantity:
        raise ValueError(f"Insufficient stock. Available: {material['stock']}, Requested: {quantity}")
    
    # Update material stock
    await db.materials.update_one(
        {"id": material_id},
        {
            "$inc": {"stock": -quantity},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    # Update PO remaining quantities (FIFO)
    purchase_orders = await db.purchase_orders.find(
        {"material_id": material_id, "quantity_remaining": {"$gt": 0}}
    ).sort("received_date", 1).to_list(1000)
    
    remaining_to_consume = quantity
    
    for po in purchase_orders:
        if remaining_to_consume <= 0:
            break
        
        available = po.get("quantity_remaining", po["quantity_received"])
        consumed_from_po = min(available, remaining_to_consume)
        
        new_remaining = available - consumed_from_po
        
        await db.purchase_orders.update_one(
            {"id": po["id"]},
            {
                "$set": {
                    "quantity_remaining": new_remaining,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        remaining_to_consume -= consumed_from_po
    
    # Recalculate cost average
    cost_info = await calculate_cost_average(db, material_id)
    
    # Record stock adjustment
    await db.stock_adjustments.insert_one({
        "id": str(datetime.utcnow().timestamp()),
        "material_id": material_id,
        "type": "usage",
        "quantity": -quantity,
        "reference": reference or "Material consumption",
        "note": f"Consumed {quantity} sheets",
        "user": "system",
        "created_at": datetime.utcnow()
    })
    
    return {
        "material_id": material_id,
        "quantity_consumed": quantity,
        "new_stock": material["stock"] - quantity,
        "cost_info": cost_info
    }
