"""IMS Manual Builder API tests"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# --- GET manual ---
def test_get_manual(h):
    r = requests.get(f"{BASE_URL}/api/ims-manual", headers=h, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "manual" in data and "sections" in data and "stats" in data
    assert len(data["sections"]) >= 29
    st = data["stats"]
    assert st["total"] == len(data["sections"])
    assert "approved" in st and "draft" in st and "completion_percent" in st


# --- PUT manual meta ---
def test_update_manual_meta(h):
    r = requests.get(f"{BASE_URL}/api/ims-manual", headers=h, timeout=30)
    orig = r.json()["manual"]
    payload = {
        "title": orig["title"], "doc_number": orig.get("doc_number"),
        "company_name": orig.get("company_name"), "issue_date": "2026-01-15",
        "notes": "TEST_meta_note"
    }
    r2 = requests.put(f"{BASE_URL}/api/ims-manual", headers=h, json=payload, timeout=30)
    assert r2.status_code == 200
    assert r2.json().get("notes") == "TEST_meta_note"


# --- Create custom section (for destructive edits) ---
@pytest.fixture(scope="module")
def custom_section(h):
    payload = {"part": "manual", "section_number": "TEST-99",
               "title": "TEST_Custom_Section", "clause_refs": "",
               "content": "Initial content", "mapped_clauses": []}
    r = requests.post(f"{BASE_URL}/api/ims-manual/sections", headers=h, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_section(custom_section):
    assert custom_section["title"] == "TEST_Custom_Section"
    assert custom_section["status"] == "Draft"
    assert custom_section["revision"] == 1


# --- Edit section: bumps rev, resets to Draft, snapshots in revisions ---
def test_edit_section_bumps_revision(h, custom_section):
    sid = custom_section["id"]
    payload = {"part": "manual", "section_number": custom_section["section_number"],
               "title": custom_section["title"],
               "clause_refs": "", "content": "Updated content v2",
               "mapped_clauses": [{"standard_name": "ISO 9001", "version": "2015",
                                   "clause_number": "4.1", "clause_title": "Context"}],
               "change_summary": "TEST_edit_summary"}
    r = requests.put(f"{BASE_URL}/api/ims-manual/sections/{sid}", headers=h, json=payload, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["revision"] == 2
    assert body["status"] == "Draft"
    assert body["content"] == "Updated content v2"
    assert len(body["mapped_clauses"]) == 1
    # revisions history
    rr = requests.get(f"{BASE_URL}/api/ims-manual/revisions?section_id={sid}", headers=h, timeout=30)
    assert rr.status_code == 200
    items = rr.json()["items"]
    assert any(x.get("action") == "edited" and x.get("summary") == "TEST_edit_summary" for x in items)


# --- Approve custom section ---
def test_approve_section(h, custom_section):
    sid = custom_section["id"]
    r = requests.post(f"{BASE_URL}/api/ims-manual/sections/{sid}/approve", headers=h, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "Approved"
    assert body.get("approved_by")


# --- Revisions listing ---
def test_get_revisions_all(h):
    r = requests.get(f"{BASE_URL}/api/ims-manual/revisions", headers=h, timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    assert isinstance(items, list) and len(items) >= 1


# --- PDF exports ---
def test_export_full_pdf(h):
    r = requests.get(f"{BASE_URL}/api/ims-manual/export/pdf", headers=h, timeout=90)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 10000  # non-trivial


def test_export_section_pdf(h, custom_section):
    sid = custom_section["id"]
    r = requests.get(f"{BASE_URL}/api/ims-manual/sections/{sid}/export/pdf", headers=h, timeout=60)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 1000


# --- Archive custom section (cleanup) ---
def test_archive_section(h, custom_section):
    sid = custom_section["id"]
    r = requests.delete(f"{BASE_URL}/api/ims-manual/sections/{sid}", headers=h, timeout=30)
    assert r.status_code == 200
    assert r.json().get("success") is True
    # verify no longer listed
    lst = requests.get(f"{BASE_URL}/api/ims-manual", headers=h, timeout=30).json()["sections"]
    assert not any(s["id"] == sid for s in lst)


# --- Auth required ---
def test_get_manual_requires_auth():
    r = requests.get(f"{BASE_URL}/api/ims-manual", timeout=30)
    assert r.status_code in (401, 403)


# --- Approve whole manual LAST (mutates state) ---
def test_approve_whole_manual(h):
    r = requests.post(f"{BASE_URL}/api/ims-manual/approve", headers=h, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "Approved"
    # verify sections all approved
    data = requests.get(f"{BASE_URL}/api/ims-manual", headers=h, timeout=30).json()
    assert data["stats"]["draft"] == 0
    assert data["stats"]["approved"] == data["stats"]["total"]
