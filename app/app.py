import os

from flask import Flask
from flask_cors import CORS
from app.db import get_db_connection
from app.routes.auth import auth_bp
from app.routes.projects import projects_bp
from app.routes.tasks import tasks_bp
from app.routes.workspaces import workspaces_bp
from app.extensions import limiter

app_env = os.getenv("APP_ENV", "development")

app = Flask(__name__)
if app_env == "development":
    CORS(
        app,
        resources={
            r"/api/.*": {
                "origins": ["http://localhost:5500"]
            }
        },
        supports_credentials=True,
    )
limiter.init_app(app)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = app_env == "production"
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# Upload routes cap files at 5 MiB; allow room for multipart form headers.
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024

app.register_blueprint(auth_bp)
app.register_blueprint(workspaces_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(tasks_bp)


@app.errorhandler(413)
def request_too_large(error):
    return {"error": "request is too large; images must be at most 5MB"}, 413


@app.route("/health")
def health():
    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
        return {"api": "ok", "database": "ok"}, 200
    except Exception as error:
        print(error)

    return {
        "api": "ok",
        "database": "error"
    }, 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
