from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import Invoice, InvoiceCreate, InvoiceUpdate, InvoicePayment, InvoiceLineItem
from auth import get_current_user
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api", tags=["Invoices"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

def prepare_for_mongo(data: dict) -> dict:
    """Convert datetime objects to ISO strings for MongoDB storage"""
    for key, value in data.items():
        if isinstance(value, datetime):
            data[key] = value.isoformat()
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, dict):
                    value[i] = prepare_for_mongo(item)
    return data

def parse_from_mongo(item: dict) -> dict:
    """Convert ISO strings back to datetime objects"""
    if not item:
        return item
    
    datetime_fields = ['invoice_date', 'due_date', 'payment_date', 'created_at', 'updated_at', 'sent_at']
    for field in datetime_fields:
        if field in item and isinstance(item[field], str):
            try:
                item[field] = datetime.fromisoformat(item[field])
            except Exception:
                pass
    
    # Parse line items if present
    if 'line_items' in item and isinstance(item['line_items'], list):
        for line_item in item['line_items']:
            if isinstance(line_item, dict):
                parse_from_mongo(line_item)
    
    return item

async def get_next_invoice_number():
    """Generate next invoice number in sequence"""
    last_invoice = await db.invoices.find_one(
        sort=[("invoice_number", -1)]
    )
    
    if last_invoice and last_invoice.get('invoice_number'):
        # Extract number from "INV-001" format
        try:
            last_num = int(last_invoice['invoice_number'].split('-')[1])
            next_num = last_num + 1
        except Exception:
            next_num = 1
    else:
        next_num = 1
    
    return f"INV-{next_num:03d}"

def calculate_due_date(invoice_date: datetime, payment_terms: str) -> datetime:
    """Calculate due date based on payment terms"""
    if not payment_terms:
        return invoice_date + timedelta(days=30)  # Default 30 days
    
    # Handle EOM terms
    if 'EOM' in payment_terms.upper():
        days = int(payment_terms.split()[0])
        # Add days to end of month
        next_month = invoice_date.replace(day=28) + timedelta(days=4)
        end_of_month = next_month - timedelta(days=next_month.day)
        return end_of_month + timedelta(days=days)
    
    # Handle "X Days" terms
    if 'Days' in payment_terms or 'Day' in payment_terms:
        try:
            days = int(payment_terms.split()[0])
            return invoice_date + timedelta(days=days)
        except Exception:
            pass
    
    # Handle immediate payment terms
    if payment_terms.lower() in ['cash', 'cod', 'credit card']:
        return invoice_date
    
    # Default 30 days
    return invoice_date + timedelta(days=30)

