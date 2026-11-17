import "./load-env.js"; // harus paling atas
import { Client, Events, GatewayIntentBits, Partials, ChannelType } from "discord.js";
import { askAI, checkConfig, describeModel, errorReply } from "./ai.js";
import * as memory from "./memory.js";
import { commands, buildPrompt, avatarReply, spamReply, specialUsers, tagName } from "./commands.js";
import { moderationCommands, handleModeration, setupLogging } from "./moderation.js";
import { setupServerLog } from "./serverlog.js";
import { musicCommands, handleMusic, handleMusicAutocomplete, setupMusic, stopAllMusic } from "./music.js";

const ALL_COMMANDS = [...commands, ...moderationCommands, ...musicCommands];

// ===== Pengaturan =====
// Nama channel tempat bot membalas SEMUA pesan tanpa perlu di-mention (kosongkan kalau tidak mau)
const FREE_CHAT_CHANNEL = process.env.FREE_CHAT_CHANNEL ?? "ngobrol-sama-bot";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per gambar
// Balasan AI nggak boleh nge-ping siapa pun (termasuk @everyone), kecuali notif "membalas" ke pengirim
const NO_PINGS = { parse: [], repliedUser: true };

for (const problem of [process.env.DISCORD_TOKEN ? null : "DISCORD_TOKEN belum diisi", checkConfig()]) {
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
}

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers, // untuk log role/nickname/member masuk-keluar (wajib nyalakan Server Members Intent)
    GatewayIntentBits.GuildVoiceStates, // untuk fitur radio
    GatewayIntentBits.GuildPresences, // untuk baca status Spotify/game (wajib nyalakan Presence Intent di portal)
  ],
  partials: [Partials.Channel], // dibutuhkan supaya bot bisa menerima DM
});

// ===== Bantuan =====

/** Antrian per channel supaya balasan tidak saling tumpang tindih */
const queues = new Map();
function enqueue(channelId, task) {
  const prev = queues.get(channelId) ?? Promise.resolve();
  const next = prev.then(task, task);
  queues.set(channelId, next.catch(() => {}));
  return next;
}

/** Discord membatasi 2000 karakter per pesan, jadi pecah kalau kepanjangan. */
function splitMessage(text, limit = 1900) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Ambil gambar dari lampiran pesan dan ubah ke base64. */
async function collectImages(message) {
  const attachments = [...message.attachments.values()]
    .filter((a) => IMAGE_TYPES.has(a.contentType?.split(";")[0]) && a.size <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES);

  const images = [];
  for (const attachment of attachments) {
    try {
      const res = await fetch(attachment.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer()).toString("base64");
      images.push({ mediaType: attachment.contentType.split(";")[0], data });
    } catch (error) {
      console.warn(`Gagal mengunduh gambar ${attachment.name}:`, error.message);
    }
  }
  return images;
}

/**
 * Alur utama: simpan pesan user, minta jawaban AI, simpan jawaban, kirim ke Discord.
 * Gambar hanya dikirim ke AI untuk pesan ini; di ingatan cukup dicatat sebagai teks.
 */
function respond(channelId, userText, images, send, beforeAsk) {
  return enqueue(channelId, async () => {
    memory.addMessage(channelId, "user", userText);
    try {
      await beforeAsk?.();
      const reply = await askAI(memory.getHistory(channelId), images);
      memory.addMessage(channelId, "assistant", reply);
      await send(reply);
    } catch (error) {
      memory.removeLast(channelId, userText); // supaya ingatan tetap rapi
      await send(errorReply(error)).catch(() => {});
    }
  });
}

async function registerCommands(guild) {
  try {
    await guild.commands.set(ALL_COMMANDS);
  } catch (error) {
    console.error(`Gagal mendaftarkan slash command di server ${guild.name}:`, error.message);
  }
}

// ===== Event Discord =====

discord.once(Events.ClientReady, async (c) => {
  console.log(`Bot online sebagai ${c.user.tag} (otak: ${describeModel()})`);
  // Pembuat bot otomatis masuk daftar "jangan dikasarin"
  try {
    const app = await c.application.fetch();
    const owners = app.owner?.members ? [...app.owner.members.keys()] : [app.owner?.id];
    for (const id of owners) if (id) specialUsers.add(id);
  } catch (error) {
    console.warn("Gagal cek pembuat bot:", error.message);
  }
  // Daftar per server supaya slash command langsung muncul
  await Promise.all(c.guilds.cache.map(registerCommands));
  console.log(`Slash command terdaftar di ${c.guilds.cache.size} server`);
});

