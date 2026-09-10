import { createLogger } from '../util/logger.js';
import { findBlacklistedAccounts } from './blacklistCheck.js';
import { analyzeScamText, type HeuristicResult } from './heuristicScanner.js';
import { combinedText, scanImageAttachments } from './imageScanner.js';
import type { OcrAttachment } from './ocrScanner.js';
import { describeQr } from './qrScanner.js';
import { scanText, type UrlScanResult } from './urlScanner.js';
import type { EffectiveSettings } from './settings.js';

const log = createLogger('detector');

export type DetectionType = 'url' | 'image_ocr' | 'image_qr' | 'account';
export type DetectionSource = 'blacklist' | 'safe_browsing' | 'heuristic';
export type Severity = 'low' | 'medium' | 'high';

export interface Finding {
  detectionType: DetectionType;
  source: DetectionSource;
  /** Nilai yang match: domain, nomor rekening, username, atau ringkasan pola. */
  matchedValue: string;
  severity: Severity;
  /** Penjelasan singkat untuk embed mod-log. */
  detail: string | null;
  /** URL attachment tempat temuan berasal (khusus hasil OCR). */
  evidenceUrl: string | null;
}

export interface ScanInput {
  content: string;
  attachments: OcrAttachment[];
  settings: EffectiveSettings;
}

export interface ScanOutcome {
  findings: Finding[];
  /** Gabungan teks OCR dari semua gambar — disimpan ke log sebagai bukti. */
  ocrText: string | null;
  urlsFound: number;
}

/**
 * Pipeline deteksi satu pesan:
 *   1. URL di isi pesan  -> whitelist -> blacklist lokal -> Safe Browsing
 *   2. Identifier akun di isi pesan (rekening yang diketik langsung)
 *   3. OCR attachment    -> identifier akun + URL di dalam gambar + heuristik
 *                           pola scam (giveaway palsu, nitro gratis, dll)
 */
export async function scanMessage(input: ScanInput): Promise<ScanOutcome> {
  const { content, attachments, settings } = input;
  const findings: Finding[] = [];
  let urlsFound = 0;

  // 1 & 2 — isi pesan.
  if (content.trim()) {
    let urlScan: UrlScanResult | null = null;

    if (settings.scanUrls) {
      urlScan = await scanText(content, { useSafeBrowsing: settings.useSafeBrowsing });
      urlsFound += urlScan.found.length;
      for (const threat of urlScan.threats) {
        findings.push({
          detectionType: 'url',
          source: threat.source,
          matchedValue: threat.domain,
          severity: 'high',
          detail: threat.detail ?? (threat.source === 'safe_browsing' ? 'Safe Browsing match' : null),
          evidenceUrl: null,
        });
      }
    }

    for (const acc of await findBlacklistedAccounts(content)) {
      findings.push({
        detectionType: 'account',
        source: 'blacklist',
        matchedValue: acc.identifier,
        severity: 'high',
        detail: acc.reason ?? `Akun ${acc.accountType} terdaftar di blacklist`,
        evidenceUrl: null,
      });
    }

    if (settings.heuristicMode === 'all') {
      const finding = heuristicFinding(content, urlScan, 0, settings, null, 'url');
      if (finding) findings.push(finding);
    }
  }

  // 3 — attachment gambar: OCR + QR code.
  let ocrText: string | null = null;
  if (settings.scanImages && attachments.length > 0) {
    const images = await scanImageAttachments(attachments);
    if (images.length > 0) {
      ocrText = images.map(combinedText).filter(Boolean).join('\n---\n') || null;
    }

    for (const image of images) {
      // Isi QR diperlakukan seperti teks lain di gambar: ikut dicek link,
      // blacklist, dan heuristiknya.
      const text = combinedText(image);

      for (const acc of await findBlacklistedAccounts(text)) {
        const fromQr = image.qrCodes.some((qr) => qr.text.includes(acc.identifier));
        findings.push({
          detectionType: fromQr ? 'image_qr' : 'image_ocr',
          source: 'blacklist',
          matchedValue: acc.identifier,
          severity: 'high',
          detail: acc.reason ?? `Akun ${acc.accountType} terdeteksi di ${fromQr ? 'QR code' : 'gambar'}`,
          evidenceUrl: image.url,
        });
      }

      let urlScan: UrlScanResult | null = null;
      if (settings.scanUrls) {
        urlScan = await scanText(text, { useSafeBrowsing: settings.useSafeBrowsing });
        urlsFound += urlScan.found.length;
        for (const threat of urlScan.threats) {
          const fromQr = image.qrCodes.some((qr) => qr.text.includes(threat.domain));
          findings.push({
            detectionType: fromQr ? 'image_qr' : 'image_ocr',
            source: threat.source,
            matchedValue: threat.domain,
            severity: 'high',
            detail: `Link scam terdeteksi di ${fromQr ? 'QR code' : 'dalam gambar'}${
              threat.detail ? ` (${threat.detail})` : ''
            }`,
            evidenceUrl: image.url,
          });
        }
      }

      // QR pembayaran / wallet crypto di gambar promosi hampir selalu berarti
      // korban diarahkan untuk mengirim uang — catat walau isinya belum
      // terdaftar di blacklist, supaya moderator bisa menilai.
      for (const qr of image.qrCodes) {
        if (qr.kind !== 'payment' && qr.kind !== 'crypto') continue;
        findings.push({
          detectionType: 'image_qr',
          source: 'heuristic',
          matchedValue: qr.merchant ?? qr.text.slice(0, 120),
          severity: 'medium',
          detail: describeQr(qr),
          evidenceUrl: image.url,
        });
      }

      if (settings.heuristicMode !== 'off') {
        const finding = heuristicFinding(
          text,
          urlScan,
          image.qrCodes.length,
          settings,
          image.url,
          'image_ocr',
        );
        if (finding) findings.push(finding);
      }
    }
  }

  return { findings: dedupe(findings), ocrText, urlsFound };
}

/**
 * Jalankan heuristik pada sepotong teks dan ubah jadi Finding kalau lolos ambang.
 * Link yang sudah masuk whitelist tidak dihitung sebagai sinyal mencurigakan.
 */
function heuristicFinding(
  text: string,
  urlScan: UrlScanResult | null,
  qrCount: number,
  settings: EffectiveSettings,
  evidenceUrl: string | null,
  detectionType: DetectionType,
): Finding | null {
  const suspiciousUrlCount = urlScan ? urlScan.found.length - urlScan.whitelisted.length : 0;

  const result: HeuristicResult = analyzeScamText(text, {
    suspiciousUrlCount,
    qrCount,
    threshold: settings.heuristicThreshold,
  });

  if (!result.isScam) return null;

  return {
    detectionType,
    source: 'heuristic',
    matchedValue: result.hits.map((h) => h.sample).slice(0, 3).join(' + '),
    severity: result.severity,
    detail: `Pola scam (skor ${result.score}/${result.threshold}) — ${result.summary}`,
    evidenceUrl,
  };
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.detectionType}:${f.source}:${f.matchedValue.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
