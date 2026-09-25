from datetime import datetime

from flask import Blueprint
from psycopg import DataError

from app.db import (
    create_task,
    delete_task,
    get_tasks_by_project,
    get_user_by_id,
    update_task_db,
)
from app.permissions import (
    check_workspace_permission,
    get_authenticated_user,
    get_project_with_permission,
    get_task_with_permission,
    resource_not_found,
)
from app.validation import get_json_object, get_pagination, is_valid_id, is_valid_text

tasks_bp = Blueprint("tasks", __name__)


def _validate_task_fields(data, *, partial=False):
    allowed_colors = ["gray", "blue", "green", "yellow", "orange", "red", "purple"]
    if not partial or "title" in data:
        if not is_valid_text(data.get("title"), allow_empty=False, max_length=100):
            return {"error": "invalid title value"}, 400
    if not partial or "status" in data:
        if data.get("status") not in ("todo", "in_progress", "review", "done"):
            return {"error": "invalid status value"}, 400
    if not partial or "priority" in data:
        priority = data.get("priority")
        if priority not in ("low", "medium", "high", "urgent"):
            return {"error": "invalid priority value"}, 400
    if "color" in data:
        if data["color"] not in allowed_colors:
            return {"error": "invalid color value"}, 400
    if "description" in data and data["description"] is not None:
        if not is_valid_text(data["description"]):
            return {"error": "invalid description value"}, 400
    if "due_date" in data and data["due_date"] is not None:
        if not is_valid_text(data["due_date"]):
            return {"error": "invalid due_date value"}, 400
        try:
            datetime.fromisoformat(data["due_date"])
        except ValueError:
            return {"error": "invalid due_date value"}, 400
    return None


def _task_response(task):
    return {
        "id": task[0],
        "project_id": task[1],
        "creator_id": task[2],
        "assignee_id": task[3],
        "title": task[4],
        "description": task[5],
        "status": task[6],
        "priority": task[7],
        "due_date": task[8].isoformat() if task[8] else None,
        "color": task[9],
    }


@tasks_bp.route("/api/projects/<int:project_id>/tasks", methods=["POST"])
def create_task_route(project_id):

    user_id, error = get_authenticated_user()
    if error:
        return error

    project, error = get_project_with_permission(
        project_id, user_id, ("owner", "admin", "member")
    )
    if error:
        return error

    data, error = get_json_object()
    if error:
        return error
    target_user_id = data.get("assignee_id")
    if target_user_id is not None and not is_valid_id(target_user_id):
        return {"error": "invalid assignee_id value"}, 400
    if target_user_id:
        if not get_user_by_id(target_user_id):
            return resource_not_found()
        error = check_workspace_permission(project[1], target_user_id)
        if error:
            return error
    if "color" not in data:
        data["color"] = "gray"
    error = _validate_task_fields(data)
    if error:
        return error
    try:
        task = create_task(
            project_id,
            user_id,
            target_user_id,
            data["title"],
            data.get("description"),
            data["status"],
            data["priority"],
            data.get("color"),
            data.get("due_date"),
        )
    except DataError:
        return {"error": "invalid due_date value"}, 400
    return _task_response(task), 201


@tasks_bp.route("/api/projects/<int:project_id>/tasks", methods=["GET"])
def get_tasks_route(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_project_with_permission(project_id, user_id)
    if error:
        return error
    pagination, error = get_pagination()
    if error:
        return error
    limit, offset = pagination
    tasks = get_tasks_by_project(project_id, limit, offset)
    response = [_task_response(task) for task in tasks]

    return response, 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task_route(task_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    task, error = get_task_with_permission(task_id, user_id)
    if error:
        return error
    return _task_response(task), 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task_route(task_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    task, error = get_task_with_permission(
        task_id, user_id, ("owner", "admin", "member")
    )
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    error = _validate_task_fields(data, partial=True)
    if error:
        return error
    assignee_id = data.get("assignee_id", task[3])
    if "assignee_id" in data and assignee_id is not None:
        if not is_valid_id(assignee_id):
            return {"error": "invalid assignee_id value"}, 400
        _, error = get_project_with_permission(task[1], assignee_id)
        if error:
            return error
    try:
        updated_task = update_task_db(
            task_id,
            data.get("title", task[4]),
            data.get("description", task[5]),
            data.get("status", task[6]),
            data.get("priority", task[7]),
            data.get("due_date", task[8].isoformat() if task[8] else None),
            assignee_id=assignee_id,
            color=data.get("color", task[9]),
        )
    except DataError:
        return {"error": "invalid due_date value"}, 400
    if not updated_task:
        return resource_not_found()
    return _task_response(updated_task), 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task_route(task_id):
    user_id, error = get_authenticated_user()

    if error:
        return error

    task, error = get_task_with_permission(
        task_id,
        user_id,
        ("owner", "admin", "member"),
    )

    if error:
        return error

    if not delete_task(task_id):
        return resource_not_found()

    return {"message": "task deleted successfully"}, 200
