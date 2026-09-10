#!/usr/bin/env bash
# Restore database dari file backup: scripts/restore.sh backups/xxx.sql.gz
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Pakai: $0 <file-backup.sql.gz>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a; source .env; set +a

echo "Ini akan MENIMPA isi database ${DB_NAME:-voler_scam_guard}."
read -r -p "Ketik 'ya' untuk lanjut: " confirm
[ "$confirm" = "ya" ] || { echo "Dibatalkan."; exit 1; }

gunzip -c "$1" | docker compose exec -T postgres \
  psql -U "$DB_USER" -d "${DB_NAME:-voler_scam_guard}"

echo "Restore selesai. Restart service: docker compose restart bot dashboard"
