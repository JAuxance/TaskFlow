from flask import Blueprint, request, session

from app.db import (
    create_project,
    get_project_by_id,
    get_projects_by_workspace,
    get_workspace_by_id,
    update_project_db,
    deleted_project,
)
from app.permissions import check_workspace_permission


projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/api/workspaces/<int:workspace_id>/projects", methods=["POST"])
def projects(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    permission_error = check_workspace_permission(workspace[0], user_id, ("owner", "admin"))
    if permission_error:
        return permission_error
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
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    permission_error = check_workspace_permission(workspace[0], user_id)
    if permission_error:
        return permission_error
    return [
        {
            "id": project[0],
            "workspace_id": project[1],
            "name": project[2],
            "description": project[3],
            "created_at": project[4].isoformat(),
        }
        for project in get_projects_by_workspace(workspace_id)
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
    project = get_project_by_id(project_id)
    if not project:
        return None, ({"error": "project not found"}, 404)
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return None, ({"error": "workspace not found"}, 404)
    permission_error = check_workspace_permission(workspace[0], user_id, roles)
    if permission_error:
        return None, permission_error
    return project, None


@projects_bp.route("/api/projects/<int:project_id>", methods=["GET"])
def get_project_id(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project, error = _project_with_permission(project_id, user_id)
    if error:
        return error
    return _project_response(project), 200


@projects_bp.route("/api/projects/<int:project_id>", methods=["PATCH"])
def update_project(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
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
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project, error = _project_with_permission(project_id, user_id, ("owner", "admin"))
    if error:
        return error
    deleted_project_row = deleted_project(project[0])
    if not deleted_project_row:
        return {"error": "project not found"}, 404
    return {"message": "project deleted successfuly"}, 200

