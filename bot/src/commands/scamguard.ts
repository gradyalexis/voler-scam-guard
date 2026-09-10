import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { config } from '../config.js';
import {
  addBlacklistDomain,
  addWhitelistDomain,
  blacklistStats,
  checkDomainBlacklist,
  findBlacklistedAccounts,
  isWhitelisted,
  lookupAccount,
  removeBlacklistDomain,
  removeWhitelistDomain,
  reportAccount,
  setAccountStatus,
} from '../services/blacklistCheck.js';
import { analyzeScamText } from '../services/heuristicScanner.js';
import { combinedText, scanImage } from '../services/imageScanner.js';
import { isScannableImage } from '../services/ocrScanner.js';
import { describeQr } from '../services/qrScanner.js';
import {
  getSettings,
  updateSettings,
  type BotMode,
  type HeuristicMode,
} from '../services/settings.js';
import { checkSafeBrowsing, scanText } from '../services/urlScanner.js';
import { createLogger } from '../util/logger.js';
import { extractUrls, normalizeDomain, truncate } from '../util/text.js';
import type { CommandModule } from './types.js';

const log = createLogger('command');

const ACCOUNT_TYPES = [
  { name: 'Bank', value: 'bank' },
  { name: 'E-Wallet', value: 'ewallet' },
  { name: 'Akun Discord', value: 'discord' },
  { name: 'Akun Game', value: 'game_account' },
  { name: 'Lainnya', value: 'other' },
];

const MODES = [
  { name: 'Auto delete — hapus pesan + DM user', value: 'auto_delete' },
  { name: 'Warn — balas peringatan di channel', value: 'warn' },
  { name: 'Flag only — cuma catat & lapor ke mod-log', value: 'flag_only' },
  { name: 'Off — nonaktif di server ini', value: 'off' },
];

export const data = new SlashCommandBuilder()
  .setName('scamguard')
  .setDescription('Kelola Voler Scam Guard')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addSubcommandGroup((g) =>
    g
      .setName('blacklist')
      .setDescription('Kelola daftar hitam')
      .addSubcommand((s) =>
        s
          .setName('add-domain')
          .setDescription('Tambah domain ke blacklist')
          .addStringOption((o) =>
            o.setName('domain').setDescription('Contoh: scam-site.com').setRequired(true),
          )
          .addStringOption((o) => o.setName('alasan').setDescription('Alasan blacklist')),
      )
      .addSubcommand((s) =>
        s
          .setName('remove-domain')
          .setDescription('Hapus domain dari blacklist')
          .addStringOption((o) => o.setName('domain').setDescription('Domain').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('add-account')
          .setDescription('Tambah rekening/akun ke blacklist (langsung verified)')
          .addStringOption((o) =>
            o
              .setName('tipe')
              .setDescription('Jenis akun')
              .setRequired(true)
              .addChoices(...ACCOUNT_TYPES),
          )
          .addStringOption((o) =>
            o
              .setName('identifier')
              .setDescription('Nomor rekening / username / user ID')
              .setRequired(true),
          )
          .addStringOption((o) => o.setName('alasan').setDescription('Alasan blacklist'))
          .addStringOption((o) => o.setName('bukti').setDescription('URL screenshot bukti')),
      ),
  )
  .addSubcommandGroup((g) =>
    g
      .setName('whitelist')
      .setDescription('Kelola domain terpercaya')
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Tambah domain terpercaya')
          .addStringOption((o) => o.setName('domain').setDescription('Domain').setRequired(true))
          .addStringOption((o) => o.setName('catatan').setDescription('Catatan')),
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('Hapus domain dari whitelist')
          .addStringOption((o) => o.setName('domain').setDescription('Domain').setRequired(true)),
      ),
  )
  .addSubcommandGroup((g) =>
    g
      .setName('settings')
      .setDescription('Setting bot untuk server ini')
      .addSubcommand((s) => s.setName('show').setDescription('Lihat setting saat ini'))
      .addSubcommand((s) =>
        s
          .setName('mode')
          .setDescription('Atur aksi saat scam terdeteksi')
          .addStringOption((o) =>
            o.setName('mode').setDescription('Mode').setRequired(true).addChoices(...MODES),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('channel')
          .setDescription('Atur channel mod-log / channel laporan')
          .addStringOption((o) =>
            o
              .setName('jenis')
              .setDescription('Channel apa')
              .setRequired(true)
              .addChoices(
                { name: 'Mod log', value: 'modlog' },
                { name: 'Channel laporan', value: 'report' },
              ),
          )
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Channel target (kosongkan untuk menghapus)')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('heuristic')
          .setDescription('Deteksi pola gambar scam tanpa perlu data blacklist')
          .addStringOption((o) =>
            o
              .setName('mode')
              .setDescription('Di mana heuristik dijalankan')
              .setRequired(true)
              .addChoices(
                { name: 'Gambar saja (disarankan)', value: 'images' },
                { name: 'Gambar + teks pesan', value: 'all' },
                { name: 'Matikan', value: 'off' },
              ),
          )
          .addIntegerOption((o) =>
            o
              .setName('ambang')
              .setDescription('Skor minimum, default 8. Makin kecil makin sensitif')
              .setMinValue(3)
              .setMaxValue(30),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('toggle')
          .setDescription('Nyalakan/matikan komponen scan')
          .addStringOption((o) =>
            o
              .setName('fitur')
              .setDescription('Fitur')
              .setRequired(true)
              .addChoices(
                { name: 'Scan URL', value: 'scanUrls' },
                { name: 'Scan gambar (OCR)', value: 'scanImages' },
                { name: 'Google Safe Browsing', value: 'useSafeBrowsing' },
                { name: 'Log pesan bersih', value: 'logCleanMessages' },
              ),
          )
          .addBooleanOption((o) =>
            o.setName('aktif').setDescription('true = nyala').setRequired(true),
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('check')
      .setDescription('Cek satu URL / rekening / username tanpa mengubah data')
      .addStringOption((o) =>
        o.setName('nilai').setDescription('URL, nomor rekening, atau username').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('report')
      .setDescription('Laporkan rekening/akun scam (masuk antrean review)')
      .addStringOption((o) =>
        o.setName('tipe').setDescription('Jenis akun').setRequired(true).addChoices(...ACCOUNT_TYPES),
      )
      .addStringOption((o) =>
        o.setName('identifier').setDescription('Nomor rekening / username').setRequired(true),
      )
      .addStringOption((o) => o.setName('alasan').setDescription('Kronologi singkat'))
      .addStringOption((o) => o.setName('bukti').setDescription('URL screenshot bukti')),
  )
  .addSubcommand((s) =>
    s
      .setName('verify')
      .setDescription('Approve/reject laporan yang pending')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('ID laporan').setRequired(true).setMinValue(1),
      )
      .addStringOption((o) =>
        o
          .setName('status')
          .setDescription('Status baru')
          .setRequired(true)
          .addChoices(
            { name: 'Approve (verified)', value: 'verified' },
            { name: 'Reject', value: 'rejected' },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('testimage')
      .setDescription('Uji satu gambar: lihat teks OCR dan rincian skor heuristik')
      .addAttachmentOption((o) =>
        o.setName('gambar').setDescription('Gambar yang mau diuji').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('stats').setDescription('Ringkasan isi database'))
  .toJSON();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'Command ini hanya bisa dipakai di dalam server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!hasPermission(interaction)) {
    await interaction.reply({
      content: 'Kamu butuh izin **Manage Messages** untuk memakai command ini.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  try {
    if (group === 'blacklist') return await handleBlacklist(interaction, sub);
    if (group === 'whitelist') return await handleWhitelist(interaction, sub);
    if (group === 'settings') return await handleSettings(interaction, sub);

    switch (sub) {
      case 'check':
        return await handleCheck(interaction);
      case 'report':
        return await handleReport(interaction);
      case 'verify':
        return await handleVerify(interaction);
      case 'testimage':
        return await handleTestImage(interaction);
      case 'stats':
        return await handleStats(interaction);
      default:
        await interaction.editReply('Subcommand tidak dikenal.');
    }
  } catch (err) {
    log.error(`Command /scamguard ${group ?? ''} ${sub} gagal`, err);
    await interaction
      .editReply('Terjadi error saat menjalankan command. Cek log bot.')
      .catch(() => {});
  }
}

function hasPermission(interaction: ChatInputCommandInteraction): boolean {
  if (config.discord.ownerIds.includes(interaction.user.id)) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages));
}

// ---------------------------------------------------------------------------

async function handleBlacklist(interaction: ChatInputCommandInteraction, sub: string) {
  if (sub === 'add-domain') {
    const domain = normalizeDomain(interaction.options.getString('domain', true));
    const reason = interaction.options.getString('alasan');
    if (!domain.includes('.')) {
      await interaction.editReply('Domain tidak valid.');
      return;
    }
    const { created } = await addBlacklistDomain(domain, reason, interaction.user.id);
    await interaction.editReply(
      created ? `\`${domain}\` ditambahkan ke blacklist.` : `\`${domain}\` sudah ada di blacklist.`,
    );
    return;
  }

  if (sub === 'remove-domain') {
    const domain = normalizeDomain(interaction.options.getString('domain', true));
    const removed = await removeBlacklistDomain(domain);
    await interaction.editReply(
      removed ? `\`${domain}\` dihapus dari blacklist.` : `\`${domain}\` tidak ada di blacklist.`,
    );
    return;
  }

  if (sub === 'add-account') {
    const { id, created } = await reportAccount({
      accountType: interaction.options.getString('tipe', true),
      identifier: interaction.options.getString('identifier', true),
      reason: interaction.options.getString('alasan'),
      evidenceUrl: interaction.options.getString('bukti'),
      reportedBy: interaction.user.id,
      status: 'verified',
    });
    await interaction.editReply(
      created
        ? `Akun ditambahkan ke blacklist dengan status **verified** (ID \`${id}\`).`
        : 'Akun itu sudah ada di database (atau identifier terlalu pendek).',
    );
  }
}

async function handleWhitelist(interaction: ChatInputCommandInteraction, sub: string) {
  const domain = normalizeDomain(interaction.options.getString('domain', true));
  if (sub === 'add') {
    const { created } = await addWhitelistDomain(
      domain,
      interaction.options.getString('catatan'),
      interaction.user.id,
    );
    await interaction.editReply(
      created ? `\`${domain}\` ditambahkan ke whitelist.` : `\`${domain}\` sudah ada di whitelist.`,
    );
    return;
  }
  if (sub === 'remove') {
    const removed = await removeWhitelistDomain(domain);
    await interaction.editReply(
      removed ? `\`${domain}\` dihapus dari whitelist.` : `\`${domain}\` tidak ada di whitelist.`,
    );
  }
}

async function handleSettings(interaction: ChatInputCommandInteraction, sub: string) {
  const guildId = interaction.guildId!;

  if (sub === 'show') {
    const s = await getSettings(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x3c8ce2)
      .setTitle('Setting Voler Scam Guard')
      .addFields(
        { name: 'Mode', value: `\`${s.mode}\``, inline: true },
        { name: 'Scan URL', value: s.scanUrls ? 'on' : 'off', inline: true },
        { name: 'Scan gambar', value: s.scanImages ? 'on' : 'off', inline: true },
        {
          name: 'Safe Browsing',
          value: !config.safeBrowsing.enabled
            ? 'API key belum diset'
            : s.useSafeBrowsing
              ? 'on'
              : 'off',
          inline: true,
        },
        { name: 'Log pesan bersih', value: s.logCleanMessages ? 'on' : 'off', inline: true },
        {
          name: 'Heuristik pola scam',
          value: `\`${s.heuristicMode}\` (ambang ${s.heuristicThreshold})`,
          inline: true,
        },
        {
          name: 'Mod log',
          value: s.modLogChannelId ? `<#${s.modLogChannelId}>` : '—',
          inline: true,
        },
        {
          name: 'Channel laporan',
          value: s.reportChannelId ? `<#${s.reportChannelId}>` : '—',
          inline: true,
        },
        {
          name: 'Channel yang di-scan',
          value:
            s.scannedChannelIds.length === 0
              ? 'Semua channel'
              : s.scannedChannelIds.map((id) => `<#${id}>`).join(', '),
        },
      )
      .setFooter({ text: 'Daftar channel yang di-scan diatur dari dashboard.' });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'mode') {
    const mode = interaction.options.getString('mode', true) as BotMode;
    await updateSettings(guildId, { mode });
    await interaction.editReply(`Mode diubah ke \`${mode}\`.`);
    return;
  }

  if (sub === 'channel') {
    const jenis = interaction.options.getString('jenis', true);
    const channel = interaction.options.getChannel('channel');
    const key = jenis === 'modlog' ? 'modLogChannelId' : 'reportChannelId';
    await updateSettings(guildId, { [key]: channel?.id ?? null });
    await interaction.editReply(
      channel
        ? `Channel ${jenis} diatur ke <#${channel.id}>.`
        : `Channel ${jenis} dikosongkan.`,
    );
    return;
  }

  if (sub === 'heuristic') {
    const mode = interaction.options.getString('mode', true) as HeuristicMode;
    const threshold = interaction.options.getInteger('ambang');
    await updateSettings(guildId, {
      heuristicMode: mode,
      ...(threshold !== null ? { heuristicThreshold: threshold } : {}),
    });
    await interaction.editReply(
      `Heuristik diatur ke \`${mode}\`${threshold !== null ? ` dengan ambang \`${threshold}\`` : ''}.`,
    );
    return;
  }

  if (sub === 'toggle') {
    const fitur = interaction.options.getString('fitur', true) as
      | 'scanUrls'
      | 'scanImages'
      | 'useSafeBrowsing'
      | 'logCleanMessages';
    const aktif = interaction.options.getBoolean('aktif', true);
    await updateSettings(guildId, { [fitur]: aktif });
    await interaction.editReply(`\`${fitur}\` diatur ke \`${aktif}\`.`);
  }
}

async function handleCheck(interaction: ChatInputCommandInteraction) {
  const value = interaction.options.getString('nilai', true);
  const lines: string[] = [];

  const urls = extractUrls(value);
  if (urls.length > 0) {
    for (const u of urls) {
      const parts: string[] = [`**${u.domain}**`];
      if (await isWhitelisted(u.domain)) parts.push('✅ whitelisted');
      const hit = await checkDomainBlacklist(u.domain);
      if (hit) parts.push(`⛔ blacklist (${hit.reason ?? 'tanpa alasan'})`);
      if (config.safeBrowsing.enabled) {
        const verdicts = await checkSafeBrowsing([u.url]);
        const v = verdicts.get(u.url);
        parts.push(v?.isThreat ? `⛔ Safe Browsing: ${v.threatType}` : '✅ Safe Browsing bersih');
      } else {
        parts.push('⚠️ Safe Browsing tidak aktif');
      }
      lines.push(parts.join(' — '));
    }
  }

  const exact = await lookupAccount(value);
  for (const acc of exact) {
    lines.push(`⛔ Akun ${acc.accountType} \`${acc.identifier}\` terdaftar (ID ${acc.id})`);
  }

  const fuzzy = await findBlacklistedAccounts(value);
  for (const acc of fuzzy) {
    if (exact.some((e) => e.id === acc.id)) continue;
    lines.push(`⛔ Cocok dengan blacklist ${acc.accountType} \`${acc.identifier}\``);
  }

  await interaction.editReply(
    lines.length > 0
      ? truncate(lines.join('\n'), 1900)
      : 'Tidak ada catatan untuk nilai tersebut (belum tentu aman — tetap hati-hati).',
  );
}

async function handleReport(interaction: ChatInputCommandInteraction) {
  const { id, created } = await reportAccount({
    accountType: interaction.options.getString('tipe', true),
    identifier: interaction.options.getString('identifier', true),
    reason: interaction.options.getString('alasan'),
    evidenceUrl: interaction.options.getString('bukti'),
    reportedBy: interaction.user.id,
    status: 'pending',
  });
  await interaction.editReply(
    created
      ? `Laporan tersimpan dengan ID \`${id}\`, status **pending**. Moderator akan review.`
      : 'Identifier itu sudah pernah dilaporkan (atau terlalu pendek).',
  );
}

async function handleVerify(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getInteger('id', true);
  const status = interaction.options.getString('status', true) as 'verified' | 'rejected';
  const ok = await setAccountStatus(id, status, interaction.user.id);
  await interaction.editReply(
    ok ? `Laporan \`${id}\` diubah ke status **${status}**.` : `Laporan \`${id}\` tidak ditemukan.`,
  );
}

/**
 * Alat kalibrasi: tunjukkan apa yang dibaca OCR dan aturan mana yang kena,
 * supaya ambang skor bisa disetel tanpa menebak-nebak.
 */
async function handleTestImage(interaction: ChatInputCommandInteraction) {
  const attachment = interaction.options.getAttachment('gambar', true);

  if (
    !isScannableImage({
      url: attachment.url,
      contentType: attachment.contentType,
      size: attachment.size,
      name: attachment.name,
    })
  ) {
    await interaction.editReply('File itu bukan gambar yang bisa dipindai (atau terlalu besar).');
    return;
  }

  const settings = await getSettings(interaction.guildId!);
  const image = await scanImage({
    url: attachment.url,
    contentType: attachment.contentType,
    size: attachment.size,
    name: attachment.name,
  });

  if (!image) {
    await interaction.editReply('Tidak ada teks maupun QR code yang terbaca di gambar ini.');
    return;
  }

  const text = combinedText(image);
  const urlScan = await scanText(text, { useSafeBrowsing: settings.useSafeBrowsing });
  const suspiciousUrlCount = urlScan.found.length - urlScan.whitelisted.length;
  const result = analyzeScamText(text, {
    suspiciousUrlCount,
    qrCount: image.qrCodes.length,
    threshold: settings.heuristicThreshold,
  });

  const embed = new EmbedBuilder()
    .setColor(result.isScam ? 0xe23c3c : 0x35b37e)
    .setTitle(result.isScam ? '⛔ Terdeteksi sebagai scam' : '✅ Lolos ambang heuristik')
    .setThumbnail(attachment.url)
    .addFields(
      {
        name: 'Skor',
        value: `${result.score} / ${result.threshold} (severity: ${result.severity})`,
        inline: true,
      },
      {
        name: 'Confidence OCR',
        value: image.ocrText ? `${Math.round(image.confidence)}%` : 'tidak ada teks',
        inline: true,
      },
      {
        name: 'Link di gambar',
        value:
          urlScan.found.length === 0
            ? '—'
            : urlScan.found.map((u) => u.domain).slice(0, 5).join(', '),
        inline: true,
      },
      {
        name: 'QR code',
        value:
          image.qrCodes.length === 0
            ? 'Tidak ada'
            : truncate(image.qrCodes.map((qr) => `• ${describeQr(qr)}`).join('\n'), 600),
      },
      {
        name: 'Aturan yang kena',
        value:
          result.hits.length === 0
            ? 'Tidak ada'
            : truncate(
                result.hits.map((h) => `• +${h.weight} ${h.label} — \`${h.sample}\``).join('\n'),
                1000,
              ),
      },
      {
        name: 'Teks yang dianalisis',
        value: `\`\`\`\n${truncate(text || '(kosong)', 900)}\n\`\`\``,
      },
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  const s = await blacklistStats();
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3c8ce2)
        .setTitle('Statistik database')
        .addFields(
          { name: 'Domain blacklist', value: String(s.domains), inline: true },
          { name: 'Domain whitelist', value: String(s.whitelist), inline: true },
          { name: 'Akun verified', value: String(s.accountsVerified), inline: true },
          { name: 'Laporan pending', value: String(s.accountsPending), inline: true },
        ),
    ],
  });
}

export const scamguardCommand: CommandModule = { data, execute };
