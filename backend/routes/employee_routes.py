from fastapi import APIRouter, HTTPException, Depends
from typing import List
from models import Employee, EmployeeCreate, EmployeeUpdate, ClockEntry, ClockIn, ClockOut, LeaveRequest, LeaveRequestCreate, LeaveRequestUpdate
from auth import get_current_user, get_password_hash
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/api/employees", tags=["Employees"])

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Available modules in the system
AVAILABLE_MODULES = [
    "quotes",
    "jobsheets",
    "invoices",
    "customers",
    "suppliers",
    "purchase-orders",
    "inventory",
    "employees",
    "iso",
    "packing_slips"
]

async def generate_employee_number():
    """Generate next employee number"""
    last_employee = await db.employees.find_one(sort=[("employee_number", -1)])
    if last_employee and last_employee.get('employee_number'):
        try:
            last_num = int(last_employee['employee_number'].replace('EMP-', ''))
            next_num = last_num + 1
        except:
            next_num = 1
    else:
        next_num = 1
    return f"EMP-{next_num:04d}"

# ==================== EMPLOYEE CRUD ====================

@router.post("", response_model=Employee)
async def create_employee(
    employee: EmployeeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new employee (Admin only)"""
    if current_user.get('role') != 'Administrator':
        raise HTTPException(status_code=403, detail="Only administrators can create employees")
    
    # Check if email already exists
    existing = await db.employees.find_one({"email": employee.email})
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this email already exists")
    
    # Generate employee number if not provided
    employee_number = employee.employee_number or await generate_employee_number()
    
    # Check if username exists if provided
    if employee.username:
        existing_user = await db.employees.find_one({"username": employee.username})
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already taken")
    
    employee_dict = employee.dict()
    employee_dict['id'] = str(uuid.uuid4())
    employee_dict['employee_number'] = employee_number
    employee_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    employee_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Hash password if provided
    if employee_dict.get('password'):
        employee_dict['password'] = get_password_hash(employee_dict['password'])
    
    await db.employees.insert_one(employee_dict)
    
    return Employee(**employee_dict)

@router.get("", response_model=List[Employee])
async def get_all_employees(current_user: dict = Depends(get_current_user)):
    """Get all employees"""
    employees = await db.employees.find().to_list(length=None)
    
    # Remove password from response
    for emp in employees:
        emp.pop('password', None)
    
    return [Employee(**emp) for emp in employees]

@router.get("/{employee_id}", response_model=Employee)
async def get_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get employee by ID"""
    employee = await db.employees.find_one({"id": employee_id})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    employee.pop('password', None)
    return Employee(**employee)

@router.put("/{employee_id}", response_model=Employee)
async def update_employee(
    employee_id: str,
    employee_update: EmployeeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update employee (Admin only)"""
    if current_user.get('role') != 'Administrator':
        raise HTTPException(status_code=403, detail="Only administrators can update employees")
    
    existing = await db.employees.find_one({"id": employee_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    update_data = employee_update.dict(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Hash password if being updated
    if update_data.get('password'):
        update_data['password'] = get_password_hash(update_data['password'])
    
    await db.employees.update_one(
        {"id": employee_id},
        {"$set": update_data}
    )
    
    updated_employee = await db.employees.find_one({"id": employee_id})
    updated_employee.pop('password', None)
    
    return Employee(**updated_employee)

@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete employee (Admin only)"""
    if current_user.get('role') != 'Administrator':
        raise HTTPException(status_code=403, detail="Only administrators can delete employees")
    
    result = await db.employees.delete_one({"id": employee_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"message": "Employee deleted successfully"}

# ==================== CLOCK IN/OUT ====================

@router.post("/clock-in")
async def clock_in(
    clock_data: ClockIn,
    current_user: dict = Depends(get_current_user)
):
    """Clock in for work"""
    employee = await db.employees.find_one({"id": clock_data.employee_id})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Check if already clocked in today
    existing = await db.clock_entries.find_one({
        "employee_id": clock_data.employee_id,
        "date": today,
        "clock_out_time": None
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Already clocked in for today")
    
    entry = {
        "id": str(uuid.uuid4()),
        "employee_id": clock_data.employee_id,
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "date": today,
        "clock_in_time": datetime.now(timezone.utc).isoformat(),
        "clock_out_time": None,
        "total_hours": None,
        "break_duration": None,
        "overtime_hours": None,
        "status": "In Progress",
        "notes": None,
        "approved_by": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.clock_entries.insert_one(entry)
    
    # Remove MongoDB _id field to avoid serialization issues
    entry.pop('_id', None)
    
    return {"message": "Clocked in successfully", "entry": entry}

@router.post("/clock-out")
async def clock_out(
    clock_data: ClockOut,
    current_user: dict = Depends(get_current_user)
):
    """Clock out from work"""
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Find today's clock in entry
    entry = await db.clock_entries.find_one({
        "employee_id": clock_data.employee_id,
        "date": today,
        "clock_out_time": None
    })
    
    if not entry:
        raise HTTPException(status_code=400, detail="No active clock-in found for today")
    
    clock_out_time = datetime.now(timezone.utc)
    clock_in_time = datetime.fromisoformat(entry['clock_in_time'].replace('Z', '+00:00'))
    
    # Calculate total hours
    total_minutes = (clock_out_time - clock_in_time).total_seconds() / 60
    break_duration = clock_data.break_duration or 0
    work_minutes = total_minutes - break_duration
    total_hours = work_minutes / 60
    
    # Calculate overtime (if > 8 hours)
    overtime_hours = max(0, total_hours - 8)
    
    await db.clock_entries.update_one(
        {"id": entry['id']},
        {"$set": {
            "clock_out_time": clock_out_time.isoformat(),
            "total_hours": round(total_hours, 2),
            "break_duration": break_duration,
            "overtime_hours": round(overtime_hours, 2),
            "status": "Completed",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Clocked out successfully", "total_hours": round(total_hours, 2)}

@router.get("/clock-entries/employee/{employee_id}")
async def get_employee_clock_entries(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get clock entries for an employee"""
    entries = await db.clock_entries.find({"employee_id": employee_id}).sort("date", -1).to_list(length=100)
    # Remove MongoDB _id fields to avoid serialization issues
    for entry in entries:
        entry.pop('_id', None)
    return entries

@router.get("/clock-entries/today")
async def get_todays_clock_entries(current_user: dict = Depends(get_current_user)):
    """Get all clock entries for today"""
    today = datetime.now(timezone.utc).date().isoformat()
    entries = await db.clock_entries.find({"date": today}).to_list(length=None)
    # Remove MongoDB _id fields to avoid serialization issues
    for entry in entries:
        entry.pop('_id', None)
    return entries

# ==================== LEAVE MANAGEMENT ====================

@router.post("/leave-requests", response_model=LeaveRequest)
async def create_leave_request(
    leave: LeaveRequestCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a leave request"""
    employee = await db.employees.find_one({"id": leave.employee_id})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    leave_dict = leave.dict()
    leave_dict['id'] = str(uuid.uuid4())
    leave_dict['employee_name'] = f"{employee['first_name']} {employee['last_name']}"
    leave_dict['status'] = "Pending"
    leave_dict['approved_by'] = None
    leave_dict['approval_notes'] = None
    leave_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    leave_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.leave_requests.insert_one(leave_dict)
    
    return LeaveRequest(**leave_dict)

@router.get("/leave-requests", response_model=List[LeaveRequest])
async def get_all_leave_requests(current_user: dict = Depends(get_current_user)):
    """Get all leave requests"""
    requests = await db.leave_requests.find().sort("created_at", -1).to_list(length=None)
    return [LeaveRequest(**req) for req in requests]

@router.get("/leave-requests/employee/{employee_id}")
async def get_employee_leave_requests(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get leave requests for an employee"""
    requests = await db.leave_requests.find({"employee_id": employee_id}).sort("created_at", -1).to_list(length=None)
    # Remove MongoDB _id fields to avoid serialization issues
    for req in requests:
        req.pop('_id', None)
    return requests

@router.put("/leave-requests/{request_id}")
async def update_leave_request(
    request_id: str,
    leave_update: LeaveRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update leave request (approve/reject)"""
    if current_user.get('role') not in ['Administrator', 'Manager']:
        raise HTTPException(status_code=403, detail="Only administrators and managers can approve leave")
    
    existing = await db.leave_requests.find_one({"id": request_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    update_data = leave_update.dict(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # If approving, deduct from leave balance
    if update_data.get('status') == 'Approved':
        employee = await db.employees.find_one({"id": existing['employee_id']})
        if employee:
            leave_type = existing['leave_type']
            total_days = existing['total_days']
            
            if leave_type == 'Annual':
                new_balance = employee.get('annual_leave_balance', 0) - (total_days * 8)  # 8 hours per day
                await db.employees.update_one(
                    {"id": existing['employee_id']},
                    {"$set": {"annual_leave_balance": new_balance}}
                )
            elif leave_type == 'Sick':
                new_balance = employee.get('sick_leave_balance', 0) - (total_days * 8)
                await db.employees.update_one(
                    {"id": existing['employee_id']},
                    {"$set": {"sick_leave_balance": new_balance}}
                )
    
    await db.leave_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    return {"message": "Leave request updated successfully"}

@router.get("/modules")
async def get_available_modules(current_user: dict = Depends(get_current_user)):
    """Get list of available modules"""
    return {"modules": AVAILABLE_MODULES}
