import Image from 'next/image';
import { Nav } from './Nav';
import { avatarUrl, type Session } from '@/lib/auth';

export function Shell({
  session,
  title,
  description,
  children,
}: {
  session: Session;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-700 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-lg">
            🛡️
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Voler Scam Guard</p>
            <p className="text-xs text-ink-400">Dashboard moderasi</p>
          </div>
        </div>

        <Nav />

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm text-white">{session.username}</p>
            <p className="text-xs text-ink-400">{session.role}</p>
          </div>
          <Image
            src={avatarUrl(session)}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="rounded-full border border-ink-700"
          />
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg bg-ink-800 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
      </div>

      <main className="flex-1 pb-10">{children}</main>
    </div>
  );
}
