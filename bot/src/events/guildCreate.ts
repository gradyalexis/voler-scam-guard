import { Events, type Guild } from 'discord.js';
import { enforceGuildAccess } from '../services/guildAccess.js';
import { ensureGuildRow } from '../services/settings.js';
import { createLogger } from '../util/logger.js';
import type { EventModule } from './types.js';

const log = createLogger('guild');

export const guildCreateEvent: EventModule<Events.GuildCreate> = {
  name: Events.GuildCreate,
  execute: async (guild: Guild) => {
    log.info(`Bot ditambahkan ke server ${guild.name} (${guild.id})`);
    if (!(await enforceGuildAccess(guild))) return;
    await ensureGuildRow(guild.id, guild.name, guild.icon).catch((err) =>
      log.warn('Gagal membuat baris setting', err),
    );
  },
};
