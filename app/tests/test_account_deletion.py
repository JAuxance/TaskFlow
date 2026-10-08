from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest

from app.extensions import limiter


@pytest.fixture
def account(client, monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)
    with client.session_transaction() as session:
        session["session_token"] = "account-session"
    now = datetime.now(timezone.utc)
    monkeypatch.setattr("app.permissions.get_session_by_token",
        lambda token: (1, 7, token, now, now + timedelta(hours=1), False))
    delete = Mock(return_value=None)
    cleanup = Mock(return_value={"removed": 0, "failed": 0})
    monkeypatch.setattr("app.routes.auth.delete_user_account", delete)
    monkeypatch.setattr("app.routes.auth.cleanup_deleted_files", cleanup)
    return delete, cleanup


def body(**extra):
    return {"password": "current-password", "confirmed_workspace_ids": [], **extra}


def test_account_deletion_requires_authentication(client, account):
    with client.session_transaction() as session:
        session.clear()
    assert client.delete("/api/users/me", json=body()).status_code == 401
    assert client.get("/api/users/me/deletion-preview").status_code == 401
    account[0].assert_not_called()


@pytest.mark.parametrize("password", [None, "", 123])
def test_account_deletion_requires_password(client, account, password):
    assert client.delete("/api/users/me", json=body(password=password)).status_code == 400
    account[0].assert_not_called()


@pytest.mark.parametrize("payload", [
    {"password": "current-password"}, body(user_id=99),
    body(confirmed_workspace_ids=[True]), body(confirmed_workspace_ids=[1, 1]),
    body(confirmed_workspace_ids=[-1]), body(confirmed_workspace_ids="all"),
])
def test_requires_explicit_workspace_list_and_refuses_extra_identity(client, account, payload):
    assert client.delete("/api/users/me", json=payload).status_code == 400
    account[0].assert_not_called()


@pytest.mark.parametrize("error,status", [
    ("incorrect_password", 403), ("not_found", 404),
    ("shared_workspaces", 409), ("preview_changed", 409),
])
def test_refusal_keeps_session_and_files(client, account, error, status):
    account[0].return_value = error
    assert client.delete("/api/users/me", json=body()).status_code == status
    account[1].assert_not_called()
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"


def test_log_write_failure_keeps_the_session_and_the_account(client, account):
    account[0].return_value = "log_failed"
    response = client.delete("/api/users/me", json=body())
    assert response.status_code == 500
    assert response.get_json()["error"] == "The account was kept because the deletion record could not be saved."
    account[1].assert_not_called()
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"


def test_deletion_targets_session_user_and_clears_session(client, account):
    assert client.delete("/api/users/me", json=body()).status_code == 200
    account[0].assert_called_once_with(7, "current-password", [])
    account[1].assert_called_once()
    with client.session_transaction() as session:
        assert "session_token" not in session


def test_post_commit_cleanup_error_does_not_report_account_as_active(client, account):
    account[1].side_effect = OSError("simulated retry needed")
    assert client.delete("/api/users/me", json=body()).status_code == 200
    with client.session_transaction() as session:
        assert "session_token" not in session


def test_database_failure_preserves_session(client, account):
    account[0].side_effect = RuntimeError("database unavailable")
    with pytest.raises(RuntimeError, match="database unavailable"):
        client.delete("/api/users/me", json=body())
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"


def test_busy_deletion_preserves_session(client, account):
    from psycopg.errors import LockNotAvailable
    account[0].side_effect = LockNotAvailable("row busy")
    response = client.delete("/api/users/me", json=body())
    assert response.status_code == 409
    assert response.json["code"] == "deletion_busy"
    account[1].assert_not_called()
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"
