import os
from urllib.parse import urlsplit

from flask import Flask
from flask_cors import CORS
from email_validator import EmailNotValidError, validate_email

from app.db import get_db_connection
from app.extensions import limiter, socketio
from app.routes.auth import auth_bp
from app.routes.direct_messages import direct_messages_bp
from app.routes.media import media_bp
from app.routes.projects import projects_bp
from app.routes.privacy import privacy_bp
from app.routes.tasks import tasks_bp
from app.routes.workspaces import workspaces_bp
from app.sockets.direct_messages import register_direct_message_events
from app.sockets.workspace_chat import register_workspace_chat_events
from app.sockets.access import register_chat_access_events
from app.security import configure_security
from app.file_cleanup import configure_file_cleanup

app_env = os.getenv("APP_ENV", "development")

app = Flask(__name__)

if app_env == "production":
    public_origin = os.getenv("PUBLIC_ORIGIN", "").rstrip("/")
    parsed_origin = urlsplit(public_origin)
    if (parsed_origin.scheme != "https" or not parsed_origin.hostname
            or parsed_origin.path or parsed_origin.query or parsed_origin.fragment
            or parsed_origin.username or parsed_origin.password):
        raise RuntimeError("PUBLIC_ORIGIN must be an HTTPS origin, e.g. https://taskflow.auxance.dev")
    allowed_origins = [public_origin]
else:
    # Port 5500 serves frontend/; port 5173 is the Vite server of frontend-vue/.
    allowed_origins = [
        "http://localhost:5500", "http://127.0.0.1:5500",
        "http://localhost:5173", "http://127.0.0.1:5173",
    ]

configure_security(
    app, allowed_origins,
    trust_proxy=app_env == "production" and os.getenv("TRUST_PROXY_HEADERS") == "1",
)

if app_env == "development":
    CORS(
        app,
        resources={
            r"/api/.*": {"origins": allowed_origins},
            r"/static/(avatars|workspace_icons)/.*": {"origins": allowed_origins},
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
contact_email = os.getenv("PRIVACY_CONTACT_EMAIL", "").strip()
if contact_email:
    try:
        contact_email = validate_email(contact_email, check_deliverability=False).normalized
    except EmailNotValidError as error:
        raise RuntimeError("PRIVACY_CONTACT_EMAIL must be a valid email address") from error
app.config["PRIVACY_CONTACT_EMAIL"] = contact_email

socketio.init_app(app, cors_allowed_origins=allowed_origins)
register_chat_access_events(socketio)
register_workspace_chat_events(socketio)
register_direct_message_events(socketio)
configure_file_cleanup(app)
app.register_blueprint(auth_bp)
app.register_blueprint(privacy_bp)
app.register_blueprint(workspaces_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(direct_messages_bp)
app.register_blueprint(media_bp)


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
