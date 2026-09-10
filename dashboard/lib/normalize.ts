/**
 * Salinan fungsi normalisasi dari bot (bot/src/util/text.ts). Dashboard menulis
 * ke kolom yang sama (`identifier_norm`), jadi aturannya harus persis sama —
 * kalau salah satu diubah, ubah dua-duanya.
 */

export function normalizeDomain(host: string): string {
  let d = host.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.split('/')[0] ?? '';
  d = d.split('@').pop() ?? '';
  d = d.split(':')[0] ?? '';
  d = d.replace(/\.+$/, '');
  d = d.replace(/^www\./, '');
  return d;
}

export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  const letters = trimmed.replace(/[^a-z]/g, '');

  if (digitsOnly.length >= 6 && letters.length <= 2) return digitsOnly;

  return trimmed.replace(/^@/, '').replace(/[^a-z0-9_.]/g, '');
}

export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}
