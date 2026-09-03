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


def create_workspace(owner_id, name):
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
            return cursor.fetchone()


def get_workspaces_by_owner(owner_id):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, owner_id, name, created_at
                FROM workspaces
                WHERE owner_id = %s;
                """,
                (owner_id,),
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
