'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { Input, Label, Select } from '@/components/ui';
import {
  addAdminAction,
  updateGuildSettingsAction,
  type ActionState,
} from './actions';

export interface GuildFormValues {
  guildId: string;
  guildName: string | null;
  mode: string;
  scanUrls: boolean;
  scanImages: boolean;
  useSafeBrowsing: boolean;
  logCleanMessages: boolean;
  heuristicMode: string;
  heuristicThreshold: number;
  modLogChannelId: string | null;
  reportChannelId: string | null;
  scannedChannelIds: string[];
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-[var(--color-brand-500)]"
      />
      <span>
        <span className="block text-sm text-white">{label}</span>
        {hint && <span className="block text-xs text-ink-400">{hint}</span>}
      </span>
    </label>
  );
}

export function GuildSettingsForm({ guild }: { guild: GuildFormValues }) {
  const [state, action] = useActionState<ActionState, FormData>(updateGuildSettingsAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="guildId" value={guild.guildId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <Label>Mode saat scam terdeteksi</Label>
          <Select name="mode" defaultValue={guild.mode}>
            <option value="auto_delete">auto_delete — hapus pesan + DM user</option>
            <option value="warn">warn — balas peringatan di channel</option>
            <option value="flag_only">flag_only — catat & lapor ke mod-log</option>
            <option value="off">off — nonaktif di server ini</option>
          </Select>
        </label>
        <label>
          <Label>Mod-log channel ID</Label>
          <Input name="modLogChannelId" defaultValue={guild.modLogChannelId ?? ''} placeholder="kosong = tidak kirim" />
        </label>
        <label>
          <Label>Channel laporan ID</Label>
          <Input name="reportChannelId" defaultValue={guild.reportChannelId ?? ''} placeholder="#blacklist-account-rekening" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Toggle name="scanUrls" label="Scan URL" defaultChecked={guild.scanUrls} />
        <Toggle name="scanImages" label="Scan gambar (OCR)" defaultChecked={guild.scanImages} />
        <Toggle
          name="useSafeBrowsing"
          label="Google Safe Browsing"
          hint="butuh API key di .env"
          defaultChecked={guild.useSafeBrowsing}
        />
        <Toggle
          name="logCleanMessages"
          label="Log pesan bersih"
          hint="catat juga pesan berisi link yang lolos"
          defaultChecked={guild.logCleanMessages}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2">
          <Label>Heuristik pola scam (tanpa perlu data blacklist)</Label>
          <Select name="heuristicMode" defaultValue={guild.heuristicMode}>
            <option value="images">images — hanya teks di dalam gambar (disarankan)</option>
            <option value="all">all — gambar + teks pesan</option>
            <option value="off">off — matikan</option>
          </Select>
        </label>
        <label>
          <Label>Ambang skor (3–30, default 8)</Label>
          <Input
            name="heuristicThreshold"
            type="number"
            min={3}
            max={30}
            defaultValue={guild.heuristicThreshold}
          />
        </label>
      </div>

      <p className="text-xs text-ink-400">
        Heuristik menilai teks hasil OCR terhadap pola scam yang umum (giveaway palsu, Nitro
        gratis, doubling crypto, permintaan OTP). Ambang lebih kecil = lebih sensitif tapi lebih
        banyak salah deteksi. Uji satu gambar dengan <code>/scamguard testimage</code> untuk
        melihat rincian skornya.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <Label>Channel yang di-scan (kosong = semua)</Label>
          <Input
            name="scannedChannelIds"
            defaultValue={guild.scannedChannelIds.join(', ')}
            placeholder="1234, 5678"
          />
        </label>
        <label>
          <Label>Channel yang diabaikan</Label>
          <Input
            name="ignoredChannelIds"
            defaultValue={guild.ignoredChannelIds.join(', ')}
            placeholder="1234, 5678"
          />
        </label>
        <label>
          <Label>Role yang diabaikan</Label>
          <Input
            name="ignoredRoleIds"
            defaultValue={guild.ignoredRoleIds.join(', ')}
            placeholder="role staff, midman"
          />
        </label>
      </div>

      <p className="text-xs text-ink-400">
        ID diambil dari Discord dengan Developer Mode aktif (User Settings → Advanced), lalu klik
        kanan channel/role → Copy ID. Pisahkan dengan koma.
      </p>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Menyimpan…">Simpan setting</SubmitButton>
        {state.error && <span className="text-xs text-danger-500">{state.error}</span>}
        {state.ok && <span className="text-xs text-ok-500">{state.ok}</span>}
      </div>
    </form>
  );
}

export function AddAdminForm() {
  const [state, action] = useActionState<ActionState, FormData>(addAdminAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
      <label>
        <Label>Discord user ID</Label>
        <Input name="discordId" placeholder="123456789012345678" required />
      </label>
      <label>
        <Label>Role</Label>
        <Select name="role" defaultValue="moderator">
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </Select>
      </label>
      <SubmitButton>Tambah admin</SubmitButton>
      <div className="sm:col-span-3">
        {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
        {state.ok && <p className="text-xs text-ok-500">{state.ok}</p>}
      </div>
    </form>
  );
}
