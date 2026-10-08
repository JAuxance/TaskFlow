from flask_socketio import emit, join_room

from app.permissions import get_authenticated_user, get_workspace_with_permission
from app.sockets.access import publish_chat_message, remember_chat_session
from app.validation import is_valid_id


def register_workspace_chat_events(socketio):

    @socketio.on("join_workspace")
    def handle_join_workspace(data=None):
        workspace_id = data.get("workspace_id") if isinstance(data, dict) else None

        if not is_valid_id(workspace_id):
            emit("socket_error", {"message": "valid workspace_id is required"})
            return

        user_id, error = get_authenticated_user()

        if error:
            emit("socket_error", {"message": "unauthorized"})
            return

        workspace, error = get_workspace_with_permission(workspace_id, user_id)

        if error:
            emit("socket_error", {"message": "workspace access denied"})
            return

        room = f"workspace_{workspace_id}"
        remember_chat_session()
        join_room(room)

        emit("workspace_joined", {"workspace_id": workspace_id})


def publish_workspace_message(socketio, message):
    room = f"workspace_{message['workspace_id']}"
    publish_chat_message(socketio, room, "new_message", message)
