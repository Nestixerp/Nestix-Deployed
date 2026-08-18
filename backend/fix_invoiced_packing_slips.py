"""
Fix invoiced packing slips - mark packing slips as invoiced if they're referenced in invoices
This script finds all packing slips that are referenced in invoices but not marked as is_invoiced
"""
import os
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = MongoClient(mongo_url)
db = client[os.environ['DB_NAME']]

def fix_invoiced_packing_slips():
    print("=" * 80)
    print("FIXING INVOICED PACKING SLIPS")
    print("=" * 80)
    
    # Get all invoices
    invoices = list(db.invoices.find({}, {'_id': 0, 'invoice_number': 1, 'packing_slip_ids': 1, 'items': 1}))
    print(f"\nFound {len(invoices)} invoices")
    
    # Collect all packing slip IDs that should be marked as invoiced
    ps_ids_in_invoices = set()
    
    # Check packing_slip_ids field
    for inv in invoices:
        if 'packing_slip_ids' in inv and inv['packing_slip_ids']:
            ps_ids_in_invoices.update(inv['packing_slip_ids'])
    
    # Also check items for packing_slip_id references
    for inv in invoices:
        if 'items' in inv:
            for item in inv['items']:
                if 'packing_slip_id' in item and item['packing_slip_id']:
                    ps_ids_in_invoices.add(item['packing_slip_id'])
    
    print(f"Found {len(ps_ids_in_invoices)} packing slip IDs referenced in invoices")
    
    # Find packing slips that need updating
    packing_slips_to_fix = []
    
    for ps_id in ps_ids_in_invoices:
        ps = db.packing_slips.find_one({'id': ps_id})
        if ps:
            if not ps.get('is_invoiced'):
                packing_slips_to_fix.append(ps)
    
    print(f"\nFound {len(packing_slips_to_fix)} packing slips that need to be marked as invoiced:")
    for ps in packing_slips_to_fix:
        print(f"  - {ps.get('packing_slip_number')} (Job: {ps.get('job_sheet_number')})")
    
    if packing_slips_to_fix:
        confirm = input(f"\nDo you want to mark these {len(packing_slips_to_fix)} packing slips as invoiced? (yes/no): ")
        
        if confirm.lower() == 'yes':
            updated_count = 0
            for ps in packing_slips_to_fix:
                result = db.packing_slips.update_one(
                    {'id': ps['id']},
                    {'$set': {'is_invoiced': True}}
                )
                if result.modified_count > 0:
                    updated_count += 1
            
            print(f"\n✅ Successfully marked {updated_count} packing slips as invoiced!")
        else:
            print("\n❌ Operation cancelled")
    else:
        print("\n✅ All packing slips are already correctly marked!")
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    total_ps = db.packing_slips.count_documents({})
    invoiced_ps = db.packing_slips.count_documents({'is_invoiced': True})
    uninvoiced_completed = db.packing_slips.count_documents({
        'status': 'Completed',
        '$or': [
            {'is_invoiced': False},
            {'is_invoiced': {'$exists': False}}
        ]
    })
    
    print(f"Total packing slips: {total_ps}")
    print(f"Marked as invoiced: {invoiced_ps}")
    print(f"Completed but NOT invoiced: {uninvoiced_completed}")
    print("=" * 80)

if __name__ == '__main__':
    fix_invoiced_packing_slips()
