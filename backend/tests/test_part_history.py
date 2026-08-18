"""
Part History API Tests
Tests for the Part History feature endpoints:
- GET /api/part-history/search - Search quotes by part description, quote number, customer
- GET /api/part-history/detail/{quote_id} - Get full production history for a quote
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quote-pdf-breaks.preview.emergentagent.com')


class TestPartHistoryAPI:
    """Part History API endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token for all tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("access_token")
        assert token, "No access token received"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    # ==================== SEARCH ENDPOINT TESTS ====================
    
    def test_search_all_quotes(self):
        """Test: GET /api/part-history/search returns all quotes when no query"""
        response = self.session.get(f"{BASE_URL}/api/part-history/search")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        assert len(data) > 0, "Expected at least one quote"
        
        # Verify response structure
        first_quote = data[0]
        assert "id" in first_quote
        assert "quote_number" in first_quote
        assert "part_description" in first_quote
        assert "customer_name" in first_quote
        assert "status" in first_quote
        
        print(f"SUCCESS: Found {len(data)} quotes")
    
    def test_search_by_part_description(self):
        """Test: Search by part description 'LSS3092'"""
        response = self.session.get(f"{BASE_URL}/api/part-history/search?q=LSS3092")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least one result for LSS3092"
        
        # Verify the result contains LSS3092
        found = any("LSS3092" in q.get("part_description", "") for q in data)
        assert found, "Expected LSS3092 in results"
        
        print(f"SUCCESS: Found {len(data)} results for 'LSS3092'")
    
    def test_search_by_quote_number(self):
        """Test: Search by quote number '117'"""
        response = self.session.get(f"{BASE_URL}/api/part-history/search?q=117")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least one result for quote 117"
        
        # Verify Quote #117 is in results
        found = any(str(q.get("quote_number")) == "117" for q in data)
        assert found, "Expected Quote #117 in results"
        
        print(f"SUCCESS: Found {len(data)} results for quote '117'")
    
    def test_search_by_customer_name(self):
        """Test: Search by customer name 'ULTIMATE'"""
        response = self.session.get(f"{BASE_URL}/api/part-history/search?q=ULTIMATE")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least one result for ULTIMATE"
        
        # Verify results contain ULTIMATE LASER
        found = any("ULTIMATE" in q.get("customer_name", "").upper() for q in data)
        assert found, "Expected ULTIMATE in customer names"
        
        print(f"SUCCESS: Found {len(data)} results for 'ULTIMATE'")
    
    def test_search_by_bracket(self):
        """Test: Search for 'bracket' returns bracket-related parts"""
        response = self.session.get(f"{BASE_URL}/api/part-history/search?q=bracket")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least one bracket result"
        
        # Verify results contain bracket
        found = any("bracket" in q.get("part_description", "").lower() for q in data)
        assert found, "Expected 'bracket' in part descriptions"
        
        print(f"SUCCESS: Found {len(data)} bracket-related results")
    
    def test_search_no_results(self):
        """Test: Search with non-existent term returns empty list"""
        response = self.session.get(f"{BASE_URL}/api/part-history/search?q=NONEXISTENT12345XYZ")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) == 0, "Expected empty list for non-existent search"
        
        print("SUCCESS: Empty list returned for non-existent search")
    
    # ==================== DETAIL ENDPOINT TESTS ====================
    
    def test_detail_quote_117(self):
        """Test: GET /api/part-history/detail/{quote_id} for Quote #117 (LSS3092)"""
        # First get the quote ID for Quote #117
        search_response = self.session.get(f"{BASE_URL}/api/part-history/search?q=LSS3092")
        assert search_response.status_code == 200
        
        quotes = search_response.json()
        quote_117 = next((q for q in quotes if str(q.get("quote_number")) == "117"), None)
        assert quote_117, "Quote #117 not found"
        
        quote_id = quote_117["id"]
        
        # Get detail
        response = self.session.get(f"{BASE_URL}/api/part-history/detail/{quote_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "quote" in data
        assert "job_sheets" in data
        assert "invoices" in data
        assert "packing_slips" in data
        assert "summary" in data
        
        # Verify quote info
        quote = data["quote"]
        assert quote["quote_number"] == "117"
        assert "LSS3092" in quote["part_description"]
        assert quote["customer_name"] == "ULTIMATE LASER"
        
        # Verify summary stats
        summary = data["summary"]
        assert "times_quoted" in summary
        assert "times_produced" in summary
        assert "times_invoiced" in summary
        assert "total_quantity_produced" in summary
        
        print(f"SUCCESS: Detail for Quote #117 retrieved")
        print(f"  - Times Quoted: {summary['times_quoted']}")
        print(f"  - Job Sheets: {summary['times_produced']}")
        print(f"  - Total Qty: {summary['total_quantity_produced']}")
    
    def test_detail_job_sheet_info(self):
        """Test: Detail endpoint returns job sheet info for Quote #117"""
        # Get Quote #117 ID
        search_response = self.session.get(f"{BASE_URL}/api/part-history/search?q=LSS3092")
        quotes = search_response.json()
        quote_117 = next((q for q in quotes if str(q.get("quote_number")) == "117"), None)
        quote_id = quote_117["id"]
        
        # Get detail
        response = self.session.get(f"{BASE_URL}/api/part-history/detail/{quote_id}")
        data = response.json()
        
        # Verify job sheets
        job_sheets = data["job_sheets"]
        assert len(job_sheets) >= 1, "Expected at least one job sheet"
        
        js = job_sheets[0]
        assert js["job_sheet_number"] == "JS-0045"
        assert js["operator_name"] == "Christian"
        assert js["status"] == "Completed"
        assert js["production_notes"] == "Folded 52 Parts Total"
        assert js["process_name"] == "Press Brake"
        
        print(f"SUCCESS: Job sheet JS-0045 verified")
        print(f"  - Operator: {js['operator_name']}")
        print(f"  - Process: {js['process_name']}")
        print(f"  - Notes: {js['production_notes']}")
    
    def test_detail_time_entries(self):
        """Test: Detail endpoint returns time entries for job sheets"""
        # Get Quote #117 ID
        search_response = self.session.get(f"{BASE_URL}/api/part-history/search?q=LSS3092")
        quotes = search_response.json()
        quote_117 = next((q for q in quotes if str(q.get("quote_number")) == "117"), None)
        quote_id = quote_117["id"]
        
        # Get detail
        response = self.session.get(f"{BASE_URL}/api/part-history/detail/{quote_id}")
        data = response.json()
        
        # Verify time entries in job sheet
        job_sheets = data["job_sheets"]
        js = job_sheets[0]
        
        time_entries = js.get("time_entries", [])
        assert len(time_entries) >= 1, "Expected at least one time entry"
        
        te = time_entries[0]
        assert "operator_name" in te
        assert "process_name" in te
        assert "start_time" in te
        assert "actual_duration_minutes" in te
        
        print(f"SUCCESS: Time entries verified")
        print(f"  - Entries count: {len(time_entries)}")
    
    def test_detail_packing_slips(self):
        """Test: Detail endpoint returns packing slips for Quote #117"""
        # Get Quote #117 ID
        search_response = self.session.get(f"{BASE_URL}/api/part-history/search?q=LSS3092")
        quotes = search_response.json()
        quote_117 = next((q for q in quotes if str(q.get("quote_number")) == "117"), None)
        quote_id = quote_117["id"]
        
        # Get detail
        response = self.session.get(f"{BASE_URL}/api/part-history/detail/{quote_id}")
        data = response.json()
        
        # Verify packing slips
        packing_slips = data["packing_slips"]
        assert len(packing_slips) >= 1, "Expected at least one packing slip"
        
        ps = packing_slips[0]
        assert "packing_slip_number" in ps
        assert ps["packing_slip_number"] == "PS-2025-0029"
        assert ps["status"] == "Completed"
        
        print(f"SUCCESS: Packing slip PS-2025-0029 verified")
    
    def test_detail_nonexistent_quote(self):
        """Test: Detail endpoint returns error for non-existent quote"""
        response = self.session.get(f"{BASE_URL}/api/part-history/detail/nonexistent-id-12345")
        
        assert response.status_code == 200  # API returns 200 with error message
        data = response.json()
        
        assert "error" in data
        assert data["error"] == "Quote not found"
        
        print("SUCCESS: Non-existent quote returns error message")
    
    # ==================== AUTH TESTS ====================
    
    def test_search_requires_auth(self):
        """Test: Search endpoint requires authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/part-history/search")
        
        # Accept both 401 (Unauthorized) and 403 (Forbidden) as valid auth rejection
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print(f"SUCCESS: Search endpoint requires authentication (status: {response.status_code})")
    
    def test_detail_requires_auth(self):
        """Test: Detail endpoint requires authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/part-history/detail/some-id")
        
        # Accept both 401 (Unauthorized) and 403 (Forbidden) as valid auth rejection
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print(f"SUCCESS: Detail endpoint requires authentication (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
