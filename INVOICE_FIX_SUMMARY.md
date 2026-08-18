# Invoice Creation Bug Fix - Packing Slips Still Showing After Being Invoiced

## Problem
Packing slips that were already invoiced were still appearing in the "Create Invoice from Packing Slips" dialog, even though the frontend had filtering logic `!ps.is_invoiced && ps.status === 'Completed'`.

## Root Cause
**Field Name Mismatch** between backend and frontend:

- **Backend** (invoice_routes.py line 264): Was setting `invoiced: True` 
- **Frontend** (Invoices.js lines 95, 186): Was checking for `is_invoiced`
- **Result**: The filter never worked because the field names didn't match

## Solution

### 1. Standardized Field Name to `is_invoiced`

**Files Modified:**

#### `/app/backend/models.py`
- Changed: `invoiced: bool = False` → `is_invoiced: bool = False`

#### `/app/backend/routes/invoice_routes.py`
- Line 264: `{"invoiced": True}` → `{"is_invoiced": True}`
- Line 276: `ps.get('invoiced', False)` → `ps.get('is_invoiced', False)`

#### `/app/backend/routes/packing_slip_routes.py`
- Line 93: `"invoiced": False` → `"is_invoiced": False`
- Line 113: Parameter `invoiced` → `is_invoiced`
- Line 124: `query["invoiced"]` → `query["is_invoiced"]`
- Line 280: `packing_slip.get("invoiced")` → `packing_slip.get("is_invoiced")`

### 2. Created Migration Script

**File:** `/app/backend/migrate_invoiced_field.py`

This script:
- Renames old `invoiced` field to `is_invoiced` for existing records
- Ensures ALL packing slips have `is_invoiced` field (defaults to `False`)
- Provides verification output

## How to Apply the Fix

### If Running Locally
```bash
cd /app/backend
python migrate_invoiced_field.py
sudo supervisorctl restart backend
```

### If Already Deployed
You may need to:
1. Export your data using the Data Migration page
2. Run the migration script on your local environment
3. Re-import the data, OR
4. Manually run the migration script on the deployed environment

## Expected Behavior After Fix

1. **Creating New Invoices**: 
   - When an invoice is created, all associated packing slips are marked with `is_invoiced: True`
   
2. **Viewing Available Jobs**:
   - Only packing slips with `is_invoiced: False` AND `status: 'Completed'` will appear in the dialog
   - Each unique job sheet number will be listed separately
   
3. **Preventing Duplicates**:
   - Once a packing slip is invoiced, it will never appear in the available jobs list again

## Verification Steps

1. Open the Invoices page
2. Click "Create Invoice" button
3. The dialog should show only uninvoiced, completed packing slips
4. After creating an invoice, those packing slips should disappear from the list
5. Refreshing the page should maintain this behavior

## Notes

- The migration script is safe to run multiple times
- It will not affect invoices that have already been created
- It only updates packing slip records to use the consistent field name
- No data loss will occur
