#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

COPIED=0
for DB in "$ROOT_DIR/data/dev.db" "$ROOT_DIR/backend/dev.db" "$ROOT_DIR/prisma/dev.db"; do
  if [ -f "$DB" ]; then
    NAME="$(basename "$DB" .db)"
    PARENT="$(basename "$(dirname "$DB")")"
    DEST="$BACKUP_DIR/$PARENT-$NAME-$TIMESTAMP.db"
    cp "$DB" "$DEST"
    echo "Backup criado: $DEST"
    COPIED=$((COPIED + 1))
  fi
done

if [ "$COPIED" -eq 0 ]; then
  echo "Nenhum banco SQLite encontrado para backup." >&2
  exit 1
fi
