from unittest.mock import Mock

import pytest
from argon2 import PasswordHasher

from app.extensions import limiter


@pytest.fixture
def own_account(monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr("app.routes.auth.get_authenticated_user", lambda: (7, None))
    monkeypatch.setattr("app.routes.auth.get_user_password_hash",
                        lambda user_id: PasswordHasher().hash("my-password"))
    export = Mock(return_value=({"profile": {"id": 7}}, None))
    monkeypatch.setattr("app.routes.auth.collect_user_data", export)
    return export


def test_export_without_authentication_is_refused(client):
    assert client.post("/api/users/me/data-export", json={"password": "test"}).status_code == 401


def test_wrong_password_does_not_read_data(client, own_account):
    response = client.post("/api/users/me/data-export", json={"password": "wrong"})
    assert response.status_code == 403
    own_account.assert_not_called()


def test_export_cannot_select_another_account(client, own_account):
    response = client.post("/api/users/me/data-export", json={"password": "my-password", "user_id": 99})
    assert response.status_code == 400
    own_account.assert_not_called()


def test_export_is_a_private_attachment_for_the_session_user(client, own_account):
    response = client.post("/api/users/me/data-export", json={"password": "my-password"})
    assert response.status_code == 200
    own_account.assert_called_once_with(7)
    assert response.json["profile"]["id"] == 7
    assert response.headers["Content-Disposition"] == 'attachment; filename="taskflow-my-data.json"'
    assert response.headers["Cache-Control"] == "no-store, private"


def test_large_export_is_not_silently_truncated(client, own_account):
    own_account.return_value = None, "too_large"
    response = client.post("/api/users/me/data-export", json={"password": "my-password"})
    assert response.status_code == 409
    assert response.json["code"] == "export_too_large"
    assert "Content-Disposition" not in response.headers


@pytest.mark.parametrize("value", ["", "   ", "  Auxance  "])
def test_optional_name_can_be_cleared_or_trimmed(client, own_account, monkeypatch, value):
    update = Mock(return_value=(7, "user", "user@example.com", value.strip() or None, None))
    monkeypatch.setattr("app.routes.auth.update_user_first_name", update)
    response = client.patch("/api/users/me", json={"first_name": value})
    assert response.status_code == 200
    update.assert_called_once_with(7, value.strip() or None)


def test_public_contact_exposes_only_its_configured_address(client, app, monkeypatch):
    monkeypatch.setitem(app.config, "PRIVACY_CONTACT_EMAIL", "privacy@example.com")
    assert client.get("/api/privacy").json == {"contact_email": "privacy@example.com"}
    monkeypatch.setitem(app.config, "PRIVACY_CONTACT_EMAIL", "")
    assert client.get("/api/privacy").json == {"contact_email": None}
