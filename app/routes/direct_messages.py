from flask import Blueprint

from app.db import (
    create_direct_message, get_direct_messages_db, get_user_by_id,
    users_share_workspace,
)
from app.extensions import socketio
from app.permissions import get_authenticated_user
from app.sockets.direct_messages import publish_direct_message
from app.validation import get_json_object, get_pagination, is_valid_id, is_valid_text


direct_messages_bp = Blueprint("direct_messages", __name__)


def conversation_access(user_id):
    sender_id, error = get_authenticated_user()
    if error:
        return None, error
    if not is_valid_id(user_id):
        return None, ({"error": "Invalid receiver ID."}, 400)
    if sender_id == user_id:
        return None, ({"error": "Cannot open a direct conversation with yourself."}, 400)
    if not get_user_by_id(user_id):
        return None, ({"error": "Receiver not found."}, 404)
    if not users_share_workspace(sender_id, user_id):
        return None, ({"error": "Direct messages require a shared workspace."}, 403)
    return sender_id, None


def message_data(row, author):
    return {
        "id": row[0],
        "sender_id": row[1],
        "receiver_id": row[2],
        "message": row[3],
        "created_at": row[4].isoformat(),
        "author": author,
    }


@direct_messages_bp.route("/api/users/<int:user_id>/direct_messages", methods=["POST"])
def send_direct_message(user_id):
    sender_id, error = conversation_access(user_id)
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    content = data.get("message")
    if not isinstance(content, str):
        return {"error": "Message content must be a string."}, 400
    content = content.strip()
    if not is_valid_text(content, allow_empty=False, max_length=2000):
        return {"error": "Message must contain 1 to 2000 valid characters."}, 400
    sender = get_user_by_id(sender_id)
    if not sender:
        return {"error": "Sender not found."}, 404
    created = create_direct_message(sender_id, user_id, content)
    if not created:
        return {"error": "Message creation failed."}, 500
    message = message_data(created, {
        "username": sender[1], "first_name": sender[3], "avatar_url": sender[4],
    })
    publish_direct_message(socketio, message)
    return message, 201


@direct_messages_bp.route("/api/users/<int:user_id>/direct_messages", methods=["GET"])
def get_direct_messages(user_id):
    current_user_id, error = conversation_access(user_id)
    if error:
        return error
    pagination, error = get_pagination()
    if error:
        return error
    limit, offset = pagination
    rows = get_direct_messages_db(current_user_id, user_id, limit, offset)
    return [message_data(row, {
        "username": row[5], "first_name": row[6], "avatar_url": row[7],
    }) for row in rows], 200
