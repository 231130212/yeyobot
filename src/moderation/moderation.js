// Moderasi server: /timeout, /untimeout, /kick, /ban, /unban, /hapus + log ke channel khusus
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, Events, ChannelType } from "discord.js";
import { findLogChannel as findChannel, setLogChannel } from "../storage/settings.js";
import { cacheImages, takeImages } from "./imagecache.js";

const DURATIONS = [
  { name: "1 menit", value: 60 },
  { name: "5 menit", value: 5 * 60 },
  { name: "10 menit", value: 10 * 60 },
  { name: "1 jam", value: 60 * 60 },
  { name: "1 hari", value: 24 * 60 * 60 },
  { name: "1 minggu", value: 7 * 24 * 60 * 60 },
];

const DELETE_HISTORY = [
  { name: "Jangan hapus", value: 0 },
  { name: "1 jam terakhir", value: 60 * 60 },
  { name: "1 hari terakhir", value: 24 * 60 * 60 },
  { name: "7 hari terakhir", value: 7 * 24 * 60 * 60 },
];

const targetOption = (o) => o.setName("target").setDescription("Siapa?").setRequired(true);
const reasonOption = (o) => o.setName("alasan").setDescription("Alasannya (opsional)").setMaxLength(300);

// setDefaultMemberPermissions: command hanya muncul untuk orang yang punya izin tersebut
export const moderationCommands = [
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Bisukan member untuk sementara")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(targetOption)
    .addIntegerOption((o) =>
      o.setName("durasi").setDescription("Berapa lama?").setRequired(true).addChoices(...DURATIONS),
    )
    .addStringOption(reasonOption),
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Cabut timeout seseorang")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(targetOption)
    .addStringOption(reasonOption),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Keluarkan member dari server (masih bisa join lagi)")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(targetOption)
    .addStringOption(reasonOption),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban seseorang dari server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(targetOption)
    .addStringOption(reasonOption)
    .addIntegerOption((o) =>
      o.setName("hapus_pesan").setDescription("Hapus juga pesan-pesannya?").addChoices(...DELETE_HISTORY),
    ),
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Cabut ban seseorang")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName("user_id").setDescription("ID user yang mau di-unban (klik kanan user → Copy User ID)").setRequired(true),
    )
    .addStringOption(reasonOption),
  new SlashCommandBuilder()
    .setName("hapus")
    .setDescription("Hapus banyak pesan sekaligus di channel ini")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName("jumlah").setDescription("Berapa pesan? (1-100)").setRequired(true).setMinValue(1).setMaxValue(100),
    ),
  new SlashCommandBuilder()
    .setName("setlog")
    .setDescription("Atur channel tempat bot ngirim log di server ini")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel log-nya (kosongkan = hapus pengaturan, balik ke default)")
        .addChannelTypes(ChannelType.GuildText),
    )
    .addStringOption((o) =>
      o
        .setName("jenis")
        .setDescription("Log yang mana? (default: semua)")
        .addChoices(
          { name: "Semua log", value: "semua" },
          { name: "Moderasi (pesan dihapus/diedit, kick, ban, dll.)", value: "moderasi" },
          { name: "Aktivitas server (voice, role, nickname, member masuk/keluar)", value: "server" },
        ),
    ),
].map((command) => command.toJSON());

// ===== Bantuan =====

