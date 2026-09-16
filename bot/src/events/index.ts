import { guildCreateEvent } from './guildCreate.js';
import { guildDeleteEvent } from './guildDelete.js';
import { messageCreateEvent } from './messageCreate.js';
import { messageUpdateEvent } from './messageUpdate.js';
import { readyEvent } from './ready.js';
import type { EventModule } from './types.js';

export const events: EventModule[] = [
  readyEvent,
  guildCreateEvent,
  guildDeleteEvent,
  messageCreateEvent,
  messageUpdateEvent,
] as EventModule[];
