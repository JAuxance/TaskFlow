from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

from argon2 import PasswordHasher


def test_registration_creates_a_session_and_sets_cookie(client, monkeypatch):
    now = datetime.now(timezone.utc)
    create_user = Mock(return_value=(7, "New user", "new@example.com", now))
    create_session = Mock()
    monkeypatch.setattr("app.routes.auth.create_user", create_user)
    monkeypatch.setattr("app.routes.auth.create_session", create_session)

    response = client.post(
        "/api/users",
        json={
            "username": "New user",
            "email": "new@example.com",
            "password": "example-password",
        },
    )

    assert response.status_code == 201
    assert response.get_json() == {
        "id": 7,
        "username": "New user",
        "email": "new@example.com",
        "created_at": now.isoformat(),
    }
    assert PasswordHasher().verify(create_user.call_args.args[2], "example-password")
    create_session.assert_called_once()
    user_id, token, expires_at = create_session.call_args.args
    assert user_id == 7
    assert token
    assert now + timedelta(hours=24) <= expires_at
    assert expires_at <= datetime.now(timezone.utc) + timedelta(hours=24)
    with client.session_transaction() as session:
        assert session["session_token"] == token
