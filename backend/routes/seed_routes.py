from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime, timezone
import bcrypt

router = APIRouter(prefix="/api/seed", tags=["seed"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]


@router.get("/initialize")
@router.post("/initialize")
async def initialize_database():
    """
    Initialize the database with default users and data.
    This endpoint can be called once to set up a new deployment.
    Accepts both GET and POST requests for ease of use.
    """
    try:
        # Check if users already exist
        existing_users = await db.users.count_documents({})
        if existing_users > 0:
            return {
                "success": True,
                "message": f"Database already initialized with {existing_users} users",
                "action": "skipped"
            }
        
        # Create default users
        users = [
            {
                "id": "1",
                "name": "Admin User",
                "username": "admin",
                "email": "admin@nestix.com",
                "password_hash": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                "role": "Administrator",
                "modules": [
                    "quoting", "quotes", "job_sheets", "overdue_jobs", "packing_slips",
                    "invoices", "customers", "suppliers", "inventory", "purchase_orders",
                    "employees", "settings", "scheduling", "time_clock", "quality_audits",
                    "dashboard", "reports"
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": "2",
                "name": "Peter Jones",
                "username": "peter",
                "email": "peter@nestix.com",
                "password_hash": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                "role": "Sales Manager",
                "modules": [
                    "quoting", "quotes", "job_sheets", "packing_slips", "invoices",
                    "customers", "dashboard", "reports"
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        
        # Insert users
        await db.users.insert_many(users)
        
        # Initialize counters
        counters = [
            {"_id": "quote_number", "sequence_value": 0},
            {"_id": "job_sheet_number", "sequence_value": 0},
            {"_id": "invoice_number", "sequence_value": 0},
            {"_id": "packing_slip_number", "sequence_value": 0},
            {"_id": "customer_code", "sequence_value": 0},
        ]
        
        for counter in counters:
            await db.counters.update_one(
                {"_id": counter["_id"]},
                {"$setOnInsert": counter},
                upsert=True
            )
        
        return {
            "success": True,
            "message": "Database initialized successfully",
            "users_created": len(users),
            "credentials": [
                {"username": "admin", "password": "password123", "role": "Administrator"},
                {"username": "peter", "password": "password123", "role": "Sales Manager"}
            ]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize database: {str(e)}"
        )


@router.get("/status")
async def get_database_status():
    """
    Check the current database status
    """
    try:
        users_count = await db.users.count_documents({})
        customers_count = await db.customers.count_documents({})
        quotes_count = await db.quotes.count_documents({})
        job_sheets_count = await db.job_sheets.count_documents({})
        
        return {
            "database_name": os.environ.get('DB_NAME', 'test_database'),
            "initialized": users_count > 0,
            "counts": {
                "users": users_count,
                "customers": customers_count,
                "quotes": quotes_count,
                "job_sheets": job_sheets_count
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check database status: {str(e)}"
        )



@router.get("/reset-users")
@router.post("/reset-users")
async def reset_users():
    """
    FORCE RESET: Delete existing users and recreate with default credentials.
    Use this when login fails despite users existing.
    """
    try:
        # Delete ALL existing users
        delete_result = await db.users.delete_many({})
        
        # Create fresh default users with correct passwords
        users = [
            {
                "id": "1",
                "name": "Admin User",
                "username": "admin",
                "email": "admin@nestix.com",
                "password_hash": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                "role": "Administrator",
                "modules": [
                    "quoting", "quotes", "job_sheets", "overdue_jobs", "packing_slips",
                    "invoices", "customers", "suppliers", "inventory", "purchase_orders",
                    "employees", "settings", "scheduling", "time_clock", "quality_audits",
                    "dashboard", "reports"
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": "2",
                "name": "Peter Jones",
                "username": "peter",
                "email": "peter@nestix.com",
                "password_hash": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                "role": "Sales Manager",
                "modules": [
                    "quoting", "quotes", "job_sheets", "packing_slips", "invoices",
                    "customers", "dashboard", "reports"
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        
        # Insert fresh users
        await db.users.insert_many(users)
        
        return {
            "success": True,
            "message": "Users reset successfully",
            "deleted": delete_result.deleted_count,
            "created": len(users),
            "credentials": [
                {"username": "admin", "password": "password123", "role": "Administrator"},
                {"username": "peter", "password": "password123", "role": "Sales Manager"}
            ]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset users: {str(e)}"
        )
