"""
Customer Financial Monitoring Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from auth import get_current_user
from models import User
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from services.customer_financial_service import (
    calculate_customer_financials,
    get_customer_monthly_spend_history,
    get_customer_payment_history,
    check_credit_limit_breach
)

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

router = APIRouter(prefix="/api", tags=["Customer Financial"])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


# Aggregate endpoints first (more specific routes)
@router.get("/customers/all-financials")
async def get_all_customers_financials(
    current_user: User = Depends(get_current_user)
):
    """Get financial summary for all customers (for table display)"""
    customers = await db.customers.find({}, {"_id": 0}).to_list(length=None)
    
    results = []
    for customer in customers:
        financials = await calculate_customer_financials(db, customer["id"])
        results.append({
            "id": customer["id"],
            "company_name": customer.get("company_name", ""),
            "credit_limit": financials["credit_limit"],
            "outstanding_balance": financials["outstanding_balance"],
            "this_month_spend": financials["this_month_spend"],
            "ytd_spend": financials["ytd_spend"],
            "credit_utilization": financials["credit_utilization"],
            "is_over_limit": financials["is_over_limit"],
            "payment_terms": customer.get("payment_terms", ""),
            "status": customer.get("status", "Active")
        })
    
    return results


@router.get("/customers/credit-alerts")
async def get_all_credit_alerts(
    current_user: User = Depends(get_current_user)
):
    """Get all customers with credit limit warnings"""
    customers = await db.customers.find({}, {"_id": 0, "id": 1, "company_name": 1}).to_list(length=None)
    
    alerts = []
    for customer in customers:
        alert = await check_credit_limit_breach(db, customer["id"])
        if alert["alert_level"] != "none":
            alert["company_name"] = customer.get("company_name", "")
            alerts.append(alert)
    
    # Sort by severity
    severity_order = {"critical": 0, "high": 1, "warning": 2}
    alerts.sort(key=lambda x: severity_order.get(x["alert_level"], 3))
    
    return alerts


# Individual customer endpoints (parameterized routes)
@router.get("/customers/{customer_id}/financials")
async def get_customer_financials(
    customer_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all financial metrics for a customer"""
    financials = await calculate_customer_financials(db, customer_id)
    return financials


@router.get("/customers/{customer_id}/spend-history")
async def get_spend_history(
    customer_id: str,
    months: int = 12,
    current_user: User = Depends(get_current_user)
):
    """Get monthly spend history for a customer"""
    history = await get_customer_monthly_spend_history(db, customer_id, months)
    return {"customer_id": customer_id, "history": history}


@router.get("/customers/{customer_id}/payment-history")
async def get_payment_history(
    customer_id: str,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Get payment history for a customer"""
    history = await get_customer_payment_history(db, customer_id, limit)
    return {"customer_id": customer_id, "payments": history}


@router.get("/customers/{customer_id}/credit-alert")
async def get_credit_alert(
    customer_id: str,
    current_user: User = Depends(get_current_user)
):
    """Check credit limit status"""
    alert = await check_credit_limit_breach(db, customer_id)
    return alert
