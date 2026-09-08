import os

from flask import Flask

from app.db import get_db_connection
from app.routes.auth import auth_bp
from app.routes.projects import projects_bp
from app.routes.tasks import tasks_bp
from app.routes.workspaces import workspaces_bp


app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")

app.register_blueprint(auth_bp)
app.register_blueprint(workspaces_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(tasks_bp)


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
