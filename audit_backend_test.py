#!/usr/bin/env python3
"""
Backend API Testing for ISO/IMS Audit Management System
Tests Audit Reports CRUD, Audit Findings, and validation functionality
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
REQUIRED_MODULE = "quality_audits"

class AuditManagementTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        self.test_results = []
        self.created_audits = []
        self.created_findings = []
        
        # Sample audit data for testing
        self.sample_audit = {
            "report_number": "AR-2025-TEST",
            "auditor_name": "Test Auditor",
            "client_name": "Test Client",
            "assessed_sites": "Test Site",
            "standards_audited": ["ISO 9001:2015", "ISO 14001:2015"],
            "scope_of_audit": "Manufacturing processes",
            "exclusions": "Design and development",
            "audit_start_date": "2025-10-27T00:00:00Z",
            "audit_end_date": "2025-10-28T00:00:00Z"
        }
        
        # Sample finding update data
        self.sample_finding_update = {
            "evidence": "Test evidence observation",
            "findings": "Test findings description",
            "finding_type": "Minor NCR",
            "ncr_number": "NCR-001",
            "ncr_date": "2025-10-27T00:00:00Z",
            "is_follow_up_required": True
        }
        
        # Expected default clauses (24 total)
        self.expected_clauses = [
            "1.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9",
            "2.10", "2.11", "2.12", "2.13", "2.14", "2.15", "2.16", "2.17", "2.18", 
            "2.19", "2.20", "2.21", "3.0", "4.0"
        ]
        
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
        """Authenticate and get JWT token with quality_audits module access"""
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
                
                # Check if user has quality_audits module access
                user_modules = data.get("user", {}).get("modules", [])
                if REQUIRED_MODULE in user_modules:
                    self.log_test("Authentication", True, f"Successfully logged in as {TEST_USERNAME} with {REQUIRED_MODULE} module access")
                    return True
                else:
                    self.log_test("Authentication", False, f"User {TEST_USERNAME} does not have {REQUIRED_MODULE} module access. Available modules: {user_modules}")
                    return False
            else:
                self.log_test("Authentication", False, f"Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Authentication", False, f"Authentication error: {str(e)}")
            return False
    
    def test_get_audits_empty(self):
        """Test getting audits when none exist (should return empty array)"""
        print("\n=== GET AUDITS (EMPTY) ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/audits",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                audits = response.json()
                if isinstance(audits, list):
                    self.log_test("Get Audits Empty", True, f"Retrieved {len(audits)} audits (empty array expected)")
                    return True
                else:
                    self.log_test("Get Audits Empty", False, f"Expected array, got {type(audits)}")
                    return False
            else:
                self.log_test("Get Audits Empty", False, f"Failed to get audits: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Audits Empty", False, f"Error getting audits: {str(e)}")
            return False
    
    def test_create_audit_report(self):
        """Test creating an audit report with automatic clause generation"""
        print("\n=== CREATE AUDIT REPORT ===")
        
        try:
            response = requests.post(
                f"{self.base_url}/audits",
                json=self.sample_audit,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 201:
                audit = response.json()
                self.created_audits.append(audit)
                
                # Verify required fields
                required_fields = ['id', 'report_number', 'auditor_name', 'client_name', 'assessed_sites', 
                                 'standards_audited', 'scope_of_audit', 'exclusions', 'created_at', 'updated_at']
                missing_fields = [field for field in required_fields if field not in audit]
                
                if not missing_fields:
                    self.log_test("Create Audit Report", True, 
                                f"Created audit report {audit['report_number']} for {audit['client_name']}")
                    
                    # Verify audit dates
                    if audit.get('audit_start_date') and audit.get('audit_end_date'):
                        self.log_test("Audit Dates", True, 
                                    f"Start: {audit['audit_start_date']}, End: {audit['audit_end_date']}")
                    else:
                        self.log_test("Audit Dates", False, "Audit dates not set correctly")
                    
                    # Verify standards audited
                    expected_standards = ["ISO 9001:2015", "ISO 14001:2015"]
                    if audit.get('standards_audited') == expected_standards:
                        self.log_test("Standards Audited", True, f"Standards: {audit['standards_audited']}")
                    else:
                        self.log_test("Standards Audited", False, f"Expected {expected_standards}, got {audit.get('standards_audited')}")
                    
                    return True
                else:
                    self.log_test("Create Audit Report", False, f"Missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("Create Audit Report", False, 
                            f"Failed to create audit: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Create Audit Report", False, f"Error creating audit: {str(e)}")
            return False
    
    def test_get_audit_findings(self):
        """Test getting audit findings - should return 24 default clauses"""
        print("\n=== GET AUDIT FINDINGS (24 DEFAULT CLAUSES) ===")
        
        if not self.created_audits:
            self.log_test("Get Audit Findings", False, "No audit available for testing")
            return False
        
        audit = self.created_audits[0]
        
        try:
            response = requests.get(
                f"{self.base_url}/audits/{audit['id']}/findings",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                findings = response.json()
                
                # Verify we have 24 findings
                if len(findings) == 24:
                    self.log_test("24 Default Clauses Created", True, f"Found {len(findings)} default clauses")
                else:
                    self.log_test("24 Default Clauses Created", False, f"Expected 24 clauses, got {len(findings)}")
                    return False
                
                # Verify clause numbers match expected
                found_clauses = [finding['clause_number'] for finding in findings]
                found_clauses.sort()
                expected_sorted = sorted(self.expected_clauses)
                
                if found_clauses == expected_sorted:
                    self.log_test("Clause Numbers Correct", True, f"All expected clause numbers found: {found_clauses}")
                else:
                    missing = set(expected_sorted) - set(found_clauses)
                    extra = set(found_clauses) - set(expected_sorted)
                    self.log_test("Clause Numbers Correct", False, f"Missing: {missing}, Extra: {extra}")
                
                # Verify specific clauses exist
                clause_titles = {finding['clause_number']: finding['clause_title'] for finding in findings}
                
                # Check key clauses
                key_clauses = {
                    "1.0": "Management of Previous Audit Issues",
                    "2.1": "General Requirements",
                    "2.21": "Continual Improvement",
                    "3.0": "Follow-Up Work",
                    "4.0": "Conclusion & Recommendations"
                }
                
                for clause_num, expected_title in key_clauses.items():
                    if clause_num in clause_titles:
                        if clause_titles[clause_num] == expected_title:
                            self.log_test(f"Clause {clause_num} Title", True, f"'{expected_title}'")
                        else:
                            self.log_test(f"Clause {clause_num} Title", False, 
                                        f"Expected '{expected_title}', got '{clause_titles[clause_num]}'")
                    else:
                        self.log_test(f"Clause {clause_num} Missing", False, f"Clause {clause_num} not found")
                
                # Store findings for later tests
                self.created_findings = findings
                return True
            else:
                self.log_test("Get Audit Findings", False, f"Failed to get findings: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Audit Findings", False, f"Error getting findings: {str(e)}")
            return False
    
    def test_update_audit_finding(self):
        """Test updating an audit finding with evidence and NCR details"""
        print("\n=== UPDATE AUDIT FINDING ===")
        
        if not self.created_findings:
            self.log_test("Update Audit Finding", False, "No findings available for testing")
            return False
        
        # Find a finding to update (use clause 2.1)
        finding_to_update = None
        for finding in self.created_findings:
            if finding['clause_number'] == '2.1':
                finding_to_update = finding
                break
        
        if not finding_to_update:
            self.log_test("Update Audit Finding", False, "Could not find clause 2.1 to update")
            return False
        
        try:
            response = requests.put(
                f"{self.base_url}/audits/findings/{finding_to_update['id']}",
                json=self.sample_finding_update,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                updated_finding = response.json()
                
                # Verify updates
                if updated_finding['evidence'] == self.sample_finding_update['evidence']:
                    self.log_test("Evidence Updated", True, f"Evidence: {updated_finding['evidence']}")
                else:
                    self.log_test("Evidence Updated", False, f"Evidence not updated correctly")
                
                if updated_finding['findings'] == self.sample_finding_update['findings']:
                    self.log_test("Findings Updated", True, f"Findings: {updated_finding['findings']}")
                else:
                    self.log_test("Findings Updated", False, f"Findings not updated correctly")
                
                if updated_finding['finding_type'] == 'Minor NCR':
                    self.log_test("Finding Type Updated", True, f"Type: {updated_finding['finding_type']}")
                else:
                    self.log_test("Finding Type Updated", False, f"Type not updated correctly")
                
                if updated_finding['ncr_number'] == 'NCR-001':
                    self.log_test("NCR Number Updated", True, f"NCR: {updated_finding['ncr_number']}")
                else:
                    self.log_test("NCR Number Updated", False, f"NCR number not updated correctly")
                
                if updated_finding['is_follow_up_required'] == True:
                    self.log_test("Follow-up Required", True, "Follow-up flag set correctly")
                else:
                    self.log_test("Follow-up Required", False, "Follow-up flag not set correctly")
                
                return True
            else:
                self.log_test("Update Audit Finding", False, 
                            f"Failed to update finding: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Update Audit Finding", False, f"Error updating finding: {str(e)}")
            return False
    
    def test_get_specific_audit(self):
        """Test getting a specific audit by ID"""
        print("\n=== GET SPECIFIC AUDIT ===")
        
        if not self.created_audits:
            self.log_test("Get Specific Audit", False, "No audit available for testing")
            return False
        
        audit_to_test = self.created_audits[0]
        
        try:
            response = requests.get(
                f"{self.base_url}/audits/{audit_to_test['id']}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                audit = response.json()
                
                # Verify all fields match
                fields_to_check = ['id', 'report_number', 'auditor_name', 'client_name', 'assessed_sites']
                all_match = True
                
                for field in fields_to_check:
                    if audit.get(field) != audit_to_test.get(field):
                        self.log_test(f"Field Match - {field}", False, 
                                    f"Expected {audit_to_test.get(field)}, got {audit.get(field)}")
                        all_match = False
                    else:
                        self.log_test(f"Field Match - {field}", True, 
                                    f"{field}: {audit.get(field)}")
                
                if all_match:
                    self.log_test("Get Specific Audit", True, 
                                f"Successfully retrieved audit {audit['report_number']} with all fields matching")
                    return True
                else:
                    self.log_test("Get Specific Audit", False, "Some fields don't match")
                    return False
            else:
                self.log_test("Get Specific Audit", False, f"Failed to get audit: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Specific Audit", False, f"Error getting specific audit: {str(e)}")
            return False
    
    def test_update_audit_report(self):
        """Test updating an audit report"""
        print("\n=== UPDATE AUDIT REPORT ===")
        
        if not self.created_audits:
            self.log_test("Update Audit Report", False, "No audit available for testing")
            return False
        
        audit_to_update = self.created_audits[0]
        update_data = {
            "auditor_name": "Updated Test Auditor",
            "conclusion": "Test audit completed successfully",
            "overall_recommendation": "Continue with current practices"
        }
        
        try:
            response = requests.put(
                f"{self.base_url}/audits/{audit_to_update['id']}",
                json=update_data,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                updated_audit = response.json()
                
                # Verify updates
                if updated_audit['auditor_name'] == 'Updated Test Auditor':
                    self.log_test("Auditor Name Update", True, f"Auditor: {updated_audit['auditor_name']}")
                else:
                    self.log_test("Auditor Name Update", False, f"Auditor not updated: {updated_audit['auditor_name']}")
                
                if updated_audit['conclusion'] == "Test audit completed successfully":
                    self.log_test("Conclusion Update", True, "Conclusion updated correctly")
                else:
                    self.log_test("Conclusion Update", False, f"Conclusion not updated: {updated_audit['conclusion']}")
                
                if updated_audit['overall_recommendation'] == "Continue with current practices":
                    self.log_test("Recommendation Update", True, "Recommendation updated correctly")
                else:
                    self.log_test("Recommendation Update", False, f"Recommendation not updated: {updated_audit['overall_recommendation']}")
                
                # Verify updated_at changed
                original_updated_at = audit_to_update.get('updated_at')
                new_updated_at = updated_audit.get('updated_at')
                
                if new_updated_at != original_updated_at:
                    self.log_test("Updated At Timestamp", True, "updated_at timestamp changed")
                else:
                    self.log_test("Updated At Timestamp", False, "updated_at timestamp not changed")
                
                # Update our local copy
                self.created_audits[0] = updated_audit
                return True
            else:
                self.log_test("Update Audit Report", False, 
                            f"Failed to update audit: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Update Audit Report", False, f"Error updating audit: {str(e)}")
            return False
    
    def test_delete_audit_report(self):
        """Test deleting an audit report and verify findings are also deleted"""
        print("\n=== DELETE AUDIT REPORT ===")
        
        # Create a new audit specifically for deletion
        delete_audit_data = self.sample_audit.copy()
        delete_audit_data['report_number'] = "AR-2025-DELETE-TEST"
        delete_audit_data['client_name'] = "Delete Test Client"
        
        try:
            # Create audit for deletion
            create_response = requests.post(
                f"{self.base_url}/audits",
                json=delete_audit_data,
                headers=self.headers,
                timeout=10
            )
            
            if create_response.status_code == 201:
                audit_to_delete = create_response.json()
                
                # Verify findings were created
                findings_response = requests.get(
                    f"{self.base_url}/audits/{audit_to_delete['id']}/findings",
                    headers=self.headers,
                    timeout=10
                )
                
                if findings_response.status_code == 200:
                    findings = findings_response.json()
                    self.log_test("Findings Created for Delete Test", True, f"Created {len(findings)} findings")
                else:
                    self.log_test("Findings Created for Delete Test", False, "Failed to create findings")
                
                # Delete the audit
                delete_response = requests.delete(
                    f"{self.base_url}/audits/{audit_to_delete['id']}",
                    headers=self.headers,
                    timeout=10
                )
                
                if delete_response.status_code == 204:
                    self.log_test("Delete Audit Report", True, f"Audit {audit_to_delete['report_number']} deleted successfully")
                    
                    # Verify audit is deleted - should return 404
                    get_response = requests.get(
                        f"{self.base_url}/audits/{audit_to_delete['id']}",
                        headers=self.headers,
                        timeout=10
                    )
                    
                    if get_response.status_code == 404:
                        self.log_test("Verify Audit Deleted", True, "Audit no longer exists after deletion")
                    else:
                        self.log_test("Verify Audit Deleted", False, f"Audit still exists after deletion: {get_response.status_code}")
                    
                    # Verify findings are also deleted
                    findings_check_response = requests.get(
                        f"{self.base_url}/audits/{audit_to_delete['id']}/findings",
                        headers=self.headers,
                        timeout=10
                    )
                    
                    if findings_check_response.status_code == 404 or (findings_check_response.status_code == 200 and len(findings_check_response.json()) == 0):
                        self.log_test("Verify Findings Deleted", True, "All findings deleted with audit")
                        return True
                    else:
                        self.log_test("Verify Findings Deleted", False, "Findings still exist after audit deletion")
                        return False
                else:
                    self.log_test("Delete Audit Report", False, f"Failed to delete audit: {delete_response.status_code}")
                    return False
            else:
                self.log_test("Create Audit for Deletion", False, f"Failed to create audit for deletion: {create_response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Delete Audit Report", False, f"Error deleting audit: {str(e)}")
            return False
    
    def test_validation_errors(self):
        """Test validation and error handling"""
        print("\n=== VALIDATION TESTS ===")
        
        # Test missing required fields
        try:
            invalid_audit = {
                "auditor_name": "Test Auditor"
                # Missing required fields like report_number, client_name, etc.
            }
            
            response = requests.post(
                f"{self.base_url}/audits",
                json=invalid_audit,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code in [400, 422]:
                self.log_test("Missing Required Fields", True, f"Correctly rejected invalid audit: {response.status_code}")
            else:
                self.log_test("Missing Required Fields", False, f"Should reject invalid audit, got: {response.status_code}")
        
        except Exception as e:
            self.log_test("Missing Required Fields", False, f"Error testing validation: {str(e)}")
        
        # Test invalid audit ID for GET
        try:
            response = requests.get(
                f"{self.base_url}/audits/non-existent-audit-id",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Non-existent Audit ID (GET)", True, "Correctly returned 404 for non-existent audit")
            else:
                self.log_test("Non-existent Audit ID (GET)", False, f"Expected 404, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Non-existent Audit ID (GET)", False, f"Error testing non-existent audit: {str(e)}")
        
        # Test invalid finding ID for UPDATE
        try:
            response = requests.put(
                f"{self.base_url}/audits/findings/non-existent-finding-id",
                json={"evidence": "test"},
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Non-existent Finding ID (UPDATE)", True, "Correctly returned 404 for non-existent finding")
            else:
                self.log_test("Non-existent Finding ID (UPDATE)", False, f"Expected 404, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Non-existent Finding ID (UPDATE)", False, f"Error testing non-existent finding: {str(e)}")
        
        return True
    
    def test_unauthorized_access(self):
        """Test unauthorized access scenarios"""
        print("\n=== UNAUTHORIZED ACCESS TESTS ===")
        
        # Test accessing audits without auth token
        try:
            response = requests.get(
                f"{self.base_url}/audits",
                timeout=10
            )
            
            if response.status_code in [401, 403]:
                self.log_test("Unauthorized Audit Access", True, f"Correctly returned {response.status_code} for unauthorized access")
            else:
                self.log_test("Unauthorized Audit Access", False, f"Expected 401 or 403, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Unauthorized Audit Access", False, f"Error in auth test: {str(e)}")
        
        # Test creating audit without auth token
        try:
            response = requests.post(
                f"{self.base_url}/audits",
                json=self.sample_audit,
                timeout=10
            )
            
            if response.status_code in [401, 403]:
                self.log_test("Unauthorized Audit Creation", True, f"Correctly returned {response.status_code} for unauthorized creation")
            else:
                self.log_test("Unauthorized Audit Creation", False, f"Expected 401 or 403, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Unauthorized Audit Creation", False, f"Error in auth test: {str(e)}")
        
        return True
    
    def test_data_integrity(self):
        """Test data integrity - audit creation auto-generates findings, delete removes all"""
        print("\n=== DATA INTEGRITY TESTS ===")
        
        if not self.created_audits:
            self.log_test("Data Integrity", False, "No audit available for testing")
            return False
        
        audit = self.created_audits[0]
        
        # Verify findings belong to correct audit
        try:
            response = requests.get(
                f"{self.base_url}/audits/{audit['id']}/findings",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                findings = response.json()
                
                # Check all findings have correct report_id
                correct_report_ids = all(finding['report_id'] == audit['id'] for finding in findings)
                
                if correct_report_ids:
                    self.log_test("Findings Report ID Integrity", True, f"All {len(findings)} findings have correct report_id")
                else:
                    wrong_ids = [f for f in findings if f['report_id'] != audit['id']]
                    self.log_test("Findings Report ID Integrity", False, f"{len(wrong_ids)} findings have wrong report_id")
                
                # Verify all findings have required fields
                required_finding_fields = ['id', 'report_id', 'clause_number', 'clause_title', 'finding_type']
                all_have_fields = True
                
                for finding in findings:
                    missing_fields = [field for field in required_finding_fields if field not in finding]
                    if missing_fields:
                        self.log_test(f"Finding {finding['clause_number']} Fields", False, f"Missing: {missing_fields}")
                        all_have_fields = False
                
                if all_have_fields:
                    self.log_test("All Findings Have Required Fields", True, "All findings have required fields")
                
                return True
            else:
                self.log_test("Data Integrity", False, f"Failed to get findings: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Data Integrity", False, f"Error testing data integrity: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all audit management tests"""
        print("=" * 80)
        print("ISO/IMS AUDIT MANAGEMENT SYSTEM BACKEND API TESTING")
        print("=" * 80)
        
        # Step 1: Authentication
        if not self.authenticate():
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
            return False
        
        # Step 2: Test empty audits list
        self.test_get_audits_empty()
        
        # Step 3: Create audit report
        self.test_create_audit_report()
        
        # Step 4: Test audit findings (24 default clauses)
        self.test_get_audit_findings()
        
        # Step 5: Update audit finding
        self.test_update_audit_finding()
        
        # Step 6: Test getting specific audit
        self.test_get_specific_audit()
        
        # Step 7: Test updating audit report
        self.test_update_audit_report()
        
        # Step 8: Test data integrity
        self.test_data_integrity()
        
        # Step 9: Test validation errors
        self.test_validation_errors()
        
        # Step 10: Test unauthorized access
        self.test_unauthorized_access()
        
        # Step 11: Test delete audit (last to avoid affecting other tests)
        self.test_delete_audit_report()
        
        # Generate summary
        self.print_summary()
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("ISO/IMS AUDIT MANAGEMENT TESTING SUMMARY")
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
            print(f"\n🎉 EXCELLENT! ISO/IMS Audit Management System is working correctly ({success_rate:.1f}% success rate)")
        elif success_rate >= 75:
            print(f"\n✅ GOOD! ISO/IMS Audit Management System is mostly working ({success_rate:.1f}% success rate)")
        elif success_rate >= 50:
            print(f"\n⚠️  PARTIAL! ISO/IMS Audit Management System has some issues ({success_rate:.1f}% success rate)")
        else:
            print(f"\n❌ CRITICAL! ISO/IMS Audit Management System has major issues ({success_rate:.1f}% success rate)")
        
        return success_rate

def main():
    """Main function to run the audit management tests"""
    tester = AuditManagementTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n" + "=" * 80)
        print("AUDIT MANAGEMENT TESTING COMPLETED")
        print("=" * 80)
    else:
        print("\n" + "=" * 80)
        print("AUDIT MANAGEMENT TESTING FAILED")
        print("=" * 80)
        sys.exit(1)

if __name__ == "__main__":
    main()