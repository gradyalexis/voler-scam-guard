#!/usr/bin/env bash
# Query dengan hak tulis penuh (role pemilik). SENGAJA tidak di-allowlist di
# .claude/settings.json supaya setiap INSERT/UPDATE/DELETE/DDL yang dijalankan
# Claude tetap lewat konfirmasi kamu.
#   ./scripts/db-write.sh "UPDATE blacklist_accounts SET status='verified' WHERE id=3"
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a; source .env; set +a

if [ $# -gt 0 ]; then
  docker compose exec -T postgres \
    psql -U "$DB_USER" -d "${DB_NAME:-voler_scam_guard}" -v ON_ERROR_STOP=1 -c "$*"
else
  docker compose exec -T postgres \
    psql -U "$DB_USER" -d "${DB_NAME:-voler_scam_guard}" -v ON_ERROR_STOP=1
fi
