"""Real local HTTP and PostgreSQL tests; explicitly opt in.

Only the disposable taskflow_integration_test database on localhost:55438 is reset.
"""
import os
from pathlib import Path
from threading import Thread

import pytest

if os.getenv("TASKFLOW_INTEGRATION") != "1":
    pytest.skip("Set TASKFLOW_INTEGRATION=1 for the disposable local DB", allow_module_level=True)

import psycopg
import requests
from werkzeug.serving import make_server

from app.extensions import limiter

TEST_DSN = (
    "host=127.0.0.1 port=55438 dbname=taskflow_integration_test "
    "user=taskflow_test password=local_integration_test_only"
)
PASSWORD = "LocalTestPassword123!"


def sql(query, values=()):
    with psycopg.connect(TEST_DSN) as db, db.cursor() as cursor:
        cursor.execute(query, values)
        return cursor.fetchall() if cursor.description else []


@pytest.fixture(scope="module", autouse=True)
def schema():
    assert sql("SELECT current_database()")[0][0] == "taskflow_integration_test"
    sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    sql((Path(__file__).resolve().parents[2] / "sql/01-init.sql").read_text())


@pytest.fixture
def site(app, monkeypatch):
    for key, value in {
        "DATABASE_HOST": "127.0.0.1", "DATABASE_PORT": "55438",
        "DATABASE_NAME": "taskflow_integration_test", "DATABASE_USER": "taskflow_test",
        "DATABASE_PASSWORD": "local_integration_test_only",
        "DELETION_LOG_PATH": "/tmp/taskflow-test-deletions.log",
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(limiter, "enabled", False)
    sql("TRUNCATE users, file_cleanup_jobs RESTART IDENTITY CASCADE")
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    sessions = []
    url = f"http://127.0.0.1:{server.server_port}"

    def request(client, method, path, data=None, status=200):
        headers = {"Origin": "http://localhost:5173"}
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

    owner, owner_id = account("owner")
    member, member_id = account("member")
    outsider, outsider_id = account("outsider")
    workspace = request(owner, "POST", "/api/workspaces", {"name": "Local integration test"}, 201)["id"]
    request(owner, "POST", f"/api/workspaces/{workspace}/members", {
        "email": "member@example.com", "role": "member",
    }, 201)
    yield dict(request=request, owner=owner, owner_id=owner_id,
               member=member, member_id=member_id, outsider=outsider, outsider_id=outsider_id,
               workspace=workspace, url=url, sessions=sessions)
    for client in sessions:
        client.close()
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
