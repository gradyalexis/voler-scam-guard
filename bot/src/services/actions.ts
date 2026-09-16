import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type Message,
} from 'discord.js';
import { db } from '../db/client.js';
import { detectionLogs } from '../db/schema.js';
import { createLogger } from '../util/logger.js';
import { codeBlock, inlineCode, plainText } from '../util/discordText.js';
import { truncate } from '../util/text.js';
import type { Finding, ScanOutcome } from './detector.js';
import type { EffectiveSettings } from './settings.js';

const log = createLogger('actions');

export type ActionTaken = 'deleted' | 'warned' | 'flagged_only' | 'none';

const SEVERITY_COLOR: Record<string, number> = {
  high: 0xe23c3c,
  medium: 0xe2953c,
  low: 0x3c8ce2,
};

/**
 * Terapkan aksi sesuai mode guild, kirim mod-log, lalu catat semuanya ke
 * detection_logs. Kegagalan salah satu langkah tidak boleh menggagalkan sisanya.
 */
export async function applyActions(
  message: Message,
  outcome: ScanOutcome,
  settings: EffectiveSettings,
): Promise<ActionTaken> {
  const action = await performAction(message, settings, outcome.findings);

  await Promise.allSettled([
    sendModLog(message, outcome, settings, action),
    writeLogs(message, outcome, action),
  ]);

  return action;
}

async function performAction(
  message: Message,
  settings: EffectiveSettings,
  findings: Finding[],
): Promise<ActionTaken> {
  if (findings.length === 0) return 'none';

  // Temuan heuristik berskor sedang bisa salah tebak (mis. postingan giveaway
  // yang asli), jadi tidak dipakai sebagai dasar menghapus pesan orang.
  const hasHighSeverity = findings.some((f) => f.severity === 'high');

  switch (settings.mode) {
    case 'off':
      return 'none';

    case 'auto_delete': {
      if (!hasHighSeverity) {
        const warned = await warnInChannel(message, findings);
        return warned ? 'warned' : 'flagged_only';
      }
      const deleted = await deleteMessage(message);
      if (deleted) {
        await notifyUser(message, findings);
        return 'deleted';
      }
      return 'flagged_only';
    }

    case 'warn_delete': {
      // Temuan non-high tidak dihapus, sama seperti auto_delete: heuristik
      // berskor sedang terlalu sering salah tebak untuk menghapus pesan orang.
      if (!hasHighSeverity) {
        const warned = await warnInChannel(message, findings);
        return warned ? 'warned' : 'flagged_only';
      }

      // Hapus dulu, baru umumkan — kalau penghapusan gagal (izin kurang),
      // pengumumannya tidak terlanjur bilang pesannya sudah hilang.
      const deleted = await deleteMessage(message);
      if (!deleted) {
        const warned = await warnInChannel(message, findings);
        return warned ? 'warned' : 'flagged_only';
      }

      await announceRemoval(message, findings);
      await notifyUser(message, findings);
      return 'deleted';
    }

    case 'warn': {
      const warned = await warnInChannel(message, findings);
      return warned ? 'warned' : 'flagged_only';
    }

    case 'flag_only':
    default:
      return 'flagged_only';
  }
}

async function deleteMessage(message: Message): Promise<boolean> {
  try {
    if (!message.deletable) {
      log.warn(`Pesan ${message.id} tidak bisa dihapus (izin kurang?)`);
      return false;
    }
    await message.delete();
    return true;
  } catch (err) {
    log.warn(`Gagal menghapus pesan ${message.id}`, err);
    return false;
  }
}

