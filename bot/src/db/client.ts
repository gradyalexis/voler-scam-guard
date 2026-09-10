import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import { createLogger } from '../util/logger.js';
import * as schema from './schema.js';

const log = createLogger('db');

export const pool = new pg.Pool({
  connectionString: config.db.url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  log.error('Idle client error di pool postgres', err);
});

export const db = drizzle(pool, { schema });
export { schema };

/**
 * Tunggu sampai postgres siap. Container bot sering start lebih dulu dari
 * postgres walaupun ada depends_on, jadi retry di awal itu wajib.
 */
export async function waitForDatabase(retries = 30, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      log.info('Terhubung ke postgres');
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      log.warn(`Postgres belum siap (percobaan ${attempt}/${retries}), retry dalam ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
