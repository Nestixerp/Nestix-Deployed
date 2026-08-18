"""
Backend Testing for Email Invoice/Quote Functionality
Tests email sending endpoints for quotes and invoices
"""

import requests
import json
from datetime import datetime

# Configuration
BACKEND_URL = "https://quote-pdf-breaks.preview.emergentagent.com/api"
USERNAME = "admin"
PASSWORD = "password123"

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(test_name, passed, message="", details=None):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results["tests"].append({
        "name": test_name,
        "status": status,
        "message": message,
        "details": details
    })
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
    print(f"{status}: {test_name}")
    if message:
        print(f"   {message}")
    if details:
        print(f"   Details: {details}")

def get_auth_token():
    """Authenticate and get JWT token"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"username": USERNAME, "password": PASSWORD}
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            log_test("Authentication", True, f"Successfully authenticated as {USERNAME}")
            return token
        else:
            log_test("Authentication", False, f"Failed with status {response.status_code}", response.text)
            return None
    except Exception as e:
        log_test("Authentication", False, f"Exception: {str(e)}")
        return None

def test_environment_variables():
    """Test 1: Check if email environment variables are configured"""
    print("\n" + "="*80)
    print("TEST 1: Environment Variables Check")
    print("="*80)
    
    # Read backend .env file
    try:
        with open('/app/backend/.env', 'r') as f:
            env_content = f.read()
        
        has_smtp_user = 'SMTP_USER=' in env_content
        has_smtp_password = 'SMTP_PASSWORD=' in env_content
        
        if has_smtp_user and has_smtp_password:
            log_test(
                "Environment Variables - SMTP Credentials",
                True,
                "SMTP_USER and SMTP_PASSWORD are configured in backend/.env"
            )
        else:
            missing = []
            if not has_smtp_user:
                missing.append("SMTP_USER")
            if not has_smtp_password:
                missing.append("SMTP_PASSWORD")
            log_test(
                "Environment Variables - SMTP Credentials",
                False,
                f"Missing credentials: {', '.join(missing)}"
            )
    except Exception as e:
        log_test(
            "Environment Variables - SMTP Credentials",
            False,
            f"Could not read .env file: {str(e)}"
        )

def test_quote_email_endpoint(token):
    """Test 2: Test quote email sending endpoint"""
    print("\n" + "="*80)
    print("TEST 2: Quote Email Sending")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # First, get a valid quote
    try:
        response = requests.get(f"{BACKEND_URL}/quotes", headers=headers)
        if response.status_code != 200:
            log_test(
                "Get Quotes for Email Test",
                False,
                f"Failed to fetch quotes: {response.status_code}"
            )
            return
        
        quotes = response.json()
        if not quotes or len(quotes) == 0:
            log_test(
                "Get Quotes for Email Test",
                False,
                "No quotes available for testing"
            )
            return
        
        # Get first quote
        quote = quotes[0]
        quote_id = quote.get("id")
        quote_number = quote.get("quote_number")
        customer_id = quote.get("customer_id")
        
        log_test(
            "Get Quotes for Email Test",
            True,
            f"Found quote #{quote_number} (ID: {quote_id})"
        )
        
        # Check if customer has email
        customer_response = requests.get(
            f"{BACKEND_URL}/customers/{customer_id}",
            headers=headers
        )
        
        if customer_response.status_code == 200:
            customer = customer_response.json()
            customer_email = customer.get("email")
            
            if customer_email:
                log_test(
                    "Customer Email Check",
                    True,
                    f"Customer has email: {customer_email}"
                )
            else:
                log_test(
                    "Customer Email Check",
                    False,
                    "Customer does not have an email address"
                )
                return
        else:
            log_test(
                "Customer Email Check",
                False,
                f"Failed to fetch customer: {customer_response.status_code}"
            )
            return
        
        # Test sending quote email
        print(f"\nAttempting to send email for Quote #{quote_number}...")
        email_response = requests.post(
            f"{BACKEND_URL}/quotes/{quote_id}/send-email",
            headers=headers
        )
        
        print(f"Response Status: {email_response.status_code}")
        print(f"Response Body: {email_response.text}")
        
        if email_response.status_code == 200:
            result = email_response.json()
            if result.get("success"):
                log_test(
                    "Send Quote Email - Success Response",
                    True,
                    f"Email sent successfully: {result.get('message')}"
                )
            else:
                log_test(
                    "Send Quote Email - Success Response",
                    False,
                    f"Email sending failed: {result.get('message')}",
                    result
                )
        elif email_response.status_code == 404:
            log_test(
                "Send Quote Email - Endpoint",
                False,
                "Endpoint not found (404) - Check route prefix configuration"
            )
        elif email_response.status_code == 500:
            log_test(
                "Send Quote Email - Server Error",
                False,
                "Internal server error (500) - Check backend logs for details",
                email_response.text
            )
        else:
            log_test(
                "Send Quote Email - Unexpected Status",
                False,
                f"Unexpected status code: {email_response.status_code}",
                email_response.text
            )
            
    except Exception as e:
        log_test(
            "Send Quote Email - Exception",
            False,
            f"Exception occurred: {str(e)}"
        )

def test_invoice_email_endpoint(token):
    """Test 3: Test invoice email sending endpoint"""
    print("\n" + "="*80)
    print("TEST 3: Invoice Email Sending")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # First, get a valid invoice
    try:
        response = requests.get(f"{BACKEND_URL}/invoices", headers=headers)
        if response.status_code != 200:
            log_test(
                "Get Invoices for Email Test",
                False,
                f"Failed to fetch invoices: {response.status_code}"
            )
            return
        
        invoices = response.json()
        if not invoices or len(invoices) == 0:
            log_test(
                "Get Invoices for Email Test",
                False,
                "No invoices available for testing"
            )
            return
        
        # Get first invoice
        invoice = invoices[0]
        invoice_id = invoice.get("id")
        invoice_number = invoice.get("invoice_number")
        customer_id = invoice.get("customer_id")
        
        log_test(
            "Get Invoices for Email Test",
            True,
            f"Found invoice #{invoice_number} (ID: {invoice_id})"
        )
        
        # Check if customer has email
        customer_response = requests.get(
            f"{BACKEND_URL}/customers/{customer_id}",
            headers=headers
        )
        
        if customer_response.status_code == 200:
            customer = customer_response.json()
            customer_email = customer.get("email")
            
            if customer_email:
                log_test(
                    "Customer Email Check (Invoice)",
                    True,
                    f"Customer has email: {customer_email}"
                )
            else:
                log_test(
                    "Customer Email Check (Invoice)",
                    False,
                    "Customer does not have an email address"
                )
                return
        else:
            log_test(
                "Customer Email Check (Invoice)",
                False,
                f"Failed to fetch customer: {customer_response.status_code}"
            )
            return
        
        # Test sending invoice email
        print(f"\nAttempting to send email for Invoice #{invoice_number}...")
        email_response = requests.post(
            f"{BACKEND_URL}/invoices/{invoice_id}/send-email",
            headers=headers
        )
        
        print(f"Response Status: {email_response.status_code}")
        print(f"Response Body: {email_response.text}")
        
        if email_response.status_code == 200:
            result = email_response.json()
            if result.get("success"):
                log_test(
                    "Send Invoice Email - Success Response",
                    True,
                    f"Email sent successfully: {result.get('message')}"
                )
            else:
                log_test(
                    "Send Invoice Email - Success Response",
                    False,
                    f"Email sending failed: {result.get('message')}",
                    result
                )
        elif email_response.status_code == 404:
            log_test(
                "Send Invoice Email - Endpoint",
                False,
                "Endpoint not found (404) - Check route prefix configuration"
            )
        elif email_response.status_code == 500:
            log_test(
                "Send Invoice Email - Server Error",
                False,
                "Internal server error (500) - Check backend logs for details",
                email_response.text
            )
        else:
            log_test(
                "Send Invoice Email - Unexpected Status",
                False,
                f"Unexpected status code: {email_response.status_code}",
                email_response.text
            )
            
    except Exception as e:
        log_test(
            "Send Invoice Email - Exception",
            False,
            f"Exception occurred: {str(e)}"
        )

def test_error_handling(token):
    """Test 4: Test error handling scenarios"""
    print("\n" + "="*80)
    print("TEST 4: Error Handling")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 4a: Non-existent quote ID
    fake_quote_id = "00000000-0000-0000-0000-000000000000"
    response = requests.post(
        f"{BACKEND_URL}/quotes/{fake_quote_id}/send-email",
        headers=headers
    )
    
    if response.status_code == 404:
        log_test(
            "Error Handling - Non-existent Quote",
            True,
            "Correctly returns 404 for non-existent quote"
        )
    elif response.status_code == 500:
        # Check if error message is descriptive
        try:
            error_detail = response.json().get("detail", response.text)
            if "not found" in error_detail.lower():
                log_test(
                    "Error Handling - Non-existent Quote",
                    True,
                    f"Returns 500 with descriptive error: {error_detail}"
                )
            else:
                log_test(
                    "Error Handling - Non-existent Quote",
                    False,
                    f"Returns 500 but error not descriptive: {error_detail}"
                )
        except:
            log_test(
                "Error Handling - Non-existent Quote",
                False,
                f"Returns 500 with unclear error: {response.text}"
            )
    else:
        log_test(
            "Error Handling - Non-existent Quote",
            False,
            f"Unexpected status code: {response.status_code}"
        )
    
    # Test 4b: Non-existent invoice ID
    fake_invoice_id = "00000000-0000-0000-0000-000000000000"
    response = requests.post(
        f"{BACKEND_URL}/invoices/{fake_invoice_id}/send-email",
        headers=headers
    )
    
    if response.status_code == 404:
        log_test(
            "Error Handling - Non-existent Invoice",
            True,
            "Correctly returns 404 for non-existent invoice"
        )
    elif response.status_code == 500:
        # Check if error message is descriptive
        try:
            error_detail = response.json().get("detail", response.text)
            if "not found" in error_detail.lower():
                log_test(
                    "Error Handling - Non-existent Invoice",
                    True,
                    f"Returns 500 with descriptive error: {error_detail}"
                )
            else:
                log_test(
                    "Error Handling - Non-existent Invoice",
                    False,
                    f"Returns 500 but error not descriptive: {error_detail}"
                )
        except:
            log_test(
                "Error Handling - Non-existent Invoice",
                False,
                f"Returns 500 with unclear error: {response.text}"
            )
    else:
        log_test(
            "Error Handling - Non-existent Invoice",
            False,
            f"Unexpected status code: {response.status_code}"
        )

def test_validation():
    """Test 5: Test endpoint validation"""
    print("\n" + "="*80)
    print("TEST 5: Endpoint Validation")
    print("="*80)
    
    # Test without authentication
    response = requests.post(f"{BACKEND_URL}/quotes/test-id/send-email")
    
    if response.status_code in [401, 403]:
        log_test(
            "Validation - Authentication Required",
            True,
            f"Correctly requires authentication (status {response.status_code})"
        )
    else:
        log_test(
            "Validation - Authentication Required",
            False,
            f"Does not properly require authentication (status {response.status_code})"
        )

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = test_results["passed"] + test_results["failed"]
    pass_rate = (test_results["passed"] / total * 100) if total > 0 else 0
    
    print(f"Total Tests: {total}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Pass Rate: {pass_rate:.1f}%")
    
    if test_results["failed"] > 0:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for test in test_results["tests"]:
            if "❌ FAIL" in test["status"]:
                print(f"\n{test['name']}")
                print(f"  Message: {test['message']}")
                if test['details']:
                    print(f"  Details: {test['details']}")

def main():
    """Main test execution"""
    print("="*80)
    print("EMAIL INVOICE/QUOTE FUNCTIONALITY - BACKEND TESTING")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Test 1: Environment Variables
    test_environment_variables()
    
    # Authenticate
    token = get_auth_token()
    if not token:
        print("\n❌ Cannot proceed without authentication")
        print_summary()
        return
    
    # Test 2: Quote Email Endpoint
    test_quote_email_endpoint(token)
    
    # Test 3: Invoice Email Endpoint
    test_invoice_email_endpoint(token)
    
    # Test 4: Error Handling
    test_error_handling(token)
    
    # Test 5: Validation
    test_validation()
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
