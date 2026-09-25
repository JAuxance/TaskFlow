import pytest

from app.app import app as flask_app


@pytest.fixture
def app():
    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "test-secret-key"

    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()