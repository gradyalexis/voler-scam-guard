#!/usr/bin/env bash
# Query dengan hak tulis penuh (role pemilik). SENGAJA tidak di-allowlist di
# .claude/settings.json supaya setiap INSERT/UPDATE/DELETE/DDL yang dijalankan
# Claude tetap lewat konfirmasi kamu.
#   ./scripts/db-write.sh "UPDATE blacklist_accounts SET status='verified' WHERE id=3"
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/db.sh
source scripts/lib/db.sh

if [ $# -gt 0 ]; then
  db_psql -v ON_ERROR_STOP=1 -c "$*"
else
  db_psql -v ON_ERROR_STOP=1
fi
