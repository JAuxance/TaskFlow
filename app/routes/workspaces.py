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
    update_role_member,
    delete_member_db,
    crowned_king
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

@workspaces_bp.route("/api/workspaces/<int:workspace_id>/members/<int:user_id>", methods=["PATCH"])
def update_member_role(workspace_id, user_id):
    current_user_id = session.get("user_id")
    
    if not current_user_id:
        return {"error": "user_id Missing"}, 401
    
    workspace = get_workspace_by_id(workspace_id)

    if not workspace:
        return {"error": "workspace not found"}, 404
    
    permision_error = check_workspace_permission(
        workspace_id,
        current_user_id,
        ("owner", "admin"))

    if permision_error:
        return permision_error
    target_member = get_workspace_member(workspace_id, user_id)
    if not target_member:
        return {"error": "user_id not found in this workspace"}, 404
    if user_id == workspace[1]:
        return {"error": "cannot modify the crown holder"}, 403
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    role = data.get("role")

    if role not in ("admin", "owner", "member", "guest"):
            return {"error": "invalid role"}, 400

    current_member = get_workspace_member(workspace_id, current_user_id)
    current_member_role = current_member[3]

    if current_member_role == "admin" and role not in ("member", "guest"):
        return {"error": "admin cannot assign this role"}, 403
    
    if current_member_role == "owner" and role == "owner" and current_user_id != workspace[1]:
        return {"error": "only the crown holder can assign owner role"}, 403
    
    
    if target_member[3] == "owner" and current_user_id != workspace[1]:
        return {"error": "only the crown holder can modify an owner"}, 403
    
    updated_member = update_role_member(workspace_id, user_id, role)

    if not updated_member:
        return {"error": "member update failed"}, 404
    
    return {
    "id": updated_member[0],
    "workspace_id": updated_member[1],
    "user_id": updated_member[2],
    "role": updated_member[3],
    "joined_at": updated_member[4].isoformat(),
}, 200 

@workspaces_bp.route("/api/workspaces/<int:workspace_id>/members/<int:user_id>", methods=["DELETE"])
def delet_member_route(workspace_id, user_id):
    requester_id = session.get("user_id")
    if not requester_id:
       return {"error": "user_id Missing"}, 401 

    target_member = get_workspace_member(workspace_id, user_id)
    if not target_member:
            return {"error": "user_id not found in this workspace"}, 404
    target_member_role = target_member[3]
    
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    requester_member = get_workspace_member(workspace_id, requester_id)
    if not requester_member:
        return{"error": "Your not in this workspace"}, 403
    requester_role = requester_member[3]

    if requester_role in ("member", "guest"):
        return{"error":"permission denied"}, 403
    if requester_role not in ("owner", "admin") and requester_id != workspace[1]:
        return{"error":"permission denied"}, 403
    if ((requester_role == "admin" and target_member_role == "owner") or user_id == workspace[1]):
        return{"error":"permission denied"}, 403
    if requester_role == "admin" and target_member_role == "admin":
        return{"error":"permission denied"}, 403
    if requester_role == "owner" and target_member_role == "owner":
        if requester_id != workspace[1]:
            return {"error": "permission denied"}, 403
    deleted_member = delete_member_db(workspace_id, user_id)
    if not deleted_member:
        return {"error": "member delete failed"}, 404
    return {"message": f"member {deleted_member[0]} has been deleted"},

@workspaces_bp.route("/api/workspaces/<int:workspace_id>/owner",methods=["PATCH"],)
def transfer_crown(workspace_id):
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "authentication required"}, 401

    workspace = get_workspace_by_id(workspace_id)

    if not workspace:
        return {"error": "workspace not found"}, 404

    if user_id != workspace[1]:
        return {"error": "only the crown holder can transfer ownership"}, 403

    data = request.get_json()

    if not data:
        return {"error": "invalid JSON body"}, 400

    target_user_id = data.get("user_id")

    if not target_user_id:
        return {"error": "user_id is required"}, 400

    if target_user_id == user_id:
        return {"error": "user already holds the crown"}, 409

    target_member = get_workspace_member(
        workspace_id,
        target_user_id,
    )

    if not target_member:
        return {"error": "target user is not a member of this workspace"}, 404

    if target_member[3] != "owner":
        return {"error": "target user must have owner role"}, 403

    updated_workspace = crowned_king(
        target_user_id,
        workspace_id,
    )

    if not updated_workspace:
        return {"error": "ownership transfer failed"}, 404

    return {
        "message": "The crown has been transferred successfully",
        "workspace_id": updated_workspace[0],
        "owner_id": updated_workspace[1],
        "name": updated_workspace[2],
        "created_at": updated_workspace[3].isoformat(),
    }, 200


    
    
    
