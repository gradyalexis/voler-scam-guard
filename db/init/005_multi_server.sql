-- Migrasi: dashboard multi-server.
--
-- Siapa pun bisa login ke dashboard dengan Discord, memilih server tempat dia
-- owner / punya izin Manage Server, lalu memasang dan mengatur bot di server itu.
-- Blacklist dan whitelist global tetap hanya bisa diubah staf (admin_users);
-- admin server mendapat whitelist khusus server mereka sendiri.
--
-- Idempoten. Jalankan lewat ./scripts/migrate.sh, lalu ulangi
-- ./scripts/create-readonly-role.sh supaya vsg_ro bisa membaca tabel baru.

BEGIN;

-- ---------------------------------------------------------------------------
-- Status bot per server. Baris guild_settings sengaja tidak dihapus saat bot
-- dikeluarkan, supaya setting kembali berlaku kalau bot dipasang lagi.
-- ---------------------------------------------------------------------------
ALTER TABLE guild_settings
  ADD COLUMN IF NOT EXISTS bot_present BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE guild_settings
  ADD COLUMN IF NOT EXISTS guild_icon TEXT;

-- ---------------------------------------------------------------------------
-- Whitelist khusus satu server. Hanya melewati scanner di server itu.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_whitelist_domains (
  id          SERIAL PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  domain      TEXT NOT NULL,
  note        TEXT,
  added_by    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guild_whitelist_domains_unique_idx
  ON guild_whitelist_domains (guild_id, domain);

-- ---------------------------------------------------------------------------
-- Jejak pemasangan bot lewat dashboard (siapa memasang ke server mana).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_installs (
  id            SERIAL PRIMARY KEY,
  guild_id      TEXT NOT NULL,
  installed_by  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guild_installs_guild_idx
  ON guild_installs (guild_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- User dashboard (semua yang pernah login, bukan hanya staf) dan server yang
-- boleh mereka kelola menurut Discord. Access token disimpan terenkripsi
-- (AES-256-GCM, kunci dari AUTH_SECRET dashboard) dan hanya punya scope
-- `identify guilds`; dipakai untuk menyegarkan daftar server secara berkala.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_users (
  discord_id           TEXT PRIMARY KEY,
  username             TEXT,
  avatar               TEXT,
  access_token_enc     TEXT,
  token_expires_at     TIMESTAMPTZ,
  guilds_refreshed_at  TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dashboard_user_guilds (
  discord_id  TEXT NOT NULL REFERENCES dashboard_users (discord_id) ON DELETE CASCADE,
  guild_id    TEXT NOT NULL,
  guild_name  TEXT NOT NULL,
  guild_icon  TEXT,
  is_owner    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (discord_id, guild_id)
);

-- migrate.sh menjalankan 004 sebelum file ini, jadi tabel baru di atas belum
-- ikut tertutup RLS pada run yang sama. Tutup langsung di sini.
ALTER TABLE guild_whitelist_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_user_guilds ENABLE ROW LEVEL SECURITY;

COMMIT;
