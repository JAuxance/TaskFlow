from flask import request, session

from app.db import users_share_workspace
from app.permissions import get_session_user, get_workspace_with_permission

# One entry per connection, removed on disconnect. Production uses one worker.
socket_tokens = {}


def remember_chat_session():
    socket_tokens[request.sid] = session["session_token"]


def register_chat_access_events(socketio):
    @socketio.on("disconnect")
    def forget_chat_session(reason=None):
        socket_tokens.pop(request.sid, None)


def can_read_chat(user_id, room):
    if user_id is None:
        return False
    if room.startswith("workspace_"):
        workspace_id = int(room.removeprefix("workspace_"))
        _, error = get_workspace_with_permission(workspace_id, user_id)
        return error is None
    if room.startswith("direct_message_"):
        first, second = room.removeprefix("direct_message_").split("_")
        first, second = int(first), int(second)
        return user_id in (first, second) and users_share_workspace(first, second)
    return False


def leave_chat(socketio, sid, room):
    socketio.server.leave_room(sid, room)
    socketio.emit("socket_error", {"message": "chat access denied"}, to=sid)


def publish_chat_message(socketio, room, event, message):
    # Check the database again: joining a room does not grant permanent access.
    participants = list(socketio.server.manager.get_participants("/", room))
    for sid, _ in participants:
        user_id, _ = get_session_user(socket_tokens.get(sid))
        if not can_read_chat(user_id, room):
            leave_chat(socketio, sid, room)
            continue
        socketio.emit(event, message, to=sid)


def refresh_chat_access(socketio):
    # Remove subscriptions immediately after logout, deletion or member removal.
    for sid, token in list(socket_tokens.items()):
        user_id, _ = get_session_user(token)
        for room in socketio.server.rooms(sid):
            if room == sid:
                continue  # Socket.IO's private delivery room, not a chat.
            if not can_read_chat(user_id, room):
                leave_chat(socketio, sid, room)
