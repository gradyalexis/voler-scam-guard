import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Koneksi dibuat malas (lazy) supaya `next build` — yang meng-import modul ini
 * saat mengumpulkan route — tidak butuh DATABASE_URL. Pool baru dibuat ketika
 * query pertama benar-benar dijalankan.
 *
 * Instance disimpan di global karena dev server me-reload modul tiap perubahan;
 * tanpa ini koneksi ke postgres akan menumpuk.
 */
const globalForDb = globalThis as unknown as {
  __pgPool?: Pool;
  __drizzle?: NodePgDatabase<typeof schema>;
};

export function getPool(): Pool {
  if (globalForDb.__pgPool) return globalForDb.__pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL belum diset');

  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error('[db] idle client error', err));

  globalForDb.__pgPool = pool;
  return pool;
}

function getDb(): NodePgDatabase<typeof schema> {
  globalForDb.__drizzle ??= drizzle(getPool(), { schema });
  return globalForDb.__drizzle;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
