import { Jimp } from 'jimp';
import jsQRModule, { type Options as JsQrOptions, type QRCode } from 'jsqr';
import { createLogger } from '../util/logger.js';

type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: JsQrOptions,
) => QRCode | null;

// jsqr dipaket sebagai CommonJS: `module.exports` adalah fungsinya sendiri, tapi
// deklarasi tipenya memakai `export default` sehingga TS melihatnya sebagai
// namespace. Ambil `.default` kalau ada, kalau tidak pakai nilai importnya.
const jsQR = ((jsQRModule as { default?: JsQrFn }).default ?? jsQRModule) as JsQrFn;

const log = createLogger('qr');

/** QR di gambar beresolusi sangat tinggi diperkecil dulu supaya decode cepat. */
const MAX_DIMENSION = 1400;
/** Gambar kecil kadang perlu diperbesar agar modul QR-nya terbaca. */
const MIN_DIMENSION = 320;
/** Batas jumlah QR per gambar; lebih dari ini hampir pasti bukan konten asli. */
const MAX_CODES = 3;

export type QrKind = 'url' | 'crypto' | 'payment' | 'text';

export interface QrCode {
  /** Isi mentah QR. */
  text: string;
  kind: QrKind;
  /** Nama merchant untuk QR pembayaran QRIS, kalau bisa dibaca. */
  merchant: string | null;
}

/**
 * Decode QR code di dalam gambar.
 *
 * jsQR hanya mengembalikan satu kode per pemanggilan, jadi area kode yang sudah
 * ketemu ditimpa putih lalu gambar dipindai ulang untuk menangkap kode kedua.
 */
export async function decodeQrCodes(buffer: Buffer): Promise<QrCode[]> {
  let image;
  try {
    image = await Jimp.read(buffer);
  } catch (err) {
    log.debug('Gambar tidak bisa dibaca untuk pemindaian QR', err);
    return [];
  }

  try {
    const largest = Math.max(image.width, image.height);
    if (largest > MAX_DIMENSION) {
      image.resize({ w: Math.round(image.width * (MAX_DIMENSION / largest)) });
    } else if (largest < MIN_DIMENSION) {
      image.resize({ w: image.width * 2 });
    }

    const { width, height } = image;
    const pixels = new Uint8ClampedArray(image.bitmap.data);

    const found: QrCode[] = [];
    for (let i = 0; i < MAX_CODES; i++) {
      // 'attemptBoth' menangani QR yang warnanya terbalik (putih di atas hitam).
      const result = jsQR(pixels, width, height, { inversionAttempts: 'attemptBoth' });
      if (!result?.data) break;

      const text = result.data.trim();
      if (text && !found.some((c) => c.text === text)) {
        found.push(classify(text));
      }

      maskRegion(pixels, width, height, result.location);
    }

    if (found.length > 0) {
      log.debug(`${found.length} QR code terdeteksi`);
    }
    return found;
  } catch (err) {
    log.warn('Pemindaian QR gagal', err);
    return [];
  }
}

interface Point {
  x: number;
  y: number;
}

/** Timpa area QR yang sudah terbaca dengan putih agar tidak terdeteksi lagi. */
function maskRegion(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  location: Record<string, Point>,
): void {
  const points = Object.values(location).filter(
    (p): p is Point => typeof p?.x === 'number' && typeof p?.y === 'number',
  );
  if (points.length === 0) return;

  const pad = 4;
  const minX = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x)) - pad));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...points.map((p) => p.x)) + pad));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)) - pad));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((p) => p.y)) + pad));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = 255;
    }
  }
}

function classify(text: string): QrCode {
  if (/^(https?:\/\/|www\.)/i.test(text)) return { text, kind: 'url', merchant: null };
  if (/^(bitcoin|ethereum|litecoin|tron|ton|solana):/i.test(text)) {
    return { text, kind: 'crypto', merchant: null };
  }
  if (isEmvco(text)) {
    return { text, kind: 'payment', merchant: parseEmvcoMerchant(text) };
  }
  return { text, kind: 'text', merchant: null };
}

/** Payload QRIS/EMVCo selalu diawali tag "00" versi "01". */
function isEmvco(text: string): boolean {
  return /^000201/.test(text) && text.length > 40;
}

/**
 * Ambil nama merchant (tag 59) dari payload EMVCo. QR pembayaran yang diselipkan
 * ke gambar "giveaway" adalah pola penipuan yang lazim di sini, dan nama merchant
 * membantu moderator menilai cepat.
 */
export function parseEmvcoMerchant(payload: string): string | null {
  let cursor = 0;
  while (cursor + 4 <= payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    const rawLength = payload.slice(cursor + 2, cursor + 4);
    // Payload cacat bikin penelusuran TLV meleset; berhenti daripada
    // mengembalikan potongan teks yang salah.
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(rawLength)) return null;

    const length = Number.parseInt(rawLength, 10);
    if (cursor + 4 + length > payload.length) return null;

    if (tag === '59') return payload.slice(cursor + 4, cursor + 4 + length).trim() || null;

    cursor += 4 + length;
  }
  return null;
}

/** Ringkasan satu baris untuk embed mod-log. */
export function describeQr(code: QrCode): string {
  if (code.kind === 'payment') {
    return `QR pembayaran${code.merchant ? ` — merchant: ${code.merchant}` : ''}`;
  }
  if (code.kind === 'crypto') return `QR wallet crypto — ${code.text.slice(0, 80)}`;
  if (code.kind === 'url') return `QR link — ${code.text.slice(0, 80)}`;
  return `QR teks — ${code.text.slice(0, 80)}`;
}
