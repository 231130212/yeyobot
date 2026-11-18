// Log aktivitas server ala Dyno: voice, role, nickname, member masuk/keluar.
// Channel-nya diatur per server pakai /setlog (cadangannya channel bernama #log-server atau #log-moderasi).
import { EmbedBuilder, Events } from "discord.js";
import { findLogChannel } from "../storage/settings.js";

const GREEN = 0x2ecc71;
const RED = 0xe74c3c;
const BLUE = 0x3498db;
const YELLOW = 0xf1c40f;

function findChannel(guild) {
  return findLogChannel(guild, "server");
}

/** Kirim log berformat: foto + nama di atas, keterangan, lalu ID dan jam di bawah. */
async function log(guild, user, description, color) {
  const channel = findChannel(guild);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setAuthor({ name: user.tag ?? user.username, iconURL: user.displayAvatarURL() })
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: `ID: ${user.id}` })
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch((error) => console.warn("Gagal kirim log server:", error.message));
}

export function setupServerLog(client) {
  // Ambil daftar member di awal, supaya perubahan role/nickname bisa dibandingkan sebelum-sesudahnya
  client.once(Events.ClientReady, async (c) => {
    for (const guild of c.guilds.cache.values()) {
      await guild.members.fetch().catch((error) => console.warn(`Gagal ambil member ${guild.name}:`, error.message));
    }
  });

  // ===== Voice =====
  client.on(Events.VoiceStateUpdate, async (before, after) => {
    if (before.channelId === after.channelId) return; // cuma mute/deafen/stream, dilewati
    const member = after.member ?? before.member;
    if (!member) return;

    if (!before.channelId) {
      await log(after.guild, member.user, `${member} masuk voice channel 🔊 <#${after.channelId}>`, GREEN);
    } else if (!after.channelId) {
      await log(after.guild, member.user, `${member} keluar dari voice channel 🔊 <#${before.channelId}>`, RED);
    } else {
      await log(
        after.guild,
        member.user,
        `${member} pindah voice channel 🔊 <#${before.channelId}> → 🔊 <#${after.channelId}>`,
        BLUE,
      );
    }
  });

  // ===== Member masuk/keluar =====
  client.on(Events.GuildMemberAdd, async (member) => {
    const age = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
    const note = age < 7 ? `\n⚠️ Akunnya baru dibuat ${age} hari lalu` : "";
    await log(member.guild, member.user, `${member} masuk server${note}`, GREEN);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await log(member.guild, member.user, `${member} (**${member.user.username}**) keluar dari server`, RED);
  });

  // ===== Role dan nickname =====
  client.on(Events.GuildMemberUpdate, async (before, after) => {
    if (before.partial) return; // data lama nggak ada, nggak bisa dibandingkan

    const added = after.roles.cache.filter((r) => !before.roles.cache.has(r.id));
    const removed = before.roles.cache.filter((r) => !after.roles.cache.has(r.id));
    for (const role of added.values()) {
      await log(after.guild, after.user, `${after} ditambahkan ke role \`${role.name}\``, BLUE);
    }
    for (const role of removed.values()) {
      await log(after.guild, after.user, `${after} dikeluarkan dari role \`${role.name}\``, BLUE);
    }

    if (before.nickname !== after.nickname) {
      await log(
        after.guild,
        after.user,
        `${after} ganti nickname\n**Sebelum:** ${before.nickname ?? "(nggak ada)"}\n**Sesudah:** ${after.nickname ?? "(nggak ada)"}`,
        YELLOW,
      );
    }
  });
}
