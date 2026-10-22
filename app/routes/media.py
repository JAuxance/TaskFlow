from pathlib import Path

from flask import Blueprint, current_app, send_from_directory

from app.db import get_db_connection
from app.permissions import get_authenticated_user, resource_not_found

media_bp = Blueprint("media", __name__)


def _avatar_visible(user_id, stored_path):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM users AS owner
                WHERE owner.avatar_url = %s
                  AND (
                    owner.id = %s
                    OR EXISTS (
                        SELECT 1
                        FROM workspace_members AS mine
                        JOIN workspace_members AS theirs
                            ON mine.workspace_id = theirs.workspace_id
                        WHERE mine.user_id = %s
                          AND theirs.user_id = owner.id
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM direct_messages
                        WHERE (sender_id = %s AND receiver_id = owner.id)
                           OR (sender_id = owner.id AND receiver_id = %s)
                    )
                  )
                LIMIT 1;
                """,
                (stored_path, user_id, user_id, user_id, user_id),
            )
            return cursor.fetchone() is not None


def _icon_visible(user_id, stored_path):
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM workspaces AS workspace
                JOIN workspace_members AS member
                    ON member.workspace_id = workspace.id
                WHERE workspace.icon_value = %s
                  AND member.user_id = %s
                LIMIT 1;
                """,
                (stored_path, user_id),
            )
            return cursor.fetchone() is not None


@media_bp.route("/static/avatars/<filename>", methods=["GET"])
def get_avatar(filename):
    user_id, error = get_authenticated_user()
    if error:
        return error
    stored_path = f"/static/avatars/{filename}"
    if not _avatar_visible(user_id, stored_path):
        return resource_not_found()
    return send_from_directory(Path(current_app.static_folder) / "avatars", filename)


@media_bp.route("/static/workspace_icons/<filename>", methods=["GET"])
def get_workspace_icon(filename):
    user_id, error = get_authenticated_user()
    if error:
        return error
    stored_path = f"/static/workspace_icons/{filename}"
    if not _icon_visible(user_id, stored_path):
        return resource_not_found()
    return send_from_directory(
        Path(current_app.static_folder) / "workspace_icons", filename
    )
