import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deletion_log import delete_account_by_email

if len(sys.argv) != 2 or not sys.argv[1]:
    print("Usage: python scripts/delete_account.py person@example.com", file=sys.stderr)
    raise SystemExit(1)

result = delete_account_by_email(sys.argv[1])
if result == "not_found":
    print("No account uses that email.", file=sys.stderr)
    raise SystemExit(1)
if result == "shared_workspaces":
    print("Transfer or delete workspaces that still have other members first.", file=sys.stderr)
    raise SystemExit(1)
if result == "log_failed":
    print("The account was kept because the deletion record could not be saved.", file=sys.stderr)
    raise SystemExit(1)
print("Account deleted and recorded.")