/** Pesan yang cuma bisa dilihat oleh orang yang menjalankan command */
function privateReply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.deferred) return interaction.editReply(content);
  if (interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

function auditReason(interaction, reason) {
  return `${reason ?? "Tanpa alasan"} (oleh ${interaction.user.username})`;
}

function nameOf(member, user) {
  return member?.displayName ?? user.displayName ?? user.username;
}

function findLogChannel(guild) {
  return findChannel(guild, "moderasi");
}

async function sendLog(guild, embed, files = []) {
  const channel = findLogChannel(guild);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed], files });
  } catch (error) {
    console.warn("Gagal kirim log:", error.message);
    // Biasanya karena bot nggak punya izin Attach Files: kirim ulang tanpa gambar biar log-nya tetap ada
    if (files.length) {
      embed.setImage(null).setFooter({ text: "Gambar nggak bisa dilampirkan (cek izin Attach Files bot)" });
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

function logAction(interaction, title, description, color) {
  return sendLog(
    interaction.guild,
    new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setFooter({ text: `Oleh ${interaction.user.username}` })
      .setTimestamp(),
  );
}

const cut = (text, max = 1000) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * Cek apakah target boleh ditindak. Mengembalikan pesan penolakan, atau null kalau aman.
 * @param botCan hasil cek kemampuan bot (member.moderatable / kickable / bannable)
 */
function checkTarget(interaction, user, member, botCan) {
  const { guild } = interaction;
  if (user.id === interaction.user.id) return "Mau nindak diri sendiri? Healing dulu sana, jangan gini caranya.";
  if (user.id === interaction.client.user.id) return "Nice try. Gue nggak bisa ditindak sama diri gue sendiri.";
  if (user.id === guild.ownerId) return "Itu owner server. Kudeta nggak gini caranya.";
  if (!member) return null; // user sudah tidak ada di server (masih bisa di-ban)

  const isOwner = interaction.user.id === guild.ownerId;
  if (!isOwner && interaction.member.roles.highest.position <= member.roles.highest.position) {
    return "Role dia setara atau lebih tinggi dari lo. Nggak bisa, bos.";
  }
  if (!botCan) {
    return (
      "Gue nggak punya kuasa atas dia. Pastikan role gue ada di atas role dia " +
      "(Server Settings → Roles, seret role bot ke atas) dan gue punya izin yang dibutuhkan."
    );
  }
  return null;
}

// ===== Handler tiap command =====

const HANDLERS = {
  async timeout(interaction) {
    const user = interaction.options.getUser("target", true);
    const member = interaction.options.getMember("target");
    const seconds = interaction.options.getInteger("durasi", true);
    const reason = interaction.options.getString("alasan");
    if (!member) return privateReply(interaction, "Orangnya nggak ada di server ini.");

    const problem = checkTarget(interaction, user, member, member.moderatable);
    if (problem) return privateReply(interaction, problem);

    await member.timeout(seconds * 1000, auditReason(interaction, reason));
    const label = DURATIONS.find((d) => d.value === seconds)?.name ?? `${seconds} detik`;
    const name = nameOf(member, user);
    await interaction.reply(
      `🔇 **${name}** di-timeout ${label}.${reason ? ` Alasan: ${reason}.` : ""} Silakan renungkan hidup sejenak.`,
    );
    await logAction(interaction, "🔇 Timeout", `**${name}** (${user.id}) selama ${label}\nAlasan: ${reason ?? "-"}`, 0xf1c40f);
  },

  async untimeout(interaction) {
    const user = interaction.options.getUser("target", true);
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("alasan");
    if (!member) return privateReply(interaction, "Orangnya nggak ada di server ini.");
    if (!member.isCommunicationDisabled()) return privateReply(interaction, "Dia lagi nggak di-timeout kok.");

    const problem = checkTarget(interaction, user, member, member.moderatable);
    if (problem) return privateReply(interaction, problem);

    await member.timeout(null, auditReason(interaction, reason));
    const name = nameOf(member, user);
    await interaction.reply(`🔊 **${name}** udah boleh ngomong lagi. Jangan diulangi ya.`);
    await logAction(interaction, "🔊 Timeout dicabut", `**${name}** (${user.id})\nAlasan: ${reason ?? "-"}`, 0x2ecc71);
  },

  async kick(interaction) {
    const user = interaction.options.getUser("target", true);
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("alasan");
    if (!member) return privateReply(interaction, "Orangnya nggak ada di server ini.");

    const problem = checkTarget(interaction, user, member, member.kickable);
    if (problem) return privateReply(interaction, problem);

    // Kabari lewat DM dulu (setelah di-kick, bot tidak bisa DM lagi). Gagal juga tidak apa-apa.
    await user
      .send(`Kamu dikeluarkan dari server **${interaction.guild.name}**.${reason ? ` Alasan: ${reason}` : ""}`)
      .catch(() => {});
    await member.kick(auditReason(interaction, reason));
    const name = nameOf(member, user);
    await interaction.reply(`👢 **${name}** ditendang keluar.${reason ? ` Alasan: ${reason}.` : ""} Pintu masih terbuka kalau mau tobat.`);
    await logAction(interaction, "👢 Kick", `**${name}** (${user.id})\nAlasan: ${reason ?? "-"}`, 0xe67e22);
  },

  async ban(interaction) {
    const user = interaction.options.getUser("target", true);
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("alasan");
    const deleteSeconds = interaction.options.getInteger("hapus_pesan") ?? 0;

    const problem = checkTarget(interaction, user, member, member?.bannable ?? true);
    if (problem) return privateReply(interaction, problem);

    if (member) {
      await user
        .send(`Kamu di-ban dari server **${interaction.guild.name}**.${reason ? ` Alasan: ${reason}` : ""}`)
        .catch(() => {});
    }
    await interaction.guild.members.ban(user, {
      reason: auditReason(interaction, reason),
      deleteMessageSeconds: deleteSeconds,
    });
    const name = nameOf(member, user);
    await interaction.reply(`🔨 **${name}** di-ban.${reason ? ` Alasan: ${reason}.` : ""} Sayonara.`);
    await logAction(interaction, "🔨 Ban", `**${name}** (${user.id})\nAlasan: ${reason ?? "-"}`, 0xe74c3c);
  },

  async unban(interaction) {
    const userId = interaction.options.getString("user_id", true).trim();
    const reason = interaction.options.getString("alasan");
    if (!/^\d{17,20}$/.test(userId)) {
      return privateReply(interaction, "Itu bukan ID user yang valid. Isinya harus angka panjang, contoh: 123456789012345678.");
    }
    try {
      const user = await interaction.guild.bans.remove(userId, auditReason(interaction, reason));
      const name = user?.username ?? userId;
      await interaction.reply(`🕊️ **${name}** udah di-unban. Semoga kali ini lebih waras.`);
      await logAction(interaction, "🕊️ Unban", `**${name}** (${userId})\nAlasan: ${reason ?? "-"}`, 0x3498db);
    } catch (error) {
      if (error.code === 10026) return privateReply(interaction, "User itu nggak ada di daftar ban.");
      if (error.code === 10013) return privateReply(interaction, "User dengan ID itu nggak ditemukan.");
      throw error;
    }
  },

  async hapus(interaction) {
    const amount = interaction.options.getInteger("jumlah", true);
    if (!interaction.appPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return privateReply(interaction, "Gue nggak punya izin *Manage Messages* di channel ini.");
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // true = lewati pesan yang lebih tua dari 14 hari (Discord tidak mengizinkan hapus massal untuk itu)
    const deleted = await interaction.channel.bulkDelete(amount, true);
    let text = `🧹 Beres, ${deleted.size} pesan dihapus.`;
    if (deleted.size < amount) {
      text += " Sisanya mungkin lebih tua dari 14 hari (Discord nggak izinin hapus massal untuk itu), atau pesannya memang nggak sebanyak itu.";
    }
    await interaction.editReply(text);
    await logAction(interaction, "🧹 Hapus pesan", `${deleted.size} pesan di <#${interaction.channelId}>`, 0x95a5a6);
  },

  async setlog(interaction) {
    const channel = interaction.options.getChannel("channel");
    const kind = interaction.options.getString("jenis") ?? "semua";
    const kinds = kind === "semua" ? ["moderasi", "server"] : [kind];
    const label = { semua: "Semua log", moderasi: "Log moderasi", server: "Log aktivitas server" }[kind];

    if (channel) {
      const perms = channel.permissionsFor(interaction.guild.members.me);
      if (!perms?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
        return privateReply(
          interaction,
          `Gue nggak bisa nulis di ${channel}. Kasih gue izin *View Channel*, *Send Messages*, dan *Embed Links* di sana dulu.`,
        );
      }
      if (!perms.has("AttachFiles") && kinds.includes("moderasi")) {
        for (const k of kinds) setLogChannel(interaction.guildId, k, channel.id);
        return privateReply(
          interaction,
          `✅ ${label} sekarang dikirim ke ${channel}. Tapi gue belum punya izin *Attach Files* di sana, jadi gambar dari pesan yang dihapus nggak bisa ikut ditampilin.`,
        );
      }
    }
    for (const k of kinds) setLogChannel(interaction.guildId, k, channel?.id ?? null);
    return privateReply(
      interaction,
      channel
        ? `✅ ${label} sekarang dikirim ke ${channel}.`
        : `✅ Pengaturan ${label.toLowerCase()} dihapus. Gue balik nyari channel bernama #log-moderasi / #log-server.`,
    );
  },
};

/** Jalankan command moderasi. Mengembalikan true kalau command-nya memang command moderasi. */
export async function handleModeration(interaction) {
  const handler = HANDLERS[interaction.commandName];
  if (!handler) return false;

  if (!interaction.inCachedGuild()) {
    await privateReply(interaction, "Command ini cuma bisa dipakai di server.");
    return true;
  }
  try {
    await handler(interaction);
  } catch (error) {
    console.error(`Gagal menjalankan /${interaction.commandName}:`, error);
    const hint = error.code === 50013 ? " Gue kurang izin buat ngelakuin itu." : "";
    await privateReply(interaction, `Gagal: ${error.message}.${hint}`).catch(() => {});
  }
  return true;
}

/** Catat pesan yang dihapus dan diedit ke channel log. */
export function setupLogging(client) {
  // Simpan salinan gambar duluan, karena begitu pesannya dihapus gambarnya ikut hilang dari Discord.
  // Cuma di server yang punya channel log, biar nggak buang-buang storage.
  client.on(Events.MessageCreate, (message) => {
    if (!message.guild || message.author.bot || !message.attachments.size) return;
    const logChannel = findLogChannel(message.guild);
    if (logChannel && logChannel.id !== message.channelId) cacheImages(message);
  });

  client.on(Events.MessageDelete, async (message) => {
    // Pesan yang dikirim sebelum bot nyala tidak diketahui isinya, jadi dilewati
    if (message.partial || !message.guild || message.author?.bot) return;
    if (findLogChannel(message.guild)?.id === message.channelId) return; // jangan nge-log channel log itu sendiri

    const images = await takeImages(message.id);
    const parts = [];
    if (message.content) parts.push(cut(message.content));
    if (message.attachments.size) parts.push(`📎 ${message.attachments.map((a) => a.name).join(", ")}`);

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Pesan dihapus")
      .setDescription(`**${message.author.username}** di <#${message.channelId}>\n\n${parts.join("\n") || "(kosong)"}`)
      .setColor(0xe74c3c)
      .setTimestamp();
    // Gambar pertama tampil di dalam kotak log, sisanya ikut dilampirkan di bawahnya
    if (images.length) embed.setImage(`attachment://${images[0].name}`);

    await sendLog(
      message.guild,
      embed,
      images.map((file) => ({ attachment: file.path, name: file.name })),
    );
  });

  client.on(Events.MessageUpdate, async (before, after) => {
    if (before.partial || !after.guild || after.author?.bot) return;
    if (before.content === after.content) return; // misalnya cuma embed link yang berubah

    await sendLog(
      after.guild,
      new EmbedBuilder()
        .setTitle("✏️ Pesan diedit")
        .setDescription(`**${after.author.username}** di <#${after.channelId}> · [lihat pesan](${after.url})`)
        .addFields(
          { name: "Sebelum", value: cut(before.content || "(kosong)") },
          { name: "Sesudah", value: cut(after.content || "(kosong)") },
        )
        .setColor(0xf39c12)
        .setTimestamp(),
    );
  });
}
