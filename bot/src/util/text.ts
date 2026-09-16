/**
 * Helper normalisasi teks: dipakai oleh urlScanner (ekstraksi domain) dan
 * ocrScanner / blacklistCheck (matching nomor rekening & username).
 */

/** Ekstensi file yang sering ke-parse sebagai TLD (`index.js`, `foto.png`, ...). */
const NOT_A_TLD = new Set([
  'js', 'ts', 'jsx', 'tsx', 'json', 'md', 'txt', 'py', 'rb', 'go', 'rs', 'sh',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'mp3', 'pdf', 'zip', 'rar',
  'exe', 'dll', 'css', 'html', 'htm', 'yml', 'yaml', 'toml', 'lock', 'env',
]);

/**
 * TLD yang boleh dipakai bentuk samaran "longgar" — titik diberi spasi, diganti
 * koma, atau ditulis `dot`/`titik` tanpa kurung. Sengaja hanya TLD yang bukan
 * kata/singkatan chat sehari-hari: `net` (internet), `tk` (taman kanak-kanak),
 * `gg`, `me`, `id`, dll. akan mengubah obrolan biasa jadi "link disamarkan".
 */
const LOOSE_TLDS = ['com', 'org', 'xyz', 'io', 'ru', 'biz', 'cn', 'sbs', 'cfd', 'cyou'];

/** gTLD yang lazim dipakai link scam, selain ccTLD dua huruf. */
const KNOWN_GTLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'xyz', 'top', 'site', 'online', 'store', 'shop',
  'club', 'live', 'app', 'dev', 'pro', 'vip', 'win', 'bet', 'casino', 'games', 'lol',
  'fun', 'icu', 'sbs', 'cfd', 'cyou', 'bond', 'click', 'link', 'space', 'website',
  'tech', 'cloud', 'one', 'best', 'life', 'world', 'today', 'news', 'blog', 'asia',
  'gift', 'gifts', 'money', 'finance', 'exchange', 'digital', 'network', 'center',
]);

/** Karakter tak terlihat yang disisipkan supaya domain tidak cocok dengan filter. */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g;

/** Titik "palsu" yang tidak dinormalisasi NFKC. */
const DOT_LOOKALIKE_RE = /[\u3002\u00B7\u2219\u22C5\u30FB]/g;

/** Huruf Kiril/Yunani yang bentuknya identik dengan huruf Latin. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't',
  у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', һ: 'h', ӏ: 'l',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T',
  Х: 'X', Ү: 'Y', І: 'I', Ј: 'J', Ѕ: 'S',
  α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O',
  Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`, 'g');

interface Deobfuscated {
  text: string;
  /** Nama trik yang terdeteksi, untuk ditampilkan di mod-log. */
  tricks: string[];
}

/**
 * Un-obfuscate trik penyebar link scam supaya tetap kebaca sebagai URL:
 * `hxxp://`, `example[.]com`, `example (dot) com`, `example , com`, huruf
 * fullwidth / Kiril yang mirip Latin, titik Unicode, karakter tak terlihat,
 * dan TLD berangka (`.c0m`).
 */
export function deobfuscate(input: string): string {
  return deobfuscateWithTricks(input).text;
}

function deobfuscateWithTricks(input: string): Deobfuscated {
  const tricks: string[] = [];
  let text = input;
  const step = (name: string, fn: (t: string) => string) => {
    const next = fn(text);
    if (next !== text) {
      tricks.push(name);
      text = next;
    }
  };
  const loose = LOOSE_TLDS.join('|');

  step('karakter tak terlihat', (t) => t.replace(INVISIBLE_RE, ''));
  // NFKC: huruf fullwidth (ｓｏａｋ) dan titik varian (．․﹒) jadi ASCII biasa.
  step('karakter Unicode mirip huruf/titik', (t) =>
    t.normalize('NFKC').replace(DOT_LOOKALIKE_RE, '.'),
  );
  // Homoglyph hanya diganti di token campuran Latin + non-Latin, supaya kalimat
  // berbahasa Rusia/Yunani utuh tidak ikut berubah.
  step('huruf Kiril/Yunani mirip Latin', (t) =>
    t.replace(/[\p{L}\p{N}.-]+/gu, (token) =>
      /[a-z]/i.test(token) ? token.replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c] ?? c) : token,
    ),
  );
  step('hxxp', (t) => t.replace(/\bhxxp(s?)(?::\/\/|\[:\/\/\])/gi, 'http$1://'));
  step('titik dalam kurung', (t) =>
    t
      .replace(/\s*[[({<]\s*(?:\.|dot|titik)\s*[\])}>]\s*/gi, '.')
      .replace(/\s*[[({<]\s*(?::\/\/)\s*[\])}>]\s*/g, '://'),
  );
  step('titik ditulis dot/titik', (t) =>
    t.replace(new RegExp(`([a-z0-9])\\s+(?:dot|titik)\\s+(${loose})\\b`, 'gi'), '$1.$2'),
  );
  step('titik diberi spasi / diganti koma', (t) =>
    t.replace(new RegExp(`([a-z0-9])(?:\\s+\\.\\s*|\\.\\s+|\\s*,\\s*)(${loose})\\b`, 'gi'), '$1.$2'),
  );
  step('TLD berangka', (t) =>
    t.replace(/\.(c0m|n3t|0rg)\b/gi, (m) => m.replace(/0/g, 'o').replace(/3/g, 'e')),
  );

  return { text, tricks };
}

