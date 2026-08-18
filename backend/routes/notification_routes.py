from fastapi import APIRouter, Depends, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional
from pydantic import BaseModel
import os
import uuid

from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]


class Notification(BaseModel):
    id: str
    type: str  # "due_date", "quality_issue", "material_low", "status_change", "efficiency_alert"
    priority: str  # "low", "medium", "high", "critical"
    title: str
    message: str
    link: Optional[str] = None
    read: bool = False
    created_at: str
    user_id: Optional[str] = None  # None = broadcast to all


async def create_notification(
    notification_type: str,
    priority: str,
    title: str,
    message: str,
    link: str = None,
    user_id: str = None
):
    """Create a new notification"""
    notification = {
        "id": str(uuid.uuid4()),
        "type": notification_type,
        "priority": priority,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id
    }
    
    await db.notifications.insert_one(notification)
    return notification


@router.get("/")
async def get_notifications(
    unread_only: bool = False,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for current user"""
    query = {
        "$or": [
            {"user_id": current_user.get("id")},
            {"user_id": None}  # Broadcast notifications
        ]
    }
    
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(query).sort(
        "created_at", -1
    ).limit(limit).to_list(length=None)
    
    # Remove _id for JSON serialization
    for n in notifications:
        if '_id' in n:
            del n['_id']
    
    return notifications


@router.get("/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications (also runs compliance expiry scan throttled to 6h)."""
    await _maybe_run_compliance_scan_throttled()
    count = await db.notifications.count_documents({
        "$or": [
            {"user_id": current_user.get("id")},
            {"user_id": None}
        ],
        "read": False
    })
    
    return {"unread_count": count}


@router.post("/{notification_id}/mark-read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"read": True}}
    )
    
    return {"success": result.modified_count > 0}


@router.post("/mark-all-read")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read for current user"""
    result = await db.notifications.update_many(
        {
            "$or": [
                {"user_id": current_user.get("id")},
                {"user_id": None}
            ],
            "read": False
        },
        {"$set": {"read": True}}
    )
    
    return {"success": True, "marked_read": result.modified_count}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a notification"""
    result = await db.notifications.delete_one({"id": notification_id})
    
    return {"success": result.deleted_count > 0}


def _classify_expiry(expiry_str: Optional[str]) -> str:
    """Classify a YYYY-MM-DD expiry date → 'current' | 'expiring_soon' (<=90d) | 'expired'."""
    if not expiry_str:
        return "current"
    try:
        d = date.fromisoformat(str(expiry_str)[:10])
    except Exception:
        return "current"
    today = date.today()
    if d < today:
        return "expired"
    if d <= today + timedelta(days=90):
        return "expiring_soon"
    return "current"


async def check_compliance_expiry_alerts() -> List[str]:
    """Scan Forklift Licenses + First Aid Certificates and create one-shot
    notifications for any record that is expiring within 90 days or expired.
    Deduped per (record, status) so each status transition fires exactly once.

    Also auto-clears resolved alerts — if the record's expiry now classifies as
    'current' (renewed) or the record was deleted, any prior compliance_expiry
    notification linked to it is removed from the bell."""
    created: List[str] = []
    today = date.today()

    # ---- AUTO-CLEAR: remove stale compliance_expiry notifications ----
    stale = await db.notifications.find({"type": "compliance_expiry"}, {"_id": 0, "id": 1, "link": 1}).to_list(length=5000)
    for n in stale:
        link = n.get("link") or ""
        try:
            path, ref = link.split("#", 1)
            rec_id, _, intended_status = ref.partition("::")
        except ValueError:
            continue
        current_status = None
        if path == "/safety/forklift-register":
            lic = await db.forklift_licenses.find_one({"id": rec_id}, {"_id": 0, "expiry_date": 1})
            if lic:
                current_status = _classify_expiry(lic.get("expiry_date"))
        elif path == "/safety/first-aid-register":
            rec = await db.first_aid_certificates.find_one({"id": rec_id}, {"_id": 0, "certificates": 1})
            if rec:
                certs = rec.get("certificates") or []
                if certs:
                    latest = max(certs, key=lambda c: (c.get("expiry_date") or ""))
                    current_status = _classify_expiry(latest.get("expiry_date"))
        # Delete if record gone OR status no longer matches the alert
        if current_status is None or current_status != intended_status:
            await db.notifications.delete_one({"id": n.get("id")})

    # ---- Forklift Licenses ----
    forklifts = await db.forklift_licenses.find({}, {"_id": 0}).to_list(length=10000)
    for lic in forklifts:
        status = _classify_expiry(lic.get("expiry_date"))
        if status == "current":
            continue
        link = f"/safety/forklift-register#{lic.get('id')}::{status}"
        if await db.notifications.find_one({"link": link}):
            continue
        name = lic.get("name") or lic.get("employee_name") or f"Employee {lic.get('employee_id', '')}"
        exp = lic.get("expiry_date") or "—"
        if status == "expired":
            try:
                days_ago = (today - date.fromisoformat(str(exp)[:10])).days
            except Exception:
                days_ago = 0
            title = "Forklift Licence EXPIRED"
            msg = f"{name}'s Forklift Licence expired {days_ago} day(s) ago ({exp})."
            priority = "critical"
        else:
            try:
                days_left = (date.fromisoformat(str(exp)[:10]) - today).days
            except Exception:
                days_left = 0
            title = "Forklift Licence expiring soon"
            msg = f"{name}'s Forklift Licence expires in {days_left} day(s) ({exp})."
            priority = "high" if days_left <= 30 else "medium"
        await create_notification(
            notification_type="compliance_expiry",
            priority=priority,
            title=title,
            message=msg,
            link=link,
        )
        created.append(link)

    # ---- First Aid Certificates ----
    first_aid = await db.first_aid_certificates.find({}, {"_id": 0}).to_list(length=10000)
    for rec in first_aid:
        certs = rec.get("certificates") or []
        # Use latest cert (max expiry_date)
        if not certs:
            continue
        latest = max(certs, key=lambda c: (c.get("expiry_date") or ""))
        status = _classify_expiry(latest.get("expiry_date"))
        if status == "current":
            continue
        link = f"/safety/first-aid-register#{rec.get('id')}::{status}"
        if await db.notifications.find_one({"link": link}):
            continue
        name = rec.get("name") or rec.get("employee_name") or f"Employee {rec.get('employee_id', '')}"
        exp = latest.get("expiry_date") or "—"
        codes = ", ".join(latest.get("attainments") or latest.get("attainment_codes") or []) or "First Aid"
        if status == "expired":
            try:
                days_ago = (today - date.fromisoformat(str(exp)[:10])).days
            except Exception:
                days_ago = 0
            title = "First Aid Certificate EXPIRED"
            msg = f"{name}'s First Aid Certificate ({codes}) expired {days_ago} day(s) ago ({exp})."
            priority = "critical"
        else:
            try:
                days_left = (date.fromisoformat(str(exp)[:10]) - today).days
            except Exception:
                days_left = 0
            title = "First Aid Certificate expiring soon"
            msg = f"{name}'s First Aid Certificate ({codes}) expires in {days_left} day(s) ({exp})."
            priority = "high" if days_left <= 30 else "medium"
        await create_notification(
            notification_type="compliance_expiry",
            priority=priority,
            title=title,
            message=msg,
            link=link,
        )
        created.append(link)

    return created


async def check_phc_review_alerts() -> List[str]:
    """Create notifications for Plant Hazard Checks whose Next Review Date is
    within 30 days, or already overdue. Deduped per (record, status). Also
    auto-clears alerts when a record is reviewed (Next Review Date pushed out)
    or the record is deleted."""
    created: List[str] = []
    today = date.today()
    soon = today + timedelta(days=30)

    # ---- AUTO-CLEAR ----
    stale = await db.notifications.find({"type": "phc_review"}, {"_id": 0, "id": 1, "link": 1}).to_list(length=5000)
    for n in stale:
        link = n.get("link") or ""
        try:
            _, ref = link.split("#", 1)
            rec_id, _, intended_status = ref.partition("::")
        except ValueError:
            continue
        rec = await db.plant_hazard_checks.find_one({"id": rec_id}, {"_id": 0, "next_review_date": 1})
        current_status = None
        if rec and rec.get("next_review_date"):
            try:
                d = date.fromisoformat(str(rec["next_review_date"])[:10])
                if d < today:
                    current_status = "overdue"
                elif d <= soon:
                    current_status = "due_soon"
                else:
                    current_status = "current"
            except Exception:
                pass
        if current_status is None or current_status == "current" or current_status != intended_status:
            await db.notifications.delete_one({"id": n.get("id")})
    records = await db.plant_hazard_checks.find({}, {"_id": 0, "id": 1, "phc_no": 1, "machine_name": 1, "next_review_date": 1}).to_list(length=5000)
    for rec in records:
        nrd = rec.get("next_review_date")
        if not nrd:
            continue
        try:
            d = date.fromisoformat(str(nrd)[:10])
        except Exception:
            continue
        if d > soon:
            continue
        status = "overdue" if d < today else "due_soon"
        link = f"/safety/plant-hazard-checks#{rec.get('id')}::{status}"
        if await db.notifications.find_one({"link": link}):
            continue
        ref_no = f"PHC-{str(rec.get('phc_no')).zfill(2)}"
        machine = rec.get("machine_name") or "Unknown machine"
        if status == "overdue":
            days_ago = (today - d).days
            title = "Plant Hazard Check OVERDUE for review"
            msg = f"{ref_no} ({machine}) was due for review {days_ago} day(s) ago ({nrd})."
            priority = "critical"
        else:
            days_left = (d - today).days
            title = "Plant Hazard Check review due soon"
            msg = f"{ref_no} ({machine}) is due for review in {days_left} day(s) ({nrd})."
            priority = "high" if days_left <= 7 else "medium"
        await create_notification(
            notification_type="phc_review", priority=priority,
            title=title, message=msg, link=link,
        )
        created.append(link)
    return created


async def check_birthday_alerts() -> List[str]:
    """Create a notification once per employee per year on their birthday.
    Auto-clears yesterday's birthday alerts once the day rolls past."""
    created: List[str] = []
    today = date.today()
    mmdd = f"{today.month:02d}-{today.day:02d}"

    # ---- AUTO-CLEAR: any birthday notification not for today ----
    stale = await db.notifications.find({"type": "birthday"}, {"_id": 0, "id": 1, "link": 1}).to_list(length=5000)
    for n in stale:
        link = n.get("link") or ""
        try:
            _, ref = link.split("#", 1)
            emp_id, _, rest = ref.partition("::")
            # rest = "birthday::<year>"
        except ValueError:
            continue
        emp = await db.employees.find_one({"id": emp_id}, {"_id": 0, "date_of_birth": 1, "status": 1})
        keep = False
        if emp and emp.get("status") != "Terminated" and emp.get("date_of_birth"):
            try:
                d = date.fromisoformat(str(emp["date_of_birth"])[:10])
                if f"{d.month:02d}-{d.day:02d}" == mmdd and f"birthday::{today.year}" == rest:
                    keep = True
            except Exception:
                pass
        if not keep:
            await db.notifications.delete_one({"id": n.get("id")})

    employees = await db.employees.find({}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "date_of_birth": 1, "status": 1}).to_list(length=10000)
    for emp in employees:
        if emp.get("status") == "Terminated":
            continue
        dob = emp.get("date_of_birth")
        if not dob:
            continue
        try:
            d = date.fromisoformat(str(dob)[:10])
        except Exception:
            continue
        if f"{d.month:02d}-{d.day:02d}" != mmdd:
            continue
        link = f"/employees#{emp.get('id')}::birthday::{today.year}"
        if await db.notifications.find_one({"link": link}):
            continue
        name = f"{(emp.get('first_name') or '').strip()} {(emp.get('last_name') or '').strip()}".strip() or "Team member"
        try:
            age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
            age_txt = f" — turning {age}" if age and age > 0 else ""
        except Exception:
            age_txt = ""
        await create_notification(
            notification_type="birthday",
            priority="low",
            title="🎂 Birthday today!",
            message=f"{name}'s birthday is today{age_txt}. Wish them well.",
            link=link,
        )
        created.append(link)
    return created


