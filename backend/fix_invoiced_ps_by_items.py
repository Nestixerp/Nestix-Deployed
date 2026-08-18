"""
Fix invoiced packing slips by checking invoice items
This finds packing slips referenced in invoice items and marks them as invoiced
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
    print("FIXING INVOICED PACKING SLIPS - CHECKING INVOICE ITEMS")
    print("=" * 80)
    
    # Get all invoices
    invoices = list(db.invoices.find({}, {'_id': 0, 'invoice_number': 1, 'items': 1}))
    print(f"\nFound {len(invoices)} invoices")
    
    # Extract packing slip numbers from invoice items
    ps_numbers_in_invoices = set()
    
    for inv in invoices:
        invoice_num = inv.get('invoice_number')
        if 'items' in inv:
            for item in inv['items']:
                # Check for packing_slip_number in item
                ps_num = None
                if 'packing_slip_number' in item:
                    ps_num = item['packing_slip_number']
                elif 'ps' in item and isinstance(item['ps'], str):
                    # Sometimes stored as "PS: PS-2025-0012"
                    ps_num = item['ps'].replace('PS: ', '').strip()
                
                if ps_num and ps_num.startswith('PS-'):
                    ps_numbers_in_invoices.add(ps_num)
                    print(f"  Invoice {invoice_num}: Found {ps_num}")
    
    print(f"\nTotal unique packing slip numbers in invoices: {len(ps_numbers_in_invoices)}")
    
    # Find packing slips that need to be marked as invoiced
    packing_slips_to_fix = []
    
    for ps_num in ps_numbers_in_invoices:
        ps = db.packing_slips.find_one({'packing_slip_number': ps_num})
        if ps:
            if not ps.get('is_invoiced'):
                packing_slips_to_fix.append({
                    'number': ps_num,
                    'job': ps.get('job_sheet_number'),
                    'customer': ps.get('customer_name')
                })
    
    print(f"\n{'='*80}")
    print(f"PACKING SLIPS THAT NEED FIXING: {len(packing_slips_to_fix)}")
    print(f"{'='*80}")
    
    for ps in packing_slips_to_fix:
        print(f"  {ps['number']} - Job: {ps['job']} - Customer: {ps['customer']}")
    
    if packing_slips_to_fix:
        print(f"\n{'='*80}")
        confirm = input(f"Mark these {len(packing_slips_to_fix)} packing slips as invoiced? (yes/no): ")
        
        if confirm.lower() == 'yes':
            updated_count = 0
            for ps in packing_slips_to_fix:
                result = db.packing_slips.update_one(
                    {'packing_slip_number': ps['number']},
                    {'$set': {'is_invoiced': True}}
                )
                if result.modified_count > 0:
                    updated_count += 1
                    print(f"  ✓ Marked {ps['number']} as invoiced")
            
            print(f"\n✅ Successfully marked {updated_count} packing slips as invoiced!")
        else:
            print("\n❌ Operation cancelled")
    else:
        print("\n✅ All packing slips are already correctly marked!")
    
    # Final summary
    print("\n" + "=" * 80)
    print("FINAL DATABASE STATUS")
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
    
    if uninvoiced_completed > 0:
        print("\nRemaining uninvoiced packing slips:")
        remaining = list(db.packing_slips.find(
            {
                'status': 'Completed',
                '$or': [
                    {'is_invoiced': False},
                    {'is_invoiced': {'$exists': False}}
                ]
            },
            {'_id': 0, 'packing_slip_number': 1, 'job_sheet_number': 1, 'customer_name': 1}
        ))
        for ps in remaining:
            print(f"  {ps.get('packing_slip_number')} - Job: {ps.get('job_sheet_number')} - {ps.get('customer_name')}")
    
    print("=" * 80)

if __name__ == '__main__':
    fix_invoiced_packing_slips()
