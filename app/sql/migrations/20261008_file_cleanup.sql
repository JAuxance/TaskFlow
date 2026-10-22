-- Apply before deploying the account deletion update. Safe to run twice.
BEGIN;
CREATE TABLE IF NOT EXISTS file_cleanup_jobs (
    path TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0
);
COMMIT;
