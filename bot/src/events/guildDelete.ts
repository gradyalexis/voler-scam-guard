import { Events, type Guild } from 'discord.js';
import { markGuildLeft } from '../services/settings.js';
import { createLogger } from '../util/logger.js';
import type { EventModule } from './types.js';

const log = createLogger('guild');

export const guildDeleteEvent: EventModule<Events.GuildDelete> = {
  name: Events.GuildDelete,
  execute: async (guild: Guild) => {
    // guildDelete juga dikirim saat server sedang outage; itu bukan berarti bot dikeluarkan.
    if (!guild.available) return;
    log.info(`Bot dikeluarkan dari server ${guild.name} (${guild.id})`);
    await markGuildLeft(guild.id).catch((err) =>
      log.warn('Gagal menandai server yang ditinggalkan', err),
    );
  },
};
