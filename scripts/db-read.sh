#!/usr/bin/env bash
# Query read-only ke database. Tidak bisa menulis apa pun — koneksinya memakai
# role vsg_ro yang hanya punya SELECT.
#   ./scripts/db-read.sh "SELECT count(*) FROM detection_logs"
#   ./scripts/db-read.sh < query.sql
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${DB_RO_PASSWORD:?DB_RO_PASSWORD belum diisi di .env}"

if [ $# -gt 0 ]; then
  docker compose exec -T -e PGPASSWORD="$DB_RO_PASSWORD" postgres \
    psql -U vsg_ro -d "${DB_NAME:-voler_scam_guard}" -v ON_ERROR_STOP=1 -c "$*"
else
  docker compose exec -T -e PGPASSWORD="$DB_RO_PASSWORD" postgres \
    psql -U vsg_ro -d "${DB_NAME:-voler_scam_guard}" -v ON_ERROR_STOP=1
fi
