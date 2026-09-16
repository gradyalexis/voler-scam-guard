-- Migrasi: mode `warn_delete` — umumkan di channel lalu hapus pesannya.
--
-- Beda dengan `auto_delete` yang menghapus diam-diam lalu DM pelakunya:
-- warn_delete meninggalkan jejak yang terlihat semua orang di channel, supaya
-- member lain tahu ada yang dihapus dan kenapa.
--
-- Idempoten. Jalankan lewat ./scripts/migrate.sh.

BEGIN;

ALTER TABLE guild_settings DROP CONSTRAINT IF EXISTS guild_settings_mode_chk;

ALTER TABLE guild_settings
  ADD CONSTRAINT guild_settings_mode_chk
  CHECK (mode IN ('auto_delete', 'warn_delete', 'warn', 'flag_only', 'off'));

COMMENT ON COLUMN guild_settings.mode IS
  'auto_delete | warn_delete | warn | flag_only | off';

COMMIT;
