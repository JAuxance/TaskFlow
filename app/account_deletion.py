"""Account preview and deletion; shared workspaces must be handled first."""
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.db import get_db_connection
from app.deletion_log import commit_deletion
from app.file_cleanup import generated_upload


def deletion_preview(user_id):
    with get_db_connection() as connection, connection.cursor() as cursor:
        cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        cursor.execute("SELECT avatar_url FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if user is None:
            return None
        cursor.execute("""
            SELECT w.id, w.name, w.icon_type, w.icon_value,
                (SELECT count(*) FROM workspace_members m
                 WHERE m.workspace_id = w.id AND m.user_id <> %s)
            FROM workspaces w WHERE w.owner_id = %s ORDER BY w.id
        """, (user_id, user_id))
        workspaces = cursor.fetchall()
        blocked = [{"id": row[0], "name": row[1], "other_members": row[4]}
                   for row in workspaces if row[4]]
        solo = [{"id": row[0], "name": row[1]} for row in workspaces if not row[4]]
        solo_ids = [row["id"] for row in solo]
        cursor.execute("""
            SELECT
              (SELECT count(*) FROM sessions WHERE user_id = %(user)s),
              (SELECT count(*) FROM direct_messages
               WHERE sender_id = %(user)s OR receiver_id = %(user)s),
              (SELECT count(*) FROM projects WHERE workspace_id = ANY(%(solo)s)),
              (SELECT count(*) FROM tasks t JOIN projects p ON p.id = t.project_id
               WHERE p.workspace_id = ANY(%(solo)s)),
              (SELECT count(*) FROM workspace_messages WHERE workspace_id = ANY(%(solo)s)),
              (SELECT count(*) FROM tasks t JOIN projects p ON p.id = t.project_id
               JOIN workspaces w ON w.id = p.workspace_id
               WHERE w.owner_id <> %(user)s
                 AND (t.creator_id = %(user)s OR t.assignee_id = %(user)s)),
              (SELECT count(*) FROM workspace_messages m
               JOIN workspaces w ON w.id = m.workspace_id
               WHERE w.owner_id <> %(user)s AND m.user_id = %(user)s)
        """, {"user": user_id, "solo": solo_ids})
        counts = dict(zip(("sessions", "direct_messages", "projects", "tasks",
                           "workspace_messages", "retained_tasks", "retained_messages"),
                          cursor.fetchone()))
        counts["images"] = int(generated_upload(user[0], "avatars", user_id))
        counts["images"] += sum(row[2] == "image" and
                                generated_upload(row[3], "workspace_icons", row[0])
                                for row in workspaces if not row[4])
        return {"can_delete": not blocked, "blocked_workspaces": blocked,
                "workspaces_to_delete": solo, "counts": counts}


def delete_user_account(user_id, password, confirmed_workspace_ids):
    """Check the password and membership under locks, then commit all SQL changes."""
    def prepare(mark):
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '3s'")
            cursor.execute(
                "SELECT password_hash, avatar_url, email FROM users WHERE id = %s FOR UPDATE",
                (user_id,),
            )
            user = cursor.fetchone()
            if user is None:
                return "not_found"
            try:
                PasswordHasher().verify(user[0], password)
            except VerifyMismatchError:
                return "incorrect_password"
            # FOR UPDATE also blocks foreign-key checks for new memberships/projects.
            # The next statement sees members committed before we obtained these locks.
            cursor.execute("""
                SELECT id, icon_type, icon_value FROM workspaces
                WHERE owner_id = %s ORDER BY id FOR UPDATE
            """, (user_id,))
            workspaces = cursor.fetchall()
            workspace_ids = [row[0] for row in workspaces]
            cursor.execute("""
                SELECT 1 FROM workspace_members
                WHERE workspace_id = ANY(%s) AND user_id <> %s LIMIT 1
            """, (workspace_ids, user_id))
            if cursor.fetchone():
                return "shared_workspaces"
            if sorted(confirmed_workspace_ids) != workspace_ids:
                return "preview_changed"
            images = []
            if generated_upload(user[1], "avatars", user_id):
                images.append(user[1])
            for workspace_id, kind, value in workspaces:
                if kind == "image" and generated_upload(value, "workspace_icons", workspace_id):
                    images.append(value)
            for image in images:
                cursor.execute("""
                    INSERT INTO file_cleanup_jobs (path) VALUES (%s)
                    ON CONFLICT (path) DO NOTHING
                """, (image,))
            mark(user_id, user[2])
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        return None

    return commit_deletion(prepare)
