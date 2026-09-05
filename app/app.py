from flask import Flask, request, session
from argon2 import PasswordHasher
from psycopg.errors import UniqueViolation
from app.db import (
    create_user,
    deleted_project,
    get_db_connection,
    get_task_by_id,
    get_user_by_email,
    get_workspace_by_id,
    create_project,
    get_project_by_id,
    update_project_db,
    create_task,
    update_task_db
)
from app.db import (
    get_user_by_id,
    create_workspace,
    get_workspaces_by_owner,
    delet_workspace,
    update_workspace,
    get_projects_by_workspace,
    get_tasks_by_project,
    delete_task
)
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
        return {"error": "invalid email or password"}, 401

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
        return {"error": "authentication required"}, 401

    user = get_user_by_id(user_id)
    if not user:
        return {"error": "user not found"}, 404

    return {
        "id": user[0],
        "username": user[1],
        "email": user[2],
    }, 200


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return {"message": "logget out succesfully"}, 200


@app.route("/api/workspaces", methods=["POST"])
def create_workspace_endpoint():
    user_id = session.get("user_id")
    data = request.get_json()

    if not user_id:
        return {"error": "No user found"}, 401

    if data is None:
        return {"error": "invalid JSON body"}, 400

    name = data.get("name")

    if not name:
        return {"error": "name is required"}, 400
    workspace = create_workspace(user_id, name)

    return {
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat(),
    }, 201


@app.route("/api/workspaces", methods=["GET"])
def get_workspaces():

    user_id = session.get("user_id")

    if not user_id:
        return {"error": "No user found"}, 401

    workspaces = get_workspaces_by_owner(user_id)

    if not workspaces:
        return [], 200

    result = []
    for workspace in workspaces:
        result.append(
            {
                "id": workspace[0],
                "owner_id": workspace[1],
                "name": workspace[2],
                "created_at": workspace[3].isoformat(),
            }
        )

    return result, 200


@app.route("/api/workspaces/<int:workspace_id>", methods=["GET"])
def get_workspaces_by_id_route(workspace_id):
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "user_id Missing"}, 401

    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "workspace not found"}, 404

    return {
        "id": workspace[0],
        "owner_id": workspace[1],
        "name": workspace[2],
        "created_at": workspace[3].isoformat(),
    }, 200


@app.route("/api/workspaces/<int:workspace_id>", methods=["DELETE"])
def del_workspace(workspace_id):
    user_id = session.get("user_id")

    if not user_id:
        return {"error": "user_id Missing"}, 401

    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404

    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404

    delet_workspace(workspace_id)
    return {"message": "workspace deleted successfuly"}, 200


