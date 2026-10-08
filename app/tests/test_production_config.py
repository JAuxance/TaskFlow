import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]


def production_env(origin, trust_proxy="0"):
    return {**os.environ, "APP_ENV": "production", "PUBLIC_ORIGIN": origin,
            "TRUST_PROXY_HEADERS": trust_proxy, "SECRET_KEY": "local-config-test",
            "RATELIMIT_STORAGE_URI": "memory://"}


@pytest.mark.parametrize("origin", ["", "http://taskflow.example.com", "https://taskflow.example.com/path"])
def test_production_refuses_missing_or_invalid_origin(origin):
    result = subprocess.run([sys.executable, "-c", "from app.app import app"],
        cwd=ROOT, env=production_env(origin), capture_output=True, text=True)
    assert result.returncode != 0
    assert "PUBLIC_ORIGIN must be an HTTPS origin" in result.stderr


@pytest.mark.parametrize("trust_proxy", ["0", "1"])
def test_production_cookie_origin_and_proxy(trust_proxy):
    # Import in isolation: the ordinary route tests run in development mode.
    code = '''
import os
from app.app import app
from app.extensions import socketio
from flask import request
origin = "https://taskflow.example.com"
assert app.config["ALLOWED_ORIGINS"] == [origin]
assert socketio.server.eio.cors_allowed_origins == [origin]
@app.get("/api/test-ip")
def test_ip():
    return {"ip": request.remote_addr}
client = app.test_client()
response = client.get("/api/test-ip", headers={"X-Forwarded-For": "192.0.2.1"})
assert response.json["ip"] == ("192.0.2.1" if os.environ["TRUST_PROXY_HEADERS"] == "1" else "127.0.0.1")
response = client.get("/api/auth/csrf", base_url=origin, headers={"Origin": origin})
assert response.status_code == 200
cookie = response.headers["Set-Cookie"]
assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=Lax" in cookie
response = client.post("/api/auth/login", base_url=origin, headers={
    "Origin": "http://localhost:5500", "X-CSRF-Token": response.json["csrf_token"]})
assert response.status_code == 403
assert "Access-Control-Allow-Origin" not in response.headers
'''
    result = subprocess.run([sys.executable, "-c", code], cwd=ROOT,
        env=production_env("https://taskflow.example.com", trust_proxy), capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
