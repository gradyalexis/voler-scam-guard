-- Voler Scam Guard :: canonical schema
-- Dijalankan otomatis oleh container postgres saat volume pgdata masih kosong.
-- Untuk DB yang sudah ada, jalankan manual: psql -U $DB_USER -d voler_scam_guard -f 001_init.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Domain yang di-blacklist manual / hasil laporan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blacklist_domains (
  id          SERIAL PRIMARY KEY,
  domain      TEXT UNIQUE NOT NULL,
  reason      TEXT,
  added_by    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Rekening / akun yang di-report scam
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blacklist_accounts (
  id                SERIAL PRIMARY KEY,
  account_type      TEXT NOT NULL,                    -- 'bank' | 'ewallet' | 'discord' | 'game_account'
  identifier        TEXT NOT NULL,                    -- nomor rekening / username (apa adanya)
  identifier_norm   TEXT NOT NULL,                    -- versi ternormalisasi utk matching OCR
  reason            TEXT,
  evidence_url      TEXT,
  reported_by       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | verified | rejected
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blacklist_accounts_status_chk
    CHECK (status IN ('pending', 'verified', 'rejected')),
  CONSTRAINT blacklist_accounts_type_chk
    CHECK (account_type IN ('bank', 'ewallet', 'discord', 'game_account', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS blacklist_accounts_unique_idx
  ON blacklist_accounts (account_type, identifier_norm);
CREATE INDEX IF NOT EXISTS blacklist_accounts_status_idx
  ON blacklist_accounts (status);

-- ---------------------------------------------------------------------------
-- Domain terpercaya (midman resmi, marketplace, dll)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whitelist_domains (
  id          SERIAL PRIMARY KEY,
  domain      TEXT UNIQUE NOT NULL,
  note        TEXT,
  added_by    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Log semua deteksi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_logs (
  id               SERIAL PRIMARY KEY,
  guild_id         TEXT,
  channel_id       TEXT,
  message_id       TEXT,
  user_id          TEXT,
  username         TEXT,
  message_content  TEXT,
  detection_type   TEXT NOT NULL,   -- 'url' | 'image_ocr' | 'image_qr' | 'account'
  source           TEXT,            -- 'blacklist' | 'safe_browsing' | 'heuristic'
  matched_value    TEXT,
  severity         TEXT NOT NULL DEFAULT 'high',   -- 'low' | 'medium' | 'high'
  action_taken     TEXT NOT NULL,   -- 'deleted' | 'warned' | 'flagged_only' | 'none'
  evidence_url     TEXT,
  ocr_text         TEXT,           -- teks OCR; isi QR ditandai dengan prefiks [QR]
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS detection_logs_created_idx  ON detection_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS detection_logs_guild_idx    ON detection_logs (guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS detection_logs_user_idx     ON detection_logs (user_id);
CREATE INDEX IF NOT EXISTS detection_logs_matched_idx  ON detection_logs (matched_value);

-- ---------------------------------------------------------------------------
-- Admin dashboard users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id          SERIAL PRIMARY KEY,
  discord_id  TEXT UNIQUE NOT NULL,
  username    TEXT,
  avatar      TEXT,
  role        TEXT NOT NULL DEFAULT 'moderator',  -- 'owner' | 'admin' | 'moderator'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login  TIMESTAMPTZ,
  CONSTRAINT admin_users_role_chk CHECK (role IN ('owner', 'admin', 'moderator'))
);

-- ---------------------------------------------------------------------------
-- Setting per guild (dipakai halaman Settings di dashboard)
-- Tambahan di luar rancangan awal: rancangan minta "atur mode bot" &
-- "atur channel mana yang di-scan", keduanya butuh tempat penyimpanan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id            TEXT PRIMARY KEY,
  guild_name          TEXT,
  mode                TEXT NOT NULL DEFAULT 'flag_only',  -- 'auto_delete' | 'warn' | 'flag_only' | 'off'
  scan_urls           BOOLEAN NOT NULL DEFAULT true,
  scan_images         BOOLEAN NOT NULL DEFAULT true,
  use_safe_browsing   BOOLEAN NOT NULL DEFAULT true,
  log_clean_messages  BOOLEAN NOT NULL DEFAULT false,
  -- Heuristik pola scam: jalan tanpa data blacklist sama sekali.
  heuristic_mode      TEXT NOT NULL DEFAULT 'images',   -- 'off' | 'images' | 'all'
  heuristic_threshold INTEGER NOT NULL DEFAULT 8,       -- makin kecil makin sensitif
  mod_log_channel_id  TEXT,
  report_channel_id   TEXT,
  scanned_channel_ids TEXT[] NOT NULL DEFAULT '{}',   -- kosong = scan semua channel
  ignored_channel_ids TEXT[] NOT NULL DEFAULT '{}',
  ignored_role_ids    TEXT[] NOT NULL DEFAULT '{}',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guild_settings_mode_chk
    CHECK (mode IN ('auto_delete', 'warn', 'flag_only', 'off')),
  CONSTRAINT guild_settings_heuristic_mode_chk
    CHECK (heuristic_mode IN ('off', 'images', 'all')),
  CONSTRAINT guild_settings_heuristic_threshold_chk
    CHECK (heuristic_threshold BETWEEN 3 AND 30)
);

-- ---------------------------------------------------------------------------
-- Cache hasil Safe Browsing biar hemat quota & latency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS url_scan_cache (
  url_hash     TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  is_threat    BOOLEAN NOT NULL,
  threat_type  TEXT,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS url_scan_cache_checked_idx ON url_scan_cache (checked_at);

COMMIT;
