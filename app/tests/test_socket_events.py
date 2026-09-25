from datetime import datetime, timedelta, timezone

import pytest

from app.extensions import socketio


@pytest.mark.parametrize("is_member", [True, False])
def test_workspace_subscription_checks_membership(app, client, monkeypatch, is_member):
    with client.session_transaction() as session:
        session["session_token"] = "workspace-test-token"

    monkeypatch.setattr(
        "app.permissions.get_session_by_token",
        lambda token: (
            1,
            2,
            token,
            datetime.now(timezone.utc),
            datetime.now(timezone.utc) + timedelta(hours=1),
            False,
        ),
    )
    monkeypatch.setattr(
        "app.permissions.get_workspace_by_id", lambda workspace_id: (workspace_id, 1)
    )
    monkeypatch.setattr(
        "app.permissions.get_workspace_member",
        lambda workspace_id, user_id: (
            (1, workspace_id, user_id, "member") if is_member else None
        ),
    )

    connection = socketio.test_client(app, flask_test_client=client)
    try:
        connection.emit("join_workspace", {"workspace_id": 10})
        events = connection.get_received()
        if is_member:
            assert events[0]["name"] == "workspace_joined"
            assert events[0]["args"] == [{"workspace_id": 10}]
        else:
            assert events[0]["name"] == "socket_error"
            assert events[0]["args"] == [{"message": "workspace access denied"}]

        socketio.emit("new_message", {"id": 42}, to="workspace_10")
        delivered = connection.get_received()
        assert [event["name"] for event in delivered] == (
            ["new_message"] if is_member else []
        )
    finally:
        connection.disconnect()


def test_workspace_subscription_requires_authentication(app, client):
    connection = socketio.test_client(app, flask_test_client=client)
    try:
        connection.emit("join_workspace", {"workspace_id": 10})
        events = connection.get_received()
        assert events[0]["name"] == "socket_error"
        assert events[0]["args"] == [{"message": "unauthorized"}]
    finally:
        connection.disconnect()
