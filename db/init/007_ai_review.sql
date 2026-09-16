-- Migrasi: review gambar dengan Gemini untuk gambar yang lolos pemeriksaan lokal.
--
-- Default MATI per server: fitur ini mengirim gambar member ke Google, jadi
-- pemilik server yang harus menyalakannya sendiri (dashboard atau
-- `/scamguard settings toggle`). Tanpa GEMINI_API_KEY di .env bot, nilai
-- kolom ini diabaikan.
--
-- Idempoten. Jalankan lewat ./scripts/migrate.sh.

BEGIN;

ALTER TABLE guild_settings
  ADD COLUMN IF NOT EXISTS use_ai_review BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN guild_settings.use_ai_review IS
  'Kirim gambar yang lolos pemeriksaan lokal tapi mencurigakan ke Gemini';

COMMIT;
