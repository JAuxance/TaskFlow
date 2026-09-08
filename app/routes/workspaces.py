from flask import Blueprint, request, session
from psycopg.errors import UniqueViolation

from app.db import (
    add_workspace_member,
    create_workspace_with_owner,
    delet_workspace,
    get_user_by_email,
    get_workspace_by_id,
    get_workspace_member,
    get_workspace_members,
    get_workspaces_by_member,
    update_workspace,
)
from app.permissions import check_workspace_permission


workspaces_bp = Blueprint("workspaces", __name__)


@workspaces_bp.route("/api/workspaces", methods=["POST"])
def create_workspace_endpoint():
    user_id = session.get("user_id")
    data = request.get_json()
    if not user_id:
        return {"error": "No user found"}, 401
    if data is None:
        return {"error": "invalid JSON body"}, 400
    name = data.get("name")
    if not name:
        return {"error": "name is required"}, 400
    workspace = create_workspace_with_owner(user_id, name)
    return {
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat(),
    }, 201


@workspaces_bp.route("/api/workspaces", methods=["GET"])
def get_workspaces():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "No user found"}, 401
    workspaces = get_workspaces_by_member(user_id)
    return [
        {
            "id": workspace[0],
            "owner_id": workspace[1],
            "name": workspace[2],
            "created_at": workspace[3].isoformat(),
        }
        for workspace in workspaces
    ], 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>", methods=["GET"])
def get_workspaces_by_id_route(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    permission_error = check_workspace_permission(workspace[0], user_id)
    if permission_error:
        return permission_error
    return {
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat(),
    }, 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>", methods=["DELETE"])
def del_workspace(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    delet_workspace(workspace_id)
    return {"message": "workspace deleted successfuly"}, 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>", methods=["PATCH"])
def workspace_update(workspace_id):
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
    name = data.get("name")
    if not name:
        return {"error": "name is missing"}, 400
    edited_workspace = update_workspace(workspace_id, name)
    return {
        "id": edited_workspace[0],
        "owner_id": edited_workspace[1],
        "name": edited_workspace[2],
        "created_at": edited_workspace[3].isoformat(),
    }, 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>/members", methods=["POST"])
def add_member(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    current_member = get_workspace_member(workspace_id, user_id)
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    if not current_member:
        return {"error": "not a member of this workspace"}, 403
    if current_member[3] not in ("owner", "admin"):
        return {"error": "insufficient privileges"}, 403
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    member_email = data.get("email")
    role = data.get("role", "member")
    allowed_roles = ["owner", "admin", "member", "guest"]
    if role not in allowed_roles:
        return {"error": f"role must be one of {allowed_roles}"}, 400
    if not member_email:
        return {"error": "email is required"}, 400
    member = get_user_by_email(member_email)
    if not member:
        return {"error": "user not found"}, 404
    try:
        add_workspace_member(workspace_id, member[0], role)
    except UniqueViolation:
        return {"error": "user is already a member of this workspace"}, 409
    return {"message": f"User {member_email} added to workspace {workspace_id} as {role}"}, 201


@workspaces_bp.route("/api/workspaces/<int:workspace_id>/members", methods=["GET"])
def get_members(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    current_member = get_workspace_member(workspace_id, user_id)
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    if not current_member:
        return {"error": "not a member of this workspace"}, 403
    members = get_workspace_members(workspace_id)
    return [
        {
            "id": member[0],
            "workspace_id": member[1],
            "user_id": member[2],
            "role": member[3],
            "created_at": member[4].isoformat(),
        }
        for member in members
    ], 200