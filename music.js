// Fitur radio: /radio putar, /radio stop, /radio sekarang
// Stasiun dicari lewat Radio Browser (https://www.radio-browser.info), gratis dan tanpa API key.
import { SlashCommandBuilder, EmbedBuilder, Events, ChannelType } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  entersState,
  StreamType,
} from "@discordjs/voice";
import prism from "prism-media";

const API_SERVERS = ["de1.api.radio-browser.info", "fi1.api.radio-browser.info", "nl1.api.radio-browser.info"];
const MAX_RETRIES = 3; // kalau stream radio putus, coba sambung ulang sebanyak ini

export const musicCommands = [
  new SlashCommandBuilder()
    .setName("radio")
    .setDescription("Dengerin radio bareng di voice channel")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("putar")
        .setDescription("Putar radio di voice channel lo")
        .addStringOption((o) =>
          o
            .setName("stasiun")
            .setDescription("Ketik nama radio, contoh: prambors, lofi, jazz")
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(100),
        ),
    )
    .addSubcommand((s) => s.setName("stop").setDescription("Matikan radio dan keluar dari voice"))
    .addSubcommand((s) => s.setName("sekarang").setDescription("Lagi muter radio apa?")),
].map((command) => command.toJSON());

const NOW_PLAYING_CAPTIONS = [
  "Selamat menikmati. Kalau lagunya jelek, salahin penyiarnya, jangan gue.",
  "Radio: teknologi zaman kakek lo yang masih lebih konsisten dari mood lo.",
  "Dengerin yang khusyuk. Iklannya juga bagian dari pengalaman.",
  "Gue cuma DJ, bukan penanggung jawab selera musik kalian.",
];

/** Satu sesi radio per server */
const sessions = new Map();

// ===== Radio Browser =====

