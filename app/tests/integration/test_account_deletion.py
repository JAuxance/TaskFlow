"""Deletion and races on the disposable PostgreSQL database, never production."""
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

import pytest

if os.getenv("TASKFLOW_CHAT_INTEGRATION") != "1":
    pytest.skip("Uses only the disposable local PostgreSQL database", allow_module_level=True)

import psycopg
import requests
from app.account_deletion import delete_user_account
from app.file_cleanup import cleanup_deleted_files
from app.tests.integration.test_chat_revocation import schema, site, sql, PASSWORD, TEST_DSN


def preview(site, user="owner"):
    return site["request"](site[user], "GET", "/api/users/me/deletion-preview")


def test_shared_owner_is_blocked_then_can_transfer_and_delete(site):
    report = preview(site)
    assert not report["can_delete"]
    assert report["blocked_workspaces"] == [{"id": site["workspace"], "name": "Local chat test", "other_members": 1}]
    assert "email" not in str(report) and "password" not in str(report)
    response = site["request"](site["owner"], "DELETE", "/api/users/me", {"password": PASSWORD}, 409)
    assert response["code"] == "shared_workspaces"
    assert sql("SELECT count(*) FROM users") == [(3,)]
    assert sql("SELECT count(*) FROM workspace_members") == [(2,)]
    site["request"](site["owner"], "PATCH", f'/api/workspaces/{site["workspace"]}/members/{site["member_id"]}', {"role": "owner"})
    site["request"](site["owner"], "PATCH", f'/api/workspaces/{site["workspace"]}/owner', {"user_id": site["member_id"]})
    assert preview(site)["can_delete"]
    site["request"](site["owner"], "DELETE", "/api/users/me", {"password": PASSWORD})
    assert sql("SELECT owner_id FROM workspaces") == [(site["member_id"],)]
    site["request"](site["member"], "GET", f'/api/workspaces/{site["workspace"]}')


def test_member_deletion_keeps_shared_text_but_removes_links_messages_and_sessions(site):
    workspace, member, owner = site["workspace"], site["member_id"], site["owner_id"]
    project = site["request"](site["owner"], "POST", f"/api/workspaces/{workspace}/projects", {"name": "Team"}, 201)["id"]
    sql("INSERT INTO tasks(project_id,creator_id,assignee_id,title) VALUES (%s,%s,%s,'Text with a name')", (project, member, member))
    sql("INSERT INTO workspace_messages(workspace_id,user_id,content) VALUES (%s,%s,'Shared text')", (workspace, member))
    sql("INSERT INTO direct_messages(sender_id,receiver_id,content) VALUES (%s,%s,'Direct'),(%s,%s,'Reply')", (member, owner, owner, member))
    second = requests.Session()
    site["sessions"].append(second)
    site["request"](second, "POST", "/api/auth/login", {"email": "member@example.com", "password": PASSWORD})
    report = preview(site, "member")
    assert report["counts"]["sessions"] == 2
    assert report["can_delete"] and report["workspaces_to_delete"] == []
    assert report["counts"]["direct_messages"] == 2
    assert report["counts"]["retained_tasks"] == report["counts"]["retained_messages"] == 1
    site["request"](site["member"], "DELETE", "/api/users/me", {"password": PASSWORD})
    assert sql("SELECT creator_id,assignee_id,title FROM tasks") == [(None, None, "Text with a name")]
    assert sql("SELECT user_id,content FROM workspace_messages") == [(None, "Shared text")]
    assert sql("SELECT count(*) FROM direct_messages") == [(0,)]
    assert sql("SELECT count(*) FROM sessions WHERE user_id=%s", (member,)) == [(0,)]
    site["request"](second, "GET", "/api/auth/me", status=401)
    assert sql("SELECT count(*) FROM workspace_members WHERE user_id=%s", (member,)) == [(0,)]


