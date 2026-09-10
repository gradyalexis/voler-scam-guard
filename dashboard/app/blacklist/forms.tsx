'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { Input, Label, Select } from '@/components/ui';
import { addAccountAction, addDomainAction, type ActionState } from './actions';

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-xs text-danger-500">{state.error}</p>;
  if (state.ok) return <p className="text-xs text-ok-500">{state.ok}</p>;
  return null;
}

export function AddDomainForm() {
  const [state, action] = useActionState<ActionState, FormData>(addDomainAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label>
        <Label>Domain</Label>
        <Input name="domain" placeholder="scam-site.com" required />
      </label>
      <label>
        <Label>Alasan</Label>
        <Input name="reason" placeholder="phishing login akun game" />
      </label>
      <SubmitButton>Tambah</SubmitButton>
      <div className="sm:col-span-3">
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AddAccountForm() {
  const [state, action] = useActionState<ActionState, FormData>(addAccountAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <label>
        <Label>Tipe</Label>
        <Select name="accountType" defaultValue="bank">
          <option value="bank">bank</option>
          <option value="ewallet">ewallet</option>
          <option value="discord">discord</option>
          <option value="game_account">game_account</option>
          <option value="other">other</option>
        </Select>
      </label>
      <label>
        <Label>Identifier</Label>
        <Input name="identifier" placeholder="1234567890 / @username" required />
      </label>
      <label>
        <Label>Alasan</Label>
        <Input name="reason" placeholder="kronologi singkat" />
      </label>
      <label>
        <Label>URL bukti</Label>
        <Input name="evidenceUrl" placeholder="https://…" />
      </label>
      <SubmitButton>Tambah (verified)</SubmitButton>
      <div className="lg:col-span-5">
        <Feedback state={state} />
      </div>
    </form>
  );
}
