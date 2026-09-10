'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminUsers, guildSettings } from '@/lib/db/schema';
import { requireRole, requireSession } from '@/lib/auth';

export interface ActionState {
  ok?: string;
  error?: string;
}

const MODES = ['auto_delete', 'warn', 'flag_only', 'off'];
const HEURISTIC_MODES = ['off', 'images', 'all'];

/** "111, 222 333" -> ["111","222","333"] */
function parseIds(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{5,25}$/.test(s));
}

function parseChannelId(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return /^\d{5,25}$/.test(raw) ? raw : null;
}

export async function updateGuildSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const guildId = String(formData.get('guildId') ?? '').trim();
  if (!/^\d{5,25}$/.test(guildId)) return { error: 'Guild ID tidak valid.' };

  const mode = String(formData.get('mode') ?? 'flag_only');
  if (!MODES.includes(mode)) return { error: 'Mode tidak dikenal.' };

  const heuristicMode = String(formData.get('heuristicMode') ?? 'images');
  if (!HEURISTIC_MODES.includes(heuristicMode)) return { error: 'Mode heuristik tidak dikenal.' };

  const heuristicThreshold = Number(formData.get('heuristicThreshold') ?? 8);
  if (!Number.isInteger(heuristicThreshold) || heuristicThreshold < 3 || heuristicThreshold > 30) {
    return { error: 'Ambang heuristik harus bilangan bulat 3–30.' };
  }

  const modLogRaw = String(formData.get('modLogChannelId') ?? '').trim();
  const reportRaw = String(formData.get('reportChannelId') ?? '').trim();
  if (modLogRaw && !parseChannelId(modLogRaw)) return { error: 'Mod-log channel ID tidak valid.' };
  if (reportRaw && !parseChannelId(reportRaw)) return { error: 'Report channel ID tidak valid.' };

  await db
    .update(guildSettings)
    .set({
      mode,
      scanUrls: formData.get('scanUrls') === 'on',
      scanImages: formData.get('scanImages') === 'on',
      useSafeBrowsing: formData.get('useSafeBrowsing') === 'on',
      logCleanMessages: formData.get('logCleanMessages') === 'on',
      heuristicMode,
      heuristicThreshold,
      modLogChannelId: parseChannelId(modLogRaw),
      reportChannelId: parseChannelId(reportRaw),
      scannedChannelIds: parseIds(formData.get('scannedChannelIds')),
      ignoredChannelIds: parseIds(formData.get('ignoredChannelIds')),
      ignoredRoleIds: parseIds(formData.get('ignoredRoleIds')),
      updatedAt: new Date(),
    })
    .where(eq(guildSettings.guildId, guildId));

  revalidatePath('/settings');
  return { ok: 'Setting tersimpan. Bot menerapkan perubahan dalam ≤30 detik.' };
}

export async function setAdminRoleAction(formData: FormData): Promise<void> {
  await requireRole('owner');
  const id = Number(formData.get('id'));
  const role = String(formData.get('role'));
  if (!Number.isFinite(id) || !['owner', 'admin', 'moderator'].includes(role)) return;

  await db.update(adminUsers).set({ role }).where(eq(adminUsers.id, id));
  revalidatePath('/settings');
}

export async function addAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('owner');
  const discordId = String(formData.get('discordId') ?? '').trim();
  const role = String(formData.get('role') ?? 'moderator');

  if (!/^\d{15,25}$/.test(discordId)) return { error: 'Discord user ID tidak valid.' };
  if (!['owner', 'admin', 'moderator'].includes(role)) return { error: 'Role tidak dikenal.' };

  const inserted = await db
    .insert(adminUsers)
    .values({ discordId, role })
    .onConflictDoNothing({ target: adminUsers.discordId })
    .returning({ id: adminUsers.id });

  revalidatePath('/settings');
  return inserted.length > 0
    ? { ok: `${discordId} ditambahkan sebagai ${role}.` }
    : { error: 'User itu sudah terdaftar.' };
}

export async function removeAdminAction(formData: FormData): Promise<void> {
  const session = await requireRole('owner');
  const id = Number(formData.get('id'));
  const discordId = String(formData.get('discordId') ?? '');
  // Jangan biarkan owner mengunci dirinya sendiri keluar dari dashboard.
  if (!Number.isFinite(id) || discordId === session.discordId) return;

  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  revalidatePath('/settings');
}
