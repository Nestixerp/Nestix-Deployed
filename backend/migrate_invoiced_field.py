"""
Migration script to rename 'invoiced' field to 'is_invoiced' in packing_slips collection
Also ensures all packing slips have is_invoiced field set
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def migrate_invoiced_field():
    """Rename invoiced field to is_invoiced and ensure all have the field"""
    MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    DB_NAME = os.environ.get('DB_NAME', 'erp_db')
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("Starting migration: invoiced -> is_invoiced")
    
    # Step 1: Rename old 'invoiced' field to 'is_invoiced'
    packing_slips_old = await db.packing_slips.find({"invoiced": {"$exists": True}}).to_list(length=None)
    print(f"Found {len(packing_slips_old)} packing slips with old 'invoiced' field")
    
    for ps in packing_slips_old:
        invoiced_value = ps.get('invoiced', False)
        await db.packing_slips.update_one(
            {"_id": ps["_id"]},
            {
                "$set": {"is_invoiced": invoiced_value},
                "$unset": {"invoiced": ""}
            }
        )
    
    # Step 2: Ensure ALL packing slips have is_invoiced field (default False)
    packing_slips_without = await db.packing_slips.find(
        {"is_invoiced": {"$exists": False}}
    ).to_list(length=None)
    
    print(f"Found {len(packing_slips_without)} packing slips without 'is_invoiced' field")
    
    for ps in packing_slips_without:
        await db.packing_slips.update_one(
            {"_id": ps["_id"]},
            {"$set": {"is_invoiced": False}}
        )
    
    # Verification
    total_ps = await db.packing_slips.count_documents({})
    remaining_old = await db.packing_slips.count_documents({"invoiced": {"$exists": True}})
    with_new_field = await db.packing_slips.count_documents({"is_invoiced": {"$exists": True}})
    
    print(f"\nMigration complete!")
    print(f"Verification:")
    print(f"  - Total packing slips: {total_ps}")
    print(f"  - Documents with old 'invoiced' field: {remaining_old}")
    print(f"  - Documents with new 'is_invoiced' field: {with_new_field}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_invoiced_field())
