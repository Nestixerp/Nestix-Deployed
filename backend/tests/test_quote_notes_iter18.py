"""Iter-18 backend tests: verify quote_notes field flows through POST/GET/PUT of /api/quotes.
Also spot-check that adjustment checkbox fields (adjust_stainless, adjust_complex,
adjust_multi_setup, adjust_tight_tolerance) and part_width/part_length persist on line items.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quote-pdf-breaks.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_id(headers):
    r = requests.get(f"{BASE_URL}/api/customers", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    if isinstance(data, dict):
        data = data.get("customers") or data.get("data") or []
    if not data:
        # create one
        c = requests.post(f"{BASE_URL}/api/customers", headers=headers, json={
            "company_name": "TEST_QuoteNotesCo", "contact_name": "T", "email": "t@t.com"
        }, timeout=30)
        assert c.status_code in (200, 201), c.text
        return c.json().get("id")
    return data[0].get("id") or data[0].get("_id")


def _make_line_item():
    return {
        "line_number": 1,
        "part_number": "TEST-QN-1",
        "part_description": "Test part",
        "quantity": 1,
        "material": "Mild Steel",
        "thickness": "3.0",
        "part_width": 250.5,
        "part_length": 400.75,
        "processes": [{
            "id": "p1",
            "name": "Press Brake / Folding",
            "adjust_stainless": True,
            "adjust_complex": True,
            "adjust_multi_setup": True,
            "adjust_tight_tolerance": True,
        }],
    }


class TestQuoteNotesPersistence:
    def test_create_quote_with_notes(self, headers, customer_id):
        multi_line = "Line 1: delivery ASAP\nLine 2: <hello> escaped?\nLine 3: bracket [special]"
        payload = {
            "customer_id": customer_id,
            "customer_name": "TEST_QuoteNotesCo",
            "is_multi_item": True,
            "quote_notes": multi_line,
            "line_items": [_make_line_item()],
        }
        r = requests.post(f"{BASE_URL}/api/quotes", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        q = r.json()
        assert q.get("quote_notes") == multi_line, f"POST response quote_notes mismatch: {q.get('quote_notes')!r}"
        qid = q.get("id")
        assert qid

        # GET to verify persistence
        g = requests.get(f"{BASE_URL}/api/quotes/{qid}", headers=headers, timeout=30)
        assert g.status_code == 200
        got = g.json()
        assert got.get("quote_notes") == multi_line
        # line item fields should also persist
        items = got.get("line_items") or []
        assert len(items) == 1
        li = items[0]
        assert float(li.get("part_width") or 0) == 250.5, f"part_width: {li.get('part_width')}"
        assert float(li.get("part_length") or 0) == 400.75, f"part_length: {li.get('part_length')}"
        procs = li.get("processes") or []
        assert len(procs) == 1
        p0 = procs[0]
        assert p0.get("adjust_stainless") is True, f"process[0] adjust_stainless not preserved: {p0}"
        assert p0.get("adjust_complex") is True
        assert p0.get("adjust_multi_setup") is True
        assert p0.get("adjust_tight_tolerance") is True

        # cleanup
        pytest.qid = qid

    def test_update_quote_notes(self, headers):
        qid = getattr(pytest, "qid", None)
        assert qid, "no qid from create"
        new_notes = "Updated notes here.\nSecond paragraph."
        u = requests.put(f"{BASE_URL}/api/quotes/{qid}", headers=headers,
                         json={"quote_notes": new_notes}, timeout=30)
        assert u.status_code == 200, u.text
        assert u.json().get("quote_notes") == new_notes

        g = requests.get(f"{BASE_URL}/api/quotes/{qid}", headers=headers, timeout=30)
        assert g.status_code == 200
        assert g.json().get("quote_notes") == new_notes

    def test_empty_notes_ok(self, headers, customer_id):
        payload = {"customer_id": customer_id, "customer_name": "TEST_QuoteNotesCo",
                   "is_multi_item": True, "quote_notes": "", "line_items": [_make_line_item()]}
        r = requests.post(f"{BASE_URL}/api/quotes", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201)
        assert (r.json().get("quote_notes") or "") == ""
        qid = r.json().get("id")
        # cleanup best-effort
        requests.delete(f"{BASE_URL}/api/quotes/{qid}", headers=headers, timeout=30)

    def test_cleanup(self, headers):
        qid = getattr(pytest, "qid", None)
        if qid:
            requests.delete(f"{BASE_URL}/api/quotes/{qid}", headers=headers, timeout=30)
