"""
Email Routes for Quotes and Invoices
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from auth import get_current_user
from models import User
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from services.email_service import send_quote_email, send_invoice_email
from services.pdf_generator import generate_quote_pdf, generate_invoice_pdf

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api", tags=["Email"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


class EmailQuoteRequest(BaseModel):
    quote_id: str
    customer_email: str


class EmailInvoiceRequest(BaseModel):
    invoice_id: str
    customer_email: str


@router.post("/quotes/{quote_id}/send-email")
async def email_quote(
    quote_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate PDF and email quote to customer"""
    try:
        # Get quote
        quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Get customer email
        customer = await db.customers.find_one({"id": quote["customer_id"]}, {"_id": 0})
        if not customer or not customer.get("email"):
            raise HTTPException(status_code=400, detail="Customer email not found")
        
        customer_email = customer["email"]
        customer_name = quote.get("customer_name", customer.get("company_name", "Customer"))
        
        # Generate PDF
        pdf_content = generate_quote_pdf(quote)
        
        # Send email
        result = send_quote_email(
            customer_email=customer_email,
            customer_name=customer_name,
            quote_number=quote["quote_number"],
            pdf_content=pdf_content
        )
        
        if result["success"]:
            # Update quote status to "Sent"
            await db.quotes.update_one(
                {"id": quote_id},
                {"$set": {"status": "Sent", "email_sent": True}}
            )
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/invoices/{invoice_id}/send-email")
async def email_invoice(
    invoice_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate PDF and email invoice to customer"""
    try:
        # Get invoice
        invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Get customer email
        customer = await db.customers.find_one({"id": invoice["customer_id"]}, {"_id": 0})
        if not customer or not customer.get("email"):
            raise HTTPException(status_code=400, detail="Customer email not found")
        
        customer_email = customer["email"]
        customer_name = invoice.get("customer_name", customer.get("company_name", "Customer"))
        
        # Generate PDF
        pdf_content = generate_invoice_pdf(invoice)
        
        # Send email
        result = send_invoice_email(
            customer_email=customer_email,
            customer_name=customer_name,
            invoice_number=invoice["invoice_number"],
            total_amount=invoice.get("total", 0),
            due_date=invoice.get("due_date", "Upon receipt"),
            pdf_content=pdf_content
        )
        
        if result["success"]:
            # Update invoice to mark as sent
            await db.invoices.update_one(
                {"id": invoice_id},
                {"$set": {"email_sent": True}}
            )
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
