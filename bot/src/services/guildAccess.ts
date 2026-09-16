import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes, type Guild } from 'discord.js';
import { config } from '../config.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('guild-access');

/**
 * Bot ini dipasang sendiri oleh pemiliknya (BOT_OWNER_IDS). Server orang lain
 * yang mengundang bot tidak boleh ikut memakai kuota AI/OCR dan database
 * pemilik, jadi bot hanya tinggal di server tempat salah satu pemilik adalah
 * owner, Administrator, atau Manage Server — sama dengan syarat Discord untuk
 * memasang bot.
 */
async function ownerManagesGuild(guild: Guild): Promise<boolean> {
  for (const ownerId of config.discord.ownerIds) {
    if (guild.ownerId === ownerId) return true;
    try {
      // Fetch satu member lewat REST tidak butuh privileged intent GuildMembers.
      const member = await guild.members.fetch(ownerId);
      if (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        return true;
      }
    } catch (err) {
      if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownMember) continue;
      throw err;
    }
  }
  return false;
}

/**
 * Tinggalkan server kalau tidak dikelola pemilik bot. True kalau bot boleh
 * tetap di server ini. Error sementara (Discord gangguan, rate limit) tidak
 * membuat bot keluar — lebih baik tertunda daripada meninggalkan server sah.
 */
export async function enforceGuildAccess(guild: Guild): Promise<boolean> {
  let allowed: boolean;
  try {
    allowed = await ownerManagesGuild(guild);
  } catch (err) {
    log.warn(`Tidak bisa memeriksa akses server ${guild.name} (${guild.id}), bot tetap tinggal`, err);
    return true;
  }
  if (allowed) return true;

  log.warn(
    `Server ${guild.name} (${guild.id}) tidak dikelola BOT_OWNER_IDS — bot keluar dari server ini`,
  );
  try {
    await guild.leave();
  } catch (err) {
    log.error(`Gagal keluar dari server ${guild.id}`, err);
  }
  return false;
}