async function radioApi(path) {
  let lastError;
  for (const host of API_SERVERS) {
    try {
      const res = await fetch(`https://${host}/json/${path}`, {
        headers: { "User-Agent": "yeyobot/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function searchStations(query, limit = 10) {
  const params = new URLSearchParams({ limit, hidebroken: "true", order: "votes", reverse: "true" });
  if (query) params.set("name", query);
  else params.set("countrycode", "ID"); // kosong = radio Indonesia terpopuler
  return radioApi(`stations/search?${params}`);
}

const isSafeStation = (s) => /^https?:\/\//i.test(s?.url_resolved || s?.url || "");

async function findStation(value) {
  // Dari autocomplete, nilainya UUID stasiun. Kalau user ngetik manual, cari berdasarkan nama.
  if (/^[0-9a-f-]{36}$/i.test(value)) {
    const [station] = await radioApi(`stations/byuuid/${value}`);
    if (isSafeStation(station)) return station;
  }
  const stations = await searchStations(value, 5);
  return stations.find(isSafeStation) ?? null;
}

function stationLabel(station) {
  const extra = [station.countrycode, station.codec, station.bitrate ? `${station.bitrate}kbps` : null]
    .filter(Boolean)
    .join(" · ");
  return `${station.name.trim()}${extra ? ` (${extra})` : ""}`.slice(0, 100);
}

// ===== Pemutar =====

function stopSession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  sessions.delete(guildId);
  session.player.stop(true);
  session.connection.destroy();
  return true;
}

function playStream(session) {
  const url = session.station.url_resolved || session.station.url;
  // Keamanan: cuma buka link http/https. Link lain (misalnya file://) bisa dipakai buat baca file di server.
  if (!/^https?:\/\//i.test(url)) throw new Error("Link radio nggak valid");
  // ffmpeg langsung ngeluarin Opus (format Discord), jadi hemat CPU. Ada sambung ulang otomatis juga.
  const ffmpeg = new prism.FFmpeg({
    args: [
      "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
      "-i", url,
      "-analyzeduration", "0", "-loglevel", "0",
      "-vn", "-c:a", "libopus", "-b:a", "96k", "-ar", "48000", "-ac", "2", "-f", "opus",
    ],
  });
  ffmpeg.on("error", (error) => console.warn(`ffmpeg radio ${session.station.name}:`, error.message));
  session.player.play(createAudioResource(ffmpeg, { inputType: StreamType.OggOpus }));
}

async function startSession(interaction, voiceChannel, station) {
  stopSession(interaction.guildId); // ganti stasiun = mulai ulang

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  const session = { connection, player, station, voiceChannelId: voiceChannel.id, retries: 0 };
  sessions.set(interaction.guildId, session);

  connection.subscribe(player);

  player.on(AudioPlayerStatus.Playing, () => {
    session.retries = 0;
  });
  // Stream radio kadang putus. Kalau berhenti sendiri, coba sambung ulang.
  player.on(AudioPlayerStatus.Idle, () => {
    if (sessions.get(interaction.guildId) !== session) return;
    if (session.retries++ >= MAX_RETRIES) {
      console.warn(`Radio ${station.name} putus terus, berhenti.`);
      stopSession(interaction.guildId);
      return;
    }
    setTimeout(() => sessions.get(interaction.guildId) === session && playStream(session), 2000);
  });
  player.on("error", (error) => console.warn(`Error radio ${station.name}:`, error.message));

  // Kalau koneksi voice putus (misalnya bot di-kick dari voice), coba sambung lagi, kalau gagal berhenti
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      if (sessions.get(interaction.guildId) === session) stopSession(interaction.guildId);
    }
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  playStream(session);
}

function nowPlayingEmbed(station, voiceChannelId) {
  const caption = NOW_PLAYING_CAPTIONS[Math.floor(Math.random() * NOW_PLAYING_CAPTIONS.length)];
  const embed = new EmbedBuilder()
    .setTitle(`📻 ${station.name.trim()}`)
    .setDescription(`${caption}\n\nDi <#${voiceChannelId}>. Matikan pakai \`/radio stop\`.`)
    .setColor(0xf5a623);
  const info = [station.country, station.tags?.split(",").slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  if (info) embed.setFooter({ text: info.slice(0, 200) });
  if (station.favicon?.startsWith("https://")) embed.setThumbnail(station.favicon);
  return embed;
}

// ===== Handler =====

/** Saran stasiun saat user mengetik nama radio */
export async function handleMusicAutocomplete(interaction) {
  if (interaction.commandName !== "radio") return false;
  const query = interaction.options.getFocused().trim();
  try {
    const stations = await searchStations(query, 25);
    await interaction.respond(
      stations
        .filter((s) => s.stationuuid && s.name?.trim())
        .slice(0, 25)
        .map((s) => ({ name: stationLabel(s), value: s.stationuuid })),
    );
  } catch {
    await interaction.respond([]).catch(() => {});
  }
  return true;
}

/** Return true kalau command-nya /radio */
export async function handleMusic(interaction) {
  if (interaction.commandName !== "radio") return false;
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: "Radio cuma bisa di server.", ephemeral: true });
    return true;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "stop") {
    const stopped = stopSession(interaction.guildId);
    await interaction.reply(
      stopped ? "Radio dimatiin. Sunyi lagi, kayak chat dari gebetan." : "Lagi nggak muter apa-apa, mau stop apaan?",
    );
    return true;
  }

  if (sub === "sekarang") {
    const session = sessions.get(interaction.guildId);
    if (!session) await interaction.reply("Lagi nggak muter apa-apa. Coba `/radio putar`.");
    else await interaction.reply({ embeds: [nowPlayingEmbed(session.station, session.voiceChannelId)] });
    return true;
  }

  // /radio putar
  const voiceChannel = interaction.member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: "Masuk voice channel dulu dong, masa gue nyanyi sendirian.", ephemeral: true });
    return true;
  }
  const me = interaction.guild.members.me;
  const perms = voiceChannel.permissionsFor(me);
  if (!perms?.has(["Connect", "Speak"])) {
    await interaction.reply({
      content: "Gue nggak punya izin **Connect** atau **Speak** di voice channel itu. Minta admin kasih izinnya dulu.",
      ephemeral: true,
    });
    return true;
  }
  if (voiceChannel.type === ChannelType.GuildStageVoice) {
    await interaction.reply({ content: "Stage channel belum didukung, pakai voice channel biasa ya.", ephemeral: true });
    return true;
  }

  await interaction.deferReply();
  try {
    const station = await findStation(interaction.options.getString("stasiun", true));
    if (!station) {
      await interaction.editReply("Radionya nggak ketemu. Coba ketik nama lain, terus pilih dari daftar yang muncul.");
      return true;
    }
    await startSession(interaction, voiceChannel, station);
    await interaction.editReply({ embeds: [nowPlayingEmbed(station, voiceChannel.id)] });
  } catch (error) {
    console.error("Gagal muter radio:", error);
    stopSession(interaction.guildId);
    await interaction.editReply("Radionya gagal diputer. Mungkin stasiunnya lagi off, coba stasiun lain.");
  }
  return true;
}

/** Keluar otomatis kalau voice channel udah kosong (cuma tinggal bot). */
export function setupMusic(client) {
  client.on(Events.VoiceStateUpdate, (oldState) => {
    const session = sessions.get(oldState.guild.id);
    if (!session || oldState.channelId !== session.voiceChannelId) return;
    const channel = oldState.guild.channels.cache.get(session.voiceChannelId);
    if (channel && channel.members.filter((m) => !m.user.bot).size === 0) stopSession(oldState.guild.id);
  });
}

/** Dipanggil saat bot dimatikan */
export function stopAllMusic() {
  for (const guildId of [...sessions.keys()]) stopSession(guildId);
}
