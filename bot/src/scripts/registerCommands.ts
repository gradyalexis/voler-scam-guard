/**
 * Registrasi slash command manual:
 *   npm run register             -> global (butuh ~1 jam untuk propagasi)
 *   GUILD_ID=123 npm run register -> instan, untuk server testing
 */
import { REST, Routes } from 'discord.js';
import { commands } from '../commands/index.js';
import { config } from '../config.js';

const rest = new REST({ version: '10' }).setToken(config.discord.token);
const guildId = process.env.GUILD_ID;
const body = commands.map((c) => c.data);

const route = guildId
  ? Routes.applicationGuildCommands(config.discord.clientId, guildId)
  : Routes.applicationCommands(config.discord.clientId);

await rest.put(route, { body });
console.log(`${body.length} command terdaftar ${guildId ? `di guild ${guildId}` : 'secara global'}`);
