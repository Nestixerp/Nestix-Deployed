from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime, timezone
from models import Machine, MachineCreate, MachineUpdate
from auth import get_current_user, check_module_access
import os
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/machines", tags=["Machines"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

@router.get("", response_model=List[Machine])
async def get_machines(current_user: dict = Depends(get_current_user)):
    """Get all machines"""
    check_module_access(current_user, "scheduling")
    
    machines = await db.machines.find().to_list(length=None)
    return [Machine(**machine) for machine in machines]

@router.get("/{machine_id}", response_model=Machine)
async def get_machine(
    machine_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific machine"""
    check_module_access(current_user, "scheduling")
    
    machine = await db.machines.find_one({"id": machine_id})
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Machine not found"
        )
    return Machine(**machine)

@router.post("", response_model=Machine, status_code=status.HTTP_201_CREATED)
async def create_machine(
    machine: MachineCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new machine"""
    check_module_access(current_user, "scheduling")
    
    machine_dict = machine.dict()
    machine_dict["id"] = str(datetime.now().timestamp()).replace('.', '')
    machine_dict["created_at"] = datetime.now(timezone.utc)
    machine_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.machines.insert_one(machine_dict)
    
    return Machine(**machine_dict)

@router.put("/{machine_id}", response_model=Machine)
async def update_machine(
    machine_id: str,
    machine_update: MachineUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a machine"""
    check_module_access(current_user, "scheduling")
    
    # Check if machine exists
    existing_machine = await db.machines.find_one({"id": machine_id})
    if not existing_machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Machine not found"
        )
    
    # Update fields
    update_data = machine_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.machines.update_one(
        {"id": machine_id},
        {"$set": update_data}
    )
    
    updated_machine = await db.machines.find_one({"id": machine_id})
    return Machine(**updated_machine)

@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine(
    machine_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a machine"""
    check_module_access(current_user, "scheduling")
    
    result = await db.machines.delete_one({"id": machine_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Machine not found"
        )
    
    return None
