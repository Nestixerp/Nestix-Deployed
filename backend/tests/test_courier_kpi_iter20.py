"""
Iter-20 backend regression tests for Courier KPI module.

Focus: REGRESSION #4 — PUT /couriers/{id} with exclude_unset must:
  • body {} → no field is overwritten to None
  • body {"color": "#00ff00"} → only color changes, name/code/sort_order/active preserved
  • body {"active": false} → deactivates
  • body {"active": true} → re-activates
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture
def new_courier(client):
    """Create a fresh courier for each test to isolate PUT semantics."""
    name = f"TEST_ITER20_{uuid.uuid4().hex[:6]}"
    r = client.post(
        f"{BASE_URL}/api/courier-kpi/couriers",
        json={"name": name, "code": "TST", "color": "#123456", "sort_order": 42, "active": True},
    )
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    yield j
    # cleanup — soft delete
    client.delete(f"{BASE_URL}/api/courier-kpi/couriers/{j['id']}")


class TestPUTExcludeUnset:
    def test_empty_body_preserves_all(self, client, new_courier):
        """PUT with body {} must not overwrite any existing fields to None."""
        cid = new_courier["id"]
        r = client.put(f"{BASE_URL}/api/courier-kpi/couriers/{cid}", json={})
        assert r.status_code == 200, r.text[:300]
        after = r.json()
        assert after["name"] == new_courier["name"], f"name got nulled: {after['name']}"
        assert after["code"] == new_courier["code"], f"code got nulled: {after['code']}"
        assert after["color"] == new_courier["color"], f"color got nulled: {after['color']}"
        assert after["sort_order"] == new_courier["sort_order"]
        assert after["active"] is True

        # Confirm via GET too
        r_list = client.get(f"{BASE_URL}/api/courier-kpi/couriers")
        fetched = next(c for c in r_list.json()["couriers"] if c["id"] == cid)
        assert fetched["name"] == new_courier["name"]
        assert fetched["code"] == new_courier["code"]
        assert fetched["color"] == new_courier["color"]
        assert fetched["sort_order"] == new_courier["sort_order"]
        assert fetched["active"] is True

    def test_partial_color_preserves_others(self, client, new_courier):
        cid = new_courier["id"]
        r = client.put(f"{BASE_URL}/api/courier-kpi/couriers/{cid}", json={"color": "#00ff00"})
        assert r.status_code == 200, r.text[:300]
        after = r.json()
        assert after["color"] == "#00ff00"
        assert after["name"] == new_courier["name"]
        assert after["code"] == new_courier["code"]
        assert after["sort_order"] == new_courier["sort_order"]
        assert after["active"] is True

    def test_deactivate_then_reactivate(self, client, new_courier):
        cid = new_courier["id"]
        # Deactivate
        r = client.put(f"{BASE_URL}/api/courier-kpi/couriers/{cid}", json={"active": False})
        assert r.status_code == 200, r.text[:300]
        assert r.json()["active"] is False
        # Should not appear in default list
        r_list = client.get(f"{BASE_URL}/api/courier-kpi/couriers")
        assert cid not in [c["id"] for c in r_list.json()["couriers"]]

        # Re-activate
        r = client.put(f"{BASE_URL}/api/courier-kpi/couriers/{cid}", json={"active": True})
        assert r.status_code == 200, r.text[:300]
        assert r.json()["active"] is True
        # Appears again
        r_list = client.get(f"{BASE_URL}/api/courier-kpi/couriers")
        assert cid in [c["id"] for c in r_list.json()["couriers"]]

    def test_name_only_update(self, client, new_courier):
        cid = new_courier["id"]
        new_name = f"{new_courier['name']}_RENAMED"
        r = client.put(f"{BASE_URL}/api/courier-kpi/couriers/{cid}", json={"name": new_name})
        assert r.status_code == 200
        after = r.json()
        assert after["name"] == new_name
        assert after["color"] == new_courier["color"]
        assert after["code"] == new_courier["code"]
        assert after["active"] is True
