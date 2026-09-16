#!/usr/bin/env bash
# Backup database ke file terkompresi.
# Pakai lewat cron, misal tiap hari jam 3 pagi:
#   0 3 * * * /opt/voler-scam-guard/scripts/backup.sh >> /var/log/vsg-backup.log 2>&1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/db.sh
source scripts/lib/db.sh

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ "$DB_PROVIDER" = supabase ]; then
  # Hanya tabel di schema public. Schema bawaan Supabase (auth, storage, ...)
  # dikelola platform. Sengaja bukan `--schema=public`: itu ikut menulis
  # DROP SCHEMA public, yang ditolak (dan berbahaya) saat restore ke Supabase.
  PREFIX="supabase-public"
  DUMP_ARGS=(--table='public.*' --no-owner)
else
  PREFIX="${DB_NAME:-voler_scam_guard}"
  DUMP_ARGS=()
fi
OUT="$BACKUP_DIR/$PREFIX-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

if ! db_pg_dump --clean --if-exists "${DUMP_ARGS[@]}" | gzip -9 > "$OUT"; then
  rm -f "$OUT"
  echo "$(date -Is) backup GAGAL untuk $(db_target)" >&2
  exit 1
fi

echo "$(date -Is) backup selesai: $OUT ($(du -h "$OUT" | cut -f1))"

# Buang backup lama.
find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

# Opsional: kirim ke offsite storage kalau rclone sudah dikonfigurasi.
# Set BACKUP_REMOTE di .env, contoh: BACKUP_REMOTE=b2:voler-backups/scamguard
if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$OUT" "$BACKUP_REMOTE" && echo "diunggah ke $BACKUP_REMOTE"
fi