def test_solo_workspace_summary_and_deletion(site, app, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "static_folder", str(tmp_path))
    user = site["outsider_id"]
    workspace = site["request"](site["outsider"], "POST", "/api/workspaces", {"name": "Solo"}, 201)["id"]
    project = site["request"](site["outsider"], "POST", f"/api/workspaces/{workspace}/projects", {"name": "Personal"}, 201)["id"]
    sql("INSERT INTO tasks(project_id,creator_id,title) VALUES (%s,%s,'Task')", (project,user))
    sql("INSERT INTO workspace_messages(workspace_id,user_id,content) VALUES (%s,%s,'Note')", (workspace,user))
    avatar=f"/static/avatars/{user}_{'a'*32}.png"
    icon=f"/static/workspace_icons/{workspace}_{'b'*32}.png"
    for url in (avatar, icon):
        path=tmp_path/url.removeprefix('/static/')
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(b'fixture')
    sql("UPDATE users SET avatar_url=%s WHERE id=%s", (avatar,user))
    sql("UPDATE workspaces SET icon_type='image',icon_value=%s WHERE id=%s", (icon,workspace))
    report=preview(site,"outsider")
    assert report["counts"]["images"]==2
    assert report["counts"]["tasks"]==report["counts"]["projects"]==report["counts"]["workspace_messages"]==1
    site["request"](site["outsider"],"DELETE","/api/users/me",{"password":PASSWORD})
    assert sql("SELECT id FROM workspaces WHERE id=%s",(workspace,))==[]
    assert sql("SELECT count(*) FROM tasks")==[(0,)]
    assert sql("SELECT count(*) FROM file_cleanup_jobs")==[(0,)]
    assert all(not (tmp_path/url.removeprefix('/static/')).exists() for url in (avatar,icon))
    assert cleanup_deleted_files(tmp_path)=={"removed":0,"failed":0}


def test_wrong_password_stale_preview_and_unconfirmed_scope_preserve_account(site):
    user=site["outsider_id"]
    assert delete_user_account(user,"wrong",[])=="incorrect_password"
    workspace=site["request"](site["outsider"],"POST","/api/workspaces",{"name":"Added after preview"},201)["id"]
    assert delete_user_account(user,PASSWORD,[])=="preview_changed"
    assert sql("SELECT id FROM users WHERE id=%s",(user,))==[(user,)]
    # Confirmation cannot include another owner's workspace.
    assert delete_user_account(user,PASSWORD,[workspace,site["workspace"]])=="preview_changed"


def test_failed_file_cleanup_is_durable_hidden_and_retryable(site,app,monkeypatch,tmp_path):
    monkeypatch.setattr(app,"static_folder",str(tmp_path))
    user=site["outsider_id"]
    avatar=f"/static/avatars/{user}_{'c'*32}.png"
    path=tmp_path/avatar.removeprefix('/static/')
    path.parent.mkdir(); path.write_bytes(b'fixture')
    sql("UPDATE users SET avatar_url=%s WHERE id=%s",(avatar,user))
    original=Path.unlink
    def fail(self,*args,**kwargs):
        if self==path: raise PermissionError("simulated")
        return original(self,*args,**kwargs)
    monkeypatch.setattr(Path,"unlink",fail)
    site["request"](site["outsider"],"DELETE","/api/users/me",{"password":PASSWORD})
    assert sql("SELECT path,attempts FROM file_cleanup_jobs")==[(avatar,1)]
    assert path.exists()
    assert site["owner"].get(site["url"]+avatar,timeout=5).status_code==404
    alias=avatar.replace('/avatars/','/avatars/%2e/')
    assert site["owner"].get(site["url"]+alias,timeout=5).status_code==404
    assert sql("SELECT id FROM users WHERE id=%s",(user,))==[]
    monkeypatch.setattr(Path,"unlink",original)
    runner=app.test_cli_runner()
    result=runner.invoke(args=["cleanup-deleted-files"])
    assert result.exit_code==0, result.output
    assert not path.exists() and sql("SELECT path FROM file_cleanup_jobs")==[]
    assert runner.invoke(args=["cleanup-deleted-files"]).exit_code==0


