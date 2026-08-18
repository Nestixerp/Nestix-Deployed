"""Tests for Near Miss (QMSF 32), Training Appraisal (QMSF 08), Leave of Absence (QMSF 12)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # frontend env path
    from pathlib import Path
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token returned: {data}"
    return tok


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ============ NEAR MISS ============
class TestNearMiss:
    def test_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/near-miss")
        assert r.status_code in (401, 403)

    def test_reference(self, auth):
        r = requests.get(f"{BASE_URL}/api/near-miss/reference", headers=auth)
        assert r.status_code == 200
        d = r.json()
        assert len(d["incident_types"]) == 5
        assert len(d["severity_levels"]) == 4

    def test_full_crud_and_stats(self, auth):
        # baseline stats
        r0 = requests.get(f"{BASE_URL}/api/near-miss/stats", headers=auth)
        assert r0.status_code == 200
        base = r0.json()

        # create
        payload = {"surname": "TEST_NM", "first_name": "User",
                   "incident_type": "Near Miss", "severity": "High",
                   "description": "QA test", "status": "Open"}
        r = requests.post(f"{BASE_URL}/api/near-miss", headers=auth, json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["surname"] == "TEST_NM"
        assert isinstance(rec.get("nm_no"), int)
        assert rec["nm_no"] >= 1
        nm_id = rec["id"]

        # get by id
        r2 = requests.get(f"{BASE_URL}/api/near-miss/{nm_id}", headers=auth)
        assert r2.status_code == 200
        assert r2.json()["id"] == nm_id

        # list with filters
        r3 = requests.get(f"{BASE_URL}/api/near-miss?search=TEST_NM", headers=auth)
        assert r3.status_code == 200
        assert any(it["id"] == nm_id for it in r3.json()["items"])

        r4 = requests.get(f"{BASE_URL}/api/near-miss?incident_type=Near Miss", headers=auth)
        assert r4.status_code == 200
        assert any(it["id"] == nm_id for it in r4.json()["items"])

        r5 = requests.get(f"{BASE_URL}/api/near-miss?status=Open", headers=auth)
        assert r5.status_code == 200

        # update
        payload["status"] = "Closed"
        r6 = requests.put(f"{BASE_URL}/api/near-miss/{nm_id}", headers=auth, json=payload)
        assert r6.status_code == 200
        assert r6.json()["status"] == "Closed"

        # verify persistence
        r7 = requests.get(f"{BASE_URL}/api/near-miss/{nm_id}", headers=auth)
        assert r7.json()["status"] == "Closed"

        # stats changed
        r8 = requests.get(f"{BASE_URL}/api/near-miss/stats", headers=auth)
        assert r8.json()["total"] == base["total"] + 1
        assert "by_type" in r8.json()
        assert "Near Miss" in r8.json()["by_type"]

        # delete
        r9 = requests.delete(f"{BASE_URL}/api/near-miss/{nm_id}", headers=auth)
        assert r9.status_code == 200

        # 404
        r10 = requests.get(f"{BASE_URL}/api/near-miss/{nm_id}", headers=auth)
        assert r10.status_code == 404


# ============ TRAINING APPRAISAL ============
class TestTrainingAppraisal:
    def test_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/training-appraisals")
        assert r.status_code in (401, 403)

    def test_reference(self, auth):
        r = requests.get(f"{BASE_URL}/api/training-appraisals/reference", headers=auth)
        assert r.status_code == 200
        d = r.json()
        assert d["sources"] == ["Internal", "External"]
        assert len(d["effectiveness_ratings"]) == 5

    def test_full_crud_and_stats(self, auth):
        r0 = requests.get(f"{BASE_URL}/api/training-appraisals/stats", headers=auth)
        assert r0.status_code == 200
        base = r0.json()

        payload = {"employee_name": "TEST_TA Trainee", "source": "External",
                   "description": "QA training", "total_hours": 4.5,
                   "effectiveness_rating": 4}
        r = requests.post(f"{BASE_URL}/api/training-appraisals", headers=auth, json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["employee_name"] == "TEST_TA Trainee"
        assert isinstance(rec.get("ta_no"), int)
        tid = rec["id"]

        r2 = requests.get(f"{BASE_URL}/api/training-appraisals/{tid}", headers=auth)
        assert r2.status_code == 200

        r3 = requests.get(f"{BASE_URL}/api/training-appraisals?source=External", headers=auth)
        assert any(it["id"] == tid for it in r3.json()["items"])

        r3b = requests.get(f"{BASE_URL}/api/training-appraisals?search=TEST_TA", headers=auth)
        assert any(it["id"] == tid for it in r3b.json()["items"])

        payload["effectiveness_rating"] = 5
        r4 = requests.put(f"{BASE_URL}/api/training-appraisals/{tid}", headers=auth, json=payload)
        assert r4.status_code == 200
        assert r4.json()["effectiveness_rating"] == 5

        r5 = requests.get(f"{BASE_URL}/api/training-appraisals/stats", headers=auth)
        s = r5.json()
        assert s["total"] == base["total"] + 1
        assert s["external"] == base["external"] + 1
        assert s["total_hours"] >= (base.get("total_hours", 0) or 0) + 4.4

        r6 = requests.delete(f"{BASE_URL}/api/training-appraisals/{tid}", headers=auth)
        assert r6.status_code == 200

        r7 = requests.get(f"{BASE_URL}/api/training-appraisals/{tid}", headers=auth)
        assert r7.status_code == 404


# ============ LEAVE OF ABSENCE ============
class TestLeaveOfAbsence:
    def test_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/leave-of-absence")
        assert r.status_code in (401, 403)

    def test_reference(self, auth):
        r = requests.get(f"{BASE_URL}/api/leave-of-absence/reference", headers=auth)
        assert r.status_code == 200
        d = r.json()
        assert len(d["paid_leave_types"]) == 8
        assert len(d["unpaid_leave_types"]) == 2
        assert len(d["titles"]) == 5

    def test_full_crud_and_stats(self, auth):
        r0 = requests.get(f"{BASE_URL}/api/leave-of-absence/stats", headers=auth)
        assert r0.status_code == 200
        base = r0.json()

        payload = {"surname": "TEST_LOA", "first_name": "Tester",
                   "leave": {"paid_types": ["Annual Leave"], "unpaid_types": []},
                   "status": "Approved"}
        r = requests.post(f"{BASE_URL}/api/leave-of-absence", headers=auth, json=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["surname"] == "TEST_LOA"
        assert isinstance(rec.get("loa_no"), int)
        assert rec.get("date_of_request"), "default date_of_request not set"
        lid = rec["id"]

        r2 = requests.get(f"{BASE_URL}/api/leave-of-absence/{lid}", headers=auth)
        assert r2.status_code == 200

        r3 = requests.get(f"{BASE_URL}/api/leave-of-absence?status=Approved", headers=auth)
        assert any(it["id"] == lid for it in r3.json()["items"])

        payload["status"] = "Completed"
        r4 = requests.put(f"{BASE_URL}/api/leave-of-absence/{lid}", headers=auth, json=payload)
        assert r4.status_code == 200
        assert r4.json()["status"] == "Completed"

        r5 = requests.get(f"{BASE_URL}/api/leave-of-absence/stats", headers=auth)
        s = r5.json()
        assert s["total"] == base["total"] + 1

        r6 = requests.delete(f"{BASE_URL}/api/leave-of-absence/{lid}", headers=auth)
        assert r6.status_code == 200

        r7 = requests.get(f"{BASE_URL}/api/leave-of-absence/{lid}", headers=auth)
        assert r7.status_code == 404

    def test_default_pending_status(self, auth):
        payload = {"surname": "TEST_LOA_DEFAULT", "first_name": "X",
                   "leave": {"paid_types": [], "unpaid_types": []}}
        r = requests.post(f"{BASE_URL}/api/leave-of-absence", headers=auth, json=payload)
        assert r.status_code == 200
        rec = r.json()
        assert rec.get("status") == "Pending"
        requests.delete(f"{BASE_URL}/api/leave-of-absence/{rec['id']}", headers=auth)
