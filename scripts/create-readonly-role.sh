#!/usr/bin/env bash
# Buat role Postgres read-only (vsg_ro). Dipakai oleh scripts/db-read.sh supaya
# query eksplorasi tidak pernah bisa mengubah data.
# Jalankan setelah ./scripts/migrate.sh, dan ulangi setiap ada tabel baru
# (policy RLS untuk vsg_ro dibuat per tabel):
#   ./scripts/create-readonly-role.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/db.sh
source scripts/lib/db.sh

require_ro_password

db_psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsg_ro') THEN
    CREATE ROLE vsg_ro LOGIN;
  END IF;

  -- Di Supabase database dan schema public dimiliki role platform, dan PUBLIC
  -- sudah punya CONNECT/USAGE; GRANT hanya dijalankan kalau memang belum bisa.
  IF NOT has_database_privilege('vsg_ro', current_database(), 'CONNECT') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO vsg_ro', current_database());
  END IF;
  IF NOT has_schema_privilege('vsg_ro', 'public', 'USAGE') THEN
    GRANT USAGE ON SCHEMA public TO vsg_ro;
  END IF;
  IF has_schema_privilege('vsg_ro', 'public', 'CREATE') THEN
    REVOKE CREATE ON SCHEMA public FROM vsg_ro;
  END IF;
END
\$\$;

ALTER ROLE vsg_ro WITH PASSWORD '${DB_RO_PASSWORD}';

GRANT SELECT ON ALL TABLES IN SCHEMA public TO vsg_ro;

-- Tabel yang dibuat belakangan otomatis ikut terbaca.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO vsg_ro;

-- Tegaskan tidak ada hak tulis, termasuk lewat role PUBLIC.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM vsg_ro;

-- Semua tabel public memakai RLS (db/init/004_supabase_rls.sql). Tanpa policy,
-- vsg_ro akan melihat tabel kosong, jadi beri policy khusus SELECT.
DO \$\$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'vsg_ro_select'
    ) THEN
      EXECUTE format('CREATE POLICY vsg_ro_select ON public.%I FOR SELECT TO vsg_ro USING (true)', t);
    END IF;
  END LOOP;
END
\$\$;
SQL

echo "Role vsg_ro siap (read-only) di $(db_target)."