def wait_for_lock(query):
    deadline=time.monotonic()+2
    while time.monotonic()<deadline:
        if sql("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE %s",(query,)):
            return
        time.sleep(.02)
    pytest.fail("Expected a blocked PostgreSQL statement")


def test_member_addition_committed_before_delete_is_seen(site):
    workspace=site["request"](site["outsider"],"POST","/api/workspaces",{"name":"Race"},201)["id"]
    with psycopg.connect(TEST_DSN) as joining, ThreadPoolExecutor(max_workers=1) as pool:
        joining.execute("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (%s,%s,'guest')",(workspace,site["member_id"]))
        pending=pool.submit(delete_user_account,site["outsider_id"],PASSWORD,[workspace])
        try:
            wait_for_lock("%FROM workspaces%FOR UPDATE%")
        finally:
            joining.commit()
        assert pending.result(timeout=5)=="shared_workspaces"
    assert sql("SELECT id FROM workspaces WHERE id=%s",(workspace,))==[(workspace,)]


def test_new_member_cannot_sneak_in_after_delete_check(site,monkeypatch):
    workspace=site["request"](site["outsider"],"POST","/api/workspaces",{"name":"Race after check"},201)["id"]
    ready,release=Event(),Event()
    class PausedCursor(psycopg.Cursor):
        def execute(self,query,params=None,**kwargs):
            if query=="DELETE FROM users WHERE id = %s":
                ready.set()
                assert release.wait(4)
            return super().execute(query,params,**kwargs)
    monkeypatch.setattr("app.account_deletion.get_db_connection",lambda:psycopg.connect(TEST_DSN,cursor_factory=PausedCursor))
    def join():
        with psycopg.connect(TEST_DSN) as db:
            db.execute("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (%s,%s,'guest')",(workspace,site["member_id"]))
    with ThreadPoolExecutor(max_workers=2) as pool:
        deleting=pool.submit(delete_user_account,site["outsider_id"],PASSWORD,[workspace])
        try:
            assert ready.wait(3)
            joining=pool.submit(join)
            wait_for_lock("INSERT INTO workspace_members%")
        finally:
            release.set()
        assert deleting.result(timeout=5) is None
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            joining.result(timeout=5)
    assert sql("SELECT id FROM workspace_members WHERE workspace_id=%s",(workspace,))==[]


def test_migration_is_idempotent_and_keeps_existing_accounts(site):
    migration=(Path(__file__).resolve().parents[2]/'sql/migrations/20261008_file_cleanup.sql').read_text()
    before=sql("SELECT id,email FROM users ORDER BY id")
    sql(migration);sql(migration)
    assert sql("SELECT id,email FROM users ORDER BY id")==before


def test_deletion_never_unlinks_another_profiles_picture(site, app, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "static_folder", str(tmp_path))
    url = f"/static/avatars/{site['owner_id']}_{'d'*32}.png"
    path = tmp_path / url.removeprefix('/static/')
    path.parent.mkdir(); path.write_bytes(b'other profile')
    sql("UPDATE users SET avatar_url=%s WHERE id IN (%s,%s)", (url, site['owner_id'], site['outsider_id']))
    site['request'](site['outsider'], 'DELETE', '/api/users/me', {'password': PASSWORD})
    assert path.read_bytes() == b'other profile'
    assert sql("SELECT path FROM file_cleanup_jobs") == []


def test_delete_without_csrf_preserves_the_account(site):
    response = site['outsider'].delete(site['url'] + '/api/users/me',
        json={'password': PASSWORD, 'confirmed_workspace_ids': []},
        headers={'Origin': 'http://localhost:5500'}, timeout=5)
    assert response.status_code == 403
    assert response.json()['code'] == 'csrf_failed'
    assert sql('SELECT id FROM users WHERE id=%s', (site['outsider_id'],)) == [(site['outsider_id'],)]
