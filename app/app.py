from flask import Flask, request
from argon2 import PasswordHasher
from psycopg.errors import UniqueViolation
from app.db import create_user, get_db_connection
from argon2.exceptions import VerifyMismatchError
from app.db import get_user_by_email

app = Flask(__name__)
password_hasher = PasswordHasher()


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
        return {"error": "invalid email or password"}, 401

    try:
        password_hasher.verify(user[3], password)

    except VerifyMismatchError:
        return {"error": "invalid email or password"}, 401

    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
    }, 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
