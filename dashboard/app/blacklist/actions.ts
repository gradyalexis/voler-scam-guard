'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { blacklistAccounts, blacklistDomains } from '@/lib/db/schema';
import { requireRole, requireSession } from '@/lib/auth';
import { isValidDomain, normalizeDomain, normalizeIdentifier } from '@/lib/normalize';

export interface ActionState {
  ok?: string;
  error?: string;
}

export async function addDomainAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const domain = normalizeDomain(String(formData.get('domain') ?? ''));
  const reason = String(formData.get('reason') ?? '').trim() || null;

  if (!isValidDomain(domain)) return { error: 'Domain tidak valid.' };

  const inserted = await db
    .insert(blacklistDomains)
    .values({ domain, reason, addedBy: session.discordId })
    .onConflictDoNothing({ target: blacklistDomains.domain })
    .returning({ id: blacklistDomains.id });

  revalidatePath('/blacklist');
  return inserted.length > 0
    ? { ok: `${domain} ditambahkan ke blacklist.` }
    : { error: `${domain} sudah ada di blacklist.` };
}

export async function removeDomainAction(formData: FormData): Promise<void> {
  await requireSession();
  const id = Number(formData.get('id'));
  if (Number.isFinite(id)) {
    await db.delete(blacklistDomains).where(eq(blacklistDomains.id, id));
    revalidatePath('/blacklist');
  }
}

export async function addAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const identifier = String(formData.get('identifier') ?? '').trim();
  const accountType = String(formData.get('accountType') ?? 'bank');
  const identifierNorm = normalizeIdentifier(identifier);

  if (identifierNorm.length < 4) {
    return { error: 'Identifier terlalu pendek (minimal 4 karakter setelah normalisasi).' };
  }

  const inserted = await db
    .insert(blacklistAccounts)
    .values({
      accountType,
      identifier,
      identifierNorm,
      reason: String(formData.get('reason') ?? '').trim() || null,
      evidenceUrl: String(formData.get('evidenceUrl') ?? '').trim() || null,
      reportedBy: session.discordId,
      status: 'verified',
      reviewedBy: session.discordId,
      reviewedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [blacklistAccounts.accountType, blacklistAccounts.identifierNorm],
    })
    .returning({ id: blacklistAccounts.id });

  revalidatePath('/blacklist');
  return inserted.length > 0
    ? { ok: `${identifier} ditambahkan sebagai verified.` }
    : { error: 'Identifier itu sudah ada di database.' };
}

export async function setAccountStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));

  if (!Number.isFinite(id)) return;
  if (!['pending', 'verified', 'rejected'].includes(status)) return;

  await db
    .update(blacklistAccounts)
    .set({ status, reviewedBy: session.discordId, reviewedAt: new Date() })
    .where(eq(blacklistAccounts.id, id));

  revalidatePath('/blacklist');
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  // Menghapus permanen menghilangkan jejak audit, jadi dibatasi role admin ke atas.
  await requireRole('admin');
  const id = Number(formData.get('id'));
  if (Number.isFinite(id)) {
    await db.delete(blacklistAccounts).where(eq(blacklistAccounts.id, id));
    revalidatePath('/blacklist');
  }
}
