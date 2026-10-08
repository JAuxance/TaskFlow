#!/usr/bin/env bash
# Replace the database and image files, then replay deletions recorded outside
# the database. The public backend stays stopped. Pass --confirm yourself.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
compose_file="${COMPOSE_FILE:-compose.prod.yaml}"
confirm=""
dump=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm)
      confirm=1
      shift
      ;;
    *)
      if [[ -n "$dump" ]]; then
        echo "Usage: ./scripts/restore.sh --confirm /path/to/taskflow.dump" >&2
        exit 1
      fi
      dump="$1"
      shift
      ;;
  esac
done

if [[ -z "$confirm" || -z "$dump" ]]; then
  echo "Usage: ./scripts/restore.sh --confirm /path/to/taskflow.dump" >&2
  echo "This replaces the database and the image files. The public backend stays stopped." >&2
  echo "Type --confirm when you intend to run it. A preset variable is not accepted." >&2
  exit 1
fi

images="${dump%.dump}-images.tar"
if [[ ! -f "$dump" || ! -f "$images" ]]; then
  echo "Need the dump and the matching images archive: $images" >&2
  exit 1
fi

cd "$repo_root"
docker compose -f "$compose_file" stop backend

if ! docker compose -f "$compose_file" exec -T db \
  pg_restore --exit-on-error --clean --if-exists -U taskflow -d taskflow < "$dump"; then
  echo "SQL restore failed. Image files were not changed. The backend stays stopped." >&2
  exit 1
fi

# A one-off container has the same volumes and is not published on port 5000.
docker compose -f "$compose_file" run --rm --no-deps -T --entrypoint tar backend \
  -C /app/app/static -xf - < "$images"
docker compose -f "$compose_file" run --rm --no-deps -T --entrypoint python backend \
  scripts/reapply_deletions.py
docker compose -f "$compose_file" run --rm --no-deps -T --entrypoint flask backend \
  --app app.app cleanup-deleted-files

echo "Restore finished. The backend is still stopped. Start it after you have checked the result."
