import { and, desc, eq, gte, ilike, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import {
  adminUsers,
  blacklistAccounts,
  blacklistDomains,
  detectionLogs,
  guildSettings,
  whitelistDomains,
} from './db/schema';

export interface LogFilters {
  guildId?: string;
  channelId?: string;
  userId?: string;
  detectionType?: string;
  source?: string;
  actionTaken?: string;
  q?: string;
  days?: number;
  page?: number;
  pageSize?: number;
}

export async function getLogs(filters: LogFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, filters.pageSize ?? 50));

  const conditions: SQL[] = [];
  if (filters.guildId) conditions.push(eq(detectionLogs.guildId, filters.guildId));
  if (filters.channelId) conditions.push(eq(detectionLogs.channelId, filters.channelId));
  if (filters.userId) conditions.push(eq(detectionLogs.userId, filters.userId));
  if (filters.detectionType) conditions.push(eq(detectionLogs.detectionType, filters.detectionType));
  if (filters.source) conditions.push(eq(detectionLogs.source, filters.source));
  if (filters.actionTaken) conditions.push(eq(detectionLogs.actionTaken, filters.actionTaken));
  if (filters.days && filters.days > 0) {
    conditions.push(
      gte(detectionLogs.createdAt, new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)),
    );
  }
  if (filters.q) {
    const needle = `%${filters.q}%`;
    conditions.push(
      sql`(${detectionLogs.matchedValue} ILIKE ${needle}
        OR ${detectionLogs.messageContent} ILIKE ${needle}
        OR ${detectionLogs.username} ILIKE ${needle}
        OR ${detectionLogs.ocrText} ILIKE ${needle})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(detectionLogs)
      .where(where)
      .orderBy(desc(detectionLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(detectionLogs)
      .where(where),
  ]);

  const total = countRows[0]?.count ?? 0;
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getOverviewStats() {
  const [counts] = await db.execute<{
    total: number;
    last_7d: number;
    last_24h: number;
    deleted_7d: number;
    unique_users_7d: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE matched_value IS NOT NULL)::int                                       AS total,
      count(*) FILTER (WHERE matched_value IS NOT NULL AND created_at > now() - interval '7 days')::int  AS last_7d,
      count(*) FILTER (WHERE matched_value IS NOT NULL AND created_at > now() - interval '24 hours')::int AS last_24h,
      count(*) FILTER (WHERE action_taken = 'deleted' AND created_at > now() - interval '7 days')::int    AS deleted_7d,
      count(DISTINCT user_id) FILTER (WHERE matched_value IS NOT NULL AND created_at > now() - interval '7 days')::int AS unique_users_7d
    FROM detection_logs
  `).then(unwrap);

  const [blacklist] = await db.execute<{
    domains: number;
    accounts_verified: number;
    accounts_pending: number;
    whitelist: number;
    admins: number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM blacklist_domains)::int                            AS domains,
      (SELECT count(*) FROM blacklist_accounts WHERE status = 'verified')::int AS accounts_verified,
      (SELECT count(*) FROM blacklist_accounts WHERE status = 'pending')::int  AS accounts_pending,
      (SELECT count(*) FROM whitelist_domains)::int                            AS whitelist,
      (SELECT count(*) FROM admin_users)::int                                  AS admins
  `).then(unwrap);

  return {
    total: counts?.total ?? 0,
    last7d: counts?.last_7d ?? 0,
    last24h: counts?.last_24h ?? 0,
    deleted7d: counts?.deleted_7d ?? 0,
    uniqueUsers7d: counts?.unique_users_7d ?? 0,
    domains: blacklist?.domains ?? 0,
    accountsVerified: blacklist?.accounts_verified ?? 0,
    accountsPending: blacklist?.accounts_pending ?? 0,
    whitelist: blacklist?.whitelist ?? 0,
    admins: blacklist?.admins ?? 0,
  };
}

/** Deteksi per hari untuk 14 hari terakhir — dipakai bar chart di halaman ringkasan. */
export async function getDailyDetections(days = 14) {
  const rows = await db
    .execute<{ day: string; total: number }>(
      sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
               coalesce(count(l.id), 0)::int AS total
        FROM generate_series(
               date_trunc('day', now()) - make_interval(days => ${days - 1}),
               date_trunc('day', now()),
               interval '1 day'
             ) AS d(day)
        LEFT JOIN detection_logs l
          ON date_trunc('day', l.created_at) = d.day
         AND l.matched_value IS NOT NULL
        GROUP BY d.day
        ORDER BY d.day
      `,
    )
    .then(unwrapAll);
  return rows;
}

export async function getTopMatches(limit = 8) {
  return db
    .execute<{ matched_value: string; detection_type: string; total: number }>(
      sql`
        SELECT matched_value, detection_type, count(*)::int AS total
        FROM detection_logs
        WHERE matched_value IS NOT NULL
          AND created_at > now() - interval '30 days'
        GROUP BY matched_value, detection_type
        ORDER BY total DESC
        LIMIT ${limit}
      `,
    )
    .then(unwrapAll);
}

export async function getGuildOptions() {
  const rows = await db
    .execute<{ guild_id: string; guild_name: string | null }>(
      sql`
        SELECT g.guild_id, g.guild_name
        FROM guild_settings g
        UNION
        SELECT DISTINCT l.guild_id, NULL
        FROM detection_logs l
        WHERE l.guild_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM guild_settings s WHERE s.guild_id = l.guild_id)
      `,
    )
    .then(unwrapAll);
  return rows;
}

export async function getBlacklistDomains(q?: string) {
  const where = q ? ilike(blacklistDomains.domain, `%${q}%`) : undefined;
  return db.select().from(blacklistDomains).where(where).orderBy(desc(blacklistDomains.createdAt));
}

export async function getWhitelistDomains(q?: string) {
  const where = q ? ilike(whitelistDomains.domain, `%${q}%`) : undefined;
  return db.select().from(whitelistDomains).where(where).orderBy(desc(whitelistDomains.createdAt));
}

export async function getAccounts(status?: string, q?: string) {
  const conditions: SQL[] = [];
  if (status && status !== 'all') conditions.push(eq(blacklistAccounts.status, status));
  if (q) {
    const needle = `%${q}%`;
    conditions.push(
      sql`(${blacklistAccounts.identifier} ILIKE ${needle} OR ${blacklistAccounts.reason} ILIKE ${needle})`,
    );
  }
  return db
    .select()
    .from(blacklistAccounts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(blacklistAccounts.createdAt))
    .limit(500);
}

export async function getAllGuildSettings() {
  return db.select().from(guildSettings).orderBy(guildSettings.guildName);
}

export async function getAdmins() {
  return db.select().from(adminUsers).orderBy(adminUsers.createdAt);
}

// drizzle node-postgres mengembalikan QueryResult; helper ini menyeragamkannya
// dengan driver lain yang langsung mengembalikan array.
function unwrap<T>(result: { rows: T[] } | T[]): T[] {
  return unwrapAll(result);
}

function unwrapAll<T>(result: { rows: T[] } | T[]): T[] {
  return Array.isArray(result) ? result : result.rows;
}
