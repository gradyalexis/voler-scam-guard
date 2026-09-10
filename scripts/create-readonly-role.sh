#!/usr/bin/env bash
# Buat role Postgres read-only (vsg_ro). Dipakai oleh scripts/db-read.sh supaya
# query eksplorasi tidak pernah bisa mengubah data.
# Jalankan sekali setelah database pertama kali hidup:
#   ./scripts/create-readonly-role.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${DB_RO_PASSWORD:?DB_RO_PASSWORD belum diisi di .env}"
DB="${DB_NAME:-voler_scam_guard}"

docker compose exec -T postgres psql -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsg_ro') THEN
    CREATE ROLE vsg_ro LOGIN;
  END IF;
END
\$\$;

ALTER ROLE vsg_ro WITH PASSWORD '${DB_RO_PASSWORD}';

GRANT CONNECT ON DATABASE ${DB} TO vsg_ro;
GRANT USAGE ON SCHEMA public TO vsg_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vsg_ro;

-- Tabel yang dibuat belakangan otomatis ikut terbaca.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO vsg_ro;

-- Tegaskan tidak ada hak tulis, termasuk lewat role PUBLIC.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM vsg_ro;
REVOKE CREATE ON SCHEMA public FROM vsg_ro;
SQL

echo "Role vsg_ro siap (read-only)."
