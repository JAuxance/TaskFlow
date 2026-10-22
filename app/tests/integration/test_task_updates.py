"""Partial writes must not overwrite unrelated concurrent edits."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import os
import pytest
if os.getenv("TASKFLOW_INTEGRATION") != "1":
    pytest.skip("Set TASKFLOW_INTEGRATION=1", allow_module_level=True)
from app.tests.integration.support import schema, site, sql
from app.db import update_task_db

def task(site):
    request, owner = site["request"], site["owner"]
    project = request(owner, "POST", f"/api/workspaces/{site['workspace']}/projects", {"name": "Concurrent edits"}, 201)
    return request(owner, "POST", f"/api/projects/{project['id']}/tasks", {"title": "Original", "status": "todo", "priority": "medium"}, 201)["id"]

def test_concurrent_different_fields_survive(site):
    task_id = task(site)
    before = sql("SELECT updated_at FROM tasks WHERE id=%s", (task_id,))[0][0]
    ready = Barrier(2)
    def edit(changes):
        ready.wait(timeout=5)
        return update_task_db(task_id, changes)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(edit, [{"title": "Renamed"}, {"status": "done"}]))
    assert all(results)
    title, status, updated = sql("SELECT title,status,updated_at FROM tasks WHERE id=%s", (task_id,))[0]
    assert (title, status) == ("Renamed", "done")
    assert updated > before

@pytest.mark.parametrize("changes", [{}, {"project_id": 9}, {"title": "Changed", "unknown": "x"}])
def test_invalid_partial_updates_are_rejected_without_writing(site, changes):
    task_id = task(site)
    site["request"](site["owner"], "PATCH", f"/api/tasks/{task_id}", changes, 400)
    assert sql("SELECT title FROM tasks WHERE id=%s", (task_id,))[0][0] == "Original"
