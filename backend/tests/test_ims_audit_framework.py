"""IMS Audit Framework tests (iteration 22).

Covers:
  - Standards Library seed idempotency + CRUD + Help lookup + Transition items
  - Audit Templates listing + create-audit from Full IMS template
  - Asset registers CRUD + compliance report
  - Audit samples + finding update + lock/reopen + trail + coverage/open-findings/dashboard
  - PDF generation for template-created and legacy audits (regression) — no help text in PDF
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")


# ── auth ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {token}"})
    return s


# ── STANDARDS LIBRARY ────────────────────────────────────────────────
class TestStandardsLibrary:
    def test_seed_idempotent(self, client):
        r1 = client.post(f"{BASE_URL}/api/standards-library/seed", timeout=60)
        assert r1.status_code == 200, r1.text
        r2 = client.post(f"{BASE_URL}/api/standards-library/seed", timeout=60)
        assert r2.status_code == 200
        created2 = r2.json().get("created", {})
        assert created2.get("standards", 0) == 0, f"2nd seed should create 0 standards, got {created2}"

    def test_list_standards_has_six(self, client):
        r = client.get(f"{BASE_URL}/api/standards-library/standards", timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 6, f"expected >=6 standards, got {len(items)}"
        names = {f"{i['name']} {i['version']}" for i in items}
        expected = {"ISO 9001 2015", "ISO 9001 2026", "ISO 14001 2015",
                    "ISO 14001 2026", "ISO 45001 2018", "ISO 19011 2026"}
        assert expected.issubset(names), f"missing standards: {expected - names}"

    def test_clauses_by_standard(self, client):
        r = client.get(f"{BASE_URL}/api/standards-library/standards", timeout=30)
        sid = r.json()["items"][0]["id"]
        cr = client.get(f"{BASE_URL}/api/standards-library/clauses?standard_id={sid}", timeout=30)
        assert cr.status_code == 200
        assert isinstance(cr.json()["items"], list)

    def test_help_has_17_sections(self, client):
        r = client.get(f"{BASE_URL}/api/standards-library/help", timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 17, f"expected >=17 help sections, got {len(items)}"

    def test_help_lookup_legacy_title(self, client):
        r = client.get(f"{BASE_URL}/api/standards-library/help/lookup",
                       params={"section": "General Requirements"}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        # LEGACY_TITLE_MAP must map "General Requirements" → new title
        assert j["mapped_key"] == "Context of the Organisation, IMS Scope and Process Interaction", j
        assert j["found"] is True
        assert j["help"] is not None

    def test_help_upsert(self, client):
        payload = {"section_key": "Records", "purpose": "TEST_purpose_edit"}
        r = client.put(f"{BASE_URL}/api/standards-library/help", json=payload, timeout=30)
        assert r.status_code == 200
        doc = r.json()
        assert doc["purpose"] == "TEST_purpose_edit"

    def test_standards_crud(self, client):
        payload = {"name": "TEST_STD", "version": "9.9", "type": "Quality", "status": "Draft"}
        c = client.post(f"{BASE_URL}/api/standards-library/standards", json=payload, timeout=30)
        assert c.status_code == 200, c.text
        sid = c.json()["id"]
        u = client.put(f"{BASE_URL}/api/standards-library/standards/{sid}",
                       json={**payload, "status": "Current"}, timeout=30)
        assert u.status_code == 200
        assert u.json()["status"] == "Current"
        d = client.delete(f"{BASE_URL}/api/standards-library/standards/{sid}", timeout=30)
        assert d.status_code == 200

    def test_transition_items_crud_and_report(self, client):
        payload = {"current_standard": "ISO 9001:2015", "new_standard": "ISO 9001:2026",
                   "gap_identified": "TEST_gap", "risk_level": "High", "status": "Open"}
        c = client.post(f"{BASE_URL}/api/standards-library/transition-items", json=payload, timeout=30)
        assert c.status_code == 200
        tid = c.json()["id"]
        # verify persisted via GET
        g = client.get(f"{BASE_URL}/api/standards-library/transition-items", timeout=30)
        assert any(it["id"] == tid for it in g.json()["items"])
        # close it
        u = client.put(f"{BASE_URL}/api/standards-library/transition-items/{tid}",
                       json={**payload, "status": "Closed"}, timeout=30)
        assert u.status_code == 200
        assert u.json()["status"] == "Closed"
        # report
        rep = client.get(f"{BASE_URL}/api/standards-library/transition-report", timeout=30)
        assert rep.status_code == 200
        assert "progress_percent" in rep.json()
        # cleanup
        client.delete(f"{BASE_URL}/api/standards-library/transition-items/{tid}", timeout=30)


# ── AUDIT TEMPLATES ──────────────────────────────────────────────────
@pytest.fixture(scope="session")
def full_ims_template(client):
    r = client.get(f"{BASE_URL}/api/audit-templates", timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 14, f"expected >=14 templates, got {len(items)}"
    # Find Full IMS template (17 sections)
    for t in items:
        if len(t.get("sections") or []) >= 17:
            return t
    pytest.fail("No Full IMS (17-section) template found")


class TestAuditTemplates:
    def test_list_has_14_templates(self, client):
        r = client.get(f"{BASE_URL}/api/audit-templates", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 14

    def test_create_audit_from_full_ims(self, client, full_ims_template):
        tid = full_ims_template["id"]
        r = client.post(f"{BASE_URL}/api/audit-templates/{tid}/create-audit",
                        json={"auditor_name": "TEST Auditor"}, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["success"] is True
        assert j["audit_id"]
        pytest.audit_id = j["audit_id"]  # stash for later tests

    def test_findings_sorted_numerically(self, client):
        aid = getattr(pytest, "audit_id", None)
        assert aid, "audit_id required"
        r = client.get(f"{BASE_URL}/api/audits/{aid}/findings", timeout=30)
        assert r.status_code == 200
        findings = r.json()
        assert len(findings) >= 17, f"Full IMS should have >=17 findings, got {len(findings)}"
        # extract leading integer part of clause_number
        nums = []
        for f in findings:
            cn = str(f.get("clause_number", "0")).split(".")[0]
            try:
                nums.append(int(cn))
            except ValueError:
                nums.append(0)
        assert nums == sorted(nums), f"findings not numerically sorted: {nums}"
        # Ensure 1,2,3 come before 10, 11 (not lexicographic)
        if 10 in nums and 2 in nums:
            assert nums.index(2) < nums.index(10)


# ── ASSET REGISTERS ──────────────────────────────────────────────────
class TestAssetRegisters:
    def test_crud_and_overdue_flag(self, client):
        payload = {"register_type": "fire_equipment", "asset_id": "TEST_FE_1",
                   "location": "TEST Zone A", "next_due": "2020-01-01"}  # past
        c = client.post(f"{BASE_URL}/api/asset-registers/items", json=payload, timeout=30)
        assert c.status_code == 200, c.text
        iid = c.json()["id"]
        g = client.get(f"{BASE_URL}/api/asset-registers/items?register_type=fire_equipment", timeout=30)
        rec = next((i for i in g.json()["items"] if i["id"] == iid), None)
        assert rec is not None
        assert rec["overdue"] is True, "past next_due should be overdue"
        u = client.put(f"{BASE_URL}/api/asset-registers/items/{iid}",
                       json={**payload, "next_due": "2099-01-01"}, timeout=30)
        assert u.status_code == 200
        client.delete(f"{BASE_URL}/api/asset-registers/items/{iid}", timeout=30)

    def test_compliance_report(self, client):
        r = client.get(f"{BASE_URL}/api/asset-registers/compliance-report", timeout=30)
        assert r.status_code == 200
        j = r.json()
        for rt in ("fire_equipment", "test_tag", "first_aid", "spill_kit"):
            assert rt in j
            assert "total" in j[rt] and "overdue" in j[rt]

    def test_invalid_register_type_400(self, client):
        r = client.post(f"{BASE_URL}/api/asset-registers/items",
                        json={"register_type": "bogus"}, timeout=30)
        assert r.status_code == 400


# ── SAMPLES / FINDINGS / LOCK / TRAIL ────────────────────────────────
class TestAuditWorkflow:
    def test_add_sample_and_list(self, client):
        aid = getattr(pytest, "audit_id", None)
        assert aid
        findings = client.get(f"{BASE_URL}/api/audits/{aid}/findings", timeout=30).json()
        fid = findings[0]["id"]
        pytest.finding_id = fid
        payload = {"report_id": aid, "finding_id": fid, "sample_type": "Document",
                   "sample_id": "TEST_SAMPLE_1", "result": "OK"}
        r = client.post(f"{BASE_URL}/api/audits/{aid}/samples", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        pytest.sample_id = sid
        # list filtered by finding_id
        g = client.get(f"{BASE_URL}/api/audits/{aid}/samples?finding_id={fid}", timeout=30)
        assert g.status_code == 200
        assert any(s["id"] == sid for s in g.json()["items"])

    def test_update_finding_extended_fields(self, client):
        fid = getattr(pytest, "finding_id", None)
        assert fid
        payload = {"status": "In Progress", "risk_rating": "High",
                   "records_checked": "TEST records", "people_interviewed": "TEST person",
                   "corrective_action_required": True, "responsible_person": "TEST resp",
                   "due_date": "2099-06-30", "finding_type": "Minor Nonconformity"}
        r = client.put(f"{BASE_URL}/api/audits/findings/{fid}", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "In Progress"
        assert r.json().get("risk_rating") == "High"

    def test_lock_blocks_finding_update(self, client):
        aid = getattr(pytest, "audit_id", None)
        fid = getattr(pytest, "finding_id", None)
        lock = client.post(f"{BASE_URL}/api/audits/{aid}/lock", json={"reason": "TEST lock"}, timeout=30)
        assert lock.status_code == 200
        r = client.put(f"{BASE_URL}/api/audits/findings/{fid}",
                       json={"status": "Closed"}, timeout=30)
        assert r.status_code == 423, f"expected 423 on locked, got {r.status_code}"

    def test_reopen_requires_reason_and_authorised_by(self, client):
        aid = getattr(pytest, "audit_id", None)
        bad = client.post(f"{BASE_URL}/api/audits/{aid}/reopen",
                          json={"reason": "", "authorised_by": ""}, timeout=30)
        assert bad.status_code in (400, 422), f"expected 400/422, got {bad.status_code}"
        good = client.post(f"{BASE_URL}/api/audits/{aid}/reopen",
                           json={"reason": "TEST reopen", "authorised_by": "TEST Mgr"}, timeout=30)
        assert good.status_code == 200
        assert good.json().get("locked") is False

    def test_trail_contains_entries(self, client):
        aid = getattr(pytest, "audit_id", None)
        r = client.get(f"{BASE_URL}/api/audits/{aid}/trail", timeout=30)
        assert r.status_code == 200
        actions = {e.get("action") for e in r.json()["items"]}
        # Should include at least these
        assert "audit_locked" in actions or "audit_reopened" in actions, actions
        assert "sample_added" in actions, actions

    def test_coverage_report(self, client):
        aid = getattr(pytest, "audit_id", None)
        r = client.get(f"{BASE_URL}/api/audits/{aid}/coverage-report", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "total" in j and j["total"] >= 17
        for k in ("audited", "not_audited", "not_applicable", "with_findings", "no_evidence"):
            assert isinstance(j[k], list)

    def test_open_findings_report(self, client):
        r = client.get(f"{BASE_URL}/api/audits/reports/open-findings", timeout=30)
        assert r.status_code == 200
        assert "items" in r.json() and "count" in r.json()

    def test_dashboard_summary(self, client):
        r = client.get(f"{BASE_URL}/api/audits/dashboard/summary", timeout=30)
        assert r.status_code == 200
        j = r.json()
        for k in ("total_audits", "open_findings", "findings_by_severity", "assets_overdue"):
            assert k in j, f"missing key {k}"

    def test_sample_delete(self, client):
        sid = getattr(pytest, "sample_id", None)
        if not sid:
            pytest.skip("no sample")
        r = client.delete(f"{BASE_URL}/api/audits/samples/{sid}", timeout=30)
        assert r.status_code == 200


# ── PDF (template audit + legacy regression) ─────────────────────────
class TestPDF:
    def test_pdf_template_audit(self, client):
        aid = getattr(pytest, "audit_id", None)
        assert aid
        r = client.get(f"{BASE_URL}/api/audits/{aid}/pdf", timeout=90)
        assert r.status_code == 200, f"pdf status {r.status_code}: {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf") or r.content[:4] == b"%PDF"
        # PDF must NOT contain help/guidance markers
        blob = r.content
        # PDF is compressed but reportlab often keeps text uncompressed. Search raw bytes.
        assert b"AUDITOR GUIDANCE" not in blob.upper(), "PDF must not contain 'AUDITOR GUIDANCE'"
        assert b"HELP CONTENT" not in blob.upper(), "PDF must not contain 'HELP CONTENT'"

    def test_pdf_legacy_audits_regression(self, client):
        # find AR-2025-026 / AR-2025-TEST
        r = client.get(f"{BASE_URL}/api/audits?limit=200", timeout=30)
        assert r.status_code == 200
        legacy = [a for a in r.json() if a.get("report_number") in ("AR-2025-026", "AR-2025-TEST")]
        assert len(legacy) >= 1, f"legacy audits not found; audit numbers: {[a.get('report_number') for a in r.json()][:20]}"
        for a in legacy:
            p = client.get(f"{BASE_URL}/api/audits/{a['id']}/pdf", timeout=90)
            assert p.status_code == 200, f"legacy PDF {a['report_number']} failed: {p.status_code} {p.text[:200]}"
            assert p.content[:4] == b"%PDF"
            assert b"AUDITOR GUIDANCE" not in p.content.upper()
