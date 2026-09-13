from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from flask import Blueprint, request, session
from psycopg.errors import UniqueViolation
from email_validator import validate_email, EmailNotValidError
from app.extensions import limiter
import secrets
from app.permissions import get_authenticated_user
from app.db import create_session, create_user, get_user_by_email, get_user_by_id, get_session_by_token, revoke_session

auth_bp = Blueprint("auth", __name__)
password_hasher = PasswordHasher()



@auth_bp.route("/api/users", methods=["POST"])
@limiter.limit("3 per hour")
def register_user():
    data = request.get_json()
    if not isinstance(data, dict) or not data:
        return {"error": "Invalid JSON body"}, 400
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")


    if not isinstance(username, str) or not isinstance(email, str) or not isinstance(password, str):
        return {"error": "username, email and password must be strings"}, 400

    if not username.strip() or not email.strip() or not password.strip():
        return {"error": "username, email and password cannot be empty"}, 400


    if len(password) < 8:
        return {"error": "password must contain at least 8 characters"}, 400

    if len(username) > 50:
        return {"error": "username must be at most 50 characters"}, 400

    if len(email) > 255:
        return {"error": "email must be at most 255 characters"}, 400

    try:
        validate_email(email, check_deliverability=False)
    except EmailNotValidError:
        return {"error": "invalid email format"}, 400
    
    try:
        user = create_user(username, email, password_hasher.hash(password))
    except UniqueViolation:
        return {"error": "email already used"}, 409
    session_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    create_session(user[0], session_token, expires_at)    
    session["session_token"] = session_token
    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
        "created_at": user[3].isoformat(),
    }, 201


@auth_bp.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()

    if not isinstance(data, dict) or not data:
        return {"error": "invalid JSON body"}, 400
    email = data.get("email")
    password = data.get("password")

    if not isinstance(email, str) or not isinstance(password, str):
        return {"error": "email and password must be strings"}, 400
    if not email.strip() or not password.strip():
        return {"error": "email and password cannot be empty"}, 400
 
    user = get_user_by_email(email)
    if not user:
        return {"error": "invalid email or password"}, 401
    
    try:
        password_hasher.verify(user[3], password)
    except VerifyMismatchError:
        return {"error": "invalid email or password"}, 401
    new_session_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    create_session(user[0], new_session_token, expires_at)
    session["session_token"] = new_session_token

    return {"id": user[0], "username": user[1], "email": user[2]}, 200


@auth_bp.route("/api/auth/me", methods=["GET"])
def get_current_user():
    user_id, error = get_authenticated_user()

    if error:
        return error
    user = get_user_by_id(user_id)

    if not user:
        return{"error": "user not found"}, 404
    return {"id": user[0], "username": user[1], "email": user[2]}, 200


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session_token = session.get("session_token")

    if not session_token:
        return{"error": "authentication required"}, 401

    revoked_session = revoke_session(session_token)

    if not revoked_session:
        return {"error": "session revocation failed"}, 404
    
    session.clear()

    return {"message": "logged out succesfully"}, 200
