from argon2 import PasswordHasher
from unittest.mock import Mock

def test_login_rejects_empty_credentials(client):
    response = client.post(
        "/api/auth/login",
        json={
            "email": "    ",
            "password": "password123"
        }
    )
    assert response.status_code == 400
    assert response.get_json() == {"error": "email and password cannot be empty"} 

def test_login_rejects_unknow_user(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.auth.get_user_by_email",
        lambda email: None
    )

    response = client.post(
        "/api/auth/login",
        json={
            "email": "unknown@example.com",
            "password": "password123"
        }
    )

    assert response.status_code == 401
    assert response.get_json() == {"error": "invalid email or password"}

def test_login_rejects_wrong_password(client, monkeypatch):
    password_hasher = PasswordHasher()

    fake_user = (
        1,
        "Auxance",
        "auxance@exemple.com",
        password_hasher.hash("correct_password")
    )
    monkeypatch.setattr(
        "app.routes.auth.get_user_by_email",
        lambda email: fake_user
    )

    response = client.post(
        "/api/auth/login",
        json={
            "email": "auxance@exemple.com",
            "password": "wrong_password"
        }
    )

    assert response.status_code == 401
    assert response.get_json() == {"error": "invalid email or password"}

def test_login_succeeds_with_valid_credentials(client, monkeypatch):
    password_hasher = PasswordHasher()

    fake_user = (
        1,
        "Auxance",
        "auxance@example.com",
        password_hasher.hash("correct_password")
    )

    monkeypatch.setattr(
        "app.routes.auth.get_user_by_email",
        lambda email: fake_user
    )
    create_session_mock = Mock()
    monkeypatch.setattr(
        "app.routes.auth.create_session",
        create_session_mock
    )

    response = client.post(
        "/api/auth/login",
        json={
            "email": "auxance@example.com",
            "password": "correct_password"
        }
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "id": 1,
        "username": "Auxance",
        "email": "auxance@example.com"
    }
    assert create_session_mock.call_count == 1
