"""
One-time migration: relink existing Document Control entries to the new
canonical module keys defined in iso_modules_routes.ISO_MODULES.

Run via:  python /app/backend/migrate_doc_control_modules.py
"""

import os
import sys
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'erp_db')

# Mapping rules: (old_related_module_value, form_no_match, new_related_module_value)
# form_no_match='*' matches any form_no. Stricter rules first.
RULES = [
    # JSA — Register stays, Form is the "Job Safety Analysis" QMSF 14 entry
    ('JSA', '*', 'JSA Form'),
    ('JSA Register', '*', 'JSA Register'),
    # NCR family
    ('NCR Register', 'QMSF 03', 'NCR Register'),
    ('Credit Request', '*', 'Credit Request Form'),
    ('NCR Job Sheet', '*', 'NCR Job Sheet (Recut)'),
    # Safety
    ('Evacuation Drills', '*', 'Evacuation Drill Form'),
    ('Forklift Register', '*', 'Forklift License Register'),
    ('First Aid Register', '*', 'First Aid Certificate Register'),
    ('Legal Requirements', '*', 'Legal Requirements Register'),
    ('Plant Hazard Checks', '*', 'Plant Hazard Audit Form'),
    ('Plant Hazard Check', '*', 'Plant Hazard Audit Form'),
    ('Near Miss', '*', 'Near Miss / Hazard Form'),
    ('Injury Register', '*', 'Injury Register'),
    ('Injury Graph', '*', 'Injury Register'),
    ('OHS Meetings', '*', 'OHS Meeting Minutes Form'),
    ('Housekeeping Audit', '*', 'Housekeeping Audit Form'),
    # Quality
    ('Customer Satisfaction', 'QMSF 01', 'Customer Satisfaction Survey Form'),
    ('Customer Satisfaction', 'QMSF 01A', 'Customer Satisfaction Analysis Report'),
    ('Customer Satisfaction', '*', 'Customer Satisfaction Survey Form'),
    ('Customer Satisfaction Analysis Report', '*', 'Customer Satisfaction Analysis Report'),
    ('Employment Application', '*', 'Employment Application Form'),
    ('Supplier Review', '*', 'Supplier Review Form'),
    ('Audit Schedule', '*', 'ISO Audit Schedule'),
    ('ISO Audits', '*', 'ISO Audit Schedule'),
    ('Management Review', '*', 'Management Review Form'),
    # Environment
    ('Environmental Risk Assessment', '*', 'Environmental Risk Assessment Form'),
    # Equipment / HR / Other
    ('Calibration Schedule', '*', 'Calibration Schedule'),
    ('Calibration Records', '*', 'Calibration Records'),
    ('Training Matrix', '*', 'Skills Matrix Register'),
    ('Training Appraisal', '*', 'Training Appraisal Form'),
    ('Leave of Absence', '*', 'Leave of Absence Form'),
    # IMS — Risk & Opportunities (split by form_no)
    ('Risk & Opportunities', 'QMSF 35', 'Risk & Opportunities Register'),
    ('Risk & Opportunities', 'QMSF 36', 'Risk & Opportunity Form'),
]


def find_new_label(current_module: str, form_no: str) -> str | None:
    for (old_mod, fno_match, new_mod) in RULES:
        if old_mod.lower() == (current_module or '').lower():
            if fno_match == '*' or fno_match == (form_no or ''):
                return new_mod
    return None


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    coll = db['document_register']

    docs = await coll.find({}).to_list(length=None)
    print(f"Loaded {len(docs)} document_register entries")

    # Track duplicates: (form_no, related_module)
    seen_keys = set()
    updates = 0
    deletes = 0

    for d in docs:
        rid = d.get('id')
        fno = (d.get('form_no') or '').strip()
        mod = (d.get('related_module') or '').strip()
        new_mod = find_new_label(mod, fno)

        # Choose the canonical module label
        target = new_mod or mod  # keep existing if no rule matched

        # Deduplicate: if we've already seen this exact (form_no, target) combo, drop
        key = (fno, target)
        if key in seen_keys:
            print(f"  - Deleting duplicate id={rid}  form_no={fno!r}  module={target!r}")
            await coll.delete_one({'id': rid})
            deletes += 1
            continue
        seen_keys.add(key)

        if new_mod and new_mod != mod:
            print(f"  ~ Relinking id={rid}  form_no={fno!r}  {mod!r} -> {new_mod!r}")
            await coll.update_one({'id': rid}, {'$set': {'related_module': new_mod}})
            updates += 1

    print(f"\nDone. {updates} relinked, {deletes} duplicates removed.")


if __name__ == '__main__':
    asyncio.run(main())
