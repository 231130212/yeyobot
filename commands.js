// Slash command umum: /avatar, /roast, /roastlagu, /ramal, /nasihat, /reset
import { SlashCommandBuilder, EmbedBuilder, ActivityType } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Lihat foto profil seseorang ukuran besar")
    .addUserOption((o) => o.setName("target").setDescription("Punya siapa? (kosongkan = punya lo sendiri)")),
  new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Suruh Yeyo Rosting nyindir seseorang (ringan, nggak kejam)")
    .addUserOption((o) => o.setName("target").setDescription("Siapa yang mau di-roast?").setRequired(true)),
  new SlashCommandBuilder()
    .setName("roastlagu")
    .setDescription("Roasting lagu yang lagi didengerin seseorang di Spotify")
    .addUserOption((o) => o.setName("target").setDescription("Siapa? (kosongkan = lo sendiri)")),
  new SlashCommandBuilder()
    .setName("ramal")
    .setDescription("Ramalan nyeleneh dari dukun sok tahu")
    .addStringOption((o) =>
      o.setName("pertanyaan").setDescription("Mau diramal soal apa? (boleh kosong)").setMaxLength(200),
    ),
  new SlashCommandBuilder()
    .setName("nasihat")
    .setDescription("Nasihat yang kedengarannya bijak tapi nyeleneh")
    .addStringOption((o) =>
      o.setName("masalah").setDescription("Lagi ada masalah apa?").setRequired(true).setMaxLength(300),
    ),
  new SlashCommandBuilder().setName("reset").setDescription("Hapus ingatan Yeyo Rosting di channel ini"),
  new SlashCommandBuilder()
    .setName("spam")
    .setDescription("Panggil-panggil seseorang beberapa kali (maks 5x, jeda 2 detik)")
    .setDMPermission(false)
    .addUserOption((o) => o.setName("target").setDescription("Siapa yang mau dipanggil?").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("jumlah").setDescription("Berapa kali? (1-5, default 3)").setMinValue(1).setMaxValue(5),
    ),
].map((command) => command.toJSON());

// ===== /spam =====
const SPAM_DELAY_MS = 2000;
const SPAM_COOLDOWN_MS = 60_000; // per pemakai dan per target, biar nggak kebablasan
const spamCooldowns = new Map();
const SPAM_LINES = [
  "WOI {t}, dicariin nih!",
  "{t} bangun woi, dunia butuh lo (dikit)",
  "Halo {t}, ini panggilan ke sekian. Masih mau pura-pura nggak lihat?",
  "{t}, notif lo udah kayak alarm subuh ya",
  "Panggilan terakhir untuk penumpang atas nama {t}, harap segera muncul di chat.",
  "{t} please, gue cuma bot, capek juga manggilin lo",
];

function cooldownLeft(key) {
  const until = spamCooldowns.get(key) ?? 0;
  return Math.ceil(Math.max(0, until - Date.now()) / 1000);
}

/** /spam: mention target beberapa kali dengan jeda 2 detik. */
export async function spamReply(interaction) {
  const target = interaction.options.getUser("target", true);
  const count = interaction.options.getInteger("jumlah") ?? 3;

  if (target.bot) {
    await interaction.reply({ content: "Manggil bot? Dia nggak punya perasaan, sama kayak mantan lo.", ephemeral: true });
    return;
  }
  const wait = Math.max(cooldownLeft(`u:${interaction.user.id}`), cooldownLeft(`t:${target.id}`));
  if (wait) {
    await interaction.reply({ content: `Sabar, tunggu ${wait} detik lagi. Jempol lo butuh istirahat.`, ephemeral: true });
    return;
  }
  const until = Date.now() + SPAM_COOLDOWN_MS;
  spamCooldowns.set(`u:${interaction.user.id}`, until);
  spamCooldowns.set(`t:${target.id}`, until);

  const mention = `<@${target.id}>`;
  const allowedMentions = { users: [target.id] }; // cuma target yang ke-ping, @everyone aman
  const lines = [...SPAM_LINES].sort(() => Math.random() - 0.5);

  await interaction.reply({ content: lines[0].replaceAll("{t}", mention), allowedMentions });
  for (let i = 1; i < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, SPAM_DELAY_MS));
    const content = lines[i % lines.length].replaceAll("{t}", mention);
    // Kirim sebagai pesan biasa biar nggak ada tanda "membalas"; kalau nggak bisa, pakai followUp
    await interaction.channel
      .send({ content, allowedMentions })
      .catch(() => interaction.followUp({ content, allowedMentions }));
  }
}

