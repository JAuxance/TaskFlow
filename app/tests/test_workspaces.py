from datetime import datetime, timezone

def test_create_workspace_requires_authentication(client):
    response = client.post(
        "/api/workspaces",
        json={
            "name": "Test Workspace"
        }
    )

    assert response.status_code == 401
    assert response.get_json() == {
        "error": "token is missing"
    }

def test_member_cannot_update_workspace(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.workspaces.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_by_id",
        lambda workspace_id: (workspace_id, 1)
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_member",
        lambda workspace_id, user_id: (1, workspace_id, user_id, "member")
    )

    response = client.patch(
        "/api/workspaces/1",
        json={
            "name": "New name"
        }
    )

    assert response.status_code == 403
    assert response.get_json() == {"error": "insufficient privileges"}

def test_admin_can_update_workspace(client, monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.routes.workspaces.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_by_id",
        lambda workspace_id: (
            workspace_id,
            1,
            "Old name",
            now,
            "emoji",
            "📁",
            "blue"
        )
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_member",
        lambda workspace_id, user_id: (
            1,
            workspace_id,
            user_id,
            "admin"
        )
    )

    monkeypatch.setattr(
        "app.routes.workspaces.update_workspace",
        lambda workspace_id, name: (
            workspace_id,
            1,
            name,
            now,
            "emoji",
            "📁",
            "blue"
        )
    )

    response = client.patch(
        "/api/workspaces/1",
        json={
            "name": "New name"
        }
    )

    assert response.status_code == 200
    data = response.get_json()

    assert data["id"] == 1
    assert data["name"] == "New name"
    assert data["owner_id"] == 1