import { escapeMarkdown } from 'discord.js';
import { truncate } from './text.js';

/**
 * Helper untuk menaruh teks yang tidak kita kendalikan (isi pesan scammer, teks
 * OCR, alasan dari model AI yang bisa dipengaruhi tulisan di gambar) ke pesan
 * bot. Tanpa ini, `[Banding di sini](https://situs-jahat)` tampil sebagai link
 * yang bisa diklik — seolah bot anti-scam sendiri yang membagikannya.
 */

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

/** Teks bebas untuk embed: link dibuang dan markdown (termasuk masked link) di-escape. */
export function plainText(value: string, max: number): string {
  const withoutLinks = value.replace(URL_RE, '[link dihapus]');
  return truncate(escapeMarkdown(withoutLinks, { maskedLink: true }), max);
}

/** Nilai pendek dalam `inline code`; Discord tidak merender link atau mention di dalamnya. */
export function inlineCode(value: string, max: number): string {
  const clean = truncate(value.replace(/`/g, "'").replace(/\s+/g, ' ').trim(), max);
  return `\`${clean || '-'}\``;
}

/** Blok kode untuk teks mentah panjang (isi pesan, OCR) di mod-log. */
export function codeBlock(value: string, max: number): string {
  return `\`\`\`\n${truncate(value.replace(/```/g, "'''"), max)}\n\`\`\``;
}