// Komentar untuk /avatar. Sengaja tidak pakai AI: hemat kuota, dan tidak mengomentari muka orang.
const AVATAR_CAPTIONS = [
  "Udah dilihat, jangan dicolong buat PP sendiri ya.",
  "Pasti dipilih dari 300 foto di galeri, terus yang menang yang ini.",
  "Foto profil adalah cerminan jiwa. Semoga jiwanya baik-baik aja.",
  "Mau di-zoom sampai pecah juga boleh, gue nggak tanggung jawab.",
  "Ganti PP terakhir kapan? Jangan bilang dari zaman pandemi.",
];

/** Balasan untuk /avatar: embed berisi foto profil ukuran besar. */
export async function avatarReply(interaction) {
  const user = interaction.options.getUser("target") ?? interaction.user;
  const member = interaction.options.getMember("target") ?? (user.id === interaction.user.id ? interaction.member : null);
  const name = member?.displayName ?? user.displayName ?? user.username;

  const mainUrl = user.displayAvatarURL({ size: 1024 });
  // Sebagian orang punya foto profil khusus untuk server ini
  const serverUrl = member?.avatar ? member.displayAvatarURL({ size: 1024 }) : null;

  const caption = user.avatar
    ? AVATAR_CAPTIONS[Math.floor(Math.random() * AVATAR_CAPTIONS.length)]
    : "Masih pakai avatar bawaan Discord. Minimalis atau mager? Lo yang tau.";

  const links = [`[Download](${mainUrl})`];
  if (serverUrl) links.push(`[Versi khusus server ini](${serverUrl})`);

  const embed = new EmbedBuilder()
    .setTitle(`Avatar ${name}`)
    .setDescription(`${caption}\n\n${links.join(" · ")}`)
    .setImage(serverUrl ?? mainUrl)
    .setColor(0xf5a623);

  await interaction.reply({ embeds: [embed] });
}

// Orang yang nggak boleh dikasarin: otomatis pembuat bot (diisi di index.js),
// ditambah ID di SPECIAL_USER_IDS kalau ada (pisahkan dengan koma).
export const specialUsers = new Set(
  (process.env.SPECIAL_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean),
);

/** Tanda ⭐ di nama supaya AI tahu harus lembut ke orang ini (aturannya ada di persona.js). */
export function tagName(name, userId) {
  return specialUsers.has(userId) ? `${name} ⭐` : name;
}

const GENTLE =
  "Catatan: yang di-roast ini pembuat lo, jadi roasting-nya versi manis dan lembut, kayak godain sahabat sendiri, jangan nyelekit, dan jangan sebut muka atau ekspresinya sama sekali. ";

function displayName(interaction) {
  const name = interaction.member?.displayName ?? interaction.user.displayName ?? interaction.user.username;
  return tagName(name, interaction.user.id);
}

/** Lagu yang sedang didengarkan (dari status Spotify di profil), atau null. */
function getListening(member) {
  const activity = member?.presence?.activities?.find((a) => a.type === ActivityType.Listening);
  if (!activity?.details) return null;
  return {
    title: activity.details,
    artist: activity.state?.replaceAll(";", ",") ?? null,
    album: activity.assets?.largeText ?? null,
    app: activity.name, // biasanya "Spotify"
  };
}

/** Aktivitas lain yang kelihatan di profil (misalnya lagi main game), atau null. */
function getPlaying(member) {
  const activity = member?.presence?.activities?.find((a) => a.type === ActivityType.Playing);
  return activity?.name ?? null;
}

function describeSong(song) {
  let text = `"${song.title}"`;
  if (song.artist) text += ` dari ${song.artist}`;
  if (song.album && song.album !== song.title) text += ` (album ${song.album})`;
  return `${text} di ${song.app}`;
}

