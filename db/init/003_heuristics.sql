-- Migrasi: heuristik pola scam untuk gambar (giveaway palsu, nitro gratis, dll).
-- Pada instalasi baru kolom ini sudah dibuat oleh 001_init.sql dan skrip ini
-- tidak melakukan apa-apa. Untuk database yang sudah berjalan, jalankan:
--   docker compose exec -T postgres psql -U "$DB_USER" -d voler_scam_guard < db/init/003_heuristics.sql

BEGIN;

ALTER TABLE guild_settings
  ADD COLUMN IF NOT EXISTS heuristic_mode TEXT NOT NULL DEFAULT 'images';

ALTER TABLE guild_settings
  ADD COLUMN IF NOT EXISTS heuristic_threshold INTEGER NOT NULL DEFAULT 8;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guild_settings_heuristic_mode_chk'
  ) THEN
    ALTER TABLE guild_settings ADD CONSTRAINT guild_settings_heuristic_mode_chk
      CHECK (heuristic_mode IN ('off', 'images', 'all'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guild_settings_heuristic_threshold_chk'
  ) THEN
    ALTER TABLE guild_settings ADD CONSTRAINT guild_settings_heuristic_threshold_chk
      CHECK (heuristic_threshold BETWEEN 3 AND 30);
  END IF;
END $$;

COMMIT;
