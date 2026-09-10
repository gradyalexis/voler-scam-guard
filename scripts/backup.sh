#!/usr/bin/env bash
# Backup database ke file terkompresi.
# Pakai lewat cron, misal tiap hari jam 3 pagi:
#   0 3 * * * /opt/voler-scam-guard/scripts/backup.sh >> /var/log/vsg-backup.log 2>&1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a; source .env; set +a

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME:-voler_scam_guard}-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres \
  pg_dump -U "$DB_USER" -d "${DB_NAME:-voler_scam_guard}" --clean --if-exists \
  | gzip -9 > "$OUT"

echo "$(date -Is) backup selesai: $OUT ($(du -h "$OUT" | cut -f1))"

# Buang backup lama.
find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

# Opsional: kirim ke offsite storage kalau rclone sudah dikonfigurasi.
# Set BACKUP_REMOTE di .env, contoh: BACKUP_REMOTE=b2:voler-backups/scamguard
if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$OUT" "$BACKUP_REMOTE" && echo "diunggah ke $BACKUP_REMOTE"
fi
