from fastapi import APIRouter, HTTPException, status, Depends
from models import UserLogin, Token, User, UserResponse
from auth import verify_password, create_access_token, get_password_hash, require_admin, get_current_user
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path
import os
import uuid

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login endpoint - supports both users and employees"""
    # First, try to find in users collection (admin users)
    user_data = await db.users.find_one({"username": credentials.username})
    
    # For admin users from users collection, ensure they have all modules including time_clock
    if user_data and user_data.get("role") == "Administrator":
        user_data["modules"] = ["quoting", "quotes", "job_sheets", "overdue_jobs", "packing_slips", "invoices", "customers", 
                              "suppliers", "inventory", "purchase_orders", "employees", "settings", "scheduling",
                              "time_clock", "quality_audits", "dashboard", "reports"]
    
    # If not found in users, check employees collection
    if not user_data:
        employee_data = await db.employees.find_one({"username": credentials.username})
        if employee_data:
            # Convert employee to user format
            # Note: employees use 'password' field, users use 'password_hash'
            # Use 'system_access_role' for permissions, not 'role' (which is job role)
            system_role = employee_data.get("system_access_role") or employee_data.get("role", "Employee")
            
            # Administrators get full access to all modules
            if system_role == "Administrator":
                modules = ["quoting", "quotes", "job_sheets", "overdue_jobs", "packing_slips", "invoices", "customers", 
                          "suppliers", "inventory", "purchase_orders", "employees", "settings", "scheduling",
                          "time_clock", "quality_audits", "dashboard", "reports"]
            else:
                # For non-admins, use allowed_modules if set, otherwise default modules
                modules = employee_data.get("allowed_modules") or ["quoting", "quotes", "job_sheets", "packing_slips"]
            
            user_data = {
                "id": employee_data.get("id"),
                "username": employee_data.get("username"),
                "password_hash": employee_data.get("password") or employee_data.get("password_hash"),  # Support both field names
                "name": employee_data.get("name") or f"{employee_data.get('first_name', '')} {employee_data.get('last_name', '')}".strip(),
                "email": employee_data.get("email", ""),
                "role": system_role,
                "modules": modules
            }
    
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    # Check if password hash exists
    if not user_data.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not activated. Please contact administrator to set your password."
        )
    
    # Verify password
    if not verify_password(credentials.password, user_data["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": user_data["id"],
            "username": user_data["username"],
            "role": user_data["role"],
            "modules": user_data["modules"]
        }
    )
    
    # Return token and user info
    user_response = UserResponse(
        id=user_data["id"],
        name=user_data["name"],
        username=user_data["username"],
        email=user_data["email"],
        role=user_data["role"],
        modules=user_data["modules"]
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@router.post("/logout")
async def logout():
    """Logout endpoint (client-side token removal)"""
    return {"message": "Logged out successfully"}


# --- Admin: User Management ----------------------------------------------

class UserCreateIn(BaseModel):
    username: str
    password: str
    name: Optional[str] = None
    email: Optional[str] = ""
    role: str = "User"


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class PasswordResetIn(BaseModel):
    new_password: str


def _serialize_user(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "username": u.get("username"),
        "name": u.get("name"),
        "email": u.get("email"),
        "role": u.get("role"),
        "modules": u.get("modules", []),
        "created_at": (u.get("created_at").isoformat() if hasattr(u.get("created_at"), "isoformat") else u.get("created_at")),
        "updated_at": (u.get("updated_at").isoformat() if hasattr(u.get("updated_at"), "isoformat") else u.get("updated_at")),
    }


@router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    """List all login users (admin only)."""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("username", 1).to_list(length=500)
    return [_serialize_user(u) for u in users]


@router.post("/users", status_code=201)
async def create_user(payload: UserCreateIn, _: dict = Depends(require_admin)):
    """Create a new login user (admin only)."""
    if not payload.username or not payload.password:
        raise HTTPException(400, "username and password are required")
    if len(payload.password) < 6:
        raise HTTPException(400, "password must be at least 6 characters")
    existing = await db.users.find_one({"username": payload.username})
    if existing:
        raise HTTPException(409, f"username '{payload.username}' already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "username": payload.username,
        "name": payload.name or payload.username,
        "email": payload.email or "",
        "password_hash": get_password_hash(payload.password),
        "role": payload.role or "User",
        "modules": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    await db.users.insert_one(doc)
    return _serialize_user(doc)


@router.patch("/users/{username}")
async def update_user(username: str, payload: UserUpdateIn, _: dict = Depends(require_admin)):
    """Update a user's name / email / role (admin only)."""
    existing = await db.users.find_one({"username": username})
    if not existing:
        raise HTTPException(404, "user not found")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "nothing to update")
    upd["updated_at"] = datetime.utcnow()
    await db.users.update_one({"username": username}, {"$set": upd})
    fresh = await db.users.find_one({"username": username}, {"_id": 0, "password_hash": 0})
    return _serialize_user(fresh)


@router.post("/users/{username}/reset-password")
async def reset_user_password(username: str, payload: PasswordResetIn, _: dict = Depends(require_admin)):
    """Set a new password for a user (admin only). Password is hashed; the
    admin sees the value they set — only the hash is stored."""
    if not payload.new_password or len(payload.new_password) < 6:
        raise HTTPException(400, "new_password must be at least 6 characters")
    existing = await db.users.find_one({"username": username})
    if not existing:
        raise HTTPException(404, "user not found")
    await db.users.update_one(
        {"username": username},
        {"$set": {"password_hash": get_password_hash(payload.new_password), "updated_at": datetime.utcnow()}},
    )
    return {"success": True, "username": username, "message": f"Password reset for {username}"}


@router.delete("/users/{username}")
async def delete_user(username: str, current: dict = Depends(require_admin)):
    """Delete a user (admin only). Cannot delete the user making the request."""
    if username == current.get("username"):
        raise HTTPException(400, "you cannot delete your own account")
    res = await db.users.delete_one({"username": username})
    if res.deleted_count == 0:
        raise HTTPException(404, "user not found")
    return {"success": True}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    """Return the current logged-in user (without password_hash)."""
    return _serialize_user({**current_user})
