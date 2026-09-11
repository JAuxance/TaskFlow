import os
import psycopg


def get_db_connection():
    """
    Establishes a connection to the PostgreSQL database using psycopg.

    Returns:
        psycopg.Connection: A connection object to interact with the database.
    """
    # Retrieve database connection parameters from environment variables
    db_host = os.getenv("DATABASE_HOST", os.getenv("DB_HOST", "localhost"))
    db_port = os.getenv("DATABASE_PORT", os.getenv("DB_PORT", "5432"))
    db_name = os.getenv("DATABASE_NAME", os.getenv("DB_NAME", "mydatabase"))
    db_user = os.getenv("DATABASE_USER", os.getenv("DB_USER", "myuser"))
    db_password = os.getenv("DATABASE_PASSWORD", os.getenv("DB_PASSWORD", "mypassword"))

    # Create a connection string
    conn_str = (
        f"host={db_host} port={db_port} dbname={db_name} "
        f"user={db_user} password={db_password}"
    )

    # Establish and return the database connection
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
                SELECT id, username, email
                FROM users
                WHERE id = %s;
                """,
                (user_id,),
            )
            return cursor.fetchone()


def get_workspaces_by_member(user_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT w.id, w.owner_id, w.name, w.created_at
                FROM workspaces AS w
                JOIN workspace_members AS m ON m.workspace_id = w.id
                WHERE m.user_id = %s;
                """,
                (user_id,),
            )
            return cursor.fetchall()


def get_workspace_by_id(workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, owner_id, name, created_at
                FROM workspaces
                WHERE id = %s;
                """,
                (workspace_id,),
            )
            return cursor.fetchone()


def delet_workspace(workspace_id):
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
                RETURNING id, owner_id, name, created_at;
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


def get_projects_by_workspace(workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            SELECT id, workspace_id, name, description, created_at
            FROM projects
            WHERE workspace_id = %s
            """,
                (workspace_id,),
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


def deleted_project(project_id):
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
    project_id, creator_id, assignee_id, title, description, status, priority, due_date
):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            INSERT INTO tasks (
                project_id, creator_id, assignee_id, title, description,
                status, priority, due_date
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, project_id, title, description, status, priority, due_date;
            """,
                (
                    project_id,
                    creator_id,
                    assignee_id,
                    title,
                    description,
                    status,
                    priority,
                    due_date,
                ),
            )
            return cursor.fetchone()


def get_tasks_by_project(project_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            SELECT id, project_id, creator_id, assignee_id, title,
                description, status, priority, due_date
            FROM tasks
            WHERE project_id = %s
            """,
                (project_id,),
            )
            return cursor.fetchall()


def get_task_by_id(task_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            SELECT id, project_id, creator_id, assignee_id, title,
                description, status, priority, due_date
            FROM tasks
            WHERE id = %s
            """,
                (task_id,),
            )
            return cursor.fetchone()


def update_task_db(task_id, title, description, status, priority, due_date):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
            UPDATE tasks
            SET title = %s, description = %s, status = %s, priority = %s, due_date = %s
            WHERE id = %s
            RETURNING id, project_id, creator_id, assignee_id, title,
                description, status, priority, due_date;
            """,
                (
                    title,
                    description,
                    status,
                    priority,
                    due_date,
                    task_id,
                ),
            )
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


def get_workspace_members(workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, workspace_id, user_id, role, joined_at
                FROM workspace_members
                WHERE workspace_id = %s
                """,
                (workspace_id,),
            )
            return cursor.fetchall()


def create_workspace_with_owner(owner_id, name):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO workspaces (owner_id, name)
                VALUES (%s, %s)
                RETURNING id, owner_id, name, created_at;
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


def update_role_member(workspace_id, user_id, role):
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


def delete_member_db(workspace_id, user_id):
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


def crowned_king(owner_id, workspace_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                    UPDATE workspaces
                    SET owner_id = %s
                    WHERE id = %s
                    RETURNING id, owner_id, name, created_at;
                    """,
                (owner_id, workspace_id),
            )
            return cursor.fetchone()
