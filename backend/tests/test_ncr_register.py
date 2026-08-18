"""Backend tests for the NCR Register module (QMSF 03)."""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEFAULT_DEPTS = [
    "Sales", "Programming", "Production", "Packing",
    "Scheduling", "Accounts", "Dispatch", "Inwards",
    "Quality", "Stores", "Maintenance",
]


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Track NCRs created for cleanup
CREATED_IDS = []


@pytest.fixture(scope="session", autouse=True)
def cleanup_after(H):
    yield
    # Cleanup: delete all NCRs created during tests
    for nid in CREATED_IDS:
        requests.delete(f"{API}/ncr/{nid}", headers=H, timeout=15)
    # Restore default departments
    requests.put(f"{API}/ncr/departments", json={"departments": DEFAULT_DEPTS}, headers=H, timeout=15)


# ----- Auth -----
class TestAuth:
    def test_list_no_auth(self):
        r = requests.get(f"{API}/ncr", timeout=15)
        assert r.status_code in (401, 403)

    def test_stats_no_auth(self):
        r = requests.get(f"{API}/ncr/stats", timeout=15)
        assert r.status_code in (401, 403)

    def test_departments_no_auth(self):
        r = requests.get(f"{API}/ncr/departments", timeout=15)
        assert r.status_code in (401, 403)

    def test_create_no_auth(self):
        r = requests.post(f"{API}/ncr", json={}, timeout=15)
        assert r.status_code in (401, 403)

    def test_credit_log_no_auth(self):
        r = requests.get(f"{API}/ncr/credit-requests/list", timeout=15)
        assert r.status_code in (401, 403)


