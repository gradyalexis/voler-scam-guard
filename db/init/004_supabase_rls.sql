-- Migrasi: tutup tabel dari Data API Supabase (REST/GraphQL).
--
-- Supabase membuka schema `public` lewat Data API yang bisa dipanggil dengan
-- anon key — dan anon key memang bukan rahasia. Project ini tidak memakai Data
-- API sama sekali: bot dan dashboard konek langsung ke Postgres sebagai pemilik
-- tabel, dan pemilik tabel tidak terkena RLS. Jadi aman untuk:
--   1. mengaktifkan RLS di SEMUA tabel public tanpa policy (= tolak semua), dan
--   2. mencabut hak role `anon` / `authenticated`, termasuk untuk tabel baru.
--
-- Skrip ini idempoten dan juga aman di Postgres lokal (role anon/authenticated
-- tidak ada, jadi bagian REVOKE dilewati). Jalankan ulang lewat
-- ./scripts/migrate.sh setiap kali menambah tabel.

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      -- Supabase memberi hak default ke anon/authenticated untuk tabel yang
      -- dibuat role ini (postgres); cabut supaya tabel berikutnya tidak terbuka.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
