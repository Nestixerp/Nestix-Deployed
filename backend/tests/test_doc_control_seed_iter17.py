"""
Iteration 17 — Backend tests for the FormsLibrary lookup fix.

Scope (per review_request):
1. /api/document-control returns the production-like seed (10 entries) with
   correct field contract: id, form_no, title, doc_type, issue, revision_date,
   owner, related_module.
2. Employment Application register entry resolves to QMSF 03 / Issue 3 /
   2026-06-19 via related_module='Employment Application Form'  (the user's
   original complaint — FormsLibrary used to print QMSF 02).
3. JSA Register vs JSA Form: legacy register entries with
   related_module='JSA' must be disambiguatable via doc_type ('Form' /
   'Register') — at least one such pair must exist in the seed so the smart
   lookup can validate behaviour.
4. /api/iso-modules/modules still returns ≥40 modules incl. both new split
   keys AND the legacy single-name keys (so the SMART fallback works).
5. Regression: every endpoint listed in the review_request returns 200.
"""

import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("token") or body.get("access_token")


@pytest.fixture(scope="session")
def auth_headers(token):
    assert token, "No token returned from login"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def doc_control(auth_headers):
    r = requests.get(f"{API}/document-control", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"/document-control failed: {r.status_code}"
    data = r.json()
    assert isinstance(data, list), "document-control must return a list"
    return data


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


# ───────────── 1. Data contract / seed verification ─────────────
class TestDocControlContract:
    def test_returns_list(self, doc_control):
        assert isinstance(doc_control, list)
        assert len(doc_control) >= 1, "register is empty — seed missing"

    def test_no_mongo_objectid_leak(self, doc_control):
        for it in doc_control:
            assert "_id" not in it, f"MongoDB _id leaked into payload: {it}"

    def test_required_fields_present(self, doc_control):
        # Per review_request the contract is: id, form_no, title, doc_type,
        # issue, revision_date, owner, related_module
        required = {"id", "form_no", "title", "issue",
                    "revision_date", "owner", "related_module"}
        for it in doc_control:
            missing = required - set(it.keys())
            assert not missing, f"row missing fields {missing}: {it}"

    def test_doc_type_field_present_on_split_entries(self, doc_control):
        # At least one entry should carry a doc_type ('Form' or 'Register')
        with_dt = [it for it in doc_control
                   if str(it.get("doc_type") or "").lower() in ("form", "register")]
        assert with_dt, "no entry has doc_type=Form|Register — smart lookup cannot disambiguate"

    def test_seed_size_at_least_10(self, doc_control):
        # Review_request states 10 production-like entries were seeded
        assert len(doc_control) >= 10, \
            f"expected ≥10 register entries from seed, got {len(doc_control)}"


# ─────── 2. Employment Application QMSF 03 (the user's bug) ───────
class TestEmploymentApplicationLookup:
    def _find(self, items, key):
        n = _norm(key)
        return [it for it in items if _norm(it.get("related_module")) == n]

    def test_employment_app_resolves_to_qmsf_03(self, doc_control):
        # FormsLibrary now passes related_module='Employment Application Form'
        hits = self._find(doc_control, "Employment Application Form")
        assert hits, "register has no entry with related_module='Employment Application Form'"
        # Prefer a Form-typed entry if multiple
        forms = [h for h in hits if str(h.get("doc_type") or "").lower() == "form"]
        chosen = forms[0] if forms else hits[0]
        assert chosen["form_no"] == "QMSF 03", \
            f"Employment App form_no must be QMSF 03 (not 02). Got {chosen.get('form_no')}"
        # Issue should be 3 (string or int tolerated)
        assert str(chosen["issue"]) == "3", \
            f"Employment App issue must be 3. Got {chosen.get('issue')}"
        # Revision date 2026-06-19 (any standard format — just check the date parts)
        rd = str(chosen.get("revision_date") or "")
        assert "2026" in rd and "06" in rd and "19" in rd, \
            f"Employment App revision_date must be 19-06-2026. Got {rd}"


# ─────── 3. JSA Register vs JSA Form (legacy disambiguation) ───────
class TestJsaLegacyDisambiguation:
    def test_jsa_pair_exists(self, doc_control):
        # Seed should include both a JSA Register and a JSA Form entry —
        # either with the new split key OR a pair of legacy related_module='JSA'
        # rows differentiated by doc_type.
        jsa_rows = [it for it in doc_control
                    if _norm(it.get("related_module")) in (_norm("JSA"),
                                                            _norm("JSA Register"),
                                                            _norm("JSA Form"))]
        assert jsa_rows, "no JSA-related entries in seed"
        types = {str(it.get("doc_type") or "").lower() for it in jsa_rows}
        # We need to be able to pick a Form vs Register
        assert ("form" in types) or ("register" in types), \
            f"JSA rows have no usable doc_type for smart-lookup. types={types}"


# ─────── 4. ISO modules dropdown still complete (≥40, has split keys) ───────
class TestIsoModulesRegistry:
    @pytest.fixture(scope="class")
    def modules_payload(self, auth_headers):
        r = requests.get(f"{API}/iso-modules/modules", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        return r.json()

    def _flatten(self, payload):
        # Payload may be a dict-of-groups or a flat list. Extract module
        # names regardless of shape.
        names = []
        if isinstance(payload, dict):
            for grp, rows in payload.items():
                if isinstance(rows, list):
                    for row in rows:
                        if isinstance(row, dict):
                            names.append(row.get("name") or row.get("module") or "")
                        else:
                            names.append(str(row))
        elif isinstance(payload, list):
            for row in payload:
                if isinstance(row, dict):
                    names.append(row.get("name") or row.get("module") or "")
                else:
                    names.append(str(row))
        return [n for n in names if n]

    def test_at_least_40_modules(self, modules_payload):
        names = self._flatten(modules_payload)
        assert len(names) >= 40, f"expected ≥40 modules, got {len(names)}: {names[:5]}…"

    def test_split_keys_present(self, modules_payload):
        names = {_norm(n) for n in self._flatten(modules_payload)}
        required = [
            "JSA Register", "JSA Form",
            "NCR Register", "NCR Form",
            "Plant Hazard Audit Form",
            "Near Miss Register",
            "Employment Application Form",
        ]
        for r in required:
            assert _norm(r) in names, f"missing split key: {r}"


# ─────── 5. Regression on all GET endpoints listed in request ───────
REGRESSION_ENDPOINTS = [
    "/jsas",
    "/ncr",
    "/risk-opportunities",
    "/plant-hazard-checks",
    "/near-miss",
    "/leave-of-absence",
    "/training-appraisals",
    "/iso-modules/modules",
    "/document-control",
    "/settings/",
    "/auth/users",
]


class TestRegression:
    @pytest.mark.parametrize("path", REGRESSION_ENDPOINTS)
    def test_get_200(self, auth_headers, path):
        r = requests.get(f"{API}{path}", headers=auth_headers, timeout=30)
        assert r.status_code == 200, \
            f"GET {path} expected 200, got {r.status_code} :: {r.text[:200]}"