@app.route("/api/workspaces/<int:workspace_id>", methods=["PATCH"])
def workspace_update(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404

    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404

    data = request.get_json()
    name = data.get("name")
    if not name:
        return {"error": "name is missing"}, 400
    edited_workspace = update_workspace(workspace_id, name)
    return {
        "id": edited_workspace[0],
        "owner_id": edited_workspace[1],
        "name": edited_workspace[2],
        "created_at": edited_workspace[3].isoformat(),
    }, 200

@app.route("/api/workspaces/<int:workspace_id>/projects", methods=["POST"])
def projects(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    name = data.get("name")
    description = data.get("description")
    if not name:
        return {"error": "name is required"}, 400
    project = create_project(workspace_id, name, description)
    return{
        "id": project[0],
        "workspace_id": project[1],
        "name": project[2],
        "description": project[3],
        "created_at": project[4].isoformat()
    },201
@app.route("/api/workspaces/<int:workspace_id>/projects", methods=["GET"])
def get_projects(workspace_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    workspace = get_workspace_by_id(workspace_id)
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    projects = get_projects_by_workspace(workspace_id)
    result = []
    for project in projects:
        result.append({
           "id": project[0],
            "workspace_id": project[1],
            "name": project[2],
            "description": project[3],
            "created_at": project[4].isoformat()
        })
    return result, 200
@app.route("/api/projects/<int:project_id>", methods=["GET"])
def get_project_id(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    return {
        "id": project[0],
        "workspace_id": project[1],
        "name": project[2],
        "description": project[3],
        "created_at": project[4].isoformat()
    }, 200
@app.route("/api/projects/<int:project_id>", methods=["PATCH"])
def update_project(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    name = data.get("name", project[2])
    description = data.get("description", project[3])
    if not name and not description:
        return {"error": "name or description is required"}, 400
    updated_project = update_project_db(project_id, name, description)
    return {
        "id": updated_project[0],
        "workspace_id": updated_project[1],
        "name": updated_project[2],
        "description": updated_project[3],
        "created_at": updated_project[4].isoformat()
    }, 200
@app.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    deleted_project(project_id)
    if not deleted_project:
        return {"error": "project not found"}, 404
    return {"message": "project deleted successfuly"}, 200

@app.route("/api/projects/<int:project_id>/tasks", methods=["POST"])
def create_task_route(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    title = data.get("title")
    description = data.get("description")
    assignee_id = data.get("assignee_id")
    status = data.get("status")
    priority = data.get("priority")
    due_date = data.get("due_date")
    if not title:
        return {"error": "title is required"}, 400
    if not status:
        return {"error": "status is required"}, 400
    if not priority:
        return {"error": "priority is required"}, 400
    assignee_id = data.get("assignee_id")
    creator_id = user_id
    if assignee_id:
        assignee = get_user_by_id(assignee_id)
        if not assignee:
            return {"error": "assignee not found"}, 404
    task = create_task(project_id, creator_id, assignee_id, title, description, status, priority, due_date)
    return {
        "id": task[0],
        "project_id": task[1],
        "title": task[2],
        "description": task[3],
        "status": task[4],
        "priority": task[5],
        "due_date": task[6].isoformat() if task[6] else None
    }, 201

@app.route("/api/projects/<int:project_id>/tasks", methods=["GET"])
def get_tasks_route(project_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    project = get_project_by_id(project_id)
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    tasks = get_tasks_by_project(project_id)
    if not tasks:
        return [], 200
    result = []
    for task in tasks:
        result.append({
            "id": task[0],
            "project_id": task[1],
            "title": task[4],
            "description": task[5],
            "status": task[6],
            "priority": task[7],
            "due_date": task[8].isoformat() if task[8] else None
        })
    return result, 200

@app.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task_route(task_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    task = get_task_by_id(task_id)
    if not task:
        return {"error": "task not found"}, 404
    return {
        "id": task[0],
        "project_id": task[1],
        "title": task[4],
        "description": task[5],
        "status": task[6],
        "priority": task[7],
        "due_date": task[8].isoformat() if task[8] else None
    }, 200
@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task_route(task_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    task = get_task_by_id(task_id)
    if not task:
        return {"error": "task not found"}, 404
    project = get_project_by_id(task[1])
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    data = request.get_json()
    if not data:
        return {"error": "invalid JSON body"}, 400
    title = data.get("title", task[4])
    description = data.get("description", task[5])
    status = data.get("status", task[6])
    priority = data.get("priority", task[7])
    due_date = data.get("due_date", task[8].isoformat() if task[8] else None)
    updated_task = update_task_db(task_id, title, description, status, priority, due_date)
    return {
        "id": updated_task[0],
        "project_id": updated_task[1],
        "title": updated_task[4],
        "description": updated_task[5],
        "status": updated_task[6],
        "priority": updated_task[7],
        "due_date": updated_task[8].isoformat() if updated_task[8] else None
    }, 200
@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task_route(task_id):
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "user_id Missing"}, 401
    task = get_task_by_id(task_id)
    if not task:
        return {"error": "task not found"}, 404
    project = get_project_by_id(task[1])
    if not project:
        return {"error": "project not found"}, 404
    workspace = get_workspace_by_id(project[1])
    if not workspace:
        return {"error": "workspace not found"}, 404
    if workspace[1] != user_id:
        return {"error": "user_id dont match with your workspace_id"}, 404
    deleted_task = delete_task(task_id)
    if not deleted_task:
        return {"error": "task not found"}, 404
    return {"message": "task deleted successfuly"}, 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)