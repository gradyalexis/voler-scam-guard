'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { Input, Label } from '@/components/ui';
import { addWhitelistAction, type ActionState } from './actions';

export function AddWhitelistForm() {
  const [state, action] = useActionState<ActionState, FormData>(addWhitelistAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label>
        <Label>Domain</Label>
        <Input name="domain" placeholder="midman-resmi.com" required />
      </label>
      <label>
        <Label>Catatan</Label>
        <Input name="note" placeholder="midman resmi server" />
      </label>
      <SubmitButton>Tambah</SubmitButton>
      <div className="sm:col-span-3">
        {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
        {state.ok && <p className="text-xs text-ok-500">{state.ok}</p>}
      </div>
    </form>
  );
}
