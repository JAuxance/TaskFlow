#!/usr/bin/env python3
"""Delete expired sessions and unreferenced upload files."""

import os
import re
import sys
import time
from pathlib import Path

import psycopg

UPLOAD_NAME = re.compile(r"^[0-9]+_[a-f0-9]{32}\.(jpg|jpeg|png|webp)$")
UPLOAD_DIRS = ("avatars", "workspace_icons")
ENV_VARS = (
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
)


def main():
    missing = [name for name in ENV_VARS if not os.environ.get(name)]
    if missing:
        sys.exit("Missing environment variables: " + ", ".join(missing))

    repo_root = Path(__file__).resolve().parent.parent
    upload_root = Path(os.environ.get("UPLOAD_ROOT", repo_root / "app" / "static"))

    with psycopg.connect(
        host=os.environ["DATABASE_HOST"],
        port=os.environ["DATABASE_PORT"],
        dbname=os.environ["DATABASE_NAME"],
        user=os.environ["DATABASE_USER"],
        password=os.environ["DATABASE_PASSWORD"],
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM sessions
                WHERE expires_at < now()
                   OR (revoked = true AND created_at < now() - interval '7 days')
                """
            )
            sessions_removed = cursor.rowcount
            cursor.execute(
                """
                SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL
                UNION
                SELECT icon_value FROM workspaces WHERE icon_value IS NOT NULL
                """
            )
            referenced = {row[0] for row in cursor.fetchall()}

        files_removed = 0
        for folder in UPLOAD_DIRS:
            directory = upload_root / folder
            if not directory.is_dir():
                continue
            for path in directory.iterdir():
                if not path.is_file() or UPLOAD_NAME.fullmatch(path.name) is None:
                    continue
                if time.time() - path.stat().st_mtime <= 24 * 60 * 60:
                    continue
                static_path = f"/static/{folder}/{path.name}"
                if static_path in referenced:
                    continue
                path.unlink()
                files_removed += 1

    print(f"sessions removed: {sessions_removed}")
    print(f"files removed: {files_removed}")


if __name__ == "__main__":
    main()
