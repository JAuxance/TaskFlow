"""Account deletions kept outside the database so a restore can replay them."""
import fcntl
import os
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from app.db import get_db_connection

RETENTION = timedelta(days=30)
_threads = threading.Lock()


def _before_replace():
    return None


def log_path():
    return Path(os.getenv("DELETION_LOG_PATH", "/var/taskflow/deletions.log"))


def commit_deletion(prepare):
    """Run prepare(mark). mark(user_id, email) stores the trace before SQL commits.

    A disk error leaves the account in place. If SQL then fails, the trace is removed
    so a later restore does not delete an account that is still there.
    """
    line = None

    def mark(user_id, email):
        nonlocal line
        line = record_account_deletion(user_id, email)

    try:
        return prepare(mark)
    except OSError:
        if line is not None:
            cancel_account_deletion(line)
        return "log_failed"
    except Exception:
        if line is not None:
            cancel_account_deletion(line)
        raise


def record_account_deletion(user_id, email):
    now = datetime.now(timezone.utc)
    line = f"{now.strftime('%Y-%m-%dT%H:%M:%SZ')}\t{user_id}\t{email}\t{uuid4().hex}\n"
    try:
        with _locked() as path:
            lines = [item for item in _read(path) if _kept(item, now)]
            lines.append(line)
            _rewrite(path, lines)
    except OSError:
        try:
            cancel_account_deletion(line)
        except OSError:
            pass
        raise
    return line


def cancel_account_deletion(line):
    with _locked() as path:
        remaining = []
        removed = False
        for item in _read(path):
            if not removed and item == line:
                removed = True
                continue
            remaining.append(item)
        _rewrite(path, remaining)


def recorded_deletions():
    """Return (user id, email) for traces that are still inside the retention window."""
    now = datetime.now(timezone.utc)
    found = []
    for line in _read(log_path()):
        if not _kept(line, now):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3 or not parts[2]:
            continue
        try:
            found.append((int(parts[1]), parts[2]))
        except ValueError:
            continue
    return found


def reapply_recorded_deletions():
    """Remove the recorded accounts. A reused email on another id is left in place."""
    deletions = recorded_deletions()
    with get_db_connection() as connection, connection.cursor() as cursor:
        for user_id, email in deletions:
            cursor.execute("""
                SELECT 1 FROM workspaces AS owned
                WHERE owned.owner_id = %s
                  AND EXISTS (
                    SELECT 1 FROM workspace_members AS member
                    WHERE member.workspace_id = owned.id
                      AND member.user_id <> owned.owner_id
                  )
                LIMIT 1
            """, (user_id,))
            if cursor.fetchone():
                raise RuntimeError(
                    "Refusing to replay a deletion: a restored workspace still has other members"
                )
            cursor.execute("DELETE FROM users WHERE id = %s AND email = %s", (user_id, email))
    return len(deletions)


def delete_account_by_email(email):
    """Administrative deletion. Refuses a workspace that still has other members."""
    def prepare(mark):
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE email = %s FOR UPDATE", (email,))
            row = cursor.fetchone()
            if row is None:
                return "not_found"
            user_id = row[0]
            cursor.execute("""
                SELECT 1 FROM workspaces AS owned
                WHERE owned.owner_id = %s AND EXISTS (
                    SELECT 1 FROM workspace_members AS member
                    WHERE member.workspace_id = owned.id
                      AND member.user_id <> owned.owner_id
                ) LIMIT 1
            """, (user_id,))
            if cursor.fetchone():
                return "shared_workspaces"
            mark(user_id, email)
            cursor.execute("DELETE FROM workspaces WHERE owner_id = %s", (user_id,))
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        return None

    return commit_deletion(prepare)


@contextmanager
def _locked():
    path = log_path()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.stat().st_uid == os.getuid():
        path.parent.chmod(0o700)
    lock_path = path.with_name(path.name + ".lock")
    with _threads:
        with open(lock_path, "a+", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                yield path
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _rewrite(path, lines):
    _before_replace()
    temporary = path.with_name(path.name + ".tmp")
    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write("".join(lines))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    path.chmod(0o600)


def _read(path):
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines(keepends=True)


def _kept(line, now):
    stamp = line.split("\t", 1)[0]
    try:
        when = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return now - when <= RETENTION
