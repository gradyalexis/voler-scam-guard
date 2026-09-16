/**
 * Deteksi gambar scam berbasis pola, bukan berbasis data.
 *
 * Blacklist butuh identifier yang sudah dikumpulkan lebih dulu; scam bergaya
 * "MrBeast giveaway", "free Discord Nitro", atau doubling crypto justru punya
 * pola tulisan yang seragam. Modul ini memberi skor teks (biasanya hasil OCR)
 * terhadap sekumpulan aturan berbobot, dan menandai scam kalau skornya melewati
 * ambang DAN kena minimal dua kategori berbeda — supaya satu kata umum seperti
 * "giveaway" tidak cukup untuk memicu deteksi.
 *
 * Aturannya sengaja ditulis di kode, bukan di database, supaya tidak ada data
 * yang perlu diisi admin sebelum bot berguna.
 */

export interface RuleHit {
  id: string;
  label: string;
  weight: number;
  /** Potongan teks yang memicu aturan ini. */
  sample: string;
}

export interface HeuristicResult {
  score: number;
  threshold: number;
  isScam: boolean;
  severity: 'medium' | 'high';
  hits: RuleHit[];
  /** Ringkasan siap tempel ke embed mod-log. */
  summary: string;
}

type Target = 'norm' | 'raw';

interface Rule {
  id: string;
  label: string;
  weight: number;
  target: Target;
  patterns: RegExp[];
}

