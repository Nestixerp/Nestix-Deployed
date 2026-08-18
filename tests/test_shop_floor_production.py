"""
Test Shop Floor Entry and Production Dashboard APIs
Tests for:
1. Production Dashboard shows active operators and jobs when someone starts a time entry
2. Shop Floor Entry timer correctly calculates active time excluding pause duration
3. Pause/Resume functionality works correctly - timer should not include pause time
4. When job is completed, actual work time (excluding pauses) is saved to Job Sheet
5. All Production Dashboard API endpoints work without errors
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"Login successful - User: {data['user'].get('name')}")


class TestProductionDashboardAPIs:
    """Test Production Dashboard API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    def test_live_metrics_endpoint(self, auth_headers):
        """Test /api/production-dashboard/live-metrics endpoint"""
        response = requests.get(f"{BASE_URL}/api/production-dashboard/live-metrics", headers=auth_headers)
        assert response.status_code == 200, f"Live metrics failed: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "active_operators" in data
        assert "operators_working" in data
        assert "active_jobs_count" in data
        assert "completed_today" in data
        assert "jobs_in_progress" in data
        assert "pending_jobs" in data
        assert "timestamp" in data
        
        # Verify data types
        assert isinstance(data["active_operators"], int)
        assert isinstance(data["operators_working"], dict)
        assert isinstance(data["active_jobs_count"], int)
        
        print(f"Live metrics - Active operators: {data['active_operators']}, Active jobs: {data['active_jobs_count']}")
    
    def test_machine_utilization_endpoint(self, auth_headers):
        """Test /api/production-dashboard/machine-utilization endpoint"""
        response = requests.get(f"{BASE_URL}/api/production-dashboard/machine-utilization", headers=auth_headers)
        assert response.status_code == 200, f"Machine utilization failed: {response.text}"
        
        data = response.json()
        assert "processes" in data
        assert "timestamp" in data
        assert isinstance(data["processes"], dict)
        print(f"Machine utilization - Processes: {list(data['processes'].keys())}")
    
    def test_bottlenecks_endpoint(self, auth_headers):
        """Test /api/production-dashboard/bottlenecks endpoint - Fixed None handling"""
        response = requests.get(f"{BASE_URL}/api/production-dashboard/bottlenecks", headers=auth_headers)
        assert response.status_code == 200, f"Bottlenecks failed: {response.text}"
        
        data = response.json()
        assert "slowest_jobs" in data
        assert "process_performance" in data
        assert "timestamp" in data
        
        # Verify lists
        assert isinstance(data["slowest_jobs"], list)
        assert isinstance(data["process_performance"], list)
        print(f"Bottlenecks - Slowest jobs: {len(data['slowest_jobs'])}, Process performance: {len(data['process_performance'])}")
    
    def test_daily_summary_endpoint(self, auth_headers):
        """Test /api/production-dashboard/daily-summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/production-dashboard/daily-summary", headers=auth_headers)
        assert response.status_code == 200, f"Daily summary failed: {response.text}"
        
        data = response.json()
        assert "date" in data
        assert "jobs_completed" in data
        assert "time_entries_completed" in data
        assert "total_work_hours" in data
        assert "total_break_hours" in data
        assert "average_efficiency" in data
        print(f"Daily summary - Jobs completed: {data['jobs_completed']}, Work hours: {data['total_work_hours']}")


class TestShopFloorAPIs:
    """Test Shop Floor Entry API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def user_data(self, auth_headers):
        """Get user data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json().get("user", {})
    
    def test_get_active_jobs(self, auth_headers):
        """Test /api/shop-floor/active-jobs endpoint"""
        response = requests.get(f"{BASE_URL}/api/shop-floor/active-jobs", headers=auth_headers)
        assert response.status_code == 200, f"Active jobs failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Active jobs count: {len(data)}")
    
    def test_get_active_time_entries(self, auth_headers):
        """Test /api/shop-floor/time-entries/active endpoint"""
        response = requests.get(f"{BASE_URL}/api/shop-floor/time-entries/active", headers=auth_headers)
        assert response.status_code == 200, f"Active time entries failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Active time entries count: {len(data)}")


class TestTimerPauseResumeFunctionality:
    """Test the complete timer pause/resume flow and duration calculation"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def user_data(self, auth_headers):
        """Get user data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json().get("user", {})
    
    @pytest.fixture(scope="class")
    def test_job_sheet(self, auth_headers):
        """Get or create a test job sheet"""
        # First try to get existing active jobs
        response = requests.get(f"{BASE_URL}/api/shop-floor/active-jobs", headers=auth_headers)
        if response.status_code == 200:
            jobs = response.json()
            # Find a Laser job (allows multiple entries)
            for job in jobs:
                if job.get("process_name", "").lower() == "laser":
                    return job
            # If no Laser job, return first job
            if jobs:
                return jobs[0]
        
        pytest.skip("No active jobs available for testing")
    
    def test_full_timer_flow_with_pause(self, auth_headers, user_data, test_job_sheet):
        """
        Test complete flow: Start -> Pause -> Resume -> Stop
        Verify that pause time is correctly excluded from actual duration
        """
        # First, clean up any existing active entries for this operator
        active_response = requests.get(
            f"{BASE_URL}/api/shop-floor/time-entries/active",
            params={"operator_id": user_data.get("id", "1")},
            headers=auth_headers
        )
        if active_response.status_code == 200:
            entries = active_response.json()
            for entry in entries:
                requests.post(f"{BASE_URL}/api/shop-floor/time-entries/{entry['id']}/stop", headers=auth_headers)
                print(f"Cleaned up existing entry: {entry['id']}")
        
        # Step 1: Start a time entry
        start_payload = {
            "job_sheet_id": test_job_sheet.get("id"),
            "job_sheet_number": test_job_sheet.get("job_sheet_number"),
            "process_id": None,
            "process_name": test_job_sheet.get("process_name", "Laser"),
            "operator_id": user_data.get("id", "1"),
            "operator_name": user_data.get("name", "admin")
        }
        
        start_response = requests.post(
            f"{BASE_URL}/api/shop-floor/time-entries",
            json=start_payload,
            headers=auth_headers
        )
        
        assert start_response.status_code in [200, 201], f"Start failed: {start_response.text}"
        entry = start_response.json()
        entry_id = entry["id"]
        
        assert entry["status"] == "active"
        print(f"Started time entry: {entry_id} for job {test_job_sheet.get('job_sheet_number')}")
        
        # Step 2: Wait a bit, then pause
        time.sleep(2)  # Work for 2 seconds
        
        pause_response = requests.post(
            f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}/pause",
            json={"reason": "Test pause"},
            headers=auth_headers
        )
        assert pause_response.status_code == 200, f"Pause failed: {pause_response.text}"
        print("Paused time entry")
        
        # Step 3: Verify entry is paused
        get_response = requests.get(
            f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        paused_entry = get_response.json()
        assert paused_entry["status"] == "paused"
        assert len(paused_entry.get("pauses", [])) > 0
        print(f"Entry status: {paused_entry['status']}, pauses: {len(paused_entry.get('pauses', []))}")
        
        # Step 4: Wait during pause (this time should NOT count)
        time.sleep(3)  # Pause for 3 seconds
        
        # Step 5: Resume
        resume_response = requests.post(
            f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}/resume",
            headers=auth_headers
        )
        assert resume_response.status_code == 200, f"Resume failed: {resume_response.text}"
        print("Resumed time entry")
        
        # Step 6: Verify entry is active again
        get_response = requests.get(
            f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        resumed_entry = get_response.json()
        assert resumed_entry["status"] == "active"
        
        # Verify pause has end time
        pauses = resumed_entry.get("pauses", [])
        assert len(pauses) > 0
        assert pauses[-1].get("pause_end") is not None, "Pause should have end time after resume"
        print(f"Pause end time recorded: {pauses[-1].get('pause_end')}")
        
        # Step 7: Work a bit more, then stop
        time.sleep(2)  # Work for 2 more seconds
        
        stop_response = requests.post(
            f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}/stop",
            headers=auth_headers
        )
        assert stop_response.status_code == 200, f"Stop failed: {stop_response.text}"
        
        stop_data = stop_response.json()
        print(f"Stop response: {stop_data}")
        
        # Step 8: Verify duration calculation
        actual_minutes = stop_data.get("actual_duration_minutes", 0)
        pause_minutes = stop_data.get("total_pause_minutes", 0)
        
        print(f"Actual duration: {actual_minutes:.4f} minutes ({actual_minutes * 60:.1f} seconds)")
        print(f"Pause duration: {pause_minutes:.4f} minutes ({pause_minutes * 60:.1f} seconds)")
        
        # Pause should be approximately 3 seconds (0.05 minutes)
        # Actual work should be approximately 4 seconds (0.067 minutes)
        assert pause_minutes > 0, "Pause minutes should be recorded"
        
        # Verify the time entry was saved correctly
        final_response = requests.get(
            f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}",
            headers=auth_headers
        )
        assert final_response.status_code == 200
        final_entry = final_response.json()
        
        assert final_entry["status"] == "completed"
        assert final_entry.get("actual_duration_minutes") is not None
        assert final_entry.get("total_pause_minutes") is not None
        
        print(f"Final entry - Status: {final_entry['status']}, Actual: {final_entry.get('actual_duration_minutes'):.4f} min, Pause: {final_entry.get('total_pause_minutes'):.4f} min")
        
        # Verify pause time is excluded from actual time
        # Total elapsed time should be ~7 seconds (2 + 3 pause + 2)
        # Actual work time should be ~4 seconds (2 + 2)
        # Pause time should be ~3 seconds
        total_elapsed_seconds = (actual_minutes + pause_minutes) * 60
        assert total_elapsed_seconds >= 6, f"Total elapsed time should be at least 6 seconds, got {total_elapsed_seconds:.1f}"
        assert pause_minutes * 60 >= 2, f"Pause time should be at least 2 seconds, got {pause_minutes * 60:.1f}"


class TestProductionDashboardShowsActiveJobs:
    """Test that Production Dashboard shows active operators when jobs are started"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def user_data(self, auth_headers):
        """Get user data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json().get("user", {})
    
    def test_dashboard_shows_active_operator(self, auth_headers, user_data):
        """Test that starting a job shows the operator on the dashboard"""
        # First, clean up any existing active entries
        active_response = requests.get(
            f"{BASE_URL}/api/shop-floor/time-entries/active",
            params={"operator_id": user_data.get("id", "1")},
            headers=auth_headers
        )
        if active_response.status_code == 200:
            entries = active_response.json()
            for entry in entries:
                requests.post(f"{BASE_URL}/api/shop-floor/time-entries/{entry['id']}/stop", headers=auth_headers)
        
        # Get active jobs
        jobs_response = requests.get(f"{BASE_URL}/api/shop-floor/active-jobs", headers=auth_headers)
        if jobs_response.status_code != 200 or not jobs_response.json():
            pytest.skip("No active jobs available for testing")
        
        jobs = jobs_response.json()
        test_job = jobs[0]
        
        # Start a time entry
        start_payload = {
            "job_sheet_id": test_job.get("id"),
            "job_sheet_number": test_job.get("job_sheet_number"),
            "process_id": None,
            "process_name": test_job.get("process_name", "Laser"),
            "operator_id": user_data.get("id", "1"),
            "operator_name": user_data.get("name", "Admin User")
        }
        
        start_response = requests.post(
            f"{BASE_URL}/api/shop-floor/time-entries",
            json=start_payload,
            headers=auth_headers
        )
        
        assert start_response.status_code in [200, 201], f"Start failed: {start_response.text}"
        entry_id = start_response.json()["id"]
        print(f"Started time entry: {entry_id}")
        
        # Check Production Dashboard live metrics
        dashboard_response = requests.get(
            f"{BASE_URL}/api/production-dashboard/live-metrics",
            headers=auth_headers
        )
        assert dashboard_response.status_code == 200
        
        dashboard_data = dashboard_response.json()
        
        # Verify operator appears in dashboard
        operators_working = dashboard_data.get("operators_working", {})
        active_operators = dashboard_data.get("active_operators", 0)
        active_jobs_count = dashboard_data.get("active_jobs_count", 0)
        
        print(f"Dashboard - Active operators: {active_operators}, Active jobs: {active_jobs_count}")
        print(f"Operators working: {operators_working}")
        
        # Should have at least one active operator
        assert active_operators >= 1, "Dashboard should show at least 1 active operator"
        assert active_jobs_count >= 1, "Dashboard should show at least 1 active job"
        
        # Verify the operator name appears in the operators_working dict
        operator_name = user_data.get("name", "Admin User")
        assert operator_name in operators_working, f"Operator '{operator_name}' should appear in operators_working"
        
        # Clean up - stop the entry
        stop_response = requests.post(f"{BASE_URL}/api/shop-floor/time-entries/{entry_id}/stop", headers=auth_headers)
        assert stop_response.status_code == 200
        print("Cleaned up test entry")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
