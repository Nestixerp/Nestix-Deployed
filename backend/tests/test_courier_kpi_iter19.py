"""
Iter-19 backend tests for Courier KPI module.

Covers:
  • Couriers CRUD (create, list, update, soft-delete, include_inactive)
  • KPI entries upsert + validation
  • Aggregated /data endpoint (rolling and calendar modes)
  • ISO modules registry contains 'Courier KPI' under 'Operations'
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")


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


@pytest.fixture(scope="module")
def created_couriers(client):
    """Create 3 couriers, yield ids, then delete (soft) at end."""
    ids = {}
    for name in ["TEST_JET", "TEST_Toll", "TEST_StarTrack"]:
        r = client.post(f"{BASE_URL}/api/courier-kpi/couriers", json={"name": name})
        assert r.status_code == 200, f"Create {name}: {r.status_code} {r.text[:200]}"
        j = r.json()
        assert j["name"] == name
        assert "id" in j and isinstance(j["id"], str)
        assert j["active"] is True
        assert j["color"]  # auto-assigned when not supplied
        ids[name] = j["id"]
    yield ids
    # cleanup — soft-delete
    for cid in ids.values():
        client.delete(f"{BASE_URL}/api/courier-kpi/couriers/{cid}")


# ─── Courier CRUD ──────────────────────────────────────────────────────

class TestCourierCRUD:
    def test_list_contains_created(self, client, created_couriers):
        r = client.get(f"{BASE_URL}/api/courier-kpi/couriers")
        assert r.status_code == 200
        data = r.json()
        names = [c["name"] for c in data["couriers"]]
        for n in created_couriers.keys():
            assert n in names

    def test_update_color(self, client, created_couriers):
        cid = created_couriers["TEST_JET"]
        r = client.put(f"{BASE_URL}/api/courier-kpi/couriers/{cid}", json={"color": "#ff0000"})
        assert r.status_code == 200, r.text[:200]
        assert r.json()["color"] == "#ff0000"
        # verify via GET
        r2 = client.get(f"{BASE_URL}/api/courier-kpi/couriers")
        jet = next(c for c in r2.json()["couriers"] if c["id"] == cid)
        assert jet["color"] == "#ff0000"

    def test_soft_delete_excludes_from_default_list(self, client):
        # Create a dedicated courier to delete
        r = client.post(f"{BASE_URL}/api/courier-kpi/couriers", json={"name": "TEST_DeleteMe"})
        assert r.status_code == 200
        cid = r.json()["id"]

        r = client.delete(f"{BASE_URL}/api/courier-kpi/couriers/{cid}")
        assert r.status_code == 200
        assert r.json()["success"] is True

        # Default list must NOT include it
        r_active = client.get(f"{BASE_URL}/api/courier-kpi/couriers")
        assert cid not in [c["id"] for c in r_active.json()["couriers"]]

        # include_inactive=true MUST include it
        r_all = client.get(f"{BASE_URL}/api/courier-kpi/couriers", params={"include_inactive": "true"})
        assert r_all.status_code == 200
        all_ids = [c["id"] for c in r_all.json()["couriers"]]
        assert cid in all_ids
        deleted = next(c for c in r_all.json()["couriers"] if c["id"] == cid)
        assert deleted["active"] is False


# ─── KPI Entries ───────────────────────────────────────────────────────

class TestEntries:
    def test_upsert_and_get(self, client, created_couriers):
        cid = created_couriers["TEST_JET"]
        payload = {
            "courier_id": cid,
            "month": "2025-07",
            "on_time_3hr_percent": 86.2,
            "late_3hr_percent": 13.8,
            "on_time_4hr_percent": 97.2,
            "late_4hr_percent": 2.8,
        }
        r = client.put(f"{BASE_URL}/api/courier-kpi/entries", json=payload)
        assert r.status_code == 200, r.text[:300]
        entry = r.json()
        assert entry["on_time_3hr_percent"] == 86.2
        assert entry["month"] == "2025-07"

        # GET with filter
        r = client.get(
            f"{BASE_URL}/api/courier-kpi/entries",
            params={"courier_id": cid, "start_month": "2025-01", "end_month": "2025-12"},
        )
        assert r.status_code == 200
        entries = r.json()["entries"]
        assert any(e["month"] == "2025-07" and e["on_time_3hr_percent"] == 86.2 for e in entries)

    def test_idempotent_upsert(self, client, created_couriers):
        cid = created_couriers["TEST_JET"]
        payload = {"courier_id": cid, "month": "2025-08", "on_time_3hr_percent": 50.0}
        r1 = client.put(f"{BASE_URL}/api/courier-kpi/entries", json=payload)
        assert r1.status_code == 200
        first_id = r1.json()["id"]

        # Second put with different value
        payload["on_time_3hr_percent"] = 75.5
        r2 = client.put(f"{BASE_URL}/api/courier-kpi/entries", json=payload)
        assert r2.status_code == 200
        assert r2.json()["id"] == first_id  # same id → no duplicate
        assert r2.json()["on_time_3hr_percent"] == 75.5

        # Confirm only 1 record for that (courier, month)
        r3 = client.get(
            f"{BASE_URL}/api/courier-kpi/entries",
            params={"courier_id": cid, "start_month": "2025-08", "end_month": "2025-08"},
        )
        assert len([e for e in r3.json()["entries"] if e["month"] == "2025-08"]) == 1

    def test_validation_out_of_range_percent(self, client, created_couriers):
        cid = created_couriers["TEST_JET"]
        r = client.put(
            f"{BASE_URL}/api/courier-kpi/entries",
            json={"courier_id": cid, "month": "2025-09", "on_time_3hr_percent": 150},
        )
        assert r.status_code == 400, f"Expected 400 for 150%, got {r.status_code}: {r.text[:200]}"

    def test_validation_bad_month(self, client, created_couriers):
        cid = created_couriers["TEST_JET"]
        r = client.put(
            f"{BASE_URL}/api/courier-kpi/entries",
            json={"courier_id": cid, "month": "2025-13", "on_time_3hr_percent": 90},
        )
        assert r.status_code == 400, f"Expected 400 for month 2025-13, got {r.status_code}"

    def test_delete_entry(self, client, created_couriers):
        cid = created_couriers["TEST_Toll"]
        r = client.put(
            f"{BASE_URL}/api/courier-kpi/entries",
            json={"courier_id": cid, "month": "2025-05", "on_time_3hr_percent": 88.0},
        )
        assert r.status_code == 200
        entry_id = r.json()["id"]

        r = client.delete(f"{BASE_URL}/api/courier-kpi/entries/{entry_id}")
        assert r.status_code == 200

        # verify gone
        r = client.get(
            f"{BASE_URL}/api/courier-kpi/entries",
            params={"courier_id": cid, "start_month": "2025-05", "end_month": "2025-05"},
        )
        assert not any(e["id"] == entry_id for e in r.json()["entries"])


# ─── Aggregated data ───────────────────────────────────────────────────

class TestChartData:
    def test_rolling_window(self, client, created_couriers):
        r = client.get(f"{BASE_URL}/api/courier-kpi/data", params={"period": "rolling", "end_month": "2026-02"})
        assert r.status_code == 200
        d = r.json()
        assert d["period_type"] == "rolling"
        assert len(d["months"]) == 12
        assert d["months"][0]["label"] == "MAR-25"
        assert d["months"][-1]["label"] == "FEB-26"
        # series shape
        cid = created_couriers["TEST_JET"]
        s3 = d["series_3hr"].get(cid)
        assert s3 is not None
        assert len(s3["on_time"]) == 12
        assert len(s3["late"]) == 12
        # avg should be non-null (we inserted 2025-07 and 2025-08 earlier which fall in window)
        assert s3["avg_on_time"] is not None

    def test_calendar_year(self, client, created_couriers):
        r = client.get(f"{BASE_URL}/api/courier-kpi/data", params={"period": "calendar", "year": 2025})
        assert r.status_code == 200
        d = r.json()
        assert d["period_type"] == "calendar"
        assert len(d["months"]) == 12
        assert d["months"][0]["label"] == "JAN-25"
        assert d["months"][-1]["label"] == "DEC-25"


# ─── ISO module registry ───────────────────────────────────────────────

class TestISOModules:
    def test_courier_kpi_registered(self, client):
        r = client.get(f"{BASE_URL}/api/iso-modules/modules")
        assert r.status_code == 200
        modules = r.json()["modules"]
        match = [m for m in modules if m["name"] == "Courier KPI"]
        assert match, "Courier KPI missing from ISO modules registry"
        assert match[0]["group"] == "Operations"
