from flask import Blueprint, request, session

from app.db import (
    create_task,
    delete_task,
    get_project_by_id,
    get_task_by_id,
    get_tasks_by_project,
    get_user_by_id,
    get_workspace_by_id,
    update_task_db,
)
from app.permissions import check_workspace_permission

tasks_bp = Blueprint("tasks", __name__)


def _task_response(task):
    if len(task) == 7:
        title_index, description_index = 2, 3
        status_index, priority_index, due_date_index = 4, 5, 6
    else:
        title_index, description_index = 4, 5
        status_index, priority_index, due_date_index = 6, 7, 8
    return {
        "id": task[0],
        "project_id": task[1],
        "title": task[title_index],
        "description": task[description_index],
        "status": task[status_index],
        "priority": task[priority_index],
        "due_date": task[due_date_index].isoformat() if task[due_date_index] else None,
    }


def _task_with_permission(task_id, user_id, roles=None):
    task = get_task_by_id(task_id)
    if not task:
        return None, ({"error": "task not found"}, 404)
    project = get_project_by_id(task[1])
    if not project:
        return None, ({"error": "project not found"}, 404)
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return None, ({"error": "workspace not found"}, 404)
    permission_error = check_workspace_permission(workspace[0], user_id, roles)
    if permission_error:
        return None, permission_error
    return task, None


@tasks_bp.route("/api/projects/<int:project_id>/tasks", methods=["POST"])
def create_task_route(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    permission_error = check_workspace_permission(
        workspace[0], user_id, ("owner", "admin", "member")
    )
    if permission_error:
        return permission_error
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    title = data.get("title")
    status = data.get("status")
    priority = data.get("priority")
    if not title:
        return {"error": "title is required"}, 400
    if not status:
        return {"error": "status is required"}, 400
    if not priority:
        return {"error": "priority is required"}, 400
    assignee_id = data.get("assignee_id")
    if assignee_id and not get_user_by_id(assignee_id):
        return {"error": "assignee not found"}, 404
    task = create_task(
        project_id,
        user_id,
        assignee_id,
        title,
        data.get("description"),
        status,
        priority,
        data.get("due_date"),
    )
    return _task_response(task), 201


@tasks_bp.route("/api/projects/<int:project_id>/tasks", methods=["GET"])
def get_tasks_route(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    permission_error = check_workspace_permission(workspace[0], user_id)
    if permission_error:
        return permission_error
    tasks = get_tasks_by_project(project_id)
    response = [_task_response(task) for task in tasks]

    return response, 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task_route(task_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    task, error = _task_with_permission(task_id, user_id)
    if error:
        return error
    return _task_response(task), 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task_route(task_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    task, error = _task_with_permission(task_id, user_id, ("owner", "admin", "member"))
    if error:
        return error
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    updated_task = update_task_db(
        task_id,
        data.get("title", task[4]),
        data.get("description", task[5]),
        data.get("status", task[6]),
        data.get("priority", task[7]),
        data.get("due_date", task[8].isoformat() if task[8] else None),
    )
    return _task_response(updated_task), 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task_route(task_id):
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "user_id Missing"}, 401

    task, error = _task_with_permission(
        task_id,
        user_id,
        ("owner", "admin", "member"),
    )

    if error:
        return error

    if not delete_task(task_id):
        return {"error": "task not found"}, 404

    return {"message": "task deleted successfully"}, 200
