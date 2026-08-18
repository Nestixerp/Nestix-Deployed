#!/usr/bin/env python3
"""
Drawing Attachment Bug Fix Test
Tests the specific bug where drawing attachments reset quote totals to $0
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

class DrawingBugTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        self.test_results = []
        self.created_quotes = []
        
        # Sample quote data with Press Brake process (as specified in review request)
        self.sample_quote_with_processes = {
            "customer_name": "Process Test Customer",
            "contact_person": "Jane Smith",
            "part_description": "Press Brake Test Part",
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
            "total_process_cost": 875.00,  # Example process cost
            "quote_total": 2500.00  # Example total with processes
        }
        
        # Sample quote WITHOUT processes (legacy style)
        self.sample_quote_without_processes = {
            "customer_name": "Legacy Test Customer",
            "contact_person": "Bob Johnson",
            "part_description": "Laser Only Part",
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
            "suggested_charge_rate": 4.00,
            "setup_cost": 50.00,
            "programming_cost": 0,
            "laser_cleaning_cost": 0,
            "delivery_cost": 0,
            "other_costs": 0
        }
        
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

    def test_drawing_attachment_bug_fix(self):
        """Test the specific drawing attachment bug fix - quotes with processes should NOT reset to $0 when drawings are added"""
        print("\n=== DRAWING ATTACHMENT BUG FIX TEST ===")
        
        # Test 1: Create Quote with Processes and Add Drawing
        print("\n--- Test 1: Create Quote with Processes and Add Drawing ---")
        
        try:
            # Step 1: Create a new quote with processes (Press Brake)
            response = requests.post(
                f"{self.base_url}/quotes",
                json=self.sample_quote_with_processes,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 201:
                quote = response.json()
                self.created_quotes.append(quote)
                quote_id = quote['id']
                original_total = quote.get('quote_total', 0)
                
                self.log_test("Step 1 - Create Quote with Processes", True, 
                            f"Created quote {quote['quote_number']} with total: ${original_total}")
                
                if original_total <= 0:
                    self.log_test("Original Quote Total Check", False, 
                                f"Original quote total is ${original_total} - should be > $0")
                    return False
                
                # Step 2: Note the quote_id and original quote_total
                self.log_test("Step 2 - Note Original Values", True, 
                            f"Quote ID: {quote_id}, Original Total: ${original_total}")
                
                # Step 3: Update the quote with drawing fields ONLY
                drawing_update = {
                    "drawing_url": "/files/drawings/test-fix.pdf",
                    "drawing_filename": "test-fix.pdf"
                }
                
                update_response = requests.put(
                    f"{self.base_url}/quotes/{quote_id}",
                    json=drawing_update,
                    headers=self.headers,
                    timeout=10
                )
                
                if update_response.status_code == 200:
                    updated_quote = update_response.json()
                    new_total = updated_quote.get('quote_total', 0)
                    
                    self.log_test("Step 3 - Add Drawing Fields", True, 
                                f"Updated quote with drawing fields")
                    
                    # Step 4: Verify quote_total is UNCHANGED
                    if abs(new_total - original_total) < 0.01:  # Allow for small floating point differences
                        self.log_test("✅ BUG FIX VERIFIED - Quote Total Unchanged", True, 
                                    f"Quote total preserved: ${original_total} → ${new_total}")
                    else:
                        self.log_test("❌ BUG STILL EXISTS - Quote Total Changed", False, 
                                    f"Quote total changed: ${original_total} → ${new_total}")
                        return False
                    
                    # Verify drawing fields were added
                    if (updated_quote.get('drawing_url') == "/files/drawings/test-fix.pdf" and 
                        updated_quote.get('drawing_filename') == "test-fix.pdf"):
                        self.log_test("Drawing Fields Added", True, 
                                    "Drawing URL and filename correctly added")
                    else:
                        self.log_test("Drawing Fields Added", False, 
                                    "Drawing fields not added correctly")
                    
                    # Verify processes are still intact
                    processes = updated_quote.get('processes', [])
                    if processes and len(processes) > 0:
                        self.log_test("Processes Still Intact", True, 
                                    f"Found {len(processes)} processes after drawing update")
                    else:
                        self.log_test("Processes Still Intact", False, 
                                    "Processes were lost after drawing update")
                    
                else:
                    self.log_test("Step 3 - Add Drawing Fields", False, 
                                f"Failed to update quote: {update_response.status_code}")
                    return False
            else:
                self.log_test("Step 1 - Create Quote with Processes", False, 
                            f"Failed to create quote: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Drawing Attachment Bug Fix Test", False, f"Error: {str(e)}")
            return False
        
        # Test 2: Check existing broken quotes (Quote #55)
        print("\n--- Test 2: Check Existing Broken Quotes ---")
        
        try:
            # Try to get Quote #55 (mentioned in the bug report)
            response = requests.get(
                f"{self.base_url}/quotes/by-number/55",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                quote_55 = response.json()
                quote_total = quote_55.get('quote_total', 0)
                has_drawing = quote_55.get('drawing_url') or quote_55.get('drawing_filename')
                
                if quote_total == 0 and has_drawing:
                    self.log_test("Quote #55 - Existing Bug Confirmed", True, 
                                f"Quote #55 has $0 total with drawing (existing broken quote)")
                elif quote_total > 0:
                    self.log_test("Quote #55 - May Be Fixed", True, 
                                f"Quote #55 now has total: ${quote_total}")
                else:
                    self.log_test("Quote #55 - No Drawing", True, 
                                f"Quote #55 total: ${quote_total}, no drawing attached")
            elif response.status_code == 404:
                self.log_test("Quote #55 - Not Found", True, 
                            "Quote #55 doesn't exist (checking other quotes)")
                
                # Check for other quotes with $0 totals and drawings
                list_response = requests.get(
                    f"{self.base_url}/quotes",
                    headers=self.headers,
                    timeout=10
                )
                
                if list_response.status_code == 200:
                    all_quotes = list_response.json()
                    broken_quotes = []
                    
                    for quote in all_quotes:
                        if (quote.get('quote_total', 0) == 0 and 
                            (quote.get('drawing_url') or quote.get('drawing_filename'))):
                            broken_quotes.append(quote.get('quote_number', 'Unknown'))
                    
                    if broken_quotes:
                        self.log_test("Existing Broken Quotes Found", True, 
                                    f"Found {len(broken_quotes)} quotes with $0 total and drawings: {broken_quotes}")
                    else:
                        self.log_test("No Existing Broken Quotes", True, 
                                    "No quotes found with $0 total and drawings")
            else:
                self.log_test("Quote #55 Check", False, 
                            f"Error checking Quote #55: {response.status_code}")
                
        except Exception as e:
            self.log_test("Existing Broken Quotes Check", False, f"Error: {str(e)}")
        
        # Test 3: Legacy Quotes Still Work
        print("\n--- Test 3: Legacy Quotes Still Work ---")
        
        try:
            # Create a legacy quote (no processes)
            legacy_quote_data = self.sample_quote_without_processes.copy()
            legacy_quote_data['customer_name'] = "Legacy Test Customer"
            legacy_quote_data['part_description'] = "Legacy Quote Test"
            
            response = requests.post(
                f"{self.base_url}/quotes",
                json=legacy_quote_data,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 201:
                legacy_quote = response.json()
                self.created_quotes.append(legacy_quote)
                original_total = legacy_quote.get('quote_total', 0)
                
                # Update a material cost field
                cost_update = {
                    "buying_cost_per_sheet": 120.00  # Changed from 100.00
                }
                
                update_response = requests.put(
                    f"{self.base_url}/quotes/{legacy_quote['id']}",
                    json=cost_update,
                    headers=self.headers,
                    timeout=10
                )
                
                if update_response.status_code == 200:
                    updated_legacy = update_response.json()
                    new_total = updated_legacy.get('quote_total', 0)
                    
                    # For legacy quotes, total SHOULD recalculate
                    if abs(new_total - original_total) > 0.01:
                        self.log_test("Legacy Quote Recalculation", True, 
                                    f"Legacy quote total recalculated: ${original_total} → ${new_total}")
                    else:
                        self.log_test("Legacy Quote Recalculation", False, 
                                    f"Legacy quote total didn't recalculate: ${original_total}")
                else:
                    self.log_test("Legacy Quote Update", False, 
                                f"Failed to update legacy quote: {update_response.status_code}")
            else:
                self.log_test("Legacy Quote Creation", False, 
                            f"Failed to create legacy quote: {response.status_code}")
                
        except Exception as e:
            self.log_test("Legacy Quote Test", False, f"Error: {str(e)}")
        
        # Test 4: Multi-Item Quotes (if they exist)
        print("\n--- Test 4: Multi-Item Quotes ---")
        
        try:
            # Check if there are any multi-item quotes
            response = requests.get(
                f"{self.base_url}/quotes",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                all_quotes = response.json()
                multi_item_quotes = [q for q in all_quotes if q.get('is_multi_item', False)]
                
                if multi_item_quotes:
                    # Test updating a multi-item quote with drawing fields
                    test_quote = multi_item_quotes[0]
                    original_total = test_quote.get('quote_total', 0)
                    
                    drawing_update = {
                        "drawing_url": "/files/drawings/multi-item-test.pdf",
                        "drawing_filename": "multi-item-test.pdf"
                    }
                    
                    update_response = requests.put(
                        f"{self.base_url}/quotes/{test_quote['id']}",
                        json=drawing_update,
                        headers=self.headers,
                        timeout=10
                    )
                    
                    if update_response.status_code == 200:
                        updated_quote = update_response.json()
                        new_total = updated_quote.get('quote_total', 0)
                        
                        if abs(new_total - original_total) < 0.01:
                            self.log_test("Multi-Item Quote Drawing Update", True, 
                                        f"Multi-item quote total preserved: ${original_total}")
                        else:
                            self.log_test("Multi-Item Quote Drawing Update", False, 
                                        f"Multi-item quote total changed: ${original_total} → ${new_total}")
                    else:
                        self.log_test("Multi-Item Quote Update", False, 
                                    f"Failed to update multi-item quote: {update_response.status_code}")
                else:
                    self.log_test("Multi-Item Quotes", True, 
                                "No multi-item quotes found to test")
            else:
                self.log_test("Multi-Item Quote Check", False, 
                            f"Failed to get quotes list: {response.status_code}")
                
        except Exception as e:
            self.log_test("Multi-Item Quote Test", False, f"Error: {str(e)}")
        
        return True

    def run_test(self):
        """Run the drawing attachment bug fix test"""
        print("🚨 DRAWING ATTACHMENT BUG FIX VERIFICATION")
        print("=" * 60)
        print("Testing that drawing attachments do NOT reset quote totals to $0")
        print(f"Backend URL: {self.base_url}")
        print(f"Test User: {TEST_USERNAME}")
        print("=" * 60)
        
        # Authentication is required
        if not self.authenticate():
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
            return False
        
        # Run the drawing attachment bug fix test
        success = self.test_drawing_attachment_bug_fix()
        
        # Print summary
        print("\n" + "=" * 60)
        print("🏁 DRAWING ATTACHMENT BUG FIX TEST COMPLETE")
        
        passed_tests = sum(1 for result in self.test_results if result["success"])
        total_tests = len(self.test_results)
        
        print(f"✅ Passed: {passed_tests}/{total_tests} tests")
        print(f"❌ Failed: {total_tests - passed_tests}/{total_tests} tests")
        
        success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
        print(f"📊 Success Rate: {success_rate:.1f}%")
        
        # Print detailed results
        print("\n📋 DETAILED TEST RESULTS:")
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        return success

if __name__ == "__main__":
    tester = DrawingBugTester()
    success = tester.run_test()
    
    if success:
        print("\n🎉 DRAWING ATTACHMENT BUG FIX VERIFICATION COMPLETE!")
    else:
        print("\n⚠️  SOME TESTS FAILED - CHECK RESULTS ABOVE")
        sys.exit(1)