@router.post("/invoices", response_model=Invoice)
async def create_invoice(
    invoice_data: InvoiceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create invoice from packing slips grouped by PO number"""
    
    # Validate that all packing slips exist and have the same PO number
    # Normalise PO comparisons: None, "", "No PO Number" are all treated as "no PO"
    def _norm_po(v):
        if v is None:
            return ""
        s = str(v).strip()
        if s.lower() == "no po number":
            return ""
        return s

    packing_slips = []
    po_number = _norm_po(invoice_data.purchase_order_number)

    for i, ps_id in enumerate(invoice_data.packing_slip_ids):
        ps = await db.packing_slips.find_one({"id": ps_id})
        if not ps:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Packing slip not found: {ps_id}"
            )

        ps_po_number = _norm_po(ps.get('customer_po_number'))

        # If no PO number provided in request, use the first packing slip's PO number
        if i == 0 and not po_number:
            po_number = ps_po_number

        # Verify PO number matches across all packing slips
        if ps_po_number != po_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Packing slip {ps.get('packing_slip_number')} has different PO number: '{ps_po_number or '(none)'}' (expected: '{po_number or '(none)'}')"
            )

        packing_slips.append(ps)

    # Final PO value used on the invoice (empty string when none provided — required by Pydantic)
    invoice_data.purchase_order_number = po_number or ""
    
    # Generate invoice number
    invoice_number = await get_next_invoice_number()
    
    # Create line items from packing slips
    line_items = []
    subtotal_ex_gst = 0.0
    gst_total = 0.0

    # Safe numeric coercion helpers (production data has Nones/strings in legacy rows)
    def _to_float(v, default=0.0):
        try:
            if v is None or v == '':
                return float(default)
            return float(v)
        except (TypeError, ValueError):
            return float(default)

    def _to_int(v, default=0):
        try:
            if v is None or v == '':
                return int(default)
            return int(float(v))
        except (TypeError, ValueError):
            return int(default)

    for ps in packing_slips:
        # Get quote to fetch pricing
        quote = await db.quotes.find_one({"id": ps.get('quote_id')})
        if not quote:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Quote not found for packing slip {ps.get('packing_slip_number')}"
            )
        
        # Check if packing slip has items array (new structure) or flat structure (old)
        ps_items = ps.get('items', [])
        
        if not ps_items:
            # Old flat structure: treat whole packing slip as one item
            ps_items = [{
                'part_description': ps.get('part_description', 'N/A'),
                'qty_delivered': ps.get('quantity_delivered', 0)
            }]
        
        # Process each item in the packing slip
        for ps_item in ps_items:
            part_desc = ps_item.get('part_description', 'N/A')
            quantity = _to_int(ps_item.get('qty_delivered'), 0)

            if quantity <= 0:
                continue  # Skip items with no quantity
            
            # Check if multi-item quote
            is_multi_item = quote.get('is_multi_item', False)
            material_spec = None
            price_per_part_ex_gst = 0.0
            
            if is_multi_item:
                # Multi-item quote: Find the specific line item by part_description
                line_items_in_quote = quote.get('line_items', [])
                matching_line_item = None
                
                for li in line_items_in_quote:
                    if li.get('part_description') == part_desc:
                        matching_line_item = li
                        break
                
                if not matching_line_item and line_items_in_quote:
                    # Fallback: use first line item
                    matching_line_item = line_items_in_quote[0]
                    print(f"WARNING: Could not match '{part_desc}' to line item, using first line item")
                
                if matching_line_item:
                    # Get material spec from line item
                    if matching_line_item.get('material_type'):
                        material_spec = f"{matching_line_item.get('material_type')} - {matching_line_item.get('thickness')} - {matching_line_item.get('grade')} - {matching_line_item.get('finish')}"
                    
                    # Calculate price from line item total
                    line_item_total = _to_float(matching_line_item.get('total'), _to_float(matching_line_item.get('line_total_with_gst'), 0))
                    line_item_quantity = max(_to_int(matching_line_item.get('quantity'), 1), 1)
                    price_per_part_ex_gst = (line_item_total / 1.10) / line_item_quantity
                else:
                    # Ultimate fallback: use quote-level pricing
                    if quote.get('material_type'):
                        material_spec = f"{quote.get('material_type')} - {quote.get('thickness')} - {quote.get('grade')} - {quote.get('finish')}"
                    
                    qty_required = max(_to_int(quote.get('quantity_required'), 1), 1)
                    price_per_part_ex_gst = (_to_float(quote.get('quote_total'), 0) / 1.10) / qty_required
            else:
                # Single-item quote: Use quote-level pricing
                if quote.get('material_type'):
                    material_spec = f"{quote.get('material_type')} - {quote.get('thickness')} - {quote.get('grade')} - {quote.get('finish')}"
                
                # Price per part from quote (Ex GST)
                qty_required = max(_to_int(quote.get('quantity_required'), 1), 1)
                price_per_part_ex_gst = (_to_float(quote.get('quote_total'), 0) / 1.10) / qty_required
            
            # Calculate line totals
            line_total_ex_gst = price_per_part_ex_gst * quantity
            gst_amount = line_total_ex_gst * 0.10
            line_total_inc_gst = line_total_ex_gst + gst_amount
            
            line_item = InvoiceLineItem(
                packing_slip_id=ps.get('id'),
                packing_slip_number=ps.get('packing_slip_number'),
                part_description=part_desc,
                material_specification=material_spec,
                quantity_delivered=quantity,
                price_per_part_ex_gst=price_per_part_ex_gst,
                line_total_ex_gst=line_total_ex_gst,
                gst_amount=gst_amount,
                line_total_inc_gst=line_total_inc_gst
            )
            
            line_items.append(line_item)
            subtotal_ex_gst += line_total_ex_gst
            gst_total += gst_amount

    if not line_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create invoice: selected packing slips contain no items with delivered quantity. Please open the packing slip and confirm the Qty Delivered before invoicing."
        )

    total_inc_gst = subtotal_ex_gst + gst_total
    
    # Calculate due date
    invoice_date = datetime.now(timezone.utc)
    due_date = invoice_data.due_date
    if not due_date and invoice_data.payment_terms:
        due_date = calculate_due_date(invoice_date, invoice_data.payment_terms)
    elif not due_date:
        due_date = invoice_date + timedelta(days=30)
    
    # Create invoice
    invoice = Invoice(
        invoice_number=invoice_number,
        customer_id=invoice_data.customer_id,
        customer_name=invoice_data.customer_name,
        customer_email=invoice_data.customer_email,
        purchase_order_number=invoice_data.purchase_order_number,
        invoice_date=invoice_date,
        due_date=due_date,
        payment_terms=invoice_data.payment_terms,
        line_items=line_items,
        subtotal_ex_gst=subtotal_ex_gst,
        gst_total=gst_total,
        total_inc_gst=total_inc_gst,
        status="Draft",
        payment_received=0.0,
        balance_due=total_inc_gst,
        notes=invoice_data.notes,
        internal_notes=invoice_data.internal_notes,
        created_by=current_user['username']
    )
    
    # Prepare for MongoDB
    invoice_dict = invoice.dict()
    invoice_dict = prepare_for_mongo(invoice_dict)
    
    await db.invoices.insert_one(invoice_dict)
    
    # Mark packing slips as invoiced and update job statuses
    job_ids_to_complete = set()
    for ps_id in invoice_data.packing_slip_ids:
        # Mark packing slip as invoiced
        ps = await db.packing_slips.update_one(
            {"id": ps_id},
            {"$set": {"is_invoiced": True}}
        )
        
        # Get job sheet ID from packing slip
        ps_data = await db.packing_slips.find_one({"id": ps_id})
        if ps_data and ps_data.get('job_sheet_id'):
            job_ids_to_complete.add(ps_data['job_sheet_id'])
    
    # Update job sheets to Completed status if all their packing slips are invoiced
    for job_id in job_ids_to_complete:
        # Check if all packing slips for this job are invoiced
        job_packing_slips = await db.packing_slips.find({"job_sheet_id": job_id}).to_list(length=None)
        all_invoiced = all(ps.get('is_invoiced', False) for ps in job_packing_slips)
        
        if all_invoiced:
            # Update job status to Completed
            await db.job_sheets.update_one(
                {"id": job_id},
                {"$set": {"status": "Completed"}}
            )
            print(f"Job {job_id} marked as Completed - all packing slips invoiced")
    
    return invoice

@router.get("/invoices", response_model=List[Invoice])
async def get_invoices(
    customer: Optional[str] = None,
    po_number: Optional[str] = None,
    description: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all invoices with optional filters"""
    query = {}
    
    if customer:
        query['customer_name'] = {'$regex': customer, '$options': 'i'}
    
    if po_number:
        query['purchase_order_number'] = {'$regex': po_number, '$options': 'i'}
    
    if description:
        query['line_items.part_description'] = {'$regex': description, '$options': 'i'}
    
    if status_filter:
        query['status'] = status_filter
    
    invoices = await db.invoices.find(query).sort("invoice_number", -1).to_list(length=None)
    return [Invoice(**parse_from_mongo(inv)) for inv in invoices]

@router.get("/invoices/{invoice_id}", response_model=Invoice)
async def get_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific invoice"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return Invoice(**parse_from_mongo(invoice))

@router.patch("/invoices/{invoice_id}", response_model=Invoice)
async def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update invoice details"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    update_data = invoice_update.dict(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    # If line_items were edited, recompute per-line totals and invoice totals
    if 'line_items' in update_data and isinstance(update_data['line_items'], list):
        recomputed = []
        subtotal = 0.0
        gst_total = 0.0
        for li in update_data['line_items']:
            qty = float(li.get('quantity_delivered') or 0)
            price = float(li.get('price_per_part_ex_gst') or 0)
            line_ex = round(qty * price, 2)
            line_gst = round(line_ex * 0.10, 2)
            line_inc = round(line_ex + line_gst, 2)
            li['line_total_ex_gst'] = line_ex
            li['gst_amount'] = line_gst
            li['line_total_inc_gst'] = line_inc
            subtotal += line_ex
            gst_total += line_gst
            recomputed.append(li)
        total_inc = round(subtotal + gst_total, 2)
        update_data['line_items'] = recomputed
        update_data['subtotal_ex_gst'] = round(subtotal, 2)
        update_data['gst_total'] = round(gst_total, 2)
        update_data['total_inc_gst'] = total_inc
        payment_received = float(invoice.get('payment_received') or 0)
        update_data['balance_due'] = round(total_inc - payment_received, 2)

    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    updated_invoice = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**parse_from_mongo(updated_invoice))

