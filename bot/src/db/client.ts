import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import { createLogger } from '../util/logger.js';
import { poolConnectionOptions } from './connection.js';
import * as schema from './schema.js';

const log = createLogger('db');

export const pool = new pg.Pool({
  ...poolConnectionOptions(config.db.url, config.db.sslCaFile),
  max: config.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  log.error('Idle client error di pool postgres', err);
});

export const db = drizzle(pool, { schema });
export { schema };

/** SQLSTATE untuk kredensial salah — retry tidak akan pernah memperbaikinya. */
const AUTH_ERROR_CODES = new Set(['28P01', '28000']);

/** Jeda retry maksimum; tanpa batas atas backoff bisa jadi berjam-jam. */
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Tunggu sampai postgres siap. Container bot sering start lebih dulu dari
 * postgres walaupun ada depends_on, jadi retry di awal itu wajib.
 *
 * Jedanya naik eksponensial, dan error kredensial langsung dilempar tanpa
 * retry: pooler Supabase memblokir semua koneksi baru untuk beberapa menit
 * setelah beberapa kali gagal autentikasi ("ECIRCUITBREAKER"), jadi retry cepat
 * dengan password salah justru ikut memblokir password yang sudah benar.
 */
export async function waitForDatabase(retries = 30, delayMs = 2000): Promise<void> {
  let delay = delayMs;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      log.info('Terhubung ke postgres');
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code && AUTH_ERROR_CODES.has(code)) {
        log.error('Kredensial DATABASE_URL ditolak postgres — periksa password di .env');
        throw err;
      }
      if (attempt === retries) throw err;

      // Sertakan errornya: tanpa ini penyebab (password salah, DNS, TLS) tidak
      // kelihatan sama sekali di log dan cuma tampak sebagai retry berulang.
      log.warn(
        `Postgres belum siap (percobaan ${attempt}/${retries}), retry dalam ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
    }
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
