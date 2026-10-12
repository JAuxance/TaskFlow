import pytest
from flask.testing import FlaskClient
from werkzeug.datastructures import Headers

from app.app import app as flask_app


class BrowserClient(FlaskClient):
    """Existing route tests submit valid browser requests, including CSRF."""

    def open(self, *args, **kwargs):
        if kwargs.get("method", "GET").upper() not in {"GET", "HEAD", "OPTIONS"}:
            headers = Headers(kwargs.get("headers"))
            headers.setdefault("Origin", "http://localhost:5173")
            if "X-CSRF-Token" not in headers:
                token = super().open("/api/auth/csrf").get_json()["csrf_token"]
                headers["X-CSRF-Token"] = token
            kwargs["headers"] = headers
        return super().open(*args, **kwargs)


@pytest.fixture
def app():
    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "test-secret-key"

    return flask_app


@pytest.fixture
def client(app):
    return BrowserClient(app, app.response_class, use_cookies=True)
