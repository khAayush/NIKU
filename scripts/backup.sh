#!/usr/bin/env sh
# Daily database backup: pg_dump (custom format) into ./backups, keeping the newest 14.
# Run from cron on the server (see DEPLOY.md). Restore instructions are in DEPLOY.md.
#
# Environment overrides:
#   BACKUP_DIR    where dumps go            (default: <repo>/backups)
#   KEEP          how many dumps to keep    (default: 14)
#   COMPOSE_FILE  compose file with the db  (default: docker-compose.prod.yml)
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
KEEP="${KEEP:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

umask 077 # dumps contain personal data: readable by the owner only
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
file="$BACKUP_DIR/todo-$stamp.dump"

# Write to a temp file first so a failed dump never replaces a good one.
if ! docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U todo -d todo --format=custom >"$file.partial"; then
  rm -f "$file.partial"
  echo "$(date -u +%FT%TZ) backup FAILED" >&2
  exit 1
fi
mv "$file.partial" "$file"

# Keep only the newest $KEEP dumps.
ls -1t "$BACKUP_DIR"/todo-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
done

echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
