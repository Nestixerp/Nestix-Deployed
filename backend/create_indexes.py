"""
Database Index Creation Script
Run this once to create indexes for better performance
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

async def create_indexes():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db_name = os.environ.get('DB_NAME', 'erp_db')
    db = client[db_name]
    
    print(f"Creating indexes for database: {db_name}")
    
    # Audit Reports indexes
    print("Creating audit_reports indexes...")
    await db.audit_reports.create_index([("report_date", -1)])
    await db.audit_reports.create_index([("status", 1)])
    await db.audit_reports.create_index([("id", 1)], unique=True)
    
    # Audit Findings indexes
    print("Creating audit_findings indexes...")
    await db.audit_findings.create_index([("report_id", 1), ("clause_number", 1)])
    await db.audit_findings.create_index([("id", 1)], unique=True)
    
    # Quotes indexes
    print("Creating quotes indexes...")
    await db.quotes.create_index([("quote_number", -1)])
    await db.quotes.create_index([("customer_id", 1)])
    await db.quotes.create_index([("status", 1)])
    await db.quotes.create_index([("created_at", -1)])
    
    # Job Sheets indexes
    print("Creating job_sheets indexes...")
    await db.job_sheets.create_index([("job_sheet_number", -1)])
    await db.job_sheets.create_index([("status", 1)])
    await db.job_sheets.create_index([("created_at", -1)])
    
    # Packing Slips indexes
    print("Creating packing_slips indexes...")
    await db.packing_slips.create_index([("job_sheet_number", 1)])
    await db.packing_slips.create_index([("is_invoiced", 1)])
    await db.packing_slips.create_index([("customer_po_number", 1)])
    
    # Invoices indexes
    print("Creating invoices indexes...")
    await db.invoices.create_index([("invoice_number", -1)])
    await db.invoices.create_index([("purchase_order_number", 1)])
    await db.invoices.create_index([("created_at", -1)])
    
    # Materials indexes
    print("Creating materials indexes...")
    await db.materials.create_index([("name", 1), ("grade", 1), ("thickness", 1)])
    await db.materials.create_index([("stock", 1), ("reorder_level", 1)])
    
    print("\n✅ All indexes created successfully!")
    print("\nIndexes created:")
    print("- audit_reports: report_date, status, id")
    print("- audit_findings: report_id+clause_number, id")
    print("- quotes: quote_number, customer_id, status, created_at")
    print("- job_sheets: job_sheet_number, status, created_at")
    print("- packing_slips: job_sheet_number, is_invoiced, customer_po_number")
    print("- invoices: invoice_number, purchase_order_number, created_at")
    print("- materials: name+grade+thickness, stock+reorder_level")

if __name__ == "__main__":
    asyncio.run(create_indexes())
