import { Events, type Message } from 'discord.js';
import { applyActions, logCleanMessage } from '../services/actions.js';
import { scanMessage } from '../services/detector.js';
import { ingestReportMessage } from '../services/reportIntake.js';
import {
  getSettings,
  isIgnoredMember,
  shouldScanChannel,
} from '../services/settings.js';
import { createLogger } from '../util/logger.js';
import type { EventModule } from './types.js';

const log = createLogger('message');

/** Guard umum untuk messageCreate & messageUpdate. */
export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.system) return;
  if (!message.inGuild()) return;

  const settings = await getSettings(message.guildId);

  // Channel laporan diproses terpisah: isinya memang berisi identifier scam.
  if (settings.reportChannelId && message.channelId === settings.reportChannelId) {
    await ingestReportMessage(message);
    return;
  }

  if (settings.mode === 'off') return;

  const parentId = 'parentId' in message.channel ? (message.channel.parentId ?? null) : null;
  if (!shouldScanChannel(settings, message.channelId, parentId)) return;

  const roleIds = message.member?.roles.cache.map((r) => r.id) ?? [];
  if (isIgnoredMember(settings, roleIds)) return;

  const hasContent = message.content.trim().length > 0;
  const hasAttachments = message.attachments.size > 0;
  if (!hasContent && !hasAttachments) return;

  try {
    const outcome = await scanMessage({
      content: message.content,
      attachments: message.attachments.map((a) => ({
        url: a.url,
        contentType: a.contentType,
        size: a.size,
        name: a.name,
      })),
      settings,
    });

    if (outcome.findings.length > 0) {
      const action = await applyActions(message, outcome, settings);
      log.info(
        `Deteksi di ${message.guildId}/${message.channelId} oleh ${message.author.tag}: ` +
          `${outcome.findings.length} temuan -> ${action}`,
      );
    } else if (settings.logCleanMessages) {
      await logCleanMessage(message, outcome);
    }
  } catch (err) {
    log.error(`Gagal memproses pesan ${message.id}`, err);
  }
}

export const messageCreateEvent: EventModule<Events.MessageCreate> = {
  name: Events.MessageCreate,
  execute: handleMessage,
};
