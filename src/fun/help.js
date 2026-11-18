// /help: panduan buat pengguna baru, dengan menu pilihan kategori. Sengaja tanpa AI biar hemat kuota.
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";

const COLOR = 0xf5a623;
const MENU_ID = "help-menu";
const FREE_CHAT_CHANNEL = process.env.FREE_CHAT_CHANNEL ?? "ngobrol-sama-bot";

export const helpCommands = [
  new SlashCommandBuilder().setName("help").setDescription("Bingung? Sini gue ajarin cara pakai gue"),
].map((command) => command.toJSON());

const PAGES = {
  mulai: {
    label: "Mulai dari sini",
    emoji: "👋",
    description: "Kenalan dulu sama gue",
    title: "👋 Halo, gue Yeyo Rosting",
    body: (bot) =>
      `Bot tongkrongan yang mulutnya pedes tapi hatinya baik. Bisa diajak ngobrol, nge-roast temen, muter radio, sampai bantu jagain server.\n\n` +
      `**Cara paling gampang mulai:**\n` +
      `1. Mention gue: ${bot} halo\n` +
      `2. Coba \`/roast\` ke temen lo\n` +
      `3. Masuk voice terus ketik \`/radio putar\`\n\n` +
      `Pilih kategori di menu bawah buat lihat semua yang bisa gue lakuin.`,
  },
  ngobrol: {
    label: "Ngobrol",
    emoji: "💬",
    description: "Cara ngajak gue ngobrol",
    title: "💬 Ngobrol sama gue",
    body: (bot) =>
      `• **Mention** gue di channel mana aja: ${bot} kenapa senin itu ada?\n` +
      `• **DM** gue langsung.\n` +
      `• Di channel **#${FREE_CHAT_CHANNEL}**, gue bales semua pesan tanpa perlu di-mention.\n` +
      `• **Kirim gambar** (meme, screenshot, foto) sambil mention gue, nanti gue komentarin. Maks 3 gambar.\n` +
      `• Gue inget 30 pesan terakhir di tiap channel. Ketik \`/reset\` atau \`!reset\` buat bikin gue lupa.\n\n` +
      `Kalau gue lagi bilang "jatah ngomong habis", tunggu bentar ya. Gue pakai AI gratisan, ada batasnya.`,
  },
  seru: {
    label: "Seru-seruan",
    emoji: "🎉",
    description: "Roast, ramal, pilih, dan lainnya",
    title: "🎉 Seru-seruan",
    body: () =>
      `\`/roast target:@temen\` Nyindir temen lo (ringan, bukan fisik). Kalau dia lagi dengerin Spotify atau main game, itu jadi bahan.\n` +
      `\`/roastlagu [target]\` Roasting lagu Spotify yang lagi didengerin.\n` +
      `\`/ramal [pertanyaan]\` Ramalan ngawur ala dukun sok tahu.\n` +
      `\`/nasihat masalah:...\` Nasihat yang kedengarannya bijak tapi nyeleneh.\n` +
      `\`/pilih pilihan:a, b, c\` Bingung milih? Gue pilihin, lengkap sama alasan ngawurnya.\n` +
      `\`/avatar [target]\` Lihat foto profil ukuran gede.\n` +
      `\`/spam target [jumlah]\` Panggil-panggil orang 1–5 kali. Ada jeda 1 menit, jangan rakus.`,
  },
  radio: {
    label: "Radio",
    emoji: "📻",
    description: "Dengerin radio bareng di voice",
    title: "📻 Radio",
    body: () =>
      `1. Masuk ke voice channel dulu.\n` +
      `2. Ketik \`/radio putar\`, terus tulis nama radio (misalnya \`prambors\`, \`lofi\`, \`dangdut\`).\n` +
      `3. Pilih stasiun dari daftar yang muncul.\n\n` +
      `\`/radio sekarang\` Lihat lagi muter apa.\n` +
      `\`/radio stop\` Matiin radio.\n\n` +
      `Gue keluar sendiri kalau voice-nya udah kosong. Gue nggak bisa muter YouTube atau Spotify, cuma radio.`,
  },
  moderasi: {
    label: "Moderasi",
    emoji: "🛡️",
    description: "Buat admin dan moderator",
    title: "🛡️ Moderasi (khusus admin/mod)",
    body: () =>
      `Command ini cuma muncul buat yang punya izinnya.\n\n` +
      `\`/timeout\` \`/untimeout\` Bisukan sementara (1 menit sampai 1 minggu).\n` +
      `\`/kick\` Keluarin dari server.\n` +
      `\`/ban\` \`/unban\` Ban dan cabut ban.\n` +
      `\`/hapus jumlah\` Hapus 1–100 pesan sekaligus.\n` +
      `\`/setlog channel:#log\` Pilih channel buat log.\n` +
      `\`/giveaway mulai\` Bikin giveaway (lalu \`akhiri\`, \`reroll\`, atau \`batal\`). Peserta ikut lewat tombol 🎉.\n\n` +
      `**Log yang gue catat:** pesan dihapus/diedit, tindakan moderasi, masuk/keluar voice, role, nickname, dan member masuk/keluar.\n\n` +
      `Supaya moderasi jalan, seret role gue ke **atas** role member di Server Settings → Roles.`,
  },
};

function pageEmbed(key, bot) {
  const page = PAGES[key];
  return new EmbedBuilder()
    .setTitle(page.title)
    .setDescription(page.body(bot))
    .setColor(COLOR)
    .setFooter({ text: "Pilih kategori lain di menu bawah" });
}

function menu(selected) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder("Pilih kategori...")
      .addOptions(
        Object.entries(PAGES).map(([value, page]) => ({
          label: page.label,
          value,
          emoji: page.emoji,
          description: page.description,
          default: value === selected,
        })),
      ),
  );
}

/** Return true kalau ini /help atau menu /help. */
export async function handleHelp(interaction) {
  const bot = `<@${interaction.client.user.id}>`;

  if (interaction.isChatInputCommand() && interaction.commandName === "help") {
    // Cuma kelihatan buat yang nanya, biar channel nggak penuh
    await interaction.reply({
      embeds: [pageEmbed("mulai", bot)],
      components: [menu("mulai")],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === MENU_ID) {
    const key = PAGES[interaction.values[0]] ? interaction.values[0] : "mulai";
    await interaction.update({ embeds: [pageEmbed(key, bot)], components: [menu(key)] });
    return true;
  }

  return false;
}
