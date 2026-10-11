from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import Supplier, SupplierCreate, SupplierUpdate, SupplierContact, SupplierContactCreate, SupplierContactUpdate
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from datetime import datetime

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/suppliers", tags=["Suppliers"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

async def generate_supplier_code():
    """Generate next supplier code in format SUP-0001, SUP-0002, etc."""
    # Get the highest existing supplier code
    suppliers = await db.suppliers.find().sort("supplier_code", -1).limit(1).to_list(1)
    
    if not suppliers:
        return "SUP-0001"
    
    last_code = suppliers[0].get("supplier_code", "SUP-0000")
    # Extract number from last code (e.g., "SUP-0023" -> 23)
    try:
        last_num = int(last_code.split('-')[1])
        new_num = last_num + 1
        return f"SUP-{new_num:04d}"
    except Exception:
        return "SUP-0001"

# Supplier CRUD Operations
@router.post("", response_model=Supplier, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    supplier_data: SupplierCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new supplier with auto-generated supplier code"""
    check_module_access(current_user, "suppliers")
    
    # Generate supplier code
    supplier_code = await generate_supplier_code()
    
    # Create supplier
    supplier = Supplier(
        **supplier_data.dict(),
        supplier_code=supplier_code
    )
    
    await db.suppliers.insert_one(supplier.dict())
    
    return supplier

@router.get("", response_model=List[Supplier])
async def get_suppliers(
    current_user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None
):
    """Get all suppliers with optional filters"""
    check_module_access(current_user, "suppliers")
    
    query = {}
    if category:
        query["category"] = category
    if status_filter:
        query["status"] = status_filter
    if search:
        query["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"supplier_code": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    suppliers = await db.suppliers.find(query).sort("supplier_code", 1).to_list(1000)
    return [Supplier(**supplier) for supplier in suppliers]

@router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(
    supplier_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific supplier by ID"""
    check_module_access(current_user, "suppliers")
    
    supplier = await db.suppliers.find_one({"id": supplier_id})
    
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )
    
    return Supplier(**supplier)

@router.put("/{supplier_id}", response_model=Supplier)
async def update_supplier(
    supplier_id: str,
    supplier_update: SupplierUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a supplier"""
    check_module_access(current_user, "suppliers")
    
    # Check if supplier exists
    existing = await db.suppliers.find_one({"id": supplier_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )
    
    # Update only provided fields
    update_data = supplier_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": update_data}
    )
    
    # Return updated supplier
    updated = await db.suppliers.find_one({"id": supplier_id})
    return Supplier(**updated)

@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a supplier (admin only)"""
    check_module_access(current_user, "suppliers")
    
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )
    
    # Also delete all contacts for this supplier
    await db.supplier_contacts.delete_many({"supplier_id": supplier_id})
    
    return None

