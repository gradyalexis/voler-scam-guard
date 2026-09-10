import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Card, EmptyState, Input } from '@/components/ui';
import { hasRole, requireSession } from '@/lib/auth';
import { getAccounts, getBlacklistDomains } from '@/lib/queries';
import { deleteAccountAction, removeDomainAction, setAccountStatusAction } from './actions';
import { AddAccountForm, AddDomainForm } from './forms';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  verified: 'danger',
  pending: 'warn',
  rejected: 'neutral',
} as const;

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'Semua' },
];

function fmt(date: Date | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

export default async function BlacklistPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireSession();
  const { q, status = 'pending' } = await searchParams;

  const [domains, accounts] = await Promise.all([getBlacklistDomains(q), getAccounts(status, q)]);
  const canDelete = hasRole(session, 'admin');

  return (
    <Shell
      session={session}
      title="Blacklist"
      description="Domain dan rekening/akun yang diblokir bot. Laporan baru masuk sebagai pending sampai di-approve."
    >
      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="status" value={status} />
          <div className="min-w-[220px] flex-1">
            <Input name="q" defaultValue={q ?? ''} placeholder="Cari domain / identifier / alasan…" />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400"
          >
            Cari
          </button>
          <Link
            href="/blacklist"
            className="rounded-lg bg-ink-700 px-4 py-2 text-sm text-ink-200 hover:bg-ink-600"
          >
            Reset
          </Link>
        </form>
      </Card>

      <Card title="Rekening / akun" className="mb-6">
        <AddAccountForm />

        <div className="mt-5 flex flex-wrap gap-1 border-b border-ink-700 pb-3">
          {STATUS_TABS.map((tab) => {
            const href = `/blacklist?status=${tab.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
            const active = status === tab.value;
            return (
              <Link
                key={tab.value}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  active ? 'bg-ink-700 text-white' : 'text-ink-400 hover:bg-ink-800'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {accounts.length === 0 ? (
          <div className="mt-4">
            <EmptyState>Tidak ada entri dengan status ini.</EmptyState>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Tipe</th>
                  <th className="px-3 py-2 font-medium">Identifier</th>
                  <th className="px-3 py-2 font-medium">Alasan</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Dibuat</th>
                  <th className="px-3 py-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {accounts.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2 text-xs text-ink-400">{row.id}</td>
                    <td className="px-3 py-2">
                      <Badge>{row.accountType}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-white">
                      {row.identifier}
                      {row.evidenceUrl && (
                        <a
                          href={row.evidenceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ml-2 text-[11px] text-brand-400 hover:underline"
                        >
                          bukti
                        </a>
                      )}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-ink-200">
                      <p className="line-clamp-2">{row.reason ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[row.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-400">
                      {fmt(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {row.status !== 'verified' && (
                          <form action={setAccountStatusAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="status" value="verified" />
                            <SubmitButton variant="ok">Approve</SubmitButton>
                          </form>
                        )}
                        {row.status !== 'rejected' && (
                          <form action={setAccountStatusAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="status" value="rejected" />
                            <SubmitButton variant="ghost">Reject</SubmitButton>
                          </form>
                        )}
                        {canDelete && (
                          <form action={deleteAccountAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <SubmitButton variant="danger" title="Hapus permanen">
                              Hapus
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Domain blacklist">
        <AddDomainForm />

        {domains.length === 0 ? (
          <div className="mt-4">
            <EmptyState>Belum ada domain di blacklist.</EmptyState>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Domain</th>
                  <th className="px-3 py-2 font-medium">Alasan</th>
                  <th className="px-3 py-2 font-medium">Ditambahkan</th>
                  <th className="px-3 py-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {domains.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-mono text-xs text-danger-500">{row.domain}</td>
                    <td className="px-3 py-2 text-xs text-ink-200">{row.reason ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-400">
                      {fmt(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <form action={removeDomainAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <SubmitButton variant="danger">Hapus</SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
