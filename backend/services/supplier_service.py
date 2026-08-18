"""
Supplier Service - Handles supplier performance calculations and metrics
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from motor.motor_asyncio import AsyncIOMotorDatabase

class SupplierService:
    """Service for supplier performance calculations and updates"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def calculate_on_time_delivery(self, supplier_id: str) -> float:
        """
        Calculate on-time delivery percentage for a supplier
        Formula: (POs On Time ÷ POs Received) × 100
        """
        # Get all received POs for this supplier
        pos = await self.db.purchase_orders.find({
            "supplier_id": supplier_id,
            "status": {"$in": ["Received", "Partial"]}
        }).to_list(1000)
        
        if not pos:
            return 0.0
        
        # Count on-time deliveries
        on_time_count = 0
        for po in pos:
            if po.get("days_late") is not None and po["days_late"] <= 0:
                on_time_count += 1
        
        percentage = (on_time_count / len(pos)) * 100
        return round(percentage, 1)
    
    async def calculate_average_days_late(self, supplier_id: str) -> float:
        """
        Calculate average days late for a supplier
        Only counts late deliveries (days_late > 0)
        """
        pos = await self.db.purchase_orders.find({
            "supplier_id": supplier_id,
            "status": {"$in": ["Received", "Partial"]},
            "days_late": {"$gt": 0}
        }).to_list(1000)
        
        if not pos:
            return 0.0
        
        total_days_late = sum(po["days_late"] for po in pos)
        average = total_days_late / len(pos)
        return round(average, 1)
    
    async def get_performance_rating(self, on_time_delivery: float) -> str:
        """
        Calculate performance rating based on on-time delivery %
        - >= 95% → "Excellent"
        - >= 85% → "Good"
        - >= 70% → "Needs Improvement"
        - < 70% → "Poor"
        """
        if on_time_delivery >= 95:
            return "Excellent"
        elif on_time_delivery >= 85:
            return "Good"
        elif on_time_delivery >= 70:
            return "Needs Improvement"
        else:
            return "Poor"
    
    async def calculate_fy_spend(self, supplier_id: str) -> float:
        """
        Calculate financial year spend for a supplier
        Assumes Australian FY: July 1 - June 30
        """
        now = datetime.utcnow()
        
        # Determine current FY dates
        if now.month >= 7:  # July onwards
            fy_start = datetime(now.year, 7, 1)
            fy_end = datetime(now.year + 1, 6, 30, 23, 59, 59)
        else:  # Jan-June
            fy_start = datetime(now.year - 1, 7, 1)
            fy_end = datetime(now.year, 6, 30, 23, 59, 59)
        
        # Sum all invoices in current FY
        pipeline = [
            {
                "$match": {
                    "supplier_id": supplier_id,
                    "invoice_date": {"$gte": fy_start, "$lte": fy_end}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$total_amount"}
                }
            }
        ]
        
        result = await self.db.invoices.aggregate(pipeline).to_list(1)
        
        if result:
            return round(result[0]["total"], 2)
        return 0.0
    
    async def calculate_lifetime_spend(self, supplier_id: str) -> float:
        """Calculate total lifetime spend with a supplier"""
        pipeline = [
            {
                "$match": {"supplier_id": supplier_id}
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$total_amount"}
                }
            }
        ]
        
        result = await self.db.invoices.aggregate(pipeline).to_list(1)
        
        if result:
            return round(result[0]["total"], 2)
        return 0.0
    
    async def get_ncr_counts(self, supplier_id: str) -> Dict[str, int]:
        """
        Get NCR (Non-Conformance Report) counts for a supplier
        Returns dict with total_ncrs and open_ncrs
        """
        total = await self.db.ncrs.count_documents({"supplier_id": supplier_id})
        open_count = await self.db.ncrs.count_documents({
            "supplier_id": supplier_id,
            "status": {"$in": ["Open", "In Progress"]}
        })
        
        return {
            "total_ncrs": total,
            "open_ncrs": open_count
        }
    
    async def get_po_counts(self, supplier_id: str) -> Dict[str, int]:
        """Get purchase order counts for a supplier"""
        total = await self.db.purchase_orders.count_documents({"supplier_id": supplier_id})
        received = await self.db.purchase_orders.count_documents({
            "supplier_id": supplier_id,
            "status": "Received"
        })
        
        return {
            "total_pos": total,
            "total_received": received
        }
    
    async def update_supplier_metrics(self, supplier_id: str) -> Dict:
        """
        Update all performance metrics for a supplier
        This is called after PO receipt, invoice creation, or NCR logging
        """
        # Calculate all metrics
        on_time_delivery = await self.calculate_on_time_delivery(supplier_id)
        average_days_late = await self.calculate_average_days_late(supplier_id)
        performance_rating = await self.get_performance_rating(on_time_delivery)
        fy_spend = await self.calculate_fy_spend(supplier_id)
        lifetime_spend = await self.calculate_lifetime_spend(supplier_id)
        ncr_counts = await self.get_ncr_counts(supplier_id)
        po_counts = await self.get_po_counts(supplier_id)
        
        # Update supplier record
        update_data = {
            "on_time_delivery": on_time_delivery,
            "average_days_late": average_days_late,
            "performance_rating": performance_rating,
            "fy_spend": fy_spend,
            "lifetime_spend": lifetime_spend,
            "ncr_count": ncr_counts["total_ncrs"],
            "open_ncrs": ncr_counts["open_ncrs"],
            "total_pos": po_counts["total_pos"],
            "total_received": po_counts["total_received"],
            "updated_at": datetime.utcnow()
        }
        
        await self.db.suppliers.update_one(
            {"id": supplier_id},
            {"$set": update_data}
        )
        
        return update_data
    
    async def get_recent_deliveries(self, supplier_id: str, limit: int = 10) -> List[Dict]:
        """
        Get recent delivery history for a supplier
        Returns list of POs with delivery information
        """
        pos = await self.db.purchase_orders.find({
            "supplier_id": supplier_id,
            "status": {"$in": ["Received", "Partial"]}
        }).sort("received_date", -1).limit(limit).to_list(limit)
        
        deliveries = []
        for po in pos:
            delivery_status = "On Time"
            if po.get("days_late", 0) > 0:
                delivery_status = "Late"
            elif po.get("days_late", 0) < 0:
                delivery_status = "Early"
            
            deliveries.append({
                "po_number": po.get("po_number"),
                "expected_date": po.get("expected_delivery_date"),
                "received_date": po.get("received_date"),
                "days_late": po.get("days_late", 0),
                "status": delivery_status
            })
        
        return deliveries
    
    async def check_alerts(self, supplier_id: str) -> List[Dict]:
        """
        Check for supplier alerts:
        - Insurance expiry (30 days)
        - ISO certificate expiry (30 days)
        - Consecutive late deliveries (3+)
        - No activity in 12 months
        """
        alerts = []
        
        # Get supplier
        supplier = await self.db.suppliers.find_one({"id": supplier_id})
        if not supplier:
            return alerts
        
        now = datetime.utcnow()
        
        # Insurance expiry alert
        if supplier.get("insurance_expiry"):
            days_until_expiry = (supplier["insurance_expiry"] - now).days
            if 0 < days_until_expiry <= 30:
                alerts.append({
                    "type": "insurance_expiry",
                    "severity": "warning",
                    "message": f"Insurance expires in {days_until_expiry} days",
                    "days_remaining": days_until_expiry
                })
        
        # Consecutive late deliveries
        recent_pos = await self.db.purchase_orders.find({
            "supplier_id": supplier_id,
            "status": {"$in": ["Received", "Partial"]}
        }).sort("received_date", -1).limit(5).to_list(5)
        
        consecutive_late = 0
        for po in recent_pos:
            if po.get("days_late", 0) > 0:
                consecutive_late += 1
            else:
                break
        
        if consecutive_late >= 3:
            alerts.append({
                "type": "consecutive_late",
                "severity": "critical",
                "message": f"{consecutive_late} consecutive late deliveries",
                "count": consecutive_late
            })
        
        # No activity alert
        last_po = await self.db.purchase_orders.find_one(
            {"supplier_id": supplier_id},
            sort=[("created_at", -1)]
        )
        
        if last_po:
            days_since_last_po = (now - last_po["created_at"]).days
            if days_since_last_po > 365:
                alerts.append({
                    "type": "inactive_supplier",
                    "severity": "info",
                    "message": f"No purchase orders in {days_since_last_po} days",
                    "days_inactive": days_since_last_po
                })
        
        return alerts
    
    async def get_top_performing_suppliers(self, limit: int = 5) -> List[Dict]:
        """Get top performing suppliers by on-time delivery %"""
        suppliers = await self.db.suppliers.find({
            "status": "Active",
            "total_pos": {"$gt": 0}
        }).sort("on_time_delivery", -1).limit(limit).to_list(limit)
        
        return suppliers
    
    async def get_bottom_performing_suppliers(self, limit: int = 5) -> List[Dict]:
        """Get bottom performing suppliers by average days late"""
        suppliers = await self.db.suppliers.find({
            "status": "Active",
            "total_pos": {"$gt": 0},
            "average_days_late": {"$gt": 0}
        }).sort("average_days_late", -1).limit(limit).to_list(limit)
        
        return suppliers
    
    async def get_spend_by_category(self) -> List[Dict]:
        """Get total FY spend grouped by supplier category"""
        pipeline = [
            {
                "$match": {"status": "Active"}
            },
            {
                "$group": {
                    "_id": "$category",
                    "total_spend": {"$sum": "$fy_spend"},
                    "supplier_count": {"$sum": 1}
                }
            },
            {
                "$sort": {"total_spend": -1}
            }
        ]
        
        result = await self.db.suppliers.aggregate(pipeline).to_list(10)
        
        return [
            {
                "category": item["_id"],
                "total_spend": round(item["total_spend"], 2),
                "supplier_count": item["supplier_count"]
            }
            for item in result
        ]