/** Kirim DM ke user setelah pesannya dihapus. Gagal DM itu normal dan diabaikan. */
async function notifyUser(message: Message, findings: Finding[]): Promise<void> {
  const first = findings[0];
  if (!first) return;
  try {
    await message.author.send({
      embeds: [
        new EmbedBuilder()
          .setColor(SEVERITY_COLOR.high!)
          .setTitle('Pesan kamu dihapus oleh Scam Guard')
          .setDescription(
            [
              `Pesan kamu di **${message.guild?.name ?? 'server'}** terdeteksi mengandung indikasi scam.`,
              '',
              `**Terdeteksi:** ${inlineCode(first.matchedValue, 120)}`,
              first.detail ? `**Alasan:** ${plainText(first.detail, 300)}` : '',
              '',
              'Kalau ini salah deteksi, hubungi moderator server.',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .setTimestamp(),
      ],
    });
  } catch {
    /* DM tertutup — tidak apa-apa */
  }
}

async function warnInChannel(message: Message, findings: Finding[]): Promise<boolean> {
  const first = findings[0];
  if (!first) return false;
  try {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(SEVERITY_COLOR.high!)
          .setTitle('⚠️ Peringatan scam')
          .setDescription(
            [
              `Pesan ini terdeteksi mengandung indikasi scam: ${inlineCode(first.matchedValue, 120)}`,
              first.detail ? `_${plainText(first.detail, 300)}_` : '',
              '',
              'Jangan lakukan transaksi sebelum diverifikasi moderator.',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return true;
  } catch (err) {
    log.warn('Gagal mengirim peringatan di channel', err);
    return false;
  }
}

/**
 * Umumkan di channel setelah pesannya dihapus (mode warn_delete). Sengaja bukan
 * reply: pesan yang dirujuk sudah tidak ada, dan Discord akan menampilkannya
 * sebagai balasan ke pesan terhapus. Penulisnya disebut lewat mention supaya
 * konteksnya jelas, tapi tanpa ping — tidak perlu menarik perhatian ke pelaku.
 */
async function announceRemoval(message: Message, findings: Finding[]): Promise<boolean> {
  const first = findings[0];
  if (!first) return false;
  if (!message.channel.isSendable()) return false;

  try {
    await message.channel.send({
      content: `Pesan dari ${message.author} dihapus oleh Scam Guard.`,
      embeds: [
        new EmbedBuilder()
          .setColor(SEVERITY_COLOR.high!)
          .setTitle('🛡️ Pesan scam dihapus')
          .setDescription(
            [
              `**Terdeteksi:** ${inlineCode(first.matchedValue, 120)}`,
              first.detail ? `_${plainText(first.detail, 300)}_` : '',
              '',
              'Jangan lanjutkan transaksi apa pun dari pesan tersebut.',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .setTimestamp(),
      ],
      // Mention tetap tampil sebagai nama, tapi tidak mengirim notifikasi.
      allowedMentions: { users: [] },
    });
    return true;
  } catch (err) {
    log.warn('Gagal mengumumkan penghapusan di channel', err);
    return false;
  }
}

async function sendModLog(
  message: Message,
  outcome: ScanOutcome,
  settings: EffectiveSettings,
  action: ActionTaken,
): Promise<void> {
  if (outcome.findings.length === 0) return;
  if (!settings.modLogChannelId) return;

  const channel = await resolveTextChannel(message.client, settings.modLogChannelId);
  if (!channel) return;

  const first = outcome.findings[0]!;
  const embed = new EmbedBuilder()
    .setColor(SEVERITY_COLOR[first.severity] ?? SEVERITY_COLOR.high!)
    .setTitle('🚨 Deteksi scam')
    .addFields(
      { name: 'User', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Aksi', value: `\`${action}\``, inline: true },
      {
        name: 'Temuan',
        value: outcome.findings
          .slice(0, 5)
          .map(
            (f) =>
              `• ${inlineCode(f.matchedValue, 80)} — ${f.detectionType}/${f.source}${
                f.modNote ? ` (${f.modNote})` : ''
              }${
                f.detail ? ` — ${plainText(f.detail, 100)}` : ''
              }`,
          )
          .join('\n')
          // Batas field embed Discord 1024 karakter; escape markdown menambah panjang.
          .slice(0, 1024),
      },
    )
    .setTimestamp(message.createdAt);

  if (message.content.trim()) {
    embed.addFields({ name: 'Isi pesan', value: codeBlock(message.content, 1000) });
  }
  if (outcome.ocrText) {
    embed.addFields({ name: 'Teks hasil OCR', value: codeBlock(outcome.ocrText, 800) });
  }
  if (action !== 'deleted') {
    embed.addFields({ name: 'Link pesan', value: message.url });
  }

  const evidence = outcome.findings.find((f) => f.evidenceUrl)?.evidenceUrl;
  if (evidence) embed.setThumbnail(evidence);

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    log.warn('Gagal mengirim mod-log', err);
  }
}

async function resolveTextChannel(client: Client, channelId: string) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return null;
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread
    ) {
      return null;
    }
    const me = channel.guild.members.me;
    if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) {
      log.warn(`Tidak punya izin kirim pesan di channel ${channelId}`);
      return null;
    }
    return channel;
  } catch (err) {
    log.warn(`Channel ${channelId} tidak bisa diakses`, err);
    return null;
  }
}

async function writeLogs(
  message: Message,
  outcome: ScanOutcome,
  action: ActionTaken,
): Promise<void> {
  const base = {
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    userId: message.author.id,
    username: message.author.tag,
    messageContent: truncate(message.content, 2000),
    ocrText: outcome.ocrText ? truncate(outcome.ocrText, 4000) : null,
  };

  const rows =
    outcome.findings.length > 0
      ? outcome.findings.map((f) => ({
          ...base,
          detectionType: f.detectionType,
          source: f.source,
          matchedValue: truncate(f.matchedValue, 500),
          severity: f.severity,
          actionTaken: action,
          evidenceUrl: f.evidenceUrl,
        }))
      : [
          {
            ...base,
            detectionType: 'url' as const,
            source: null,
            matchedValue: null,
            severity: 'low' as const,
            actionTaken: 'none' as const,
            evidenceUrl: null,
          },
        ];

  try {
    await db.insert(detectionLogs).values(rows);
  } catch (err) {
    log.error('Gagal menulis detection_logs', err);
  }
}

/** Log pesan bersih (mode logCleanMessages), tanpa mod-log dan tanpa aksi. */
export async function logCleanMessage(message: Message, outcome: ScanOutcome): Promise<void> {
  if (outcome.urlsFound === 0 && !outcome.ocrText) return;
  try {
    await db.insert(detectionLogs).values({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      userId: message.author.id,
      username: message.author.tag,
      messageContent: truncate(message.content, 2000),
      detectionType: outcome.ocrText ? 'image_ocr' : 'url',
      source: null,
      matchedValue: null,
      severity: 'low',
      actionTaken: 'none',
      ocrText: outcome.ocrText ? truncate(outcome.ocrText, 4000) : null,
    });
  } catch (err) {
    log.error('Gagal menulis log pesan bersih', err);
  }
}
