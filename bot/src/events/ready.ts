import { ActivityType, Events, type Client } from 'discord.js';
import { ensureGuildRow } from '../services/settings.js';
import { createLogger } from '../util/logger.js';
import type { EventModule } from './types.js';

const log = createLogger('ready');

export const readyEvent: EventModule<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute: async (client: Client<true>) => {
    log.info(`Login sebagai ${client.user.tag} di ${client.guilds.cache.size} server`);

    client.user.setPresence({
      status: 'online',
      activities: [{ name: 'link & gambar scam', type: ActivityType.Watching }],
    });

    for (const guild of client.guilds.cache.values()) {
      try {
        await ensureGuildRow(guild.id, guild.name);
      } catch (err) {
        log.warn(`Gagal menyiapkan setting untuk guild ${guild.id}`, err);
      }
    }
  },
};
