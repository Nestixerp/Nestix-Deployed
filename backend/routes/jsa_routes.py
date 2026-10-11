"""
JSA (Job Safety Analysis) Routes
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from models import JSA, JSACreate, JSAUpdate, JSAReviewRequest, JSAHazardRow
from auth import get_current_user, check_module_access
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api", tags=["JSA"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


# Risk Matrix Calculation
RISK_MATRIX = {
    # Consequence -> Likelihood -> Score
    1: {'A': 4, 'B': 4, 'C': 3, 'D': 2, 'E': 1},  # Negligible
    2: {'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1},  # Minor
    3: {'A': 6, 'B': 5, 'C': 4, 'D': 3, 'E': 2},  # Major
    4: {'A': 6, 'B': 6, 'C': 5, 'D': 4, 'E': 3},  # Critical
    5: {'A': 6, 'B': 6, 'C': 6, 'D': 5, 'E': 3},  # Catastrophic
}

RISK_LABELS = {
    6: "High Risk",
    5: "Medium Risk",
    4: "Medium Risk",
    3: "Low Risk",
    2: "Low Risk",
    1: "Low Risk"
}

def calculate_risk_level(consequence: int, likelihood: str) -> str:
    """Calculate risk level from consequence and likelihood"""
    score = RISK_MATRIX.get(consequence, {}).get(likelihood, 1)
    label = RISK_LABELS.get(score, "Low Risk")
    
    # Return format like "Medium-4" or "High Risk"
    if "High" in label:
        return "High Risk"
    elif "Medium" in label:
        return f"Medium-{score}"
    else:
        return f"Low-{score}"


async def get_next_jsa_number():
    """Generate next JSA number in sequence (JSA-001, JSA-002, etc.)"""
    last_jsa = await db.jsas.find_one(
        sort=[("jsa_number", -1)]
    )
    
    if last_jsa and last_jsa.get('jsa_number'):
        try:
            last_num = int(last_jsa['jsa_number'].split('-')[1])
            next_num = last_num + 1
        except Exception:
            next_num = 1
    else:
        next_num = 1
    
    return f"JSA-{next_num:03d}"


@router.post("/jsas", response_model=JSA)
async def create_jsa(
    jsa_data: JSACreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new JSA"""
    # Check permissions (Administrator or Quality Manager)
    if current_user.get('role') not in ['Administrator', 'Quality Manager']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrator or Quality Manager can create JSAs"
        )
    
    # Generate JSA number
    jsa_number = await get_next_jsa_number()
    
    # Calculate risk levels for each hazard row
    hazard_rows = []
    for row in jsa_data.hazard_rows:
        risk_level = calculate_risk_level(row.risk_consequence, row.risk_likelihood)
        hazard_rows.append(JSAHazardRow(
            **row.dict(),
            risk_level=risk_level
        ))
    
    # Create JSA
    jsa = JSA(
        jsa_number=jsa_number,
        works_location=jsa_data.works_location,
        machine_process=jsa_data.machine_process,
        activity_description=jsa_data.activity_description,
        hazard_rows=hazard_rows,
        created_by=current_user.get('username'),
        approval_status="Draft"
    )
    
    # Insert into database
    jsa_dict = jsa.dict()
    jsa_dict['date_created'] = jsa_dict['date_created'].isoformat()
    jsa_dict['created_at'] = jsa_dict['created_at'].isoformat()
    jsa_dict['updated_at'] = jsa_dict['updated_at'].isoformat()
    
    await db.jsas.insert_one(jsa_dict)
    
    return jsa


@router.get("/jsas", response_model=List[JSA])
async def get_jsas(
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    needs_review: Optional[bool] = None
):
    """Get all JSAs with optional filters"""
    query = {}
    
    if status:
        query["approval_status"] = status
    
    if needs_review:
        # JSAs that need review (12 months passed)
        twelve_months_ago = datetime.now(timezone.utc) - timedelta(days=365)
        query["$or"] = [
            {"last_reviewed_date": {"$lt": twelve_months_ago.isoformat()}},
            {"last_reviewed_date": None}
        ]
    
    jsas = await db.jsas.find(query, {"_id": 0}).sort("jsa_number", 1).to_list(length=None)
    
    # Parse datetime fields
    for jsa in jsas:
        for field in ['date_created', 'approved_date', 'last_reviewed_date', 'next_review_date', 'created_at', 'updated_at']:
            if field in jsa and jsa[field]:
                try:
                    jsa[field] = datetime.fromisoformat(jsa[field])
                except Exception:
                    pass
    
    return jsas


