"""
Calibration Management Routes
Handles instruments and calibration records
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

from models import (
    Instrument, InstrumentCreate, InstrumentUpdate,
    CalibrationRecord, CalibrationRecordCreate, CalibrationRecordUpdate,
    User
)
from auth import get_current_user

router = APIRouter(prefix="/api/calibration", tags=["Calibration"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ==================== INSTRUMENT ROUTES ====================

@router.get("/instruments")
async def get_instruments(current_user: User = Depends(get_current_user)):
    """Get all instruments"""
    instruments = await db.instruments.find({}, {"_id": 0}).to_list(length=None)
    
    # Update status based on due dates
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for instrument in instruments:
        if instrument.get('next_calibration_due'):
            due_date = instrument['next_calibration_due']
            if isinstance(due_date, str):
                due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00')).replace(tzinfo=None)
            
            days_until_due = (due_date - now).days
            
            if days_until_due < 0:
                instrument['status'] = 'Overdue'
            elif days_until_due <= 30:
                instrument['status'] = 'Due Soon'
            else:
                instrument['status'] = 'Current'
    
    return instruments


@router.get("/instruments/{instrument_id}")
async def get_instrument(
    instrument_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get specific instrument"""
    instrument = await db.instruments.find_one({"id": instrument_id}, {"_id": 0})
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    return instrument


