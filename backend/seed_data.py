"""
Seed script to populate initial data for Nestix ERP
Run this once to set up the database with initial users and materials
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from auth import get_password_hash
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

async def seed_users():
    """Seed initial users"""
    print("Seeding users...")
    
    # Check if users already exist
    existing_users = await db.users.count_documents({})
    if existing_users > 0:
        print(f"Users already exist ({existing_users} found). Skipping...")
        return
    
    users = [
        {
            "id": "1",
            "name": "Admin User",
            "username": "admin",
            "email": "admin@nestix.com",
            "password_hash": get_password_hash("password123"),
            "role": "Administrator",
            "modules": ["quotes", "jobsheets", "packing_slips", "invoices", "customers", "suppliers", "purchase-orders", "inventory", "employees", "iso"]
        },
        {
            "id": "2",
            "name": "Peter Jones",
            "username": "peter",
            "email": "peter@nestix.com",
            "password_hash": get_password_hash("password123"),
            "role": "Sales Manager",
            "modules": ["quotes", "invoices", "customers"]
        },
        {
            "id": "3",
            "name": "Sarah Chen",
            "username": "sarah",
            "email": "sarah@nestix.com",
            "password_hash": get_password_hash("password123"),
            "role": "Production Manager",
            "modules": ["quotes", "jobsheets", "packing_slips", "inventory", "suppliers"]
        }
    ]
    
    result = await db.users.insert_many(users)
    print(f"✓ Inserted {len(result.inserted_ids)} users")

async def seed_materials():
    """Seed initial materials"""
    print("Seeding materials...")
    
    # Check if materials already exist
    existing_materials = await db.materials.count_documents({})
    if existing_materials > 0:
        print(f"Materials already exist ({existing_materials} found). Skipping...")
        return
    
    materials = [
        {
            "id": "1",
            "name": "Mild Steel",
            "type": "Sheet",
            "grade": "HA3",
            "finish": "P&O",
            "thickness": "5mm",
            "cost_per_sheet": 85.00,
            "weight_per_sheet": 74.48,
            "stock": 35,
            "location": "Rack A-12",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 10
        },
        {
            "id": "2",
            "name": "Stainless Steel",
            "type": "Sheet",
            "grade": "304",
            "finish": "2B",
            "thickness": "3mm",
            "cost_per_sheet": 190.00,
            "weight_per_sheet": 22.34,
            "stock": 28,
            "location": "Rack B-05",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 8
        },
        {
            "id": "3",
            "name": "Mild Steel",
            "type": "Sheet",
            "grade": "HA3",
            "finish": "Galv",
            "thickness": "2mm",
            "cost_per_sheet": 56.50,
            "weight_per_sheet": 29.79,
            "stock": 42,
            "location": "Rack A-14",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 12
        },
        {
            "id": "4",
            "name": "Aluminium",
            "type": "Sheet",
            "grade": "5005",
            "finish": "Mill",
            "thickness": "3mm",
            "cost_per_sheet": 102.00,
            "weight_per_sheet": 8.16,
            "stock": 22,
            "location": "Rack C-08",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 6
        },
        {
            "id": "5",
            "name": "Mild Steel",
            "type": "Sheet",
            "grade": "HA3",
            "finish": "P&O",
            "thickness": "10mm",
            "cost_per_sheet": 168.00,
            "weight_per_sheet": 148.96,
            "stock": 18,
            "location": "Rack A-18",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 5
        },
        {
            "id": "6",
            "name": "Stainless Steel",
            "type": "Sheet",
            "grade": "316",
            "finish": "2B",
            "thickness": "5mm",
            "cost_per_sheet": 380.00,
            "weight_per_sheet": 37.24,
            "stock": 15,
            "location": "Rack B-12",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 4
        },
        {
            "id": "7",
            "name": "Mild Steel",
            "type": "Sheet",
            "grade": "HA3",
            "finish": "P&O",
            "thickness": "8mm",
            "cost_per_sheet": 132.00,
            "weight_per_sheet": 119.17,
            "stock": 25,
            "location": "Rack A-16",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 7
        },
        {
            "id": "8",
            "name": "Aluminium",
            "type": "Sheet",
            "grade": "5005",
            "finish": "Anodised",
            "thickness": "5mm",
            "cost_per_sheet": 190.00,
            "weight_per_sheet": 13.60,
            "stock": 12,
            "location": "Rack C-12",
            "width": 1220,
            "length": 2440,
            "supplier": "Impact Steel",
            "reorder_level": 3
        }
    ]
    
    result = await db.materials.insert_many(materials)
    print(f"✓ Inserted {len(result.inserted_ids)} materials")

async def initialize_counters():
    """Initialize counters for auto-increment fields"""
    print("Initializing counters...")
    
    # Check if counter exists
    existing_counter = await db.counters.find_one({"_id": "item_number"})
    if existing_counter:
        print("Item number counter already exists. Skipping...")
        return
    
    await db.counters.insert_one({"_id": "item_number", "value": 0})
    print("✓ Initialized item number counter")

async def main():
    print("\n=== Nestix ERP Database Seeding ===\n")
    
    try:
        await seed_users()
        await seed_materials()
        await initialize_counters()
        
        print("\n✓ Database seeding completed successfully!")
        print("\nDefault Login Credentials:")
        print("  Username: admin | Password: password123")
        print("  Username: peter | Password: password123")
        print("  Username: sarah | Password: password123")
        
    except Exception as e:
        print(f"\n✗ Error during seeding: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())
