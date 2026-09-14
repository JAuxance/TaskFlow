from flask import Blueprint
from psycopg.errors import UniqueViolation

from app.db import (
    add_workspace_member,
    create_workspace_with_owner,
    delet_workspace,
    get_user_by_email,
    get_workspace_member,
    get_workspace_members,
    get_workspaces_by_member,
    update_workspace,
    update_role_member,
    delete_member_db,
    crowned_king,
)
from app.permissions import (
    check_workspace_permission,
    get_authenticated_user,
    get_workspace_with_permission,
    insufficient_privileges,
    resource_not_found,
)
from app.validation import get_json_object, get_pagination, is_valid_id, is_valid_text

workspaces_bp = Blueprint("workspaces", __name__)


@workspaces_bp.route("/api/workspaces", methods=["POST"])
def create_workspace_endpoint():
    user_id, error = get_authenticated_user()
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    name = data.get("name")
    if not name:
        return {"error": "name is required"}, 400
    if not is_valid_text(name, allow_empty=False, max_length=50):
        return {"error": "invalid name"}, 400
    workspace = create_workspace_with_owner(user_id, name)
    return {
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat(),
    }, 201


@workspaces_bp.route("/api/workspaces", methods=["GET"])
def get_workspaces():
    user_id, error = get_authenticated_user()
    if error:
        return error
    pagination, error = get_pagination()
    if error:
        return error
    limit, offset = pagination
    workspaces = get_workspaces_by_member(user_id, limit, offset)
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
    user_id, error = get_authenticated_user()
    if error:
        return error
    workspace, error = get_workspace_with_permission(workspace_id, user_id)
    if error:
        return error
    return {
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat(),
    }, 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>", methods=["DELETE"])