@router.post("/instruments")
async def create_instrument(
    instrument: InstrumentCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new instrument"""
    instrument_dict = instrument.dict()
    instrument_dict['id'] = str(datetime.now().timestamp()).replace('.', '')
    instrument_dict['status'] = 'Current'
    instrument_dict['created_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    instrument_dict['updated_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    
    await db.instruments.insert_one(instrument_dict)
    
    return {"message": "Instrument created successfully", "id": instrument_dict['id']}


@router.put("/instruments/{instrument_id}")
async def update_instrument(
    instrument_id: str,
    instrument: InstrumentUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update instrument"""
    instrument_dict = {k: v for k, v in instrument.dict().items() if v is not None}
    instrument_dict['updated_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    
    result = await db.instruments.update_one(
        {"id": instrument_id},
        {"$set": instrument_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    return {"message": "Instrument updated successfully"}


@router.delete("/instruments/{instrument_id}")
async def delete_instrument(
    instrument_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete instrument"""
    # Check if instrument has calibration records
    records = await db.calibration_records.count_documents({"instrument_id": instrument_id})
    if records > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete instrument with {records} calibration records. Delete records first."
        )
    
    result = await db.instruments.delete_one({"id": instrument_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    return {"message": "Instrument deleted successfully"}


# ==================== CALIBRATION RECORD ROUTES ====================

@router.get("/records")
async def get_calibration_records(
    instrument_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all calibration records, optionally filtered by instrument"""
    query = {}
    if instrument_id:
        query["instrument_id"] = instrument_id
    
    records = await db.calibration_records.find(query, {"_id": 0}).sort("calibration_date", -1).to_list(length=None)
    return records


@router.get("/records/{record_id}")
async def get_calibration_record(
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get specific calibration record"""
    record = await db.calibration_records.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Calibration record not found")
    return record


@router.post("/records")
async def create_calibration_record(
    record: CalibrationRecordCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new calibration record"""
    # Get instrument
    instrument = await db.instruments.find_one({"id": record.instrument_id})
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    # Generate record number
    count = await db.calibration_records.count_documents({})
    record_number = f"CAL-{datetime.now().year}-{str(count + 1).zfill(3)}"
    
    # Parse calibration date
    cal_date = datetime.fromisoformat(record.calibration_date.replace('Z', '+00:00')).replace(tzinfo=None)
    
    # Calculate next due date - use provided date or calculate from frequency
    if record.next_calibration_due:
        next_due = datetime.fromisoformat(record.next_calibration_due.replace('Z', '+00:00')).replace(tzinfo=None)
    else:
        # Fallback: calculate from frequency (30 days per month approximation)
        next_due = cal_date + timedelta(days=instrument['calibration_frequency'] * 30)
    
    # Calculate deviations for measurements
    measurements = []
    for m in record.measurements:
        measurement = m.dict()
        if measurement['measured_size'] is not None:
            measurement['deviation'] = round(measurement['measured_size'] - measurement['ref_size'], 3)
        measurements.append(measurement)
    
    record_dict = {
        'id': str(datetime.now().timestamp()).replace('.', ''),
        'record_number': record_number,
        'instrument_id': record.instrument_id,
        'instrument_name': instrument['instrument_name'],
        'instrument_serial': instrument['ident_no'],
        'operator_name': instrument.get('operator_name'),
        'calibration_date': cal_date,
        'next_due_date': next_due,
        'required_accuracy': instrument.get('required_accuracy'),
        'ref_instrument_name': record.ref_instrument_name,
        'ref_instrument_serial': record.ref_instrument_serial,
        'ref_valid_until': datetime.fromisoformat(record.ref_valid_until.replace('Z', '+00:00')).replace(tzinfo=None) if record.ref_valid_until else None,
        'ref_accuracy': record.ref_accuracy,
        'measurements': measurements,
        'result': record.result,
        'performed_by': record.performed_by,
        'temperature': record.temperature,
        'humidity': record.humidity,
        'comments': record.comments,
        'created_by': current_user['username'],
        'created_at': datetime.now(timezone.utc).replace(tzinfo=None),
        'updated_at': datetime.now(timezone.utc).replace(tzinfo=None)
    }
    
    await db.calibration_records.insert_one(record_dict)
    
    # Update instrument with latest calibration dates
    await db.instruments.update_one(
        {"id": record.instrument_id},
        {
            "$set": {
                "last_calibration_date": cal_date,
                "next_calibration_due": next_due,
                "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)
            }
        }
    )
    
    return {
        "message": "Calibration record created successfully",
        "id": record_dict['id'],
        "record_number": record_number
    }


@router.put("/records/{record_id}")
async def update_calibration_record(
    record_id: str,
    record: CalibrationRecordUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update calibration record"""
    # Get existing record
    existing = await db.calibration_records.find_one({"id": record_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Calibration record not found")
    
    update_dict = {}
    
    if record.calibration_date:
        update_dict['calibration_date'] = datetime.fromisoformat(record.calibration_date.replace('Z', '+00:00')).replace(tzinfo=None)
    
    if record.ref_instrument_name:
        update_dict['ref_instrument_name'] = record.ref_instrument_name
    if record.ref_instrument_serial:
        update_dict['ref_instrument_serial'] = record.ref_instrument_serial
    if record.ref_valid_until:
        update_dict['ref_valid_until'] = datetime.fromisoformat(record.ref_valid_until.replace('Z', '+00:00')).replace(tzinfo=None)
    if record.ref_accuracy:
        update_dict['ref_accuracy'] = record.ref_accuracy
    
    if record.measurements:
        measurements = []
        for m in record.measurements:
            measurement = m.dict()
            if measurement['measured_size'] is not None:
                measurement['deviation'] = round(measurement['measured_size'] - measurement['ref_size'], 3)
            measurements.append(measurement)
        update_dict['measurements'] = measurements
    
    if record.result:
        update_dict['result'] = record.result
    if record.performed_by:
        update_dict['performed_by'] = record.performed_by
    if record.comments:
        update_dict['comments'] = record.comments
    
    update_dict['updated_at'] = datetime.now(timezone.utc).replace(tzinfo=None)
    
    await db.calibration_records.update_one(
        {"id": record_id},
        {"$set": update_dict}
    )
    
    return {"message": "Calibration record updated successfully"}


@router.delete("/records/{record_id}")
async def delete_calibration_record(
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete calibration record"""
    result = await db.calibration_records.delete_one({"id": record_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Calibration record not found")
    
    return {"message": "Calibration record deleted successfully"}


@router.get("/dashboard")
async def get_calibration_dashboard(current_user: User = Depends(get_current_user)):
    """Get calibration dashboard metrics"""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Get all instruments
    instruments = await db.instruments.find({}, {"_id": 0}).to_list(length=None)
    
    total = len(instruments)
    current = 0
    due_soon = 0
    overdue = 0
    
    for inst in instruments:
        if inst.get('next_calibration_due'):
            due_date = inst['next_calibration_due']
            if isinstance(due_date, str):
                due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00')).replace(tzinfo=None)
            
            days_until_due = (due_date - now).days
            
            if days_until_due < 0:
                overdue += 1
            elif days_until_due <= 30:
                due_soon += 1
            else:
                current += 1
    
    return {
        "total_instruments": total,
        "current": current,
        "due_soon": due_soon,
        "overdue": overdue
    }
