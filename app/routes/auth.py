from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from flask import Blueprint, request, session
from psycopg.errors import UniqueViolation

from app.db import create_user, get_user_by_email, get_user_by_id


auth_bp = Blueprint("auth", __name__)
password_hasher = PasswordHasher()


@auth_bp.route("/api/users", methods=["POST"])
def register_user():
    data = request.get_json()
    if not data:
        return {"error": "Invalid JSON body"}, 400
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    if not username or not email or not password:
        return {"error": "username, email and password are required"}, 400
    if len(password) < 8:
        return {"error": "password must contain at least 8 characters"}, 400
    try:
        user = create_user(username, email, password_hasher.hash(password))
    except UniqueViolation:
        return {"error": "email already used"}, 409
    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
        "created_at": user[3].isoformat(),
    }, 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return {"error": "Invalid JSON body"}, 400
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        return {"error": "email and password are required"}, 400
    user = get_user_by_email(email)
    if not user:
        return {"error": "invalid email or password"}, 401
    try:
        password_hasher.verify(user[3], password)
    except VerifyMismatchError:
        return {"error": "invalid email or password"}, 401
    session["user_id"] = user[0]
    return {"id": user[0], "username": user[1], "email": user[2]}, 200


@auth_bp.route("/api/auth/me", methods=["GET"])
def get_current_user():
    user_id = session.get("user_id")
    if user_id is None:
        return {"error": "authentication required"}, 401
    user = get_user_by_id(user_id)
    if not user:
        return {"error": "user not found"}, 404
    return {"id": user[0], "username": user[1], "email": user[2]}, 200


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return {"message": "logget out succesfully"}, 200