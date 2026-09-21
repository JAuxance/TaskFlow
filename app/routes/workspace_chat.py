from flask_socketio import join_room, emit

from app.routes.auth import get_authenticated_user
from app.routes.workspaces import get_workspace_with_permission


def register_socketio_events(socketio):

    @socketio.on("connect")
    def handle_connect():
        print("Socket client connected")

    @socketio.on("join_workspace")
    def handle_join_workspace(data):
        workspace_id = data.get("workspace_id")

        if not workspace_id:
            emit("socket_error", {
                "message": "workspace_id is required"
            })
            return

        user_id, error = get_authenticated_user()

        if error:
            emit("socket_error", {
                "message": "unauthorized"
            })
            return

        workspace, error = get_workspace_with_permission(
            workspace_id,
            user_id
        )

        if error:
            emit("socket_error", {
                "message": "workspace access denied"
            })
            return

        room = f"workspace_{workspace_id}"

        join_room(room)

        emit("workspace_joined", {
            "workspace_id": workspace_id
        })