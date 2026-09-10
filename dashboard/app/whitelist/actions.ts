'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whitelistDomains } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { isValidDomain, normalizeDomain } from '@/lib/normalize';

export interface ActionState {
  ok?: string;
  error?: string;
}

export async function addWhitelistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const domain = normalizeDomain(String(formData.get('domain') ?? ''));
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!isValidDomain(domain)) return { error: 'Domain tidak valid.' };

  const inserted = await db
    .insert(whitelistDomains)
    .values({ domain, note, addedBy: session.discordId })
    .onConflictDoNothing({ target: whitelistDomains.domain })
    .returning({ id: whitelistDomains.id });

  revalidatePath('/whitelist');
  return inserted.length > 0
    ? { ok: `${domain} ditambahkan ke whitelist.` }
    : { error: `${domain} sudah ada di whitelist.` };
}

export async function removeWhitelistAction(formData: FormData): Promise<void> {
  await requireSession();
  const id = Number(formData.get('id'));
  if (Number.isFinite(id)) {
    await db.delete(whitelistDomains).where(eq(whitelistDomains.id, id));
    revalidatePath('/whitelist');
  }
}
