import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, EmptyState, Input } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { getWhitelistDomains } from '@/lib/queries';
import { removeWhitelistAction } from './actions';
import { AddWhitelistForm } from './form';

export const dynamic = 'force-dynamic';

export default async function WhitelistPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  const rows = await getWhitelistDomains(q);

  return (
    <Shell
      session={session}
      title="Whitelist"
      description="Domain di sini dilewati total oleh scanner — tidak dicek blacklist maupun Safe Browsing."
    >
      <Card title="Tambah domain terpercaya" className="mb-4">
        <AddWhitelistForm />
      </Card>

      <Card
        title={`${rows.length} domain terpercaya`}
        action={
          <form method="get" className="flex gap-2">
            <Input name="q" defaultValue={q ?? ''} placeholder="Cari…" className="h-8 py-1" />
            <button
              type="submit"
              className="rounded-lg bg-ink-700 px-3 py-1 text-xs text-ink-200 hover:bg-ink-600"
            >
              Cari
            </button>
            {q && (
              <Link
                href="/whitelist"
                className="rounded-lg bg-ink-700 px-3 py-1 text-xs text-ink-200 hover:bg-ink-600"
              >
                Reset
              </Link>
            )}
          </form>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Belum ada domain di whitelist.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Domain</th>
                  <th className="px-3 py-2 font-medium">Catatan</th>
                  <th className="px-3 py-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-mono text-xs text-ok-500">{row.domain}</td>
                    <td className="px-3 py-2 text-xs text-ink-200">{row.note ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <form action={removeWhitelistAction}>
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
