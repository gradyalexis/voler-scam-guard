// ---------------------------------------------------------------------------
// Opsi koneksi Postgres (connection string + SSL) untuk pg.Pool.
// File ini juga disalin ke repo voler-scam-guard-dashboard (lib/db/connection.ts).
// Kalau diubah, jalankan `npm run sync:schema` di repo dashboard.
// ---------------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';

const SSL_URL_PARAMS = ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'];

function isSupabaseHost(hostname: string): boolean {
  return /(^|\.)supabase\.(co|com)$/i.test(hostname);
}

/**
 * Susun `connectionString` + `ssl` untuk pg.Pool.
 *
 * - Dengan `caFile`: koneksi wajib TLS dan sertifikat server diverifikasi ke CA
 *   itu. Parameter SSL di URL dibuang karena pg menimpa opsi `ssl` dengan hasil
 *   parsing connection string — tanpa ini CA-nya diam-diam tidak dipakai.
 * - Tanpa `caFile`: URL dipakai apa adanya (Postgres lokal di docker network).
 *   Host Supabase ditolak supaya tidak pernah konek tanpa TLS terverifikasi.
 */
export function poolConnectionOptions(
  databaseUrl: string,
  caFile: string | undefined,
): Pick<PoolConfig, 'connectionString' | 'ssl'> {
  const url = new URL(databaseUrl);
  const ca = caFile?.trim();

  if (!ca) {
    if (isSupabaseHost(url.hostname)) {
      throw new Error(
        'DATABASE_SSL_CA_FILE wajib diisi untuk database Supabase (lihat "Setup Supabase" di README).',
      );
    }
    return { connectionString: databaseUrl };
  }

  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);

  return {
    connectionString: url.toString(),
    ssl: { ca: readFileSync(resolveCaFile(ca), 'utf8'), rejectUnauthorized: true },
  };
}

/**
 * Path relatif dihitung dari root project. Di container root = cwd (/app); saat
 * `npm run dev` dijalankan dari subfolder (mis. bot/), folder induk ikut dicoba.
 */
function resolveCaFile(file: string): string {
  const candidates = [resolve(file), resolve('..', file)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`File CA database tidak ditemukan: ${file} (dicari di ${candidates.join(', ')})`);
  }
  return found;
}
