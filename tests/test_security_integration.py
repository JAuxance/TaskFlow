"""Opt-in security replay against the configured, real PostgreSQL database.

Run after initializing a disposable database, inside the backend container:
    docker compose exec -e TASKFLOW_SECURITY_INTEGRATION=1 backend \
        python -m unittest discover -s tests -p test_security_integration.py -v

The real app, session table, password hashing and limiter are used. Only this
run's randomly named fixtures are removed; no database-wide reset occurs here.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
import os
import secrets
import unittest


@unittest.skipUnless(
    os.getenv("TASKFLOW_SECURITY_INTEGRATION") == "1",
    "requires an explicitly selected integration database",
)
class SecurityIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app import db
        from app.app import app
        from app.extensions import limiter
        from app.routes.auth import password_hasher

        cls.db, cls.app, cls.limiter = db, app, limiter
        cls.previous_config = {
            key: app.config[key] for key in ("TESTING", "PROPAGATE_EXCEPTIONS")
        }
        app.config.update(TESTING=False, PROPAGATE_EXCEPTIONS=False)
        cls.addClassCleanup(app.config.update, cls.previous_config)
        cls.prefix = "sec-replay-" + secrets.token_hex(6)
        cls.password = "SecurityReplay-Only-123!"
        cls.users = {}
        cls.statuses = defaultdict(Counter)
        cls.observations = []
        password_hash = password_hasher.hash(cls.password)
        with db.get_db_connection() as connection:
            with connection.cursor() as cursor:
                for role in ("crown", "owner", "admin", "admin_peer", "member", "guest", "outsider"):
                    email = f"{cls.prefix}-{role}@example.com"
                    cursor.execute(
                        "INSERT INTO users (username, email, password_hash) "
                        "VALUES (%s, %s, %s) RETURNING id",
                        (role, email, password_hash),
                    )
                    cls.users[role] = {"id": cursor.fetchone()[0], "email": email}
                for number in range(25):
                    label = f"extra{number}"
                    email = f"{cls.prefix}-{label}@example.com"
                    cursor.execute(
                        "INSERT INTO users (username, email, password_hash) "
                        "VALUES (%s, %s, %s) RETURNING id",
                        (label, email, password_hash),
                    )
                    cls.users[label] = {"id": cursor.fetchone()[0], "email": email}
        cls.user_ids = [user["id"] for user in cls.users.values()]
        cls.addClassCleanup(cls.remove_users)
        cls.addClassCleanup(cls.print_results)

    @classmethod
    def remove_users(cls):
        with cls.db.get_db_connection() as connection:
            connection.execute("DELETE FROM users WHERE id = ANY(%s)", (cls.user_ids,))

    @classmethod
    def print_results(cls):
        print("SECURITY_HTTP_STATUSES=" + json.dumps(
            {key: dict(value) for key, value in sorted(cls.statuses.items())}, sort_keys=True,
        ))
        if cls.observations:
            print("SECURITY_OBSERVATIONS=" + json.dumps(cls.observations, sort_keys=True))

    def setUp(self):
        self.limiter.reset()
        self.clients = {}
        crown_id = self.users["crown"]["id"]
        self.workspace = self.db.create_workspace_with_owner(crown_id, self.prefix)[0]
        self.addCleanup(self.remove_workspaces)
        for label, role in (("owner", "owner"), ("admin", "admin"), ("admin_peer", "admin"), ("member", "member"), ("guest", "guest")):
            self.db.add_workspace_member(self.workspace, self.users[label]["id"], role)
        self.project = self.db.create_project(self.workspace, "Replay project", "original")[0]
        self.task = self.db.create_task(
            self.project, crown_id, None, "Replay task", "original", "todo", "medium", None,
        )[0]
        self.task_body = {"title": "Replay task", "status": "todo", "priority": "medium"}

    def remove_workspaces(self):
        with self.db.get_db_connection() as connection:
            connection.execute("DELETE FROM workspaces WHERE owner_id = ANY(%s)", (self.user_ids,))

    def client(self, label="crown"):
        if label not in self.clients:
            client = self.app.test_client()
            token = secrets.token_urlsafe(32)
            self.db.create_session(
                self.users[label]["id"], token, datetime.now(timezone.utc) + timedelta(hours=1),
            )
            with client.session_transaction() as session:
                session["session_token"] = token
            self.clients[label] = client
        return self.clients[label]

    def request(self, sec, method, path, *, label="crown", client=None, expected=None, **kwargs):
        response = (client or self.client(label)).open(path, method=method, **kwargs)
        self.statuses[sec][response.status_code] += 1
        if expected is not None:
            self.assertEqual(response.status_code, expected, f"{method} {path}: {response.get_data(as_text=True)}")
        return response

    def member_path(self, label):
        return f"/api/workspaces/{self.workspace}/members/{self.users[label]['id']}"

    def mutation_routes(self):
        return (
            ("POST", "/api/workspaces", {"name": "Workspace"}),
            ("PATCH", f"/api/workspaces/{self.workspace}", {"name": "Workspace"}),
            ("POST", f"/api/workspaces/{self.workspace}/projects", {"name": "Project"}),
            ("PATCH", f"/api/projects/{self.project}", {"name": "Project"}),
            ("POST", f"/api/workspaces/{self.workspace}/members", {"email": self.users["outsider"]["email"], "role": "member"}),
            ("PATCH", self.member_path("member"), {"role": "member"}),
            ("PATCH", f"/api/workspaces/{self.workspace}/owner", {"user_id": self.users["owner"]["id"]}),
            ("POST", f"/api/projects/{self.project}/tasks", self.task_body),
            ("PATCH", f"/api/tasks/{self.task}", {"title": "Task"}),
        )

    def resource_routes(self, absent=False):
        workspace, project, task = (2147483647,) * 3 if absent else (self.workspace, self.project, self.task)
        member = 2147483647 if absent else self.users["member"]["id"]
        return (
            ("GET", f"/api/workspaces/{workspace}", None),
            ("PATCH", f"/api/workspaces/{workspace}", {"name": "Updated"}),
            ("DELETE", f"/api/workspaces/{workspace}", None),
            ("GET", f"/api/workspaces/{workspace}/projects", None),
            ("POST", f"/api/workspaces/{workspace}/projects", {"name": "New"}),
            ("GET", f"/api/projects/{project}", None),
            ("PATCH", f"/api/projects/{project}", {"name": "Updated"}),
            ("DELETE", f"/api/projects/{project}", None),
            ("GET", f"/api/projects/{project}/tasks", None),
            ("POST", f"/api/projects/{project}/tasks", self.task_body),
            ("GET", f"/api/tasks/{task}", None),
            ("PATCH", f"/api/tasks/{task}", {"title": "Updated"}),
            ("DELETE", f"/api/tasks/{task}", None),
            ("GET", f"/api/workspaces/{workspace}/members", None),
            ("POST", f"/api/workspaces/{workspace}/members", {"email": self.users["outsider"]["email"]}),
            ("PATCH", f"/api/workspaces/{workspace}/members/{member}", {"role": "guest"}),
            ("DELETE", f"/api/workspaces/{workspace}/members/{member}", None),
            ("PATCH", f"/api/workspaces/{workspace}/owner", {"user_id": self.users["owner"]["id"]}),
        )

    def test_sec01_role_attribution_and_allowed_member_management(self):
        path = f"/api/workspaces/{self.workspace}/members"
        for actor, requested in (("admin", "owner"), ("admin", "admin"), ("owner", "owner")):
            with self.subTest(actor=actor, role=requested):
                self.request("SEC-01", "POST", path, label=actor, expected=403,
                             json={"email": self.users["outsider"]["email"], "role": requested})
                self.request("SEC-01", "PATCH", self.member_path("member"), label=actor,
                             expected=403, json={"role": requested})
                self.assertIsNone(self.db.get_workspace_member(self.workspace, self.users["outsider"]["id"]))
                self.assertEqual(self.db.get_workspace_member(self.workspace, self.users["member"]["id"])[3], "member")
        for actor, requested in (("crown", "owner"), ("crown", "admin"), ("owner", "admin"), ("admin", "member"), ("admin", "guest")):
            with self.subTest(allowed_actor=actor, role=requested):
                self.request("SEC-01", "POST", path, label=actor, expected=201,
                             json={"email": self.users["outsider"]["email"], "role": requested})
                self.assertEqual(self.db.get_workspace_member(self.workspace, self.users["outsider"]["id"])[3], requested)
                self.request("SEC-01", "DELETE", self.member_path("outsider"), label="crown", expected=200)

    def test_sec02_admin_peer_cannot_be_demoted_then_deleted(self):
        for target in ("admin_peer", "owner", "crown"):
            self.request("SEC-02", "DELETE", self.member_path(target), label="admin", expected=403)
            self.request("SEC-02", "PATCH", self.member_path(target), label="admin", expected=403, json={"role": "member"})
            self.request("SEC-02", "DELETE", self.member_path(target), label="admin", expected=403)
            self.assertIsNotNone(self.db.get_workspace_member(self.workspace, self.users[target]["id"]))
        self.assertEqual(self.db.get_workspace_member(self.workspace, self.users["admin_peer"]["id"])[3], "admin")
        self.request("SEC-02", "PATCH", self.member_path("member"), label="admin", expected=200, json={"role": "guest"})
        self.request("SEC-02", "DELETE", self.member_path("member"), label="admin", expected=200)
        self.assertIsNone(self.db.get_workspace_member(self.workspace, self.users["member"]["id"]))

    def test_sec07_logout_revokes_copied_cookie(self):
        client = self.app.test_client()
        self.request("SEC-07", "POST", "/api/auth/login", client=client, expected=200,
                     json={"email": self.users["crown"]["email"], "password": self.password})
        cookie = client.get_cookie(self.app.config["SESSION_COOKIE_NAME"]).value
        with client.session_transaction() as session:
            token = session["session_token"]
        self.request("SEC-07", "GET", "/api/auth/me", client=client, expected=200)
        self.request("SEC-07", "POST", "/api/auth/logout", client=client, expected=200)
        self.assertTrue(self.db.get_session_by_token(token)[5])
        self.request("SEC-07", "GET", "/api/auth/me", client=client, expected=401)
        replay = self.app.test_client()
        replay.set_cookie(self.app.config["SESSION_COOKIE_NAME"], cookie)
        self.request("SEC-07", "GET", "/api/auth/me", client=replay, expected=401)

    def test_sec08_actual_rate_limits(self):
        for path, attempts in (("/api/auth/login", 5), ("/api/users", 3)):
            with self.subTest(path=path):
                self.limiter.reset()
                client = self.app.test_client()
                for _ in range(attempts):
                    self.request("SEC-08", "POST", path, client=client, expected=400, json={"invalid": True})
                self.request("SEC-08", "POST", path, client=client, expected=429, json={"invalid": True})

    def test_sec08_request_body_limit(self):
        before = self.db.get_workspaces_by_member(self.users["crown"]["id"], 100, 0)
        self.request("SEC-08", "POST", "/api/workspaces", expected=413,
                     data=json.dumps({"name": "x" * (1024 * 1024)}), content_type="application/json")
        self.assertEqual(self.db.get_workspaces_by_member(self.users["crown"]["id"], 100, 0), before)

    def test_sec08_sql_pagination_on_all_four_lists(self):
        crown_id = self.users["crown"]["id"]
        for number in range(24):
            self.db.create_workspace_with_owner(crown_id, f"Replay {number}")
            self.db.create_project(self.workspace, f"Replay {number}", None)
            self.db.create_task(self.project, crown_id, None, f"Replay {number}", None, "todo", "medium", None)
        for number in range(19):
            self.db.add_workspace_member(self.workspace, self.users[f"extra{number}"]["id"], "guest")
        paths = ("/api/workspaces", f"/api/workspaces/{self.workspace}/projects",
                 f"/api/workspaces/{self.workspace}/members", f"/api/projects/{self.project}/tasks")
        for path in paths:
            with self.subTest(path=path):
                first = self.request("SEC-08", "GET", path, expected=200).get_json()
                second = self.request("SEC-08", "GET", path + "?page=2", expected=200).get_json()
                repeated = self.request("SEC-08", "GET", path, expected=200).get_json()
                custom = self.request("SEC-08", "GET", path + "?page=2&limit=7", expected=200).get_json()
                beyond = self.request("SEC-08", "GET", path + "?page=3", expected=200).get_json()
                self.assertEqual((len(first), len(second), len(custom), len(beyond)), (20, 5, 7, 0))
                self.assertEqual(first, repeated)
                ids = [item["id"] for item in first + second]
                self.assertEqual(ids, sorted(set(ids)))
                self.assertEqual([item["id"] for item in custom], ids[7:14])
                visible_workspace = self.request("SEC-08", "GET", path, label="outsider", expected=200 if path == "/api/workspaces" else 404)
                if path == "/api/workspaces":
                    self.assertEqual(visible_workspace.get_json(), [])

    def test_sec08_invalid_pagination_is_rejected_after_access_checks(self):
        paths = ("/api/workspaces", f"/api/workspaces/{self.workspace}/projects",
                 f"/api/workspaces/{self.workspace}/members", f"/api/projects/{self.project}/tasks")
        for path in paths:
            for query in ("page=0", "page=-1", "page=abc", "page=1.5", "limit=0", "limit=-1",
                          "limit=abc", "limit=101", "page=9223372036854775808&limit=20"):
                with self.subTest(path=path, query=query):
                    self.request("SEC-08", "GET", f"{path}?{query}", expected=400)
            self.request("SEC-08", "GET", path + "?limit=100", expected=200)
            self.request("SEC-12", "GET", path + "?limit=-1", client=self.app.test_client(), expected=401)
            if path != "/api/workspaces":
                self.request("SEC-12", "GET", path + "?limit=-1", label="outsider", expected=404)
                self.request("SEC-12", "GET", path + "?limit=100", label="guest", expected=200)

    def test_sec09_bad_json_on_all_reviewed_mutations(self):
        auth_routes = (("POST", "/api/users", {}), ("POST", "/api/auth/login", {}))
        for method, path, _ in self.mutation_routes() + auth_routes:
            for body in ("null", "[1]", '"text"', "true", "{}", "{", "", b'{"name":"\xff"}'):
                with self.subTest(method=method, path=path, body=repr(body)):
                    self.limiter.reset()
                    self.request("SEC-09", method, path, expected=400, data=body, content_type="application/json")

    def test_sec09_invalid_fields_do_not_change_database(self):
        before_workspace = self.db.get_workspace_by_id(self.workspace)
        before_project = self.db.get_project_by_id(self.project)
        before_task = self.db.get_task_by_id(self.task)
        before_members = self.db.get_workspace_members(self.workspace, 100, 0)
        routes = self.mutation_routes()
        cases = []
        for index in (0, 1, 2, 3):
            for bad in (None, {}, [], True, 5, "", " ", "x" * 51, "x\x00", "x\ud800"):
                cases.append((routes[index], "name", bad))
        for index in (2, 3, 7, 8):
            for bad in ({}, [], 7, True, "x\x00", "x\ud800"):
                cases.append((routes[index], "description", bad))
        for index in (7, 8):
            for field, values in (
                ("title", (None, {}, [], True, "", " ", "x" * 101, "x\x00", "x\ud800")),
                ("status", (None, {}, [], True, "unknown")),
                ("priority", (None, {}, [], True, "unknown")),
                ("due_date", ({}, [], 1, True, "yesterday", "2026-02-30", "0000-01-01", "2026-01-01\x00")),
            ):
                for bad in values:
                    cases.append((routes[index], field, bad))
        for index, field in ((7, "assignee_id"), (6, "user_id")):
            for bad in ({}, [], True, False, 0, -1, "1", 1.2, 2**31, 10**100):
                cases.append((routes[index], field, bad))
        for index in (4, 5):
            for bad in (None, {}, [], True, 1, "", "superadmin"):
                cases.append((routes[index], "role", bad))
        for bad in ({}, [], True, 1, None, "", " ", "x" * 256, "bad\x00@example.com", "bad\ud800@example.com"):
            cases.append((routes[4], "email", bad))
        auth_routes = (
            ("POST", "/api/users", {"username": "Replay", "email": f"{self.prefix}-invalid@example.com", "password": self.password}),
            ("POST", "/api/auth/login", {"email": self.users["crown"]["email"], "password": self.password}),
        )
        for route in auth_routes:
            for field in route[2]:
                for bad in (None, {}, [], True, "", " ", "x\ud800"):
                    cases.append((route, field, bad))
            cases.append((route, "email", "bad\x00@example.com"))
        cases.append((auth_routes[0], "username", "bad\x00"))
        for (method, path, body), field, bad in cases:
            with self.subTest(method=method, path=path, field=field, value=repr(bad)):
                self.limiter.reset()
                self.request("SEC-09", method, path, expected=400, json={**body, field: bad})
        self.assertEqual(self.db.get_workspace_by_id(self.workspace), before_workspace)
        self.assertEqual(self.db.get_project_by_id(self.project), before_project)
        self.assertEqual(self.db.get_task_by_id(self.task), before_task)
        self.assertEqual(self.db.get_workspace_members(self.workspace, 100, 0), before_members)
        self.assertEqual(len(self.db.get_workspaces_by_member(self.users["crown"]["id"], 100, 0)), 1)
        self.assertEqual(len(self.db.get_projects_by_workspace(self.workspace, 100, 0)), 1)
        self.assertEqual(len(self.db.get_tasks_by_project(self.project, 100, 0)), 1)
        self.assertIsNone(self.db.get_user_by_email(f"{self.prefix}-invalid@example.com"))

    def test_sec09_optional_fields_and_allowed_updates(self):
        project = self.request("SEC-09", "POST", f"/api/workspaces/{self.workspace}/projects", expected=201, json={"name": "Optional"}).get_json()
        self.assertIsNone(project["description"])
        updated = self.request("SEC-09", "PATCH", f"/api/projects/{self.project}", expected=200, json={"description": None}).get_json()
        self.assertEqual(updated["name"], "Replay project")
        updated = self.request("SEC-09", "PATCH", f"/api/tasks/{self.task}", expected=200,
                               json={"description": None, "due_date": None}).get_json()
        self.assertEqual((updated["title"], updated["status"], updated["priority"]), ("Replay task", "todo", "medium"))
        self.request("SEC-09", "PATCH", f"/api/tasks/{self.task}", expected=200,
                     json={"status": "done", "priority": "urgent", "due_date": "2026-09-30T14:30:00"})

    def test_sec10_assignees_must_be_members(self):
        path = f"/api/projects/{self.project}/tasks"
        for assignee in (self.users["outsider"]["id"], 2147483647):
            response = self.request("SEC-10", "POST", path, expected=404, json={**self.task_body, "assignee_id": assignee})
            self.assertEqual(response.get_json(), {"error": "resource not found"})
        self.assertEqual(len(self.db.get_tasks_by_project(self.project, 100, 0)), 1)
        for label in ("crown", "owner", "admin", "member", "guest", None):
            assignee = self.users[label]["id"] if label else None
            created = self.request("SEC-10", "POST", path, expected=201, json={**self.task_body, "assignee_id": assignee}).get_json()
            self.assertEqual(self.db.get_task_by_id(created["id"])[3], assignee)

    def test_sec12_absent_and_outsider_responses_are_identical(self):
        for missing_route, existing_route in zip(self.resource_routes(True), self.resource_routes()):
            responses = []
            for label, (method, path, body) in (("crown", missing_route), ("outsider", existing_route)):
                with self.subTest(label=label, method=method, path=path):
                    response = self.request("SEC-12", method, path, label=label, expected=404, json=body)
                    self.assertEqual(response.get_json(), {"error": "resource not found"})
                    responses.append(response.get_data())
            self.assertEqual(responses[0], responses[1])
        for method in ("PATCH", "DELETE"):
            response = self.request("SEC-12", method, self.member_path("outsider"), expected=404, json={"role": "member"})
            self.assertEqual(response.get_json(), {"error": "resource not found"})

    def test_sec12_invalid_sessions_on_all_protected_routes(self):
        routes = self.resource_routes() + (
            ("GET", "/api/workspaces", None), ("POST", "/api/workspaces", {"name": "New"}),
            ("GET", "/api/auth/me", None), ("POST", "/api/auth/logout", None),
        )
        for state in ("missing", "unknown", "expired", "revoked"):
            client = self.app.test_client()
            token = secrets.token_urlsafe(32)
            if state in ("expired", "revoked"):
                expires = datetime.now(timezone.utc) + timedelta(hours=-1 if state == "expired" else 1)
                self.db.create_session(self.users["crown"]["id"], token, expires)
                if state == "revoked":
                    with self.db.get_db_connection() as connection:
                        connection.execute("UPDATE sessions SET revoked = TRUE WHERE session_token = %s", (token,))
            if state != "missing":
                with client.session_transaction() as session:
                    session["session_token"] = token
            for method, path, body in routes:
                with self.subTest(session=state, method=method, path=path):
                    self.request("SEC-12", method, path, client=client, expected=401, json=body)

    def test_sec12_guest_read_only_and_crown_restrictions(self):
        for method, path, body in self.resource_routes():
            self.request("SEC-12", method, path, label="guest", expected=200 if method == "GET" else 403, json=body)
        for label in ("owner", "admin", "member", "guest"):
            self.request("SEC-12", "DELETE", f"/api/workspaces/{self.workspace}", label=label, expected=403)
            self.request("SEC-12", "PATCH", f"/api/workspaces/{self.workspace}/owner", label=label,
                         expected=403, json={"user_id": self.users["owner"]["id"]})
        for method in ("PATCH", "DELETE"):
            self.request("SEC-12", method, self.member_path("crown"), expected=403, json={"role": "member"})
        for method, path, body in (("POST", f"/api/workspaces/{self.workspace}/projects", {"name": "New"}),
                                   ("PATCH", f"/api/projects/{self.project}", {"name": "New"}),
                                   ("DELETE", f"/api/projects/{self.project}", None)):
            self.request("SEC-12", method, path, label="member", expected=403, json=body)
        created = self.request("SEC-12", "POST", f"/api/projects/{self.project}/tasks", label="member", expected=201, json=self.task_body).get_json()
        self.request("SEC-12", "PATCH", f"/api/tasks/{created['id']}", label="member", expected=200, json={"title": "Updated"})
        self.request("SEC-12", "DELETE", f"/api/tasks/{created['id']}", label="member", expected=200)
        self.request("SEC-12", "PATCH", f"/api/workspaces/{self.workspace}/owner", expected=200,
                     json={"user_id": self.users["owner"]["id"]})
        self.request("SEC-12", "DELETE", f"/api/workspaces/{self.workspace}", label="owner", expected=200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