@router.get("/jsas/{jsa_id}", response_model=JSA)
async def get_jsa(
    jsa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single JSA by ID"""
    jsa = await db.jsas.find_one({"id": jsa_id}, {"_id": 0})
    
    if not jsa:
        raise HTTPException(status_code=404, detail="JSA not found")
    
    # Parse datetime fields
    for field in ['date_created', 'approved_date', 'last_reviewed_date', 'next_review_date', 'created_at', 'updated_at']:
        if field in jsa and jsa[field]:
            try:
                jsa[field] = datetime.fromisoformat(jsa[field])
            except Exception:
                pass
    
    return jsa


@router.put("/jsas/{jsa_id}", response_model=JSA)
async def update_jsa(
    jsa_id: str,
    jsa_update: JSAUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update JSA"""
    # Check permissions
    if current_user.get('role') not in ['Administrator', 'Quality Manager']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrator or Quality Manager can update JSAs"
        )
    
    # Get existing JSA
    existing_jsa = await db.jsas.find_one({"id": jsa_id})
    if not existing_jsa:
        raise HTTPException(status_code=404, detail="JSA not found")
    
    # Prepare update data
    update_data = {k: v for k, v in jsa_update.dict(exclude_unset=True).items() if v is not None}
    
    # Recalculate risk levels if hazard_rows updated
    if 'hazard_rows' in update_data and update_data['hazard_rows']:
        hazard_rows = []
        for row in update_data['hazard_rows']:
            risk_level = calculate_risk_level(row['risk_consequence'], row['risk_likelihood'])
            row['risk_level'] = risk_level
            hazard_rows.append(row)
        update_data['hazard_rows'] = hazard_rows
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.jsas.update_one(
        {"id": jsa_id},
        {"$set": update_data}
    )
    
    # Return updated JSA
    return await get_jsa(jsa_id, current_user)


@router.post("/jsas/{jsa_id}/approve")
async def approve_jsa(
    jsa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve JSA (Administrator or Quality Manager only)"""
    if current_user.get('role') not in ['Administrator', 'Quality Manager']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrator or Quality Manager can approve JSAs"
        )
    
    jsa = await db.jsas.find_one({"id": jsa_id})
    if not jsa:
        raise HTTPException(status_code=404, detail="JSA not found")
    
    # Update approval fields
    await db.jsas.update_one(
        {"id": jsa_id},
        {"$set": {
            "approval_status": "Approved",
            "approved_by": current_user.get('username'),
            "approved_by_name": current_user.get('full_name') or current_user.get('username'),
            "approved_date": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "JSA approved successfully"}


@router.post("/jsas/{jsa_id}/review")
async def review_jsa(
    jsa_id: str,
    review_data: JSAReviewRequest,
    current_user: dict = Depends(get_current_user)
):
    """Mark JSA as reviewed (sets review date and next review date)"""
    if current_user.get('role') not in ['Administrator', 'Quality Manager']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrator or Quality Manager can review JSAs"
        )
    
    jsa = await db.jsas.find_one({"id": jsa_id})
    if not jsa:
        raise HTTPException(status_code=404, detail="JSA not found")
    
    now = datetime.now(timezone.utc)
    next_review = now + timedelta(days=365)  # 12 months
    
    # Add to review history
    review_entry = {
        "reviewed_by": current_user.get('username'),
        "reviewed_by_name": current_user.get('full_name') or current_user.get('username'),
        "reviewed_date": now.isoformat(),
        "notes": review_data.notes or ""
    }
    
    await db.jsas.update_one(
        {"id": jsa_id},
        {
            "$set": {
                "last_reviewed_date": now.isoformat(),
                "next_review_date": next_review.isoformat()
            },
            "$push": {
                "review_history": review_entry
            }
        }
    )
    
    return {
        "success": True,
        "message": "JSA marked as reviewed",
        "reviewed_date": now.isoformat(),
        "next_review_date": next_review.isoformat()
    }


@router.delete("/jsas/{jsa_id}")
async def delete_jsa(
    jsa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete JSA (Administrator only)"""
    if current_user.get('role') != 'Administrator':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrator can delete JSAs"
        )
    
    result = await db.jsas.delete_one({"id": jsa_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="JSA not found")
    
    return {"success": True, "message": "JSA deleted successfully"}