# Supplier Contact CRUD Operations
@router.post("/{supplier_id}/contacts", response_model=SupplierContact, status_code=status.HTTP_201_CREATED)
async def create_supplier_contact(
    supplier_id: str,
    contact_data: SupplierContactCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new contact for a supplier"""
    check_module_access(current_user, "suppliers")
    
    # Verify supplier exists
    supplier = await db.suppliers.find_one({"id": supplier_id})
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )
    
    # Override supplier_id to ensure consistency
    contact_data_dict = contact_data.dict()
    contact_data_dict["supplier_id"] = supplier_id
    
    contact = SupplierContact(**contact_data_dict)
    await db.supplier_contacts.insert_one(contact.dict())
    
    return contact

@router.get("/{supplier_id}/contacts", response_model=List[SupplierContact])
async def get_supplier_contacts(
    supplier_id: str,
    current_user: dict = Depends(get_current_user),
    active_only: bool = False
):
    """Get all contacts for a supplier"""
    check_module_access(current_user, "suppliers")
    
    query = {"supplier_id": supplier_id}
    if active_only:
        query["status"] = "Active"
    
    contacts = await db.supplier_contacts.find(query).to_list(1000)
    return [SupplierContact(**contact) for contact in contacts]

@router.put("/contacts/{contact_id}", response_model=SupplierContact)
async def update_supplier_contact(
    contact_id: str,
    contact_update: SupplierContactUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a supplier contact"""
    check_module_access(current_user, "suppliers")
    
    # Check if contact exists
    existing = await db.supplier_contacts.find_one({"id": contact_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    # Update only provided fields
    update_data = contact_update.dict(exclude_unset=True)
    
    await db.supplier_contacts.update_one(
        {"id": contact_id},
        {"$set": update_data}
    )
    
    # Return updated contact
    updated = await db.supplier_contacts.find_one({"id": contact_id})
    return SupplierContact(**updated)

@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a supplier contact"""
    check_module_access(current_user, "suppliers")
    
    result = await db.supplier_contacts.delete_one({"id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    return None

@router.get("/active/dropdown", response_model=List[dict])
async def get_active_suppliers_dropdown(
    current_user: dict = Depends(get_current_user)
):
    """Get active suppliers for dropdown selection (used in PO creation)"""
    check_module_access(current_user, "suppliers")
    
    suppliers = await db.suppliers.find({"status": "Active"}).sort("company_name", 1).to_list(1000)
    
    return [
        {
            "id": s["id"],
            "supplier_code": s["supplier_code"],
            "company_name": s["company_name"]
        }
        for s in suppliers
    ]

# Performance & Analytics Endpoints
@router.get("/{supplier_id}/deliveries")
async def get_supplier_deliveries(
    supplier_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = 10
):
    """Get recent delivery history for a supplier"""
    check_module_access(current_user, "suppliers")
    
    from services.supplier_service import SupplierService
    service = SupplierService(db)
    
    deliveries = await service.get_recent_deliveries(supplier_id, limit)
    return deliveries

@router.get("/{supplier_id}/alerts")
async def get_supplier_alerts(
    supplier_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get alerts for a supplier (insurance expiry, late deliveries, etc.)"""
    check_module_access(current_user, "suppliers")
    
    from services.supplier_service import SupplierService
    service = SupplierService(db)
    
    alerts = await service.check_alerts(supplier_id)
    return {"alerts": alerts}

@router.post("/{supplier_id}/update-metrics")
async def update_supplier_metrics(
    supplier_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Manually trigger metrics update for a supplier"""
    check_module_access(current_user, "suppliers")
    
    from services.supplier_service import SupplierService
    service = SupplierService(db)
    
    metrics = await service.update_supplier_metrics(supplier_id)
    return {"message": "Metrics updated successfully", "metrics": metrics}

# Dashboard & Reports
@router.get("/analytics/dashboard")
async def get_supplier_dashboard(
    current_user: dict = Depends(get_current_user)
):
    """Get supplier performance dashboard data"""
    check_module_access(current_user, "suppliers")
    
    from services.supplier_service import SupplierService
    service = SupplierService(db)
    
    # Get dashboard widgets
    top_performers = await service.get_top_performing_suppliers(5)
    bottom_performers = await service.get_bottom_performing_suppliers(5)
    spend_by_category = await service.get_spend_by_category()
    
    # Calculate average days late across all suppliers
    all_suppliers = await db.suppliers.find({"status": "Active", "total_pos": {"$gt": 0}}).to_list(1000)
    avg_days_late = sum(s.get("average_days_late", 0) for s in all_suppliers) / len(all_suppliers) if all_suppliers else 0
    
    # Count suppliers with alerts
    suppliers_with_alerts = 0
    for supplier in all_suppliers:
        alerts = await service.check_alerts(supplier["id"])
        if alerts:
            suppliers_with_alerts += 1
    
    return {
        "top_performers": [
            {
                "id": s["id"],
                "supplier_code": s["supplier_code"],
                "company_name": s["company_name"],
                "on_time_delivery": s["on_time_delivery"],
                "performance_rating": s["performance_rating"]
            }
            for s in top_performers
        ],
        "bottom_performers": [
            {
                "id": s["id"],
                "supplier_code": s["supplier_code"],
                "company_name": s["company_name"],
                "average_days_late": s["average_days_late"],
                "performance_rating": s["performance_rating"]
            }
            for s in bottom_performers
        ],
        "spend_by_category": spend_by_category,
        "system_average_days_late": round(avg_days_late, 1),
        "suppliers_with_alerts": suppliers_with_alerts
    }

@router.get("/analytics/performance-report")
async def get_performance_report(
    current_user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    performance_level: Optional[str] = None
):
    """Get supplier performance report with filters"""
    check_module_access(current_user, "suppliers")
    
    query = {"status": "Active"}
    if category:
        query["category"] = category
    if performance_level:
        query["performance_rating"] = performance_level
    
    suppliers = await db.suppliers.find(query).sort("on_time_delivery", -1).to_list(1000)
    
    return {
        "total_suppliers": len(suppliers),
        "filters": {"category": category, "performance_level": performance_level},
        "suppliers": [
            {
                "supplier_code": s["supplier_code"],
                "company_name": s["company_name"],
                "category": s["category"],
                "on_time_delivery": s["on_time_delivery"],
                "average_days_late": s["average_days_late"],
                "performance_rating": s["performance_rating"],
                "total_pos": s["total_pos"],
                "fy_spend": s["fy_spend"]
            }
            for s in suppliers
        ]
    }
