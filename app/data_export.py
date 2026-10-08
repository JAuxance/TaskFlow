"""A bounded, read-only copy of the signed-in user's application data."""
import json
from datetime import date, datetime, timezone

from psycopg.rows import dict_row

from app.db import get_db_connection

MAX_EXPORT_ROWS = 5000
MAX_EXPORT_BYTES = 5 * 1024 * 1024


def collect_user_data(user_id):
    result = {
        "format_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "tasks": "Tasks created by or assigned to you in workspaces you can currently access.",
            "messages": "Messages you sent; other people's messages are not included.",
            "other_data": "Images are referenced by path. Contact the operator for image copies, logs or other data not included here.",
            "database_dates": "Dates without an offset use the database time zone indicated below.",
        },
    }
    queries = [
        ("profile", """SELECT id, username, email, first_name, avatar_url, created_at
                       FROM users WHERE id = %(user)s"""),
        ("memberships", """SELECT m.workspace_id, w.name AS workspace_name, m.role, m.joined_at
            FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
            WHERE m.user_id = %(user)s ORDER BY m.id"""),
        ("tasks", """SELECT t.id, t.project_id, p.workspace_id, t.title, t.description,
            t.status, t.priority, t.color, t.due_date, t.created_at, t.updated_at,
            (t.creator_id = %(user)s) IS TRUE AS created_by_me,
            (t.assignee_id = %(user)s) IS TRUE AS assigned_to_me
            FROM tasks t JOIN projects p ON p.id = t.project_id
            WHERE (t.creator_id = %(user)s OR t.assignee_id = %(user)s)
            AND EXISTS (SELECT 1 FROM workspace_members m
                WHERE m.workspace_id = p.workspace_id AND m.user_id = %(user)s)
            ORDER BY t.id"""),
        ("workspace_messages", """SELECT id, workspace_id, content, created_at
            FROM workspace_messages WHERE user_id = %(user)s ORDER BY id"""),
        ("sent_direct_messages", """SELECT id, receiver_id, content, created_at
            FROM direct_messages WHERE sender_id = %(user)s ORDER BY id"""),
    ]
    rows_read = 0
    bytes_read = len(json.dumps(result).encode())
    with get_db_connection() as connection:
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        result["database_timezone"] = connection.execute("SHOW TIMEZONE").fetchone()[0]
        for name, query in queries:
            result[name] = []
            # A server cursor reads one row at a time rather than loading an entire table.
            with connection.cursor(name="data_export", row_factory=dict_row) as cursor:
                cursor.execute(query, {"user": user_id})
                while row := cursor.fetchone():
                    row = {key: value.isoformat() if isinstance(value, (date, datetime)) else value
                           for key, value in row.items()}
                    rows_read += 1
                    bytes_read += len(json.dumps(row, ensure_ascii=True).encode()) + 2
                    if rows_read > MAX_EXPORT_ROWS or bytes_read > MAX_EXPORT_BYTES:
                        return None, "too_large"
                    result[name].append(row)
        if not result["profile"]:
            return None, "not_found"
        result["profile"] = result["profile"][0]
    # Include metadata and separators in the final size check. Never send a partial export.
    if len(json.dumps(result, ensure_ascii=True).encode()) > MAX_EXPORT_BYTES:
        return None, "too_large"
    return result, None