// Kalau bot diundang ke server baru, langsung daftarkan slash command di sana
discord.on(Events.GuildCreate, registerCommands);

// Log pesan yang dihapus/diedit ke channel #log-moderasi
setupLogging(discord);
setupMusic(discord);
setupServerLog(discord);

discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.users.has(discord.user.id);
  const isFreeChat = FREE_CHAT_CHANNEL && message.channel.name === FREE_CHAT_CHANNEL;
  if (!isDM && !isMentioned && !isFreeChat) return;

  // Hapus mention bot dari teks, dan ubah mention orang/role lain jadi nama biasa.
  // Jadi AI nggak pernah lihat kode mention, dan nggak bisa disuruh nge-tag orang.
  const content = message.content
    .replace(new RegExp(`<@!?${discord.user.id}>`, "g"), "")
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const member = message.mentions.members?.get(id);
      const user = message.mentions.users.get(id);
      return `@${member?.displayName ?? user?.displayName ?? user?.username ?? "seseorang"}`;
    })
    .replace(/<@&(\d+)>/g, (_, id) => `@${message.mentions.roles.get(id)?.name ?? "role"}`)
    .trim();

  if (content.toLowerCase() === "!reset") {
    memory.resetHistory(message.channel.id);
    await message.reply("Ingatan gue udah dihapus. Kayak mantan, kita mulai dari nol lagi.");
    return;
  }

  const images = await collectImages(message);
  if (!content && !images.length) {
    await message.reply("Mention doang tanpa ngomong apa-apa? Kode morse ya?");
    return;
  }

  const name = tagName(
    message.member?.displayName ?? message.author.displayName ?? message.author.username,
    message.author.id,
  );
  const imageNote = images.length ? ` (kirim ${images.length} gambar)` : "";
  const userText = `[${name}]:${imageNote} ${content || "(tanpa teks)"}`;

  await respond(
    message.channel.id,
    userText,
    images,
    async (reply) => {
      const parts = splitMessage(reply);
      await message.reply({ content: parts[0], allowedMentions: NO_PINGS });
      for (const part of parts.slice(1)) await message.channel.send({ content: part, allowedMentions: NO_PINGS });
    },
    () => message.channel.sendTyping(),
  );
});

discord.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await handleMusicAutocomplete(interaction).catch(() => {});
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  if (await handleModeration(interaction)) return;
  if (await handleMusic(interaction)) return;

  if (interaction.commandName === "avatar") {
    await avatarReply(interaction).catch((error) => console.error("Gagal /avatar:", error));
    return;
  }

  if (interaction.commandName === "spam") {
    await spamReply(interaction).catch((error) => console.error("Gagal /spam:", error));
    return;
  }

  if (interaction.commandName === "reset") {
    memory.resetHistory(interaction.channelId);
    await interaction.reply("Ingatan gue udah dihapus. Kayak mantan, kita mulai dari nol lagi.");
    return;
  }

  const prompt = buildPrompt(interaction, discord.user.id);
  if (!prompt) return;
  if (typeof prompt === "object") {
    await interaction.reply(prompt.text); // balasan langsung tanpa AI
    return;
  }

  // Discord minta respons dalam 3 detik, jadi tampilkan "sedang berpikir..." dulu
  await interaction.deferReply();

  // /roast dan /roastlagu nge-tag targetnya (cuma target itu yang ke-ping, dan bukan bot)
  const target = ["roast", "roastlagu"].includes(interaction.commandName)
    ? interaction.options.getUser("target")
    : null;
  const pingTarget = target && !target.bot && target.id !== interaction.user.id;
  const firstMentions = pingTarget ? { parse: [], users: [target.id] } : NO_PINGS;

  await respond(interaction.channelId, prompt, [], async (reply) => {
    const parts = splitMessage(reply);
    if (pingTarget) parts[0] = `<@${target.id}> ${parts[0]}`;
    await interaction.editReply({ content: parts[0], allowedMentions: firstMentions });
    for (const part of parts.slice(1)) await interaction.followUp({ content: part, allowedMentions: NO_PINGS });
  });
});

// Simpan ingatan sebelum bot dimatikan (Ctrl+C atau dihentikan dari panel hosting)
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    memory.saveNow();
    stopAllMusic();
    discord.destroy();
    process.exit(0);
  });
}

discord.login(process.env.DISCORD_TOKEN);
