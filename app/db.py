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
    conn_str = f"host={db_host} port={db_port} dbname={db_name} user={db_user} password={db_password}"

    # Establish and return the database connection
    return psycopg.connect(conn_str)