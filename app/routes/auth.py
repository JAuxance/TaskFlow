import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, session
from psycopg.errors import UniqueViolation, DeadlockDetected, LockNotAvailable

from app.db import (
    create_session,
    create_user,
    clear_user_avatar,
    get_user_by_email,
    get_user_by_id,
    get_user_password_hash,
    revoke_session,
    update_user_first_name,
)
from app.extensions import limiter
from app.permissions import get_authenticated_user, resource_not_found
from app.validation import get_json_object, is_valid_text
from app.data_export import collect_user_data
from app.account_deletion import deletion_preview, delete_user_account
from app.file_cleanup import cleanup_deleted_files

auth_bp = Blueprint("auth", __name__)
password_hasher = PasswordHasher()


def _start_session(user_id):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    create_session(user_id, token, expires_at)
    session.clear()  # Rotate the anonymous CSRF token after authentication.
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

    if not is_valid_text(first_name, max_length=100):
        return {"error": "invalid first_name value"}, 400

    user = update_user_first_name(user_id, first_name or None)

    if not user:
        return resource_not_found()

    return _user_response(user), 200


@auth_bp.route("/api/users/me/avatar", methods=["DELETE"])
def remove_avatar():
    user_id, error = get_authenticated_user()
    if error:
        return error

    def remove_file(url):
        if url and re.fullmatch(rf"/static/avatars/{user_id}_[a-f0-9]{{32}}\.(jpg|jpeg|png|webp)", url):
            path = Path(current_app.static_folder) / url.removeprefix("/static/")
            path.unlink(missing_ok=True)

    try:
        user = clear_user_avatar(user_id, remove_file)
    except OSError:
        current_app.logger.warning("Avatar removal failed; profile was preserved for retry")
        return {"error": "Your picture could not be removed. Please try again later."}, 503
    if user is None:
        return resource_not_found()
    return _user_response(user), 200


@auth_bp.route("/api/users/me/data-export", methods=["POST"])
@limiter.limit("3 per hour")
def export_my_data():
    user_id, error = get_authenticated_user()
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    if set(data) != {"password"}:
        return {"error": "Only your current password is accepted."}, 400
    if not is_valid_text(data["password"], allow_empty=False, allow_nul=True):
        return {"error": "password is required"}, 400
    password_hash = get_user_password_hash(user_id)
    if password_hash is None:
        return resource_not_found()
    try:
        password_hasher.verify(password_hash, data["password"])
    except VerifyMismatchError:
        return {"error": "incorrect password"}, 403
    data, error = collect_user_data(user_id)
    if error == "too_large":
        return {"error": "Your data exceeds the automatic download limit. Please request a copy through the privacy contact.",
                "code": "export_too_large"}, 409
    if error:
        return resource_not_found()
    response = jsonify(data)
    response.headers["Content-Disposition"] = 'attachment; filename="taskflow-my-data.json"'
    return response


@auth_bp.route("/api/users/me/deletion-preview", methods=["GET"])
def preview_account_deletion():
    user_id, error = get_authenticated_user()
    if error:
        return error
    preview = deletion_preview(user_id)
    if preview is None:
        return resource_not_found()
    return preview


@auth_bp.route("/api/users/me", methods=["DELETE"])
@limiter.limit("5 per minute")
def delete_current_user():
    user_id, error = get_authenticated_user()
    if error:
        return error
    data, error = get_json_object()
    if error:
        return error
    if set(data) != {"password", "confirmed_workspace_ids"}:
        return {"error": "Review the deletion summary and confirm its workspace list."}, 400
    password = data["password"]
    confirmed = data["confirmed_workspace_ids"]
    if not is_valid_text(password, allow_empty=False, allow_nul=True):
        return {"error": "password is required"}, 400
    if (not isinstance(confirmed, list)
            or any(type(item) is not int or item <= 0 for item in confirmed)
            or len(set(confirmed)) != len(confirmed)):
        return {"error": "invalid confirmed workspace list"}, 400
    try:
        error = delete_user_account(user_id, password, confirmed)
    except (DeadlockDetected, LockNotAvailable):
        return {"error": "Your account is being updated. Review the summary and try again.",
                "code": "deletion_busy"}, 409
    if error == "not_found":
        return resource_not_found()
    if error == "incorrect_password":
        return {"error": "incorrect password"}, 403
    if error == "shared_workspaces":
        return {"error": "Transfer ownership or explicitly delete workspaces with other members first.",
                "code": "shared_workspaces"}, 409
    if error == "preview_changed":
        return {"error": "Your workspace list has changed. Review the deletion summary again.",
                "code": "preview_changed"}, 409
    if error == "log_failed":
        return {"error": "The account was kept because the deletion record could not be saved."}, 500
    session.clear()
    try:
        result = cleanup_deleted_files(current_app.static_folder)
        if result["failed"]:
            current_app.logger.warning("Deleted-account images await cleanup retry")
    except Exception:
        current_app.logger.warning("Deleted-account cleanup deferred; retry the cleanup command")
    return {"message": "account deleted successfully"}, 200


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
