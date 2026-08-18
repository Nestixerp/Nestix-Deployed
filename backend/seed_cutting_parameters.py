import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
import uuid

# Feed rates from the cutting parameters table (mm/min)
CUTTING_FEED_RATES = {
    "Mild Steel": {
        "0.50mm": 8280, "0.60mm": 8280, "0.70mm": 8280, "0.80mm": 8280, "0.90mm": 8280,
        "1.00mm": 8280, "1.20mm": 7800, "1.50mm": 7800, "1.60mm": 7800, "2.00mm": 7800,
        "2.50mm": 6600, "3.00mm": 5400, "4.00mm": 3600, "5.00mm": 3000, "6.00mm": 2400,
        "8.00mm": 1500, "10.00mm": 1140, "12.00mm": 900, "15.00mm": 600, "20.00mm": 360,
        "25.00mm": 240
    },
    "Stainless Steel": {
        "0.50mm": 8280, "0.60mm": 8280, "0.70mm": 8280, "0.80mm": 8280, "0.90mm": 8280,
        "1.00mm": 8280, "1.20mm": 7800, "1.50mm": 7800, "1.60mm": 7800, "2.00mm": 7800,
        "2.50mm": 6600, "3.00mm": 5400, "4.00mm": 3000, "5.00mm": 2400, "6.00mm": 1800,
        "8.00mm": 1200, "10.00mm": 900, "12.00mm": 600, "15.00mm": 360, "20.00mm": 240,
        "25.00mm": 180
    },
    "Aluminium": {
        "0.50mm": 8280, "0.60mm": 8280, "0.70mm": 8280, "0.80mm": 8280, "0.90mm": 8280,
        "1.00mm": 8280, "1.20mm": 7800, "1.50mm": 7800, "1.60mm": 7800, "2.00mm": 7800,
        "2.50mm": 7800, "3.00mm": 7200, "4.00mm": 6600, "5.00mm": 5400, "6.00mm": 4800,
        "8.00mm": 3600, "10.00mm": 2400, "12.00mm": 1800, "15.00mm": 1200, "20.00mm": 600,
        "25.00mm": 360
    }
}

async def seed_cutting_parameters():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'test_database')]
    
    print("Seeding cutting parameters...")
    
    # Clear existing parameters
    await db.cutting_parameters.delete_many({})
    
    # Insert cutting parameters
    parameters = []
    for material_type, thicknesses in CUTTING_FEED_RATES.items():
        for thickness, feed_rate in thicknesses.items():
            parameters.append({
                "id": str(uuid.uuid4()),
                "material_type": material_type,
                "thickness": thickness,
                "feed_rate": feed_rate,
                "pierce_time": 2.0,  # 2 seconds per hole
                "setup_time": 5.0  # 5 minutes setup
            })
    
    await db.cutting_parameters.insert_many(parameters)
    print(f"✅ Inserted {len(parameters)} cutting parameters")
    
    # Verify
    count = await db.cutting_parameters.count_documents({})
    print(f"✅ Total cutting parameters in database: {count}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_cutting_parameters())