async def _maybe_run_compliance_scan_throttled() -> int:
    """Run the compliance scan at most once every 6 hours (cheap server-side)."""
    now = datetime.now(timezone.utc)
    cron = await db.notifications_cron.find_one({"_id": "compliance_expiry"})
    if cron:
        try:
            last = datetime.fromisoformat(cron.get("last_run"))
            if (now - last).total_seconds() < 6 * 3600:
                return 0
        except Exception:
            pass
    try:
        created = await check_compliance_expiry_alerts()
    except Exception:
        created = []
    try:
        bday = await check_birthday_alerts()
    except Exception:
        bday = []
    try:
        phc = await check_phc_review_alerts()
    except Exception:
        phc = []
    await db.notifications_cron.update_one(
        {"_id": "compliance_expiry"},
        {"$set": {"last_run": now.isoformat()}},
        upsert=True,
    )
    return len(created) + len(bday) + len(phc)


@router.post("/check-alerts")
async def check_and_create_alerts(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Check for various conditions and create alerts"""
    
    alerts_created = []
    
    # 1. Check for jobs nearing due date (24hr and 48hr warnings)
    now = datetime.now(timezone.utc)
    tomorrow = now + timedelta(hours=24)
    day_after = now + timedelta(hours=48)
    
    # 24hr warning
    jobs_due_24hr = await db.job_sheets.find({
        "status": {"$in": ["Pending", "In Progress"]},
        "due_date": {
            "$gte": now.isoformat(),
            "$lte": tomorrow.isoformat()
        }
    }).to_list(length=None)
    
    for job in jobs_due_24hr:
        # Check if alert already exists
        existing = await db.notifications.find_one({
            "type": "due_date",
            "link": f"/jobsheets#{job.get('id')}"
        })
        
        if not existing:
            await create_notification(
                notification_type="due_date",
                priority="high",
                title=f"⚠️ Job Due in 24 Hours",
                message=f"{job.get('job_sheet_number')} for {job.get('customer_name')} is due tomorrow",
                link=f"/jobsheets#{job.get('id')}"
            )
            alerts_created.append(f"24hr warning: {job.get('job_sheet_number')}")
    
    # 48hr warning
    jobs_due_48hr = await db.job_sheets.find({
        "status": {"$in": ["Pending", "In Progress"]},
        "due_date": {
            "$gte": tomorrow.isoformat(),
            "$lte": day_after.isoformat()
        }
    }).to_list(length=None)
    
    for job in jobs_due_48hr:
        existing = await db.notifications.find_one({
            "type": "due_date",
            "link": f"/jobsheets#{job.get('id')}"
        })
        
        if not existing:
            await create_notification(
                notification_type="due_date",
                priority="medium",
                title=f"📅 Job Due in 48 Hours",
                message=f"{job.get('job_sheet_number')} for {job.get('customer_name')} is due in 2 days",
                link=f"/jobsheets#{job.get('id')}"
            )
            alerts_created.append(f"48hr warning: {job.get('job_sheet_number')}")
    
    # 2. Check for quality/machine issues from shop floor notes
    recent_entries = await db.time_entries.find({
        "notes": {"$exists": True, "$ne": []},
        "created_at": {"$gte": (now - timedelta(hours=1)).isoformat()}
    }).to_list(length=None)
    
    for entry in recent_entries:
        notes = entry.get("notes", [])
        for note in notes:
            if note.get("category") in ["quality_issues", "machine_problems"]:
                await create_notification(
                    notification_type="quality_issue",
                    priority="high",
                    title=f"🔧 {note.get('category').replace('_', ' ').title()} Reported",
                    message=f"{entry.get('job_sheet_number')}: {note.get('note')[:100]}",
                    link=f"/shop-floor"
                )
                alerts_created.append(f"Issue alert: {entry.get('job_sheet_number')}")
    
    # 3. Check for low material (optional - if you want to implement)
    # This would require material tracking threshold settings
    
    # 4. Check for efficiency alerts (jobs running significantly behind)
    inefficient_jobs = await db.job_sheets.find({
        "status": "In Progress",
        "efficiency_percent": {"$lt": 70}  # Less than 70% efficient
    }).to_list(length=None)
    
    for job in inefficient_jobs:
        existing = await db.notifications.find_one({
            "type": "efficiency_alert",
            "link": f"/jobsheets#{job.get('id')}"
        })
        
        if not existing:
            await create_notification(
                notification_type="efficiency_alert",
                priority="medium",
                title=f"⏱️ Job Running Behind Schedule",
                message=f"{job.get('job_sheet_number')}: {job.get('efficiency_percent')}% efficient - significantly over estimated time",
                link=f"/jobsheets#{job.get('id')}"
            )
            alerts_created.append(f"Efficiency alert: {job.get('job_sheet_number')}")
    
    # 5. Check compliance certificate expiries (Forklift / First Aid)
    expiry_alerts = await check_compliance_expiry_alerts()
    for a in expiry_alerts:
        alerts_created.append(f"Compliance expiry: {a}")

    # 6. Check employee birthdays
    bday_alerts = await check_birthday_alerts()
    for a in bday_alerts:
        alerts_created.append(f"Birthday: {a}")

    # 7. Check Plant Hazard Check reviews due / overdue
    phc_alerts = await check_phc_review_alerts()
    for a in phc_alerts:
        alerts_created.append(f"PHC review: {a}")
    
    return {
        "success": True,
        "alerts_created": len(alerts_created),
        "details": alerts_created
    }
