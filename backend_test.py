#!/usr/bin/env python3
"""
Backend Testing for Customer Financial Monitoring System
Tests all customer financial endpoints with real data
"""

import requests
import json
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')

# Get backend URL from frontend .env
BACKEND_URL = os.getenv('REACT_APP_BACKEND_URL', 'http://localhost:8001')
API_BASE = f"{BACKEND_URL}/api"

# Admin credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "password123"

class CustomerFinancialTester:
    def __init__(self):
        self.token = None
        self.headers = {}
        self.test_results = []
        
    def log_test(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.test_results.append(f"{status} {test_name}: {details}")
        print(f"{status} {test_name}: {details}")
        
    def authenticate(self):
        """Authenticate and get JWT token"""
        try:
            response = requests.post(f"{API_BASE}/auth/login", json={
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.headers = {"Authorization": f"Bearer {self.token}"}
                self.log_test("Authentication", True, f"Token obtained successfully")
                return True
            else:
                self.log_test("Authentication", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Authentication", False, f"Exception: {str(e)}")
            return False
    
    def get_customers(self):
        """Get list of customers to work with"""
        try:
            response = requests.get(f"{API_BASE}/customers", headers=self.headers)
            
            if response.status_code == 200:
                customers = response.json()
                self.log_test("Get Customers List", True, f"Found {len(customers)} customers")
                return customers
            else:
                self.log_test("Get Customers List", False, f"Status: {response.status_code}")
                return []
                
        except Exception as e:
            self.log_test("Get Customers List", False, f"Exception: {str(e)}")
            return []
    
    def test_customer_financials(self, customer_id, customer_name):
        """Test GET /api/customers/{customer_id}/financials"""
        try:
            response = requests.get(f"{API_BASE}/customers/{customer_id}/financials", headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = [
                    'this_month_spend', 'ytd_spend', 'outstanding_balance', 
                    'credit_limit', 'credit_utilization', 'is_over_limit',
                    'total_invoices', 'paid_invoices', 'unpaid_invoices'
                ]
                
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log_test(f"Customer Financials - {customer_name}", False, f"Missing fields: {missing_fields}")
                    return None
                
                self.log_test(f"Customer Financials - {customer_name}", True, 
                    f"Outstanding: ${data['outstanding_balance']}, Credit Limit: ${data['credit_limit']}, "
                    f"YTD: ${data['ytd_spend']}, This Month: ${data['this_month_spend']}")
                return data
            else:
                self.log_test(f"Customer Financials - {customer_name}", False, f"Status: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_test(f"Customer Financials - {customer_name}", False, f"Exception: {str(e)}")
            return None
    
    def test_spend_history(self, customer_id, customer_name, months=12):
        """Test GET /api/customers/{customer_id}/spend-history"""
        try:
            response = requests.get(f"{API_BASE}/customers/{customer_id}/spend-history?months={months}", headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                if 'customer_id' in data and 'history' in data:
                    history = data['history']
                    self.log_test(f"Spend History - {customer_name}", True, 
                        f"Retrieved {len(history)} months of data")
                    
                    # Show sample data if available
                    if history:
                        sample = history[-1]  # Most recent month
                        self.log_test(f"Spend History Sample - {customer_name}", True,
                            f"Latest: {sample.get('month', 'N/A')} - ${sample.get('spend', 0)}")
                    
                    return data
                else:
                    self.log_test(f"Spend History - {customer_name}", False, "Missing required fields in response")
                    return None
            else:
                self.log_test(f"Spend History - {customer_name}", False, f"Status: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_test(f"Spend History - {customer_name}", False, f"Exception: {str(e)}")
            return None
    
    def test_payment_history(self, customer_id, customer_name, limit=10):
        """Test GET /api/customers/{customer_id}/payment-history"""
        try:
            response = requests.get(f"{API_BASE}/customers/{customer_id}/payment-history?limit={limit}", headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                if 'customer_id' in data and 'payments' in data:
                    payments = data['payments']
                    self.log_test(f"Payment History - {customer_name}", True, 
                        f"Retrieved {len(payments)} payment records")
                    
                    # Show sample data if available
                    if payments:
                        sample = payments[0]  # Most recent payment
                        self.log_test(f"Payment History Sample - {customer_name}", True,
                            f"Recent: Invoice #{sample.get('invoice_number', 'N/A')} - "
                            f"${sample.get('total', 0)} ({sample.get('payment_status', 'N/A')})")
                    
                    return data
                else:
                    self.log_test(f"Payment History - {customer_name}", False, "Missing required fields in response")
                    return None
            else:
                self.log_test(f"Payment History - {customer_name}", False, f"Status: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_test(f"Payment History - {customer_name}", False, f"Exception: {str(e)}")
            return None
    
    def test_credit_alert(self, customer_id, customer_name):
        """Test GET /api/customers/{customer_id}/credit-alert"""
        try:
            response = requests.get(f"{API_BASE}/customers/{customer_id}/credit-alert", headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ['customer_id', 'alert_level', 'outstanding', 'credit_limit', 'utilization', 'is_over_limit']
                
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log_test(f"Credit Alert - {customer_name}", False, f"Missing fields: {missing_fields}")
                    return None
                
                alert_level = data['alert_level']
                utilization = data['utilization']
                self.log_test(f"Credit Alert - {customer_name}", True, 
                    f"Alert Level: {alert_level}, Utilization: {utilization}%")
                return data
            else:
                self.log_test(f"Credit Alert - {customer_name}", False, f"Status: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_test(f"Credit Alert - {customer_name}", False, f"Exception: {str(e)}")
            return None
    
    def test_all_financials(self):
        """Test GET /api/customers/all-financials"""
        try:
            response = requests.get(f"{API_BASE}/customers/all-financials", headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("All Customer Financials", True, f"Retrieved data for {len(data)} customers")
                    
                    # Verify structure of first customer if available
                    if data:
                        sample = data[0]
                        required_fields = [
                            'id', 'company_name', 'credit_limit', 'outstanding_balance',
                            'this_month_spend', 'ytd_spend', 'credit_utilization', 'is_over_limit'
                        ]
                        missing_fields = [field for field in required_fields if field not in sample]
                        if missing_fields:
                            self.log_test("All Financials Structure", False, f"Missing fields: {missing_fields}")
                        else:
                            self.log_test("All Financials Structure", True, "All required fields present")
                            self.log_test("All Financials Sample", True,
                                f"{sample.get('company_name', 'N/A')}: ${sample.get('outstanding_balance', 0)} outstanding")
                    
                    return data
                else:
                    self.log_test("All Customer Financials", False, "Response is not a list")
                    return None
            else:
                self.log_test("All Customer Financials", False, f"Status: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_test("All Customer Financials", False, f"Exception: {str(e)}")
            return None
    
    def test_credit_alerts(self):
        """Test GET /api/customers/credit-alerts"""
        try:
            response = requests.get(f"{API_BASE}/customers/credit-alerts", headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Credit Alerts", True, f"Found {len(data)} customers with credit warnings")
                    
                    # Show details of alerts if any
                    for alert in data[:3]:  # Show first 3 alerts
                        company_name = alert.get('company_name', 'N/A')
                        alert_level = alert.get('alert_level', 'N/A')
                        utilization = alert.get('utilization', 0)
                        self.log_test(f"Credit Alert Detail", True,
                            f"{company_name}: {alert_level} ({utilization}% utilization)")
                    
                    return data
                else:
                    self.log_test("Credit Alerts", False, "Response is not a list")
                    return None
            else:
                self.log_test("Credit Alerts", False, f"Status: {response.status_code}")
                return None
                
        except Exception as e:
            self.log_test("Credit Alerts", False, f"Exception: {str(e)}")
            return None
    
    def test_unauthorized_access(self):
        """Test endpoints without authentication"""
        endpoints = [
            f"/customers/test-id/financials",
            f"/customers/test-id/spend-history",
            f"/customers/test-id/payment-history", 
            f"/customers/test-id/credit-alert",
            f"/customers/all-financials",
            f"/customers/credit-alerts"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(f"{API_BASE}{endpoint}")
                if response.status_code == 401 or response.status_code == 403:
                    self.log_test(f"Unauthorized Access - {endpoint}", True, f"Properly blocked with {response.status_code}")
                else:
                    self.log_test(f"Unauthorized Access - {endpoint}", False, f"Should be blocked but got {response.status_code}")
            except Exception as e:
                self.log_test(f"Unauthorized Access - {endpoint}", False, f"Exception: {str(e)}")
    
    def run_comprehensive_test(self):
        """Run all tests"""
        print("=" * 80)
        print("CUSTOMER FINANCIAL MONITORING SYSTEM - BACKEND TESTING")
        print("=" * 80)
        
        # Step 1: Authentication
        if not self.authenticate():
            print("❌ CRITICAL: Authentication failed. Cannot proceed with tests.")
            return False
        
        # Step 2: Test unauthorized access
        print("\n--- Testing Security ---")
        self.test_unauthorized_access()
        
        # Step 3: Get customers to work with
        print("\n--- Getting Test Data ---")
        customers = self.get_customers()
        if not customers:
            print("❌ CRITICAL: No customers found. Cannot test customer-specific endpoints.")
            return False
        
        # Step 4: Test individual customer endpoints
        print("\n--- Testing Individual Customer Endpoints ---")
        test_customer = customers[0]  # Use first customer
        customer_id = test_customer.get('id')
        customer_name = test_customer.get('company_name', 'Unknown')
        
        if not customer_id:
            print("❌ CRITICAL: Customer ID not found.")
            return False
        
        print(f"Testing with Customer: {customer_name} (ID: {customer_id})")
        
        # Test all individual customer endpoints
        financials = self.test_customer_financials(customer_id, customer_name)
        spend_history = self.test_spend_history(customer_id, customer_name)
        payment_history = self.test_payment_history(customer_id, customer_name)
        credit_alert = self.test_credit_alert(customer_id, customer_name)
        
        # Step 5: Test aggregate endpoints
        print("\n--- Testing Aggregate Endpoints ---")
        all_financials = self.test_all_financials()
        credit_alerts = self.test_credit_alerts()
        
        # Step 6: Verify calculations make sense
        print("\n--- Verifying Calculation Logic ---")
        if financials:
            self.verify_calculation_logic(financials, customer_name)
        
        # Summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for result in self.test_results if "✅ PASS" in result)
        failed = sum(1 for result in self.test_results if "❌ FAIL" in result)
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if "❌ FAIL" in result:
                    print(f"  {result}")
        
        return failed == 0
    
    def verify_calculation_logic(self, financials, customer_name):
        """Verify that calculations make sense"""
        try:
            outstanding = financials['outstanding_balance']
            credit_limit = financials['credit_limit']
            utilization = financials['credit_utilization']
            is_over_limit = financials['is_over_limit']
            
            # Verify credit utilization calculation
            if credit_limit > 0:
                expected_utilization = (outstanding / credit_limit) * 100
                if abs(utilization - expected_utilization) < 0.01:  # Allow small rounding differences
                    self.log_test(f"Credit Utilization Calculation - {customer_name}", True,
                        f"Calculated: {utilization}%, Expected: {expected_utilization:.2f}%")
                else:
                    self.log_test(f"Credit Utilization Calculation - {customer_name}", False,
                        f"Calculated: {utilization}%, Expected: {expected_utilization:.2f}%")
            
            # Verify over limit flag
            expected_over_limit = outstanding > credit_limit if credit_limit > 0 else False
            if is_over_limit == expected_over_limit:
                self.log_test(f"Over Limit Flag - {customer_name}", True,
                    f"Correctly set to {is_over_limit}")
            else:
                self.log_test(f"Over Limit Flag - {customer_name}", False,
                    f"Set to {is_over_limit}, should be {expected_over_limit}")
            
            # Verify YTD >= This Month (logical check)
            ytd_spend = financials['ytd_spend']
            this_month_spend = financials['this_month_spend']
            if ytd_spend >= this_month_spend:
                self.log_test(f"Spend Logic Check - {customer_name}", True,
                    f"YTD (${ytd_spend}) >= This Month (${this_month_spend})")
            else:
                self.log_test(f"Spend Logic Check - {customer_name}", False,
                    f"YTD (${ytd_spend}) < This Month (${this_month_spend}) - This seems incorrect")
                
        except Exception as e:
            self.log_test(f"Calculation Verification - {customer_name}", False, f"Exception: {str(e)}")


if __name__ == "__main__":
    tester = CustomerFinancialTester()
    success = tester.run_comprehensive_test()
    
    if success:
        print("\n🎉 ALL TESTS PASSED! Customer Financial Monitoring System is working correctly.")
    else:
        print("\n⚠️  SOME TESTS FAILED. Please review the failed tests above.")