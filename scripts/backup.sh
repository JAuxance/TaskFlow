#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
compose_file="${COMPOSE_FILE:-compose.prod.yaml}"
backup_dir="${BACKUP_DIR:-$HOME/.local/share/TaskFlow/backups}"

repo_root="$(realpath -m "$repo_root")"
backup_dir="$(realpath -m "$backup_dir")"
case "$backup_dir/" in
  "$repo_root/"*)
    echo "BACKUP_DIR is inside the repository: $backup_dir" >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
cd "$repo_root"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$backup_dir/taskflow-${stamp}.dump"
images="$backup_dir/taskflow-${stamp}-images.tar"

if ! docker compose -f "$compose_file" exec -T db \
  pg_dump -Fc -U taskflow -d taskflow > "$dump"; then
  rm -f -- "$dump"
  exit 1
fi
chmod 600 "$dump"

if ! docker compose -f "$compose_file" exec -T db \
  pg_restore --list < "$dump" >/dev/null; then
  rm -f -- "$dump"
  exit 1
fi

if ! docker compose -f "$compose_file" exec -T backend \
  tar -C /app/app/static -cf - avatars workspace_icons > "$images"; then
  rm -f -- "$dump" "$images"
  exit 1
fi
chmod 600 "$images"

prune() {
  local pattern="$1"
  find "$backup_dir" -maxdepth 1 -type f -name "$pattern" -mtime +30 -delete
  find "$backup_dir" -maxdepth 1 -type f -name "$pattern" -printf '%T@\t%p\n' \
    | sort -nr \
    | awk -F '\t' 'NR > 14 { print $2 }' \
    | while IFS= read -r old; do
        rm -f -- "$old"
      done
}

prune '*.dump'
prune '*-images.tar'
echo "$dump"
echo "$images"
