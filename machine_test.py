#!/usr/bin/env python3
"""
Machine Management Backend API Testing for Nestix ERP System
Tests all CRUD operations for the Machines Management module
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

class MachineManagementTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {}
        self.test_results = []
        self.created_machines = []
        
        # Sample machine data for testing
        self.sample_machines = [
            {
                "machine_name": "Press Brake 1",
                "machine_number": "PB-001",
                "machine_type": "Press Brake",
                "status": "Active",
                "notes": "Main press brake for bending operations"
            },
            {
                "machine_name": "Laser Cutter 1",
                "machine_number": "LC-001",
                "machine_type": "Laser Cutter",
                "status": "Active",
                "notes": "Primary laser cutting machine"
            },
            {
                "machine_name": "CNC Mill 2",
                "machine_number": "CN-002",
                "machine_type": "CNC Mill",
                "status": "Maintenance",
                "notes": "Under maintenance for tool replacement"
            }
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
    
    def test_get_machines_empty(self):
        """Test getting machines when none exist (should return empty array)"""
        print("\n=== GET MACHINES (EMPTY) ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/machines",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                machines = response.json()
                if isinstance(machines, list):
                    self.log_test("Get Machines Empty", True, f"Retrieved {len(machines)} machines (empty array expected)")
                    return True
                else:
                    self.log_test("Get Machines Empty", False, f"Expected array, got {type(machines)}")
                    return False
            else:
                self.log_test("Get Machines Empty", False, f"Failed to get machines: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Machines Empty", False, f"Error getting machines: {str(e)}")
            return False

    def test_create_machines(self):
        """Test creating multiple machines"""
        print("\n=== CREATE MACHINES ===")
        
        success_count = 0
        
        for i, machine_data in enumerate(self.sample_machines):
            try:
                response = requests.post(
                    f"{self.base_url}/machines",
                    json=machine_data,
                    headers=self.headers,
                    timeout=10
                )
                
                if response.status_code == 201:
                    machine = response.json()
                    self.created_machines.append(machine)
                    
                    # Verify required fields
                    required_fields = ['id', 'machine_name', 'machine_number', 'machine_type', 'status', 'notes', 'created_at', 'updated_at']
                    missing_fields = [field for field in required_fields if field not in machine]
                    
                    if not missing_fields:
                        self.log_test(f"Create Machine {i+1}", True, 
                                    f"Created {machine['machine_name']} ({machine['machine_number']}) - {machine['machine_type']}")
                        
                        # Verify auto-generated fields
                        if machine.get('id') and machine.get('created_at') and machine.get('updated_at'):
                            self.log_test(f"Machine {i+1} Auto-Generated Fields", True, 
                                        f"ID: {machine['id'][:8]}..., timestamps generated")
                        else:
                            self.log_test(f"Machine {i+1} Auto-Generated Fields", False, 
                                        "Missing auto-generated fields")
                        
                        success_count += 1
                    else:
                        self.log_test(f"Create Machine {i+1}", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test(f"Create Machine {i+1}", False, 
                                f"Failed to create machine: {response.status_code} - {response.text}")
                    
            except Exception as e:
                self.log_test(f"Create Machine {i+1}", False, f"Error creating machine: {str(e)}")
        
        if success_count == len(self.sample_machines):
            self.log_test("All Machines Created", True, f"Successfully created {success_count} machines")
            return True
        else:
            self.log_test("All Machines Created", False, f"Only created {success_count}/{len(self.sample_machines)} machines")
            return False

    def test_get_machines_after_creation(self):
        """Test getting all machines after creation"""
        print("\n=== GET MACHINES (AFTER CREATION) ===")
        
        try:
            response = requests.get(
                f"{self.base_url}/machines",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                machines = response.json()
                expected_count = len(self.created_machines)
                
                if len(machines) >= expected_count:
                    self.log_test("Get All Machines", True, f"Retrieved {len(machines)} machines (expected at least {expected_count})")
                    
                    # Verify all created machines are in the list
                    created_ids = {m['id'] for m in self.created_machines}
                    retrieved_ids = {m['id'] for m in machines}
                    
                    if created_ids.issubset(retrieved_ids):
                        self.log_test("All Created Machines Present", True, "All created machines found in list")
                    else:
                        missing = created_ids - retrieved_ids
                        self.log_test("All Created Machines Present", False, f"Missing machines: {missing}")
                    
                    # Verify machine data integrity
                    for machine in machines:
                        if machine['id'] in created_ids:
                            required_fields = ['machine_name', 'machine_number', 'machine_type', 'status', 'notes']
                            if all(field in machine for field in required_fields):
                                self.log_test(f"Machine Data Integrity - {machine['machine_name']}", True, 
                                            f"All fields present for {machine['machine_name']}")
                            else:
                                missing = [f for f in required_fields if f not in machine]
                                self.log_test(f"Machine Data Integrity - {machine['machine_name']}", False, 
                                            f"Missing fields: {missing}")
                    
                    return True
                else:
                    self.log_test("Get All Machines", False, f"Expected at least {expected_count} machines, got {len(machines)}")
                    return False
            else:
                self.log_test("Get All Machines", False, f"Failed to get machines: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get All Machines", False, f"Error getting machines: {str(e)}")
            return False

    def test_get_specific_machine(self):
        """Test getting a specific machine by ID"""
        print("\n=== GET SPECIFIC MACHINE ===")
        
        if not self.created_machines:
            self.log_test("Get Specific Machine", False, "No machines available for testing")
            return False
        
        machine_to_test = self.created_machines[0]  # Test first machine (Press Brake 1)
        
        try:
            response = requests.get(
                f"{self.base_url}/machines/{machine_to_test['id']}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                machine = response.json()
                
                # Verify all fields match
                fields_to_check = ['id', 'machine_name', 'machine_number', 'machine_type', 'status', 'notes']
                all_match = True
                
                for field in fields_to_check:
                    if machine.get(field) != machine_to_test.get(field):
                        self.log_test(f"Field Match - {field}", False, 
                                    f"Expected {machine_to_test.get(field)}, got {machine.get(field)}")
                        all_match = False
                    else:
                        self.log_test(f"Field Match - {field}", True, 
                                    f"{field}: {machine.get(field)}")
                
                if all_match:
                    self.log_test("Get Specific Machine", True, 
                                f"Successfully retrieved {machine['machine_name']} with all fields matching")
                    return True
                else:
                    self.log_test("Get Specific Machine", False, "Some fields don't match")
                    return False
            else:
                self.log_test("Get Specific Machine", False, f"Failed to get machine: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Specific Machine", False, f"Error getting specific machine: {str(e)}")
            return False

    def test_update_machine(self):
        """Test updating a machine"""
        print("\n=== UPDATE MACHINE ===")
        
        if not self.created_machines:
            self.log_test("Update Machine", False, "No machines available for testing")
            return False
        
        # Update the first machine (Press Brake 1)
        machine_to_update = self.created_machines[0]
        update_data = {
            "status": "Maintenance",
            "notes": "Scheduled maintenance - hydraulic system check"
        }
        
        try:
            response = requests.put(
                f"{self.base_url}/machines/{machine_to_update['id']}",
                json=update_data,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                updated_machine = response.json()
                
                # Verify updates
                if updated_machine['status'] == 'Maintenance':
                    self.log_test("Machine Status Update", True, f"Status updated to 'Maintenance'")
                else:
                    self.log_test("Machine Status Update", False, f"Status not updated: {updated_machine['status']}")
                
                if updated_machine['notes'] == "Scheduled maintenance - hydraulic system check":
                    self.log_test("Machine Notes Update", True, "Notes updated correctly")
                else:
                    self.log_test("Machine Notes Update", False, f"Notes not updated: {updated_machine['notes']}")
                
                # Verify updated_at changed
                original_updated_at = machine_to_update.get('updated_at')
                new_updated_at = updated_machine.get('updated_at')
                
                if new_updated_at != original_updated_at:
                    self.log_test("Updated At Timestamp", True, "updated_at timestamp changed")
                else:
                    self.log_test("Updated At Timestamp", False, "updated_at timestamp not changed")
                
                # Update our local copy for further tests
                self.created_machines[0] = updated_machine
                
                # Verify machine can be retrieved with updates
                get_response = requests.get(
                    f"{self.base_url}/machines/{machine_to_update['id']}",
                    headers=self.headers,
                    timeout=10
                )
                
                if get_response.status_code == 200:
                    retrieved_machine = get_response.json()
                    if (retrieved_machine['status'] == 'Maintenance' and 
                        retrieved_machine['notes'] == "Scheduled maintenance - hydraulic system check"):
                        self.log_test("Update Persistence", True, "Updates persisted correctly")
                        return True
                    else:
                        self.log_test("Update Persistence", False, "Updates not persisted")
                        return False
                else:
                    self.log_test("Update Persistence Check", False, f"Failed to retrieve updated machine: {get_response.status_code}")
                    return False
            else:
                self.log_test("Update Machine", False, f"Failed to update machine: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Update Machine", False, f"Error updating machine: {str(e)}")
            return False

    def test_delete_machine(self):
        """Test deleting a machine"""
        print("\n=== DELETE MACHINE ===")
        
        if len(self.created_machines) < 3:
            self.log_test("Delete Machine", False, "Need at least 3 machines for delete test")
            return False
        
        # Delete the third machine (CNC Mill 2)
        machine_to_delete = self.created_machines[2]
        
        try:
            response = requests.delete(
                f"{self.base_url}/machines/{machine_to_delete['id']}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 204:
                self.log_test("Delete Machine", True, f"Machine {machine_to_delete['machine_name']} deleted successfully")
                
                # Verify machine is deleted - should return 404
                get_response = requests.get(
                    f"{self.base_url}/machines/{machine_to_delete['id']}",
                    headers=self.headers,
                    timeout=10
                )
                
                if get_response.status_code == 404:
                    self.log_test("Verify Machine Deleted", True, "Machine no longer exists after deletion")
                else:
                    self.log_test("Verify Machine Deleted", False, f"Machine still exists after deletion: {get_response.status_code}")
                
                # Verify machine count reduced
                list_response = requests.get(
                    f"{self.base_url}/machines",
                    headers=self.headers,
                    timeout=10
                )
                
                if list_response.status_code == 200:
                    remaining_machines = list_response.json()
                    expected_count = len(self.created_machines) - 1
                    
                    if len(remaining_machines) == expected_count:
                        self.log_test("Machine Count After Delete", True, f"Machine count reduced to {len(remaining_machines)}")
                        
                        # Verify deleted machine not in list
                        deleted_id = machine_to_delete['id']
                        remaining_ids = [m['id'] for m in remaining_machines]
                        
                        if deleted_id not in remaining_ids:
                            self.log_test("Deleted Machine Not in List", True, "Deleted machine not found in machine list")
                            return True
                        else:
                            self.log_test("Deleted Machine Not in List", False, "Deleted machine still in list")
                            return False
                    else:
                        self.log_test("Machine Count After Delete", False, f"Expected {expected_count} machines, got {len(remaining_machines)}")
                        return False
                else:
                    self.log_test("Machine Count After Delete", False, f"Failed to get machine list: {list_response.status_code}")
                    return False
            else:
                self.log_test("Delete Machine", False, f"Failed to delete machine: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Delete Machine", False, f"Error deleting machine: {str(e)}")
            return False

    def test_unauthorized_access(self):
        """Test unauthorized access scenarios"""
        print("\n=== UNAUTHORIZED ACCESS TESTS ===")
        
        # Test accessing machines without auth token
        try:
            response = requests.get(
                f"{self.base_url}/machines",
                timeout=10
            )
            
            if response.status_code in [401, 403]:
                self.log_test("Unauthorized Machine Access", True, f"Correctly returned {response.status_code} for unauthorized access")
            else:
                self.log_test("Unauthorized Machine Access", False, f"Expected 401 or 403, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Unauthorized Machine Access", False, f"Error in auth test: {str(e)}")
        
        # Test creating machine without auth token
        try:
            response = requests.post(
                f"{self.base_url}/machines",
                json=self.sample_machines[0],
                timeout=10
            )
            
            if response.status_code in [401, 403]:
                self.log_test("Unauthorized Machine Creation", True, f"Correctly returned {response.status_code} for unauthorized creation")
            else:
                self.log_test("Unauthorized Machine Creation", False, f"Expected 401 or 403, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Unauthorized Machine Creation", False, f"Error in auth test: {str(e)}")
        
        return True

    def test_validation_errors(self):
        """Test validation and error handling"""
        print("\n=== VALIDATION TESTS ===")
        
        # Test missing required fields (machine_name is required)
        try:
            invalid_machine = {
                "machine_number": "TEST-001",
                "machine_type": "Test Machine"
                # Missing machine_name (required field)
            }
            
            response = requests.post(
                f"{self.base_url}/machines",
                json=invalid_machine,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code in [400, 422]:
                self.log_test("Missing Required Fields", True, f"Correctly rejected invalid machine: {response.status_code}")
            else:
                self.log_test("Missing Required Fields", False, f"Should reject invalid machine, got: {response.status_code}")
        
        except Exception as e:
            self.log_test("Missing Required Fields", False, f"Error testing validation: {str(e)}")
        
        # Test invalid machine ID for GET
        try:
            response = requests.get(
                f"{self.base_url}/machines/non-existent-machine-id",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Non-existent Machine ID (GET)", True, "Correctly returned 404 for non-existent machine")
            else:
                self.log_test("Non-existent Machine ID (GET)", False, f"Expected 404, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Non-existent Machine ID (GET)", False, f"Error testing non-existent machine: {str(e)}")
        
        # Test invalid machine ID for UPDATE
        try:
            response = requests.put(
                f"{self.base_url}/machines/non-existent-machine-id",
                json={"status": "Active"},
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Non-existent Machine ID (UPDATE)", True, "Correctly returned 404 for non-existent machine update")
            else:
                self.log_test("Non-existent Machine ID (UPDATE)", False, f"Expected 404, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Non-existent Machine ID (UPDATE)", False, f"Error testing non-existent machine update: {str(e)}")
        
        # Test invalid machine ID for DELETE
        try:
            response = requests.delete(
                f"{self.base_url}/machines/non-existent-machine-id",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Non-existent Machine ID (DELETE)", True, "Correctly returned 404 for non-existent machine delete")
            else:
                self.log_test("Non-existent Machine ID (DELETE)", False, f"Expected 404, got {response.status_code}")
        
        except Exception as e:
            self.log_test("Non-existent Machine ID (DELETE)", False, f"Error testing non-existent machine delete: {str(e)}")
        
        return True
    
    def run_all_tests(self):
        """Run all machine management tests"""
        print("=" * 80)
        print("MACHINE MANAGEMENT BACKEND API TESTING")
        print("=" * 80)
        
        # Step 1: Authentication
        if not self.authenticate():
            print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
            return False
        
        # Step 2: Test empty machines list
        self.test_get_machines_empty()
        
        # Step 3: Create machines
        self.test_create_machines()
        
        # Step 4: Test machines list after creation
        self.test_get_machines_after_creation()
        
        # Step 5: Test getting specific machine
        self.test_get_specific_machine()
        
        # Step 6: Test updating machine
        self.test_update_machine()
        
        # Step 7: Test deleting machine
        self.test_delete_machine()
        
        # Step 8: Test authorization
        self.test_unauthorized_access()
        
        # Step 9: Test validation
        self.test_validation_errors()
        
        # Generate summary
        self.print_summary()
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("MACHINE MANAGEMENT TESTING SUMMARY")
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
            print(f"\n🎉 EXCELLENT! Machine Management Backend is working correctly ({success_rate:.1f}% success rate)")
        elif success_rate >= 75:
            print(f"\n✅ GOOD! Machine Management Backend is mostly working ({success_rate:.1f}% success rate)")
        elif success_rate >= 50:
            print(f"\n⚠️  PARTIAL! Machine Management Backend has some issues ({success_rate:.1f}% success rate)")
        else:
            print(f"\n❌ CRITICAL! Machine Management Backend has major issues ({success_rate:.1f}% success rate)")
        
        return success_rate

if __name__ == "__main__":
    tester = MachineManagementTester()
    tester.run_all_tests()