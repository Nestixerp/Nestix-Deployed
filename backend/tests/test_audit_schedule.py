"""Backend tests for the Internal Audit Schedule feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_YEAR = 2099  # spec-mandated cleanup year
DUP_TARGET_YEAR = 2098

EXPECTED_PRIORITY_NAMES = {
    "Control of Documented Information",
    "Control of Non Conforming Product / Corrective Action",
    "Management Review",
    "Legal and Regulatory Requirements",
    "Aspects and Impacts",
    "Internal Audits",
}


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session", autouse=True)
def cleanup(auth_headers):
    # Pre-clean
    for y in (TEST_YEAR, DUP_TARGET_YEAR):
        requests.delete(f"{API}/audit-schedule/{y}", headers=auth_headers, timeout=20)
    yield
    # Post-clean
    for y in (TEST_YEAR, DUP_TARGET_YEAR):
        requests.delete(f"{API}/audit-schedule/{y}", headers=auth_headers, timeout=20)


# --- Auth required ---
class TestAuth:
    def test_get_year_no_auth(self):
        r = requests.get(f"{API}/audit-schedule/{TEST_YEAR}", timeout=20)
        assert r.status_code in (401, 403)

    def test_years_no_auth(self):
        r = requests.get(f"{API}/audit-schedule/years", timeout=20)
        assert r.status_code in (401, 403)

    def test_put_no_auth(self):
        r = requests.put(f"{API}/audit-schedule/{TEST_YEAR}", json={}, timeout=20)
        assert r.status_code in (401, 403)

    def test_delete_no_auth(self):
        r = requests.delete(f"{API}/audit-schedule/{TEST_YEAR}", timeout=20)
        assert r.status_code in (401, 403)


# --- Auto-seed and defaults ---
class TestSeed:
    def test_get_year_autoseeds_with_defaults(self, auth_headers):
        r = requests.get(f"{API}/audit-schedule/{TEST_YEAR}", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == f"Internal Audit Schedule {TEST_YEAR}"
        assert d["company"] == "ULTIMATE LASER"
        assert d["year"] == TEST_YEAR
        assert isinstance(d["elements"], list)
        assert len(d["elements"]) == 13, f"expected 13 default elements, got {len(d['elements'])}"
        # priority flags
        priority_names = {el["name"] for el in d["elements"] if el.get("priority")}
        assert priority_names == EXPECTED_PRIORITY_NAMES, f"priority mismatch: {priority_names}"
        # cells contain 12 months and are empty
        months = {"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
        for el in d["elements"]:
            assert set(el["cells"].keys()) == months
            assert all(v == "" for v in el["cells"].values())
            assert "id" in el and el["id"]

    def test_years_contains_seeded(self, auth_headers):
        # ensure seeded
        requests.get(f"{API}/audit-schedule/{TEST_YEAR}", headers=auth_headers, timeout=30)
        r = requests.get(f"{API}/audit-schedule/years", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "years" in body
        yrs = body["years"]
        assert TEST_YEAR in yrs
        # sorted desc
        assert yrs == sorted(yrs, reverse=True)


# --- PUT update + persistence ---
class TestUpdatePersistence:
    def test_put_persists_cells_and_signature(self, auth_headers):
        # Seed
        cur = requests.get(f"{API}/audit-schedule/{TEST_YEAR}", headers=auth_headers, timeout=30).json()
        elements = cur["elements"]
        elements[0]["cells"]["jul"] = "C"
        elements[0]["cells"]["oct"] = "X"
        payload = {
            "title": cur["title"],
            "company": cur["company"],
            "elements": elements,
            "signed_by": "Test Auditor",
            "signed_date": "2099-01-15",
        }
        r = requests.put(f"{API}/audit-schedule/{TEST_YEAR}", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text

        # Verify via GET
        again = requests.get(f"{API}/audit-schedule/{TEST_YEAR}", headers=auth_headers, timeout=20).json()
        assert again["elements"][0]["cells"]["jul"] == "C"
        assert again["elements"][0]["cells"]["oct"] == "X"
        assert again["signed_by"] == "Test Auditor"
        assert again["signed_date"] == "2099-01-15"

    def test_put_normalises_missing_cells_and_ids(self, auth_headers):
        payload = {
            "title": f"Internal Audit Schedule {TEST_YEAR}",
            "company": "ULTIMATE LASER",
            "elements": [
                # No id, partial cells dict
                {"name": "Element A", "priority": False, "order": 0, "cells": {"jan": "X"}},
                {"name": "Element B", "priority": True, "order": 1, "cells": {}},
            ],
            "signed_by": "",
            "signed_date": "",
        }
        r = requests.put(f"{API}/audit-schedule/{TEST_YEAR}", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["elements"]) == 2
        months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        for el in d["elements"]:
            assert el["id"], "id should be auto-generated"
            for m in months:
                assert m in el["cells"]
                assert isinstance(el["cells"][m], str)
        assert d["elements"][0]["cells"]["jan"] == "X"
        assert d["elements"][0]["cells"]["feb"] == ""
        assert d["elements"][1]["cells"]["jan"] == ""


# --- Duplicate ---
class TestDuplicate:
    def test_duplicate_clones_elements_and_resets_signature(self, auth_headers):
        # Ensure source exists with marked cell + signature
        cur = requests.get(f"{API}/audit-schedule/{TEST_YEAR}", headers=auth_headers, timeout=30).json()
        cur["elements"][0]["cells"]["mar"] = "Z"
        requests.put(f"{API}/audit-schedule/{TEST_YEAR}", json={
            "title": cur["title"],
            "company": cur["company"],
            "elements": cur["elements"],
            "signed_by": "Source Signer",
            "signed_date": "2099-02-01",
        }, headers=auth_headers, timeout=20)

        # Make sure target doesn't exist
        requests.delete(f"{API}/audit-schedule/{DUP_TARGET_YEAR}", headers=auth_headers, timeout=20)

        r = requests.post(f"{API}/audit-schedule/{TEST_YEAR}/duplicate-to/{DUP_TARGET_YEAR}", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["year"] == DUP_TARGET_YEAR
        assert d["title"] == f"Internal Audit Schedule {DUP_TARGET_YEAR}"
        assert d["signed_by"] == ""
        assert d["signed_date"] == ""
        assert len(d["elements"]) == len(cur["elements"])
        assert d["elements"][0]["cells"]["mar"] == "Z"
        # fresh element ids
        src_ids = {e["id"] for e in cur["elements"]}
        new_ids = {e["id"] for e in d["elements"]}
        assert src_ids.isdisjoint(new_ids)

    def test_duplicate_conflict(self, auth_headers):
        # Both exist (from prior test) — re-dup must conflict
        r = requests.post(f"{API}/audit-schedule/{TEST_YEAR}/duplicate-to/{DUP_TARGET_YEAR}", headers=auth_headers, timeout=20)
        assert r.status_code == 409, r.text

    def test_duplicate_same_year(self, auth_headers):
        r = requests.post(f"{API}/audit-schedule/{TEST_YEAR}/duplicate-to/{TEST_YEAR}", headers=auth_headers, timeout=20)
        assert r.status_code == 400, r.text

    def test_duplicate_missing_source(self, auth_headers):
        # Use a non-existent year. First ensure 1999 not present.
        requests.delete(f"{API}/audit-schedule/1999", headers=auth_headers, timeout=20)
        requests.delete(f"{API}/audit-schedule/1998", headers=auth_headers, timeout=20)
        r = requests.post(f"{API}/audit-schedule/1999/duplicate-to/1998", headers=auth_headers, timeout=20)
        assert r.status_code == 404, r.text


# --- Categories (NEW for iteration 10) ---
class TestCategories:
    def test_get_categories_autoseeds_defaults(self, auth_headers):
        # Make sure they exist (they may already from prior runs)
        r = requests.get(f"{API}/audit-schedule/categories", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        cats = r.json().get("categories")
        assert isinstance(cats, list) and len(cats) >= 2
        by_short = {c["short"]: c for c in cats}
        # Defaults at least include INT & COMPASS
        if "INT" in by_short and "COMPASS" in by_short:
            assert by_short["INT"]["color"] == "#2563eb"
            assert "X" in by_short["INT"]["legacy_chars"]
            assert by_short["COMPASS"]["color"] == "#dc2626"
            assert "C" in by_short["COMPASS"]["legacy_chars"]
        for c in cats:
            assert "id" in c and c["id"]
            assert "order" in c
            assert "_id" not in c

    def test_put_replaces_categories_and_renumbers_order(self, auth_headers):
        # Start from defaults
        cur = requests.get(f"{API}/audit-schedule/categories", headers=auth_headers, timeout=20).json()["categories"]
        base = [c for c in cur if c.get("short") in ("INT", "COMPASS")]
        # If defaults missing, fall back to current list (still valid for the test goal)
        if not base:
            base = cur
        new_cats = [
            {**c, "order": 99} for c in base
        ] + [
            {"name": "Customer Audit", "short": "CUST", "color": "#16a34a", "legacy_chars": [], "order": 0}
        ]
        r = requests.put(f"{API}/audit-schedule/categories", json={"categories": new_cats}, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        saved = r.json()["categories"]
        # Re-numbered 0,1,2,...
        for i, c in enumerate(saved):
            assert c["order"] == i, f"order at idx {i} should be {i}, got {c['order']}"
        shorts = [c["short"] for c in saved]
        assert "CUST" in shorts

        # Read back
        r2 = requests.get(f"{API}/audit-schedule/categories", headers=auth_headers, timeout=20)
        saved2 = r2.json()["categories"]
        assert [c["short"] for c in saved2] == shorts

    def test_schedule_embeds_categories(self, auth_headers):
        # GET /{year} returns categories
        r = requests.get(f"{API}/audit-schedule/{TEST_YEAR}", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "categories" in d and isinstance(d["categories"], list) and len(d["categories"]) >= 1

        # PUT /{year} also returns categories
        payload = {
            "title": d["title"], "company": d["company"], "elements": d["elements"],
            "signed_by": d.get("signed_by", ""), "signed_date": d.get("signed_date", ""),
        }
        r2 = requests.put(f"{API}/audit-schedule/{TEST_YEAR}", json=payload, headers=auth_headers, timeout=20)
        assert r2.status_code == 200
        assert "categories" in r2.json() and isinstance(r2.json()["categories"], list)

    def test_categories_auth_required(self):
        r = requests.get(f"{API}/audit-schedule/categories", timeout=20)
        assert r.status_code in (401, 403)
        r2 = requests.put(f"{API}/audit-schedule/categories", json={"categories": []}, timeout=20)
        assert r2.status_code in (401, 403)

    def test_restore_default_categories(self, auth_headers):
        """Cleanup: restore the 2 defaults so frontend test starts from a known state."""
        defaults = [
            {"name": "Internal Audit", "short": "INT", "color": "#2563eb",
             "legacy_chars": ["X", "x"], "order": 0},
            {"name": "External Audit – COMPASS", "short": "COMPASS", "color": "#dc2626",
             "legacy_chars": ["C", "O", "M", "P", "A", "S"], "order": 1},
        ]
        r = requests.put(f"{API}/audit-schedule/categories", json={"categories": defaults}, headers=auth_headers, timeout=20)
        assert r.status_code == 200


# --- Delete ---
class TestDelete:
    def test_delete_then_404(self, auth_headers):
        # seed a temp year (using DUP_TARGET_YEAR already created above is fine)
        # ensure exists
        requests.get(f"{API}/audit-schedule/{DUP_TARGET_YEAR}", headers=auth_headers, timeout=20)
        r = requests.delete(f"{API}/audit-schedule/{DUP_TARGET_YEAR}", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        # second delete -> 404
        r2 = requests.delete(f"{API}/audit-schedule/{DUP_TARGET_YEAR}", headers=auth_headers, timeout=20)
        assert r2.status_code == 404
