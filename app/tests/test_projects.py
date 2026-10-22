from datetime import datetime, timezone

def test_member_cannot_create_project(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.projects.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_by_id",
        lambda workspace_id: (workspace_id, 1)
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_member",
        lambda workspace_id, user_id: (
            1,
            workspace_id,
            user_id,
            "member"
        )
    )

    response = client.post(
        "/api/workspaces/1/projects",
        json={
            "name": "My project",
            "description": "Test"
        }
    )

    assert response.status_code == 403
    assert response.get_json() == {"error": "insufficient privileges"}

def test_admin_can_create_project(client, monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.routes.projects.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_by_id",
        lambda workspace_id: (
            workspace_id,
            1,
            "Workspace",
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
        "app.routes.projects.create_project",
        lambda workspace_id, name, description: (
            10,
            workspace_id,
            name,
            description,
            now
        )
    )

    response = client.post(
        "/api/workspaces/1/projects",
        json={
            "name": "My project",
            "description": "Test project"
        }
    )

    assert response.status_code == 201
    data = response.get_json()

    assert data["id"] == 10
    assert data["workspace_id"] == 1
    assert data["name"] == "My project"

def test_user_cannot_access_project_outside_workspace(client, monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.routes.projects.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.permissions.get_project_by_id",
        lambda project_id: (
            project_id,
            1,
            "Private project",
            "Description",
            now
        )
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_by_id",
        lambda workspace_id: (
            workspace_id,
            1,
            "Workspace",
            now,
            "emoji",
            "📁",
            "blue"
        )
    )

    monkeypatch.setattr(
        "app.permissions.get_workspace_member",
        lambda workspace_id, user_id: None
    )

    response = client.get("/api/projects/10")

    assert response.status_code == 404
    assert response.get_json() == {"error": "resource not found"}