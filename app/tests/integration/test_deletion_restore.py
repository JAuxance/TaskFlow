"""Backup, profile deletion, isolated restore, then replay from the external log."""
import os
import subprocess
from pathlib import Path

import pytest

if os.getenv("TASKFLOW_INTEGRATION") != "1":
    pytest.skip("Set TASKFLOW_INTEGRATION=1 for the disposable local DB", allow_module_level=True)

import requests

from app.account_deletion import delete_user_account
from app.deletion_log import reapply_recorded_deletions
from app.tests.integration.support import PASSWORD, schema, site, sql

REPO = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="module", autouse=True)
def disposable_schema(schema):
    return schema


def compose(*args, **kwargs):
    return subprocess.run(
        ["docker", "compose", "-f", "compose.integration.yaml", "exec", "-T", "db", *args],
        cwd=REPO, check=True, **kwargs,
    )


def test_profile_deletion_survives_an_isolated_restore(site, tmp_path, monkeypatch):
    log = tmp_path / "deletions.log"
    monkeypatch.setenv("DELETION_LOG_PATH", str(log))
    client = requests.Session()
    site["sessions"].append(client)
    site["request"](client, "POST", "/api/users", {
        "username": "restoreme", "email": "restoreme@example.com", "password": PASSWORD,
    }, 201)
    dump = tmp_path / "before.dump"
    with dump.open("wb") as handle:
        compose("pg_dump", "-Fc", "-U", "taskflow_test", "-d", "taskflow_integration_test", stdout=handle)
    site["request"](client, "DELETE", "/api/users/me", {"password": PASSWORD})
    assert sql("SELECT id FROM users WHERE email = %s", ("restoreme@example.com",)) == []
    assert "restoreme@example.com" in log.read_text(encoding="utf-8")
    sql("""
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
    """)
    with dump.open("rb") as handle:
        compose(
            "pg_restore", "--exit-on-error", "--clean", "--if-exists",
            "-U", "taskflow_test", "-d", "taskflow_integration_test", stdin=handle,
        )
    assert sql("SELECT id FROM users WHERE email = %s", ("restoreme@example.com",)) != []
    reapply_recorded_deletions()
    assert sql("SELECT id FROM users WHERE email = %s", ("restoreme@example.com",)) == []


def test_log_write_failure_keeps_the_profile(site, tmp_path, monkeypatch):
    blocked = tmp_path / "blocked"
    blocked.write_text("not a directory")
    monkeypatch.setenv("DELETION_LOG_PATH", str(blocked / "deletions.log"))
    client = requests.Session()
    site["sessions"].append(client)
    site["request"](client, "POST", "/api/users", {
        "username": "keptuser", "email": "kept@example.com", "password": PASSWORD,
    }, 201)
    site["request"](client, "DELETE", "/api/users/me", {"password": PASSWORD}, 500)
    assert sql("SELECT id FROM users WHERE email = %s", ("kept@example.com",)) != []


def test_sql_failure_keeps_the_profile_and_drops_the_trace(site, tmp_path, monkeypatch):
    log = tmp_path / "deletions.log"
    monkeypatch.setenv("DELETION_LOG_PATH", str(log))
    sql("""
        CREATE OR REPLACE FUNCTION taskflow_reject_user_delete() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'simulated sql failure';
        END $$ LANGUAGE plpgsql
    """)
    sql("""
        CREATE TRIGGER taskflow_reject_user_delete
        BEFORE DELETE ON users
        FOR EACH ROW EXECUTE FUNCTION taskflow_reject_user_delete()
    """)
    client = requests.Session()
    site["sessions"].append(client)
    try:
        created = site["request"](client, "POST", "/api/users", {
            "username": "sqlfail", "email": "sqlfail@example.com", "password": PASSWORD,
        }, 201)
        with pytest.raises(Exception, match="simulated sql failure"):
            delete_user_account(created["id"], PASSWORD, [])
        assert sql("SELECT id FROM users WHERE email = %s", ("sqlfail@example.com",)) != []
        text = log.read_text(encoding="utf-8") if log.exists() else ""
        assert "sqlfail@example.com" not in text
        reapply_recorded_deletions()
        assert sql("SELECT id FROM users WHERE email = %s", ("sqlfail@example.com",)) != []
    finally:
        sql("DROP TRIGGER IF EXISTS taskflow_reject_user_delete ON users")
        sql("DROP FUNCTION IF EXISTS taskflow_reject_user_delete()")


def test_reapply_keeps_a_new_account_with_the_same_email(site, tmp_path, monkeypatch):
    log = tmp_path / "deletions.log"
    monkeypatch.setenv("DELETION_LOG_PATH", str(log))
    first = requests.Session()
    site["sessions"].append(first)
    old = site["request"](first, "POST", "/api/users", {
        "username": "oldperson", "email": "reused@example.com", "password": PASSWORD,
    }, 201)
    site["request"](first, "DELETE", "/api/users/me", {"password": PASSWORD})
    assert f"\t{old['id']}\t" in log.read_text(encoding="utf-8")
    second = requests.Session()
    site["sessions"].append(second)
    new = site["request"](second, "POST", "/api/users", {
        "username": "newperson", "email": "reused@example.com", "password": PASSWORD,
    }, 201)
    assert new["id"] != old["id"]
    dump = tmp_path / "after-reuse.dump"
    with dump.open("wb") as handle:
        compose("pg_dump", "-Fc", "-U", "taskflow_test", "-d", "taskflow_integration_test", stdout=handle)
    sql("DELETE FROM users WHERE id = %s", (new["id"],))
    sql("""
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
    """)
    with dump.open("rb") as handle:
        compose(
            "pg_restore", "--exit-on-error", "--clean", "--if-exists",
            "-U", "taskflow_test", "-d", "taskflow_integration_test", stdin=handle,
        )
    assert sql("SELECT id FROM users WHERE email = %s", ("reused@example.com",)) == [(new["id"],)]
    reapply_recorded_deletions()
    assert sql("SELECT id FROM users WHERE email = %s", ("reused@example.com",)) == [(new["id"],)]
