"""SEC-03, SEC-06 and SEC-11 checks without changing the running service."""

import importlib
import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch


class SecurityConfigurationTests(unittest.TestCase):
    def test_debugger_is_disabled_and_errors_are_generic(self):
        module = importlib.import_module("app.app")
        self.assertFalse(module.app.debug)

        def failing_health():
            raise RuntimeError("SEC03-private-error-marker")

        with patch.dict(module.app.config, TESTING=False, PROPAGATE_EXCEPTIONS=False), \
                patch.dict(module.app.view_functions, health=failing_health), \
                patch.object(module.app.logger, "disabled", True):
            response = module.app.test_client().get("/health")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(b"SEC03-private-error-marker", response.data)
        self.assertNotIn(b"Traceback", response.data)
        self.assertNotIn(b"Werkzeug Debugger", response.data)

    def test_health_does_not_disclose_database_errors(self):
        module = importlib.import_module("app.app")
        with patch.object(module, "get_db_connection", side_effect=RuntimeError("SEC11-private-error-marker")), \
                patch("builtins.print"):
            response = module.app.test_client().get("/health")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json(), {"api": "ok", "database": "error"})
        self.assertNotIn(b"SEC11-private-error-marker", response.data)

    def test_session_cookie_flags_by_environment(self):
        code = """
import json
from http.cookies import SimpleCookie
from flask import request
from app.app import app
with app.test_request_context():
    session = app.session_interface.open_session(app, request)
    session['probe'] = 'test'
    response = app.response_class()
    app.session_interface.save_session(app, session, response)
    cookie = SimpleCookie()
    cookie.load(response.headers['Set-Cookie'])
    flags = cookie['session']
    print(json.dumps({'secure': bool(flags['secure']), 'httponly': bool(flags['httponly']), 'samesite': flags['samesite']}))
"""
        for app_env in (None, "development", "production"):
            with self.subTest(app_env=app_env):
                environment = dict(os.environ, SECRET_KEY="SEC06-test-key")
                environment.pop("APP_ENV", None)
                if app_env is not None:
                    environment["APP_ENV"] = app_env
                result = subprocess.run(
                    [sys.executable, "-c", code], env=environment,
                    capture_output=True, text=True, check=True,
                )
                self.assertEqual(json.loads(result.stdout), {
                    "secure": app_env == "production", "httponly": True, "samesite": "Lax",
                })


if __name__ == "__main__":
    unittest.main()
