"""Backend tests for Plant Hazard Checks (PHC) - QMSF 31."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")
PREFIX = f"{BASE_URL}/api/plant-hazard-checks"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- auth required ---
class TestAuth:
    def test_categories_requires_auth(self):
        r = requests.get(f"{PREFIX}/hazard-categories")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_list_requires_auth(self):
        r = requests.get(PREFIX)
        assert r.status_code in (401, 403)

    def test_stats_requires_auth(self):
        r = requests.get(f"{PREFIX}/stats")
        assert r.status_code in (401, 403)

    def test_create_requires_auth(self):
        r = requests.post(PREFIX, json={"machine_name": "X"})
        assert r.status_code in (401, 403)


# --- categories ---
class TestCategories:
    def test_returns_16_categories(self, headers):
        r = requests.get(f"{PREFIX}/hazard-categories", headers=headers)
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert len(cats) == 16
        codes = [c["code"] for c in cats]
        assert codes == list("ABCDEFGHIJKLMNOP")
        assert cats[0]["name"] == "ENTANGLEMENT"


# --- stats baseline ---
class TestStats:
    def test_stats_shape(self, headers):
        r = requests.get(f"{PREFIX}/stats", headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "overdue_for_review" in d
        assert isinstance(d["total"], int)
        assert isinstance(d["overdue_for_review"], int)


# --- CRUD + overdue ---
class TestCRUD:
    created_id = None
    overdue_id = None

    def test_create(self, headers):
        payload = {
            "machine_name": "TEST_Pedestal Grinder QA",
            "area": "Factory 1",
            "assessment_team": ["Tester"],
            "reason": "Review",
            "date_of_assessment": "2026-01-15",
            "next_review_date": "2027-01-15",
            "hazards": [{"code": "A", "name": "ENTANGLEMENT", "applies": "Yes",
                         "consequence": 3, "likelihood": "C", "risk": "Medium", "controls": "Guard"}],
            "signed_by_1": "Admin",
        }
        r = requests.post(PREFIX, headers=headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"]
        assert isinstance(d["phc_no"], int) and d["phc_no"] >= 1
        assert d["machine_name"] == "TEST_Pedestal Grinder QA"
        TestCRUD.created_id = d["id"]

    def test_get_by_id(self, headers):
        assert TestCRUD.created_id
        r = requests.get(f"{PREFIX}/{TestCRUD.created_id}", headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert d["machine_name"] == "TEST_Pedestal Grinder QA"
        assert "_id" not in d

    def test_list_search(self, headers):
        r = requests.get(PREFIX, headers=headers, params={"search": "Pedestal"})
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(it["id"] == TestCRUD.created_id for it in items)
        assert all("_id" not in it for it in items)

    def test_update(self, headers):
        r = requests.put(f"{PREFIX}/{TestCRUD.created_id}", headers=headers, json={
            "machine_name": "TEST_Pedestal Grinder QA",
            "area": "Factory 1",
            "assessment_team": ["Tester"],
            "reason": "Updated Reason",
            "date_of_assessment": "2026-01-15",
            "next_review_date": "2027-01-15",
            "hazards": [],
        })
        assert r.status_code == 200, r.text
        # GET to verify persistence
        g = requests.get(f"{PREFIX}/{TestCRUD.created_id}", headers=headers)
        assert g.json()["reason"] == "Updated Reason"

    def test_create_overdue_and_stats(self, headers):
        # Stats before
        before = requests.get(f"{PREFIX}/stats", headers=headers).json()["overdue_for_review"]

        r = requests.post(PREFIX, headers=headers, json={
            "machine_name": "TEST_OverdueMachine",
            "area": "Factory 1",
            "assessment_team": ["Tester"],
            "reason": "Overdue test",
            "date_of_assessment": "2020-01-01",
            "next_review_date": "2021-01-01",
            "hazards": [],
        })
        assert r.status_code == 200
        TestCRUD.overdue_id = r.json()["id"]

        after = requests.get(f"{PREFIX}/stats", headers=headers).json()["overdue_for_review"]
        assert after == before + 1, f"overdue expected {before+1}, got {after}"

    def test_delete(self, headers):
        for rid in (TestCRUD.created_id, TestCRUD.overdue_id):
            if not rid:
                continue
            r = requests.delete(f"{PREFIX}/{rid}", headers=headers)
            assert r.status_code == 200
            g = requests.get(f"{PREFIX}/{rid}", headers=headers)
            assert g.status_code == 404
