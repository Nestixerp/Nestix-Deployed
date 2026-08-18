from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import PackingSlip, PackingSlipCreate, PackingSlipUpdate, PackingSlipItem
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from datetime import datetime
import uuid

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'nestix_db')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

router = APIRouter(prefix="/api/packing-slips", tags=["packing-slips"])


@router.post("", response_model=PackingSlip, status_code=status.HTTP_201_CREATED)
async def create_packing_slip(
    packing_slip_data: PackingSlipCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a packing slip from a job sheet"""
    check_module_access(current_user, "packing_slips")
    
    # Get job sheet details
    job_sheet = await db.job_sheets.find_one({"id": packing_slip_data.job_sheet_id})
    if not job_sheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job sheet not found"
        )
    
    # Get quote details for customer information
    quote = await db.quotes.find_one({"id": job_sheet.get("quote_id")})
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found"
        )
    
    # Generate packing slip number
    year = datetime.now().year
    count = await db.packing_slips.count_documents({"packing_slip_number": {"$regex": f"^PS-{year}-"}})
    packing_slip_number = f"PS-{year}-{str(count + 1).zfill(4)}"
    
    # Calculate totals from items
    total_ordered = sum(item.qty_ordered for item in packing_slip_data.items)
    total_delivered = sum(item.qty_delivered for item in packing_slip_data.items)
    total_balance = sum(item.qty_balance for item in packing_slip_data.items)
    
    # Create packing slip
    packing_slip_dict = {
        "id": str(uuid.uuid4()),
        "packing_slip_number": packing_slip_number,
        "job_sheet_id": packing_slip_data.job_sheet_id,
        "quote_id": job_sheet.get("quote_id"),
        "job_sheet_number": job_sheet.get("job_sheet_number"),
        "line_item_id": job_sheet.get("line_item_id"),  # For multi-item quotes
        "line_item_number": job_sheet.get("line_item_number"),  # Line number in quote
        "customer_id": quote.get("customer_id"),  # Add customer_id for invoice creation
        "customer_name": quote.get("customer_name"),
        "customer_address": quote.get("customer_address"),
        "customer_suburb": quote.get("customer_suburb"),
        "customer_state": quote.get("customer_state"),
        "customer_postcode": quote.get("customer_postcode"),
        "customer_phone": quote.get("customer_phone"),
        "customer_fax": quote.get("customer_fax"),
        "customer_po_number": packing_slip_data.customer_po_number or job_sheet.get("po_number"),
        "delivery_address": packing_slip_data.delivery_address or quote.get("customer_address"),
        "delivery_suburb": packing_slip_data.delivery_suburb or quote.get("customer_suburb"),
        "delivery_state": packing_slip_data.delivery_state or quote.get("customer_state"),
        "delivery_postcode": packing_slip_data.delivery_postcode or quote.get("customer_postcode"),
        "delivery_phone": packing_slip_data.delivery_phone or quote.get("customer_phone"),
        "delivery_instructions": packing_slip_data.delivery_instructions,
        "time_ready": packing_slip_data.time_ready,
        "items": [item.dict() for item in packing_slip_data.items],
        "total_ordered": total_ordered,
        "total_delivered": total_delivered,
        "total_balance": total_balance,
        "status": "Pending",
        "created_at": datetime.utcnow(),
        "delivery_date": packing_slip_data.delivery_date,
        "notes": packing_slip_data.notes,
        "created_by": current_user.get("username"),
        "is_invoiced": False
    }
    
    await db.packing_slips.insert_one(packing_slip_dict)
    
    # Update job sheet status if fully delivered
    if total_balance == 0:
        await db.job_sheets.update_one(
            {"id": packing_slip_data.job_sheet_id},
            {"$set": {"status": "Completed"}}
        )
    
    return PackingSlip(**packing_slip_dict)


@router.get("", response_model=List[PackingSlip])
async def get_packing_slips(
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    job_sheet_id: Optional[str] = None,
    is_invoiced: Optional[bool] = None
):
    """Get all packing slips with optional filters"""
    check_module_access(current_user, "packing_slips")
    
    query = {}
    if status:
        query["status"] = status
    if job_sheet_id:
        query["job_sheet_id"] = job_sheet_id
    if is_invoiced is not None:
        query["is_invoiced"] = is_invoiced
    
    packing_slips = await db.packing_slips.find(query).sort("created_at", -1).to_list(length=None)
    return [PackingSlip(**ps) for ps in packing_slips]


@router.get("/by-po")
async def get_packing_slips_by_po(
    po_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all packing slips for a specific PO number (for invoice creation)"""
    check_module_access(current_user, "packing_slips")
    
    packing_slips = await db.packing_slips.find({
        "customer_po_number": po_number
        # Don't filter by status - let user select any packing slip
    }).to_list(length=None)
    
    # Check which packing slips are already invoiced
    # Method 1: Check is_invoiced field directly
    # Method 2: Check if they appear in any invoice line items
    invoices = await db.invoices.find({
        "purchase_order_number": po_number
    }).to_list(length=None)
    
    invoiced_ps_ids = set()
    for invoice in invoices:
        for line_item in invoice.get('line_items', []):
            invoiced_ps_ids.add(line_item.get('packing_slip_id'))
    
    # Convert to proper format and mark as invoiced or not
    result = []
    for ps in packing_slips:
        # Remove MongoDB _id field
        if '_id' in ps:
            del ps['_id']
        
        # Mark as invoiced if EITHER:
        # 1. The is_invoiced field is True, OR
        # 2. It appears in an invoice line item
        ps['is_invoiced'] = ps.get('is_invoiced', False) or (ps.get('id') in invoiced_ps_ids)
        result.append(ps)
    
    return result


@router.get("/{packing_slip_id}", response_model=PackingSlip)
async def get_packing_slip(
    packing_slip_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific packing slip by ID"""
    check_module_access(current_user, "packing_slips")
    
    packing_slip = await db.packing_slips.find_one({"id": packing_slip_id})
    if not packing_slip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Packing slip not found"
        )
    
    return PackingSlip(**packing_slip)


@router.patch("/{packing_slip_id}/status", response_model=PackingSlip)
async def update_packing_slip_status(
    packing_slip_id: str,
    status_update: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update packing slip status"""
    check_module_access(current_user, "packing_slips")
    
    new_status = status_update.get('status')
    if not new_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status is required"
        )
    
    valid_statuses = ["Pending", "Shipped", "Delivered", "Completed", "Invoiced"]
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
    
    result = await db.packing_slips.update_one(
        {"id": packing_slip_id},
        {"$set": {"status": new_status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Packing slip not found"
        )
    
    packing_slip = await db.packing_slips.find_one({"id": packing_slip_id})
    return PackingSlip(**packing_slip)


@router.patch("/{packing_slip_id}", response_model=PackingSlip)
async def update_packing_slip(
    packing_slip_id: str,
    packing_slip_update: PackingSlipUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update packing slip details"""
    check_module_access(current_user, "packing_slips")
    
    # Get existing packing slip
    existing = await db.packing_slips.find_one({"id": packing_slip_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Packing slip not found"
        )
    
    # Update only provided fields
    update_data = packing_slip_update.dict(exclude_unset=True)
    
    if update_data:
        result = await db.packing_slips.update_one(
            {"id": packing_slip_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Packing slip not found"
            )
        
        if result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update packing slip"
            )
    
    packing_slip = await db.packing_slips.find_one({"id": packing_slip_id})
    return PackingSlip(**packing_slip)


@router.delete("/{packing_slip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_packing_slip(
    packing_slip_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a packing slip (only if not invoiced)"""
    check_module_access(current_user, "packing_slips")
    
    # Check if packing slip exists and is not invoiced
    packing_slip = await db.packing_slips.find_one({"id": packing_slip_id})
    if not packing_slip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Packing slip not found"
        )
    
    if packing_slip.get("is_invoiced"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete packing slip that has been invoiced"
        )
    
    result = await db.packing_slips.delete_one({"id": packing_slip_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete packing slip"
        )
    
    return None
