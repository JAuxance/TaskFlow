import secrets
from urllib.parse import urlsplit

from flask import request, session
from werkzeug.middleware.proxy_fix import ProxyFix

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def request_origin():
    origin = request.headers.get("Origin")
    if origin is not None:
        return origin
    referer = request.headers.get("Referer", "")
    try:
        parts = urlsplit(referer)
        return f"{parts.scheme}://{parts.netloc}" if parts.netloc else None
    except ValueError:
        return None


def configure_security(app, allowed_origins, trust_proxy=False):
    app.config["ALLOWED_ORIGINS"] = allowed_origins
    if trust_proxy:
        # Enable only behind the private backend port and the configured Nginx.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    @app.get("/api/auth/csrf")
    def csrf_token():
        origin = request_origin()
        if origin is not None and origin not in app.config["ALLOWED_ORIGINS"]:
            return {"error": "request origin is not allowed"}, 403
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_urlsafe(32)
        return {"csrf_token": session["csrf_token"]}

    @app.before_request
    def protect_mutations():
        if not request.path.startswith("/api/") or request.method in SAFE_METHODS:
            return None
        if request_origin() not in app.config["ALLOWED_ORIGINS"]:
            return {"error": "request origin is not allowed"}, 403
        expected = session.get("csrf_token")
        received = request.headers.get("X-CSRF-Token", "")
        if (
            not expected
            or not received
            or not secrets.compare_digest(expected.encode(), received.encode())
        ):
            return {
                "error": "Your security token has expired. Please try again.",
                "code": "csrf_failed",
            }, 403
        return None

    @app.after_request
    def protect_responses(response):
        if request.path.startswith(("/api/", "/static/avatars/", "/static/workspace_icons/")):
            response.headers["Cache-Control"] = "no-store, private"
            response.headers["Pragma"] = "no-cache"
            response.headers.pop("ETag", None)
            response.vary.add("Cookie")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
