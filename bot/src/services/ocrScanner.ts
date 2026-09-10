import { createWorker, type Worker } from 'tesseract.js';
import { config } from '../config.js';
import { createLogger } from '../util/logger.js';
import { truncate } from '../util/text.js';

const log = createLogger('ocr');

/** Skor kepercayaan minimum sebelum teks dianggap layak dicocokkan. */
const MIN_CONFIDENCE = 45;
/** Potong teks OCR sebelum disimpan ke log biar row DB tidak membengkak. */
const MAX_STORED_TEXT = 4000;

const IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/gif',
]);

let workerPromise: Promise<Worker> | null = null;
/** Tesseract worker tidak reentrant, jadi semua job diantre satu-satu. */
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    log.info(`Menyiapkan Tesseract worker (langs=${config.ocr.langs})`);
    const worker = await createWorker(config.ocr.langs, undefined, {
      cachePath: process.env.TESSDATA_PATH ?? './tessdata',
      logger: () => {},
      errorHandler: (err: unknown) => log.error('Tesseract error', err),
    });
    log.info('Tesseract worker siap');
    return worker;
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/** Warm-up dipanggil saat startup supaya pesan pertama tidak menunggu download traineddata. */
export async function initOcr(): Promise<void> {
  try {
    await getWorker();
  } catch (err) {
    log.error('Gagal inisialisasi OCR — scan gambar akan dilewati', err);
  }
}

export async function shutdownOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    /* sudah mati / gagal init */
  } finally {
    workerPromise = null;
  }
}

export interface OcrAttachment {
  url: string;
  contentType: string | null;
  size: number | null;
  name: string | null;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export function isScannableImage(att: OcrAttachment): boolean {
  const type = att.contentType?.split(';')[0]?.trim().toLowerCase();
  if (type && IMAGE_CONTENT_TYPES.has(type)) {
    return (att.size ?? 0) <= config.ocr.maxImageBytes;
  }
  // Fallback ke ekstensi kalau Discord tidak mengirim content-type.
  if (!type && att.name && /\.(png|jpe?g|webp|bmp|gif)$/i.test(att.name)) {
    return (att.size ?? 0) <= config.ocr.maxImageBytes;
  }
  return false;
}

/** Jalankan job OCR lewat antrean supaya worker tidak dipakai paralel. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

/** OCR satu gambar yang sudah diunduh. Null kalau gagal atau tidak ada teks berarti. */
export async function ocrBuffer(buffer: Buffer): Promise<OcrResult | null> {
  try {
    const worker = await getWorker();
    const { data } = await enqueue(() => worker.recognize(buffer));
    const text = data.text.replace(/\s+\n/g, '\n').trim();
    if (!text) return null;
    if (data.confidence < MIN_CONFIDENCE && text.length < 12) return null;

    log.debug(`OCR selesai (confidence=${Math.round(data.confidence)}): ${truncate(text, 120)}`);
    return { text: truncate(text, MAX_STORED_TEXT), confidence: data.confidence };
  } catch (err) {
    log.warn('OCR gagal', err);
    return null;
  }
}
