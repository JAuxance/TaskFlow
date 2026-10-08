"""Real local HTTP/WebSocket and PostgreSQL tests; explicitly opt in.

Only the disposable taskflow_chat_test database on localhost:55438 is reset.
"""
import os
from pathlib import Path
from queue import Empty, Queue
from threading import Thread

import pytest

if os.getenv("TASKFLOW_CHAT_INTEGRATION") != "1":
    pytest.skip("Set TASKFLOW_CHAT_INTEGRATION=1 for the disposable local DB", allow_module_level=True)

import psycopg
import requests
import socketio as socketio_client
from werkzeug.serving import make_server

from app.extensions import limiter

TEST_DSN = (
    "host=127.0.0.1 port=55438 dbname=taskflow_chat_test "
    "user=taskflow_test password=local_chat_test_only"
)
PASSWORD = "LocalTestPassword123!"


def sql(query, values=()):
    with psycopg.connect(TEST_DSN) as db, db.cursor() as cursor:
        cursor.execute(query, values)
        return cursor.fetchall() if cursor.description else []


@pytest.fixture(scope="module", autouse=True)
def schema():
    assert sql("SELECT current_database()")[0][0] == "taskflow_chat_test"
    sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    sql((Path(__file__).resolve().parents[2] / "sql/01-init.sql").read_text())


