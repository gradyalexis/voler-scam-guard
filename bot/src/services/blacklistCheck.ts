import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  blacklistAccounts,
  blacklistDomains,
  whitelistDomains,
} from '../db/schema.js';
import { createLogger } from '../util/logger.js';
import { digitsOnly, domainVariants, normalizeIdentifier } from '../util/text.js';

const log = createLogger('blacklist');

/** Data blacklist/whitelist jarang berubah, jadi di-cache di memori. */
const CACHE_TTL_MS = 60_000;

interface AccountEntry {
  id: number;
  accountType: string;
  identifier: string;
  identifierNorm: string;
  reason: string | null;
}

interface CacheShape {
  whitelist: Set<string>;
  domains: Map<string, { reason: string | null; addedBy: string | null }>;
  accounts: AccountEntry[];
  loadedAt: number;
}

let cache: CacheShape | null = null;
let inflight: Promise<CacheShape> | null = null;

async function loadCache(): Promise<CacheShape> {
  const [wl, bl, accounts] = await Promise.all([
    db.select({ domain: whitelistDomains.domain }).from(whitelistDomains),
    db
      .select({
        domain: blacklistDomains.domain,
        reason: blacklistDomains.reason,
        addedBy: blacklistDomains.addedBy,
      })
      .from(blacklistDomains),
    db
      .select({
        id: blacklistAccounts.id,
        accountType: blacklistAccounts.accountType,
        identifier: blacklistAccounts.identifier,
        identifierNorm: blacklistAccounts.identifierNorm,
        reason: blacklistAccounts.reason,
      })
      .from(blacklistAccounts)
      .where(eq(blacklistAccounts.status, 'verified')),
  ]);

  const next: CacheShape = {
    whitelist: new Set(wl.map((r) => r.domain.toLowerCase())),
    domains: new Map(
      bl.map((r) => [r.domain.toLowerCase(), { reason: r.reason, addedBy: r.addedBy }]),
    ),
    accounts: accounts.filter((a) => a.identifierNorm.length >= 4),
    loadedAt: Date.now(),
  };

  log.debug(
    `Cache dimuat: ${next.whitelist.size} whitelist, ${next.domains.size} blacklist domain, ${next.accounts.length} akun verified`,
  );
  cache = next;
  return next;
}

async function getCache(): Promise<CacheShape> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  inflight ??= loadCache().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Paksa reload cache — dipanggil setelah mutasi lewat slash command / dashboard. */
export function invalidateBlacklistCache(): void {
  cache = null;
}

export async function isWhitelisted(domain: string): Promise<boolean> {
  const { whitelist } = await getCache();
  return domainVariants(domain).some((v) => whitelist.has(v));
}

export interface DomainHit {
  domain: string;
  reason: string | null;
  addedBy: string | null;
}

/** Cek domain (dan semua parent domain-nya) terhadap blacklist. */
export async function checkDomainBlacklist(domain: string): Promise<DomainHit | null> {
  const { domains } = await getCache();
  for (const variant of domainVariants(domain)) {
    const hit = domains.get(variant);
    if (hit) return { domain: variant, reason: hit.reason, addedBy: hit.addedBy };
  }
  return null;
}

export interface AccountHit {
  id: number;
  accountType: string;
  identifier: string;
  reason: string | null;
}

/**
 * Cari identifier akun blacklist di dalam sepotong teks (hasil OCR atau isi
 * pesan). Nomor rekening dicocokkan atas digit-nya saja supaya format penulisan
 * (`1234-5678`, `1234 5678`) dan noise OCR tidak bikin luput.
 */
export async function findBlacklistedAccounts(text: string): Promise<AccountHit[]> {
  if (!text.trim()) return [];
  const { accounts } = await getCache();
  if (accounts.length === 0) return [];

  const digits = digitsOnly(text);
  const lowered = text.toLowerCase();
  const wordChars = lowered.replace(/[^a-z0-9_.]/g, '');

  const hits: AccountHit[] = [];
  for (const acc of accounts) {
    const norm = acc.identifierNorm;
    const isNumeric = /^\d+$/.test(norm);

    const matched = isNumeric
      ? norm.length >= 6 && digits.includes(norm)
      : norm.length >= 4 && (lowered.includes(norm) || wordChars.includes(norm));

    if (matched) {
      hits.push({
        id: acc.id,
        accountType: acc.accountType,
        identifier: acc.identifier,
        reason: acc.reason,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Mutasi (dipakai slash command)
// ---------------------------------------------------------------------------

export async function addBlacklistDomain(
  domain: string,
  reason: string | null,
  addedBy: string,
): Promise<{ created: boolean }> {
  const result = await db
    .insert(blacklistDomains)
    .values({ domain: domain.toLowerCase(), reason, addedBy })
    .onConflictDoNothing({ target: blacklistDomains.domain })
    .returning({ id: blacklistDomains.id });
  invalidateBlacklistCache();
  return { created: result.length > 0 };
}

export async function removeBlacklistDomain(domain: string): Promise<boolean> {
  const result = await db
    .delete(blacklistDomains)
    .where(eq(blacklistDomains.domain, domain.toLowerCase()))
    .returning({ id: blacklistDomains.id });
  invalidateBlacklistCache();
  return result.length > 0;
}

export async function addWhitelistDomain(
  domain: string,
  note: string | null,
  addedBy: string,
): Promise<{ created: boolean }> {
  const result = await db
    .insert(whitelistDomains)
    .values({ domain: domain.toLowerCase(), note, addedBy })
    .onConflictDoNothing({ target: whitelistDomains.domain })
    .returning({ id: whitelistDomains.id });
  invalidateBlacklistCache();
  return { created: result.length > 0 };
}

export async function removeWhitelistDomain(domain: string): Promise<boolean> {
  const result = await db
    .delete(whitelistDomains)
    .where(eq(whitelistDomains.domain, domain.toLowerCase()))
    .returning({ id: whitelistDomains.id });
  invalidateBlacklistCache();
  return result.length > 0;
}

export interface ReportAccountInput {
  accountType: string;
  identifier: string;
  reason: string | null;
  evidenceUrl: string | null;
  reportedBy: string;
  /** Laporan dari moderator bisa langsung `verified`. */
  status?: 'pending' | 'verified';
}

export async function reportAccount(
  input: ReportAccountInput,
): Promise<{ id: number | null; created: boolean }> {
  const identifierNorm = normalizeIdentifier(input.identifier);
  if (identifierNorm.length < 4) return { id: null, created: false };

  const result = await db
    .insert(blacklistAccounts)
    .values({
      accountType: input.accountType,
      identifier: input.identifier.trim(),
      identifierNorm,
      reason: input.reason,
      evidenceUrl: input.evidenceUrl,
      reportedBy: input.reportedBy,
      status: input.status ?? 'pending',
    })
    .onConflictDoNothing({
      target: [blacklistAccounts.accountType, blacklistAccounts.identifierNorm],
    })
    .returning({ id: blacklistAccounts.id });

  invalidateBlacklistCache();
  const row = result[0];
  return { id: row?.id ?? null, created: Boolean(row) };
}

export async function setAccountStatus(
  id: number,
  status: 'pending' | 'verified' | 'rejected',
  reviewedBy: string,
): Promise<boolean> {
  const result = await db
    .update(blacklistAccounts)
    .set({ status, reviewedBy, reviewedAt: new Date() })
    .where(eq(blacklistAccounts.id, id))
    .returning({ id: blacklistAccounts.id });
  invalidateBlacklistCache();
  return result.length > 0;
}

export async function lookupAccount(identifier: string): Promise<AccountHit[]> {
  const norm = normalizeIdentifier(identifier);
  if (!norm) return [];
  const rows = await db
    .select({
      id: blacklistAccounts.id,
      accountType: blacklistAccounts.accountType,
      identifier: blacklistAccounts.identifier,
      reason: blacklistAccounts.reason,
      status: blacklistAccounts.status,
    })
    .from(blacklistAccounts)
    .where(
      and(
        eq(blacklistAccounts.identifierNorm, norm),
        inArray(blacklistAccounts.status, ['pending', 'verified']),
      ),
    );
  return rows;
}

export async function blacklistStats(): Promise<{
  domains: number;
  accountsVerified: number;
  accountsPending: number;
  whitelist: number;
}> {
  const [row] = await db.execute<{
    domains: string;
    accounts_verified: string;
    accounts_pending: string;
    whitelist: string;
  }>(sql`
    SELECT
      (SELECT count(*) FROM blacklist_domains)                                   AS domains,
      (SELECT count(*) FROM blacklist_accounts WHERE status = 'verified')        AS accounts_verified,
      (SELECT count(*) FROM blacklist_accounts WHERE status = 'pending')         AS accounts_pending,
      (SELECT count(*) FROM whitelist_domains)                                   AS whitelist
  `).then((r) => (Array.isArray(r) ? r : r.rows));

  return {
    domains: Number(row?.domains ?? 0),
    accountsVerified: Number(row?.accounts_verified ?? 0),
    accountsPending: Number(row?.accounts_pending ?? 0),
    whitelist: Number(row?.whitelist ?? 0),
  };
}
