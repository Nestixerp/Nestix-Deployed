"""
Customer Satisfaction Survey Module — Backend API tests
ISO 9001 yearly campaigns, public submission, admin reports, AI recommendations.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-pdf-breaks.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/customer-satisfaction"

ADMIN_USER = "admin"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def public_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Use far-future year to avoid conflicts with prior 2026 data
TEST_YEAR = 2099


@pytest.fixture(scope="session")
def test_campaign(admin_client):
    """Create a fresh test campaign (cleanup at end)."""
    # cleanup if any
    r = admin_client.get(f"{API}/campaigns")
    if r.status_code == 200:
        for c in r.json():
            if c.get("year") == TEST_YEAR:
                # delete responses first
                resps = admin_client.get(f"{API}/campaigns/{c['id']}/responses").json()
                for rsp in resps:
                    admin_client.delete(f"{API}/responses/{rsp['id']}")
                admin_client.delete(f"{API}/campaigns/{c['id']}")
    r = admin_client.post(f"{API}/campaigns", json={"year": TEST_YEAR, "title": "TEST_CS_2099"})
    assert r.status_code == 200, f"Create campaign failed: {r.text}"
    camp = r.json()
    yield camp
    # teardown
    resps = admin_client.get(f"{API}/campaigns/{camp['id']}/responses")
    if resps.status_code == 200:
        for rsp in resps.json():
            admin_client.delete(f"{API}/responses/{rsp['id']}")
    admin_client.delete(f"{API}/campaigns/{camp['id']}")


# ============ Campaign CRUD ============

class TestCampaignCRUD:
    def test_create_campaign_returns_token(self, test_campaign):
        assert test_campaign["year"] == TEST_YEAR
        assert test_campaign["status"] == "Active"
        assert test_campaign["public_token"]
        assert test_campaign["form_no"] == "QMSF 01A"
        assert "id" in test_campaign

    def test_duplicate_year_returns_400(self, admin_client, test_campaign):
        r = admin_client.post(f"{API}/campaigns", json={"year": TEST_YEAR})
        assert r.status_code == 400

    def test_list_campaigns_has_response_count(self, admin_client, test_campaign):
        r = admin_client.get(f"{API}/campaigns")
        assert r.status_code == 200
        data = r.json()
        match = [c for c in data if c["year"] == TEST_YEAR]
        assert len(match) == 1
        assert "response_count" in match[0]
        assert isinstance(match[0]["response_count"], int)

    def test_update_campaign_status(self, admin_client, test_campaign):
        cid = test_campaign["id"]
        r = admin_client.put(f"{API}/campaigns/{cid}", json={"title": "Updated Title TEST"})
        assert r.status_code == 200
        assert r.json()["title"] == "Updated Title TEST"
        # restore
        admin_client.put(f"{API}/campaigns/{cid}", json={"title": test_campaign["title"]})

    def test_rotate_token(self, admin_client, test_campaign):
        cid = test_campaign["id"]
        old = test_campaign["public_token"]
        r = admin_client.post(f"{API}/campaigns/{cid}/rotate-token")
        assert r.status_code == 200
        new_token = r.json()["public_token"]
        assert new_token != old
        # restore old for downstream tests
        admin_client.put(f"{API}/campaigns/{cid}", json={})  # no-op
        # Need to update the fixture token
        test_campaign["public_token"] = new_token


# ============ Public endpoints ============

class TestPublicEndpoints:
    def test_public_get_valid_token(self, public_client, admin_client, test_campaign):
        # fetch current token
        r = admin_client.get(f"{API}/campaigns")
        camp = [c for c in r.json() if c["id"] == test_campaign["id"]][0]
        token = camp["public_token"]
        r = public_client.get(f"{API}/public/campaign/{token}")
        assert r.status_code == 200
        data = r.json()
        assert data["active"] is True
        assert data["year"] == TEST_YEAR
        assert data["form_no"] == "QMSF 01A"
        assert "intro_message" in data
        assert "closing_message" in data

    def test_public_get_invalid_token(self, public_client):
        r = public_client.get(f"{API}/public/campaign/INVALID_TOKEN_xyz_123")
        assert r.status_code == 404

    def test_public_submit_valid(self, public_client, admin_client, test_campaign):
        camp = [c for c in admin_client.get(f"{API}/campaigns").json() if c["id"] == test_campaign["id"]][0]
        token = camp["public_token"]
        payload = {
            "customer_name": "Jane Tester",
            "company": "TEST Acme Co",
            "contact_email": "jane@test.com",
            "contact_number": "0400000000",
            "q_overall_quality": 5,
            "q_accuracy": 4,
            "q_deadlines": 5,
            "q_communication": 4,
            "q_professionalism": 5,
            "q_responsiveness": 4,
            "q_recommend": 5,
            "improvements_text": "Better packaging",
            "suggestions_text": "Online tracking",
            "additional_comments": "Great work overall",
        }
        r = public_client.post(f"{API}/public/submit/{token}", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["response_no"].startswith(f"CSS-{TEST_YEAR}-")
        assert "message" in data

    def test_public_submit_sequential_numbering(self, public_client, admin_client, test_campaign):
        camp = [c for c in admin_client.get(f"{API}/campaigns").json() if c["id"] == test_campaign["id"]][0]
        token = camp["public_token"]
        payload = {
            "customer_name": "John Tester2",
            "company": "TEST Beta Co",
            "q_overall_quality": 3,
            "q_accuracy": 3,
            "q_deadlines": 3,
            "q_communication": 3,
            "q_professionalism": 3,
            "q_responsiveness": 3,
            "q_recommend": 3,
        }
        r = public_client.post(f"{API}/public/submit/{token}", json=payload)
        assert r.status_code == 200
        # Should be CSS-2099-002 (since prev test inserted 001)
        assert r.json()["response_no"] == f"CSS-{TEST_YEAR}-002"

    def test_public_submit_score_out_of_range(self, public_client, admin_client, test_campaign):
        camp = [c for c in admin_client.get(f"{API}/campaigns").json() if c["id"] == test_campaign["id"]][0]
        token = camp["public_token"]
        r = public_client.post(f"{API}/public/submit/{token}",
                               json={"q_overall_quality": 7, "company": "TEST"})
        assert r.status_code == 400

    def test_public_routes_no_auth_required(self, public_client, admin_client, test_campaign):
        """Confirm no Authorization header is needed."""
        camp = [c for c in admin_client.get(f"{API}/campaigns").json() if c["id"] == test_campaign["id"]][0]
        token = camp["public_token"]
        # explicit empty session
        bare = requests.Session()
        r = bare.get(f"{API}/public/campaign/{token}")
        assert r.status_code == 200


# ============ Closed campaign behaviour ============

class TestClosedCampaign:
    def test_closed_public_get_returns_inactive(self, admin_client, public_client, test_campaign):
        cid = test_campaign["id"]
        camp = [c for c in admin_client.get(f"{API}/campaigns").json() if c["id"] == cid][0]
        token = camp["public_token"]
        # close
        r = admin_client.put(f"{API}/campaigns/{cid}", json={"status": "Closed"})
        assert r.status_code == 200
        r = public_client.get(f"{API}/public/campaign/{token}")
        assert r.status_code == 200
        assert r.json()["active"] is False
        # submit should 400
        r2 = public_client.post(f"{API}/public/submit/{token}",
                                json={"company": "TEST", "q_overall_quality": 5})
        assert r2.status_code == 400
        # reopen
        admin_client.put(f"{API}/campaigns/{cid}", json={"status": "Active"})


# ============ Admin: responses & report ============

class TestResponsesAndReport:
    def test_list_responses_with_computed(self, admin_client, test_campaign):
        r = admin_client.get(f"{API}/campaigns/{test_campaign['id']}/responses")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 2
        first = items[0]
        assert "computed" in first
        comp = first["computed"]
        assert "overall_pct" in comp
        assert "per_question_pct" in comp
        assert "score" in comp
        assert "max_score" in comp

    def test_list_responses_requires_auth(self, public_client, test_campaign):
        r = public_client.get(f"{API}/campaigns/{test_campaign['id']}/responses")
        assert r.status_code in (401, 403)

    def test_report_aggregation(self, admin_client, test_campaign):
        r = admin_client.get(f"{API}/campaigns/{test_campaign['id']}/report")
        assert r.status_code == 200
        rpt = r.json()
        assert "stats" in rpt and "overall_pct" in rpt["stats"]
        assert "category_averages" in rpt and len(rpt["category_averages"]) == 7
        assert "company_scores" in rpt
        if len(rpt["company_scores"]) >= 2:
            pcts = [c["pct"] for c in rpt["company_scores"]]
            assert pcts == sorted(pcts, reverse=True)
        assert "improvements" in rpt
        assert "suggestions" in rpt
        assert "additional_comments" in rpt

    def test_delete_campaign_with_responses_blocked(self, admin_client, test_campaign):
        r = admin_client.delete(f"{API}/campaigns/{test_campaign['id']}")
        assert r.status_code == 400

    def test_meta_questions(self, admin_client):
        r = admin_client.get(f"{API}/meta/questions")
        assert r.status_code == 200
        data = r.json()
        assert "scored_questions" in data
        assert len(data["scored_questions"]) == 7
        keys = {q["key"] for q in data["scored_questions"]}
        assert "q_overall_quality" in keys
        assert "q_recommend" in keys


# ============ AI Recommendations ============

class TestAIRecommendations:
    def test_ai_recommendations_generates_and_persists(self, admin_client, test_campaign):
        cid = test_campaign["id"]
        r = admin_client.post(f"{API}/campaigns/{cid}/ai-recommendations", timeout=120)
        # Could take time — be tolerant of 500 if AI service fails, but expect 200
        assert r.status_code == 200, f"AI gen failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "recommendations" in data and len(data["recommendations"]) > 30
        assert "generated_at" in data
        # Verify persisted on report
        rpt = admin_client.get(f"{API}/campaigns/{cid}/report").json()
        assert rpt.get("ai_recommendations")
