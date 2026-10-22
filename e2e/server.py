"""WSGI entry point for the disposable end-to-end stack (compose.e2e.yaml) only."""
from app.app import app  # noqa: F401
from app.extensions import limiter

# Browser tests register several accounts from one address within a minute.
# The integration tests disable the limiter the same way; routes are untouched.
limiter.enabled = False
