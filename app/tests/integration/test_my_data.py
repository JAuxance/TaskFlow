"""User data checks using only the disposable local PostgreSQL database."""
import os
from pathlib import Path

import pytest

if os.getenv("TASKFLOW_CHAT_INTEGRATION") != "1":
    pytest.skip("Uses the disposable local taskflow_chat_test database", allow_module_level=True)

from app.tests.integration.test_chat_revocation import schema, site, sql, PASSWORD


def export(site, user="member", status=200):
    return site["request"](site[user], "POST", "/api/users/me/data-export", {"password": PASSWORD}, status)


def test_export_contains_only_the_users_data(site):
    request = site["request"]
    workspace = site["workspace"]
    owner, member, outsider = site["owner_id"], site["member_id"], site["outsider_id"]
    project = request(site["owner"], "POST", f"/api/workspaces/{workspace}/projects", {"name": "Visible project"}, 201)["id"]
    own_task = request(site["member"], "POST", f"/api/projects/{project}/tasks",
        {"title": "My task", "status": "todo", "priority": "medium"}, 201)["id"]
    request(site["owner"], "POST", f"/api/projects/{project}/tasks",
        {"title": "Someone else's task", "status": "todo", "priority": "high"}, 201)
    assigned = request(site["owner"], "POST", f"/api/projects/{project}/tasks",
        {"title": "Assigned to me", "status": "todo", "priority": "medium", "assignee_id": member}, 201)["id"]
    sql("INSERT INTO workspace_messages(workspace_id,user_id,content) VALUES (%s,%s,%s),(%s,%s,%s)",
        (workspace, member, "My workspace message", workspace, owner, "Other workspace message"))
    sql("INSERT INTO direct_messages(sender_id,receiver_id,content) VALUES (%s,%s,%s),(%s,%s,%s),(%s,%s,%s)",
        (member, owner, "My direct message", owner, member, "Incoming message", owner, outsider, "Foreign conversation"))
    result = export(site)
    assert result["profile"]["id"] == member
    assert result["profile"]["email"] == "member@example.com"
    assert result["memberships"][0]["workspace_id"] == workspace
    assert {task["id"] for task in result["tasks"]} == {own_task, assigned}
    assert [message["content"] for message in result["workspace_messages"]] == ["My workspace message"]
    assert [message["content"] for message in result["sent_direct_messages"]] == ["My direct message"]
    text = str(result)
    for forbidden in ("owner@example.com", "outsider@example.com", "password_hash", "session_token", PASSWORD, "Foreign conversation", "Incoming message"):
        assert forbidden not in text
    assert result["format_version"] == 1
    assert result["generated_at"].endswith("+00:00")
    before = sql("SELECT count(*) FROM users"), sql("SELECT count(*) FROM tasks")
    assert export(site)["profile"] == result["profile"]
    assert before == (sql("SELECT count(*) FROM users"), sql("SELECT count(*) FROM tasks"))
    request(site["owner"], "DELETE", f"/api/workspaces/{workspace}/members/{member}")
    removed = export(site)
    assert removed["memberships"] == [] and removed["tasks"] == []
    # Their own retained messages are personal data; another author's history remains excluded.
    assert removed["workspace_messages"][0]["content"] == "My workspace message"


def test_members_do_not_disclose_email_for_any_role(site):
    for client in (site["owner"], site["member"]):
        members = site["request"](client, "GET", f'/api/workspaces/{site["workspace"]}/members')
        assert len(members) == 2
        assert all("user_email" not in row and "email" not in row for row in members)
        assert {row["user_name"] for row in members} == {"owner", "member"}
    site["request"](site["owner"], "PATCH", f'/api/workspaces/{site["workspace"]}/members/{site["member_id"]}', {"role": "guest"})
    members = site["request"](site["member"], "GET", f'/api/workspaces/{site["workspace"]}/members')
    assert all("user_email" not in row for row in members)


def test_optional_name_and_avatar_removal(site, app, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "static_folder", str(tmp_path))
    user = site["member_id"]
    other = site["owner_id"]
    mine = f"/static/avatars/{user}_{'a' * 32}.png"
    theirs = f"/static/avatars/{other}_{'b' * 32}.png"
    for url in (mine, theirs):
        path = tmp_path / url.removeprefix("/static/")
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(b"fixture image")
    sql("UPDATE users SET avatar_url=%s, first_name='Test' WHERE id=%s", (mine, user))
    sql("UPDATE users SET avatar_url=%s WHERE id=%s", (theirs, other))
    response = site["request"](site["member"], "PATCH", "/api/users/me", {"first_name": "   "})
    assert response["first_name"] is None
    response = site["request"](site["member"], "DELETE", "/api/users/me/avatar")
    assert response["avatar_url"] is None
    assert sql("SELECT avatar_url, first_name FROM users WHERE id=%s", (user,)) == [(None, None)]
    assert not (tmp_path / mine.removeprefix("/static/")).exists()
    assert (tmp_path / theirs.removeprefix("/static/")).exists()
    assert site["request"](site["member"], "DELETE", "/api/users/me/avatar")["avatar_url"] is None


def test_file_failure_preserves_avatar_for_retry(site, app, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "static_folder", str(tmp_path))
    user = site["member_id"]
    url = f"/static/avatars/{user}_{'a' * 32}.png"
    path = tmp_path / url.removeprefix("/static/")
    path.parent.mkdir()
    path.write_bytes(b"fixture")
    sql("UPDATE users SET avatar_url=%s WHERE id=%s", (url, user))
    original = Path.unlink
    def cannot_remove(self, *args, **kwargs):
        if self == path:
            raise PermissionError("simulated file failure")
        return original(self, *args, **kwargs)
    monkeypatch.setattr(Path, "unlink", cannot_remove)
    site["request"](site["member"], "DELETE", "/api/users/me/avatar", status=503)
    assert sql("SELECT avatar_url FROM users WHERE id=%s", (user,)) == [(url,)]
    assert path.exists()
    monkeypatch.setattr(Path, "unlink", original)
    site["request"](site["member"], "DELETE", "/api/users/me/avatar")
    assert not path.exists()


@pytest.mark.parametrize("limit,value", [("MAX_EXPORT_ROWS", 1), ("MAX_EXPORT_BYTES", 100)])
def test_export_limits_return_no_partial_data(site, monkeypatch, limit, value):
    monkeypatch.setattr("app.data_export." + limit, value)
    result = export(site, status=409)
    assert result["code"] == "export_too_large"
    assert "profile" not in result


def test_new_actions_require_csrf_even_with_a_password(site):
    for path, method in (("/api/users/me/data-export", "POST"), ("/api/users/me/avatar", "DELETE")):
        response = site["member"].request(method, site["url"] + path,
            headers={"Origin": "http://localhost:5500"}, json={"password": PASSWORD}, timeout=5)
        assert response.status_code == 403
        assert response.json()["code"] == "csrf_failed"