/**
 * Ubah slash command jadi "pesan user" untuk AI.
 * Formatnya sama dengan pesan biasa ("[Nama]: ...") supaya tersimpan rapi di ingatan.
 * Kalau hasilnya { text }, itu balasan langsung tanpa AI.
 */
export function buildPrompt(interaction, botUserId) {
  const name = displayName(interaction);

  switch (interaction.commandName) {
    case "roastlagu": {
      const user = interaction.options.getUser("target") ?? interaction.user;
      const member =
        interaction.options.getMember("target") ?? (user.id === interaction.user.id ? interaction.member : null);
      const target = member?.displayName ?? user.displayName ?? user.username;
      const song = getListening(member);
      if (!song) {
        const who = user.id === interaction.user.id ? "Lo" : target;
        return {
          text:
            `${who} lagi nggak dengerin apa-apa. Atau Spotify-nya nggak disambungin ke Discord, ` +
            `atau statusnya invisible. Hening itu juga genre sih, cuma ya... nggak bisa gue roasting.`,
        };
      }
      const subject = user.id === interaction.user.id ? "gue" : target;
      return (
        `[${name}]: (pakai /roastlagu ke ${subject}) ${subject} lagi dengerin ${describeSong(song)}. ` +
        `Roasting selera musiknya dengan ringan dan lucu, 2-4 kalimat. ` +
        (specialUsers.has(user.id) ? GENTLE : "") +
        `Kalau lo nggak yakin soal lagu atau artisnya, jangan ngarang fakta; roasting aja dari judul dan suasananya. ` +
        `Yang di-roast HANYA pilihan lagunya, jangan komentari fisik, dan jangan singgung SARA atau gender.`
      );
    }
    case "roast": {
      const user = interaction.options.getUser("target", true);
      const member = interaction.options.getMember("target");
      const target = member?.displayName ?? user.displayName ?? user.username;
      if (user.id === botUserId) {
        return `[${name}]: (pakai /roast ke lo sendiri) Coba roasting diri lo sendiri dong, 2-4 kalimat. Tunjukin lo bisa self-roast.`;
      }
      const subject = user.id === interaction.user.id ? "diri gue sendiri" : target;
      // Bahan tambahan dari profil: lagu yang didengerin atau game yang dimainin
      const song = getListening(member);
      const game = getPlaying(member);
      const clues = [
        song && `lagi dengerin ${describeSong(song)}`,
        game && `lagi main ${game}`,
      ].filter(Boolean);
      const clueText = clues.length ? `Info dari profilnya: ${clues.join(", ")}. Boleh dipakai bahan. ` : "";
      return (
        `[${name}]: (pakai /roast ke ${subject}) Roasting ${subject} dengan ringan dan lucu, 2-4 kalimat. ` +
        (specialUsers.has(user.id) ? GENTLE : "") +
        clueText +
        `Kalau di obrolan ini ada hal yang pernah ${subject} omongin, boleh dipakai bahan. ` +
        `Yang di-roast HANYA kelakuan, kebiasaan, atau pilihan hidupnya. ` +
        `Sama sekali jangan komentari muka, badan, penampilan, atau kesehatan, dan jangan singgung SARA atau gender.`
      );
    }
    case "ramal": {
      const question = interaction.options.getString("pertanyaan");
      return (
        `[${name}]: (pakai /ramal) Ramal nasib gue ${question ? `soal: ${question}` : "hari ini"}. ` +
        `Gaya dukun sok tahu yang nyeleneh, 2-4 kalimat, sertakan "angka keberuntungan" atau "benda keberuntungan" yang absurd.`
      );
    }
    case "nasihat": {
      const problem = interaction.options.getString("masalah", true);
      return (
        `[${name}]: (pakai /nasihat) Masalah gue: ${problem}. ` +
        `Kasih nasihat yang kedengarannya bijak tapi nyeleneh dan lucu, 2-4 kalimat. ` +
        `Tapi kalau masalahnya serius (kesehatan mental, keselamatan, kekerasan), lupakan bercandanya dan kasih saran yang tulus dan beneran membantu.`
      );
    }
    default:
      return null;
  }
}
