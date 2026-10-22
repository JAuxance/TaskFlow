import os

import psycopg


def get_db_connection():
    """Open a PostgreSQL connection using the configured environment variables."""
    db_host = os.getenv("DATABASE_HOST", os.getenv("DB_HOST", "localhost"))
    db_port = os.getenv("DATABASE_PORT", os.getenv("DB_PORT", "5432"))
    db_name = os.getenv("DATABASE_NAME", os.getenv("DB_NAME", "mydatabase"))
    db_user = os.getenv("DATABASE_USER", os.getenv("DB_USER", "myuser"))
    db_password = os.getenv("DATABASE_PASSWORD", os.getenv("DB_PASSWORD", "mypassword"))

    conn_str = (
        f"host={db_host} port={db_port} dbname={db_name} "
        f"user={db_user} password={db_password}"
    )

    return psycopg.connect(conn_str)


def create_user(username, email, password_hash):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (username, email, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, username, email, created_at;
                """,
                (username, email, password_hash),
            )
            return cursor.fetchone()


def get_user_by_email(email):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, username, email, password_hash, created_at
                FROM users
                WHERE email = %s;
                """,
                (email,),
            )
            return cursor.fetchone()


def get_user_by_id(user_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, username, email, first_name, avatar_url
                FROM users
                WHERE id = %s;
                """,
                (user_id,),
            )
            return cursor.fetchone()


def get_user_password_hash(user_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT password_hash FROM users WHERE id = %s;", (user_id,))
            row = cursor.fetchone()
            return row[0] if row else None


def update_user_first_name(user_id, first_name):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET first_name = %s
                WHERE id = %s
                RETURNING id, username, email, first_name, avatar_url;
                """,
                (first_name, user_id),
            )
            return cursor.fetchone()


def update_user_avatar(user_id, avatar_url):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE users
                SET avatar_url = %s
                WHERE id = %s
                RETURNING id, username, email, first_name, avatar_url;
                """,
                (avatar_url, user_id),
            )
            return cursor.fetchone()


def clear_user_avatar(user_id, remove_file):
    """Lock the profile so removing its current image cannot race an update."""
    with get_db_connection() as connection, connection.cursor() as cursor:
        cursor.execute("SELECT avatar_url FROM users WHERE id = %s FOR UPDATE;", (user_id,))
        user = cursor.fetchone()
        if user is None:
            return None
        remove_file(user[0])
        cursor.execute("""
            UPDATE users SET avatar_url = NULL WHERE id = %s
            RETURNING id, username, email, first_name, avatar_url;
        """, (user_id,))
        return cursor.fetchone()


def get_workspaces_by_member(user_id, limit, offset):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT w.id, w.owner_id, w.name, w.created_at, w.icon_type, w.icon_value, w.color
                FROM workspaces AS w
                JOIN workspace_members AS m ON m.workspace_id = w.id
                WHERE m.user_id = %s
                ORDER BY w.id
                LIMIT %s
                OFFSET %s;
                """,
                (user_id, limit, offset),
            )
            return cursor.fetchall()


def get_workspace_by_id(workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, owner_id, name, created_at, icon_type, icon_value, color
                FROM workspaces
                WHERE id = %s;
                """,
                (workspace_id,),
            )
            return cursor.fetchone()


def delete_workspace_db(workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM workspaces
                WHERE id = %s
                RETURNING id;
                """,
                (workspace_id,),
            )
            return cursor.fetchone()


def update_workspace(workspace_id, name):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE workspaces
                SET name = %s
                WHERE id = %s
                RETURNING id, owner_id, name, created_at, icon_type, icon_value, color;
                """,
                (
                    name,
                    workspace_id,
                ),
            )
            return cursor.fetchone()


def create_project(workspace_id, name, description):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            INSERT INTO projects (workspace_id, name, description)
            VALUES (%s, %s, %s)
            RETURNING id, workspace_id, name, description, created_at;
            """,
                (
                    workspace_id,
                    name,
                    description,
                ),
            )
            return cursor.fetchone()


def get_projects_by_workspace(workspace_id, limit, offset):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            SELECT id, workspace_id, name, description, created_at
            FROM projects
            WHERE workspace_id = %s
            ORDER BY id
            LIMIT %s
            OFFSET %s;
            """,
                (workspace_id, limit, offset),
            )
            return cursor.fetchall()


def get_project_by_id(project_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            SELECT id, workspace_id, name, description, created_at
            FROM projects
            WHERE id = %s
            """,
                (project_id,),
            )
            return cursor.fetchone()


def update_project_db(project_id, name, description):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            UPDATE projects
            SET name = %s, description = %s
            WHERE id = %s
            RETURNING id, workspace_id, name, description, created_at;
            """,
                (
                    name,
                    description,
                    project_id,
                ),
            )
            return cursor.fetchone()


def delete_project_db(project_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            DELETE FROM projects
            WHERE id = %s
            RETURNING id;
            """,
                (project_id,),
            )
            return cursor.fetchone()


