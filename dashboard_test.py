#!/usr/bin/env python3
"""
Focused Dashboard Metrics Testing for Nestix ERP System
Tests the newly implemented Dashboard Metrics endpoint
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import os

# Configuration
BASE_URL = "https://quote-pdf-breaks.preview.emergentagent.com/api"
TEST_USERNAME = "admin"
TEST_PASSWORD = "password123"

class DashboardTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        self.test_results = []
        
    def log_test(self, test_name, success, message="", data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "data": data
        })
        
    def authenticate(self):
        """Authenticate and get JWT token"""
        print("\n=== AUTHENTICATION TEST ===")
        
        try:
            response = requests.post(
                f"{self.base_url}/auth/login",
                json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data["access_token"]
                self.headers = {"Authorization": f"Bearer {self.token}"}
                self.log_test("Authentication", True, f"Successfully logged in as {TEST_USERNAME}")
                return True
            else:
                self.log_test("Authentication", False, f"Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Authentication", False, f"Authentication error: {str(e)}")
            return False
    
    def test_dashboard_endpoint_access(self):
        """Test basic dashboard metrics endpoint access"""
        print("\n=== DASHBOARD METRICS ENDPOINT ACCESS ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/dashboard/metrics",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                self.metrics = response.json()
                self.log_test("Dashboard Endpoint Access", True, "Successfully accessed /api/dashboard/metrics")
                return True
            else:
                self.log_test("Dashboard Endpoint Access", False, f"Failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Dashboard Endpoint Access", False, f"Error: {str(e)}")
            return False
    
    def test_response_structure(self):
        """Verify response structure contains all expected fields"""
        print("\n=== RESPONSE STRUCTURE VERIFICATION ===")
        
        if not hasattr(self, 'metrics'):
            self.log_test("Response Structure", False, "No metrics data available")
            return False
        
        expected_fields = [
            'low_stock', 'overdue_pos', 'recent_quotes', 'revenue_ytd', 
            'revenue_mtd', 'inventory_spend_mtd', 'hours_active_work', 'hours_today'
        ]
        
        missing_fields = [field for field in expected_fields if field not in self.metrics]
        if not missing_fields:
            self.log_test("Response Structure", True, "All expected fields present")
        else:
            self.log_test("Response Structure", False, f"Missing fields: {missing_fields}")
            return False
        
        # Verify nested structures
        if isinstance(self.metrics.get('low_stock'), dict) and 'count' in self.metrics['low_stock']:
            self.log_test("Low Stock Structure", True, f"Count: {self.metrics['low_stock']['count']}, Materials: {len(self.metrics['low_stock'].get('materials', []))}")
        else:
            self.log_test("Low Stock Structure", False, "Invalid low_stock structure")
        
        if isinstance(self.metrics.get('overdue_pos'), dict) and 'count' in self.metrics['overdue_pos']:
            self.log_test("Overdue POs Structure", True, f"Count: {self.metrics['overdue_pos']['count']}, POs: {len(self.metrics['overdue_pos'].get('pos', []))}")
        else:
            self.log_test("Overdue POs Structure", False, "Invalid overdue_pos structure")
        
        if isinstance(self.metrics.get('recent_quotes'), list):
            self.log_test("Recent Quotes Structure", True, f"Found {len(self.metrics['recent_quotes'])} recent quotes")
        else:
            self.log_test("Recent Quotes Structure", False, "Invalid recent_quotes structure")
        
        return True
    
    def test_placeholder_fields(self):
        """Test placeholder fields return 0.0"""
        print("\n=== PLACEHOLDER FIELDS VERIFICATION ===")
        
        if not hasattr(self, 'metrics'):
            self.log_test("Placeholder Fields", False, "No metrics data available")
            return False
        
        # Test hours_active_work
        if self.metrics.get('hours_active_work') == 0.0:
            self.log_test("Hours Active Work", True, "Returns 0.0 as expected (placeholder)")
        else:
            self.log_test("Hours Active Work", False, f"Expected 0.0, got {self.metrics.get('hours_active_work')}")
        
        # Test hours_today
        if self.metrics.get('hours_today') == 0.0:
            self.log_test("Hours Today", True, "Returns 0.0 as expected (placeholder)")
        else:
            self.log_test("Hours Today", False, f"Expected 0.0, got {self.metrics.get('hours_today')}")
        
        # Test placeholder flag
        if self.metrics.get('is_time_tracking_placeholder') == True:
            self.log_test("Time Tracking Placeholder Flag", True, "Correctly marked as placeholder")
        else:
            self.log_test("Time Tracking Placeholder Flag", False, "Missing or incorrect placeholder flag")
        
        return True
    
    def test_calculations_with_existing_data(self):
        """Test calculations with existing data"""
        print("\n=== CALCULATIONS WITH EXISTING DATA ===")
        
        if not hasattr(self, 'metrics'):
            self.log_test("Calculations Test", False, "No metrics data available")
            return False
        
        # Test revenue calculations (should be >= 0)
        ytd_revenue = self.metrics.get('revenue_ytd', 0)
        mtd_revenue = self.metrics.get('revenue_mtd', 0)
        
        self.log_test("Revenue YTD", True, f"YTD Revenue: ${ytd_revenue:.2f}")
        self.log_test("Revenue MTD", True, f"MTD Revenue: ${mtd_revenue:.2f}")
        
        # Verify YTD >= MTD (year-to-date should be >= month-to-date)
        if ytd_revenue >= mtd_revenue:
            self.log_test("Revenue Logic", True, f"YTD (${ytd_revenue:.2f}) >= MTD (${mtd_revenue:.2f})")
        else:
            self.log_test("Revenue Logic", False, f"YTD (${ytd_revenue:.2f}) should be >= MTD (${mtd_revenue:.2f})")
        
        # Test inventory spend
        inventory_spend = self.metrics.get('inventory_spend_mtd', 0)
        self.log_test("Inventory Spend MTD", True, f"Inventory Spend: ${inventory_spend:.2f}")
        
        return True
    
    def test_list_limits(self):
        """Test that lists are limited appropriately"""
        print("\n=== LIST LIMITS VERIFICATION ===")
        
        if not hasattr(self, 'metrics'):
            self.log_test("List Limits", False, "No metrics data available")
            return False
        
        # Test low stock materials limit (should be <= 10)
        low_stock_materials = self.metrics.get('low_stock', {}).get('materials', [])
        if len(low_stock_materials) <= 10:
            self.log_test("Low Stock Materials Limit", True, f"Materials limited to {len(low_stock_materials)} items (≤10)")
        else:
            self.log_test("Low Stock Materials Limit", False, f"Too many materials: {len(low_stock_materials)} (should be ≤10)")
        
        # Test overdue POs limit (should be <= 10)
        overdue_pos = self.metrics.get('overdue_pos', {}).get('pos', [])
        if len(overdue_pos) <= 10:
            self.log_test("Overdue POs Limit", True, f"POs limited to {len(overdue_pos)} items (≤10)")
        else:
            self.log_test("Overdue POs Limit", False, f"Too many POs: {len(overdue_pos)} (should be ≤10)")
        
        # Test recent quotes limit (should be <= 5)
        recent_quotes = self.metrics.get('recent_quotes', [])
        if len(recent_quotes) <= 5:
            self.log_test("Recent Quotes Limit", True, f"Quotes limited to {len(recent_quotes)} items (≤5)")
        else:
            self.log_test("Recent Quotes Limit", False, f"Too many quotes: {len(recent_quotes)} (should be ≤5)")
        
        return True
    
    def test_data_quality(self):
        """Test data quality and completeness"""
        print("\n=== DATA QUALITY VERIFICATION ===")
        
        if not hasattr(self, 'metrics'):
            self.log_test("Data Quality", False, "No metrics data available")
            return False
        
        # Test low stock materials data quality
        low_stock_materials = self.metrics.get('low_stock', {}).get('materials', [])
        for i, material in enumerate(low_stock_materials):
            required_fields = ['id', 'material_type', 'current_stock', 'reorder_level']
            missing_fields = [field for field in required_fields if field not in material]
            
            if not missing_fields:
                # Verify low stock logic
                if material.get('current_stock', 0) < material.get('reorder_level', 0):
                    self.log_test(f"Low Stock Material {i+1} Logic", True, 
                                f"Stock {material['current_stock']} < Reorder {material['reorder_level']}")
                else:
                    self.log_test(f"Low Stock Material {i+1} Logic", False, 
                                f"Stock {material['current_stock']} should be < Reorder {material['reorder_level']}")
            else:
                self.log_test(f"Low Stock Material {i+1} Fields", False, f"Missing fields: {missing_fields}")
        
        # Test overdue POs data quality
        overdue_pos = self.metrics.get('overdue_pos', {}).get('pos', [])
        for i, po in enumerate(overdue_pos):
            required_fields = ['id', 'po_number', 'expected_delivery_date', 'status']
            missing_fields = [field for field in required_fields if field not in po]
            
            if not missing_fields:
                # Verify overdue logic (expected_delivery_date should be in the past)
                try:
                    expected_date = datetime.fromisoformat(po['expected_delivery_date'].replace('Z', '+00:00'))
                    now = datetime.now(expected_date.tzinfo)
                    if expected_date < now:
                        self.log_test(f"Overdue PO {i+1} Logic", True, 
                                    f"Expected {expected_date.date()} < Today {now.date()}")
                    else:
                        self.log_test(f"Overdue PO {i+1} Logic", False, 
                                    f"Expected {expected_date.date()} should be < Today {now.date()}")
                except Exception as e:
                    self.log_test(f"Overdue PO {i+1} Date", False, f"Date parsing error: {str(e)}")
            else:
                self.log_test(f"Overdue PO {i+1} Fields", False, f"Missing fields: {missing_fields}")
        
        # Test recent quotes data quality
        recent_quotes = self.metrics.get('recent_quotes', [])
        for i, quote in enumerate(recent_quotes):
            required_fields = ['id', 'quote_number', 'customer_name', 'quote_total', 'status']
            missing_fields = [field for field in required_fields if field not in quote]
            
            if not missing_fields:
                self.log_test(f"Recent Quote {i+1} Fields", True, 
                            f"Quote #{quote['quote_number']} - {quote['customer_name']} - ${quote['quote_total']}")
            else:
                self.log_test(f"Recent Quote {i+1} Fields", False, f"Missing fields: {missing_fields}")
        
        return True
    
    def test_unauthorized_access(self):
        """Test unauthorized access"""
        print("\n=== UNAUTHORIZED ACCESS TEST ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/dashboard/metrics",
                timeout=10  # No auth headers
            )
            
            if response.status_code in [401, 403]:
                self.log_test("Unauthorized Access", True, f"Correctly returned {response.status_code}")
            else:
                self.log_test("Unauthorized Access", False, f"Expected 401/403, got {response.status_code}")
            
            return True
                
        except Exception as e:
            self.log_test("Unauthorized Access", False, f"Error: {str(e)}")
            return False
    
    def create_test_data_and_verify(self):
        """Create minimal test data and verify metrics update"""
        print("\n=== CREATING TEST DATA FOR VERIFICATION ===")
        
        # Create an accepted quote to test revenue calculation
        quote_data = {
            "customer_name": "Dashboard Test Customer",
            "contact_person": "Test Contact",
            "part_description": "Dashboard Test Part",
            "material_type": "Mild Steel",
            "grade": "HA3",
            "finish": "P&O",
            "thickness": "3mm",
            "sheet_width": 1220,
            "sheet_length": 2440,
            "parts_per_sheet": 5,
            "quantity_required": 10,
            "buying_cost_per_sheet": 100.00,
            "selling_price_per_sheet": 110.00,
            "material_markup_percent": 10,
            "total_perimeter": 688,
            "cutting_time_minutes": 5.0,
            "charge_rate_per_min": 2.75,
            "setup_cost": 50.00,
            "programming_cost": 0,
            "laser_cleaning_cost": 0,
            "delivery_cost": 0,
            "other_costs": 0,
            "status": "Accepted"  # For revenue calculation
        }
        
        try:
            # Get initial metrics
            initial_response = requests.get(
                f"{self.base_url}/dashboard/metrics",
                headers=self.headers,
                timeout=10
            )
            
            if initial_response.status_code != 200:
                self.log_test("Get Initial Metrics", False, f"Failed: {initial_response.status_code}")
                return False
            
            initial_metrics = initial_response.json()
            initial_ytd = initial_metrics.get('revenue_ytd', 0)
            initial_mtd = initial_metrics.get('revenue_mtd', 0)
            initial_quotes_count = len(initial_metrics.get('recent_quotes', []))
            
            # Create accepted quote
            quote_response = requests.post(
                f"{self.base_url}/quotes",
                json=quote_data,
                headers=self.headers,
                timeout=10
            )
            
            if quote_response.status_code == 201:
                quote = quote_response.json()
                quote_total = quote.get('quote_total', 0)
                self.log_test("Create Test Quote", True, f"Created quote with total ${quote_total}")
                
                # Get updated metrics
                updated_response = requests.get(
                    f"{self.base_url}/dashboard/metrics",
                    headers=self.headers,
                    timeout=10
                )
                
                if updated_response.status_code == 200:
                    updated_metrics = updated_response.json()
                    updated_ytd = updated_metrics.get('revenue_ytd', 0)
                    updated_mtd = updated_metrics.get('revenue_mtd', 0)
                    updated_quotes_count = len(updated_metrics.get('recent_quotes', []))
                    
                    # Verify revenue increased (if quote status is Accepted)
                    if quote.get('status') == 'Accepted':
                        if updated_ytd > initial_ytd:
                            self.log_test("Revenue YTD Update", True, f"YTD increased: ${initial_ytd} → ${updated_ytd}")
                        else:
                            self.log_test("Revenue YTD Update", False, f"YTD should increase: ${initial_ytd} → ${updated_ytd}")
                        
                        if updated_mtd > initial_mtd:
                            self.log_test("Revenue MTD Update", True, f"MTD increased: ${initial_mtd} → ${updated_mtd}")
                        else:
                            self.log_test("Revenue MTD Update", False, f"MTD should increase: ${initial_mtd} → ${updated_mtd}")
                    
                    # Verify recent quotes updated
                    if updated_quotes_count >= initial_quotes_count:
                        self.log_test("Recent Quotes Update", True, f"Quotes count: {initial_quotes_count} → {updated_quotes_count}")
                    else:
                        self.log_test("Recent Quotes Update", False, f"Quotes count should increase: {initial_quotes_count} → {updated_quotes_count}")
                    
                    # Cleanup - delete the test quote
                    delete_response = requests.delete(
                        f"{self.base_url}/quotes/{quote['id']}",
                        headers=self.headers,
                        timeout=10
                    )
                    
                    if delete_response.status_code in [200, 204]:
                        self.log_test("Cleanup Test Quote", True, "Test quote deleted successfully")
                    else:
                        self.log_test("Cleanup Test Quote", False, f"Failed to delete: {delete_response.status_code}")
                    
                else:
                    self.log_test("Get Updated Metrics", False, f"Failed: {updated_response.status_code}")
                    return False
            else:
                self.log_test("Create Test Quote", False, f"Failed: {quote_response.status_code} - {quote_response.text}")
                return False
            
            return True
                
        except Exception as e:
            self.log_test("Test Data Verification", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all dashboard metrics tests"""
        print("🧪 DASHBOARD METRICS COMPREHENSIVE TESTING")
        print("=" * 60)
        
        # Authentication is required for all other tests
        if not self.authenticate():
            print("\n❌ Authentication failed - cannot proceed with other tests")
            return False
        
        # Run tests in logical order
        tests = [
            self.test_dashboard_endpoint_access,
            self.test_response_structure,
            self.test_placeholder_fields,
            self.test_calculations_with_existing_data,
            self.test_list_limits,
            self.test_data_quality,
            self.test_unauthorized_access,
            self.create_test_data_and_verify
        ]
        
        for test in tests:
            try:
                test()
            except Exception as e:
                self.log_test(test.__name__, False, f"Unexpected error: {str(e)}")
        
        # Summary
        self.print_summary()
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 50)
        print("🏁 DASHBOARD METRICS TEST SUMMARY")
        print("=" * 50)
        
        passed = sum(1 for result in self.test_results if result['success'])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result['success']]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test']}: {test['message']}")
        else:
            print("\n🎉 ALL TESTS PASSED!")

if __name__ == "__main__":
    tester = DashboardTester()
    tester.run_all_tests()