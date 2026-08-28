from flask import Flask, request
from argon2 import PasswordHasher

from app.db import create_user, get_db_connection

app = Flask(__name__)
password_hasher = PasswordHasher()


@app.route("/health")
def health():
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()

        return {
            "api": "ok",
            "database": "ok"
        }, 200

    except Exception as error:
        return {
            "api": "ok",
            "database": "error",
            "error": str(error)
        }, 500

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

    user = create_user(
        username,
        email,
        password_hash,
    )

    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
        "created_at": user[3].isoformat(),
    }, 201


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )