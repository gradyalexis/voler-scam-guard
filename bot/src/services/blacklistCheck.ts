import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  blacklistAccounts,
  blacklistDomains,
  guildWhitelistDomains,
  whitelistDomains,
} from '../db/schema.js';
import { createLogger } from '../util/logger.js';
import {
  deleetDomainVariants,
  digitsOnly,
  domainVariants,
  normalizeIdentifier,
} from '../util/text.js';

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
  /** guildId -> domain yang di-whitelist khusus server itu. */
  guildWhitelist: Map<string, Set<string>>;
  domains: Map<string, { reason: string | null; addedBy: string | null }>;
  accounts: AccountEntry[];
  loadedAt: number;
}

let cache: CacheShape | null = null;
let inflight: Promise<CacheShape> | null = null;

async function loadCache(): Promise<CacheShape> {
  const [wl, guildWl, bl, accounts] = await Promise.all([
    db.select({ domain: whitelistDomains.domain }).from(whitelistDomains),
    db
      .select({ guildId: guildWhitelistDomains.guildId, domain: guildWhitelistDomains.domain })
      .from(guildWhitelistDomains),
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

  const guildWhitelist = new Map<string, Set<string>>();
  for (const row of guildWl) {
    let set = guildWhitelist.get(row.guildId);
    if (!set) guildWhitelist.set(row.guildId, (set = new Set()));
    set.add(row.domain.toLowerCase());
  }

  const next: CacheShape = {
    whitelist: new Set(wl.map((r) => r.domain.toLowerCase())),
    guildWhitelist,
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

/** Whitelist global berlaku di semua server; whitelist server hanya di server itu. */
export async function isWhitelisted(domain: string, guildId?: string | null): Promise<boolean> {
  const { whitelist, guildWhitelist } = await getCache();
  const guildSet = guildId ? guildWhitelist.get(guildId) : undefined;
  return domainVariants(domain).some((v) => whitelist.has(v) || Boolean(guildSet?.has(v)));
}

export interface DomainHit {
  domain: string;
  reason: string | null;
  addedBy: string | null;
  /** True kalau cocoknya lewat versi tanpa angka samaran (`s0akw1n.com`). */
  viaLeet: boolean;
}

/**
 * Cek domain (dan semua parent domain-nya) terhadap blacklist. Kalau domain
 * aslinya tidak cocok, versi dengan angka dikembalikan ke huruf juga dicoba.
 */
export async function checkDomainBlacklist(domain: string): Promise<DomainHit | null> {
  const { domains } = await getCache();
  const candidates = [domain, ...deleetDomainVariants(domain)];
  for (const candidate of candidates) {
    for (const variant of domainVariants(candidate)) {
      const hit = domains.get(variant);
      if (hit) {
        return {
          domain: variant,
          reason: hit.reason,
          addedBy: hit.addedBy,
          viaLeet: candidate !== domain,
        };
      }
    }
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
// Laporan dari channel report. Blacklist & whitelist diubah lewat dashboard.
// ---------------------------------------------------------------------------

export interface ReportAccountInput {
  accountType: string;
  identifier: string;
  reason: string | null;
  evidenceUrl: string | null;
  reportedBy: string;
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
