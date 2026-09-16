// ---------------------------------------------------------------------------
// HTTP server kecil untuk health check. Bot ini klien gateway Discord (koneksi
// keluar), jadi endpoint ini satu-satunya port yang dibuka — dipakai
// HEALTHCHECK di Dockerfile dan untuk cek manual dari host.
// ---------------------------------------------------------------------------
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { Client } from 'discord.js';
import { config } from './config.js';
import { pool } from './db/client.js';
import { createLogger } from './util/logger.js';

const log = createLogger('health');

/** Query health tidak boleh menggantung kalau pooler Supabase lagi bermasalah. */
const DB_TIMEOUT_MS = 2000;

async function databaseOk(): Promise<boolean> {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS);
    timer.unref();
  });

  try {
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return true;
  } catch (err) {
    log.warn('Health check database gagal', err);
    return false;
  }
}

async function writeHealth(client: Client, res: ServerResponse, bodyless: boolean): Promise<void> {
  const discordReady = client.isReady();
  const dbReady = await databaseOk();
  const healthy = discordReady && dbReady;

  const body = JSON.stringify({
    status: healthy ? 'ok' : 'degraded',
    discord: discordReady ? 'ready' : 'connecting',
    db: dbReady ? 'ok' : 'error',
    uptime: Math.round(process.uptime()),
  });

  // 503 saat tidak sehat supaya docker/uptime monitor ikut menandai unhealthy.
  res.writeHead(healthy ? 200 : 503, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(bodyless ? undefined : body);
}

/**
 * Jalankan endpoint `GET /health`. Bind ke 0.0.0.0 supaya port mapping docker
 * bekerja; yang menentukan terbuka atau tidak ke luar adalah docker-compose.yml
 * (default diikat ke 127.0.0.1 di host).
 */
export function startHealthServer(client: Client): Server | undefined {
  const port = config.health.port;
  if (port === 0) {
    log.info('HEALTH_PORT=0 — endpoint health dimatikan');
    return undefined;
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const method = req.method ?? 'GET';

    if (path !== '/health' || (method !== 'GET' && method !== 'HEAD')) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end('{"error":"not found"}');
      return;
    }

    void writeHealth(client, res, method === 'HEAD').catch((err) => {
      log.error('Gagal menulis respons health', err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  server.on('error', (err) => log.error('Health server error', err));
  server.listen(port, '0.0.0.0', () => log.info(`Health endpoint siap di :${port}/health`));

  return server;
}

export async function stopHealthServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
