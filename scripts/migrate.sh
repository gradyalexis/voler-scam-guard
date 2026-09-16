#!/usr/bin/env bash
# Terapkan semua migrasi di db/init/ secara berurutan ke database yang dipilih
# DB_PROVIDER di .env. Setiap file ditulis idempoten, jadi aman dijalankan ulang
# setiap kali ada file migrasi baru:
#   ./scripts/migrate.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/db.sh
source scripts/lib/db.sh

echo "Target: $(db_target)"
for file in db/init/*.sql; do
  echo "==> $file"
  db_psql -v ON_ERROR_STOP=1 -q < "$file"
done
echo "Migrasi selesai."
