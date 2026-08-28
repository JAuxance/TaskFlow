from flask import Flask
from app.db import get_db_connection


app = Flask(__name__)


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


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )