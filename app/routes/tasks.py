from flask import Blueprint, request
from datetime import datetime
from app.db import (
    create_task,
    delete_task,
    get_task_by_id,
    get_tasks_by_project,
    get_user_by_id,
    get_workspace_member,
    update_task_db,
)
from app.permissions import (
    get_authenticated_user,
    get_project_with_permission,
    resource_not_found,
)

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
        return None, resource_not_found()
    _, error = get_project_with_permission(task[1], user_id, roles)
    if error:
        return None, error

    return task, None


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
    
    data = request.get_json()
    if not isinstance(data, dict)or not data:
        return {"error": "invalid JSON body"}, 400
    target_user_id = data.get("assignee_id")
    if target_user_id:
        if not get_user_by_id(target_user_id):
            return {"error": "assignee not found"}, 404
        workspace_member = get_workspace_member(project[1], target_user_id)

        if not workspace_member:
            return {"error": "user is not a member of this workspace"}, 403
    
    title = data.get("title")
    if not isinstance(title, str) or not title.strip() or len(title) > 100:
        return {"error": "invalid title value"}, 400
    
    status = data.get("status")
    if status not in ("todo", "in_progress", "review", "done"):
        return {"error": "invalid status value"}, 400
    
    priority = data.get("priority")
    if priority not in ("low", "medium", "high", "urgent"):
        return {"error": "invalid priority value"}, 400

    due_date = data.get("due_date")
    if due_date is not None:
        if not isinstance(due_date, str):
            return {"error": "invalid due_date value"}, 400
        try:
            datetime.fromisoformat(due_date)
        except ValueError:
            return {"error": "invalid due_date value"}, 400
    
    if not title:
        return {"error": "title is required"}, 400
    if not status:
        return {"error": "status is required"}, 400
    if not priority:
        return {"error": "priority is required"}, 400
    task = create_task(
        project_id,
        user_id,
        target_user_id,
        title,
        data.get("description"),
        status,
        priority,
        data.get("due_date"),
    )
    return _task_response(task), 201


@tasks_bp.route("/api/projects/<int:project_id>/tasks", methods=["GET"])
def get_tasks_route(project_id):
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)

    offset = (page - 1) * limit
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_project_with_permission(project_id, user_id)
    if error:
        return error
    tasks = get_tasks_by_project(project_id, limit, offset)
    response = [_task_response(task) for task in tasks]

    return response, 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task_route(task_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    task, error = _task_with_permission(task_id, user_id)
    if error:
        return error
    return _task_response(task), 200


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task_route(task_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
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
    user_id, error = get_authenticated_user()

    if error:
        return error

    task, error = _task_with_permission(
        task_id,
        user_id,
        ("owner", "admin", "member"),
    )

    if error:
        return error

    if not delete_task(task_id):
        return resource_not_found()

    return {"message": "task deleted successfully"}, 200
