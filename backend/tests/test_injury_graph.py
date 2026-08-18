"""Backend tests for the Injury Graph (LTI/MTI) feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Auth required ---
class TestAuth:
    def test_data_no_auth(self):
        r = requests.get(f"{API}/injury-graph/data", timeout=20)
        assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"

    def test_override_no_auth(self):
        r = requests.put(f"{API}/injury-graph/override", json={"year": 2026, "month_index": 0, "type": "LTI", "value": 1}, timeout=20)
        assert r.status_code in (401, 403)


# --- /data shape ---
class TestGraphData:
    def test_data_shape_2026(self, auth_headers):
        r = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["years"] == [2024, 2025, 2026]
        for key in ("lti", "mti", "auto_lti", "auto_mti", "totals"):
            assert key in d, f"missing {key}"
        for y in ("2024", "2025", "2026"):
            assert isinstance(d["lti"][y], list) and len(d["lti"][y]) == 12
            assert isinstance(d["mti"][y], list) and len(d["mti"][y]) == 12
            assert all(isinstance(x, int) for x in d["lti"][y])
            assert all(isinstance(x, int) for x in d["mti"][y])

    def test_data_default_end_year(self, auth_headers):
        r = requests.get(f"{API}/injury-graph/data", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["years"]) == 3


# --- Auto aggregation LTI / MTI ---
class TestAutoAggregation:
    def _create_record(self, auth_headers, date_str, ceased):
        payload = {
            "surname": "TESTLTI",
            "given_name": "Auto",
            "date_of_event": date_str,
            "ceased_work": ceased,
        }
        r = requests.post(f"{API}/injury-register", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _delete_override(self, auth_headers, year, type_):
        # Make sure no override hides auto value
        requests.delete(f"{API}/injury-graph/override-year/{year}/{type_}", headers=auth_headers, timeout=20)

    def test_lti_increment(self, auth_headers):
        self._delete_override(auth_headers, 2026, "LTI")
        # baseline
        r1 = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
        base = r1["auto_lti"]["2026"][2]  # march = idx 2
        rec_id = self._create_record(auth_headers, "2026-03-15", "Yes")
        try:
            r2 = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
            assert r2["auto_lti"]["2026"][2] == base + 1
            assert r2["lti"]["2026"][2] == base + 1
        finally:
            requests.delete(f"{API}/injury-register/{rec_id}", headers=auth_headers, timeout=20)

    def test_mti_increment(self, auth_headers):
        self._delete_override(auth_headers, 2026, "MTI")
        r1 = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
        base_mti = r1["auto_mti"]["2026"][5]  # june
        base_lti = r1["auto_lti"]["2026"][5]
        rec_id = self._create_record(auth_headers, "2026-06-10", "No")
        try:
            r2 = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
            assert r2["auto_mti"]["2026"][5] == base_mti + 1
            assert r2["auto_lti"]["2026"][5] == base_lti
        finally:
            requests.delete(f"{API}/injury-register/{rec_id}", headers=auth_headers, timeout=20)


# --- Overrides ---
class TestOverrides:
    def test_override_year_lti(self, auth_headers):
        vals = [1, 0, 2, 0, 0, 3, 0, 0, 0, 1, 0, 0]
        r = requests.put(f"{API}/injury-graph/override-year",
                         json={"year": 2026, "type": "LTI", "values": vals},
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
        assert d["lti"]["2026"] == vals
        assert d["totals"]["2026"]["LTI"] == sum(vals)
        # cleanup
        requests.delete(f"{API}/injury-graph/override-year/2026/LTI", headers=auth_headers, timeout=20)

    def test_single_override(self, auth_headers):
        # clear any prior overrides first
        requests.delete(f"{API}/injury-graph/override-year/2025/MTI", headers=auth_headers, timeout=20)
        r = requests.put(f"{API}/injury-graph/override",
                         json={"year": 2025, "month_index": 4, "type": "MTI", "value": 9},
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
        assert d["mti"]["2025"][4] == 9
        requests.delete(f"{API}/injury-graph/override/2025/4/MTI", headers=auth_headers, timeout=20)

    def test_delete_year_override_reverts(self, auth_headers):
        vals = [5] * 12
        requests.put(f"{API}/injury-graph/override-year",
                     json={"year": 2026, "type": "LTI", "values": vals},
                     headers=auth_headers, timeout=20)
        d1 = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
        assert d1["lti"]["2026"] == vals
        r = requests.delete(f"{API}/injury-graph/override-year/2026/LTI", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        d2 = requests.get(f"{API}/injury-graph/data", params={"end_year": 2026}, headers=auth_headers, timeout=30).json()
        assert d2["lti"]["2026"] == d2["auto_lti"]["2026"]

    def test_invalid_type(self, auth_headers):
        r = requests.put(f"{API}/injury-graph/override",
                         json={"year": 2026, "month_index": 0, "type": "XYZ", "value": 1},
                         headers=auth_headers, timeout=20)
        assert r.status_code in (400, 422)