const URL_RE =
  /\b(?:(https?):\/\/)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,24}))(?::\d{2,5})?(\/[^\s<>"'`]*)?/gi;

export interface ExtractedUrl {
  /** URL utuh sebagaimana muncul (sudah di-deobfuscate). */
  raw: string;
  /** Hostname lowercase tanpa `www.`. */
  domain: string;
  /** Registrable domain kira-kira (eTLD+1) — untuk pencocokan blacklist. */
  rootDomain: string;
  /** URL absolut yang valid untuk dikirim ke Safe Browsing. */
  url: string;
  /**
   * Trik penyamaran yang dipakai kalau link ini baru kebaca setelah
   * di-deobfuscate; null kalau link ditulis apa adanya.
   */
  obfuscation: string | null;
}

/** Ambil semua URL / bare-domain dari sepotong teks. Hasilnya sudah unik. */
export function extractUrls(rawInput: string): ExtractedUrl[] {
  const { text: input, tricks } = deobfuscateWithTricks(rawInput);

  // Domain yang sudah kebaca tanpa deobfuscate dianggap ditulis apa adanya.
  // Link `hxxp://` dibuang dulu karena host-nya sendiri tetap polos.
  const plainDomains = new Set(
    matchUrls(rawInput.replace(/\bhxxps?\S*/gi, ' ')).map((m) => m.domain),
  );

  const seen = new Set<string>();
  const out: ExtractedUrl[] = [];

  for (const m of matchUrls(input)) {
    const hxxp = new RegExp(`hxxps?\\S*?${escapeRegex(m.domain)}`, 'i').test(rawInput);
    const obfuscated = hxxp || !plainDomains.has(m.domain);
    // Hasil deobfuscate yang TLD-nya tidak dikenal hampir pasti potongan kalimat.
    if (obfuscated && !isKnownTld(m.tld)) continue;

    const key = m.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      raw: m.full,
      domain: m.domain,
      rootDomain: rootDomainOf(m.domain),
      url: m.url,
      obfuscation: obfuscated ? (tricks.join(', ') || 'hxxp') : null,
    });
  }

  return out;
}

interface UrlMatch {
  full: string;
  domain: string;
  tld: string;
  url: string;
}

function matchUrls(input: string): UrlMatch[] {
  const out: UrlMatch[] = [];
  for (const match of input.matchAll(URL_RE)) {
    const [full, scheme, host, tld] = match;
    if (!host || !tld) continue;
    if (!scheme && NOT_A_TLD.has(tld.toLowerCase())) continue;
    // Buang IP-versi-desimal palsu seperti "1.2" atau versi paket "3.11.4".
    if (/^\d+(\.\d+)*$/.test(host)) continue;

    const domain = normalizeDomain(host);
    if (!domain) continue;

    out.push({ full, domain, tld: tld.toLowerCase(), url: scheme ? full : `http://${full}` });
  }
  return out;
}

function isKnownTld(tld: string): boolean {
  return tld.length === 2 || KNOWN_GTLDS.has(tld);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Versi domain dengan angka samaran dikembalikan ke huruf (`s0akw1n.com` ->
 * `soakwin.com`), untuk dicocokkan ke blacklist. `1` bisa berarti `i` atau `l`,
 * jadi keduanya dicoba. Domain aslinya tidak ikut dikembalikan.
 */
export function deleetDomainVariants(domain: string): string[] {
  if (!/[0-9]/.test(domain)) return [];
  const base = domain
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
  const variants = new Set([base.replace(/1/g, 'i'), base.replace(/1/g, 'l')]);
  variants.delete(domain);
  return [...variants];
}

/** `WWW.Example.COM.` -> `example.com` */
export function normalizeDomain(host: string): string {
  let d = host.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.split('/')[0] ?? '';
  d = d.split('@').pop() ?? '';
  d = d.split(':')[0] ?? '';
  d = d.replace(/\.+$/, '');
  d = d.replace(/^www\./, '');
  return d;
}

/**
 * eTLD+1 sederhana tanpa dependency public-suffix-list. Cukup untuk kasus
 * pemakaian di sini: cek blacklist/whitelist per registrable domain.
 */
const MULTI_PART_TLDS = new Set([
  'co.id', 'or.id', 'ac.id', 'go.id', 'sch.id', 'web.id', 'my.id', 'biz.id',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'com.br', 'com.mx', 'com.sg', 'com.my', 'com.ph', 'co.th', 'co.jp', 'co.kr',
]);

export function rootDomainOf(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

/** Semua sufiks domain dari paling spesifik ke paling umum: sub.a.com -> [sub.a.com, a.com] */
export function domainVariants(domain: string): string[] {
  const parts = domain.split('.');
  const root = rootDomainOf(domain);
  const rootPartCount = root.split('.').length;
  const variants: string[] = [];
  for (let i = 0; i <= parts.length - rootPartCount; i++) {
    variants.push(parts.slice(i).join('.'));
  }
  return [...new Set(variants)];
}

/**
 * Normalisasi identifier akun untuk matching. Nomor rekening ditulis dengan
 * macam-macam pemisah (`1234-5678-90`, `1234 5678 90`), dan OCR sering
 * menyisipkan spasi, jadi semuanya dilucuti.
 */
export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  const letters = trimmed.replace(/[^a-z]/g, '');

  // Kalau isinya didominasi angka (rekening / e-wallet) -> pakai digit saja.
  if (digitsOnly.length >= 6 && letters.length <= 2) return digitsOnly;

  // Username: buang @ dan pemisah, sisakan alfanumerik + underscore.
  return trimmed.replace(/^@/, '').replace(/[^a-z0-9_.]/g, '');
}

/** Bentuk teks OCR jadi satu baris rapat untuk pencarian substring numerik. */
export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
