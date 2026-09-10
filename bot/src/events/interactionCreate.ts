import { Events, MessageFlags, type Interaction } from 'discord.js';
import { commandMap } from '../commands/index.js';
import { createLogger } from '../util/logger.js';
import type { EventModule } from './types.js';

const log = createLogger('interaction');

export const interactionCreateEvent: EventModule<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  execute: async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      log.warn(`Command tidak dikenal: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      log.error(`Command ${interaction.commandName} melempar error`, err);
      const payload = {
        content: 'Terjadi error saat menjalankan command.',
        flags: MessageFlags.Ephemeral as const,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
