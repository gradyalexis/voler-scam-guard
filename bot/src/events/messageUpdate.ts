import { Events, type Message, type PartialMessage } from 'discord.js';
import { createLogger } from '../util/logger.js';
import { handleMessage } from './messageCreate.js';
import type { EventModule } from './types.js';

const log = createLogger('message-update');

/**
 * Pesan yang sudah lolos scan bisa diedit jadi berisi link scam, jadi hasil
 * edit ikut di-scan ulang dengan pipeline yang sama.
 */
export const messageUpdateEvent: EventModule<Events.MessageUpdate> = {
  name: Events.MessageUpdate,
  execute: async (_old: Message | PartialMessage, updated: Message | PartialMessage) => {
    try {
      const message = updated.partial ? await updated.fetch() : (updated as Message);
      await handleMessage(message);
    } catch (err) {
      log.debug('Gagal mengambil pesan hasil edit', err);
    }
  },
};
