// Giveaway: /giveaway mulai, akhiri, reroll, batal. Peserta ikut lewat tombol 🎉.
// Data disimpan ke file supaya giveaway tetap jalan walau bot restart.
// Defaultnya cuma yang punya izin "Manage Server" yang bisa pakai. Admin bisa ngasih akses ke role staff
// lewat Server Settings → Integrations → (bot ini) → /giveaway.
import fs from "node:fs";
import path from "node:path";
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  Events,
} from "discord.js";

const FILE = process.env.GIVEAWAY_FILE ?? "data/giveaways.json";
const CHECK_EVERY_MS = 15_000; // seberapa sering cek giveaway yang udah waktunya selesai
const KEEP_ENDED_MS = 7 * 24 * 60 * 60 * 1000; // giveaway selesai disimpan 7 hari (buat reroll)
const MIN_MS = 60 * 1000;
const MAX_MS = 30 * 24 * 60 * 60 * 1000;
const BUTTON_ID = "giveaway-join";
const COLOR = 0xf5a623;
const COLOR_ENDED = 0x2f3136;

export const giveawayCommands = [
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Bikin dan atur giveaway (khusus staff)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("mulai")
        .setDescription("Mulai giveaway baru")
        .addStringOption((o) => o.setName("hadiah").setDescription("Hadiahnya apa?").setRequired(true).setMaxLength(200))
        .addStringOption((o) =>
          o.setName("durasi").setDescription("Berapa lama? Contoh: 30m, 2h, 1d, 1d12h (1 menit - 30 hari)").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("pemenang").setDescription("Jumlah pemenang (default 1)").setMinValue(1).setMaxValue(20),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Diumumin di mana? (default: channel ini)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((o) => o.setName("syarat_role").setDescription("Cuma yang punya role ini yang boleh ikut"))
        .addStringOption((o) => o.setName("keterangan").setDescription("Info tambahan (opsional)").setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName("akhiri")
        .setDescription("Akhiri giveaway sekarang dan undi pemenangnya")
        .addStringOption((o) => o.setName("giveaway").setDescription("Giveaway yang mana?").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("reroll")
        .setDescription("Undi ulang pemenang giveaway yang udah selesai")
        .addStringOption((o) => o.setName("giveaway").setDescription("Giveaway yang mana?").setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) =>
          o.setName("jumlah").setDescription("Berapa pemenang baru? (default sama kayak awal)").setMinValue(1).setMaxValue(20),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("batal")
        .setDescription("Batalin giveaway tanpa pemenang")
        .addStringOption((o) => o.setName("giveaway").setDescription("Giveaway yang mana?").setRequired(true).setAutocomplete(true)),
    ),
].map((command) => command.toJSON());

// ===== Penyimpanan =====

/** { [messageId]: { guildId, channelId, messageId, prize, description, winners, endsAt, hostId, roleId, entrants: [], ended, cancelled, winnerIds: [] } } */
const giveaways = load();

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Gagal membaca ${FILE}:`, error.message);
    return {};
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(giveaways));
    fs.renameSync(tmp, FILE);
  } catch (error) {
    console.error("Gagal menyimpan giveaway:", error.message);
  }
}

// ===== Bantuan =====

/** "1d12h30m" → milidetik. Return null kalau formatnya salah. */
export function parseDuration(text) {
  const clean = text.toLowerCase().replace(/\s+/g, "");
  if (!/^(\d+(d|h|m|s|hari|jam|menit|detik))+$/.test(clean)) return null;
  const units = { d: 86_400_000, hari: 86_400_000, h: 3_600_000, jam: 3_600_000, m: 60_000, menit: 60_000, s: 1000, detik: 1000 };
  let total = 0;
  for (const [, amount, unit] of clean.matchAll(/(\d+)(hari|jam|menit|detik|d|h|m|s)/g)) total += Number(amount) * units[unit];
  return total;
}

function pickWinners(entrants, count) {
  const pool = [...entrants];
  const winners = [];
  while (pool.length && winners.length < count) {
    winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return winners;
}

function giveawayEmbed(g) {
  const lines = [];
  if (g.description) lines.push(g.description, "");
  if (g.cancelled) {
    lines.push("❌ **Giveaway dibatalin.**");
  } else if (g.ended) {
    lines.push(
      g.winnerIds.length
        ? `🏆 **Pemenang:** ${g.winnerIds.map((id) => `<@${id}>`).join(", ")}`
        : "😶 Nggak ada pemenang, soalnya nggak ada yang ikut.",
    );
    lines.push(`Selesai <t:${Math.floor(g.endsAt / 1000)}:R>`);
  } else {
    lines.push(`Klik tombol 🎉 di bawah buat ikut. Klik lagi buat batal ikut.`);
    lines.push(`Berakhir <t:${Math.floor(g.endsAt / 1000)}:R> (<t:${Math.floor(g.endsAt / 1000)}:f>)`);
  }
  lines.push("");
  lines.push(`🎟️ Peserta: **${g.entrants.length}** · 🏆 Pemenang: **${g.winners}**`);
  if (g.roleId) lines.push(`🔒 Khusus yang punya role <@&${g.roleId}>`);
  lines.push(`Diadain sama <@${g.hostId}>`);

  return new EmbedBuilder()
    .setTitle(`🎁 ${g.prize}`)
    .setDescription(lines.join("\n"))
    .setColor(g.ended || g.cancelled ? COLOR_ENDED : COLOR)
    .setFooter({ text: g.ended || g.cancelled ? "Giveaway selesai" : "Giveaway" })
    .setTimestamp(g.endsAt);
}

function giveawayButtons(g) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BUTTON_ID)
        .setEmoji("🎉")
        .setLabel(g.ended || g.cancelled ? "Udah selesai" : "Ikut")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(g.ended || g.cancelled)),
    ),
  ];
}

async function fetchMessage(client, g) {
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  const message = await channel?.messages.fetch(g.messageId).catch(() => null);
  return { channel, message };
}

async function refreshMessage(client, g) {
  const { message } = await fetchMessage(client, g);
  await message?.edit({ embeds: [giveawayEmbed(g)], components: giveawayButtons(g) }).catch(() => {});
}

// Jumlah peserta di pesan di-update paling sering tiap 5 detik, biar nggak kena rate limit kalau rame
const pendingRefresh = new Map();
function scheduleRefresh(client, g) {
  if (pendingRefresh.has(g.messageId)) return;
  pendingRefresh.set(
    g.messageId,
    setTimeout(() => {
      pendingRefresh.delete(g.messageId);
      refreshMessage(client, g);
    }, 5000),
  );
}

async function endGiveaway(client, g) {
  if (g.ended || g.cancelled) return;
  g.ended = true;
  g.endsAt = Math.min(g.endsAt, Date.now());
  g.winnerIds = pickWinners(g.entrants, g.winners);
  save();

  const { channel, message } = await fetchMessage(client, g);
  await message?.edit({ embeds: [giveawayEmbed(g)], components: giveawayButtons(g) }).catch(() => {});
  if (!channel) return;

  const content = g.winnerIds.length
    ? `🎉 Selamat ${g.winnerIds.map((id) => `<@${id}>`).join(", ")}! Lo menang **${g.prize}**. Hubungi <@${g.hostId}> buat ambil hadiahnya.\n` +
      `Yang belum menang, sabar. Hoki itu kayak sinyal di basement, kadang ada kadang nggak.`
    : `Giveaway **${g.prize}** selesai, tapi nggak ada yang ikut. Sepi banget, kayak kolom komentar mantan.`;
  await channel
    .send({
      content,
      allowedMentions: { users: g.winnerIds }, // cuma pemenang yang ke-ping
      ...(message ? { reply: { messageReference: message.id, failIfNotExists: false } } : {}),
    })
    .catch((error) => console.warn("Gagal umumin pemenang giveaway:", error.message));
}

function cleanupOld() {
  let changed = false;
  for (const [id, g] of Object.entries(giveaways)) {
    if ((g.ended || g.cancelled) && Date.now() - g.endsAt > KEEP_ENDED_MS) {
      delete giveaways[id];
      changed = true;
    }
  }
  if (changed) save();
}

/** Giveaway di server ini yang cocok dengan subcommand (aktif buat akhiri/batal, selesai buat reroll). */
function listFor(guildId, sub) {
  return Object.values(giveaways)
    .filter((g) => g.guildId === guildId && !g.cancelled && (sub === "reroll" ? g.ended : !g.ended))
    .sort((a, b) => b.endsAt - a.endsAt);
}

function findGiveaway(guildId, value) {
  const g = giveaways[value];
  return g?.guildId === guildId ? g : null;
}

// ===== Handler =====

export function setupGiveaways(client) {
  const tick = async () => {
    for (const g of Object.values(giveaways)) {
      if (!g.ended && !g.cancelled && g.endsAt <= Date.now()) {
        await endGiveaway(client, g).catch((error) => console.error("Gagal ngakhirin giveaway:", error));
      }
    }
    cleanupOld();
  };
  // Mulai setelah bot siap, termasuk ngakhirin giveaway yang waktunya habis selama bot mati
  client.once(Events.ClientReady, () => {
    tick();
    setInterval(tick, CHECK_EVERY_MS);
  });
}

export async function handleGiveawayAutocomplete(interaction) {
  if (interaction.commandName !== "giveaway") return false;
  const sub = interaction.options.getSubcommand();
  const query = interaction.options.getFocused().toLowerCase();
  const choices = listFor(interaction.guildId, sub)
    .filter((g) => g.prize.toLowerCase().includes(query))
    .slice(0, 25)
    .map((g) => {
      const when = g.ended ? "selesai" : `${g.entrants.length} peserta`;
      return { name: `${g.prize} (${when})`.slice(0, 100), value: g.messageId };
    });
  await interaction.respond(choices).catch(() => {});
  return true;
}

/** Return true kalau ini command /giveaway atau tombol giveaway. */
export async function handleGiveaway(interaction) {
  if (interaction.isButton() && interaction.customId === BUTTON_ID) {
    await handleJoin(interaction);
    return true;
  }
  if (!interaction.isChatInputCommand() || interaction.commandName !== "giveaway") return false;
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: "Giveaway cuma bisa di server.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "mulai") await handleStart(interaction);
    else await handleManage(interaction, sub);
  } catch (error) {
    console.error(`Gagal /giveaway ${sub}:`, error);
    const payload = { content: `Gagal: ${error.message}`, flags: MessageFlags.Ephemeral };
    await (interaction.deferred || interaction.replied ? interaction.followUp(payload) : interaction.reply(payload)).catch(() => {});
  }
  return true;
}

async function handleStart(interaction) {
  const ms = parseDuration(interaction.options.getString("durasi", true));
  if (!ms || ms < MIN_MS || ms > MAX_MS) {
    await interaction.reply({
      content: "Durasinya nggak valid. Pakai format kayak `30m`, `2h`, `1d`, atau `1d12h`, antara 1 menit sampai 30 hari.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.options.getChannel("channel") ?? interaction.channel;
  const perms = channel.permissionsFor(interaction.guild.members.me);
  if (!perms?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
    await interaction.reply({
      content: `Gue nggak bisa kirim pesan di ${channel}. Kasih gue izin *View Channel*, *Send Messages*, dan *Embed Links* dulu.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole("syarat_role");
  const g = {
    guildId: interaction.guildId,
    channelId: channel.id,
    messageId: null,
    prize: interaction.options.getString("hadiah", true),
    description: interaction.options.getString("keterangan"),
    winners: interaction.options.getInteger("pemenang") ?? 1,
    endsAt: Date.now() + ms,
    hostId: interaction.user.id,
    roleId: role && role.id !== interaction.guildId ? role.id : null, // @everyone = nggak ada syarat
    entrants: [],
    ended: false,
    cancelled: false,
    winnerIds: [],
  };

  const message = await channel.send({ embeds: [giveawayEmbed(g)], components: giveawayButtons(g), allowedMentions: { parse: [] } });
  g.messageId = message.id;
  giveaways[message.id] = g;
  save();

  await interaction.reply({
    content: `✅ Giveaway **${g.prize}** udah dimulai di ${channel}. [Lihat](${message.url})`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleManage(interaction, sub) {
  const g = findGiveaway(interaction.guildId, interaction.options.getString("giveaway", true));
  if (!g) {
    await interaction.reply({
      content: "Giveaway-nya nggak ketemu. Pilih dari daftar yang muncul waktu ngetik ya.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "akhiri") {
    if (g.ended || g.cancelled) {
      await interaction.reply({ content: "Giveaway itu udah selesai.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await endGiveaway(interaction.client, g);
    await interaction.editReply(`✅ Giveaway **${g.prize}** diakhiri. ${g.winnerIds.length} pemenang udah diumumin.`);
    return;
  }

  if (sub === "batal") {
    if (g.ended || g.cancelled) {
      await interaction.reply({ content: "Giveaway itu udah selesai, nggak bisa dibatalin.", flags: MessageFlags.Ephemeral });
      return;
    }
    g.cancelled = true;
    g.endsAt = Date.now();
    save();
    await refreshMessage(interaction.client, g);
    await interaction.reply({ content: `🗑️ Giveaway **${g.prize}** dibatalin.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // reroll
  if (!g.ended) {
    await interaction.reply({ content: "Giveaway itu belum selesai. Pakai `/giveaway akhiri` dulu.", flags: MessageFlags.Ephemeral });
    return;
  }
  const count = interaction.options.getInteger("jumlah") ?? g.winners;
  const pool = g.entrants.filter((id) => !g.winnerIds.includes(id)); // jangan menangin orang yang sama lagi
  const newWinners = pickWinners(pool, count);
  if (!newWinners.length) {
    await interaction.reply({ content: "Nggak ada peserta lain yang bisa diundi.", flags: MessageFlags.Ephemeral });
    return;
  }
  g.winnerIds = [...g.winnerIds, ...newWinners];
  save();
  await refreshMessage(interaction.client, g);
  await interaction.reply({
    content: `🔁 Undian ulang **${g.prize}**: selamat ${newWinners.map((id) => `<@${id}>`).join(", ")}! Hubungi <@${g.hostId}> buat ambil hadiahnya.`,
    allowedMentions: { users: newWinners },
  });
}

async function handleJoin(interaction) {
  const g = giveaways[interaction.message.id];
  if (!g || g.ended || g.cancelled) {
    await interaction.reply({ content: "Giveaway ini udah selesai.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.bot) return;
  if (g.roleId && !interaction.member?.roles?.cache?.has(g.roleId)) {
    await interaction.reply({
      content: `Giveaway ini khusus yang punya role <@&${g.roleId}>. Lo belum punya, sabar ya.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const index = g.entrants.indexOf(interaction.user.id);
  if (index === -1) g.entrants.push(interaction.user.id);
  else g.entrants.splice(index, 1);
  save();
  scheduleRefresh(interaction.client, g);

  await interaction.reply({
    content:
      index === -1
        ? `🎉 Lo udah ikut giveaway **${g.prize}**. Semoga hoki, walau biasanya nggak.`
        : `Lo keluar dari giveaway **${g.prize}**. Menyerah sebelum diundi, menarik.`,
    flags: MessageFlags.Ephemeral,
  });
}
