#!/usr/bin/env bash
# Query read-only ke database. Tidak bisa menulis apa pun — koneksinya memakai
# role vsg_ro yang hanya punya SELECT.
#   ./scripts/db-read.sh "SELECT count(*) FROM detection_logs"
#   ./scripts/db-read.sh < query.sql
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/db.sh
source scripts/lib/db.sh

if [ $# -gt 0 ]; then
  db_psql_ro -v ON_ERROR_STOP=1 -c "$*"
else
  db_psql_ro -v ON_ERROR_STOP=1
fi
