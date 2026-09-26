import os

from flask import Flask
from flask_cors import CORS

from app.db import get_db_connection
from app.extensions import limiter, socketio
from app.routes.auth import auth_bp
from app.routes.direct_messages import direct_messages_bp
from app.routes.projects import projects_bp
from app.routes.tasks import tasks_bp
from app.routes.workspaces import workspaces_bp
from app.sockets.direct_messages import register_direct_message_events
from app.sockets.workspace_chat import register_workspace_chat_events

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

secret_key = os.getenv("SECRET_KEY")

if app_env == "production" and not secret_key:
    raise RuntimeError("SECRET_KEY must be configured in production")

app.config["SECRET_KEY"] = secret_key
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = app_env == "production"
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024

if app_env == "development":
    socketio.init_app(
        app,
        cors_allowed_origins="http://localhost:5500"
    )
else:
    socketio.init_app(app)
register_workspace_chat_events(socketio)
register_direct_message_events(socketio)
app.register_blueprint(auth_bp)
app.register_blueprint(workspaces_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(direct_messages_bp)


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
    except Exception:
        app.logger.exception("Database health check failed")

    return {"api": "ok", "database": "error"}, 500


if __name__ == "__main__":
    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=app_env == "development",
        allow_unsafe_werkzeug=True,
    )
