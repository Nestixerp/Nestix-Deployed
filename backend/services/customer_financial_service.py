"""
Customer Financial Monitoring Service
Calculates spend, outstanding balance, and monitors credit limits
"""
from datetime import datetime, timezone
from typing import Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

async def calculate_customer_financials(db: AsyncIOMotorDatabase, customer_id: str) -> Dict:
    """
    Calculate all financial metrics for a customer
    Returns: {
        'this_month_spend': float,
        'ytd_spend': float,
        'outstanding_balance': float,
        'credit_limit': float,
        'credit_utilization': float,
        'is_over_limit': bool,
        'total_invoices': int,
        'paid_invoices': int,
        'unpaid_invoices': int
    }
    """
    current_date = datetime.now(timezone.utc)
    current_year = current_date.year
    current_month = current_date.month
    
    # Get customer to fetch credit limit
    customer = await db.customers.find_one({"id": customer_id})
    credit_limit = customer.get("credit_limit", 0) if customer else 0
    
    # Calculate this month's spend (from invoices)
    this_month_start = datetime(current_year, current_month, 1, tzinfo=timezone.utc)
    this_month_pipeline = [
        {
            "$match": {
                "customer_id": customer_id,
                "invoice_date": {"$gte": this_month_start.isoformat()}
            }
        },
        {
            "$group": {
                "_id": None,
                "total": {"$sum": {"$ifNull": ["$total", "$total_inc_gst"]}}
            }
        }
    ]
    this_month_result = await db.invoices.aggregate(this_month_pipeline).to_list(length=None)
    this_month_spend = this_month_result[0]["total"] if this_month_result else 0.0
    
    # Calculate YTD spend
    ytd_start = datetime(current_year, 1, 1, tzinfo=timezone.utc)
    ytd_pipeline = [
        {
            "$match": {
                "customer_id": customer_id,
                "invoice_date": {"$gte": ytd_start.isoformat()}
            }
        },
        {
            "$group": {
                "_id": None,
                "total": {"$sum": {"$ifNull": ["$total", "$total_inc_gst"]}}
            }
        }
    ]
    ytd_result = await db.invoices.aggregate(ytd_pipeline).to_list(length=None)
    ytd_spend = ytd_result[0]["total"] if ytd_result else 0.0
    
    # Calculate outstanding balance (unpaid/partial invoices)
    outstanding_pipeline = [
        {
            "$match": {
                "customer_id": customer_id,
                "status": {"$in": ["Sent", "Unpaid", "Partial"]}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_due": {"$sum": {"$ifNull": ["$total", "$total_inc_gst"]}},
                "total_paid": {"$sum": {"$ifNull": ["$amount_paid", 0]}}
            }
        }
    ]
    outstanding_result = await db.invoices.aggregate(outstanding_pipeline).to_list(length=None)
    
    if outstanding_result:
        total_due = outstanding_result[0]["total_due"]
        total_paid = outstanding_result[0]["total_paid"]
        outstanding_balance = total_due - total_paid
    else:
        outstanding_balance = 0.0
    
    # Invoice counts
    total_invoices = await db.invoices.count_documents({"customer_id": customer_id})
    paid_invoices = await db.invoices.count_documents({"customer_id": customer_id, "status": "Paid"})
    unpaid_invoices = await db.invoices.count_documents({"customer_id": customer_id, "status": {"$in": ["Sent", "Unpaid", "Partial"]}})
    
    # Calculate credit utilization percentage
    credit_utilization = (outstanding_balance / credit_limit * 100) if credit_limit > 0 else 0
    is_over_limit = outstanding_balance > credit_limit if credit_limit > 0 else False
    
    return {
        "this_month_spend": round(this_month_spend, 2),
        "ytd_spend": round(ytd_spend, 2),
        "outstanding_balance": round(outstanding_balance, 2),
        "credit_limit": round(credit_limit, 2),
        "credit_utilization": round(credit_utilization, 2),
        "is_over_limit": is_over_limit,
        "total_invoices": total_invoices,
        "paid_invoices": paid_invoices,
        "unpaid_invoices": unpaid_invoices
    }


async def get_customer_monthly_spend_history(db: AsyncIOMotorDatabase, customer_id: str, months: int = 12) -> List[Dict]:
    """
    Get monthly spend history for the last N months
    Returns: [{'month': 'Jan 2025', 'spend': 1500.00}, ...]
    """
    current_date = datetime.now(timezone.utc)
    
    # Calculate start date (N months ago)
    year = current_date.year
    month = current_date.month - months
    if month <= 0:
        year -= 1
        month += 12
    
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    
    pipeline = [
        {
            "$match": {
                "customer_id": customer_id,
                "invoice_date": {"$gte": start_date.isoformat()}
            }
        },
        {
            "$addFields": {
                "invoice_date_obj": {"$toDate": "$invoice_date"}
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$invoice_date_obj"},
                    "month": {"$month": "$invoice_date_obj"}
                },
                "total_spend": {"$sum": {"$ifNull": ["$total", "$total_inc_gst"]}}
            }
        },
        {
            "$sort": {"_id.year": 1, "_id.month": 1}
        }
    ]
    
    results = await db.invoices.aggregate(pipeline).to_list(length=None)
    
    # Format results
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    formatted = []
    
    for item in results:
        month_name = month_names[item["_id"]["month"] - 1]
        year = item["_id"]["year"]
        formatted.append({
            "month": f"{month_name} {year}",
            "year": year,
            "month_num": item["_id"]["month"],
            "spend": round(item["total_spend"], 2)
        })
    
    return formatted


async def get_customer_payment_history(db: AsyncIOMotorDatabase, customer_id: str, limit: int = 20) -> List[Dict]:
    """
    Get recent payment history for a customer
    Returns: List of invoices with payment information
    """
    invoices = await db.invoices.find(
        {"customer_id": customer_id},
        {"_id": 0}
    ).sort("invoice_date", -1).limit(limit).to_list(length=limit)
    
    return invoices


async def check_credit_limit_breach(db: AsyncIOMotorDatabase, customer_id: str) -> Dict:
    """
    Check if customer has breached credit limit
    Returns alert information
    """
    financials = await calculate_customer_financials(db, customer_id)
    
    alert_level = "none"
    if financials["credit_limit"] > 0:
        utilization = financials["credit_utilization"]
        if utilization >= 100:
            alert_level = "critical"
        elif utilization >= 90:
            alert_level = "high"
        elif utilization >= 70:
            alert_level = "warning"
    
    return {
        "customer_id": customer_id,
        "alert_level": alert_level,
        "outstanding": financials["outstanding_balance"],
        "credit_limit": financials["credit_limit"],
        "utilization": financials["credit_utilization"],
        "is_over_limit": financials["is_over_limit"]
    }