def create_task(
    project_id,
    creator_id,
    assignee_id,
    title,
    description,
    status,
    priority,
    color,
    due_date,
):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            INSERT INTO tasks (
                project_id, creator_id, assignee_id, title, description,
                status, priority, color, due_date
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, project_id, creator_id, assignee_id, title,
                description, status, priority, due_date, color;
            """,
                (
                    project_id,
                    creator_id,
                    assignee_id,
                    title,
                    description,
                    status,
                    priority,
                    color,
                    due_date,
                ),
            )
            return cursor.fetchone()


def get_tasks_by_project(project_id, limit, offset):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, project_id, creator_id, assignee_id, title,
                       description, status, priority, due_date, color
                FROM tasks
                WHERE project_id = %s
                ORDER BY id
                LIMIT %s
                OFFSET %s;
                """,
                (project_id, limit, offset),
            )
            return cursor.fetchall()


def get_task_by_id(task_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            SELECT id, project_id, creator_id, assignee_id, title,
                description, status, priority, due_date, color
            FROM tasks
            WHERE id = %s
            """,
                (task_id,),
            )
            return cursor.fetchone()


TASK_EDITABLE_FIELDS = {"title", "description", "status", "priority", "due_date", "assignee_id", "color"}


def update_task_db(task_id, changes):
    """Only update supplied fields; simultaneous edits to other fields are preserved."""
    from psycopg import sql

    if not changes or not set(changes).issubset(TASK_EDITABLE_FIELDS):
        raise ValueError("Invalid task update fields")
    assignments = sql.SQL(", ").join(
        sql.SQL("{} = %s").format(sql.Identifier(field)) for field in changes
    )
    query = sql.SQL("""
        UPDATE tasks SET {}, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        RETURNING id, project_id, creator_id, assignee_id, title,
                  description, status, priority, due_date, color
    """).format(assignments)
    with get_db_connection() as connection, connection.cursor() as cursor:
        cursor.execute(query, [*changes.values(), task_id])
        return cursor.fetchone()


def delete_task(task_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            DELETE FROM tasks
            WHERE id = %s
            RETURNING id;
            """,
                (task_id,),
            )
            return cursor.fetchone()


def add_workspace_member(workspace_id, user_id, role):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO workspace_members (workspace_id, user_id, role)
                VALUES (%s, %s, %s)
                RETURNING id, workspace_id, user_id, role, joined_at;
                """,
                (workspace_id, user_id, role),
            )
            return cursor.fetchone()


def get_workspace_member(workspace_id, user_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, workspace_id, user_id, role, joined_at
                FROM workspace_members
                WHERE workspace_id = %s
                AND user_id = %s
                """,
                (workspace_id, user_id),
            )
            return cursor.fetchone()


def get_workspace_members(workspace_id, limit, offset):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.joined_at, u.username, u.avatar_url
                FROM workspace_members AS wm
                JOIN users AS u
                    ON u.id = wm.user_id
                WHERE wm.workspace_id = %s
                ORDER BY wm.id
                LIMIT %s
                OFFSET %s;
                """,
                (workspace_id, limit, offset),
            )
            return cursor.fetchall()


def create_workspace_with_owner(owner_id, name):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO workspaces (owner_id, name)
                VALUES (%s, %s)
                RETURNING id, owner_id, name, created_at, icon_type, icon_value, color;
                """,
                (owner_id, name),
            )
            workspace = cursor.fetchone()

            cursor.execute(
                """
                INSERT INTO workspace_members (workspace_id, user_id, role)
                VALUES (%s, %s, 'owner');
                """,
                (workspace[0], owner_id),
            )
            return workspace


def update_workspace_icon_db(workspace_id, icon_type, icon_value):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE workspaces
                SET icon_type = %s, icon_value = %s
                WHERE id = %s
                RETURNING id, owner_id, name, created_at, icon_type, icon_value, color;
                """,
                (icon_type, icon_value, workspace_id),
            )
            return cursor.fetchone()


def update_workspace_member_role(workspace_id, user_id, role):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE workspace_members
                SET role = %s
                WHERE workspace_id = %s 
                AND user_id = %s
                RETURNING id, workspace_id, user_id, role, joined_at;
                """,
                (role, workspace_id, user_id),
            )
            return cursor.fetchone()


def delete_workspace_member(workspace_id, user_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                    DELETE FROM workspace_members
                    WHERE workspace_id = %s AND user_id = %s
                    RETURNING id;
                    """,
                (workspace_id, user_id),
            )
            return cursor.fetchone()


def transfer_workspace_owner(owner_id, workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                    UPDATE workspaces
                    SET owner_id = %s
                    WHERE id = %s
                    RETURNING id, owner_id, name, created_at, icon_type, icon_value, color;
                    """,
                (owner_id, workspace_id),
            )
            return cursor.fetchone()


def create_session(user_id, session_token, expires_at):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO sessions (user_id, session_token, expires_at)
                VALUES (%s, %s, %s)
                RETURNING id, user_id, session_token, created_at;
                """,
                (user_id, session_token, expires_at),
            )
            return cursor.fetchone()


def get_session_by_token(session_token):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, user_id, session_token, created_at, expires_at, revoked
                FROM sessions
                WHERE session_token = %s;
                """,
                (session_token,),
            )
            return cursor.fetchone()


def revoke_session(session_token):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE sessions
                SET revoked = TRUE
                WHERE session_token = %s
                RETURNING id, user_id, session_token, created_at, expires_at, revoked;
                """,
                (session_token,),
            )
            return cursor.fetchone()
