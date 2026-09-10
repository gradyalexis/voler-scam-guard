'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Ringkasan' },
  { href: '/logs', label: 'Logs' },
  { href: '/blacklist', label: 'Blacklist' },
  { href: '/whitelist', label: 'Whitelist' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-ink-700 text-white' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
