import os

import pytest

if os.getenv("TASKFLOW_INTEGRATION") != "1":
    pytest.skip("Uses the disposable local taskflow_integration_test database", allow_module_level=True)

from app.tests.integration.support import schema, site, sql

ORIGIN = "http://localhost:5173"


def get_token(site, user):
    response = site[user].get(site["url"] + "/api/auth/csrf", headers={"Origin": ORIGIN}, timeout=5)
    assert response.status_code == 200
    return response.json()["csrf_token"]


def test_bad_origin_or_token_does_not_change_database(site):
    request = site["request"]
    project = request(site["owner"], "POST", f'/api/workspaces/{site["workspace"]}/projects',
        {"name": "security test"}, 201)["id"]
    task = request(site["owner"], "POST", f"/api/projects/{project}/tasks",
        {"title": "keep me", "status": "todo", "priority": "medium"}, 201)["id"]
    value = get_token(site, "owner")
    for headers in [{"Origin": ORIGIN}, {"Origin": ORIGIN, "X-CSRF-Token": "wrong"},
                    {"Origin": "https://evil.example", "X-CSRF-Token": value}]:
        for method in ("PATCH", "DELETE"):
            response = site["owner"].request(method, site["url"] + f"/api/tasks/{task}",
                headers=headers, json={"title": "changed by attacker"}, timeout=5)
            assert response.status_code == 403
            assert sql("SELECT title FROM tasks WHERE id = %s", (task,)) == [("keep me",)]
    request(site["owner"], "PATCH", f"/api/tasks/{task}", {"title": "legitimate change"})
    assert sql("SELECT title FROM tasks WHERE id = %s", (task,)) == [("legitimate change",)]


def test_other_session_token_is_rejected_and_logout_clears_access(site):
    wrong = get_token(site, "member")
    response = site["owner"].post(site["url"] + "/api/auth/logout",
        headers={"Origin": ORIGIN, "X-CSRF-Token": wrong}, timeout=5)
    assert response.status_code == 403
    site["request"](site["owner"], "GET", "/api/auth/me")
    site["request"](site["owner"], "POST", "/api/auth/logout")
    site["request"](site["owner"], "GET", "/api/auth/me", status=401)


def test_registration_and_login_are_protected_before_writes(site):
    before_users = sql("SELECT count(*) FROM users")
    before_sessions = sql("SELECT count(*) FROM sessions")
    for path in ("/api/users", "/api/auth/login"):
        response = site["outsider"].post(site["url"] + path, headers={"Origin": ORIGIN},
            json={"username": "new", "email": "new@example.com", "password": "Password123!"}, timeout=5)
        assert response.status_code == 403
    assert sql("SELECT count(*) FROM users") == before_users
    assert sql("SELECT count(*) FROM sessions") == before_sessions


def test_preflight_and_no_store_headers(site):
    for origin in (ORIGIN, "http://127.0.0.1:5173"):
        response = site["owner"].options(site["url"] + "/api/users/me", headers={
            "Origin": origin, "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "Content-Type,X-CSRF-Token",
        }, timeout=5)
        assert response.status_code == 200
        assert response.headers["Access-Control-Allow-Origin"] == origin
        assert "x-csrf-token" in response.headers["Access-Control-Allow-Headers"].lower()
    denied = site["owner"].options(site["url"] + "/api/users/me", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "PATCH",
    }, timeout=5)
    assert "Access-Control-Allow-Origin" not in denied.headers
    me = site["owner"].get(site["url"] + "/api/auth/me", timeout=5)
    assert me.headers["Cache-Control"] == "no-store, private"
