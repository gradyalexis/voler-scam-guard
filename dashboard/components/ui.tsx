import type { ReactNode } from 'react';

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-ink-700 bg-ink-900 ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-white">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-ink-700 text-ink-200',
  danger: 'bg-danger-500/15 text-danger-500',
  warn: 'bg-warn-500/15 text-warn-500',
  ok: 'bg-ok-500/15 text-ok-500',
  brand: 'bg-brand-500/15 text-brand-400',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-ink-400">
      {children}
    </p>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none ${className}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none ${className}`}
    >
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-ink-400">{children}</span>;
}
