from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime, timezone
from models import WorkingHours, WorkingHoursCreate, WorkingHoursUpdate
from auth import get_current_user, check_module_access
import os
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/working-hours", tags=["Working Hours"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

@router.get("", response_model=List[WorkingHours])
async def get_working_hours(current_user: dict = Depends(get_current_user)):
    """Get all working hours schedules"""
    check_module_access(current_user, "scheduling")
    
    schedules = await db.working_hours.find().to_list(length=None)
    return [WorkingHours(**schedule) for schedule in schedules]

@router.get("/active", response_model=WorkingHours)
async def get_active_working_hours(current_user: dict = Depends(get_current_user)):
    """Get the currently active working hours schedule"""
    check_module_access(current_user, "scheduling")
    
    schedule = await db.working_hours.find_one({"is_active": True})
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active working hours schedule found"
        )
    return WorkingHours(**schedule)

@router.get("/{schedule_id}", response_model=WorkingHours)
async def get_working_hours_by_id(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific working hours schedule"""
    check_module_access(current_user, "scheduling")
    
    schedule = await db.working_hours.find_one({"id": schedule_id})
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Working hours schedule not found"
        )
    return WorkingHours(**schedule)

@router.post("", response_model=WorkingHours, status_code=status.HTTP_201_CREATED)
async def create_working_hours(
    schedule: WorkingHoursCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new working hours schedule"""
    check_module_access(current_user, "scheduling")
    
    schedule_dict = schedule.dict()
    schedule_dict["id"] = str(datetime.now().timestamp()).replace('.', '')
    schedule_dict["created_at"] = datetime.now(timezone.utc)
    schedule_dict["updated_at"] = datetime.now(timezone.utc)
    
    # If this is set as active, deactivate all others
    if schedule_dict.get("is_active", False):
        await db.working_hours.update_many(
            {},
            {"$set": {"is_active": False}}
        )
    
    await db.working_hours.insert_one(schedule_dict)
    
    return WorkingHours(**schedule_dict)

@router.put("/{schedule_id}", response_model=WorkingHours)
async def update_working_hours(
    schedule_id: str,
    schedule_update: WorkingHoursUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a working hours schedule"""
    check_module_access(current_user, "scheduling")
    
    # Check if schedule exists
    existing_schedule = await db.working_hours.find_one({"id": schedule_id})
    if not existing_schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Working hours schedule not found"
        )
    
    # Update fields
    update_data = schedule_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # If setting this as active, deactivate all others
    if update_data.get("is_active", False):
        await db.working_hours.update_many(
            {"id": {"$ne": schedule_id}},
            {"$set": {"is_active": False}}
        )
    
    await db.working_hours.update_one(
        {"id": schedule_id},
        {"$set": update_data}
    )
    
    updated_schedule = await db.working_hours.find_one({"id": schedule_id})
    return WorkingHours(**updated_schedule)

@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_working_hours(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a working hours schedule"""
    check_module_access(current_user, "scheduling")
    
    result = await db.working_hours.delete_one({"id": schedule_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Working hours schedule not found"
        )
    
    return None