@router.patch("/invoices/{invoice_id}/status", response_model=Invoice)
async def update_invoice_status(
    invoice_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Update invoice status"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    update_data = {
        'status': status,
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if status == 'Sent' and not invoice.get('sent_at'):
        update_data['sent_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    updated_invoice = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**parse_from_mongo(updated_invoice))

@router.post("/invoices/{invoice_id}/payment", response_model=Invoice)
async def record_payment(
    invoice_id: str,
    payment: InvoicePayment,
    current_user: dict = Depends(get_current_user)
):
    """Record payment for an invoice"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Calculate new payment received and balance
    payment_received = invoice.get('payment_received', 0.0) + payment.payment_amount
    total_inc_gst = invoice.get('total_inc_gst', 0.0)
    balance_due = total_inc_gst - payment_received
    
    # Determine new status
    if balance_due <= 0.01:  # Allow small rounding errors
        new_status = 'Paid'
        payment_date = payment.payment_date.isoformat()
    elif payment_received > 0:
        new_status = 'Partial'
        payment_date = None
    else:
        new_status = invoice.get('status', 'Draft')
        payment_date = None
    
    update_data = {
        'payment_received': payment_received,
        'balance_due': max(balance_due, 0),
        'status': new_status,
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if payment_date:
        update_data['payment_date'] = payment_date
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    updated_invoice = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**parse_from_mongo(updated_invoice))

@router.get("/packing-slips/by-po")
async def get_packing_slips_by_po(
    po_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all packing slips for a specific PO number (for invoice creation)"""
    packing_slips = await db.packing_slips.find({
        "customer_po_number": po_number,
        "status": "Completed"
    }).to_list(length=None)
    
    # Check which packing slips are already invoiced
    invoices = await db.invoices.find({
        "purchase_order_number": po_number
    }).to_list(length=None)
    
    invoiced_ps_ids = set()
    for invoice in invoices:
        for line_item in invoice.get('line_items', []):
            invoiced_ps_ids.add(line_item.get('packing_slip_id'))
    
    # Mark packing slips as invoiced or not
    for ps in packing_slips:
        ps['is_invoiced'] = ps.get('id') in invoiced_ps_ids
    
    return packing_slips