def del_workspace(workspace_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_workspace_with_permission(
        workspace_id, user_id, require_owner=True
    )
    if error:
        return error
    if not delet_workspace(workspace_id):
        return resource_not_found()
    return {"message": "workspace deleted successfuly"}, 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>", methods=["PATCH"])
def workspace_update(workspace_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    _, error = get_workspace_with_permission(
        workspace_id, user_id, ("owner", "admin")
    )
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    name = data.get("name")
    if not name:
        return {"error": "name is missing"}, 400
    if not is_valid_text(name, allow_empty=False, max_length=50):
        return {"error": "invalid name"}, 400
    edited_workspace = update_workspace(workspace_id, name)
    if not edited_workspace:
        return resource_not_found()
    return {
        "id": edited_workspace[0],
        "owner_id": edited_workspace[1],
        "name": edited_workspace[2],
        "created_at": edited_workspace[3].isoformat(),
    }, 200


@workspaces_bp.route("/api/workspaces/<int:workspace_id>/members", methods=["POST"])
def add_member(workspace_id):
    user_id, error = get_authenticated_user()
    if error:
        return error
    workspace, error = get_workspace_with_permission(
        workspace_id, user_id, ("owner", "admin")
    )
    if error:
        return error
    current_member = get_workspace_member(workspace_id, user_id)
    data, error = get_json_object()
    if error:
        return error
    member_email = data.get("email")
    role = data.get("role", "member")
    allowed_roles = ["owner", "admin", "member", "guest"]
    if not isinstance(role, str) or role not in allowed_roles:
        return {"error": f"role must be one of {allowed_roles}"}, 400
    if not member_email:
        return {"error": "email is required"}, 400
    if not is_valid_text(member_email, allow_empty=False, max_length=255):
        return {"error": "invalid email"}, 400
    member = get_user_by_email(member_email)
    if not member:
        return resource_not_found()
    current_member_role = current_member[3]
    if current_member_role == "admin" and role in ("owner", "admin"):
        return insufficient_privileges()
    if user_id != workspace[1] and role == "owner":
        return insufficient_privileges()
    try:
        add_workspace_member(workspace_id, member[0], role)
    except UniqueViolation:
        return {"error": "user is already a member of this workspace"}, 409
    return {
        "message": f"User {member_email} added to workspace {workspace_id} as {role}"
    }, 201


@workspaces_bp.route("/api/workspaces/<int:workspace_id>/members", methods=["GET"])
def get_members(workspace_id):
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
    members = get_workspace_members(workspace_id, limit, offset)
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


@workspaces_bp.route(
    "/api/workspaces/<int:workspace_id>/members/<int:user_id>", methods=["PATCH"]
)
def update_member_role(workspace_id, user_id):
    current_user_id, error = get_authenticated_user()

    if error:
        return error

    workspace, error = get_workspace_with_permission(
        workspace_id, current_user_id, ("owner", "admin")
    )
    if error:
        return error
    target_member = get_workspace_member(workspace_id, user_id)
    if not target_member:
        return resource_not_found()
    if user_id == workspace[1]:
        return insufficient_privileges()
    data, error = get_json_object()
    if error:
        return error
    role = data.get("role")

    if not isinstance(role, str) or role not in ("admin", "owner", "member", "guest"):
        return {"error": "invalid role"}, 400

    current_member = get_workspace_member(workspace_id, current_user_id)
    current_member_role = current_member[3]

    if current_member_role == "admin" and role not in ("member", "guest"):
        return insufficient_privileges()

    if (
        current_member_role == "owner"
        and role == "owner"
        and current_user_id != workspace[1]
    ):
        return insufficient_privileges()

    if target_member[3] == "owner" and current_user_id != workspace[1]:
        return insufficient_privileges()

    if current_member_role == "admin" and target_member[3] == "admin":
        return insufficient_privileges()
    
    updated_member = update_role_member(workspace_id, user_id, role)

    if not updated_member:
        return resource_not_found()

    return {
        "id": updated_member[0],
        "workspace_id": updated_member[1],
        "user_id": updated_member[2],
        "role": updated_member[3],
        "joined_at": updated_member[4].isoformat(),
    }, 200


@workspaces_bp.route(
    "/api/workspaces/<int:workspace_id>/members/<int:user_id>", methods=["DELETE"]
)
def delet_member_route(workspace_id, user_id):
    requester_id, error = get_authenticated_user()
    if error:
        return error

    workspace, error = get_workspace_with_permission(
        workspace_id, requester_id, ("owner", "admin")
    )
    if error:
        return error
    requester_member = get_workspace_member(workspace_id, requester_id)
    requester_role = requester_member[3]

    target_member = get_workspace_member(workspace_id, user_id)
    if not target_member:
        return resource_not_found()
    target_member_role = target_member[3]
    if (
        requester_role == "admin" and target_member_role == "owner"
    ) or user_id == workspace[1]:
        return insufficient_privileges()
    if requester_role == "admin" and target_member_role == "admin":
        return insufficient_privileges()
    if requester_role == "owner" and target_member_role == "owner":
        if requester_id != workspace[1]:
            return insufficient_privileges()
    deleted_member = delete_member_db(workspace_id, user_id)
    if not deleted_member:
        return resource_not_found()
    return {"message": f"member {deleted_member[0]} has been deleted"}, 200


@workspaces_bp.route(
    "/api/workspaces/<int:workspace_id>/owner",
    methods=["PATCH"],
)
def transfer_crown(workspace_id):
    user_id, error = get_authenticated_user()

    if error:
        return error

    workspace, error = get_workspace_with_permission(
        workspace_id, user_id, require_owner=True
    )
    if error:
        return error

    data, error = get_json_object()
    if error:
        return error

    target_user_id = data.get("user_id")

    if not target_user_id:
        return {"error": "user_id is required"}, 400
    if not is_valid_id(target_user_id):
        return {"error": "invalid user_id"}, 400

    if target_user_id == user_id:
        return {"error": "user already holds the crown"}, 409

    error = check_workspace_permission(workspace_id, target_user_id, ("owner",))
    if error:
        return error

    updated_workspace = crowned_king(
        target_user_id,
        workspace_id,
    )

    if not updated_workspace:
        return resource_not_found()

    return {
        "message": "The crown has been transferred successfully",
        "workspace_id": updated_workspace[0],
        "owner_id": updated_workspace[1],
        "name": updated_workspace[2],
        "created_at": updated_workspace[3].isoformat(),
    }, 200
