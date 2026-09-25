from datetime import datetime, timezone

def test_non_member_cannot_send_workspace_message(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.workspaces.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.workspaces.get_workspace_with_permission",
        lambda workspace_id, user_id: (
            None,
            ({"error": "resource not found"}, 404)
        )
    )

    response = client.post(
        "/api/workspaces/1/messages",
        json={
            "message": "Hello"
        }
    )
    assert response.status_code ==  404
    assert response.get_json() == {"error": "resource not found"}

def test_member_can_send_workspace_message(client, monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.routes.workspaces.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.workspaces.get_workspace_with_permission",
        lambda workspace_id, user_id: (
            (workspace_id, 1, "Workspace", now, "emoji", "📁", "blue"),
            None
        )
    )

    monkeypatch.setattr(
        "app.routes.workspaces.get_user_by_id",
        lambda user_id: (
            user_id,
            "Auxance",
            "auxance@example.com",
            "Auxance",
            None
        )
    )

    monkeypatch.setattr(
        "app.routes.workspaces.create_workspace_message",
        lambda workspace_id, user_id, message: (
            50,
            workspace_id,
            user_id,
            message,
            now
        )
    )

    monkeypatch.setattr(
        "app.routes.workspaces.socketio.emit",
        lambda *args, **kwargs: None
    )

    response = client.post(
        "/api/workspaces/1/messages",
        json={
            "message": "Hello workspace"
        }
    )

    assert response.status_code == 201

    data = response.get_json()

    assert data["id"] == 50
    assert data["message"] == "Hello workspace"
    assert data["author"]["username"] == "Auxance"