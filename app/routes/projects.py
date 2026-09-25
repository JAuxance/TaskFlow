from flask import Blueprint

from app.db import (
    create_project,
    get_projects_by_workspace,
    update_project_db,
    delete_project_db,
)
from app.permissions import (
    get_authenticated_user,
    get_project_with_permission,
    get_workspace_with_permission,
    resource_not_found,
)
from app.validation import get_json_object, get_pagination, is_valid_text

projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/api/workspaces/<int:workspace_id>/projects", methods=["POST"])
def projects(workspace_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_workspace_with_permission(workspace_id, user_id, ("owner", "admin"))
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    name = data.get("name")
    description = data.get("description")
    if not name:
        return {"error": "name is required"}, 400
    if not is_valid_text(name, allow_empty=False, max_length=50):
        return {"error": "invalid name"}, 400
    if (
        "description" in data
        and description is not None
        and not is_valid_text(description)
    ):
        return {"error": "invalid description"}, 400
    project = create_project(workspace_id, name, description)
    return _project_response(project), 201


@projects_bp.route("/api/workspaces/<int:workspace_id>/projects", methods=["GET"])
def get_projects(workspace_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_workspace_with_permission(workspace_id, user_id)
    if error:
        return error
    pagination, error = get_pagination()
    if error:
        return error
    limit, offset = pagination
    return [
        _project_response(project)
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


@projects_bp.route("/api/projects/<int:project_id>", methods=["GET"])
def get_project_id(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    project, error = get_project_with_permission(project_id, user_id)
    if error:
        return error
    return _project_response(project), 200


@projects_bp.route("/api/projects/<int:project_id>", methods=["PATCH"])
def update_project(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    project, error = get_project_with_permission(
        project_id, user_id, ("owner", "admin")
    )
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    name = data.get("name", project[2])
    description = data.get("description", project[3])
    if "name" in data and not is_valid_text(name, allow_empty=False, max_length=50):
        return {"error": "invalid name"}, 400
    if (
        "description" in data
        and description is not None
        and not is_valid_text(description)
    ):
        return {"error": "invalid description"}, 400
    if not name and not description:
        return {"error": "name or description is required"}, 400
    updated_project = update_project_db(project_id, name, description)
    if not updated_project:
        return resource_not_found()
    return _project_response(updated_project), 200


@projects_bp.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    project, error = get_project_with_permission(
        project_id, user_id, ("owner", "admin")
    )
    if error:
        return error
    deleted_project_row = delete_project_db(project[0])
    if not deleted_project_row:
        return resource_not_found()
    return {"message": "project deleted successfuly"}, 200
