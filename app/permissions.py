
from app.db import get_workspace_member


def check_workspace_permission(workspace_id, user_id, roles=None):
    current_member = get_workspace_member(workspace_id, user_id)
    if not current_member:
        return {"error": "not a member of this workspace"}, 403
    if roles is not None and current_member[3] not in roles:
        return {"error": "insufficient privileges"}, 403
    return None
