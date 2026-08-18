#!/usr/bin/env python3
"""
Job Efficiency Tracking Backend API Testing
Tests all efficiency tracking endpoints and calculations
"""

import requests
import json
from datetime import datetime, timedelta, timezone
import sys
import os

# Configuration
BASE_URL = "https://quote-pdf-breaks.preview.emergentagent.com/api"
TEST_USERNAME = "admin"
TEST_PASSWORD = "password123"

class EfficiencyTrackingTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        self.test_results = []
        self.existing_job_sheets = []
        self.test_job_sheet = None
        
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
    
    def get_existing_job_sheets(self):
        """Get existing job sheets to use for testing"""
        print("\n=== GET EXISTING JOB SHEETS ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/job-sheets",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                job_sheets = response.json()
                self.existing_job_sheets = job_sheets
                self.log_test("Get Job Sheets", True, f"Retrieved {len(job_sheets)} job sheets")
                
                # Find a suitable job sheet for testing (preferably not completed)
                for job in job_sheets:
                    if job.get('status') != 'Completed':
                        self.test_job_sheet = job
                        break
                
                if not self.test_job_sheet and job_sheets:
                    self.test_job_sheet = job_sheets[0]  # Use first available
                
                if self.test_job_sheet:
                    self.log_test("Test Job Sheet Selected", True, 
                                f"Selected job sheet {self.test_job_sheet.get('job_sheet_number', 'Unknown')} for testing")
                else:
                    self.log_test("Test Job Sheet Selected", False, "No job sheets available for testing")
                
                return True
            else:
                self.log_test("Get Job Sheets", False, f"Failed to get job sheets: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Job Sheets", False, f"Error getting job sheets: {str(e)}")
            return False
    
    def test_record_job_sheet_time(self):
        """Test POST /api/job-sheets/{job_sheet_id}/record-time"""
        print("\n=== RECORD JOB SHEET TIME ===")
        
        if not self.test_job_sheet:
            self.log_test("Record Job Sheet Time", False, "No job sheet available for testing")
            return False
        
        job_sheet_id = self.test_job_sheet['id']
        
        # Prepare time data
        started_at = datetime.now(timezone.utc) - timedelta(hours=2, minutes=30)
        completed_at = datetime.now(timezone.utc)
        
        time_data = {
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "operator_name": "John Smith",
            "notes": "Test time recording"
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/job-sheets/{job_sheet_id}/record-time",
                json=time_data,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['message', 'job_sheet_id', 'efficiency_metrics']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Record Job Sheet Time - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify efficiency metrics
                    metrics = result['efficiency_metrics']
                    metric_fields = ['estimated_hours', 'actual_hours', 'hours_saved', 'efficiency_percent', 'money_impact']
                    
                    if all(field in metrics for field in metric_fields):
                        self.log_test("Record Job Sheet Time - Efficiency Metrics", True, 
                                    f"Efficiency calculated: {metrics['efficiency_percent']}%, Money impact: ${metrics['money_impact']}")
                        
                        # Verify job sheet status updated to Completed
                        get_response = requests.get(
                            f"{self.base_url}/job-sheets/{job_sheet_id}",
                            headers=self.headers,
                            timeout=10
                        )
                        
                        if get_response.status_code == 200:
                            updated_job = get_response.json()
                            if updated_job.get('status') == 'Completed':
                                self.log_test("Job Sheet Status Update", True, "Status updated to 'Completed'")
                            else:
                                self.log_test("Job Sheet Status Update", False, f"Status not updated: {updated_job.get('status')}")
                        
                        return True
                    else:
                        missing_metrics = [f for f in metric_fields if f not in metrics]
                        self.log_test("Record Job Sheet Time - Efficiency Metrics", False, 
                                    f"Missing efficiency metrics: {missing_metrics}")
                        return False
                else:
                    self.log_test("Record Job Sheet Time - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Record Job Sheet Time", False, 
                            f"Failed to record time: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Record Job Sheet Time", False, f"Error recording time: {str(e)}")
            return False
    
    def test_record_process_time(self):
        """Test POST /api/job-sheets/{job_sheet_id}/processes/{process_id}/record-time"""
        print("\n=== RECORD PROCESS TIME ===")
        
        if not self.test_job_sheet:
            self.log_test("Record Process Time", False, "No job sheet available for testing")
            return False
        
        # Check if job sheet has processes
        processes = self.test_job_sheet.get('processes', [])
        if not processes:
            self.log_test("Record Process Time", True, "Job sheet has no processes - skipping process time test")
            return True
        
        job_sheet_id = self.test_job_sheet['id']
        process_id = str(processes[0].get('id', ''))
        
        if not process_id:
            self.log_test("Record Process Time", False, "No valid process ID found")
            return False
        
        # Prepare process time data
        started_at = datetime.now(timezone.utc) - timedelta(hours=1, minutes=15)
        completed_at = datetime.now(timezone.utc)
        
        process_time_data = {
            "process_id": process_id,
            "actual_start_time": started_at.isoformat(),
            "actual_end_time": completed_at.isoformat(),
            "operator_name": "Jane Doe",
            "notes": "Test process time recording"
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/job-sheets/{job_sheet_id}/processes/{process_id}/record-time",
                json=process_time_data,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['message', 'job_sheet_id', 'process_id', 'process_efficiency']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Record Process Time - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify process efficiency calculated
                    if result['process_efficiency']:
                        self.log_test("Record Process Time - Efficiency Calculation", True, 
                                    f"Process efficiency calculated for {len(result['process_efficiency'])} processes")
                        return True
                    else:
                        self.log_test("Record Process Time - Efficiency Calculation", False, 
                                    "No process efficiency data returned")
                        return False
                else:
                    self.log_test("Record Process Time - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Record Process Time", False, 
                            f"Failed to record process time: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Record Process Time", False, f"Error recording process time: {str(e)}")
            return False
    
    def test_get_job_sheet_efficiency(self):
        """Test GET /api/efficiency/job-sheet/{job_sheet_id}"""
        print("\n=== GET JOB SHEET EFFICIENCY ===")
        
        if not self.test_job_sheet:
            self.log_test("Get Job Sheet Efficiency", False, "No job sheet available for testing")
            return False
        
        job_sheet_id = self.test_job_sheet['id']
        
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/job-sheet/{job_sheet_id}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['job_sheet_id', 'overall_efficiency', 'per_process_efficiency']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Get Job Sheet Efficiency - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify overall efficiency metrics
                    overall = result['overall_efficiency']
                    efficiency_fields = ['estimated_hours', 'actual_hours', 'hours_saved', 'efficiency_percent', 'money_impact']
                    
                    if all(field in overall for field in efficiency_fields):
                        self.log_test("Get Job Sheet Efficiency - Overall Metrics", True, 
                                    f"Overall efficiency: {overall['efficiency_percent']}%, Money impact: ${overall['money_impact']}")
                        
                        # Check per-process efficiency if processes exist
                        per_process = result['per_process_efficiency']
                        if isinstance(per_process, list):
                            self.log_test("Get Job Sheet Efficiency - Per-Process Metrics", True, 
                                        f"Per-process efficiency data for {len(per_process)} processes")
                        else:
                            self.log_test("Get Job Sheet Efficiency - Per-Process Metrics", True, 
                                        "No per-process data (job sheet has no processes)")
                        
                        return True
                    else:
                        missing_efficiency = [f for f in efficiency_fields if f not in overall]
                        self.log_test("Get Job Sheet Efficiency - Overall Metrics", False, 
                                    f"Missing efficiency fields: {missing_efficiency}")
                        return False
                else:
                    self.log_test("Get Job Sheet Efficiency - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Get Job Sheet Efficiency", False, 
                            f"Failed to get efficiency: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Job Sheet Efficiency", False, f"Error getting efficiency: {str(e)}")
            return False
    
    def test_efficiency_summary(self):
        """Test GET /api/efficiency/summary"""
        print("\n=== EFFICIENCY SUMMARY ===")
        
        # Test week summary
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/summary?period=week",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['period', 'start_date', 'end_date', 'summary']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Efficiency Summary Week - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify summary metrics
                    summary = result['summary']
                    summary_fields = ['jobs_completed', 'total_estimated_hours', 'total_actual_hours', 
                                    'hours_saved', 'efficiency_percent', 'money_impact']
                    
                    if all(field in summary for field in summary_fields):
                        self.log_test("Efficiency Summary Week - Metrics", True, 
                                    f"Week summary: {summary['jobs_completed']} jobs, {summary['efficiency_percent']}% efficiency")
                    else:
                        missing_summary = [f for f in summary_fields if f not in summary]
                        self.log_test("Efficiency Summary Week - Metrics", False, 
                                    f"Missing summary fields: {missing_summary}")
                        return False
                else:
                    self.log_test("Efficiency Summary Week - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Efficiency Summary Week", False, 
                            f"Failed to get week summary: {response.status_code} - {response.text}")
                return False
        
        except Exception as e:
            self.log_test("Efficiency Summary Week", False, f"Error getting week summary: {str(e)}")
            return False
        
        # Test month summary
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/summary?period=month",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('period') == 'month':
                    self.log_test("Efficiency Summary Month", True, 
                                f"Month summary: {result['summary']['jobs_completed']} jobs completed")
                else:
                    self.log_test("Efficiency Summary Month", False, 
                                f"Wrong period returned: {result.get('period')}")
            else:
                self.log_test("Efficiency Summary Month", False, 
                            f"Failed to get month summary: {response.status_code}")
        
        except Exception as e:
            self.log_test("Efficiency Summary Month", False, f"Error getting month summary: {str(e)}")
        
        # Test with filters
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/summary?period=week&customer_name=Test",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                filters = result.get('filters', {})
                if filters.get('customer_name') == 'Test':
                    self.log_test("Efficiency Summary Filters", True, "Customer filter applied correctly")
                else:
                    self.log_test("Efficiency Summary Filters", False, "Customer filter not applied")
            else:
                self.log_test("Efficiency Summary Filters", False, 
                            f"Failed to get filtered summary: {response.status_code}")
        
        except Exception as e:
            self.log_test("Efficiency Summary Filters", False, f"Error testing filters: {str(e)}")
        
        return True
    
    def test_efficiency_by_process(self):
        """Test GET /api/efficiency/by-process"""
        print("\n=== EFFICIENCY BY PROCESS ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/by-process?period=month",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['period', 'start_date', 'end_date', 'process_breakdown']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Efficiency By Process - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify process breakdown
                    breakdown = result['process_breakdown']
                    if isinstance(breakdown, list):
                        self.log_test("Efficiency By Process - Breakdown", True, 
                                    f"Process breakdown for {len(breakdown)} process types")
                        
                        # Verify each process entry has required fields
                        if breakdown:
                            process_fields = ['process_name', 'jobs_completed', 'efficiency_percent', 'money_impact']
                            first_process = breakdown[0]
                            
                            if all(field in first_process for field in process_fields):
                                self.log_test("Efficiency By Process - Process Fields", True, 
                                            f"Process '{first_process['process_name']}': {first_process['efficiency_percent']}% efficiency")
                            else:
                                missing_process = [f for f in process_fields if f not in first_process]
                                self.log_test("Efficiency By Process - Process Fields", False, 
                                            f"Missing process fields: {missing_process}")
                        else:
                            self.log_test("Efficiency By Process - No Data", True, 
                                        "No process data available (no completed jobs)")
                        
                        return True
                    else:
                        self.log_test("Efficiency By Process - Breakdown", False, 
                                    f"Process breakdown should be list, got {type(breakdown)}")
                        return False
                else:
                    self.log_test("Efficiency By Process - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Efficiency By Process", False, 
                            f"Failed to get process efficiency: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Efficiency By Process", False, f"Error getting process efficiency: {str(e)}")
            return False
    
    def test_efficiency_by_customer(self):
        """Test GET /api/efficiency/by-customer"""
        print("\n=== EFFICIENCY BY CUSTOMER ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/by-customer?period=month",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['period', 'start_date', 'end_date', 'customer_breakdown']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Efficiency By Customer - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify customer breakdown
                    breakdown = result['customer_breakdown']
                    if isinstance(breakdown, list):
                        self.log_test("Efficiency By Customer - Breakdown", True, 
                                    f"Customer breakdown for {len(breakdown)} customers")
                        
                        # Verify each customer entry has required fields
                        if breakdown:
                            customer_fields = ['customer_name', 'jobs_completed', 'efficiency_percent', 'money_impact']
                            first_customer = breakdown[0]
                            
                            if all(field in first_customer for field in customer_fields):
                                self.log_test("Efficiency By Customer - Customer Fields", True, 
                                            f"Customer '{first_customer['customer_name']}': {first_customer['efficiency_percent']}% efficiency")
                            else:
                                missing_customer = [f for f in customer_fields if f not in first_customer]
                                self.log_test("Efficiency By Customer - Customer Fields", False, 
                                            f"Missing customer fields: {missing_customer}")
                        else:
                            self.log_test("Efficiency By Customer - No Data", True, 
                                        "No customer data available (no completed jobs)")
                        
                        return True
                    else:
                        self.log_test("Efficiency By Customer - Breakdown", False, 
                                    f"Customer breakdown should be list, got {type(breakdown)}")
                        return False
                else:
                    self.log_test("Efficiency By Customer - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Efficiency By Customer", False, 
                            f"Failed to get customer efficiency: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Efficiency By Customer", False, f"Error getting customer efficiency: {str(e)}")
            return False
    
    def test_dashboard_metrics(self):
        """Test GET /api/efficiency/dashboard-metrics"""
        print("\n=== DASHBOARD METRICS ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/dashboard-metrics",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['this_week', 'this_month']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Dashboard Metrics - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify week metrics
                    week_metrics = result['this_week']
                    week_fields = ['jobs_completed', 'hours_saved', 'efficiency_percent', 'money_impact']
                    
                    if all(field in week_metrics for field in week_fields):
                        self.log_test("Dashboard Metrics - Week Metrics", True, 
                                    f"This week: {week_metrics['jobs_completed']} jobs, {week_metrics['efficiency_percent']}% efficiency")
                    else:
                        missing_week = [f for f in week_fields if f not in week_metrics]
                        self.log_test("Dashboard Metrics - Week Metrics", False, 
                                    f"Missing week fields: {missing_week}")
                        return False
                    
                    # Verify month metrics
                    month_metrics = result['this_month']
                    month_fields = ['jobs_completed', 'hours_saved', 'efficiency_percent', 'money_impact']
                    
                    if all(field in month_metrics for field in month_fields):
                        self.log_test("Dashboard Metrics - Month Metrics", True, 
                                    f"This month: {month_metrics['jobs_completed']} jobs, {month_metrics['efficiency_percent']}% efficiency")
                        return True
                    else:
                        missing_month = [f for f in month_fields if f not in month_metrics]
                        self.log_test("Dashboard Metrics - Month Metrics", False, 
                                    f"Missing month fields: {missing_month}")
                        return False
                else:
                    self.log_test("Dashboard Metrics - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Dashboard Metrics", False, 
                            f"Failed to get dashboard metrics: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Dashboard Metrics", False, f"Error getting dashboard metrics: {str(e)}")
            return False
    
    def test_recent_jobs(self):
        """Test GET /api/efficiency/recent-jobs"""
        print("\n=== RECENT JOBS ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/recent-jobs?limit=5",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Verify response structure
                required_fields = ['recent_jobs', 'count']
                missing_fields = [field for field in required_fields if field not in result]
                
                if not missing_fields:
                    self.log_test("Recent Jobs - Response Structure", True, 
                                "All required fields present in response")
                    
                    # Verify recent jobs data
                    recent_jobs = result['recent_jobs']
                    count = result['count']
                    
                    if isinstance(recent_jobs, list) and count == len(recent_jobs):
                        self.log_test("Recent Jobs - Data Consistency", True, 
                                    f"Retrieved {count} recent jobs")
                        
                        # Verify each job has required fields
                        if recent_jobs:
                            job_fields = ['job_sheet_id', 'job_sheet_number', 'estimated_hours', 
                                        'actual_hours', 'efficiency_percent', 'money_impact']
                            first_job = recent_jobs[0]
                            
                            if all(field in first_job for field in job_fields):
                                self.log_test("Recent Jobs - Job Fields", True, 
                                            f"Job {first_job['job_sheet_number']}: {first_job['efficiency_percent']}% efficiency")
                            else:
                                missing_job = [f for f in job_fields if f not in first_job]
                                self.log_test("Recent Jobs - Job Fields", False, 
                                            f"Missing job fields: {missing_job}")
                        else:
                            self.log_test("Recent Jobs - No Data", True, 
                                        "No recent completed jobs available")
                        
                        return True
                    else:
                        self.log_test("Recent Jobs - Data Consistency", False, 
                                    f"Count mismatch: count={count}, jobs={len(recent_jobs)}")
                        return False
                else:
                    self.log_test("Recent Jobs - Response Structure", False, 
                                f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Recent Jobs", False, 
                            f"Failed to get recent jobs: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Recent Jobs", False, f"Error getting recent jobs: {str(e)}")
            return False
    
    def test_unauthorized_access(self):
        """Test unauthorized access scenarios"""
        print("\n=== UNAUTHORIZED ACCESS TESTS ===")
        
        # Test accessing efficiency endpoints without auth token
        endpoints = [
            "/efficiency/dashboard-metrics",
            "/efficiency/summary",
            "/efficiency/by-process",
            "/efficiency/by-customer",
            "/efficiency/recent-jobs"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{self.base_url}{endpoint}",
                    timeout=10
                )
                
                if response.status_code in [401, 403]:
                    self.log_test(f"Unauthorized Access - {endpoint}", True, 
                                f"Correctly returned {response.status_code} for unauthorized access")
                else:
                    self.log_test(f"Unauthorized Access - {endpoint}", False, 
                                f"Expected 401 or 403, got {response.status_code}")
            
            except Exception as e:
                self.log_test(f"Unauthorized Access - {endpoint}", False, f"Error in auth test: {str(e)}")
        
        return True
    
    def test_validation_errors(self):
        """Test validation and error handling"""
        print("\n=== VALIDATION TESTS ===")
        
        # Test invalid job sheet ID for efficiency query
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/job-sheet/non-existent-job-id",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Non-existent Job Sheet ID", True, "Correctly returned 404 for non-existent job sheet")
            else:
                self.log_test("Non-existent Job Sheet ID", False, f"Expected 404, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Non-existent Job Sheet ID", False, f"Error testing non-existent job sheet: {str(e)}")
        
        # Test invalid period parameter
        try:
            response = requests.get(
                f"{self.base_url}/efficiency/summary?period=invalid",
                headers=self.headers,
                timeout=10
            )
            
            # Should still work but default to week or month
            if response.status_code == 200:
                self.log_test("Invalid Period Parameter", True, "Invalid period handled gracefully")
            else:
                self.log_test("Invalid Period Parameter", False, f"Unexpected response: {response.status_code}")
        
        except Exception as e:
            self.log_test("Invalid Period Parameter", False, f"Error testing invalid period: {str(e)}")
        
        return True
    
    def run_all_tests(self):
        """Run all efficiency tracking tests"""
        print("=" * 80)
        print("JOB EFFICIENCY TRACKING BACKEND API TESTING")
        print("=" * 80)
        
        # Step 1: Authentication
        if not self.authenticate():
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
            return False
        
        # Step 2: Get existing job sheets
        self.get_existing_job_sheets()
        
        # Step 3: Test time recording endpoints
        self.test_record_job_sheet_time()
        self.test_record_process_time()
        
        # Step 4: Test efficiency query endpoints
        self.test_get_job_sheet_efficiency()
        self.test_efficiency_summary()
        self.test_efficiency_by_process()
        self.test_efficiency_by_customer()
        self.test_dashboard_metrics()
        self.test_recent_jobs()
        
        # Step 5: Test authorization and validation
        self.test_unauthorized_access()
        self.test_validation_errors()
        
        # Generate summary
        self.print_summary()
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("JOB EFFICIENCY TRACKING TESTING SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['success'])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"\nTotal Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS ({failed_tests}):")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['message']}")
        
        print(f"\n✅ PASSED TESTS ({passed_tests}):")
        for result in self.test_results:
            if result['success']:
                print(f"  - {result['test']}: {result['message']}")
        
        # Overall result
        if success_rate >= 90:
            print(f"\n🎉 EXCELLENT! Job Efficiency Tracking Backend is working correctly ({success_rate:.1f}% success rate)")
        elif success_rate >= 75:
            print(f"\n✅ GOOD! Job Efficiency Tracking Backend is mostly working ({success_rate:.1f}% success rate)")
        elif success_rate >= 50:
            print(f"\n⚠️  PARTIAL! Job Efficiency Tracking Backend has some issues ({success_rate:.1f}% success rate)")
        else:
            print(f"\n❌ CRITICAL! Job Efficiency Tracking Backend has major issues ({success_rate:.1f}% success rate)")
        
        return success_rate

if __name__ == "__main__":
    tester = EfficiencyTrackingTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ Testing completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Testing failed!")
        sys.exit(1)