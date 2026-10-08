"""Retry deleted-account image removal without keeping profile data."""
import posixpath
import re
from pathlib import Path
from urllib.parse import unquote

from flask import abort, request

from app.db import get_db_connection

UPLOAD_PATTERN = r"/static/(avatars|workspace_icons)/[0-9]+_[a-f0-9]{32}\.(jpg|jpeg|png|webp)"


def generated_upload(path, folder, owner_id):
    return bool(isinstance(path, str) and re.fullmatch(
        rf"/static/{folder}/{owner_id}_[a-f0-9]{{32}}\.(jpg|jpeg|png|webp)", path))


def cleanup_deleted_files(static_folder, limit=100):
    removed = 0
    failed = 0
    with get_db_connection() as connection, connection.cursor() as cursor:
        cursor.execute("""
            SELECT path FROM file_cleanup_jobs ORDER BY created_at, path
            LIMIT %s FOR UPDATE SKIP LOCKED
        """, (limit,))
        for (path,) in cursor.fetchall():
            if not re.fullmatch(UPLOAD_PATTERN, path):
                failed += 1
                continue
            try:
                (Path(static_folder) / path.removeprefix("/static/")).unlink(missing_ok=True)
            except OSError:
                failed += 1
                cursor.execute("UPDATE file_cleanup_jobs SET attempts = attempts + 1 WHERE path = %s",
                               (path,))
                continue
            cursor.execute("DELETE FROM file_cleanup_jobs WHERE path = %s", (path,))
            removed += 1
    return {"removed": removed, "failed": failed}


def configure_file_cleanup(app):
    @app.before_request
    def hide_private_uploads():
        # The generic static route also matches spellings such as "/static/avatars/./file.png".
        # Those files are only served by the authenticated media routes.
        if request.endpoint != "static":
            return None
        filename = unquote(request.view_args.get("filename") or "")
        normalized = posixpath.normpath(filename.replace("\\", "/")).lstrip("/")
        if (
            normalized.startswith(("avatars/", "workspace_icons/"))
            or filename.replace("\\", "/").startswith(("avatars/", "workspace_icons/"))
        ):
            abort(404)
        return None

    @app.cli.command("cleanup-deleted-files")
    def cleanup_command():
        """Retry up to 100 queued image removals; no profile data is printed."""
        import click
        result = cleanup_deleted_files(app.static_folder)
        click.echo(f"Removed: {result['removed']}; failed: {result['failed']}")
        if result["failed"]:
            raise click.ClickException("Some files still need cleanup; check disk permissions and retry.")
