from io import BytesIO

import pytest
from flask import Flask, request
from flask.testing import FlaskClient
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.security import configure_security

ORIGIN = "https://taskflow.example.com"


@pytest.fixture
def protected_app():
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY="local-security-test")
    configure_security(app, [ORIGIN])
    app.changes = []

    @app.route("/api/change", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
    def change():
        if request.method != "GET":
            app.changes.append(request.method)
        return {"ok": True}

    @app.post("/api/upload")
    def upload():
        app.changes.append(request.files["avatar"].read())
        return {"ok": True}

    return app


def token(client):
    response = client.get("/api/auth/csrf", headers={"Origin": ORIGIN})
    assert response.status_code == 200
    return response.json["csrf_token"]


@pytest.mark.parametrize("method", ["POST", "PATCH", "PUT", "DELETE"])
def test_mutation_requires_origin_and_matching_token(protected_app, method):
    client = protected_app.test_client()
    value = token(client)
    for headers in [{}, {"Origin": ORIGIN}, {"X-CSRF-Token": value},
                    {"Origin": ORIGIN, "X-CSRF-Token": "incorrect"}]:
        response = client.open("/api/change", method=method, headers=headers, json={"name": "changed"})
        assert response.status_code == 403
        assert protected_app.changes == []
    response = client.open("/api/change", method=method,
        headers={"Origin": ORIGIN, "X-CSRF-Token": value}, json={"name": "changed"})
    assert response.status_code == 200
    assert protected_app.changes == [method]


@pytest.mark.parametrize("origin", ["null", "https://evil.example", ORIGIN + ".evil.example",
                                    ORIGIN + "/extra", "http://taskflow.example.com"])
def test_foreign_origins_are_rejected_even_with_valid_token(protected_app, origin):
    client = protected_app.test_client()
    value = token(client)
    response = client.post("/api/change", headers={"Origin": origin, "X-CSRF-Token": value})
    assert response.status_code == 403
    assert protected_app.changes == []
    assert client.get("/api/auth/csrf", headers={"Origin": origin}).status_code == 403


def test_referer_fallback_checks_exact_origin(protected_app):
    client = protected_app.test_client()
    value = token(client)
    headers = {"Referer": ORIGIN + "/projects/1", "X-CSRF-Token": value}
    assert client.post("/api/change", headers=headers).status_code == 200
    headers["Referer"] = ORIGIN + ".evil.example/projects"
    assert client.post("/api/change", headers=headers).status_code == 403
    headers.update(Origin="null", Referer=ORIGIN + "/")
    assert client.post("/api/change", headers=headers).status_code == 403
    assert protected_app.changes == ["POST"]


def test_token_is_private_to_its_session_and_not_changed_by_reads(protected_app):
    first, second = protected_app.test_client(), protected_app.test_client()
    first_token, second_token = token(first), token(second)
    assert first_token == token(first)
    assert first_token != second_token
    assert second.post("/api/change", headers={"Origin": ORIGIN, "X-CSRF-Token": first_token}).status_code == 403
    assert protected_app.changes == []


def test_multipart_upload_keeps_browser_boundary(protected_app):
    client = protected_app.test_client()
    value = token(client)
    assert client.post("/api/upload", headers={"Origin": ORIGIN},
        data={"avatar": (BytesIO(b"not uploaded"), "avatar.png")}).status_code == 403
    response = client.post("/api/upload", headers={"Origin": ORIGIN, "X-CSRF-Token": value},
        data={"avatar": (BytesIO(b"local bytes"), "avatar.png")})
    assert response.status_code == 200
    assert protected_app.changes == [b"local bytes"]


@pytest.mark.parametrize("method,path,status", [("GET", "/api/change", 200),
    ("GET", "/api/auth/csrf", 200), ("POST", "/api/change", 403),
    ("GET", "/static/avatars/missing.png", 404)])
def test_private_responses_and_errors_are_not_cacheable(protected_app, method, path, status):
    response = protected_app.test_client().open(path, method=method)
    assert response.status_code == status
    assert response.headers["Cache-Control"] == "no-store, private"
    assert "Cookie" in response.vary
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


@pytest.mark.parametrize("path,method", [("/api/users", "POST"), ("/api/auth/login", "POST"),
    ("/api/auth/logout", "POST"), ("/api/users/me", "DELETE"), ("/api/users/me", "PATCH"),
    ("/api/users/me/avatar", "POST"), ("/api/workspaces/1/icon", "POST")])
def test_real_routes_reject_missing_csrf_before_processing(app, path, method):
    # This is deliberately a raw client, without the valid-browser test helper.
    client = FlaskClient(app, app.response_class, use_cookies=True)
    response = client.open(path, method=method, headers={"Origin": "http://localhost:5500"})
    assert response.status_code == 403
    assert response.json["code"] == "csrf_failed"


def test_login_replaces_anonymous_token(client, monkeypatch):
    from argon2 import PasswordHasher
    before = client.get("/api/auth/csrf").json["csrf_token"]
    monkeypatch.setattr("app.routes.auth.get_user_by_email",
        lambda email: (1, "test", email, PasswordHasher().hash("password123")))
    monkeypatch.setattr("app.routes.auth.create_session", lambda *args: None)
    response = client.post("/api/auth/login", json={"email": "test@example.com", "password": "password123"})
    assert response.status_code == 200
    after = client.get("/api/auth/csrf").json["csrf_token"]
    assert before != after
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": before}).status_code == 403


@pytest.mark.parametrize("trust_proxy", [False, True])
def test_proxy_configuration_and_rate_limit(trust_proxy):
    app = Flask(__name__)
    configure_security(app, [ORIGIN], trust_proxy=trust_proxy)
    limiter = Limiter(get_remote_address, app=app, storage_uri="memory://")

    @app.get("/api/ip")
    @limiter.limit("1 per minute")
    def ip():
        return {"ip": request.remote_addr, "scheme": request.scheme, "host": request.host}

    client = app.test_client()
    first = client.get("/api/ip", headers={"X-Forwarded-For": "198.51.100.9, 192.0.2.1",
        "X-Forwarded-Proto": "https", "X-Forwarded-Host": "evil.example"})
    assert first.status_code == 200
    assert first.json["ip"] == ("192.0.2.1" if trust_proxy else "127.0.0.1")
    assert first.json["scheme"] == ("https" if trust_proxy else "http")
    assert first.json["host"] == "localhost"
    second = client.get("/api/ip", headers={"X-Forwarded-For": "192.0.2.2"})
    assert second.status_code == (200 if trust_proxy else 429)
    assert client.get("/api/ip", headers={"X-Forwarded-For": "192.0.2.1"}).status_code == 429


def test_development_accepts_both_local_frontends_only(client):
    from app.extensions import socketio

    local = ["http://localhost:5500", "http://127.0.0.1:5500",
             "http://localhost:5173", "http://127.0.0.1:5173"]
    for origin in local:
        assert client.get("/api/auth/csrf", headers={"Origin": origin}).status_code == 200
    assert socketio.server.eio.cors_allowed_origins == local
    for origin in ("http://localhost:3000", "http://localhost:51730", "https://localhost:5173"):
        assert client.get("/api/auth/csrf", headers={"Origin": origin}).status_code == 403