/** Ubah string frasa jadi regex yang toleran terhadap variasi spasi OCR. */
function phrase(text: string): RegExp {
  const escaped = text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function phrases(...list: string[]): RegExp[] {
  return list.map(phrase);
}

const RULES: Rule[] = [
  {
    id: 'giveaway_bait',
    label: 'Umpan giveaway / hadiah gratis',
    weight: 4,
    target: 'norm',
    patterns: [
      ...phrases(
        'giveaway', 'give away', 'giveway', 'free giveaway', 'airdrop', 'air drop',
        'claim your', 'claim now', 'claim reward', 'claim your prize', 'you won',
        'you have won', 'you have been selected', 'congratulations you', 'lucky winner',
        'giving away', 'i am giving', 'to everyone who', 'claim your reward', 'receive your',
        'free nitro', 'discord nitro free', 'free robux', 'free vbucks', 'free v bucks',
        'free skin', 'free gift', 'gift card', 'steam gift', 'free steam',
        'klaim hadiah', 'klaim sekarang', 'hadiah gratis', 'menangkan', 'pemenang',
        'selamat anda', 'anda terpilih', 'nitro gratis', 'saldo gratis', 'bagi bagi',
      ),
      /\bfree\s+\$?\d/i,
      /\bgratis\s+(rp|\d)/i,
    ],
  },
  {
    id: 'celebrity_brand',
    label: 'Menyebut brand / selebriti yang sering dipalsukan',
    weight: 2,
    target: 'norm',
    patterns: phrases(
      'mrbeast', 'mr beast', 'elon musk', 'elonmusk', 'tesla', 'spacex',
      'pewdiepie', 'kai cenat', 'ishowspeed', 'binance', 'coinbase', 'metamask',
      'steam', 'valve', 'epic games', 'riot games', 'garena', 'mobile legends',
      'free fire', 'roblox', 'minecraft', 'discord nitro', 'nitro', 'netflix',
      'spotify', 'paypal', 'shopee', 'tokopedia', 'dana kaget', 'gopay', 'ovo',
    ),
  },
  {
    id: 'crypto',
    label: 'Skema crypto / doubling',
    weight: 4,
    target: 'norm',
    patterns: [
      ...phrases(
        'double your', 'doubling', '2x your', 'multiply your', 'send bitcoin',
        'send eth', 'connect your wallet', 'connect wallet', 'seed phrase',
        'private key', 'recovery phrase', 'usdt', 'bnb chain', 'trust wallet',
      ),
      /\b(bitcoin|btc|ethereum|eth|dogecoin|doge)\b/i,
    ],
  },
  {
    // Pola "casino crypto milik selebriti": bonus besar yang katanya bisa
    // langsung ditarik asal daftar pakai kode promo — korban diminta deposit
    // dulu saat mau withdraw.
    id: 'casino_bonus',
    label: 'Bonus casino / kode promo',
    weight: 4,
    target: 'norm',
    patterns: phrases(
      'promo code', 'promocode', 'bonus code', 'referral code', 'use code', 'enter code',
      'withdraw the bonus', 'withdraw your', 'play or withdraw', 'casino', 'cryptocurrency',
      'crypto project', 'deposit bonus', 'welcome bonus', 'no deposit',
      'kode promo', 'kode bonus', 'kode referral', 'bonus deposit', 'bisa langsung ditarik',
      'bisa di wd', 'langsung wd', 'slot gacor',
    ),
  },
  {
    id: 'credential',
    // Sinyal terkuat: tidak ada konteks sah yang meminta OTP/PIN/CVV di chat.
    label: 'Minta kredensial / data sensitif',
    weight: 5,
    target: 'norm',
    patterns: phrases(
      'verify your account', 'verify your identity', 'login with your',
      'sign in with your', 'enter your password', 'confirm your password',
      'masukkan password', 'masukkan pin', 'kode otp', 'kode verifikasi',
      'jangan beri tahu siapapun', 'pin atm', 'cvv', 'm banking', 'mbanking',
      'verifikasi akun', 'data rekening',
    ),
  },
  {
    id: 'action_link',
    label: 'Ajakan mengklik / memindai',
    weight: 3,
    target: 'norm',
    patterns: phrases(
      'click the link', 'click here', 'click below', 'tap the link', 'link in bio',
      'scan the qr', 'scan qr', 'scan this code', 'scan barcode', 'visit the site', 'go to',
      'scan kode', 'pindai kode', 'scan qris',
      'klik link', 'klik di sini', 'klik tautan', 'kunjungi', 'daftar sekarang',
      'join now', 'buruan daftar', 'langsung ke',
    ),
  },
  {
    id: 'urgency',
    label: 'Tekanan waktu',
    weight: 2,
    target: 'norm',
    patterns: [
      ...phrases(
        'limited time', 'limited offer', 'hurry', 'last chance', 'only today',
        'expires soon', 'ends today', 'act now', 'first 100', 'first 1000',
        'buruan', 'terbatas', 'segera', 'sebelum kehabisan', 'hanya hari ini',
        'kuota terbatas', 'will be deleted', 'be deleted', 'only the fastest', 'first come',
        'don t miss', 'dont miss', 'before it s gone', 'akan dihapus', 'siapa cepat',
      ),
      /\bexpires?\s+in\s+\d/i,
      /\bdalam\s+\d+\s*(jam|menit|hari)\b/i,
    ],
  },
  {
    id: 'money',
    label: 'Menyebut nominal uang besar',
    weight: 2,
    target: 'raw',
    patterns: [
      /\$\s?\d{1,3}(?:[.,]\d{3})+/,
      /\$\s?\d{3,}/,
      /\brp\.?\s?\d{1,3}(?:[.,]\d{3})+/i,
      /\b\d+\s?(juta|jt|million|billion|miliar)\b/i,
    ],
  },
  {
    id: 'wallet_address',
    label: 'Alamat wallet crypto',
    weight: 5,
    target: 'raw',
    patterns: [
      /\b0x[a-f0-9]{40}\b/i,
      /\bbc1[a-z0-9]{25,62}\b/i,
      /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/,
    ],
  },
];

/**
 * Ganti angka/simbol yang biasa dipakai untuk menyamarkan kata ("FR33 N1TR0"),
 * lalu ratakan semua pemisah jadi satu spasi. Hasilnya dipakai untuk pencocokan
 * kata kunci; aturan nominal uang dan alamat wallet tetap membaca teks asli.
 */
export function normalizeForHeuristics(text: string): string {
  return text
    .toLowerCase()
    // `@` di awal handle (`@mrbeast`) adalah pemisah, bukan huruf samaran.
    .replace(/(^|[^a-z0-9])@/g, '$1 ')
    .replace(/[@4]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1|!]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface HeuristicContext {
  /** Jumlah URL yang ditemukan di teks dan tidak ada di whitelist. */
  suspiciousUrlCount?: number;
  /** Jumlah QR code yang terbaca di gambar. */
  qrCount?: number;
  /** Ambang skor; makin kecil makin sensitif (dan makin banyak salah deteksi). */
  threshold?: number;
}

export const DEFAULT_THRESHOLD = 8;

export function analyzeScamText(text: string, ctx: HeuristicContext = {}): HeuristicResult {
  const threshold = ctx.threshold ?? DEFAULT_THRESHOLD;
  const raw = text.slice(0, 8000);
  const norm = normalizeForHeuristics(raw);

  const hits: RuleHit[] = [];

  for (const rule of RULES) {
    const haystack = rule.target === 'norm' ? norm : raw;
    for (const pattern of rule.patterns) {
      const match = pattern.exec(haystack);
      if (match) {
        // Satu kategori dihitung sekali saja, supaya teks yang mengulang kata
        // kunci yang sama tidak menggelembungkan skor.
        hits.push({ id: rule.id, label: rule.label, weight: rule.weight, sample: match[0].trim() });
        break;
      }
    }
  }

  // Link yang mencurigakan bukan bukti sendiri, tapi memperkuat pola di atas:
  // gambar giveaway palsu hampir selalu mencantumkan domain tujuan.
  const urlCount = ctx.suspiciousUrlCount ?? 0;
  if (urlCount > 0 && hits.length > 0) {
    hits.push({
      id: 'url_present',
      label: 'Mencantumkan link di dalam gambar',
      weight: 3,
      sample: `${urlCount} link`,
    });
  }

  // QR code di poster giveaway adalah pola khas: korban diarahkan memindai
  // alih-alih mengklik, supaya link-nya tidak kelihatan. Sama seperti link,
  // ini penguat — bukan bukti berdiri sendiri, karena QR juga dipakai untuk
  // hal yang sah (pembayaran toko, tiket, undangan).
  const qrCount = ctx.qrCount ?? 0;
  if (qrCount > 0 && hits.length > 0) {
    hits.push({
      id: 'qr_code',
      label: 'Mengandung QR code',
      weight: 3,
      sample: `${qrCount} QR`,
    });
  }

  const score = hits.reduce((sum, hit) => sum + hit.weight, 0);
  // Minimal dua kategori berbeda: satu kata kunci saja terlalu rawan salah tebak.
  const isScam = score >= threshold && hits.length >= 2;
  const severity: 'medium' | 'high' = score >= threshold * 1.6 ? 'high' : 'medium';

  const summary = hits
    .map((h) => `${h.label} (+${h.weight}: "${h.sample}")`)
    .join('; ');

  return { score, threshold, isScam, severity, hits, summary };
}
