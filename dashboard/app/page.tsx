import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Badge, Card, EmptyState, Stat } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { getDailyDetections, getOverviewStats, getTopMatches } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const session = await requireSession();
  const [stats, daily, top] = await Promise.all([
    getOverviewStats(),
    getDailyDetections(14),
    getTopMatches(8),
  ]);

  const peak = Math.max(1, ...daily.map((d) => d.total));

  return (
    <Shell
      session={session}
      title="Ringkasan"
      description="Aktivitas deteksi bot dan isi database blacklist."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Deteksi 24 jam" value={stats.last24h} />
        <Stat label="Deteksi 7 hari" value={stats.last7d} hint={`${stats.deleted7d} pesan dihapus`} />
        <Stat label="Total deteksi" value={stats.total} />
        <Stat
          label="User kena flag (7h)"
          value={stats.uniqueUsers7d}
          hint="user unik dengan deteksi"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Domain blacklist" value={stats.domains} />
        <Stat label="Akun verified" value={stats.accountsVerified} />
        <Stat
          label="Laporan pending"
          value={stats.accountsPending}
          hint={stats.accountsPending > 0 ? 'butuh review' : 'antrean kosong'}
        />
        <Stat label="Domain whitelist" value={stats.whitelist} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card title="Deteksi 14 hari terakhir" className="lg:col-span-3">
          {daily.every((d) => d.total === 0) ? (
            <EmptyState>Belum ada deteksi tercatat.</EmptyState>
          ) : (
            <div className="flex h-44 items-end gap-1.5">
              {daily.map((d) => (
                <div key={d.day} className="group flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-brand-500/70 transition group-hover:bg-brand-400"
                      style={{ height: `${Math.max(2, (d.total / peak) * 100)}%` }}
                      title={`${d.day}: ${d.total} deteksi`}
                    />
                  </div>
                  <span className="text-[10px] text-ink-400">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Top match (30 hari)"
          className="lg:col-span-2"
          action={
            <Link href="/logs" className="text-xs text-brand-400 hover:underline">
              Lihat semua log
            </Link>
          }
        >
          {top.length === 0 ? (
            <EmptyState>Belum ada data.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {top.map((row) => (
                <li
                  key={`${row.detection_type}:${row.matched_value}`}
                  className="flex items-center justify-between gap-3"
                >
                  <Link
                    href={`/logs?q=${encodeURIComponent(row.matched_value)}`}
                    className="truncate font-mono text-xs text-ink-200 hover:text-brand-400"
                  >
                    {row.matched_value}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone="brand">{row.detection_type}</Badge>
                    <span className="text-xs tabular-nums text-ink-400">{row.total}×</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
