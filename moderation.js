// Moderasi server: /timeout, /untimeout, /kick, /ban, /unban, /hapus + log ke channel khusus
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, Events } from "discord.js";

// Nama channel tempat log moderasi dikirim. Kalau channel-nya tidak ada, log dilewati saja.
const LOG_CHANNEL = process.env.LOG_CHANNEL ?? "log-moderasi";

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
  return guild.channels.cache.find((c) => c.name === LOG_CHANNEL && c.isTextBased());
}

async function sendLog(guild, embed) {
  const channel = findLogChannel(guild);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch((error) => console.warn("Gagal kirim log:", error.message));
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
  client.on(Events.MessageDelete, async (message) => {
    // Pesan yang dikirim sebelum bot nyala tidak diketahui isinya, jadi dilewati
    if (message.partial || !message.guild || message.author?.bot) return;
    if (message.channel.name === LOG_CHANNEL) return;

    const parts = [];
    if (message.content) parts.push(cut(message.content));
    if (message.attachments.size) parts.push(`📎 ${message.attachments.map((a) => a.name).join(", ")}`);

    await sendLog(
      message.guild,
      new EmbedBuilder()
        .setTitle("🗑️ Pesan dihapus")
        .setDescription(`**${message.author.username}** di <#${message.channelId}>\n\n${parts.join("\n") || "(kosong)"}`)
        .setColor(0xe74c3c)
        .setTimestamp(),
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
