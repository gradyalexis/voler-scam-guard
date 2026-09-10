import { redirect } from 'next/navigation';
import { adminCount, getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  denied: 'Login dibatalkan di halaman Discord.',
  invalid_request: 'Parameter callback tidak lengkap. Coba login ulang.',
  bad_state: 'State OAuth tidak cocok. Coba login ulang dari halaman ini.',
  not_admin: 'Akun Discord kamu belum terdaftar sebagai admin dashboard.',
  server_error: 'Terjadi error di server saat memproses login. Cek log dashboard.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/');

  const { error } = await searchParams;
  const count = await adminCount().catch(() => -1);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-brand-500/15 text-2xl">
          🛡️
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">Voler Scam Guard</h1>
        <p className="mt-1 text-sm text-ink-400">
          Dashboard moderasi. Masuk dengan akun Discord yang terdaftar sebagai admin.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-danger-500/15 px-3 py-2 text-sm text-danger-500">
            {ERRORS[error] ?? 'Login gagal.'}
          </p>
        )}

        <a
          href="/api/auth/login"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-400"
        >
          Masuk dengan Discord
        </a>

        {count === 0 && (
          <p className="mt-4 text-xs text-warn-500">
            Belum ada admin terdaftar. Isi <code>BOOTSTRAP_ADMIN_DISCORD_IDS</code> di
            <code> .env</code> dengan user ID Discord kamu, restart dashboard, lalu login.
          </p>
        )}
      </div>
    </div>
  );
}