# ----- Departments -----
class TestDepartments:
    def test_get_departments_autoseeds(self, H):
        r = requests.get(f"{API}/ncr/departments", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()["departments"]
        # Either freshly seeded with 11 defaults OR already exists with prior values
        for name in DEFAULT_DEPTS:
            assert name in d, f"expected default dept '{name}' present, got {d}"

    def test_put_departments_dedupes_case_insensitive(self, H):
        payload = {"departments": ["Sales", "sales", "Custom Dept", "CUSTOM DEPT", "Quality"]}
        r = requests.put(f"{API}/ncr/departments", json=payload, headers=H, timeout=15)
        assert r.status_code == 200, r.text
        out = r.json()["departments"]
        # Case-insensitive dedupe — should have 3 entries
        assert len(out) == 3, f"expected 3 deduped depts got {out}"
        # First occurrence preserved
        assert out[0] == "Sales"
        assert out[1] == "Custom Dept"
        assert out[2] == "Quality"

    def test_restore_defaults(self, H):
        r = requests.put(f"{API}/ncr/departments", json={"departments": DEFAULT_DEPTS}, headers=H, timeout=15)
        assert r.status_code == 200
        out = r.json()["departments"]
        assert out == DEFAULT_DEPTS


# ----- Route ordering: /stats and /departments must not be captured by /{id} -----
class TestRouteOrdering:
    def test_stats_not_treated_as_id(self, H):
        r = requests.get(f"{API}/ncr/stats", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        assert "this_month" in r.json()

    def test_departments_not_treated_as_id(self, H):
        r = requests.get(f"{API}/ncr/departments", headers=H, timeout=15)
        assert r.status_code == 200, r.text


# ----- CRUD + business rules -----
@pytest.fixture(scope="session")
def created_ncrs(H):
    """Create two NCRs (one NCR with credit + job sheet, one Concern). Returns list of dicts."""
    today_iso = date.today().isoformat()
    target = (date.today() + timedelta(days=14)).isoformat()
    p1 = {
        "date_raised": today_iso,
        "category": "NCR",
        "customer": "TEST_ACME Corp",
        "description": "TEST NCR full flow",
        "qty": 2,
        "cost_per_item": 100,
        "department": "Sales",
        "credit_request": {
            "enabled": True,
            "customer": "TEST_ACME Corp",
            "total_amount": 200,
            "reason": "Customer dissatisfied with finish",
            "status": "Pending",
        },
        "ncr_job_sheet": {
            "required": True,
            "recut_qty": 2,
            "instructions": "Recut from sheet 3",
            "target_completion_date": target,
            "status": "Open",
        },
    }
    r1 = requests.post(f"{API}/ncr", json=p1, headers=H, timeout=20)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    CREATED_IDS.append(d1["id"])

    p2 = {
        "date_raised": today_iso,
        "category": "Concern",
        "customer": "TEST_Beta Inc",
        "description": "TEST concern entry",
        "qty": 1,
        "cost_per_item": 50,
        "department": "Quality",
    }
    r2 = requests.post(f"{API}/ncr", json=p2, headers=H, timeout=20)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    CREATED_IDS.append(d2["id"])
    return [d1, d2]


class TestCreate:
    def test_first_ncr_has_ncr_no(self, created_ncrs):
        d1 = created_ncrs[0]
        assert isinstance(d1.get("ncr_no"), int)
        assert d1["ncr_no"] >= 1
        # Credit request auto-numbered
        cr = d1.get("credit_request") or {}
        assert cr.get("credit_request_no") is not None
        assert int(cr["credit_request_no"]) >= 1

    def test_second_ncr_auto_increments(self, created_ncrs):
        n1, n2 = created_ncrs[0]["ncr_no"], created_ncrs[1]["ncr_no"]
        assert n2 == n1 + 1, f"expected {n1+1}, got {n2}"

    def test_credit_request_mirrored_in_log(self, H, created_ncrs):
        d1 = created_ncrs[0]
        r = requests.get(f"{API}/ncr/credit-requests/list", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        match = [it for it in items if it.get("ncr_id") == d1["id"]]
        assert len(match) == 1, f"expected mirror cred-req log for ncr {d1['id']}, got {items}"
        log = match[0]
        assert log["ncr_no"] == d1["ncr_no"]
        assert log["customer"] == "TEST_ACME Corp"
        assert float(log.get("total_amount") or 0) == 200
        assert log["status"] == "Pending"


class TestList:
    def test_list_returns_items_and_count(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr", headers=H, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "count" in body
        assert isinstance(body["items"], list)

    def test_search_by_customer_case_insensitive(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr?search=acme", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(it.get("customer") == "TEST_ACME Corp" for it in items)

    def test_filter_category_ncr(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr?category=NCR", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(it.get("category") == "NCR" for it in items)
        assert any(it["id"] == created_ncrs[0]["id"] for it in items)

    def test_filter_category_concern(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr?category=Concern", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(it.get("category") == "Concern" for it in items)
        assert any(it["id"] == created_ncrs[1]["id"] for it in items)

    def test_filter_date_range(self, H, created_ncrs):
        today = date.today().isoformat()
        first = date.today().replace(day=1).isoformat()
        r = requests.get(f"{API}/ncr?date_from={first}&date_to={today}", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(it["id"] == created_ncrs[0]["id"] for it in items)

    def test_search_by_numeric_ncr_no(self, H, created_ncrs):
        ncr_no = created_ncrs[0]["ncr_no"]
        r = requests.get(f"{API}/ncr?search={ncr_no}", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(it.get("ncr_no") == ncr_no for it in items)


class TestStats:
    def test_stats_structure(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr/stats", headers=H, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("this_month", "ytd", "monthly"):
            assert key in d, f"missing key {key}"
        for sub in ("NCR", "Concern", "from", "to"):
            assert sub in d["this_month"]
            assert sub in d["ytd"]
        assert isinstance(d["monthly"], list)
        assert len(d["monthly"]) == 12
        for m in d["monthly"]:
            for k in ("label", "year", "month", "NCR", "Concern"):
                assert k in m
        # Our created NCR is from today so this_month NCR >= 1, Concern >= 1
        assert d["this_month"]["NCR"] >= 1
        assert d["this_month"]["Concern"] >= 1
        assert d["ytd"]["NCR"] >= 1
        assert d["ytd"]["Concern"] >= 1

    def test_stats_range_param(self, H, created_ncrs):
        today = date.today().isoformat()
        first = date.today().replace(day=1).isoformat()
        r = requests.get(f"{API}/ncr/stats?date_from={first}&date_to={today}", headers=H, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "range" in d
        assert d["range"]["NCR"] >= 1
        assert d["range"]["Concern"] >= 1
        assert d["range"]["from"] == first
        assert d["range"]["to"] == today


class TestUpdate:
    def test_toggle_credit_assigns_no_and_creates_log(self, H, created_ncrs):
        d2 = created_ncrs[1]  # was Concern with no credit
        # Verify no log entry exists
        r0 = requests.get(f"{API}/ncr/credit-requests/list", headers=H, timeout=15)
        before = [it for it in r0.json()["items"] if it.get("ncr_id") == d2["id"]]
        assert len(before) == 0

        # Update with credit enabled
        upd = dict(d2)
        upd["credit_request"] = {
            "enabled": True,
            "customer": d2.get("customer"),
            "total_amount": 75,
            "reason": "TEST toggle on",
            "status": "Pending",
        }
        # Remove server-only fields
        for k in ("id", "ncr_no", "created_at", "updated_at", "created_by"):
            upd.pop(k, None)
        r = requests.put(f"{API}/ncr/{d2['id']}", json=upd, headers=H, timeout=15)
        assert r.status_code == 200, r.text
        out = r.json()
        cr_no = (out.get("credit_request") or {}).get("credit_request_no")
        assert cr_no is not None and int(cr_no) >= 1

        r2 = requests.get(f"{API}/ncr/credit-requests/list", headers=H, timeout=15)
        after = [it for it in r2.json()["items"] if it.get("ncr_id") == d2["id"]]
        assert len(after) == 1, "credit_requests log entry should have been created on first enable"


class TestDelete:
    def test_delete_removes_ncr_and_credit_log(self, H, created_ncrs):
        # Create a temporary NCR with credit
        p = {
            "date_raised": date.today().isoformat(),
            "category": "NCR",
            "customer": "TEST_DeleteMe",
            "description": "TEST delete",
            "credit_request": {"enabled": True, "total_amount": 10, "status": "Pending"},
        }
        r = requests.post(f"{API}/ncr", json=p, headers=H, timeout=15)
        assert r.status_code == 200
        nid = r.json()["id"]

        # Confirm log entry exists
        log = requests.get(f"{API}/ncr/credit-requests/list", headers=H, timeout=15).json()["items"]
        assert any(it.get("ncr_id") == nid for it in log)

        # Delete
        rd = requests.delete(f"{API}/ncr/{nid}", headers=H, timeout=15)
        assert rd.status_code == 200

        # Verify NCR is gone
        rg = requests.get(f"{API}/ncr/{nid}", headers=H, timeout=15)
        assert rg.status_code == 404

        # Verify log entry removed
        log2 = requests.get(f"{API}/ncr/credit-requests/list", headers=H, timeout=15).json()["items"]
        assert not any(it.get("ncr_id") == nid for it in log2), "credit log entry should be removed"


class TestCreditLogSearch:
    def test_search_by_customer(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr/credit-requests/list?search=ACME", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any("ACME" in (it.get("customer") or "") for it in items)

    def test_status_filter(self, H, created_ncrs):
        r = requests.get(f"{API}/ncr/credit-requests/list?status=Pending", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(it.get("status") == "Pending" for it in items)
