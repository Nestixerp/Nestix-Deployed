"""
Backend tests for ISO Modules registry expansion + Document Control migration
+ regression of core ISO/QMS endpoints.

Covers review_request scope:
1. GET /api/iso-modules/modules returns expanded split Register/Form list
2. GET /api/document-control reflects migrated related_module values
3. POST /api/document-control + GET + DELETE round-trip
4. Regression: core ISO/QMS GET endpoints still 200
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ───────────────────── fixtures ─────────────────────
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("token") or body.get("access_token")


@pytest.fixture(scope="session")
def auth_headers(token):
    assert token, "No token returned from login"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ──────────── ISO Modules registry tests ────────────
EXPECTED_MODULES = [
    # Quality
    ("ISO Audit Schedule", "Quality"),
    ("ISO Audit Report", "Quality"),
    ("Management Review Form", "Quality"),
    ("Supplier Review Register", "Quality"),
    ("Supplier Review Form", "Quality"),
    ("Customer Satisfaction Survey Form", "Quality"),
    ("Customer Satisfaction Analysis Report", "Quality"),
    ("NCR Register", "Quality"),
    ("NCR Form", "Quality"),
    ("Credit Request Form", "Quality"),
    ("NCR Job Sheet (Recut)", "Quality"),
    # Safety
    ("JSA Register", "Safety"),
    ("JSA Form", "Safety"),
    ("OHS Meeting Register", "Safety"),
    ("OHS Meeting Minutes Form", "Safety"),
    ("Injury Register", "Safety"),
    ("Injury Report Form", "Safety"),
    ("Evacuation Drill Register", "Safety"),
    ("Evacuation Drill Form", "Safety"),
    ("Plant Hazard Check Register", "Safety"),
    ("Plant Hazard Audit Form", "Safety"),
    ("Near Miss Register", "Safety"),
    ("Near Miss / Hazard Form", "Safety"),
    # HR
    ("Skills Matrix Register", "HR"),
    ("Skills Matrix Form", "HR"),
    # IMS
    ("Risk & Opportunities Register", "IMS"),
    ("Risk & Opportunity Form", "IMS"),
    # Environment
    ("Environmental Risk Assessment Register", "Environment"),
    ("Environmental Risk Assessment Form", "Environment"),
]


class TestIsoModulesEndpoint:
    def test_modules_endpoint_status(self, auth_headers):
        r = requests.get(f"{API}/iso-modules/modules", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "modules" in data and "grouped" in data
        assert isinstance(data["modules"], list)
        assert isinstance(data["grouped"], dict)

    def test_modules_have_required_fields(self, auth_headers):
        r = requests.get(f"{API}/iso-modules/modules", headers=auth_headers, timeout=30)
        modules = r.json()["modules"]
        assert len(modules) >= 25, f"Expected at least 25 modules, got {len(modules)}"
        for m in modules:
            assert "name" in m and isinstance(m["name"], str) and m["name"]
            assert "group" in m and isinstance(m["group"], str) and m["group"]
            assert "default_form_no" in m and isinstance(m["default_form_no"], str)

    @pytest.mark.parametrize("name,group", EXPECTED_MODULES)
    def test_split_register_form_entries_present(self, auth_headers, name, group):
        r = requests.get(f"{API}/iso-modules/modules", headers=auth_headers, timeout=30)
        modules = r.json()["modules"]
        match = next((m for m in modules if m["name"] == name), None)
        assert match is not None, f"Module {name!r} missing from registry"
        assert match["group"] == group, f"Module {name!r} expected group={group}, got {match['group']}"

    def test_grouped_structure(self, auth_headers):
        r = requests.get(f"{API}/iso-modules/modules", headers=auth_headers, timeout=30)
        grouped = r.json()["grouped"]
        for required_group in ["Quality", "Safety", "HR", "IMS", "Environment", "Equipment", "System"]:
            assert required_group in grouped, f"Missing group {required_group}"
            assert len(grouped[required_group]) > 0


# ──────────── Document Control migration tests ────────────
EXPECTED_RELATED_MODULES_PRESENT = [
    "JSA Form",
    "NCR Register",
    "Credit Request Form",
    "NCR Job Sheet (Recut)",
    "Forklift License Register",
    "First Aid Certificate Register",
    "Legal Requirements Register",
    "Evacuation Drill Form",
    "Environmental Risk Assessment Form",
    "Customer Satisfaction Survey Form",
    "Employment Application Form",
    "Supplier Review Form",
]

OLD_LABELS_THAT_SHOULD_BE_GONE = [
    "JSA",
    "Credit Request",
    "NCR Job Sheet",
    "Forklift Register",
    "First Aid Register",
    "Legal Requirements",
    "Evacuation Drills",
    "Customer Satisfaction",
    "Employment Application",
    "Supplier Review",
    "Plant Hazard Checks",
    "Near Miss",
    "Training Matrix",
    "Environmental Risk Assessment",
]


class TestDocumentControlMigration:
    def test_doc_control_list_ok(self, auth_headers):
        r = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        for it in items:
            for key in ["id", "form_no", "title", "issue", "revision_date", "owner", "related_module"]:
                assert key in it, f"Missing key {key} in {it}"
            assert "_id" not in it, "Mongo _id leaked into response"

    def test_no_duplicate_qmsf_14(self, auth_headers):
        r = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
        items = r.json()
        qmsf14 = [d for d in items if (d.get("form_no") or "").strip() == "QMSF 14"]
        assert len(qmsf14) <= 1, f"Found duplicate QMSF 14 entries: {qmsf14}"

    @pytest.mark.parametrize("module_name", EXPECTED_RELATED_MODULES_PRESENT)
    def test_expected_related_modules_exist(self, auth_headers, module_name):
        r = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
        items = r.json()
        modules_in_register = {(d.get("related_module") or "").strip() for d in items}
        assert module_name in modules_in_register, (
            f"Expected related_module {module_name!r} not found. Present: {sorted(m for m in modules_in_register if m)}"
        )

    @pytest.mark.parametrize("old_label", OLD_LABELS_THAT_SHOULD_BE_GONE)
    def test_old_labels_no_longer_used(self, auth_headers, old_label):
        r = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
        items = r.json()
        modules_in_register = {(d.get("related_module") or "").strip() for d in items}
        assert old_label not in modules_in_register, (
            f"Old related_module {old_label!r} still in register after migration"
        )

    def test_risk_opportunities_split(self, auth_headers):
        """QMSF 35 -> Register, QMSF 36 -> Form (per migration rules)."""
        r = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
        items = r.json()
        by_form = {(d.get("form_no") or "").strip(): d for d in items}
        if "QMSF 35" in by_form:
            assert by_form["QMSF 35"].get("related_module") == "Risk & Opportunities Register"
        if "QMSF 36" in by_form:
            assert by_form["QMSF 36"].get("related_module") == "Risk & Opportunity Form"


# ──────────── Doc Control POST → GET → DELETE round-trip ────────────
class TestDocumentControlCrud:
    def test_create_get_delete_round_trip(self, auth_headers):
        payload = {
            "form_no": "QMSF 27A",
            "title": "Plant Hazard Check List",
            "doc_type": "Form",
            "issue": "1",
            "revision_date": "2026-02-26",
            "owner": "QA Manager",
            "location": "/test",
            "related_module": "Plant Hazard Audit Form",
            "notes": "TEST_ENTRY_iter16",
        }
        # Create
        c = requests.post(f"{API}/document-control", headers=auth_headers, json=payload, timeout=30)
        assert c.status_code == 200, c.text
        created = c.json()
        assert "id" in created and created["id"]
        assert created["form_no"] == payload["form_no"]
        assert created["related_module"] == payload["related_module"]
        assert created["issue"] == "1"
        assert created["revision_date"] == "2026-02-26"
        assert created["title"] == "Plant Hazard Check List"
        new_id = created["id"]

        try:
            # GET via list — must include the new id
            g = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
            assert g.status_code == 200
            found = next((d for d in g.json() if d.get("id") == new_id), None)
            assert found is not None, "Newly created doc-control entry not in list"
            assert found["related_module"] == "Plant Hazard Audit Form"
            assert found["form_no"] == "QMSF 27A"
            assert "_id" not in found
        finally:
            # Delete (always, even on assertion failure above? we want test-result clarity, so:)
            d = requests.delete(f"{API}/document-control/{new_id}", headers=auth_headers, timeout=30)
            assert d.status_code == 200, d.text
            assert d.json().get("success") is True

        # Verify gone
        g2 = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
        ids = {d.get("id") for d in g2.json()}
        assert new_id not in ids, "Deleted doc-control entry still listed"

    def test_delete_nonexistent_returns_404(self, auth_headers):
        r = requests.delete(f"{API}/document-control/does-not-exist-xyz", headers=auth_headers, timeout=30)
        assert r.status_code == 404


# ──────────── Regression: core ISO/QMS GET endpoints ────────────
REGRESSION_GETS = [
    "/jsas",
    "/ncr",
    "/risk-opportunities",
    "/plant-hazard-checks",
    "/near-miss",
    "/leave-of-absence",
    "/training-appraisals",
    "/auth/users",
    "/compliance/forklift",
    "/compliance/first-aid",
    "/settings/",
]


class TestRegression:
    @pytest.mark.parametrize("path", REGRESSION_GETS)
    def test_regression_get_endpoints(self, auth_headers, path):
        r = requests.get(f"{API}{path}", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_notifications_check_alerts_post(self, auth_headers):
        r = requests.post(f"{API}/notifications/check-alerts", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
