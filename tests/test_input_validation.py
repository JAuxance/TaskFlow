"""SEC-09 HTTP regressions with the existing mocked database fixture."""

import unittest
from unittest.mock import patch

from psycopg import DataError
from psycopg.errors import (
    DatetimeFieldOverflow,
    InvalidDatetimeFormat,
    InvalidTimeZoneDisplacementValue,
)

import test_resource_permissions as resource


WORKSPACE_ROUTES = (
    resource.Route("POST", "/api/workspaces", {"name": "Workspace"}),
    resource.Route("PATCH", "/api/workspaces/1", {"name": "Workspace"}),
)
PROJECT_ROUTES = (
    resource.Route("POST", "/api/workspaces/1/projects", {"name": "Project"}),
    resource.Route("PATCH", "/api/projects/2", {"name": "Project"}),
)
TASK_ROUTES = (
    resource.Route("POST", "/api/projects/2/tasks", {
        "title": "Task", "status": "todo", "priority": "medium",
    }),
    resource.Route("PATCH", "/api/tasks/3", {"title": "Task"}),
)
MEMBER_ROUTES = (
    resource.Route("POST", "/api/workspaces/1/members", {
        "email": "target@example.com", "role": "member",
    }),
    resource.Route("PATCH", "/api/workspaces/1/members/20", {"role": "member"}),
)
OWNER_ROUTE = resource.Route("PATCH", "/api/workspaces/1/owner", {"user_id": 20})
AUTH_ROUTES = (
    resource.Route("POST", "/api/users", {
        "username": "User", "email": "user@example.com", "password": "password123",
    }),
    resource.Route("POST", "/api/auth/login", {
        "email": "user@example.com", "password": "password123",
    }),
)
PROTECTED_ROUTES = WORKSPACE_ROUTES + PROJECT_ROUTES + TASK_ROUTES + MEMBER_ROUTES + (OWNER_ROUTE,)
ALL_ROUTES = PROTECTED_ROUTES + AUTH_ROUTES
BAD_TEXT = (None, 1, True, [], {}, "", "   ", "bad\x00text", "bad\ud800text")


class InputValidationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = resource.ResourcePermissionTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.db = self.fixture.db
        self.client = self.fixture.client
        patcher = patch.object(resource.auth, "password_hasher")
        self.hasher = patcher.start()
        self.addCleanup(patcher.stop)

    def assert_invalid(self, route, **request_options):
        self.db.reset()
        self.hasher.reset_mock()
        response = self.client.open(route.path, method=route.method, **request_options)
        self.assertEqual(response.status_code, 400, response.get_data(as_text=True))
        self.assertIsInstance(response.get_json(), dict)
        self.assertIn("error", response.get_json())
        self.assertEqual(self.db.writes, [])
        self.hasher.hash.assert_not_called()
        self.hasher.verify.assert_not_called()
        # SEC-12 still authorizes the caller and checks existing resources first.
        # Input errors must not reach credential/assignee lookup or a mutation.
        allowed_reads = {
            "get_session_by_token", "get_workspace_by_id", "get_project_by_id",
            "get_task_by_id", "get_workspace_member",
        }
        self.assertTrue(all(name in allowed_reads for name, _, _ in self.db.calls), self.db.calls)

    def assert_bad_field(self, route, field, value):
        with self.subTest(method=route.method, path=route.path, field=field, value=repr(value)):
            self.assert_invalid(route, json={**route.body, field: value})

    def test_non_object_and_malformed_json_returns_400(self):
        bodies = (
            "null", "[]", "[1]", '"text"', "1", "true", "{}", "{", "",
            "[" * 1200 + "0" + "]" * 1200, b'{"name":"\xff"}',
        )
        for route in ALL_ROUTES:
            for body in bodies:
                with self.subTest(method=route.method, path=route.path, body=body):
                    self.assert_invalid(route, data=body, content_type="application/json")
            with self.subTest(method=route.method, path=route.path, content_type="text/plain"):
                self.assert_invalid(route, data='{"name":"Name"}', content_type="text/plain")

    def test_workspace_and_project_names(self):
        for route in WORKSPACE_ROUTES + PROJECT_ROUTES:
            for value in BAD_TEXT + ("x" * 51,):
                self.assert_bad_field(route, "name", value)

    def test_project_and_task_descriptions(self):
        for route in PROJECT_ROUTES + TASK_ROUTES:
            for value in (1, True, [], {}, "bad\x00text", "bad\ud800text"):
                self.assert_bad_field(route, "description", value)

    def test_task_titles_statuses_priorities_and_dates(self):
        for route in TASK_ROUTES:
            for value in BAD_TEXT + ("x" * 101,):
                self.assert_bad_field(route, "title", value)
            for field in ("status", "priority"):
                values = (1, True, [], {}, "", "unknown", "todo\x00", "\ud800")
                values += (None,)
                for value in values:
                    self.assert_bad_field(route, field, value)
            for value in (
                1, True, [], {}, "", "yesterday", "2026-02-30", "0000-01-01",
                "2026-01-01\x0012:00:00", "2026-01-01\ud80012:00:00",
            ):
                self.assert_bad_field(route, "due_date", value)

    def test_assignee_and_owner_ids(self):
        for route, field in ((TASK_ROUTES[0], "assignee_id"), (OWNER_ROUTE, "user_id")):
            for value in (True, False, 0, -1, 1.5, "20", "", [], {}, 2**31, 10**100):
                self.assert_bad_field(route, field, value)
        self.assert_bad_field(OWNER_ROUTE, "user_id", None)

    def test_member_emails_and_roles(self):
        for value in BAD_TEXT + ("x" * 256,):
            self.assert_bad_field(MEMBER_ROUTES[0], "email", value)
        for route in MEMBER_ROUTES:
            for value in (None, 1, True, [], {}, "", "superadmin"):
                self.assert_bad_field(route, "role", value)

    def test_authentication_fields(self):
        for route in AUTH_ROUTES:
            for field in route.body:
                for value in (None, 1, True, [], {}, "", "   ", "bad\ud800text"):
                    self.assert_bad_field(route, field, value)
            for value in ("bad\x00@example.com", "x" * 256):
                self.assert_bad_field(route, "email", value)
        for value in ("bad\x00name", "x" * 51):
            self.assert_bad_field(AUTH_ROUTES[0], "username", value)
        self.assert_bad_field(AUTH_ROUTES[0], "email", "invalid-address")
        self.assert_bad_field(AUTH_ROUTES[0], "password", "short")

    def test_optional_fields_can_be_omitted_or_cleared(self):
        cases = (
            (PROJECT_ROUTES[0], {"name": "Project"}, (1, "Project", None)),
            (PROJECT_ROUTES[1], {"description": None}, (2, "Project", None)),
            (PROJECT_ROUTES[1], {"description": ""}, (2, "Project", "")),
            (PROJECT_ROUTES[1], {"name": "Renamed"}, (2, "Renamed", "Description")),
            (TASK_ROUTES[0], TASK_ROUTES[0].body, (2, 10, None, "Task", None, "todo", "medium", None)),
            (TASK_ROUTES[0], {**TASK_ROUTES[0].body, "assignee_id": None, "description": None, "due_date": None},
             (2, 10, None, "Task", None, "todo", "medium", None)),
            (TASK_ROUTES[1], {"description": None, "due_date": None},
             (3, "Task", None, "todo", "medium", None)),
            (TASK_ROUTES[1], {"description": ""}, (3, "Task", "", "todo", "medium", None)),
            (TASK_ROUTES[1], {"title": "Renamed"}, (3, "Renamed", "Description", "todo", "medium", None)),
            (MEMBER_ROUTES[0], {"email": "target@example.com"}, (1, 20, "member")),
        )
        for route, body, expected_args in cases:
            with self.subTest(method=route.method, path=route.path, body=body):
                self.db.reset()
                response = self.client.open(route.path, method=route.method, json=body)
                self.assertEqual(response.status_code, 201 if route.method == "POST" else 200, response.get_json())
                self.assertEqual(len(self.db.writes), 1)
                self.assertEqual(self.db.writes[0][1], expected_args)

    def test_valid_dates_and_enum_values_remain_accepted(self):
        for route in TASK_ROUTES:
            for value in (
                "2026-09-14", "2026-09-14T12:30:00", "2026-09-14T12:30:00+02:00",
                "2026-09-14T12:30:00.123456789+02:00",
            ):
                with self.subTest(method=route.method, due_date=value):
                    self.db.reset()
                    response = self.client.open(route.path, method=route.method, json={**route.body, "due_date": value})
                    self.assertEqual(response.status_code, 201 if route.method == "POST" else 200, response.get_json())
                    self.assertEqual(len(self.db.writes), 1)
                    self.assertEqual(self.db.writes[0][1][-1], value)
        for field, values in (
            ("status", ("todo", "in_progress", "review", "done")),
            ("priority", ("low", "medium", "high", "urgent")),
        ):
            for value in values:
                with self.subTest(field=field, value=value):
                    self.db.reset()
                    response = self.client.patch(TASK_ROUTES[1].path, json={field: value})
                    self.assertEqual(response.status_code, 200, response.get_json())
                    self.assertEqual(len(self.db.writes), 1)

    def test_omitted_fields_preserve_existing_values(self):
        self.db.task = (*self.db.task[:4], "", *self.db.task[5:7], None, self.db.task[8])
        response = self.client.patch(TASK_ROUTES[1].path, json={"description": "Updated"})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(self.db.writes, [("update_task_db", (3, "", "Updated", "todo", None, None), {})])
        self.db.reset()
        self.db.project = (2, 1, "", "Description", self.db.now)
        response = self.client.patch(PROJECT_ROUTES[1].path, json={"description": "Updated"})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(self.db.writes, [("update_project_db", (2, "", "Updated"), {})])

    def test_postgresql_date_validation_errors_return_400(self):
        for route, write_name in ((TASK_ROUTES[0], "create_task"), (TASK_ROUTES[1], "update_task_db")):
            for error in (InvalidDatetimeFormat, DatetimeFieldOverflow, InvalidTimeZoneDisplacementValue, DataError):
                with self.subTest(method=route.method, error=error.__name__):
                    self.db.reset()
                    body = {**route.body, "due_date": "2026-01-01T12:00:00+23:00"}
                    if error is DataError:
                        body["due_date"] = "9999-12-31T23:59:59.9999999"
                    with patch.object(resource.tasks, write_name, side_effect=error("invalid date")) as write:
                        response = self.client.open(route.path, method=route.method, json=body)
                    self.assertEqual(response.status_code, 400, response.get_json())
                    self.assertIn("error", response.get_json())
                    write.assert_called_once()

    def test_invalid_bodies_preserve_sec12_precedence(self):
        for route in PROTECTED_ROUTES:
            scenarios = ("missing_session", "revoked_session")
            if route != WORKSPACE_ROUTES[0]:
                scenarios += ("missing_resource", "nonmember", "guest")
            for scenario in scenarios:
                with self.subTest(method=route.method, path=route.path, scenario=scenario):
                    self.db.reset()
                    self.fixture.sign_in(None if scenario == "missing_session" else "test-token")
                    if scenario == "revoked_session":
                        self.db.session_state = "revoked"
                    if scenario == "missing_resource":
                        self.db.workspace_exists = self.db.project_exists = self.db.task_exists = False
                    if scenario == "nonmember":
                        self.db.actor_role = None
                    if scenario == "guest":
                        self.db.actor_role = "guest"
                        self.db.owner_id = 99
                    response = self.client.open(route.path, method=route.method, json=[1])
                    status = 401 if "session" in scenario else 403 if scenario == "guest" else 404
                    self.assertEqual(response.status_code, status, response.get_json())
                    if status == 404:
                        self.assertEqual(response.get_json(), resource.NOT_FOUND)
                    self.assertEqual(self.db.writes, [])

    def test_well_typed_absent_targets_still_return_404(self):
        for route in (TASK_ROUTES[0], OWNER_ROUTE, MEMBER_ROUTES[1]):
            with self.subTest(method=route.method, path=route.path):
                self.db.reset()
                self.db.target_exists = False
                body = {**route.body, "assignee_id": 20} if route == TASK_ROUTES[0] else route.body
                response = self.client.open(route.path, method=route.method, json=body)
                self.assertEqual(response.status_code, 404, response.get_json())
                self.assertEqual(response.get_json(), resource.NOT_FOUND)
                self.assertEqual(self.db.writes, [])
        with patch.object(resource.workspaces, "get_user_by_email", return_value=None):
            response = self.client.post(MEMBER_ROUTES[0].path, json=MEMBER_ROUTES[0].body)
        self.assertEqual(response.status_code, 404, response.get_json())
        self.assertEqual(response.get_json(), resource.NOT_FOUND)

    def test_password_nul_remains_accepted(self):
        password = "password\x00with-nul"
        self.hasher.hash.return_value = "hash"
        self.hasher.verify.return_value = True
        user = (20, "User", "user@example.com", self.db.now)
        with patch.object(resource.auth, "create_user", return_value=user) as create_user, \
                patch.object(resource.auth, "create_session"):
            response = self.client.post(AUTH_ROUTES[0].path, json={**AUTH_ROUTES[0].body, "password": password})
            self.assertEqual(response.status_code, 201, response.get_json())
            self.hasher.hash.assert_called_once_with(password)
            create_user.assert_called_once_with("User", "user@example.com", "hash")
            response = self.client.post(AUTH_ROUTES[1].path, json={**AUTH_ROUTES[1].body, "password": password})
            self.assertEqual(response.status_code, 200, response.get_json())
            self.hasher.verify.assert_called_once_with("hash", password)


if __name__ == "__main__":
    unittest.main()
