from flask_socketio import emit, join_room

from app.db import get_user_by_id, users_share_workspace
from app.permissions import get_authenticated_user
from app.sockets.access import publish_chat_message, remember_chat_session
from app.utils.chat import get_direct_message_room
from app.validation import is_valid_id


def register_direct_message_events(socketio):
    @socketio.on("join_direct_message")
    def handle_join_direct_message(data=None):
        other_user_id = data.get("user_id") if isinstance(data, dict) else None
        if not is_valid_id(other_user_id):
            emit("socket_error", {"message": "valid user_id is required"})
            return
        current_user_id, error = get_authenticated_user()
        if error:
            emit("socket_error", {"message": "unauthorized"})
            return
        if current_user_id == other_user_id:
            emit(
                "socket_error",
                {"message": "cannot open a direct conversation with yourself"},
            )
            return
        if not get_user_by_id(other_user_id):
            emit("socket_error", {"message": "user not found"})
            return
        if not users_share_workspace(current_user_id, other_user_id):
            emit("socket_error", {"message": "direct message access denied"})
            return
        remember_chat_session()
        join_room(get_direct_message_room(current_user_id, other_user_id))
        emit("direct_message_joined", {"user_id": other_user_id})


def publish_direct_message(socketio, message):
    room = get_direct_message_room(message["sender_id"], message["receiver_id"])
    publish_chat_message(socketio, room, "new_direct_message", message)
