import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Badge, Card, EmptyState, Input, Label, Select } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { getGuildOptions, getLogs } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const ACTION_TONE = {
  deleted: 'danger',
  warned: 'warn',
  flagged_only: 'brand',
  none: 'neutral',
} as const;

function fmt(date: Date | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const filters = {
    q: params.q || undefined,
    guildId: params.guildId || undefined,
    userId: params.userId || undefined,
    channelId: params.channelId || undefined,
    detectionType: params.detectionType || undefined,
    source: params.source || undefined,
    actionTaken: params.actionTaken || undefined,
    days: params.days ? Number(params.days) : 30,
    page: params.page ? Number(params.page) : 1,
  };

  const [{ rows, total, page, pageCount }, guilds] = await Promise.all([
    getLogs(filters),
    getGuildOptions(),
  ]);

  const buildPageHref = (target: number) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'page') q.set(key, value);
    }
    q.set('page', String(target));
    return `/logs?${q.toString()}`;
  };

  return (
    <Shell
      session={session}
      title="Detection logs"
      description={`${total.toLocaleString('id-ID')} baris cocok dengan filter.`}
    >
      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" method="get">
          <label className="lg:col-span-2">
            <Label>Cari</Label>
            <Input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="domain, rekening, isi pesan, user…"
            />
          </label>
          <label>
            <Label>Server</Label>
            <Select name="guildId" defaultValue={params.guildId ?? ''}>
              <option value="">Semua</option>
              {guilds.map((g) => (
                <option key={g.guild_id} value={g.guild_id}>
                  {g.guild_name ?? g.guild_id}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Tipe</Label>
            <Select name="detectionType" defaultValue={params.detectionType ?? ''}>
              <option value="">Semua</option>
              <option value="url">url</option>
              <option value="image_ocr">image_ocr</option>
              <option value="image_qr">image_qr</option>
              <option value="account">account</option>
            </Select>
          </label>
          <label>
            <Label>Sumber</Label>
            <Select name="source" defaultValue={params.source ?? ''}>
              <option value="">Semua</option>
              <option value="blacklist">blacklist</option>
              <option value="safe_browsing">safe_browsing</option>
              <option value="heuristic">heuristic</option>
            </Select>
          </label>
          <label>
            <Label>Aksi</Label>
            <Select name="actionTaken" defaultValue={params.actionTaken ?? ''}>
              <option value="">Semua</option>
              <option value="deleted">deleted</option>
              <option value="warned">warned</option>
              <option value="flagged_only">flagged_only</option>
              <option value="none">none</option>
            </Select>
          </label>
          <label>
            <Label>Rentang</Label>
            <Select name="days" defaultValue={params.days ?? '30'}>
              <option value="1">24 jam</option>
              <option value="7">7 hari</option>
              <option value="30">30 hari</option>
              <option value="90">90 hari</option>
              <option value="0">Semua</option>
            </Select>
          </label>
          <div className="flex items-end gap-2 lg:col-span-7">
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400"
            >
              Terapkan filter
            </button>
            <Link
              href="/logs"
              className="rounded-lg bg-ink-700 px-4 py-2 text-sm text-ink-200 hover:bg-ink-600"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState>Tidak ada log yang cocok.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-3 py-2 font-medium">Waktu</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Match</th>
                <th className="px-3 py-2 font-medium">Tipe</th>
                <th className="px-3 py-2 font-medium">Aksi</th>
                <th className="px-3 py-2 font-medium">Konteks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700 bg-ink-900">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-ink-800/60">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-400">
                    {fmt(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-white">{row.username ?? '—'}</p>
                    <Link
                      href={`/logs?userId=${row.userId ?? ''}`}
                      className="font-mono text-[11px] text-ink-400 hover:text-brand-400"
                    >
                      {row.userId}
                    </Link>
                  </td>
                  <td className="max-w-[240px] px-3 py-2">
                    <p className="truncate font-mono text-xs text-danger-500">
                      {row.matchedValue ?? '—'}
                    </p>
                    {row.source && <p className="text-[11px] text-ink-400">{row.source}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone="brand">{row.detectionType}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={ACTION_TONE[row.actionTaken as keyof typeof ACTION_TONE] ?? 'neutral'}>
                      {row.actionTaken}
                    </Badge>
                  </td>
                  <td className="max-w-[380px] px-3 py-2">
                    {row.messageContent && (
                      <p className="line-clamp-2 text-xs text-ink-200">{row.messageContent}</p>
                    )}
                    {row.ocrText && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-ink-400 hover:text-brand-400">
                          Teks OCR
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-ink-950 p-2 text-[11px] text-ink-400">
                          {row.ocrText}
                        </pre>
                      </details>
                    )}
                    {row.evidenceUrl && (
                      <a
                        href={row.evidenceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-block text-[11px] text-brand-400 hover:underline"
                      >
                        Lihat bukti gambar
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-400">
            Halaman {page} dari {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(page - 1)}
                className="rounded-lg bg-ink-700 px-3 py-1.5 text-ink-200 hover:bg-ink-600"
              >
                Sebelumnya
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={buildPageHref(page + 1)}
                className="rounded-lg bg-ink-700 px-3 py-1.5 text-ink-200 hover:bg-ink-600"
              >
                Berikutnya
              </Link>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
