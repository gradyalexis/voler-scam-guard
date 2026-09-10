import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Card, EmptyState, Select } from '@/components/ui';
import { hasRole, requireSession } from '@/lib/auth';
import { getAdmins, getAllGuildSettings } from '@/lib/queries';
import { removeAdminAction, setAdminRoleAction } from './actions';
import { AddAdminForm, GuildSettingsForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const [guilds, admins] = await Promise.all([getAllGuildSettings(), getAdmins()]);
  const isOwner = hasRole(session, 'owner');

  return (
    <Shell
      session={session}
      title="Settings"
      description="Perilaku bot per server dan daftar admin dashboard."
    >
      {guilds.length === 0 ? (
        <EmptyState>
          Belum ada server terdaftar. Baris dibuat otomatis saat bot online atau di-invite ke server.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {guilds.map((guild) => (
            <Card
              key={guild.guildId}
              title={guild.guildName ?? guild.guildId}
              action={<Badge tone={guild.mode === 'off' ? 'neutral' : 'brand'}>{guild.mode}</Badge>}
            >
              <GuildSettingsForm
                guild={{
                  guildId: guild.guildId,
                  guildName: guild.guildName,
                  mode: guild.mode,
                  scanUrls: guild.scanUrls,
                  scanImages: guild.scanImages,
                  useSafeBrowsing: guild.useSafeBrowsing,
                  logCleanMessages: guild.logCleanMessages,
                  heuristicMode: guild.heuristicMode,
                  heuristicThreshold: guild.heuristicThreshold,
                  modLogChannelId: guild.modLogChannelId,
                  reportChannelId: guild.reportChannelId,
                  scannedChannelIds: guild.scannedChannelIds,
                  ignoredChannelIds: guild.ignoredChannelIds,
                  ignoredRoleIds: guild.ignoredRoleIds,
                }}
              />
            </Card>
          ))}
        </div>
      )}

      <Card title="Admin dashboard" className="mt-6">
        {isOwner ? (
          <AddAdminForm />
        ) : (
          <p className="text-xs text-ink-400">
            Hanya role <code>owner</code> yang bisa mengubah daftar admin.
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Discord ID</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-3 py-2 text-white">
                    {admin.username ?? '—'}
                    {admin.discordId === session.discordId && (
                      <span className="ml-2 text-[11px] text-ink-400">(kamu)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-400">{admin.discordId}</td>
                  <td className="px-3 py-2">
                    {isOwner ? (
                      <form action={setAdminRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={admin.id} />
                        <Select name="role" defaultValue={admin.role} className="h-8 w-32 py-1">
                          <option value="moderator">moderator</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </Select>
                        <SubmitButton variant="ghost">Simpan</SubmitButton>
                      </form>
                    ) : (
                      <Badge>{admin.role}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      {isOwner && admin.discordId !== session.discordId && (
                        <form action={removeAdminAction}>
                          <input type="hidden" name="id" value={admin.id} />
                          <input type="hidden" name="discordId" value={admin.discordId} />
                          <SubmitButton variant="danger">Hapus</SubmitButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}
