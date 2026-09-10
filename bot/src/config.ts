import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const csv = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(20, 'DISCORD_TOKEN wajib diisi'),
  DISCORD_CLIENT_ID: z.string().min(5, 'DISCORD_CLIENT_ID wajib diisi'),

  DATABASE_URL: z.string().url('DATABASE_URL harus berupa connection string postgres'),

  GOOGLE_SAFE_BROWSING_API_KEY: z.string().optional(),

  /** Default mode dipakai saat guild belum punya baris di guild_settings. */
  DEFAULT_MODE: z
    .enum(['auto_delete', 'warn', 'flag_only', 'off'])
    .default('flag_only'),

  /** Batas ukuran attachment yang mau di-OCR (byte). Default 8 MB. */
  OCR_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  /** Bahasa Tesseract: 'eng' cukup untuk nomor rekening; 'eng+ind' lebih akurat utk teks ID. */
  OCR_LANGS: z.string().default('eng+ind'),
  /** Maksimum gambar yang di-OCR per pesan. */
  OCR_MAX_IMAGES_PER_MESSAGE: z.coerce.number().int().positive().default(3),
  /** Pindai QR code di dalam gambar (isi QR ikut dicek link & blacklist-nya). */
  SCAN_QR_CODES: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.string().default('production'),

  /** Owner bot — selalu boleh pakai command admin walau bukan admin guild. */
  BOT_OWNER_IDS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`[config] Environment tidak valid:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  discord: {
    token: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    ownerIds: csv(env.BOT_OWNER_IDS),
  },
  db: {
    url: env.DATABASE_URL,
  },
  safeBrowsing: {
    apiKey: env.GOOGLE_SAFE_BROWSING_API_KEY?.trim() || null,
    get enabled() {
      return Boolean(this.apiKey);
    },
  },
  defaults: {
    mode: env.DEFAULT_MODE,
  },
  ocr: {
    maxImageBytes: env.OCR_MAX_IMAGE_BYTES,
    langs: env.OCR_LANGS,
    maxImagesPerMessage: env.OCR_MAX_IMAGES_PER_MESSAGE,
    scanQr: env.SCAN_QR_CODES,
  },
  logLevel: env.LOG_LEVEL,
  isProduction: env.NODE_ENV === 'production',
} as const;

export type BotMode = z.infer<typeof envSchema>['DEFAULT_MODE'];
