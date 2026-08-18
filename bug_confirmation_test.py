#!/usr/bin/env python3
"""
Bug Confirmation Test - Confirms the root cause of the $0.00 issue
"""

import requests
import json

# Configuration
BASE_URL = "https://quote-pdf-breaks.preview.emergentagent.com/api"
TEST_USERNAME = "admin"
TEST_PASSWORD = "password123"

def authenticate():
    """Authenticate and get JWT token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            print("✅ Authentication successful")
            return headers
        else:
            print(f"❌ Authentication failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Authentication error: {str(e)}")
        return None

def test_bug_confirmation():
    """Test to confirm the exact bug scenario"""
    print("🔍 BUG CONFIRMATION TEST")
    print("=" * 50)
    
    headers = authenticate()
    if not headers:
        return False
    
    # Step 1: Create a quote with processes (like the ones that show $0)
    quote_with_processes = {
        "customer_name": "Bug Test Customer",
        "contact_person": "Test Person",
        "part_description": "Bug Test Part",
        "material_type": "Mild Steel",
        "grade": "HA3",
        "finish": "P&O",
        "thickness": "3mm",
        "sheet_width": 1220,
        "sheet_length": 2440,
        "parts_per_sheet": 5,
        "quantity_required": 20,
        "buying_cost_per_sheet": 100.00,
        "selling_price_per_sheet": 110.00,
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
                "material_type": "Mild Steel",
                "thickness": 3.0,
                "number_of_bends": 4,
                "bend_length": 120.0,
                "vdie_size": 10.0,
                "process_notes": "Test bending process"
            }
        ],
        "total_process_cost": 500.00,  # Frontend calculated
        "quote_total": 1200.00  # Frontend calculated total
    }
    
    try:
        # Create the quote
        create_response = requests.post(
            f"{BASE_URL}/quotes",
            json=quote_with_processes,
            headers=headers,
            timeout=10
        )
        
        if create_response.status_code == 201:
            quote = create_response.json()
            quote_id = quote['id']
            quote_number = quote['quote_number']
            original_total = quote.get('quote_total', 0)
            
            print(f"✅ Created Quote #{quote_number}")
            print(f"   Original total: ${original_total}")
            print(f"   Has processes: {len(quote.get('processes', []))}")
            
            # Step 2: Update with drawing (this should trigger the bug)
            drawing_update = {
                "drawing_url": "/files/drawings/test-drawing.pdf",
                "drawing_filename": "test-drawing.pdf"
            }
            
            update_response = requests.put(
                f"{BASE_URL}/quotes/{quote_id}",
                json=drawing_update,
                headers=headers,
                timeout=10
            )
            
            if update_response.status_code == 200:
                updated_quote = update_response.json()
                new_total = updated_quote.get('quote_total', 0)
                
                print(f"📎 Added drawing to Quote #{quote_number}")
                print(f"   New total: ${new_total}")
                
                if new_total == 0 and original_total > 0:
                    print("🚨 BUG CONFIRMED!")
                    print("   Root Cause: update_quote() calls calculate_all_costs() which overwrites process calculations")
                    return True
                elif new_total != original_total:
                    print(f"⚠️ Total changed unexpectedly: ${original_total} → ${new_total}")
                    return False
                else:
                    print("✅ Total preserved - bug may be fixed")
                    return True
            else:
                print(f"❌ Failed to update quote: {update_response.status_code}")
                return False
        else:
            print(f"❌ Failed to create quote: {create_response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error in bug test: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_bug_confirmation()
    print("\n" + "=" * 50)
    if success:
        print("✅ Test completed successfully")
    else:
        print("❌ Test failed")