import { ActivityType, Events, type Client } from 'discord.js';
import { enforceGuildAccess } from '../services/guildAccess.js';
import { ensureGuildRow, markMissingGuildsLeft } from '../services/settings.js';
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
      activities: [{ name: 'Hello brother and sister', type: ActivityType.Watching }],
    });

    const present: string[] = [];
    for (const guild of [...client.guilds.cache.values()]) {
      // Bot bisa diundang ke server lain selagi offline; periksa ulang saat startup.
      if (!(await enforceGuildAccess(guild))) continue;
      present.push(guild.id);
      try {
        await ensureGuildRow(guild.id, guild.name, guild.icon);
      } catch (err) {
        log.warn(`Gagal menyiapkan setting untuk guild ${guild.id}`, err);
      }
    }

    try {
      const left = await markMissingGuildsLeft(present);
      if (left > 0) log.info(`${left} server ditandai sudah tidak berisi bot`);
    } catch (err) {
      log.warn('Gagal menyinkronkan status bot per server', err);
    }
  },
};