@pytest.fixture
def site(app, monkeypatch):
    for key, value in {
        "DATABASE_HOST": "127.0.0.1", "DATABASE_PORT": "55438",
        "DATABASE_NAME": "taskflow_chat_test", "DATABASE_USER": "taskflow_test",
        "DATABASE_PASSWORD": "local_chat_test_only",
        "DELETION_LOG_PATH": "/tmp/taskflow-test-deletions.log",
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(limiter, "enabled", False)
    sql("TRUNCATE users, file_cleanup_jobs RESTART IDENTITY CASCADE")
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    connections = []
    sessions = []
    url = f"http://127.0.0.1:{server.server_port}"

    def request(client, method, path, data=None, status=200):
        headers = {"Origin": "http://localhost:5500"}
        if method not in {"GET", "HEAD", "OPTIONS"}:
            token = client.get(url + "/api/auth/csrf", headers=headers, timeout=5)
            assert token.status_code == 200
            headers["X-CSRF-Token"] = token.json()["csrf_token"]
        if method == "DELETE" and path == "/api/users/me" and data is not None:
            preview = client.get(url + "/api/users/me/deletion-preview", timeout=5)
            assert preview.status_code == 200
            data = {**data, "confirmed_workspace_ids": [w["id"] for w in preview.json()["workspaces_to_delete"]]}
        response = client.request(method, url + path, json=data, headers=headers, timeout=5)
        assert response.status_code == status, response.text
        return response.json()

    def account(name):
        client = requests.Session()
        sessions.append(client)
        user = request(client, "POST", "/api/users", {
            "username": name, "email": name + "@example.com", "password": PASSWORD,
        }, 201)
        return client, user["id"]

    def connect(client, event, payload):
        received = Queue()
        connection = socketio_client.Client(
            reconnection=False, http_session=client,
            websocket_extra_options={"origin": "http://localhost:5500"},
        )
        for name in ("new_message", "new_direct_message", "socket_error", "workspace_joined", "direct_message_joined"):
            connection.on(name, lambda data, name=name: received.put((name, data)))
        connection.connect(url, transports=["websocket"], wait_timeout=3)
        connections.append(connection)
        connection.call(event, payload, timeout=3)
        return connection, received

    owner, owner_id = account("owner")
    member, member_id = account("member")
    outsider, outsider_id = account("outsider")
    workspace = request(owner, "POST", "/api/workspaces", {"name": "Local chat test"}, 201)["id"]
    request(owner, "POST", f"/api/workspaces/{workspace}/members", {
        "email": "member@example.com", "role": "member",
    }, 201)
    yield dict(request=request, connect=connect, owner=owner, owner_id=owner_id,
               member=member, member_id=member_id, outsider=outsider, outsider_id=outsider_id,
               workspace=workspace, url=url, sessions=sessions)
    for connection in connections:
        if connection.connected:
            connection.disconnect()
    for client in sessions:
        client.close()
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def events(connection):
    client, received = connection
    # The acknowledgement arrives after earlier packets on this connection.
    # An invalid join changes no subscriptions and requires no test-only endpoint.
    client.call("join_workspace", {"workspace_id": 0}, timeout=3)
    result = []
    while True:
        try:
            result.append(received.get_nowait())
        except Empty:
            return result


def workspace_socket(site, user="member", workspace=None):
    connection = site["connect"](site[user], "join_workspace", {
        "workspace_id": workspace or site["workspace"],
    })
    assert any(name == "workspace_joined" for name, _ in events(connection))
    return connection


def send(site, text="hello", workspace=None):
    return site["request"](site["owner"], "POST",
        f'/api/workspaces/{workspace or site["workspace"]}/messages', {"message": text}, 201)


def messages(connection, event="new_message"):
    return [data for name, data in events(connection) if name == event]


def test_removed_member_stops_receiving_in_two_tabs(site):
    tabs = [workspace_socket(site), workspace_socket(site)]
    observer = workspace_socket(site, "owner")
    send(site, "before removal")
    for tab in tabs:
        assert len(messages(tab)) == 1
    messages(observer)
    site["request"](site["owner"], "DELETE",
        f'/api/workspaces/{site["workspace"]}/members/{site["member_id"]}')
    for tab in tabs:
        assert any(name == "socket_error" and data["message"] == "chat access denied"
                   for name, data in events(tab))
    send(site, "after removal")
    for tab in tabs:
        assert messages(tab) == []
    assert [m["message"] for m in messages(observer)] == ["after removal"]
    site["request"](site["member"], "GET",
        f'/api/workspaces/{site["workspace"]}/messages', status=404)
    retry = site["connect"](site["member"], "join_workspace", {"workspace_id": site["workspace"]})
    assert not any(name == "workspace_joined" for name, _ in events(retry))


@pytest.mark.parametrize("change", ["logout", "expired", "revoked", "deleted_session", "deleted_account"])
def test_invalid_session_stops_workspace_delivery(site, change):
    tabs = [workspace_socket(site), workspace_socket(site)]
    send(site)
    for tab in tabs:
        assert len(messages(tab)) == 1
    if change == "logout":
        site["request"](site["member"], "POST", "/api/auth/logout")
    elif change == "expired":
        sql("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = %s", (site["member_id"],))
    elif change == "revoked":
        sql("UPDATE sessions SET revoked = TRUE WHERE user_id = %s", (site["member_id"],))
    elif change == "deleted_session":
        sql("DELETE FROM sessions WHERE user_id = %s", (site["member_id"],))
    else:
        site["request"](site["member"], "DELETE", "/api/users/me", {"password": PASSWORD})
    send(site, "private after invalidation")
    for tab in tabs:
        assert messages(tab) == []


def test_membership_is_rechecked_even_when_changed_directly_in_database(site):
    tab = workspace_socket(site)
    sql("DELETE FROM workspace_members WHERE workspace_id = %s AND user_id = %s",
        (site["workspace"], site["member_id"]))
    send(site)
    assert messages(tab) == []


def test_unrelated_workspace_stays_accessible(site):
    other = site["request"](site["owner"], "POST", "/api/workspaces", {"name": "Other workspace"}, 201)["id"]
    site["request"](site["owner"], "POST", f"/api/workspaces/{other}/members",
        {"email": "member@example.com", "role": "guest"}, 201)
    tab = workspace_socket(site)
    tab[0].call("join_workspace", {"workspace_id": other}, timeout=3)
    events(tab)
    site["request"](site["owner"], "DELETE",
        f'/api/workspaces/{site["workspace"]}/members/{site["member_id"]}')
    send(site, "blocked")
    send(site, "allowed", workspace=other)
    assert [m["message"] for m in messages(tab)] == ["allowed"]


def test_logout_only_revokes_the_corresponding_session(site):
    old_tab = workspace_socket(site)
    second = requests.Session()
    site["sessions"].append(second)
    site["request"](second, "POST", "/api/auth/login", {"email": "member@example.com", "password": PASSWORD})
    new_tab = site["connect"](second, "join_workspace", {"workspace_id": site["workspace"]})
    events(new_tab)
    site["request"](site["member"], "POST", "/api/auth/logout")
    send(site, "only valid session")
    assert messages(old_tab) == []
    assert [m["message"] for m in messages(new_tab)] == ["only valid session"]


@pytest.mark.parametrize("change", ["remove", "workspace_deleted", "logout", "expired", "deleted_account"])
def test_direct_messages_recheck_access(site, change):
    tab = site["connect"](site["member"], "join_direct_message", {"user_id": site["owner_id"]})
    assert any(name == "direct_message_joined" for name, _ in events(tab))
    message = site["request"](site["owner"], "POST",
        f'/api/users/{site["member_id"]}/direct_messages', {"message": "before"}, 201)
    assert len(messages(tab, "new_direct_message")) == 1
    if change == "remove":
        site["request"](site["owner"], "DELETE",
            f'/api/workspaces/{site["workspace"]}/members/{site["member_id"]}')
    elif change == "workspace_deleted":
        site["request"](site["owner"], "DELETE", f'/api/workspaces/{site["workspace"]}')
    elif change == "logout":
        site["request"](site["member"], "POST", "/api/auth/logout")
    elif change == "expired":
        sql("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = %s", (site["member_id"],))
    else:
        site["request"](site["member"], "DELETE", "/api/users/me", {"password": PASSWORD})
    # Simulate a publication already prepared before the access change.
    from app.extensions import socketio
    from app.sockets.direct_messages import publish_direct_message
    publish_direct_message(socketio, {**message, "message": "after"})
    assert messages(tab, "new_direct_message") == []


def test_direct_messages_remain_available_with_another_shared_workspace(site):
    other = site["request"](site["owner"], "POST", "/api/workspaces", {"name": "Shared"}, 201)["id"]
    site["request"](site["owner"], "POST", f"/api/workspaces/{other}/members",
        {"email": "member@example.com", "role": "member"}, 201)
    tab = site["connect"](site["member"], "join_direct_message", {"user_id": site["owner_id"]})
    events(tab)
    site["request"](site["owner"], "DELETE", f'/api/workspaces/{site["workspace"]}')
    site["request"](site["owner"], "POST", f'/api/users/{site["member_id"]}/direct_messages',
        {"message": "still allowed"}, 201)
    assert [m["message"] for m in messages(tab, "new_direct_message")] == ["still allowed"]


def test_direct_delivery_checks_membership_even_without_a_refresh_hook(site):
    tab = site["connect"](site["member"], "join_direct_message", {"user_id": site["owner_id"]})
    events(tab)
    message = site["request"](site["owner"], "POST", f'/api/users/{site["member_id"]}/direct_messages',
        {"message": "before"}, 201)
    assert len(messages(tab, "new_direct_message")) == 1
    sql("DELETE FROM workspace_members WHERE workspace_id = %s AND user_id = %s",
        (site["workspace"], site["member_id"]))
    from app.extensions import socketio
    from app.sockets.direct_messages import publish_direct_message
    publish_direct_message(socketio, {**message, "message": "after"})
    assert messages(tab, "new_direct_message") == []
