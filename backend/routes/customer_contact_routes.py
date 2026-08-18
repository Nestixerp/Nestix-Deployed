from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from models import CustomerContact, CustomerContactCreate, CustomerContactUpdate, User
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os

router = APIRouter(prefix="/api/customers", tags=["Customer Contacts"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


@router.post("/{customer_id}/contacts", response_model=CustomerContact, status_code=status.HTTP_201_CREATED)
async def create_customer_contact(
    customer_id: str,
    contact_data: CustomerContactCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new contact for a customer"""
    check_module_access(current_user, "customers")
    
    # Check if customer exists
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # If this contact is marked as primary, unset other primary contacts
    if contact_data.is_primary:
        await db.customer_contacts.update_many(
            {"customer_id": customer_id},
            {"$set": {"is_primary": False}}
        )
    
    # Create contact
    contact = CustomerContact(
        customer_id=customer_id,
        **contact_data.dict()
    )
    
    await db.customer_contacts.insert_one(contact.dict())
    return contact


@router.get("/{customer_id}/contacts", response_model=List[CustomerContact])
async def get_customer_contacts(
    customer_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all contacts for a customer"""
    check_module_access(current_user, "customers")
    
    contacts = await db.customer_contacts.find({"customer_id": customer_id}).to_list(100)
    return [CustomerContact(**contact) for contact in contacts]


@router.get("/{customer_id}/contacts/{contact_id}", response_model=CustomerContact)
async def get_customer_contact(
    customer_id: str,
    contact_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific contact"""
    check_module_access(current_user, "customers")
    
    contact = await db.customer_contacts.find_one({
        "id": contact_id,
        "customer_id": customer_id
    })
    
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    return CustomerContact(**contact)


@router.put("/{customer_id}/contacts/{contact_id}", response_model=CustomerContact)
async def update_customer_contact(
    customer_id: str,
    contact_id: str,
    contact_update: CustomerContactUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a contact"""
    check_module_access(current_user, "customers")
    
    # Check if contact exists
    existing_contact = await db.customer_contacts.find_one({
        "id": contact_id,
        "customer_id": customer_id
    })
    
    if not existing_contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    # If updating to primary, unset other primary contacts
    if contact_update.is_primary:
        await db.customer_contacts.update_many(
            {"customer_id": customer_id, "id": {"$ne": contact_id}},
            {"$set": {"is_primary": False}}
        )
    
    # Update contact
    update_data = contact_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.customer_contacts.update_one(
        {"id": contact_id, "customer_id": customer_id},
        {"$set": update_data}
    )
    
    # Return updated contact
    updated_contact = await db.customer_contacts.find_one({
        "id": contact_id,
        "customer_id": customer_id
    })
    return CustomerContact(**updated_contact)


@router.delete("/{customer_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_contact(
    customer_id: str,
    contact_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a contact"""
    check_module_access(current_user, "customers")
    
    result = await db.customer_contacts.delete_one({
        "id": contact_id,
        "customer_id": customer_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )
    
    return None
