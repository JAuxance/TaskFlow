from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest
from argon2 import PasswordHasher

from app.extensions import limiter


@pytest.fixture(scope="module")
def password_hash():
    return PasswordHasher().hash("current-password")


@pytest.fixture
def account(client, monkeypatch, password_hash, tmp_path, app):
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr(app, "static_folder", str(tmp_path))
    with client.session_transaction() as session:
        session["session_token"] = "account-session"
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(
        "app.permissions.get_session_by_token",
        lambda token: (1, 7, token, now, now + timedelta(hours=1), False),
    )
    lookup = Mock(return_value=password_hash)
    delete = Mock(return_value=[])
    monkeypatch.setattr("app.routes.auth.get_user_password_hash", lookup)
    monkeypatch.setattr("app.routes.auth.delete_user_account", delete)
    return lookup, delete


def test_account_deletion_requires_authentication(client, account):
    with client.session_transaction() as session:
        session.clear()
    response = client.delete("/api/users/me", json={"password": "current-password"})
    assert response.status_code == 401
    account[0].assert_not_called()
    account[1].assert_not_called()


@pytest.mark.parametrize("password", [None, "", 123])
def test_account_deletion_requires_password(client, account, password):
    response = client.delete("/api/users/me", json={"password": password})
    assert response.status_code == 400
    account[1].assert_not_called()


def test_wrong_password_preserves_account_and_session(client, account):
    response = client.delete("/api/users/me", json={"password": "wrong-password"})
    assert response.status_code == 403
    assert response.get_json() == {"error": "incorrect password"}
    account[1].assert_not_called()
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"


def test_deletion_targets_session_user_and_removes_uploads(client, account, tmp_path):
    avatar = f"/static/avatars/7_{'a' * 32}.png"
    icon = f"/static/workspace_icons/10_{'b' * 32}.webp"
    default = "/static/avatars/default.png"
    for image in (avatar, icon, default):
        path = tmp_path / image.removeprefix("/static/")
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(b"image")
    protected = tmp_path / "protected.txt"
    protected.write_text("keep")
    account[1].return_value = [
        avatar,
        icon,
        default,
        None,
        "/static/avatars/../protected.txt",
    ]

    response = client.delete(
        "/api/users/me", json={"password": "current-password", "user_id": 99}
    )

    assert response.status_code == 200
    account[0].assert_called_once_with(7)
    account[1].assert_called_once_with(7)
    with client.session_transaction() as session:
        assert "session_token" not in session
    assert not (tmp_path / avatar.removeprefix("/static/")).exists()
    assert not (tmp_path / icon.removeprefix("/static/")).exists()
    assert (tmp_path / default.removeprefix("/static/")).exists()
    assert protected.read_text() == "keep"


def test_missing_account_is_not_reported_as_deleted(client, account):
    account[1].return_value = None
    response = client.delete("/api/users/me", json={"password": "current-password"})
    assert response.status_code == 404
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"


def test_database_failure_preserves_session(client, account):
    account[1].side_effect = RuntimeError("database unavailable")
    with pytest.raises(RuntimeError, match="database unavailable"):
        client.delete("/api/users/me", json={"password": "current-password"})
    with client.session_transaction() as session:
        assert session["session_token"] == "account-session"
