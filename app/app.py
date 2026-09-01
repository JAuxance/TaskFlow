from flask import Flask, request, session
from argon2 import PasswordHasher
from psycopg.errors import UniqueViolation
from app.db import create_user, get_db_connection, get_user_by_email, get_user_by_id, create_workspace
from argon2.exceptions import VerifyMismatchError
import os
app = Flask(__name__)
password_hasher = PasswordHasher()

secret_key = os.getenv("SECRET_KEY")
app.config["SECRET_KEY"] = secret_key


@app.route("/health")
def health():
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()

        return {"api": "ok", "database": "ok"}, 200

    except Exception as error:
        return {"api": "ok", "database": "error", "error": str(error)}, 500


@app.route("/api/users", methods=["POST"])
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

    password_hash = password_hasher.hash(password)

    try:
        user = create_user(
            username,
            email,
            password_hash,
        )
    except UniqueViolation:
        return {"error": "email already used"}, 409

    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
        "created_at": user[3].isoformat(),
    }, 201


@app.route("/api/auth/login", methods=["POST"])
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
        return {
            "error": "invalid email or password"
        }, 401

    user_id = user[0]

    try:
        password_hasher.verify(user[3], password)

    except VerifyMismatchError:
        return {"error": "invalid email or password"}, 401

    session["user_id"] = user_id

    return {
        "id": user_id,
        "username": user[1],
        "email": user[2],
    }, 200


@app.route("/api/auth/me", methods=["GET"])
def get_current_user():
    user_id = session.get("user_id")

    if user_id is None:
        return {
            "error": "authentication required"
        }, 401

    user = get_user_by_id(user_id)
    if not user:
        return {
            "error": "user not found"
        }, 404

    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
    }, 200


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return {
        "message": "logget out succesfully"
    }, 200

@app.route("/api/workspaces", methods=["POST"])
def create_workspace_endpoint():
    user_id = session.get("user_id")
    data = request.get_json()

    if not user_id:
            return{
                "error": "No user found"
            }, 401

    if data is None:
        return {
            "error": "invalid JSON body"
        }, 400
    
    name = data.get("name")

    if not name:
        return {
            "error": "name is required"
        }, 400
    workspace = create_workspace(user_id, name)

    return{
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat()
    }, 201
    


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
