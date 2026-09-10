import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { guildSettings, type GuildSetting } from '../db/schema.js';
import { createLogger } from '../util/logger.js';
import { DEFAULT_THRESHOLD } from './heuristicScanner.js';

const log = createLogger('settings');

/** Setting jarang berubah tapi dibaca tiap pesan, jadi di-cache pendek. */
const CACHE_TTL_MS = 30_000;

export type BotMode = 'auto_delete' | 'warn' | 'flag_only' | 'off';
/** Di mana heuristik pola scam dijalankan: mati, hanya gambar, atau gambar + teks. */
export type HeuristicMode = 'off' | 'images' | 'all';

export interface EffectiveSettings {
  guildId: string;
  mode: BotMode;
  scanUrls: boolean;
  scanImages: boolean;
  useSafeBrowsing: boolean;
  logCleanMessages: boolean;
  heuristicMode: HeuristicMode;
  heuristicThreshold: number;
  modLogChannelId: string | null;
  reportChannelId: string | null;
  scannedChannelIds: string[];
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
}

const cache = new Map<string, { value: EffectiveSettings; at: number }>();

function fromRow(guildId: string, row: GuildSetting | undefined): EffectiveSettings {
  return {
    guildId,
    mode: (row?.mode as BotMode | undefined) ?? config.defaults.mode,
    scanUrls: row?.scanUrls ?? true,
    scanImages: row?.scanImages ?? true,
    useSafeBrowsing: row?.useSafeBrowsing ?? true,
    logCleanMessages: row?.logCleanMessages ?? false,
    heuristicMode: (row?.heuristicMode as HeuristicMode | undefined) ?? 'images',
    heuristicThreshold: row?.heuristicThreshold ?? DEFAULT_THRESHOLD,
    modLogChannelId: row?.modLogChannelId ?? null,
    reportChannelId: row?.reportChannelId ?? null,
    scannedChannelIds: row?.scannedChannelIds ?? [],
    ignoredChannelIds: row?.ignoredChannelIds ?? [],
    ignoredRoleIds: row?.ignoredRoleIds ?? [],
  };
}

export async function getSettings(guildId: string): Promise<EffectiveSettings> {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const rows = await db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1);

  const value = fromRow(guildId, rows[0]);
  cache.set(guildId, { value, at: Date.now() });
  return value;
}

export function invalidateSettings(guildId?: string): void {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}

/** Pastikan guild punya baris setting — dipanggil saat bot join / startup. */
export async function ensureGuildRow(guildId: string, guildName: string): Promise<void> {
  await db
    .insert(guildSettings)
    .values({ guildId, guildName, mode: config.defaults.mode })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: { guildName },
    });
  invalidateSettings(guildId);
}

export async function updateSettings(
  guildId: string,
  patch: Partial<Omit<EffectiveSettings, 'guildId'>>,
): Promise<EffectiveSettings> {
  await db
    .insert(guildSettings)
    .values({ guildId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: { ...patch, updatedAt: new Date() },
    });
  invalidateSettings(guildId);
  log.info(`Setting guild ${guildId} diperbarui: ${Object.keys(patch).join(', ')}`);
  return getSettings(guildId);
}

/**
 * Apakah channel ini harus di-scan?
 * - `scannedChannelIds` kosong  -> semua channel di-scan
 * - `scannedChannelIds` terisi  -> hanya channel di daftar itu
 * - `ignoredChannelIds` selalu menang
 */
export function shouldScanChannel(
  settings: EffectiveSettings,
  channelId: string,
  parentId: string | null,
): boolean {
  const ids = [channelId, parentId].filter((v): v is string => Boolean(v));
  if (ids.some((id) => settings.ignoredChannelIds.includes(id))) return false;
  if (settings.scannedChannelIds.length === 0) return true;
  return ids.some((id) => settings.scannedChannelIds.includes(id));
}

export function isIgnoredMember(settings: EffectiveSettings, roleIds: string[]): boolean {
  if (settings.ignoredRoleIds.length === 0) return false;
  return roleIds.some((id) => settings.ignoredRoleIds.includes(id));
}
