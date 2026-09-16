import { config } from '../config.js';
import { downloadImage } from '../util/download.js';
import { createLogger } from '../util/logger.js';
import {
  isScannableImage,
  ocrBuffer,
  type OcrAttachment,
} from './ocrScanner.js';
import { decodeQrCodes, type QrCode } from './qrScanner.js';

const log = createLogger('image-scanner');

export interface ImageScanResult {
  url: string;
  /** Teks hasil OCR; string kosong kalau tidak ada teks terbaca. */
  ocrText: string;
  confidence: number;
  qrCodes: QrCode[];
  /** Gambar yang sudah diunduh, dipakai ulang untuk review AI tanpa unduh lagi. */
  buffer: Buffer;
  contentType: string | null;
}

/**
 * Unduh satu gambar sekali, lalu jalankan OCR dan pemindaian QR di atasnya.
 *
 * QR sengaja dipindai terpisah dari OCR: gambar scam sering hanya berisi QR
 * tanpa teks sama sekali, jadi hasil OCR yang kosong tidak boleh membatalkan
 * pemeriksaan QR-nya.
 */
export async function scanImage(att: OcrAttachment): Promise<ImageScanResult | null> {
  const buffer = await downloadImage(att.url, config.ocr.maxImageBytes);
  if (!buffer) return null;

  const [ocr, qrCodes] = await Promise.all([
    ocrBuffer(buffer),
    config.ocr.scanQr ? decodeQrCodes(buffer) : Promise.resolve([]),
  ]);

  if (!ocr && qrCodes.length === 0) return null;

  return {
    url: att.url,
    ocrText: ocr?.text ?? '',
    confidence: ocr?.confidence ?? 0,
    qrCodes,
    buffer,
    contentType: att.contentType,
  };
}

/** Pindai beberapa attachment sekaligus (dibatasi OCR_MAX_IMAGES_PER_MESSAGE). */
export async function scanImageAttachments(
  attachments: OcrAttachment[],
): Promise<ImageScanResult[]> {
  const scannable = attachments.filter(isScannableImage).slice(0, config.ocr.maxImagesPerMessage);
  if (scannable.length === 0) return [];

  const results: ImageScanResult[] = [];
  for (const att of scannable) {
    const result = await scanImage(att);
    if (result) results.push(result);
  }

  if (results.length > 0) {
    const qrTotal = results.reduce((n, r) => n + r.qrCodes.length, 0);
    log.debug(`${results.length} gambar dipindai, ${qrTotal} QR code ditemukan`);
  }
  return results;
}

/** Gabungan teks OCR + isi QR — inilah yang dinilai heuristik dan disimpan ke log. */
export function combinedText(result: ImageScanResult): string {
  const parts = [result.ocrText];
  for (const qr of result.qrCodes) {
    parts.push(`[QR] ${qr.text}`);
  }
  return parts.filter(Boolean).join('\n');
}
