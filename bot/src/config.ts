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
  /** CA cert untuk verifikasi TLS database, relatif ke root project. Wajib untuk Supabase. */
  DATABASE_SSL_CA_FILE: z.string().optional(),
  /** Batas koneksi pool bot. Total bot + dashboard harus di bawah pool size Supabase. */
  BOT_DB_POOL_MAX: z.coerce.number().int().positive().default(5),

  GOOGLE_SAFE_BROWSING_API_KEY: z.string().optional(),

  // Review gambar AI. Penyedia yang key-nya kosong dilewati; semua kosong = fitur mati.
  // Urutan rotasi: model Gemini -> model Groq -> model OpenRouter.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('gemini-3.6-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODELS: z.string().default('qwen/qwen3.8-27b'),
  OPENROUTER_API_KEY: z.string().optional(),
  // `openrouter/free` memilih sendiri model gratis yang sedang kosong; model gratis
  // spesifik sering kena rate limit hulu karena kuotanya dipakai bersama.
  OPENROUTER_MODELS: z
    .string()
    .default('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,openrouter/free'),
  /** Batas lokal jumlah gambar yang dinilai AI, di atas semua penyedia. */
  AI_MAX_PER_MINUTE: z.coerce.number().int().positive().default(10),
  AI_MAX_PER_DAY: z.coerce.number().int().positive().default(300),

  /** Default mode dipakai saat guild belum punya baris di guild_settings. */
  DEFAULT_MODE: z
    .enum(['auto_delete', 'warn_delete', 'warn', 'flag_only', 'off'])
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

  /** Port endpoint health (GET /health). 0 = matikan servernya. */
  HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(9000),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.string().default('production'),

  /**
   * Pemilik instance bot ini. Bot hanya mau tinggal di server tempat salah satu
   * ID ini owner / Administrator / Manage Server; server lain ditinggalkan.
   */
  BOT_OWNER_IDS: z
    .string({ required_error: 'BOT_OWNER_IDS wajib diisi' })
    .refine((v) => v.split(',').some((id) => /^\d{15,25}$/.test(id.trim())), {
      message: 'BOT_OWNER_IDS wajib berisi minimal satu Discord user ID',
    }),
});

export const AI_PROVIDERS = ['gemini', 'groq', 'openrouter'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export interface AiTarget {
  provider: AiProvider;
  model: string;
}

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
    sslCaFile: env.DATABASE_SSL_CA_FILE,
    poolMax: env.BOT_DB_POOL_MAX,
  },
  safeBrowsing: {
    apiKey: env.GOOGLE_SAFE_BROWSING_API_KEY?.trim() || null,
    get enabled() {
      return Boolean(this.apiKey);
    },
  },
  ai: {
    providers: {
      gemini: {
        apiKey: env.GEMINI_API_KEY?.trim() || null,
        models: [env.GEMINI_MODEL.trim(), ...csv(env.GEMINI_FALLBACK_MODELS)],
      },
      groq: { apiKey: env.GROQ_API_KEY?.trim() || null, models: csv(env.GROQ_MODELS) },
      openrouter: {
        apiKey: env.OPENROUTER_API_KEY?.trim() || null,
        models: csv(env.OPENROUTER_MODELS),
      },
    },
    maxPerMinute: env.AI_MAX_PER_MINUTE,
    maxPerDay: env.AI_MAX_PER_DAY,
    /** Semua pasangan penyedia+model yang bisa dipakai, sesuai urutan rotasi. */
    get targets(): AiTarget[] {
      return AI_PROVIDERS.flatMap((provider) => {
        const { apiKey, models } = this.providers[provider];
        return apiKey ? [...new Set(models)].map((model) => ({ provider, model })) : [];
      });
    },
    get enabled() {
      return this.targets.length > 0;
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
  health: {
    port: env.HEALTH_PORT,
  },
  logLevel: env.LOG_LEVEL,
  isProduction: env.NODE_ENV === 'production',
} as const;

export type BotMode = z.infer<typeof envSchema>['DEFAULT_MODE'];
