import { scamguardCommand } from './scamguard.js';
import type { CommandModule } from './types.js';

export const commands: CommandModule[] = [scamguardCommand];

export const commandMap = new Map<string, CommandModule>(
  commands.map((c) => [c.data.name, c]),
);
