#!/usr/bin/env python3
"""
Drawing Bug Analysis - Deep dive into the $0.00 issue when drawings are attached
"""

import requests
import json

# Configuration
BASE_URL = "https://quote-pdf-breaks.preview.emergentagent.com/api"
TEST_USERNAME = "admin"
TEST_PASSWORD = "password123"

class DrawingBugAnalyzer:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        
    def authenticate(self):
        """Authenticate and get JWT token"""
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
                print("✅ Authentication successful")
                return True
            else:
                print(f"❌ Authentication failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return False
    
    def analyze_existing_quotes_with_drawings(self):
        """Analyze existing quotes that have drawings to confirm the pattern"""
        print("\n=== ANALYZING EXISTING QUOTES WITH DRAWINGS ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/quotes",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                all_quotes = response.json()
                
                quotes_with_drawings = []
                quotes_without_drawings = []
                
                for quote in all_quotes:
                    drawing_url = quote.get('drawing_url', '')
                    drawing_filename = quote.get('drawing_filename', '')
                    has_drawing = bool(drawing_url or drawing_filename)
                    quote_total = quote.get('quote_total', 0)
                    
                    if has_drawing:
                        quotes_with_drawings.append({
                            'number': quote.get('quote_number'),
                            'customer': quote.get('customer_name'),
                            'total': quote_total,
                            'drawing_url': drawing_url,
                            'drawing_filename': drawing_filename
                        })
                    else:
                        quotes_without_drawings.append({
                            'number': quote.get('quote_number'),
                            'customer': quote.get('customer_name'),
                            'total': quote_total
                        })
                
                print(f"📊 Found {len(quotes_with_drawings)} quotes WITH drawings")
                print(f"📊 Found {len(quotes_without_drawings)} quotes WITHOUT drawings")
                
                # Analyze quotes with drawings
                zero_total_with_drawings = 0
                for quote in quotes_with_drawings:
                    if quote['total'] == 0:
                        zero_total_with_drawings += 1
                        print(f"❌ Quote #{quote['number']}: ${quote['total']} (HAS DRAWING)")
                    else:
                        print(f"✅ Quote #{quote['number']}: ${quote['total']} (HAS DRAWING)")
                
                # Analyze quotes without drawings  
                zero_total_without_drawings = 0
                for quote in quotes_without_drawings[:10]:  # Show first 10
                    if quote['total'] == 0:
                        zero_total_without_drawings += 1
                        print(f"❌ Quote #{quote['number']}: ${quote['total']} (NO DRAWING)")
                    else:
                        print(f"✅ Quote #{quote['number']}: ${quote['total']} (NO DRAWING)")
                
                print(f"\n📈 PATTERN ANALYSIS:")
                print(f"   Quotes with drawings having $0 total: {zero_total_with_drawings}/{len(quotes_with_drawings)}")
                print(f"   Quotes without drawings having $0 total: {zero_total_without_drawings}/{min(10, len(quotes_without_drawings))}")
                
                if zero_total_with_drawings > 0 and zero_total_without_drawings == 0:
                    print("🚨 CONFIRMED: Drawing attachment causes $0.00 total!")
                
                return quotes_with_drawings, quotes_without_drawings
                
        except Exception as e:
            print(f"❌ Error analyzing quotes: {str(e)}")
            return [], []
    
    def test_drawing_attachment_bug(self):
        """Test the exact scenario: create quote, then add drawing"""
        print("\n=== TESTING DRAWING ATTACHMENT BUG ===")
        
        # Step 1: Create a quote without drawing
        quote_data = {
            "customer_name": "Drawing Bug Test Customer",
            "contact_person": "Test Person",
            "part_description": "Test Part for Drawing Bug",
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
        
        try:
            # Create quote
            create_response = requests.post(
                f"{self.base_url}/quotes",
                json=quote_data,
                headers=self.headers,
                timeout=10
            )
            
            if create_response.status_code == 201:
                quote = create_response.json()
                original_total = quote.get('quote_total', 0)
                quote_id = quote['id']
                quote_number = quote['quote_number']
                
                print(f"✅ Created Quote #{quote_number} with total: ${original_total}")
                
                # Step 2: Add drawing to the quote
                drawing_update = {
                    "drawing_url": "https://example.com/test-drawing.pdf",
                    "drawing_filename": "test-drawing.pdf"
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
                    
                    print(f"📎 Added drawing to Quote #{quote_number}")
                    print(f"💰 Total before drawing: ${original_total}")
                    print(f"💰 Total after drawing: ${new_total}")
                    
                    if new_total == 0 and original_total > 0:
                        print("🚨 BUG CONFIRMED: Quote total became $0 after adding drawing!")
                        return False
                    elif new_total == original_total:
                        print("✅ SAFE: Quote total unchanged after adding drawing")
                        return True
                    else:
                        print(f"⚠️ UNEXPECTED: Quote total changed from ${original_total} to ${new_total}")
                        return False
                else:
                    print(f"❌ Failed to update quote with drawing: {update_response.status_code}")
                    print(f"Response: {update_response.text}")
                    return False
            else:
                print(f"❌ Failed to create quote: {create_response.status_code}")
                print(f"Response: {create_response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error in drawing attachment test: {str(e)}")
            return False
    
    def examine_quote_with_zero_total(self, quote_number):
        """Examine a specific quote that has $0 total to understand why"""
        print(f"\n=== EXAMINING QUOTE #{quote_number} WITH $0 TOTAL ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/quotes/by-number/{quote_number}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                quote = response.json()
                
                print(f"Quote #{quote_number} Details:")
                print(f"  Customer: {quote.get('customer_name', 'N/A')}")
                print(f"  Part: {quote.get('part_description', 'N/A')}")
                print(f"  Material: {quote.get('material_type', 'N/A')}")
                print(f"  Quantity: {quote.get('quantity_required', 'N/A')}")
                
                # Check cost breakdown
                print(f"\n💰 Cost Breakdown:")
                print(f"  Material Cost per Part: ${quote.get('material_cost_per_part', 0)}")
                print(f"  Cutting Cost per Part: ${quote.get('cutting_cost_per_part', 0)}")
                print(f"  Fixed Cost per Part: ${quote.get('fixed_cost_per_part', 0)}")
                print(f"  Cost per Part (no GST): ${quote.get('cost_per_part_no_gst', 0)}")
                print(f"  Total Job Cost: ${quote.get('total_job_cost', 0)}")
                print(f"  GST Value: ${quote.get('gst_value', 0)}")
                print(f"  Quote Total: ${quote.get('quote_total', 0)}")
                
                # Check drawing fields
                print(f"\n📎 Drawing Fields:")
                print(f"  Drawing URL: {quote.get('drawing_url', 'None')}")
                print(f"  Drawing Filename: {quote.get('drawing_filename', 'None')}")
                
                # Check processes
                processes = quote.get('processes', [])
                print(f"\n⚙️ Processes: {len(processes)} found")
                for i, process in enumerate(processes):
                    print(f"  Process {i+1}: {process.get('name', 'Unknown')}")
                
                return quote
            else:
                print(f"❌ Failed to get quote #{quote_number}: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"❌ Error examining quote: {str(e)}")
            return None
    
    def run_analysis(self):
        """Run the complete drawing bug analysis"""
        print("🔍 DRAWING BUG ANALYSIS - INVESTIGATING $0.00 ISSUE")
        print("=" * 60)
        
        if not self.authenticate():
            return False
        
        # Step 1: Analyze existing quotes pattern
        quotes_with_drawings, quotes_without_drawings = self.analyze_existing_quotes_with_drawings()
        
        # Step 2: Examine specific quotes with $0 total
        if quotes_with_drawings:
            zero_quotes = [q for q in quotes_with_drawings if q['total'] == 0]
            if zero_quotes:
                print(f"\n🔍 Examining {len(zero_quotes)} quotes with $0 total...")
                for quote in zero_quotes[:2]:  # Examine first 2
                    self.examine_quote_with_zero_total(quote['number'])
        
        # Step 3: Test the drawing attachment bug
        print("\n🧪 Testing drawing attachment scenario...")
        bug_confirmed = not self.test_drawing_attachment_bug()
        
        # Summary
        print("\n" + "=" * 60)
        print("📋 ANALYSIS SUMMARY")
        
        if quotes_with_drawings:
            zero_with_drawings = len([q for q in quotes_with_drawings if q['total'] == 0])
            print(f"📊 Quotes with drawings having $0 total: {zero_with_drawings}/{len(quotes_with_drawings)}")
        
        if bug_confirmed:
            print("🚨 CRITICAL BUG CONFIRMED: Adding drawings causes quote total to become $0")
        else:
            print("✅ Drawing attachment test passed - no $0 issue detected")
        
        return not bug_confirmed

if __name__ == "__main__":
    analyzer = DrawingBugAnalyzer()
    success = analyzer.run_analysis()