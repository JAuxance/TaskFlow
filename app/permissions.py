from datetime import datetime, timezone

from flask import session

from app.db import (
    get_project_by_id,
    get_session_by_token,
    get_task_by_id,
    get_workspace_by_id,
    get_workspace_member,
)


def resource_not_found():
    return {"error": "resource not found"}, 404


def insufficient_privileges():
    return {"error": "insufficient privileges"}, 403


def check_workspace_permission(workspace_id, user_id, roles=None):
    current_member = get_workspace_member(workspace_id, user_id)
    if not current_member:
        return resource_not_found()
    if roles is not None and current_member[3] not in roles:
        return insufficient_privileges()
    return None


def get_workspace_with_permission(
    workspace_id, user_id, roles=None, *, require_owner=False
):
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return None, resource_not_found()
    error = check_workspace_permission(workspace_id, user_id, roles)
    if error:
        return None, error
    if require_owner and workspace[1] != user_id:
        return None, insufficient_privileges()
    return workspace, None


def get_project_with_permission(project_id, user_id, roles=None):
    project = get_project_by_id(project_id)
    if not project:
        return None, resource_not_found()
    _, error = get_workspace_with_permission(project[1], user_id, roles)
    if error:
        return None, error
    return project, None


def get_task_with_permission(task_id, user_id, roles=None):
    task = get_task_by_id(task_id)
    if not task:
        return None, resource_not_found()
    _, error = get_project_with_permission(task[1], user_id, roles)
    if error:
        return None, error
    return task, None


def get_authenticated_user():
    token = session.get("session_token")
    if not token:
        return None ,({"error":"token is missing"}, 401)
    db_session = get_session_by_token(token)
    if not db_session:
        return None ,({"error": "session is missing"}, 401)

    if db_session[5]:
        return None ,({"error": "revoked session"}, 401)

    if db_session[4] <= datetime.now(timezone.utc):
        return None ,({"error": "session expired"}, 401)

    return db_session[1], None
