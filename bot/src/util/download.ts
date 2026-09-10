import { createLogger } from './logger.js';

const log = createLogger('download');
const TIMEOUT_MS = 10_000;

/**
 * Unduh attachment sebagai Buffer. Dipakai bersama oleh OCR dan pemindai QR
 * supaya satu gambar hanya diunduh sekali.
 */
export async function downloadImage(url: string, maxBytes: number): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      log.warn(`Gagal download attachment (HTTP ${res.status})`);
      return null;
    }

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      log.debug('Attachment melebihi batas ukuran (content-length), dilewati');
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      log.debug('Attachment melebihi batas ukuran, dilewati');
      return null;
    }
    return buf;
  } catch (err) {
    log.warn('Gagal download attachment', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
