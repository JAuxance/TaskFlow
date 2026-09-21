"""Integration tests against an isolated, temporary PostgreSQL server."""
from pathlib import Path
from tempfile import mkdtemp
import unittest
from unittest.mock import patch

import pgserver
import psycopg
from engineio.socket import Socket

from app.app import app
from app.extensions import limiter, socketio


class DirectMessagesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = pgserver.get_server(mkdtemp(prefix="taskflow-dm-test-"), cleanup_mode="delete")
        cls.connect = staticmethod(lambda: psycopg.connect(cls.server.get_uri()))
        cls.db_patch = patch("app.db.get_db_connection", cls.connect)
        cls.db_patch.start()
        app.config.update(TESTING=True, SECRET_KEY="isolated-test-key", SESSION_COOKIE_SECURE=False)
        limiter.enabled = False
        with cls.connect() as conn:
            conn.execute(Path("app/sql/01-init.sql").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.db_patch.stop()
        cls.server.cleanup()

    def setUp(self):
        self.sockets = []
        with self.connect() as conn:
            conn.execute("TRUNCATE users RESTART IDENTITY CASCADE")
            for name in ("Alice", "Bob", "Charlie", "Outsider"):
                conn.execute("INSERT INTO users (username, email, password_hash) VALUES (%s, %s, 'unused')", (name, f"{name.lower()}@example.com"))
            conn.execute("INSERT INTO workspaces (id, owner_id, name) VALUES (1, 1, 'Team')")
            conn.execute("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (1, 1, 'owner'), (1, 2, 'member'), (1, 3, 'guest')")
            for user_id in range(1, 5):
                conn.execute("INSERT INTO sessions (user_id, session_token, expires_at) VALUES (%s, %s, NOW() + interval '1 day')", (user_id, f"test-{user_id}"))
        self.clients = {i: app.test_client() for i in range(1, 5)}
        for user_id, client in self.clients.items():
            with client.session_transaction() as session:
                session["session_token"] = f"test-{user_id}"

    def tearDown(self):
        for client in self.sockets:
            if client.is_connected():
                client.disconnect()
            socketio.server.eio.sockets.pop(client.eio_sid, None)

    def endpoint(self, receiver=2):
        return f"/api/users/{receiver}/direct_messages"

    def send(self, sender=1, receiver=2, message="Bonjour"):
        return self.clients[sender].post(self.endpoint(receiver), json={"message": message})

    def socket(self, user_id=None, other=None):
        client = socketio.test_client(app, flask_test_client=self.clients.get(user_id))
        # Flask-SocketIO's in-process client bypasses Engine.IO's session store.
        socketio.server.eio.sockets[client.eio_sid] = Socket(socketio.server.eio, client.eio_sid)
        self.sockets.append(client)
        if other is not None:
            client.emit("join_direct_message", {"user_id": other})
        return client

    def test_registered_route_requires_authentication(self):
        client = app.test_client()
        for method in (client.get, client.post):
            self.assertEqual(method(self.endpoint()).status_code, 401)

    def test_migration_handles_existing_databases_and_can_be_repeated(self):
        migration = Path("app/sql/migrations/20260920-direct-messages.sql").read_text()
        with self.connect() as conn:
            conn.execute("DROP TABLE direct_messages")
            conn.execute("CREATE ROLE taskflow_app NOLOGIN")
        for _ in range(2):
            with self.connect() as conn:
                conn.execute(migration)
        with self.connect() as conn:
            self.assertTrue(conn.execute("SELECT has_table_privilege('taskflow_app', 'direct_messages', 'INSERT')").fetchone()[0])
            self.assertTrue(conn.execute("SELECT has_sequence_privilege('taskflow_app', 'direct_messages_id_seq', 'USAGE')").fetchone()[0])
        self.assertEqual(self.send().status_code, 201)

    def test_round_trip_history_both_directions_and_author(self):
        sent = self.send(message="  Bonjour 👋\nBob  ")
        self.assertEqual(sent.status_code, 201)
        self.assertEqual(sent.json["message"], "Bonjour 👋\nBob")
        self.assertEqual(sent.json["author"]["username"], "Alice")
        reply = self.send(2, 1, "Salut Alice")
        self.assertEqual(reply.status_code, 201)
        for sender, receiver in ((1, 2), (2, 1)):
            history = self.clients[sender].get(self.endpoint(receiver))
            self.assertEqual(history.status_code, 200)
            self.assertEqual(history.json, [reply.json, sent.json])

    def test_content_validation(self):
        for body in (None, [], {}, {"message": None}, {"message": 8}, {"message": " "}, {"message": "x" * 2001}, {"message": "a\x00b"}, {"message": "\ud800"}):
            with self.subTest(body=repr(body)[:60]):
                response = self.clients[1].post(self.endpoint(), json=body)
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json)
        self.assertEqual(self.send(message="x" * 2000).status_code, 201)

    def test_access_restrictions(self):
        for receiver, status in ((1, 400), (4, 403), (999, 404), (0, 400), (2**40, 400)):
            for method in (self.clients[1].get, self.clients[1].post):
                with self.subTest(receiver=receiver):
                    self.assertEqual(method(self.endpoint(receiver), json={"message": "secret"}).status_code, status)

    def test_history_is_paginated_and_excludes_other_conversations(self):
        ids = [self.send(message=f"message {i}").json["id"] for i in range(5)]
        self.send(1, 3, "different conversation")
        for page, expected in ((1, ids[-2:][::-1]), (2, ids[1:3][::-1]), (3, ids[:1]), (4, [])):
            response = self.clients[1].get(f"{self.endpoint()}?limit=2&page={page}")
            self.assertEqual([row["id"] for row in response.json], expected)
        self.assertEqual(self.clients[3].get(self.endpoint()).json, [])
        for query in ("limit=0", "limit=101", "page=0", "page=no", "limit=no"):
            self.assertEqual(self.clients[1].get(f"{self.endpoint()}?{query}").status_code, 400)

    def test_socket_rejects_malformed_and_unauthorized_joins(self):
        client = self.socket(1)
        for payload in (None, [], "bad", {}, {"user_id": True}, {"user_id": 0}, {"user_id": -1}, {"user_id": 2**40}, {"user_id": "2"}, {"user_id": 1}, {"user_id": 4}, {"user_id": 999}):
            with self.subTest(payload=payload):
                client.emit("join_direct_message", payload)
                self.assertEqual([event["name"] for event in client.get_received()], ["socket_error"])
        anonymous = self.socket(other=1)
        self.assertEqual(anonymous.get_received()[0]["args"][0]["message"], "unauthorized")

    def test_live_messages_only_reach_conversation_participants(self):
        alice = self.socket(1, 2)
        bob = self.socket(2, 1)
        charlie = self.socket(3, 1)
        outsider = self.socket(4, 1)
        for client in (alice, bob, charlie, outsider):
            client.get_received()
        sent = self.send()
        self.assertEqual(sent.status_code, 201)
        for client in (alice, bob):
            events = client.get_received()
            self.assertEqual([e["name"] for e in events], ["new_direct_message"])
            self.assertEqual(events[0]["args"][0], sent.json)
        self.assertEqual(charlie.get_received(), [])
        self.assertEqual(outsider.get_received(), [])

    def test_revoked_and_expired_sessions_cannot_receive_live_messages(self):
        for update in ("revoked = TRUE", "expires_at = NOW() - interval '1 minute'"):
            with self.subTest(update=update):
                with self.connect() as conn:
                    conn.execute("UPDATE sessions SET revoked = FALSE, expires_at = NOW() + interval '1 day' WHERE user_id = 2")
                bob = self.socket(2, 1)
                bob.get_received()
                with self.connect() as conn:
                    conn.execute(f"UPDATE sessions SET {update} WHERE user_id = 2")
                self.assertEqual(self.send().status_code, 201)
                self.assertEqual([e["name"] for e in bob.get_received()], ["socket_error"])
                self.assertEqual(self.clients[2].get(self.endpoint(1)).status_code, 401)
                self.assertEqual(self.send(2, 1).status_code, 401)
                bob.disconnect()

    def test_removing_shared_workspace_revokes_conversation_access(self):
        bob = self.socket(2, 1)
        bob.get_received()
        with self.connect() as conn:
            conn.execute("DELETE FROM workspace_members WHERE user_id = 2")
        self.assertEqual(self.send().status_code, 403)
        self.assertEqual(self.clients[2].get(self.endpoint(1)).status_code, 403)
        self.assertEqual(bob.get_received(), [])


if __name__ == "__main__":
    unittest.main()
