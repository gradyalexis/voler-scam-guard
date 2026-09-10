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
 * Un-obfuscate trik umum penyebar link scam supaya tetap kebaca sebagai URL:
 * `hxxp://`, `example[.]com`, `example (dot) com`.
 */
export function deobfuscate(input: string): string {
  return input
    .replace(/\bh(?:xx|tt)ps?(?::\/\/|:\/\/|\[:\/\/\])/gi, (m) =>
      m.toLowerCase().startsWith('hxx') ? 'http://' : m,
    )
    .replace(/\s*[[({<]\s*\.\s*[\])}>]\s*/g, '.')
    .replace(/\s*[[({<]?\s*(?:dot|titik)\s*[\])}>]?\s*/gi, '.')
    .replace(/\s*[[({<]\s*(?::\/\/)\s*[\])}>]\s*/g, '://');
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
}

/** Ambil semua URL / bare-domain dari sepotong teks. Hasilnya sudah unik. */
export function extractUrls(rawInput: string): ExtractedUrl[] {
  const input = deobfuscate(rawInput);
  const seen = new Set<string>();
  const out: ExtractedUrl[] = [];

  for (const match of input.matchAll(URL_RE)) {
    const [full, scheme, host, tld] = match;
    if (!host || !tld) continue;
    if (!scheme && NOT_A_TLD.has(tld.toLowerCase())) continue;
    // Buang IP-versi-desimal palsu seperti "1.2" atau versi paket "3.11.4".
    if (/^\d+(\.\d+)*$/.test(host)) continue;

    const domain = normalizeDomain(host);
    if (!domain) continue;

    const url = scheme ? full : `http://${full}`;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ raw: full, domain, rootDomain: rootDomainOf(domain), url });
  }

  return out;
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
