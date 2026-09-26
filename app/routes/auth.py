import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, request, session
from psycopg.errors import UniqueViolation

from app.db import (
    create_session,
    create_user,
    delete_user_account,
    get_user_by_email,
    get_user_by_id,
    get_user_password_hash,
    revoke_session,
    update_user_avatar,
    update_user_first_name,
)
from app.extensions import limiter
from app.permissions import get_authenticated_user, resource_not_found
from app.validation import get_json_object, is_valid_text

auth_bp = Blueprint("auth", __name__)
password_hasher = PasswordHasher()


def _start_session(user_id):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    create_session(user_id, token, expires_at)
    session["session_token"] = token


def _user_response(user):
    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
        "first_name": user[3],
        "avatar_url": user[4],
    }


@auth_bp.route("/api/users", methods=["POST"])
@limiter.limit("3 per hour")
def register_user():
    data, error = get_json_object()
    if error:
        return error
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if (
        not isinstance(username, str)
        or not isinstance(email, str)
        or not isinstance(password, str)
    ):
        return {"error": "username, email and password must be strings"}, 400

    if not username.strip() or not email.strip() or not password.strip():
        return {"error": "username, email and password cannot be empty"}, 400

    if len(password) < 8:
        return {"error": "password must contain at least 8 characters"}, 400

    if len(username) > 50:
        return {"error": "username must be at most 50 characters"}, 400

    if len(email) > 255:
        return {"error": "email must be at most 255 characters"}, 400

    if not is_valid_text(username):
        return {"error": "invalid username value"}, 400
    if not is_valid_text(email):
        return {"error": "invalid email value"}, 400
    if not is_valid_text(password, allow_nul=True):
        return {"error": "invalid password value"}, 400

    try:
        validate_email(email, check_deliverability=False)
    except EmailNotValidError:
        return {"error": "invalid email format"}, 400

    try:
        user = create_user(username, email, password_hasher.hash(password))
    except UniqueViolation:
        return {"error": "email already used"}, 409
    _start_session(user[0])
    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
        "created_at": user[3].isoformat(),
    }, 201


@auth_bp.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    data, error = get_json_object()
    if error:
        return error
    email = data.get("email")
    password = data.get("password")

    if not isinstance(email, str) or not isinstance(password, str):
        return {"error": "email and password must be strings"}, 400
    if not email.strip() or not password.strip():
        return {"error": "email and password cannot be empty"}, 400
    if not is_valid_text(email, max_length=255):
        return {"error": "invalid email value"}, 400
    if not is_valid_text(password, allow_nul=True):
        return {"error": "invalid password value"}, 400

    user = get_user_by_email(email)
    if not user:
        return {"error": "invalid email or password"}, 401

    try:
        password_hasher.verify(user[3], password)
    except VerifyMismatchError:
        return {"error": "invalid email or password"}, 401
    _start_session(user[0])

    return {"id": user[0], "username": user[1], "email": user[2]}, 200


@auth_bp.route("/api/auth/me", methods=["GET"])
def get_current_user():
    user_id, error = get_authenticated_user()

    if error:
        return error
    user = get_user_by_id(user_id)

    if not user:
        return resource_not_found()
    return _user_response(user), 200


@auth_bp.route("/api/users/me", methods=["PATCH"])
def first_name_edit():
    user_id, error = get_authenticated_user()

    if error:
        return error

    data, error = get_json_object()

    if error:
        return error

    first_name = data.get("first_name")

    if not isinstance(first_name, str):
        return {"error": "first_name must be a string"}, 400

    first_name = first_name.strip()

    if not first_name:
        return {"error": "first_name cannot be empty"}, 400

    if not is_valid_text(first_name, max_length=100):
        return {"error": "invalid first_name value"}, 400

    user = update_user_first_name(user_id, first_name)

    if not user:
        return resource_not_found()

    return _user_response(user), 200


@auth_bp.route("/api/users/me", methods=["DELETE"])
@limiter.limit("5 per minute")
def delete_current_user():
    user_id, error = get_authenticated_user()
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    password = data.get("password")
    if not is_valid_text(password, allow_empty=False, allow_nul=True):
        return {"error": "password is required"}, 400
    password_hash = get_user_password_hash(user_id)
    if password_hash is None:
        return resource_not_found()
    try:
        password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return {"error": "incorrect password"}, 403

    images = delete_user_account(user_id)
    if images is None:
        return resource_not_found()
    session.clear()
    for image in images:
        # Only remove generated uploads, never defaults or arbitrary stored paths.
        if not image or not re.fullmatch(
            r"/static/(avatars|workspace_icons)/[0-9]+_[a-f0-9]{32}\.(jpg|jpeg|png|webp)",
            image,
        ):
            continue
        path = Path(current_app.static_folder) / image.removeprefix("/static/")
        try:
            path.unlink(missing_ok=True)
        except OSError:
            current_app.logger.exception("Could not remove deleted account image")
    return {"message": "account deleted successfully"}, 200


@auth_bp.route("/api/users/me/avatar", methods=["POST"])
def upload_avatar():
    user_id, error = get_authenticated_user()

    if error:
        return error

    new_avatar = request.files.get("avatar")
    if new_avatar is None:
        return {"error": "avatar file is required"}, 400
    if new_avatar.filename == "":
        return {"error": "avatar file must have a filename"}, 400
    if not new_avatar.content_type.startswith("image/"):
        return {"error": "avatar file must be an image"}, 400
    if len(new_avatar.read()) > 5 * 1024 * 1024:  # 5MB limit
        return {"error": "avatar file size must be less than 5MB"}, 400
    if "." not in new_avatar.filename:
        return {"error": "avatar file must have an extension"}, 400
    extension = new_avatar.filename.rsplit(".", 1)[1].lower()
    if extension not in ["jpg", "jpeg", "png", "webp"]:
        return {"error": "avatar file must be a jpg, jpeg, png, or webp"}, 400
    filename = f"{user_id}_{uuid.uuid4().hex}.{extension}"
    save_path = f"app/static/avatars/{filename}"
    old_user = get_user_by_id(user_id)
    if not old_user:
        return resource_not_found()
    old_avatar_url = old_user[4]

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    new_avatar.seek(0)
    new_avatar.save(save_path)

    user = update_user_avatar(user_id, f"/static/avatars/{filename}")
    if not user:
        if os.path.exists(save_path):
            os.remove(save_path)

        return resource_not_found()
    if old_avatar_url and old_avatar_url != "/static/avatars/default.png":
        old_filename = os.path.basename(old_avatar_url)
        old_avatar_path = os.path.join("app/static/avatars", old_filename)
        if os.path.exists(old_avatar_path):
            try:
                os.remove(old_avatar_path)
            except OSError:
                pass
    return _user_response(user), 200


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    _, error = get_authenticated_user()
    if error:
        return error

    session_token = session.get("session_token")
    revoked_session = revoke_session(session_token)

    if not revoked_session:
        return {"error": "session revocation failed"}, 401

    session.clear()

    return {"message": "logged out succesfully"}, 200
