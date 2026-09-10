// ---------------------------------------------------------------------------
// Drizzle mapping untuk schema di db/init/001_init.sql.
// File ini identik dengan dashboard/lib/db/schema.ts.
// Kalau diubah, jalankan `npm run sync:schema` di root supaya dua-duanya sama.
// ---------------------------------------------------------------------------
import {
  boolean,
  index,
  integer,
  pgTable,
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
  modLogChannelId: text('mod_log_channel_id'),
  reportChannelId: text('report_channel_id'),
  scannedChannelIds: text('scanned_channel_ids').array().notNull().default([]),
  ignoredChannelIds: text('ignored_channel_ids').array().notNull().default([]),
  ignoredRoleIds: text('ignored_role_ids').array().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
