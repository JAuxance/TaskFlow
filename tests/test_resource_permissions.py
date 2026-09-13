"""HTTP regressions for resource concealment and workspace permissions.

The real authentication and permission helpers run against a mocked database
boundary; no PostgreSQL server or full application startup is required.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import Mock, patch

from flask import Flask

from app import permissions
from app.routes import projects, tasks, workspaces


@dataclass(frozen=True)
class Route:
    method: str
    path: str
    body: dict | None = None


RESOURCE_ROUTES = (
    Route("POST", "/api/projects/2/tasks", {"title": "Task", "status": "todo", "priority": "medium"}),
    Route("GET", "/api/projects/2/tasks"),
    Route("GET", "/api/tasks/3"),
    Route("PATCH", "/api/tasks/3", {"title": "Updated task"}),
    Route("DELETE", "/api/tasks/3"),
    Route("POST", "/api/workspaces/1/projects", {"name": "Project"}),
    Route("GET", "/api/workspaces/1/projects"),
    Route("GET", "/api/projects/2"),
    Route("PATCH", "/api/projects/2", {"name": "Updated project"}),
    Route("DELETE", "/api/projects/2"),
    Route("GET", "/api/workspaces/1"),
    Route("PATCH", "/api/workspaces/1", {"name": "Updated workspace"}),
    Route("DELETE", "/api/workspaces/1"),
    Route("POST", "/api/workspaces/1/members", {"email": "target@example.test", "role": "member"}),
    Route("GET", "/api/workspaces/1/members"),
    Route("PATCH", "/api/workspaces/1/members/20", {"role": "member"}),
    Route("DELETE", "/api/workspaces/1/members/20"),
    Route("PATCH", "/api/workspaces/1/owner", {"user_id": 20}),
)

NOT_FOUND = {"error": "resource not found"}
FORBIDDEN = {"error": "insufficient privileges"}


class FakeDatabase:
    """Small fixture of one workspace, its project, task, and two members."""

    ACTOR = 10
    TARGET = 20
    WRITE_NAMES = {
        "create_task", "update_task_db", "delete_task", "create_project",
        "update_project_db", "deleted_project", "update_workspace", "delet_workspace",
        "add_workspace_member", "update_role_member", "delete_member_db", "crowned_king",
        "create_workspace_with_owner",
    }

    def __init__(self):
        self.now = datetime.now(timezone.utc)
        self.project = (2, 1, "Project", "Description", self.now)
        self.task = (3, 2, self.ACTOR, None, "Task", "Description", "todo", "medium", None)
        self.reset()

    def reset(self):
        self.calls = []
        self.workspace_exists = True
        self.project_exists = True
        self.task_exists = True
        self.target_exists = True
        self.actor_role = "owner"
        self.target_role = "owner"
        self.owner_id = self.ACTOR
        self.session_state = "valid"
        self.reject_business_access = False
        self.reject_target_access = False
        self.empty_write = None

    @property
    def workspace(self):
        return (1, self.owner_id, "Workspace", self.now)

    @property
    def writes(self):
        return [call for call in self.calls if call[0] in self.WRITE_NAMES]

    def member(self, user_id, role):
        return (100 + user_id, 1, user_id, role, self.now)

    def call(self, name, *args, **kwargs):
        self.calls.append((name, args, kwargs))
        if name == "get_session_by_token":
            if self.session_state == "unknown":
                return None
            expires_at = self.now + timedelta(hours=1)
            if self.session_state == "expired":
                expires_at = self.now - timedelta(seconds=1)
            return (1, self.ACTOR, args[0], self.now, expires_at, self.session_state == "revoked")

        if self.reject_business_access:
            raise AssertionError(f"Business access before authentication: {name}")
        if name == self.empty_write:
            return None
        if name == "get_workspace_by_id":
            return self.workspace if self.workspace_exists and args[0] == 1 else None
        if name == "get_project_by_id":
            return self.project if self.project_exists and args[0] == 2 else None
        if name == "get_task_by_id":
            return self.task if self.task_exists and args[0] == 3 else None
        if name == "get_workspace_member":
            workspace_id, user_id = args
            if user_id != self.ACTOR and self.reject_target_access:
                raise AssertionError("Target member read before caller authorization")
            if not self.workspace_exists or workspace_id != 1:
                return None
            if user_id == self.ACTOR:
                return self.member(user_id, self.actor_role) if self.actor_role else None
            if user_id == self.TARGET and self.target_exists:
                return self.member(user_id, self.target_role)
            return None
        lists = {
            "get_workspace_members": [self.member(self.ACTOR, self.actor_role)],
            "get_workspaces_by_member": [self.workspace],
            "get_projects_by_workspace": [self.project],
            "get_tasks_by_project": [self.task],
        }
        if name in lists:
            return lists[name]
        if name == "get_user_by_email":
            return (self.TARGET, "target", args[0], "hash", self.now)
        if name == "get_user_by_id":
            return (args[0], "target", "target@example.test")
        if name in ("create_task", "update_task_db"):
            return self.task
        if name in ("create_project", "update_project_db"):
            return self.project
        if name in ("create_workspace_with_owner", "update_workspace"):
            return self.workspace
        if name in ("add_workspace_member", "update_role_member"):
            return self.member(args[1], args[2])
        if name == "crowned_king":
            return (1, args[0], "Workspace", self.now)
        if name in self.WRITE_NAMES:
            return (1,)
        raise AssertionError(f"Unexpected database call: {name}{args}")


class ResourcePermissionTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        # Patch the DB boundary wherever it was imported; helpers remain real.
        mocks = {}
        for module in (permissions, tasks, projects, workspaces):
            for name, value in vars(module).copy().items():
                if callable(value) and getattr(value, "__module__", None) == "app.db":
                    if name not in mocks:
                        mocks[name] = Mock(
                            name=name,
                            side_effect=lambda *args, _name=name, **kwargs: self.db.call(_name, *args, **kwargs),
                        )
                    patcher = patch.object(module, name, mocks[name])
                    patcher.start()
                    self.addCleanup(patcher.stop)
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="test-resource-permissions")
        for blueprint in (tasks.tasks_bp, projects.projects_bp, workspaces.workspaces_bp):
            app.register_blueprint(blueprint)
        self.client = app.test_client()
        self.sign_in()

    def sign_in(self, token="test-token"):
        with self.client.session_transaction() as session:
            session.clear()
            if token is not None:
                session["session_token"] = token

    def request_route(self, route):
        return self.client.open(route.path, method=route.method, json=route.body)

    def assert_response(self, response, status, body):
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        self.assertEqual(response.get_json(), body)

    def assert_denied(self, route, status=404):
        self.assert_response(self.request_route(route), status, NOT_FOUND if status == 404 else FORBIDDEN)
        self.assertEqual(self.db.writes, [])

    def test_absent_resources_and_outsiders_have_identical_responses(self):
        for route in RESOURCE_ROUTES:
            responses = []
            for scenario in ("absent", "outsider"):
                with self.subTest(method=route.method, path=route.path, scenario=scenario):
                    self.db.reset()
                    if scenario == "absent":
                        self.db.workspace_exists = False
                        self.db.project_exists = False
                        self.db.task_exists = False
                    else:
                        self.db.actor_role = None
                    response = self.request_route(route)
                    self.assert_response(response, 404, NOT_FOUND)
                    self.assertEqual(self.db.writes, [])
                    responses.append((response.status_code, response.get_json()))
            self.assertEqual(responses[0], responses[1])

    def test_missing_parent_resources_are_concealed(self):
        for missing in ("workspace_exists", "project_exists"):
            for route in RESOURCE_ROUTES:
                if "/api/tasks/" not in route.path and not route.path.startswith("/api/projects/"):
                    continue
                with self.subTest(parent=missing, method=route.method, path=route.path):
                    self.db.reset()
                    setattr(self.db, missing, False)
                    self.assert_denied(route)

    def test_invalid_sessions_are_rejected_before_any_business_access(self):
        for session_state in ("missing", "unknown", "expired", "revoked"):
            for route in RESOURCE_ROUTES:
                with self.subTest(session=session_state, method=route.method, path=route.path):
                    self.db.reset()
                    self.db.session_state = session_state
                    self.db.reject_business_access = True
                    self.sign_in(None if session_state == "missing" else "test-token")
                    response = self.request_route(route)
                    self.assertEqual(response.status_code, 401, response.get_json())
                    self.assertEqual(self.db.writes, [])

    def test_guest_can_read_but_cannot_mutate_resources(self):
        for route in RESOURCE_ROUTES:
            with self.subTest(method=route.method, path=route.path):
                self.db.reset()
                self.db.actor_role = "guest"
                self.db.owner_id = 99
                response = self.request_route(route)
                if route.method == "GET":
                    self.assertEqual(response.status_code, 200, response.get_json())
                else:
                    self.assert_response(response, 403, FORBIDDEN)
                self.assertEqual(self.db.writes, [])

    def test_non_crown_members_cannot_delete_workspace_or_transfer_crown(self):
        routes = (
            Route("DELETE", "/api/workspaces/1"),
            Route("PATCH", "/api/workspaces/1/owner", {"user_id": 20}),
        )
        for role in ("owner", "admin", "member", "guest"):
            for route in routes:
                with self.subTest(role=role, method=route.method, path=route.path):
                    self.db.reset()
                    self.db.actor_role = role
                    self.db.owner_id = 99
                    self.assert_denied(route, 403)

    def test_caller_is_authorized_before_target_member_is_read(self):
        routes = (
            Route("PATCH", "/api/workspaces/1/members/20", {"role": "member"}),
            Route("DELETE", "/api/workspaces/1/members/20"),
            Route("PATCH", "/api/workspaces/1/owner", {"user_id": 20}),
        )
        for role in (None, "guest"):
            for target_exists in (True, False):
                for route in routes:
                    with self.subTest(role=role, target_exists=target_exists, path=route.path, method=route.method):
                        self.db.reset()
                        self.db.actor_role = role
                        self.db.owner_id = 99
                        self.db.target_exists = target_exists
                        self.db.reject_target_access = True
                        self.assert_denied(route, 404 if role is None else 403)

    def test_authorized_caller_gets_generic_404_for_missing_target_member(self):
        for route in (
            Route("PATCH", "/api/workspaces/1/members/20", {"role": "member"}),
            Route("DELETE", "/api/workspaces/1/members/20"),
            Route("PATCH", "/api/workspaces/1/owner", {"user_id": 20}),
        ):
            with self.subTest(method=route.method, path=route.path):
                self.db.reset()
                self.db.target_exists = False
                self.assert_denied(route)

    def test_member_management_preserves_role_restrictions(self):
        cases = (
            # Admins cannot promote members to owner/admin or manage their peers.
            ("admin", "member", "POST", "owner"),
            ("admin", "member", "POST", "admin"),
            ("admin", "member", "PATCH", "owner"),
            ("admin", "member", "PATCH", "admin"),
            ("admin", "admin", "PATCH", "member"),
            ("admin", "owner", "PATCH", "member"),
            ("admin", "admin", "DELETE", None),
            ("admin", "owner", "DELETE", None),
            # Only the crown holder can assign or manage the owner role.
            ("owner", "member", "POST", "owner"),
            ("owner", "member", "PATCH", "owner"),
            ("owner", "owner", "PATCH", "member"),
            ("owner", "owner", "DELETE", None),
        )
        for actor_role, target_role, method, requested_role in cases:
            with self.subTest(actor=actor_role, target=target_role, method=method, role=requested_role):
                self.db.reset()
                self.db.actor_role = actor_role
                self.db.target_role = target_role
                self.db.owner_id = 99
                path = "/api/workspaces/1/members"
                body = {"email": "target@example.test", "role": requested_role}
                if method != "POST":
                    path += "/20"
                    body = {"role": requested_role} if method == "PATCH" else None
                self.assert_denied(Route(method, path, body), 403)

    def test_crown_holder_cannot_be_removed_or_demoted(self):
        for method in ("PATCH", "DELETE"):
            with self.subTest(method=method):
                self.db.reset()
                route = Route(method, "/api/workspaces/1/members/10", {"role": "member"})
                self.assert_denied(route, 403)

    def test_crown_holder_can_use_all_resource_routes(self):
        for route in RESOURCE_ROUTES:
            with self.subTest(method=route.method, path=route.path):
                self.db.reset()
                response = self.request_route(route)
                self.assertEqual(response.status_code, 201 if route.method == "POST" else 200, response.get_json())
                self.assertEqual(len(self.db.writes), 0 if route.method == "GET" else 1)

    def test_regular_member_can_mutate_tasks_but_cannot_manage_projects(self):
        for route in RESOURCE_ROUTES[:10]:
            if route.method == "GET":
                continue
            with self.subTest(method=route.method, path=route.path):
                self.db.reset()
                self.db.actor_role = "member"
                self.db.owner_id = 99
                response = self.request_route(route)
                is_task = "/tasks" in route.path
                if is_task:
                    self.assertEqual(response.status_code, 201 if route.method == "POST" else 200, response.get_json())
                    self.assertEqual(len(self.db.writes), 1)
                else:
                    self.assert_response(response, 403, FORBIDDEN)
                    self.assertEqual(self.db.writes, [])

    def test_admin_can_manage_ordinary_members(self):
        for route in (
            Route("POST", "/api/workspaces/1/members", {"email": "target@example.test", "role": "member"}),
            Route("PATCH", "/api/workspaces/1/members/20", {"role": "guest"}),
            Route("DELETE", "/api/workspaces/1/members/20"),
        ):
            with self.subTest(method=route.method):
                self.db.reset()
                self.db.actor_role = "admin"
                self.db.target_role = "member"
                self.db.owner_id = 99
                response = self.request_route(route)
                self.assertEqual(response.status_code, 201 if route.method == "POST" else 200, response.get_json())
                self.assertEqual(len(self.db.writes), 1)

    def test_resource_disappearing_before_write_returns_generic_404(self):
        cases = (
            ("delete_task", Route("DELETE", "/api/tasks/3")),
            ("deleted_project", Route("DELETE", "/api/projects/2")),
            ("update_role_member", Route("PATCH", "/api/workspaces/1/members/20", {"role": "member"})),
            ("delete_member_db", Route("DELETE", "/api/workspaces/1/members/20")),
            ("crowned_king", Route("PATCH", "/api/workspaces/1/owner", {"user_id": 20})),
        )
        for name, route in cases:
            with self.subTest(write=name):
                self.db.reset()
                self.db.empty_write = name
                self.assert_response(self.request_route(route), 404, NOT_FOUND)


if __name__ == "__main__":
    unittest.main()
