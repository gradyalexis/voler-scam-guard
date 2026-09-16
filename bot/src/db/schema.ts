// ---------------------------------------------------------------------------
// Drizzle mapping untuk schema di db/init/001_init.sql.
// File ini juga disalin ke repo voler-scam-guard-dashboard (lib/db/schema.ts).
// Kalau diubah, jalankan `npm run sync:schema` di repo dashboard.
// ---------------------------------------------------------------------------
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const blacklistDomains = pgTable('blacklist_domains', {
  id: serial('id').primaryKey(),
  domain: text('domain').notNull().unique(),
  reason: text('reason'),
  addedBy: text('added_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blacklistAccounts = pgTable(
  'blacklist_accounts',
  {
    id: serial('id').primaryKey(),
    accountType: text('account_type').notNull(),
    identifier: text('identifier').notNull(),
    identifierNorm: text('identifier_norm').notNull(),
    reason: text('reason'),
    evidenceUrl: text('evidence_url'),
    reportedBy: text('reported_by'),
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('blacklist_accounts_unique_idx').on(t.accountType, t.identifierNorm),
    statusIdx: index('blacklist_accounts_status_idx').on(t.status),
  }),
);

export const whitelistDomains = pgTable('whitelist_domains', {
  id: serial('id').primaryKey(),
  domain: text('domain').notNull().unique(),
  note: text('note'),
  addedBy: text('added_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const detectionLogs = pgTable(
  'detection_logs',
  {
    id: serial('id').primaryKey(),
    guildId: text('guild_id'),
    channelId: text('channel_id'),
    messageId: text('message_id'),
    userId: text('user_id'),
    username: text('username'),
    messageContent: text('message_content'),
    detectionType: text('detection_type').notNull(),
    source: text('source'),
    matchedValue: text('matched_value'),
    severity: text('severity').notNull().default('high'),
    actionTaken: text('action_taken').notNull(),
    evidenceUrl: text('evidence_url'),
    ocrText: text('ocr_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('detection_logs_created_idx').on(t.createdAt),
    guildIdx: index('detection_logs_guild_idx').on(t.guildId, t.createdAt),
    userIdx: index('detection_logs_user_idx').on(t.userId),
    matchedIdx: index('detection_logs_matched_idx').on(t.matchedValue),
  }),
);

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  username: text('username'),
  avatar: text('avatar'),
  role: text('role').notNull().default('moderator'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
});

export const guildSettings = pgTable('guild_settings', {
  guildId: text('guild_id').primaryKey(),
  guildName: text('guild_name'),
  mode: text('mode').notNull().default('flag_only'),
  scanUrls: boolean('scan_urls').notNull().default(true),
  scanImages: boolean('scan_images').notNull().default(true),
  useSafeBrowsing: boolean('use_safe_browsing').notNull().default(true),
  logCleanMessages: boolean('log_clean_messages').notNull().default(false),
  heuristicMode: text('heuristic_mode').notNull().default('images'),
  heuristicThreshold: integer('heuristic_threshold').notNull().default(8),
  /** Review gambar mencurigakan dengan AI (db/init/007_ai_review.sql). */
  useAiReview: boolean('use_ai_review').notNull().default(false),
  modLogChannelId: text('mod_log_channel_id'),
  reportChannelId: text('report_channel_id'),
  scannedChannelIds: text('scanned_channel_ids').array().notNull().default([]),
  ignoredChannelIds: text('ignored_channel_ids').array().notNull().default([]),
  ignoredRoleIds: text('ignored_role_ids').array().notNull().default([]),
  /** false setelah bot dikeluarkan; barisnya disimpan supaya setting kembali saat dipasang ulang. */
  botPresent: boolean('bot_present').notNull().default(true),
  guildIcon: text('guild_icon'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Whitelist khusus satu server (db/init/005_multi_server.sql). */
export const guildWhitelistDomains = pgTable(
  'guild_whitelist_domains',
  {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    domain: text('domain').notNull(),
    note: text('note'),
    addedBy: text('added_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('guild_whitelist_domains_unique_idx').on(t.guildId, t.domain),
  }),
);

/** Jejak pemasangan bot lewat dashboard. */
export const guildInstalls = pgTable(
  'guild_installs',
  {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    installedBy: text('installed_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    guildIdx: index('guild_installs_guild_idx').on(t.guildId, t.createdAt),
  }),
);

/** Semua user yang pernah login ke dashboard (bukan hanya staf). */
export const dashboardUsers = pgTable('dashboard_users', {
  discordId: text('discord_id').primaryKey(),
  username: text('username'),
  avatar: text('avatar'),
  /** Access token Discord (scope identify guilds), terenkripsi AES-256-GCM oleh dashboard. */
  accessTokenEnc: text('access_token_enc'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  guildsRefreshedAt: timestamp('guilds_refreshed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
});

/** Server yang boleh dikelola user dashboard: owner, Administrator, atau Manage Server. */
export const dashboardUserGuilds = pgTable(
  'dashboard_user_guilds',
  {
    discordId: text('discord_id')
      .notNull()
      .references(() => dashboardUsers.discordId, { onDelete: 'cascade' }),
    guildId: text('guild_id').notNull(),
    guildName: text('guild_name').notNull(),
    guildIcon: text('guild_icon'),
    isOwner: boolean('is_owner').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.discordId, t.guildId] }),
  }),
);

export const urlScanCache = pgTable(
  'url_scan_cache',
  {
    urlHash: text('url_hash').primaryKey(),
    url: text('url').notNull(),
    isThreat: boolean('is_threat').notNull(),
    threatType: text('threat_type'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    checkedIdx: index('url_scan_cache_checked_idx').on(t.checkedAt),
  }),
);

export type DetectionLog = typeof detectionLogs.$inferSelect;
export type NewDetectionLog = typeof detectionLogs.$inferInsert;
export type GuildSetting = typeof guildSettings.$inferSelect;
export type BlacklistAccount = typeof blacklistAccounts.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type GuildWhitelistDomain = typeof guildWhitelistDomains.$inferSelect;
export type DashboardUser = typeof dashboardUsers.$inferSelect;
