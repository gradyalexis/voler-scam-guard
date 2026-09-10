import { EmbedBuilder, type Message } from 'discord.js';
import { createLogger } from '../util/logger.js';
import { truncate } from '../util/text.js';
import { reportAccount } from './blacklistCheck.js';

const log = createLogger('report-intake');

/** Nomor rekening / e-wallet Indonesia realistis: 8–20 digit. */
const ACCOUNT_NUMBER_RE = /\b\d[\d\s.-]{6,24}\d\b/g;
const DISCORD_ID_RE = /\b\d{17,20}\b/g;
const MENTION_RE = /<@!?(\d{17,20})>/g;

/**
 * Tangkap laporan yang diposting user di channel `#blacklist-account-rekening`.
 * Semua hasil masuk sebagai `pending` dan baru aktif setelah di-approve lewat
 * dashboard atau `/scamguard verify`.
 */
export async function ingestReportMessage(message: Message): Promise<void> {
  const content = message.content ?? '';
  const evidenceUrl = message.attachments.first()?.url ?? null;

  const created: string[] = [];
  const seen = new Set<string>();

  const add = async (accountType: string, identifier: string) => {
    const key = `${accountType}:${identifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { created: ok } = await reportAccount({
      accountType,
      identifier,
      reason: truncate(content, 500) || 'Laporan dari channel report',
      evidenceUrl,
      reportedBy: message.author.id,
      status: 'pending',
    });
    if (ok) created.push(`${accountType}: \`${identifier}\``);
  };

  for (const m of content.matchAll(MENTION_RE)) {
    if (m[1]) await add('discord', m[1]);
  }

  const discordIds = new Set<string>();
  for (const m of content.matchAll(DISCORD_ID_RE)) {
    if (m[0]) discordIds.add(m[0]);
  }
  for (const id of discordIds) await add('discord', id);

  for (const m of content.matchAll(ACCOUNT_NUMBER_RE)) {
    const raw = m[0]?.trim();
    if (!raw) continue;
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 20) continue;
    if (discordIds.has(digits)) continue; // sudah tercatat sebagai akun discord
    await add('bank', raw);
  }

  if (created.length === 0) {
    log.debug(`Tidak ada identifier terdeteksi di laporan ${message.id}`);
    return;
  }

  log.info(`${created.length} laporan baru dari ${message.author.tag} masuk antrean review`);

  try {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe2953c)
          .setTitle('Laporan diterima')
          .setDescription(
            [
              'Entri berikut masuk antrean review moderator (status: `pending`):',
              ...created.slice(0, 10).map((c) => `• ${c}`),
              '',
              'Bot belum akan memblokir entri ini sampai di-approve.',
            ].join('\n'),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    log.debug('Gagal membalas laporan', err);
  }
}
