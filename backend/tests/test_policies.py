"""Tests for /api/policies endpoints (Company Policies)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_list_requires_auth():
    r = requests.get(f"{BASE_URL}/api/policies", timeout=15)
    assert r.status_code in (401, 403)


def test_list_seeded(headers):
    r = requests.get(f"{BASE_URL}/api/policies", headers=headers, timeout=15)
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert len(items) >= 2
    titles = [i["title"] for i in items]
    assert any("Conflict Minerals" in t for t in titles)
    assert any("Forklift" in t for t in titles)
    for i in items:
        assert "content_html" not in i
        assert "title" in i and "issue" in i and "issue_date" in i


def test_get_full_policy(headers):
    r = requests.get(f"{BASE_URL}/api/policies", headers=headers, timeout=15).json()
    pid = r["items"][0]["id"]
    d = requests.get(f"{BASE_URL}/api/policies/{pid}", headers=headers, timeout=15)
    assert d.status_code == 200
    body = d.json()
    assert body.get("content_html")
    assert body["id"] == pid


def test_get_404(headers):
    r = requests.get(f"{BASE_URL}/api/policies/no-such-id", headers=headers, timeout=15)
    assert r.status_code == 404


def test_crud_create_update_delete(headers):
    payload = {"title": "TEST_Policy_ZZZ", "issue": "1", "issue_date": "01/2026",
               "content_html": "<p>hello</p>"}
    c = requests.post(f"{BASE_URL}/api/policies", headers=headers, json=payload, timeout=15)
    assert c.status_code == 200, c.text
    pid = c.json()["id"]
    # verify GET
    g = requests.get(f"{BASE_URL}/api/policies/{pid}", headers=headers, timeout=15).json()
    assert g["title"] == payload["title"]
    assert g["content_html"] == payload["content_html"]
    # update
    upd = {**payload, "title": "TEST_Policy_ZZZ_upd", "content_html": "<p>updated</p>"}
    u = requests.put(f"{BASE_URL}/api/policies/{pid}", headers=headers, json=upd, timeout=15)
    assert u.status_code == 200
    g2 = requests.get(f"{BASE_URL}/api/policies/{pid}", headers=headers, timeout=15).json()
    assert g2["title"] == "TEST_Policy_ZZZ_upd"
    assert g2["content_html"] == "<p>updated</p>"
    # delete
    d = requests.delete(f"{BASE_URL}/api/policies/{pid}", headers=headers, timeout=15)
    assert d.status_code == 200
    g3 = requests.get(f"{BASE_URL}/api/policies/{pid}", headers=headers, timeout=15)
    assert g3.status_code == 404


def test_export_pdf_both_seeded(headers):
    items = requests.get(f"{BASE_URL}/api/policies", headers=headers, timeout=15).json()["items"]
    seeded = [i for i in items if "Conflict Minerals" in i["title"] or "Forklift" in i["title"]]
    assert len(seeded) >= 2
    for p in seeded:
        r = requests.get(f"{BASE_URL}/api/policies/{p['id']}/export/pdf",
                         headers=headers, timeout=60)
        assert r.status_code == 200, f"{p['title']} => {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 20000, f"{p['title']} PDF only {len(r.content)} bytes"
        assert r.content[:4] == b"%PDF"


def test_ims_manual_pdf_regression(headers):
    r = requests.get(f"{BASE_URL}/api/ims-manual/export/pdf", headers=headers, timeout=90)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 20000
