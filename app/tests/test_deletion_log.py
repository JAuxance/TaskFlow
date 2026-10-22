import multiprocessing
import stat
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import app.deletion_log as deletion_log
from app.deletion_log import (
    commit_deletion,
    record_account_deletion,
    recorded_deletions,
    reapply_recorded_deletions,
)


def test_deletion_record_is_outside_the_database_and_drops_old_lines(tmp_path, monkeypatch):
    path = tmp_path / "deletions.log"
    monkeypatch.setenv("DELETION_LOG_PATH", str(path))
    old = datetime.now(timezone.utc) - timedelta(days=31)
    path.write_text(f"{old.strftime('%Y-%m-%dT%H:%M:%SZ')}\t1\tgone@example.com\n", encoding="utf-8")
    record_account_deletion(7, "person@example.com")
    text = path.read_text(encoding="utf-8")
    assert "gone@example.com" not in text
    assert "\t7\tperson@example.com\t" in text
    assert recorded_deletions() == [(7, "person@example.com")]
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700


def test_concurrent_threads_keep_both_deletion_traces(tmp_path, monkeypatch):
    path = tmp_path / "deletions.log"
    monkeypatch.setenv("DELETION_LOG_PATH", str(path))
    monkeypatch.setattr(deletion_log, "_before_replace", lambda: time.sleep(0.2))
    errors = []

    def record(user_id, email):
        try:
            record_account_deletion(user_id, email)
        except Exception as error:
            errors.append(error)

    threads = [
        threading.Thread(target=record, args=(1, "one@example.com")),
        threading.Thread(target=record, args=(2, "two@example.com")),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    assert [thread.is_alive() for thread in threads] == [False, False]
    assert errors == []
    assert set(recorded_deletions()) == {(1, "one@example.com"), (2, "two@example.com")}


def _record_in_child(path, user_id, email):
    import os
    import time
    os.environ["DELETION_LOG_PATH"] = path
    import app.deletion_log as child_log
    child_log._before_replace = lambda: time.sleep(0.2)
    child_log.record_account_deletion(user_id, email)


def test_concurrent_processes_keep_both_deletion_traces(tmp_path, monkeypatch):
    path = tmp_path / "deletions.log"
    monkeypatch.setenv("DELETION_LOG_PATH", str(path))
    context = multiprocessing.get_context("fork")
    processes = [
        context.Process(target=_record_in_child, args=(str(path), 1, "one@example.com")),
        context.Process(target=_record_in_child, args=(str(path), 2, "two@example.com")),
    ]
    for process in processes:
        process.start()
    for process in processes:
        process.join(timeout=15)
    assert [process.exitcode for process in processes] == [0, 0]
    assert set(recorded_deletions()) == {(1, "one@example.com"), (2, "two@example.com")}


def test_write_failure_skips_sql_and_leaves_no_trace(tmp_path, monkeypatch):
    blocked = tmp_path / "blocked"
    blocked.write_text("not a directory")
    monkeypatch.setenv("DELETION_LOG_PATH", str(blocked / "deletions.log"))
    called = []

    def prepare(mark):
        mark(4, "kept@example.com")
        called.append("sql")

    assert commit_deletion(prepare) == "log_failed"
    assert called == []


def test_sql_failure_removes_the_trace(tmp_path, monkeypatch):
    monkeypatch.setenv("DELETION_LOG_PATH", str(tmp_path / "deletions.log"))

    def prepare(mark):
        mark(4, "kept@example.com")
        raise RuntimeError("sql down")

    with pytest.raises(RuntimeError, match="sql down"):
        commit_deletion(prepare)
    assert recorded_deletions() == []


def test_reapply_targets_the_recorded_account_id(tmp_path, monkeypatch):
    monkeypatch.setenv("DELETION_LOG_PATH", str(tmp_path / "deletions.log"))
    record_account_deletion(1, "reused@example.com")
    cursor = _Cursor()
    monkeypatch.setattr(deletion_log, "get_db_connection", lambda: _Connection(cursor))
    assert reapply_recorded_deletions() == 1
    delete = cursor.queries[-1]
    assert "WHERE id = %s AND email = %s" in delete[0]
    assert delete[1] == (1, "reused@example.com")


class _Cursor:
    def __init__(self):
        self.queries = []

    def execute(self, query, params=()):
        self.queries.append((query, params))

    def fetchone(self):
        return None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Connection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_restore_script_waits_for_a_real_confirmation():
    root = Path(__file__).resolve().parents[2]
    script = (root / "scripts/restore.sh").read_text(encoding="utf-8")
    assert "CONFIRM=yes" not in script
    assert "docker compose" in script and "run --rm --no-deps" in script
    assert "exec -T backend" not in script
    result = subprocess.run(["bash", str(root / "scripts/restore.sh")], capture_output=True, text=True)
    assert result.returncode == 1
    assert "--confirm" in result.stderr
