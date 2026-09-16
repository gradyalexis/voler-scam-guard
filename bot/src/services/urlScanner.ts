import { createHash } from 'node:crypto';
import { and, gt, inArray, lt, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { urlScanCache } from '../db/schema.js';
import { createLogger } from '../util/logger.js';
import { extractUrls, type ExtractedUrl } from '../util/text.js';
import { checkDomainBlacklist, isWhitelisted } from './blacklistCheck.js';

const log = createLogger('url-scanner');

const SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
/** Hasil Safe Browsing di-cache 12 jam. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
/** Safe Browsing menerima maksimum 500 URL per request. */
const MAX_URLS_PER_REQUEST = 500;

/** 'heuristic' = link disamarkan, langsung dianggap berbahaya tanpa Safe Browsing. */
export type UrlVerdictSource = 'blacklist' | 'safe_browsing' | 'heuristic';

export interface UrlThreat {
  url: string;
  domain: string;
  source: UrlVerdictSource;
  /** 'MALWARE' | 'SOCIAL_ENGINEERING' | ... untuk Safe Browsing, atau alasan blacklist. */
  detail: string | null;
}

export interface UrlScanResult {
  /** Semua URL yang ditemukan di teks. */
  found: ExtractedUrl[];
  /** URL yang di-skip karena domainnya ada di whitelist. */
  whitelisted: ExtractedUrl[];
  threats: UrlThreat[];
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url.toLowerCase()).digest('hex');
}

/**
 * Scan teks: ekstrak URL -> buang yang whitelisted -> cek blacklist lokal ->
 * link yang disamarkan langsung jadi ancaman -> sisanya baru ditanyakan ke
 * Google Safe Browsing (dengan cache di DB).
 *
 * `flagObfuscated` sengaja dimatikan untuk teks OCR: di sana `,` / spasi di
 * sekitar titik biasanya salah baca OCR, bukan niat menyamarkan link.
 */
export async function scanText(
  text: string,
  opts: { useSafeBrowsing?: boolean; guildId?: string | null; flagObfuscated?: boolean } = {},
): Promise<UrlScanResult> {
  const found = extractUrls(text);
  const result: UrlScanResult = { found, whitelisted: [], threats: [] };
  if (found.length === 0) return result;

  const candidates: ExtractedUrl[] = [];
  for (const item of found) {
    if (await isWhitelisted(item.domain, opts.guildId)) {
      result.whitelisted.push(item);
      continue;
    }
    candidates.push(item);
  }
  if (candidates.length === 0) return result;

  // 1. Blacklist lokal — gratis dan paling otoritatif untuk komunitas ini.
  const remaining: ExtractedUrl[] = [];
  for (const item of candidates) {
    const hit = await checkDomainBlacklist(item.domain);
    if (hit) {
      result.threats.push({
        url: item.url,
        domain: hit.domain,
        source: 'blacklist',
        detail: hit.viaLeet
          ? `${hit.reason ?? 'Domain blacklist'} (ditulis sebagai ${item.domain})`
          : hit.reason,
      });
    } else if (opts.flagObfuscated && item.obfuscation) {
      // Orang yang sengaja menyamarkan link sedang menghindari filter — tidak
      // perlu menunggu Safe Browsing (yang juga belum tentu kenal domain baru).
      result.threats.push({
        url: item.url,
        domain: item.domain,
        source: 'heuristic',
        detail: `Link disamarkan (${item.obfuscation})`,
      });
    } else {
      remaining.push(item);
    }
  }

  // 2. Google Safe Browsing untuk domain yang belum dikenal.
  const useSafeBrowsing = opts.useSafeBrowsing ?? true;
  if (remaining.length > 0 && useSafeBrowsing && config.safeBrowsing.enabled) {
    try {
      const verdicts = await checkSafeBrowsing(remaining.map((r) => r.url));
      for (const item of remaining) {
        const verdict = verdicts.get(item.url);
        if (verdict?.isThreat) {
          result.threats.push({
            url: item.url,
            domain: item.domain,
            source: 'safe_browsing',
            detail: verdict.threatType,
          });
        }
      }
    } catch (err) {
      log.warn('Safe Browsing gagal, lanjut dengan hasil blacklist lokal saja', err);
    }
  }

  return result;
}

interface Verdict {
  isThreat: boolean;
  threatType: string | null;
}

/** Cek sekumpulan URL ke Safe Browsing, dengan cache di tabel url_scan_cache. */
export async function checkSafeBrowsing(urls: string[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  if (!config.safeBrowsing.apiKey || urls.length === 0) return out;

  const unique = [...new Set(urls)].slice(0, MAX_URLS_PER_REQUEST);
  const hashes = unique.map(hashUrl);
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const cached = await db
    .select({
      urlHash: urlScanCache.urlHash,
      url: urlScanCache.url,
      isThreat: urlScanCache.isThreat,
      threatType: urlScanCache.threatType,
    })
    .from(urlScanCache)
    .where(and(inArray(urlScanCache.urlHash, hashes), gt(urlScanCache.checkedAt, cutoff)));

  const cachedByHash = new Map(cached.map((c) => [c.urlHash, c]));
  const toQuery: string[] = [];

  for (const url of unique) {
    const hit = cachedByHash.get(hashUrl(url));
    if (hit) out.set(url, { isThreat: hit.isThreat, threatType: hit.threatType });
    else toQuery.push(url);
  }

  if (toQuery.length === 0) return out;

  const matches = await callSafeBrowsingApi(toQuery);

  const rows = toQuery.map((url) => {
    const threatType = matches.get(url) ?? null;
    out.set(url, { isThreat: threatType !== null, threatType });
    return {
      urlHash: hashUrl(url),
      url,
      isThreat: threatType !== null,
      threatType,
      checkedAt: new Date(),
    };
  });

  await db
    .insert(urlScanCache)
    .values(rows)
    .onConflictDoUpdate({
      target: urlScanCache.urlHash,
      set: {
        isThreat: sql`excluded.is_threat`,
        threatType: sql`excluded.threat_type`,
        checkedAt: sql`excluded.checked_at`,
      },
    });

  return out;
}

/** Raw call ke Safe Browsing Lookup API v4. Mengembalikan map url -> threatType. */
async function callSafeBrowsingApi(urls: string[]): Promise<Map<string, string>> {
  const endpoint = `${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(config.safeBrowsing.apiKey!)}`;
  const body = {
    client: { clientId: 'voler-scam-guard', clientVersion: '1.0.0' },
    threatInfo: {
      threatTypes: [
        'MALWARE',
        'SOCIAL_ENGINEERING',
        'UNWANTED_SOFTWARE',
        'POTENTIALLY_HARMFUL_APPLICATION',
      ],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: urls.map((url) => ({ url })),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Safe Browsing HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const json = (await res.json()) as {
      matches?: Array<{ threat: { url: string }; threatType: string }>;
    };

    const map = new Map<string, string>();
    for (const m of json.matches ?? []) {
      map.set(m.threat.url, m.threatType);
    }
    return map;
  } finally {
    clearTimeout(timer);
  }
}

/** Buang entri cache yang sudah kedaluwarsa. Dipanggil periodik dari index.ts. */
export async function pruneUrlCache(): Promise<number> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS * 2);
  const deleted = await db
    .delete(urlScanCache)
    .where(lt(urlScanCache.checkedAt, cutoff))
    .returning({ urlHash: urlScanCache.urlHash });
  return deleted.length;
}

export { extractUrls };
