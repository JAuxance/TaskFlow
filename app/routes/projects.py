from flask import Blueprint, request

from app.db import (
    create_project,
    get_projects_by_workspace,
    update_project_db,
    deleted_project,
)
from app.permissions import (
    get_authenticated_user,
    get_project_with_permission,
    get_workspace_with_permission,
    resource_not_found,
)

projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/api/workspaces/<int:workspace_id>/projects", methods=["POST"])
def projects(workspace_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_workspace_with_permission(
        workspace_id, user_id, ("owner", "admin")
    )
    if error:
        return error
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    name = data.get("name")
    description = data.get("description")
    if not name:
        return {"error": "name is required"}, 400
    project = create_project(workspace_id, name, description)
    return {
        "id": project[0],
        "workspace_id": project[1],
        "name": project[2],
        "description": project[3],
        "created_at": project[4].isoformat(),
    }, 201


@projects_bp.route("/api/workspaces/<int:workspace_id>/projects", methods=["GET"])
def get_projects(workspace_id):
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)

    offset = (page - 1) * limit
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_workspace_with_permission(workspace_id, user_id)
    if error:
        return error
    return [
        {
            "id": project[0],
            "workspace_id": project[1],
            "name": project[2],
            "description": project[3],
            "created_at": project[4].isoformat(),
        }
        for project in get_projects_by_workspace(workspace_id, limit, offset)
    ], 200


def _project_response(project):
    return {
        "id": project[0],
        "workspace_id": project[1],
        "name": project[2],
        "description": project[3],
        "created_at": project[4].isoformat(),
    }


def _project_with_permission(project_id, user_id, roles=None):
    return get_project_with_permission(project_id, user_id, roles)


@projects_bp.route("/api/projects/<int:project_id>", methods=["GET"])
def get_project_id(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    project, error = _project_with_permission(project_id, user_id)
    if error:
        return error
    return _project_response(project), 200


@projects_bp.route("/api/projects/<int:project_id>", methods=["PATCH"])
def update_project(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    project, error = _project_with_permission(project_id, user_id, ("owner", "admin"))
    if error:
        return error
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    name = data.get("name", project[2])
    description = data.get("description", project[3])
    if not name and not description:
        return {"error": "name or description is required"}, 400
    return _project_response(update_project_db(project_id, name, description)), 200


@projects_bp.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    project, error = _project_with_permission(project_id, user_id, ("owner", "admin"))
    if error:
        return error
    deleted_project_row = deleted_project(project[0])
    if not deleted_project_row:
        return resource_not_found()
    return {"message": "project deleted successfuly"}, 200
