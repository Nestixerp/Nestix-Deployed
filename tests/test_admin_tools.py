"""
Test Admin Tools - Fix Invoiced Packing Slips API
Tests the preview and execute endpoints for the packing slip fix feature
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminToolsPackingSlipFix:
    """Tests for the Admin Tools - Fix Invoiced Packing Slips feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "test123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    def test_preview_endpoint_returns_200(self):
        """Test GET /api/settings/admin/fix-invoiced-packing-slips/preview returns 200"""
        response = self.session.get(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/preview")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "packing_slips_to_fix" in data, "Missing packing_slips_to_fix field"
        assert "count_to_fix" in data, "Missing count_to_fix field"
        assert "database_stats" in data, "Missing database_stats field"
        
        # Verify database_stats structure
        stats = data["database_stats"]
        assert "total_packing_slips" in stats, "Missing total_packing_slips in stats"
        assert "currently_marked_invoiced" in stats, "Missing currently_marked_invoiced in stats"
        assert "completed_but_not_invoiced" in stats, "Missing completed_but_not_invoiced in stats"
        
        # Verify count_to_fix matches array length
        assert data["count_to_fix"] == len(data["packing_slips_to_fix"]), \
            f"count_to_fix ({data['count_to_fix']}) doesn't match array length ({len(data['packing_slips_to_fix'])})"
        
        print(f"Preview returned: {data['count_to_fix']} packing slips to fix")
        print(f"Database stats: {stats}")
    
    def test_preview_endpoint_data_types(self):
        """Test that preview endpoint returns correct data types"""
        response = self.session.get(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/preview")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify data types
        assert isinstance(data["packing_slips_to_fix"], list), "packing_slips_to_fix should be a list"
        assert isinstance(data["count_to_fix"], int), "count_to_fix should be an integer"
        assert isinstance(data["database_stats"], dict), "database_stats should be a dict"
        
        stats = data["database_stats"]
        assert isinstance(stats["total_packing_slips"], int), "total_packing_slips should be int"
        assert isinstance(stats["currently_marked_invoiced"], int), "currently_marked_invoiced should be int"
        assert isinstance(stats["completed_but_not_invoiced"], int), "completed_but_not_invoiced should be int"
    
    def test_execute_endpoint_returns_200(self):
        """Test POST /api/settings/admin/fix-invoiced-packing-slips/execute returns 200"""
        response = self.session.post(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/execute")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "updated_count" in data, "Missing updated_count field"
        assert "fixed_items" in data, "Missing fixed_items field"
        assert "database_stats" in data, "Missing database_stats field"
        
        print(f"Execute returned: {data['updated_count']} packing slips fixed")
    
    def test_execute_endpoint_data_types(self):
        """Test that execute endpoint returns correct data types"""
        response = self.session.post(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/execute")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify data types
        assert isinstance(data["updated_count"], int), "updated_count should be an integer"
        assert isinstance(data["fixed_items"], list), "fixed_items should be a list"
        assert isinstance(data["database_stats"], dict), "database_stats should be a dict"
    
    def test_preview_after_execute_shows_zero_to_fix(self):
        """Test that after execute, preview shows 0 items to fix (idempotent)"""
        # First execute to fix any pending items
        self.session.post(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/execute")
        
        # Then preview should show 0 to fix
        response = self.session.get(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/preview")
        
        assert response.status_code == 200
        data = response.json()
        
        # After execute, count_to_fix should be 0
        assert data["count_to_fix"] == 0, f"Expected 0 items to fix after execute, got {data['count_to_fix']}"
        print("Verified: After execute, preview shows 0 items to fix (idempotent)")


class TestAdminToolsUnauthorized:
    """Test that admin endpoints require authentication"""
    
    def test_preview_requires_auth(self):
        """Test that preview endpoint requires authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.get(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/preview")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_execute_requires_auth(self):
        """Test that execute endpoint requires authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/settings/admin/fix-invoiced-packing-slips/execute")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
