#!/usr/bin/env python3
"""
Quote #60 Investigation - Specific test for the reported $0.00 issue
Tests the specific issue where Quote #60 shows $0.00 after attaching a drawing
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

class Quote60Investigator:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        self.test_results = []
        self.created_quotes = []
        
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
        print("\n=== AUTHENTICATION ===")
        
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
    
    def investigate_quote_60(self):
        """Investigate the specific issue with Quote #60 reported by user"""
        print("\n=== QUOTE #60 INVESTIGATION ===")
        
        try:
            # Step 1: Try to retrieve Quote #60 by number
            response = requests.get(
                f"{self.base_url}/quotes/by-number/60",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                quote_60 = response.json()
                self.log_test("Quote #60 Found", True, f"Successfully retrieved Quote #60")
                
                # Step 2: Check quote_total value
                quote_total = quote_60.get('quote_total', 0)
                if quote_total == 0:
                    self.log_test("Quote #60 Total Issue CONFIRMED", False, 
                                f"Quote total is $0.00 - this confirms the user's report!")
                else:
                    self.log_test("Quote #60 Total", True, 
                                f"Quote total is ${quote_total} (not $0)")
                
                # Step 3: Check drawing fields
                drawing_url = quote_60.get('drawing_url', '')
                drawing_filename = quote_60.get('drawing_filename', '')
                
                if drawing_url or drawing_filename:
                    self.log_test("Drawing Fields Present", True, 
                                f"Drawing URL: {drawing_url}, Filename: {drawing_filename}")
                else:
                    self.log_test("Drawing Fields Present", False, 
                                "No drawing URL or filename found")
                
                # Step 4: Check data integrity
                self.check_quote_data_integrity(quote_60)
                
                # Step 5: Test if updating with drawing causes $0 issue
                return self.test_drawing_update_issue()
                
            elif response.status_code == 404:
                self.log_test("Quote #60 Found", False, "Quote #60 does not exist in database")
                
                # Try to find quotes around #60
                return self.search_quotes_around_60()
            else:
                self.log_test("Quote #60 Retrieval", False, 
                            f"Failed to retrieve Quote #60: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Quote #60 Investigation", False, f"Error investigating Quote #60: {str(e)}")
            return False
    
    def check_quote_data_integrity(self, quote):
        """Check the data integrity of a quote"""
        print("\n--- Quote Data Integrity Check ---")
        
        # Check required cost fields
        cost_fields = [
            'material_cost_per_part', 'total_process_cost', 'cost_per_part_no_gst',
            'gst_value', 'quote_total'
        ]
        
        for field in cost_fields:
            value = quote.get(field, 0)
            if value is not None and value != 0:
                self.log_test(f"Field {field}", True, f"${value}")
            else:
                self.log_test(f"Field {field}", False, f"Value is {value} (zero or null)")
        
        # Check processes array
        processes = quote.get('processes', [])
        if processes:
            self.log_test("Processes Array", True, f"Found {len(processes)} processes")
            for i, process in enumerate(processes):
                process_name = process.get('name', 'Unknown')
                self.log_test(f"Process {i+1}", True, f"{process_name}")
        else:
            self.log_test("Processes Array", False, "No processes found")
        
        # Check line_items array (for multi-item quotes)
        line_items = quote.get('line_items', [])
        if line_items:
            self.log_test("Line Items Array", True, f"Found {len(line_items)} line items")
        else:
            self.log_test("Line Items Array", True, "No line items (single-item quote)")
    
    def test_drawing_update_issue(self):
        """Test if updating a quote with drawing fields causes quote_total to become $0"""
        print("\n--- Testing Drawing Update Issue ---")
        
        try:
            # Create a test quote first
            test_quote_data = {
                "customer_name": "Drawing Test Customer",
                "contact_person": "Test Person",
                "part_description": "Drawing Update Test Part",
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
                "other_costs": 0
            }
            
            # Create the test quote
            create_response = requests.post(
                f"{self.base_url}/quotes",
                json=test_quote_data,
                headers=self.headers,
                timeout=10
            )
            
            if create_response.status_code == 201:
                test_quote = create_response.json()
                self.created_quotes.append(test_quote)
                
                original_total = test_quote.get('quote_total', 0)
                self.log_test("Test Quote Created", True, 
                            f"Quote {test_quote['quote_number']} created with total ${original_total}")
                
                # Now update it with drawing fields
                update_data = {
                    "drawing_url": "https://example.com/test-drawing.pdf",
                    "drawing_filename": "test-drawing.pdf"
                }
                
                update_response = requests.put(
                    f"{self.base_url}/quotes/{test_quote['id']}",
                    json=update_data,
                    headers=self.headers,
                    timeout=10
                )
                
                if update_response.status_code == 200:
                    updated_quote = update_response.json()
                    new_total = updated_quote.get('quote_total', 0)
                    
                    if new_total == 0 and original_total > 0:
                        self.log_test("Drawing Update Bug CONFIRMED", False, 
                                    f"Quote total changed from ${original_total} to $0 after adding drawing!")
                        return False
                    elif new_total == original_total:
                        self.log_test("Drawing Update Safe", True, 
                                    f"Quote total remained ${new_total} after adding drawing")
                        return True
                    else:
                        self.log_test("Drawing Update Changed Total", False, 
                                    f"Quote total changed from ${original_total} to ${new_total}")
                        return False
                else:
                    self.log_test("Drawing Update Failed", False, 
                                f"Failed to update quote: {update_response.status_code}")
                    return False
            else:
                self.log_test("Test Quote Creation Failed", False, 
                            f"Failed to create test quote: {create_response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Drawing Update Test", False, f"Error testing drawing update: {str(e)}")
            return False
    
    def search_quotes_around_60(self):
        """Search for quotes around number 60 to see what exists"""
        print("\n--- Searching for Quotes Around #60 ---")
        
        try:
            # Get all quotes and look for ones near 60
            response = requests.get(
                f"{self.base_url}/quotes",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                all_quotes = response.json()
                
                # Find quotes with numbers close to 60
                nearby_quotes = []
                for quote in all_quotes:
                    try:
                        quote_num = int(quote.get('quote_number', 0))
                        if 55 <= quote_num <= 65:
                            nearby_quotes.append((quote_num, quote))
                    except (ValueError, TypeError):
                        continue
                
                if nearby_quotes:
                    nearby_quotes.sort(key=lambda x: x[0])  # Sort by quote number
                    self.log_test("Quotes Near #60", True, 
                                f"Found {len(nearby_quotes)} quotes between #55-65")
                    
                    for quote_num, quote in nearby_quotes:
                        total = quote.get('quote_total', 0)
                        customer = quote.get('customer_name', 'Unknown')
                        drawing_url = quote.get('drawing_url', '')
                        drawing_filename = quote.get('drawing_filename', '')
                        has_drawing = "Yes" if (drawing_url or drawing_filename) else "No"
                        
                        self.log_test(f"Quote #{quote_num}", True, 
                                    f"Customer: {customer}, Total: ${total}, Drawing: {has_drawing}")
                else:
                    self.log_test("Quotes Near #60", False, "No quotes found between #55-65")
                
                # Check the highest quote number
                if all_quotes:
                    max_quote_num = max(int(q.get('quote_number', 0)) for q in all_quotes if q.get('quote_number'))
                    self.log_test("Highest Quote Number", True, f"Highest quote number in system: {max_quote_num}")
                
                return True
            else:
                self.log_test("Search Quotes", False, f"Failed to get quotes list: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Search Quotes Around 60", False, f"Error searching quotes: {str(e)}")
            return False
    
    def test_calculation_logic_issues(self):
        """Test for potential calculation logic issues in create_quote and update_quote endpoints"""
        print("\n--- Testing Calculation Logic Issues ---")
        
        try:
            # Test 1: Create quote with processes
            quote_with_processes = {
                "customer_name": "Process Test Customer",
                "contact_person": "Jane Smith",
                "part_description": "Process Test Part",
                "material_type": "Galvanized",
                "grade": "G550",
                "finish": "Galv",
                "thickness": "2.5",
                "sheet_width": 1220,
                "sheet_length": 2440,
                "parts_per_sheet": 4,
                "quantity_required": 50,
                "buying_cost_per_sheet": 150.00,
                "selling_price_per_sheet": 165.00,
                "material_markup_percent": 10,
                "total_perimeter": 800,
                "cutting_time_minutes": 6.0,
                "charge_rate_per_min": 3.00,
                "setup_cost": 75.00,
                "programming_cost": 25.00,
                "laser_cleaning_cost": 10.00,
                "delivery_cost": 0,
                "other_costs": 0,
                "processes": [
                    {
                        "id": "pb-001",
                        "name": "Press Brake",
                        "setup_time": 45.0,
                        "time_per_part": 3.5,
                        "hourly_rate": 90.0,
                        "material_type": "Galvanized",
                        "thickness": 2.5,
                        "number_of_bends": 6,
                        "bend_length": 150.0,
                        "vdie_size": 12.0,
                        "process_notes": "Standard galvanized steel bending"
                    }
                ],
                "total_process_cost": 875.00,
                "quote_total": 2500.00
            }
            
            response = requests.post(
                f"{self.base_url}/quotes",
                json=quote_with_processes,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 201:
                quote = response.json()
                self.created_quotes.append(quote)
                
                quote_total = quote.get('quote_total', 0)
                if quote_total > 0:
                    self.log_test("Quote with Processes - Total Not Zero", True, 
                                f"Quote total: ${quote_total}")
                else:
                    self.log_test("Quote with Processes - Total Zero Issue", False, 
                                f"Quote total is $0 - calculation issue detected!")
                
                # Now test updating this quote with drawing fields
                update_data = {
                    "drawing_url": "https://example.com/process-drawing.pdf",
                    "drawing_filename": "process-drawing.pdf"
                }
                
                update_response = requests.put(
                    f"{self.base_url}/quotes/{quote['id']}",
                    json=update_data,
                    headers=self.headers,
                    timeout=10
                )
                
                if update_response.status_code == 200:
                    updated_quote = update_response.json()
                    new_total = updated_quote.get('quote_total', 0)
                    
                    if new_total == 0 and quote_total > 0:
                        self.log_test("Process Quote Drawing Update Bug", False, 
                                    f"Quote with processes total became $0 after drawing update!")
                    elif new_total == quote_total:
                        self.log_test("Process Quote Drawing Update Safe", True, 
                                    f"Quote with processes total preserved: ${new_total}")
                    else:
                        self.log_test("Process Quote Drawing Update Changed", False, 
                                    f"Quote total changed unexpectedly: ${quote_total} → ${new_total}")
                
                return True
            else:
                self.log_test("Create Quote with Processes", False, 
                            f"Failed to create quote: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Calculation Logic Test", False, f"Error: {str(e)}")
            return False
    
    def run_investigation(self):
        """Run the complete Quote #60 investigation"""
        print("🔍 QUOTE #60 INVESTIGATION - URGENT ISSUE ANALYSIS")
        print(f"Backend URL: {self.base_url}")
        print(f"Test Credentials: {TEST_USERNAME}")
        print("=" * 80)
        
        # Authentication is required
        if not self.authenticate():
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with investigation")
            return False
        
        # Run investigation steps
        investigation_steps = [
            ("Quote #60 Investigation", self.investigate_quote_60),
            ("Calculation Logic Issues", self.test_calculation_logic_issues)
        ]
        
        success_count = 0
        total_steps = len(investigation_steps)
        
        for step_name, step_method in investigation_steps:
            try:
                print(f"\n🔍 {step_name}")
                if step_method():
                    success_count += 1
            except Exception as e:
                self.log_test(step_name, False, f"Investigation step failed: {str(e)}")
        
        # Print summary
        print("\n" + "=" * 80)
        print("🏁 INVESTIGATION COMPLETE")
        
        # Count actual test results
        passed_tests = sum(1 for result in self.test_results if result['success'])
        failed_tests = len(self.test_results) - passed_tests
        
        print(f"✅ Passed: {passed_tests} tests")
        print(f"❌ Failed: {failed_tests} tests")
        
        if failed_tests == 0:
            print("🎉 NO ISSUES FOUND - Quote #60 issue may be resolved or doesn't exist")
        else:
            print("⚠️ ISSUES DETECTED - See failed tests above for details")
            
            # Print critical findings
            critical_issues = [result for result in self.test_results if not result['success'] and 
                             ('$0' in result['message'] or 'CONFIRMED' in result['message'])]
            
            if critical_issues:
                print("\n🚨 CRITICAL FINDINGS:")
                for issue in critical_issues:
                    print(f"   • {issue['test']}: {issue['message']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    investigator = Quote60Investigator()
    success = investigator.run_investigation()
    
    if not success:
        sys.exit(1)