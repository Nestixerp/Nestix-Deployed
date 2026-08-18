from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import Customer, CustomerCreate, CustomerUpdate, Address, AddressCreate, AddressUpdate
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from datetime import datetime
import uuid

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/customers", tags=["Customers"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def get_next_customer_code() -> str:
    """Get next auto-incrementing customer code"""
    counter = await db.counters.find_one_and_update(
        {"_id": "customer_code"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True
    )
    value = counter.get("value", 1) if counter else 1
    return f"CUST-{value:04d}"


@router.post("", response_model=Customer, status_code=status.HTTP_201_CREATED)
async def create_customer(
    customer_data: CustomerCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new customer"""
    check_module_access(current_user, "customers")
    
    # Check if customer with same company name already exists
    existing = await db.customers.find_one({
        "company_name": {"$regex": f"^{customer_data.company_name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer with this company name already exists"
        )
    
    # Generate customer code
    customer_code = await get_next_customer_code()
    
    # Create customer object with audit trail
    customer_dict = customer_data.dict()
    customer_dict["customer_code"] = customer_code
    customer_dict["created_by"] = current_user.get("username", "unknown")
    customer_dict["modified_by"] = current_user.get("username", "unknown")
    
    customer = Customer(**customer_dict)
    
    # Insert into database
    result = await db.customers.insert_one(customer.dict())
    
    if not result.inserted_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create customer"
        )
    
    return customer


@router.get("", response_model=List[Customer])
async def get_customers(
    current_user: dict = Depends(get_current_user),
    status_filter: Optional[str] = None,
    search: Optional[str] = None
):
    """Get all customers with optional filters"""
    check_module_access(current_user, "customers")
    
    query = {}
    if status_filter:
        query["status"] = status_filter
    if search:
        query["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"customer_code": {"$regex": search, "$options": "i"}},
            {"contact_person": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    customers = await db.customers.find(query).sort("customer_code", 1).to_list(1000)
    return [Customer(**customer) for customer in customers]


@router.get("/{customer_id}", response_model=Customer)
async def get_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific customer by ID"""
    check_module_access(current_user, "customers")
    
    customer = await db.customers.find_one({"id": customer_id})
    
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    return Customer(**customer)


@router.get("/by-code/{customer_code}", response_model=Customer)
async def get_customer_by_code(
    customer_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific customer by customer code"""
    check_module_access(current_user, "customers")
    
    customer = await db.customers.find_one({"customer_code": customer_code})
    
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_code} not found"
        )
    
    return Customer(**customer)


@router.put("/{customer_id}", response_model=Customer)
async def update_customer(
    customer_id: str,
    customer_update: CustomerUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a customer"""
    check_module_access(current_user, "customers")
    
    # Check if customer exists
    existing_customer = await db.customers.find_one({"id": customer_id})
    if not existing_customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Update only provided fields with audit trail
    update_data = customer_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    update_data["modified_by"] = current_user.get("username", "unknown")
    
    # Update in database
    result = await db.customers.update_one(
        {"id": customer_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update customer"
        )
    
    # Return updated customer
    updated_customer = await db.customers.find_one({"id": customer_id})
    return Customer(**updated_customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a customer (soft delete by setting status to Inactive)"""
    check_module_access(current_user, "customers")
    
    # Soft delete by setting status to Inactive
    result = await db.customers.update_one(
        {"id": customer_id},
        {"$set": {"status": "Inactive", "updated_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    return None


# ==================== ADDRESS MANAGEMENT ENDPOINTS ====================

@router.post("/{customer_id}/addresses", response_model=Address, status_code=status.HTTP_201_CREATED)
async def add_customer_address(
    customer_id: str,
    address_data: AddressCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a new address to a customer"""
    check_module_access(current_user, "customers")
    
    # Check if customer exists
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Create address with ID
    address_dict = address_data.dict()
    address = Address(**address_dict)
    
    # If this is set as default, unset other defaults of same type
    if address.is_default:
        customer_obj = Customer(**customer)
        for addr in customer_obj.addresses:
            if addr.address_type == address.address_type:
                addr.is_default = False
        
        # Update customer with modified addresses
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {"addresses": [addr.dict() for addr in customer_obj.addresses]}}
        )
    
    # Add new address
    result = await db.customers.update_one(
        {"id": customer_id},
        {
            "$push": {"addresses": address.dict()},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add address"
        )
    
    return address


@router.get("/{customer_id}/addresses", response_model=List[Address])
async def get_customer_addresses(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
    address_type: Optional[str] = None
):
    """Get all addresses for a customer"""
    check_module_access(current_user, "customers")
    
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    addresses = customer.get("addresses", [])
    
    # Filter by address type if provided
    if address_type:
        addresses = [addr for addr in addresses if addr.get("address_type") == address_type]
    
    return [Address(**addr) for addr in addresses]


@router.put("/{customer_id}/addresses/{address_id}", response_model=Address)
async def update_customer_address(
    customer_id: str,
    address_id: str,
    address_update: AddressUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a specific address"""
    check_module_access(current_user, "customers")
    
    # Check if customer exists
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Find and update the address
    customer_obj = Customer(**customer)
    address_found = False
    updated_address = None
    
    for addr in customer_obj.addresses:
        if addr.id == address_id:
            address_found = True
            # Update fields
            update_data = address_update.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(addr, key, value)
            updated_address = addr
            
            # If setting this as default, unset other defaults of same type
            if update_data.get("is_default"):
                for other_addr in customer_obj.addresses:
                    if other_addr.id != address_id and other_addr.address_type == addr.address_type:
                        other_addr.is_default = False
            break
    
    if not address_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Address not found"
        )
    
    # Save updated addresses
    result = await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "addresses": [addr.dict() for addr in customer_obj.addresses],
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update address"
        )
    
    return updated_address


@router.delete("/{customer_id}/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_address(
    customer_id: str,
    address_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a specific address"""
    check_module_access(current_user, "customers")
    
    # Check if customer exists
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Remove the address
    result = await db.customers.update_one(
        {"id": customer_id},
        {
            "$pull": {"addresses": {"id": address_id}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Address not found"
        )
    
    return None


@router.patch("/{customer_id}/addresses/{address_id}/set-default", response_model=Address)
async def set_default_address(
    customer_id: str,
    address_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Set an address as the default for its type"""
    check_module_access(current_user, "customers")
    
    # Check if customer exists
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Find the address and its type
    customer_obj = Customer(**customer)
    target_address = None
    target_type = None
    
    # First pass: find the target address and its type
    for addr in customer_obj.addresses:
        if addr.id == address_id:
            target_address = addr
            target_type = addr.address_type
            break
    
    if not target_address:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Address not found"
        )
    
    # Second pass: set the target as default and unset all others of same type
    for addr in customer_obj.addresses:
        if addr.address_type == target_type:
            addr.is_default = (addr.id == address_id)
    
    # Save updated addresses
    result = await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "addresses": [addr.dict() for addr in customer_obj.addresses],
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set default address"
        )
    
    return target_address

