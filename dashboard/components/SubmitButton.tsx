'use client';

import { useFormStatus } from 'react-dom';

const VARIANTS = {
  primary: 'bg-brand-500 text-white hover:bg-brand-400',
  danger: 'bg-danger-500/15 text-danger-500 hover:bg-danger-500/25',
  ok: 'bg-ok-500/15 text-ok-500 hover:bg-ok-500/25',
  ghost: 'bg-ink-700 text-ink-200 hover:bg-ink-600',
} as const;

export function SubmitButton({
  children,
  variant = 'primary',
  pendingLabel,
  title,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  pendingLabel?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`}
    >
      {pending ? (pendingLabel ?? 'Memproses…') : children}
    </button>
  );
}
