from datetime import datetime, timezone

from flask import request, session
from flask_socketio import emit, join_room

from app.db import get_session_by_token, get_user_by_id, users_share_workspace
from app.permissions import get_authenticated_user
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
        # Recheck expiry/logout when delivering messages to an existing socket.
        socketio.server.save_session(
            request.sid, {"dm_token": session["session_token"]}
        )
        join_room(get_direct_message_room(current_user_id, other_user_id))
        emit("direct_message_joined", {"user_id": other_user_id})


def publish_direct_message(socketio, message):
    room = get_direct_message_room(message["sender_id"], message["receiver_id"])
    participants = list(socketio.server.manager.get_participants("/", room))
    for sid, _ in participants:
        try:
            token = socketio.server.get_session(sid).get("dm_token")
        except KeyError:
            # A browser can disconnect while the recipient list is being read.
            continue
        db_session = get_session_by_token(token) if token else None
        if (
            not db_session
            or db_session[5]
            or db_session[4] <= datetime.now(timezone.utc)
            or db_session[1] not in (message["sender_id"], message["receiver_id"])
        ):
            socketio.server.leave_room(sid, room)
            socketio.emit("socket_error", {"message": "unauthorized"}, to=sid)
            continue
        socketio.emit("new_direct_message", message, to=sid)
