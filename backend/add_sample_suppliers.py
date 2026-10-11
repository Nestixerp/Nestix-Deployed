"""
Script to add sample suppliers to the database
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from models import Supplier
from datetime import datetime
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

async def get_next_supplier_code(db):
    """Generate next supplier code"""
    suppliers = await db.suppliers.find().sort("supplier_code", -1).limit(1).to_list(1)
    
    if not suppliers:
        return "SUP-0001"
    
    last_code = suppliers[0].get("supplier_code", "SUP-0000")
    try:
        last_num = int(last_code.split('-')[1])
        new_num = last_num + 1
        return f"SUP-{new_num:04d}"
    except Exception:
        return "SUP-0001"

async def add_suppliers():
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    suppliers_data = [
        {
            "company_name": "Midway Metals",
            "category": "Material",
            "abn": "SS 001 831 090",
            "address": "54-66 Smeaton Ave",
            "suburb": "Dandenong South",
            "state": "VIC",
            "postcode": "3175",
            "phone": "03 9791 5111",
            "email": "tanyak@midwaymetals.com.au",
            "website": "www.midwaymetals.com.au",
            "payment_terms": "Net 30 Days from EOM",
            "iso_certified": False,
            "status": "Active",
            "notes": "Old address: 33 Tatterson Road, Dandenong. Main Contact: Tanya (Sales)"
        },
        {
            "company_name": "ASD",
            "category": "Material",
            "abn": "SS 046 097 677 980",
            "address": "44 Commercial Drive",
            "suburb": "Lynbrook",
            "state": "VIC",
            "postcode": "3975",
            "phone": "03 9799 8188",
            "email": "stainless@asdsales.com.au",
            "website": "",
            "payment_terms": "30 Days EOM",
            "iso_certified": False,
            "status": "Active",
            "notes": "Main Contact: Tim (Sales Representative), Mobile: 0431 220 175. Secondary contact: Tim Goodingham - timgoodingham@asdsales.com.au. Kirstin in Tomastown (20-22 Inglewood Drive) phone: 9465 5744. ACCOUNTS PO BOX 4016, DANDENONG SOUTH, VIC 3164"
        },
        {
            "company_name": "Apex Steel Pty Ltd",
            "category": "Material",
            "abn": "S8 080 253 756",
            "address": "4 Cojo Place",
            "suburb": "Dandenong South",
            "state": "VIC",
            "postcode": "3164",
            "phone": "03 9768 4749",
            "email": "tsuch@apexsteel.com.au",
            "website": "www.apexsteel.com.au",
            "payment_terms": "60 Days EOM",
            "iso_certified": False,
            "status": "Active",
            "notes": "Main Contact: Tim Such (Sales Manager), Mobile: 0407 322 176. Old Name: United Steel, Old phone: 03 9791 6777, Old fax: 03 9791 6667. Additional contacts: Nello 9768 4755 (0418329045), pjames@apexsteel.com.au, Office: 9768 4777, rrowley@apexsteel.com.au (9768 4760). Account Number: 8372 45261"
        }
    ]
    
    print("=== Adding Sample Suppliers ===\n")
    
    for supplier_data in suppliers_data:
        # Check if supplier already exists
        existing = await db.suppliers.find_one({"company_name": supplier_data["company_name"]})
        
        if existing:
            print(f"⚠️  Supplier '{supplier_data['company_name']}' already exists (Code: {existing['supplier_code']})")
            continue
        
        # Generate supplier code
        supplier_code = await get_next_supplier_code(db)
        
        # Create supplier
        supplier = Supplier(
            supplier_code=supplier_code,
            **supplier_data
        )
        
        await db.suppliers.insert_one(supplier.dict())
        
        print(f"✅ Added: {supplier.company_name} ({supplier_code})")
        print(f"   Address: {supplier.suburb}, {supplier.state} {supplier.postcode}")
        print(f"   Contact: {supplier.phone} / {supplier.email}")
        print()
    
    client.close()
    print("=== Supplier Addition Complete ===")

if __name__ == "__main__":
    asyncio.run(add_suppliers())
