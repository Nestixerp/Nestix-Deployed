"""
Environmental Monitoring Routes (ISO/IMS)
Tracks Electricity Usage and Recycled Metal
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

from models import (
    EnvironmentalData, EnvironmentalDataCreate, EnvironmentalDataUpdate,
    User
)
from auth import get_current_user

router = APIRouter(prefix="/api/environmental", tags=["Environmental"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


@router.get("/data")
async def get_environmental_data(
    data_type: Optional[str] = None,
    year: Optional[int] = None,
    metric_type: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get environmental data, optionally filtered by type, year, and metric"""
    query = {}
    if data_type:
        query["data_type"] = data_type
    if year:
        query["year"] = year
    if metric_type:
        query["metric_type"] = metric_type
    
    data = await db.environmental_data.find(query, {"_id": 0}).sort("year", -1).to_list(length=None)
    return data


@router.get("/data/{data_id}")
async def get_environmental_data_by_id(
    data_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get specific environmental data record"""
    data = await db.environmental_data.find_one({"id": data_id}, {"_id": 0})
    if not data:
        raise HTTPException(status_code=404, detail="Data not found")
    return data


@router.post("/data")
async def create_environmental_data(
    data: EnvironmentalDataCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new environmental data record (Admin only)"""
    # Check if admin
    if current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can add environmental data"
        )
    
    # Check if record already exists for this type, year, and metric
    existing_query = {
        "data_type": data.data_type,
        "year": data.year
    }
    if data.metric_type:
        existing_query["metric_type"] = data.metric_type
    
    existing = await db.environmental_data.find_one(existing_query)
    
    if existing:
        detail_msg = f"Data already exists for {data.data_type} in year {data.year}"
        if data.metric_type:
            detail_msg += f" ({data.metric_type})"
        detail_msg += ". Use update instead."
        raise HTTPException(status_code=400, detail=detail_msg)
    
    # Calculate total
    months = [
        data.january, data.february, data.march, data.april,
        data.may, data.june, data.july, data.august,
        data.september, data.october, data.november, data.december
    ]
    total = sum(m for m in months if m is not None)
    
    data_dict = data.dict()
    data_dict['id'] = str(datetime.now().timestamp()).replace('.', '')
    data_dict['total'] = round(total, 2)
    data_dict['created_by'] = current_user['username']
    data_dict['created_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    data_dict['updated_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    
    await db.environmental_data.insert_one(data_dict)
    
    return {
        "message": "Environmental data created successfully",
        "id": data_dict['id']
    }


@router.put("/data/{data_id}")
async def update_environmental_data(
    data_id: str,
    data: EnvironmentalDataUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update environmental data record (Admin only)"""
    # Check if admin
    if current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update environmental data"
        )
    
    # Get existing record
    existing = await db.environmental_data.find_one({"id": data_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Data not found")
    
    # Update only provided fields
    update_dict = {k: v for k, v in data.dict().items() if v is not None}
    
    # Recalculate total
    months = [
        update_dict.get('january', existing.get('january', 0)),
        update_dict.get('february', existing.get('february', 0)),
        update_dict.get('march', existing.get('march', 0)),
        update_dict.get('april', existing.get('april', 0)),
        update_dict.get('may', existing.get('may', 0)),
        update_dict.get('june', existing.get('june', 0)),
        update_dict.get('july', existing.get('july', 0)),
        update_dict.get('august', existing.get('august', 0)),
        update_dict.get('september', existing.get('september', 0)),
        update_dict.get('october', existing.get('october', 0)),
        update_dict.get('november', existing.get('november', 0)),
        update_dict.get('december', existing.get('december', 0))
    ]
    total = sum(m for m in months if m is not None)
    
    update_dict['total'] = round(total, 2)
    update_dict['updated_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    
    await db.environmental_data.update_one(
        {"id": data_id},
        {"$set": update_dict}
    )
    
    return {"message": "Environmental data updated successfully"}


@router.delete("/data/{data_id}")
async def delete_environmental_data(
    data_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete environmental data record (Admin only)"""
    # Check if admin
    if current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can delete environmental data"
        )
    
    result = await db.environmental_data.delete_one({"id": data_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Data not found")
    
    return {"message": "Environmental data deleted successfully"}


@router.get("/comparison-multi/{data_type}/{year1}/{year2}")
async def get_multi_metric_comparison(
    data_type: str,
    year1: int,
    year2: int,
    current_user: User = Depends(get_current_user)
):
    """Get comparison data for multiple metrics 
    - electricity: dollars, emissions, kwh
    - recycled_metal: mild_steel, stainless_steel, aluminium
    """
    # Define metrics for each data type
    if data_type == "electricity":
        metrics = ["dollars", "emissions", "kwh"]
    elif data_type == "recycled_metal":
        metrics = ["mild_steel", "stainless_steel", "aluminium"]
    else:
        # For other types, use regular comparison
        return await get_comparison_data(data_type, year1, year2, current_user)
    result = {
        "data_type": data_type,
        "year1": year1,
        "year2": year2,
        "metrics": {}
    }
    
    months = ['january', 'february', 'march', 'april', 'may', 'june', 
              'july', 'august', 'september', 'october', 'november', 'december']
    
    for metric in metrics:
        data_year1 = await db.environmental_data.find_one({
            "data_type": data_type,
            "year": year1,
            "metric_type": metric
        }, {"_id": 0})
        
        data_year2 = await db.environmental_data.find_one({
            "data_type": data_type,
            "year": year2,
            "metric_type": metric
        }, {"_id": 0})
        
        # Calculate percentage change - ONLY for months with data in BOTH years
        total_change = 0
        comparable_months = 0
        total1_comparable = 0
        total2_comparable = 0
        
        if data_year1 and data_year2:
            # Find months that have non-zero data in both years
            for month in months:
                value1 = data_year1.get(month, 0)
                value2 = data_year2.get(month, 0)
                
                # Only compare if both years have data for this month
                if value1 > 0 and value2 > 0:
                    comparable_months += 1
                    total1_comparable += value1
                    total2_comparable += value2
            
            # Calculate percentage change based on comparable months only
            if total1_comparable > 0:
                total_change = round(((total2_comparable - total1_comparable) / total1_comparable) * 100, 2)
        
        result["metrics"][metric] = {
            "data_year1": data_year1,
            "data_year2": data_year2,
            "total_change_percent": total_change,
            "is_reduction": total_change < 0,
            "comparable_months": comparable_months,
            "total1_comparable": total1_comparable,
            "total2_comparable": total2_comparable
        }
    
    return result


@router.get("/comparison/{data_type}/{year1}/{year2}")
async def get_comparison_data(
    data_type: str,
    year1: int,
    year2: int,
    current_user: User = Depends(get_current_user)
):
    """Get comparison data for two years"""
    # Get data for both years
    data_year1 = await db.environmental_data.find_one({
        "data_type": data_type,
        "year": year1
    }, {"_id": 0})
    
    data_year2 = await db.environmental_data.find_one({
        "data_type": data_type,
        "year": year2
    }, {"_id": 0})
    
    if not data_year1 and not data_year2:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for {data_type} in years {year1} or {year2}"
        )
    
    # Calculate percentage change
    total_change = 0
    if data_year1 and data_year2:
        total1 = data_year1.get('total', 0)
        total2 = data_year2.get('total', 0)
        if total1 > 0:
            total_change = round(((total2 - total1) / total1) * 100, 2)
    
    return {
        "data_type": data_type,
        "year1": year1,
        "year2": year2,
        "data_year1": data_year1,
        "data_year2": data_year2,
        "total_change_percent": total_change,
        "is_reduction": total_change < 0
    }


@router.get("/years/{data_type}")
async def get_available_years(
    data_type: str,
    current_user: User = Depends(get_current_user)
):
    """Get list of years with data for a specific type"""
    data = await db.environmental_data.find(
        {"data_type": data_type},
        {"year": 1, "_id": 0}
    ).to_list(length=None)
    
    years = sorted([d['year'] for d in data], reverse=True)
    
    return {"years": years}
