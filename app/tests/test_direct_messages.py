from datetime import datetime, timezone

def test_direct_message_requires_shared_workspace(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.direct_messages.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.direct_messages.get_user_by_id",
        lambda user_id: (
            user_id,
            "OtherUser",
            "other@example.com",
            "Other",
            None
        )
    )

    monkeypatch.setattr(
        "app.routes.direct_messages.users_share_workspace",
        lambda sender_id, receiver_id: False
    )

    response = client.post(
        "/api/users/3/direct_messages",
        json={
            "message": "Hello"
        }
    )

    assert response.status_code == 403
    assert response.get_json() == {"error": "Direct messages require a shared workspace."}


def test_user_can_send_direct_message(client, monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.routes.direct_messages.get_authenticated_user",
        lambda: (2, None)
    )

    def fake_get_user(user_id):
        if user_id == 2:
            return (
                2,
                "Auxance",
                "auxance@example.com",
                "Auxance",
                None
            )

        return (
            3,
            "OtherUser",
            "other@example.com",
            "Other",
            None
        )

    monkeypatch.setattr(
        "app.routes.direct_messages.get_user_by_id",
        fake_get_user
    )

    monkeypatch.setattr(
        "app.routes.direct_messages.users_share_workspace",
        lambda sender_id, receiver_id: True
    )

    monkeypatch.setattr(
        "app.routes.direct_messages.create_direct_message",
        lambda sender_id, receiver_id, message: (
            60,
            sender_id,
            receiver_id,
            message,
            now
        )
    )

    monkeypatch.setattr(
        "app.routes.direct_messages.publish_direct_message",
        lambda socketio, message: None
    )

    response = client.post(
        "/api/users/3/direct_messages",
        json={
            "message": "Hello DM"
        }
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["id"] == 60
    assert data["sender_id"] == 2
    assert data["receiver_id"] == 3
    assert data["message"] == "Hello DM"