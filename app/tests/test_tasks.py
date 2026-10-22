def test_guest_cannot_create_task(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.tasks.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.tasks.get_project_with_permission",
        lambda project_id, user_id, roles: (
            None,
            ({"error": "insufficient privileges"}, 403)
        )
    )

    response = client.post(
        "/api/projects/10/tasks",
        json={
            "title": "Test task",
            "status": "todo",
            "priority": "medium"
        }
    )

    assert response.status_code == 403
    assert response.get_json() == {"error": "insufficient privileges"}

def test_member_can_create_task(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.tasks.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.tasks.get_project_with_permission",
        lambda project_id, user_id, roles: (
            (project_id, 1, "Project", "Description", None),
            None
        )
    )

    monkeypatch.setattr(
        "app.routes.tasks.create_task",
        lambda project_id, creator_id, assignee_id, title, description, status, priority, color, due_date: (
            20,
            project_id,
            creator_id,
            assignee_id,
            title,
            description,
            status,
            priority,
            None,
            color
        )
    )

    response = client.post(
        "/api/projects/10/tasks",
        json={
            "title": "Test task",
            "status": "todo",
            "priority": "medium"
        }
    )

    assert response.status_code == 201
    data = response.get_json()

    assert data["id"] == 20
    assert data["title"] == "Test task"
    assert data["color"] == "gray"


def test_create_task_rejects_invalid_status(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.tasks.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.tasks.get_project_with_permission",
        lambda project_id, user_id, roles: (
            (project_id, 1, "Project", "Description", None),
            None
        )
    )

    response = client.post(
        "/api/projects/10/tasks",
        json={
            "title": "Test task",
            "status": "finished",
            "priority": "medium"
        }
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "invalid status value"}

def test_member_can_update_task(client, monkeypatch):
    fake_task = (
        20,          # id
        10,          # project_id
        2,           # creator_id
        None,        # assignee_id
        "Test task", # title
        None,        # description
        "todo",      # status
        "medium",    # priority
        None,        # due_date
        "gray"       # color
    )

    monkeypatch.setattr(
        "app.routes.tasks.get_authenticated_user",
        lambda: (2, None)
    )

    monkeypatch.setattr(
        "app.routes.tasks.get_task_with_permission",
        lambda task_id, user_id, roles: (fake_task, None)
    )

    monkeypatch.setattr(
        "app.routes.tasks.update_task_db",
        lambda *args, **kwargs: (
            20,
            10,
            2,
            None,
            "Test task",
            None,
            "done",
            "medium",
            None,
            "gray"
        )
    )

    response = client.patch(
        "/api/tasks/20",
        json={
            "status": "done"
        }
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "done"