from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, date
from typing import Dict, List
import os
import json
import base64

from auth import get_current_user

router = APIRouter(prefix="/api/data-migration", tags=["data-migration"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# Collections never included in backups (ephemeral/system)
EXCLUDED_COLLECTIONS = {'notifications_cron'}


def _require_admin(user: dict):
    if (user or {}).get('role') not in ('Administrator', 'Admin'):
        raise HTTPException(status_code=403, detail="Administrator role required")


def _sanitize(value):
    """Make a Mongo document JSON-safe (datetime -> ISO, bytes -> base64 marker)."""
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return {'__b64__': base64.b64encode(value).decode()}
    return value


def _restore(value):
    if isinstance(value, dict):
        if set(value.keys()) == {'__b64__'}:
            return base64.b64decode(value['__b64__'])
        return {k: _restore(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_restore(v) for v in value]
    return value


@router.get("/export-all")
async def export_all_data(current_user: dict = Depends(get_current_user)):
    """
    Full backup: export EVERY collection in the database (users included, passwords
    stay hashed). Returns JSON that can be imported into another deployment.
    """
    _require_admin(current_user)
    try:
        export_data = {}
        collections = sorted(
            n for n in await db.list_collection_names()
            if n not in EXCLUDED_COLLECTIONS and not n.startswith('system.')
        )

        for collection_name in collections:
            documents = await db[collection_name].find({}, {'_id': 0}).to_list(length=None)
            export_data[collection_name] = [_sanitize(d) for d in documents]

        export_data['_metadata'] = {
            'export_date': datetime.now(timezone.utc).isoformat(),
            'database_name': os.environ.get('DB_NAME', 'test_database'),
            'total_collections': len(collections),
            'format_version': 2,
        }

        return {
            "success": True,
            "export_data": export_data,
            "summary": {
                collection: len(documents)
                for collection, documents in export_data.items()
                if collection != '_metadata'
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {str(e)}"
        )


@router.post("/import-all")
async def import_all_data(import_data: dict, mode: str = "replace",
                          current_user: dict = Depends(get_current_user)):
    """
    Restore a backup into this deployment.
    mode=replace (default): each collection in the file is CLEARED first, then restored — exact copy.
    mode=merge: documents are upserted by their 'id' field (or appended when no id).
    """
    _require_admin(current_user)
    if mode not in ("replace", "merge"):
        raise HTTPException(status_code=400, detail="mode must be 'replace' or 'merge'")
    try:
        if 'export_data' not in import_data:
            raise HTTPException(
                status_code=400,
                detail="Invalid import data format. Expected 'export_data' field."
            )

        data = import_data['export_data']
        import_summary = {}

        for collection_name, documents in data.items():
            if collection_name == '_metadata' or collection_name in EXCLUDED_COLLECTIONS:
                continue

            collection = db[collection_name]
            documents = [_restore(d) for d in (documents or [])]

            try:
                if mode == "replace":
                    await collection.delete_many({})
                    if documents:
                        result = await collection.insert_many(documents)
                        import_summary[collection_name] = len(result.inserted_ids)
                    else:
                        import_summary[collection_name] = 0
                else:  # merge
                    count = 0
                    for doc in documents:
                        if doc.get('id'):
                            await collection.replace_one({'id': doc['id']}, doc, upsert=True)
                        else:
                            await collection.insert_one(doc)
                        count += 1
                    import_summary[collection_name] = count
            except Exception as e:
                import_summary[collection_name] = f"Error: {str(e)}"

        return {
            "success": True,
            "mode": mode,
            "import_summary": import_summary,
            "metadata": data.get('_metadata', {})
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {str(e)}"
        )


@router.get("/export/{collection_name}")
async def export_collection(collection_name: str):
    """
    Export a specific collection
    """
    try:
        collection = db[collection_name]
        documents = await collection.find().to_list(length=None)
        
        # Remove MongoDB _id field
        for doc in documents:
            if '_id' in doc:
                del doc['_id']
        
        return {
            "success": True,
            "collection": collection_name,
            "count": len(documents),
            "data": documents
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {str(e)}"
        )



@router.get("/remove-duplicates")
@router.post("/remove-duplicates")
async def remove_duplicates():
    """
    Remove duplicate entries from all collections based on 'id' field
    Keeps only the first occurrence of each unique id
    """
    try:
        collections_to_dedupe = [
            'customers',
            'quotes',
            'job_sheets',
            'invoices',
            'packing_slips',
            'materials',
            'suppliers',
            'employees',
            'purchase_orders',
            'machines',
            'time_entries'
        ]
        
        dedup_summary = {}
        
        for collection_name in collections_to_dedupe:
            collection = db[collection_name]
            
            # Get all documents
            all_docs = await collection.find().to_list(length=None)
            
            if not all_docs:
                dedup_summary[collection_name] = {"before": 0, "after": 0, "removed": 0}
                continue
            
            before_count = len(all_docs)
            
            # Track seen IDs
            seen_ids = set()
            unique_docs = []
            duplicate_mongo_ids = []
            
            for doc in all_docs:
                doc_id = doc.get('id')  # Our UUID id field
                if doc_id and doc_id not in seen_ids:
                    seen_ids.add(doc_id)
                    unique_docs.append(doc)
                else:
                    # Mark for deletion by MongoDB _id
                    duplicate_mongo_ids.append(doc['_id'])
            
            # Delete duplicates
            if duplicate_mongo_ids:
                await collection.delete_many({'_id': {'$in': duplicate_mongo_ids}})
            
            after_count = len(unique_docs)
            removed = before_count - after_count
            
            dedup_summary[collection_name] = {
                "before": before_count,
                "after": after_count,
                "removed": removed
            }
        
        return {
            "success": True,
            "message": "Duplicates removed successfully",
            "summary": dedup_summary
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Deduplication failed: {str(e)}"
        )


@router.delete("/clear-all-data")
async def clear_all_data(confirm: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    """
    DANGER: Clear all data from database (except users)
    Requires confirm="YES_DELETE_ALL_DATA"
    """
    if confirm != "YES_DELETE_ALL_DATA":
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Set confirm='YES_DELETE_ALL_DATA' to proceed."
        )
    
    try:
        collections_to_clear = [
            'customers',
            'quotes',
            'job_sheets',
            'invoices',
            'packing_slips',
            'materials',
            'suppliers',
            'employees',
            'purchase_orders',
            'machines',
            'time_entries',
            'calibration_records',
            'instruments',
            'electricity_usage',
            'recycled_metal',
            'notifications'
        ]
        
        deletion_summary = {}
        
        for collection_name in collections_to_clear:
            collection = db[collection_name]
            result = await collection.delete_many({})
            deletion_summary[collection_name] = result.deleted_count
        
        return {
            "success": True,
            "message": "All data cleared (users preserved)",
            "deletion_summary": deletion_summary
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Clear failed: {str(e)}"
        )



@router.get("/clear-all-data-get")
async def clear_all_data_get(confirm: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    """
    DANGER: Clear all data from database (except users)
    GET method version for browser access
    Requires confirm="YES_DELETE_ALL_DATA"
    """
    if confirm != "YES_DELETE_ALL_DATA":
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Set confirm='YES_DELETE_ALL_DATA' to proceed."
        )
    
    try:
        collections_to_clear = [
            'customers',
            'quotes',
            'job_sheets',
            'invoices',
            'packing_slips',
            'materials',
            'suppliers',
            'employees',
            'purchase_orders',
            'machines',
            'time_entries',
            'calibration_records',
            'instruments',
            'electricity_usage',
            'recycled_metal',
            'notifications',
            'counters'
        ]
        
        deletion_summary = {}
        
        for collection_name in collections_to_clear:
            collection = db[collection_name]
            result = await collection.delete_many({})
            deletion_summary[collection_name] = result.deleted_count
        
        return {
            "success": True,
            "message": "All data cleared (users preserved)",
            "deletion_summary": deletion_summary
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Clear failed: {str(e)}"
        )



@router.post("/migrate-invoiced-field")
async def migrate_invoiced_field():
    """
    Migrate 'invoiced' field to 'is_invoiced' in packing_slips collection
    This fixes the field name mismatch between backend and frontend
    """
    try:
        collection = db.packing_slips
        
        # Step 1: Rename old 'invoiced' field to 'is_invoiced'
        packing_slips_old = await collection.find({"invoiced": {"$exists": True}}).to_list(length=None)
        renamed_count = 0
        
        for ps in packing_slips_old:
            invoiced_value = ps.get('invoiced', False)
            await collection.update_one(
                {"_id": ps["_id"]},
                {
                    "$set": {"is_invoiced": invoiced_value},
                    "$unset": {"invoiced": ""}
                }
            )
            renamed_count += 1
        
        # Step 2: Ensure ALL packing slips have is_invoiced field (default False)
        packing_slips_without = await collection.find(
            {"is_invoiced": {"$exists": False}}
        ).to_list(length=None)
        
        added_count = 0
        for ps in packing_slips_without:
            await collection.update_one(
                {"_id": ps["_id"]},
                {"$set": {"is_invoiced": False}}
            )
            added_count += 1
        
        # Verification
        total_ps = await collection.count_documents({})
        remaining_old = await collection.count_documents({"invoiced": {"$exists": True}})
        with_new_field = await collection.count_documents({"is_invoiced": {"$exists": True}})
        
        return {
            "success": True,
            "message": "Packing slip field migration completed",
            "summary": {
                "total_packing_slips": total_ps,
                "renamed_from_old_field": renamed_count,
                "added_new_field": added_count,
                "documents_with_old_field": remaining_old,
                "documents_with_new_field": with_new_field
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Migration failed: {str(e)}"
        )



@router.post("/recalculate-material-weights")
async def recalculate_material_weights():
    """
    Recalculate weight_per_sheet for all materials that have 0 or missing weight.
    Uses material density, thickness, width, and length to calculate weight.
    Formula: Weight (kg) = Width (mm) × Length (mm) × Thickness (mm) × Density (g/cm³) ÷ 1,000,000
    """
    try:
        # Material density mapping in g/cm³
        MATERIAL_DENSITIES = {
            'Mild Steel': 7.85,
            'Stainless Steel': 8.00,
            'Aluminium': 2.70,
            'Aluminum': 2.70,
            'Copper': 8.96,
            'Brass': 8.50,
            'Galvanised Steel': 7.85,
            'Galvanized Steel': 7.85,
            'Zincalume': 7.85,
            'Chrome Steel': 7.85,
            'Tool Steel': 7.85,
        }
        
        collection = db.materials
        
        # Find materials with missing or zero weight
        materials_to_update = await collection.find({
            "$or": [
                {"weight_per_sheet": {"$exists": False}},
                {"weight_per_sheet": None},
                {"weight_per_sheet": 0},
                {"weight_per_sheet": 0.0}
            ]
        }).to_list(length=None)
        
        updated_count = 0
        skipped_count = 0
        errors = []
        
        for material in materials_to_update:
            try:
                # Extract required fields
                material_type = material.get('name', '')
                thickness_str = material.get('thickness', '')
                width = material.get('width', 0)
                length = material.get('length', 0)
                
                # Parse thickness from string (e.g., "5mm" -> 5)
                thickness = 0
                if thickness_str:
                    thickness_str = str(thickness_str).lower().replace('mm', '').strip()
                    try:
                        thickness = float(thickness_str)
                    except ValueError:
                        thickness = 0
                
                # Check if we have all required data
                if not material_type or not thickness or not width or not length:
                    skipped_count += 1
                    errors.append({
                        "material_id": material.get('id', 'unknown'),
                        "name": material.get('name', 'unknown'),
                        "reason": "Missing required fields",
                        "data": {
                            "material_type": material_type,
                            "thickness": thickness,
                            "width": width,
                            "length": length
                        }
                    })
                    continue
                
                # Get density (default to mild steel if unknown)
                density = MATERIAL_DENSITIES.get(material_type, 7.85)
                
                # Calculate weight
                # Formula: Weight (kg) = Width (mm) × Length (mm) × Thickness (mm) × Density (g/cm³) ÷ 1,000,000
                weight = (width * length * thickness * density) / 1000000
                weight = round(weight, 2)
                
                # Update material
                await collection.update_one(
                    {"_id": material["_id"]},
                    {"$set": {"weight_per_sheet": weight}}
                )
                
                updated_count += 1
                
            except Exception as e:
                errors.append({
                    "material_id": material.get('id', 'unknown'),
                    "name": material.get('name', 'unknown'),
                    "error": str(e)
                })
                skipped_count += 1
        
        # Get summary
        total_materials = await collection.count_documents({})
        materials_with_weight = await collection.count_documents({
            "weight_per_sheet": {"$gt": 0}
        })
        
        return {
            "success": True,
            "message": f"Material weight recalculation completed",
            "summary": {
                "total_materials": total_materials,
                "materials_with_weight": materials_with_weight,
                "updated": updated_count,
                "skipped": skipped_count,
                "errors": errors if errors else None
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Weight recalculation failed: {str(e)}"
        )
