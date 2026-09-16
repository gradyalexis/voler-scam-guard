import { createLogger } from './logger.js';

const log = createLogger('download');
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

/**
 * Unduh attachment sebagai Buffer. Dipakai bersama oleh OCR dan pemindai QR
 * supaya satu gambar hanya diunduh sekali.
 *
 * Timeout / error jaringan dicoba ulang sekali: gangguan CDN sesaat tidak boleh
 * membuat gambar scam lolos tanpa dipindai.
 */
export async function downloadImage(url: string, maxBytes: number): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await tryDownload(url, maxBytes, attempt === MAX_ATTEMPTS);
    if (result !== 'retry') return result;
  }
  return null;
}

async function tryDownload(
  url: string,
  maxBytes: number,
  lastAttempt: boolean,
): Promise<Buffer | null | 'retry'> {
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
    if (!lastAttempt) {
      log.debug('Download attachment gagal, mencoba ulang', err);
      return 'retry';
    }
    log.warn('Gagal download attachment', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
