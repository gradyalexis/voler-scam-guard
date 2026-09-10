import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { commands } from './commands/index.js';
import { config } from './config.js';
import { closeDatabase, waitForDatabase } from './db/client.js';
import { events } from './events/index.js';
import { initOcr, shutdownOcr } from './services/ocrScanner.js';
import { pruneUrlCache } from './services/urlScanner.js';
import { createLogger } from './util/logger.js';

const log = createLogger('bot');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // MessageContent adalah privileged intent — aktifkan di Developer Portal.
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

for (const event of events) {
  const handler = (...args: unknown[]) =>
    Promise.resolve((event.execute as (...a: unknown[]) => unknown)(...args)).catch((err) =>
      log.error(`Handler event ${String(event.name)} gagal`, err),
    );

  if (event.once) client.once(event.name, handler);
  else client.on(event.name, handler);
}

client.on('error', (err) => log.error('Client error', err));
client.on('shardError', (err) => log.error('Shard error', err));
client.rest.on('rateLimited', (info) =>
  log.warn(`Kena rate limit: ${info.route} (${info.timeToReset}ms)`),
);

/** Daftarkan slash command secara global saat startup. */
async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  try {
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: commands.map((c) => c.data),
    });
    log.info(`${commands.length} slash command terdaftar`);
  } catch (err) {
    log.error('Gagal mendaftarkan slash command', err);
  }
}

let pruneTimer: NodeJS.Timeout | undefined;

async function main(): Promise<void> {
  log.info('Voler Scam Guard starting…');
  if (!config.safeBrowsing.enabled) {
    log.warn('GOOGLE_SAFE_BROWSING_API_KEY kosong — deteksi URL hanya pakai blacklist lokal');
  }

  await waitForDatabase();
  await registerCommands();

  // OCR di-warm-up di background: download traineddata bisa makan waktu dan
  // tidak boleh menahan bot online.
  void initOcr();

  // Bersihkan cache Safe Browsing yang kedaluwarsa tiap 6 jam.
  pruneTimer = setInterval(
    () => {
      pruneUrlCache()
        .then((n) => n > 0 && log.debug(`${n} entri url_scan_cache dibersihkan`))
        .catch((err) => log.warn('Gagal prune url_scan_cache', err));
    },
    6 * 60 * 60 * 1000,
  );
  pruneTimer.unref();

  await client.login(config.discord.token);
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Menerima ${signal}, mematikan bot…`);

  if (pruneTimer) clearInterval(pruneTimer);
  const timeout = setTimeout(() => {
    log.warn('Shutdown timeout, force exit');
    process.exit(1);
  }, 10_000);
  timeout.unref();

  try {
    await shutdownOcr();
    client.destroy();
    await closeDatabase();
  } catch (err) {
    log.error('Error saat shutdown', err);
  } finally {
    log.info('Bot berhenti');
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', reason));
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', err);
  void shutdown('uncaughtException');
});

main().catch((err) => {
  log.error('Startup gagal', err);
  process.exit(1);
});
