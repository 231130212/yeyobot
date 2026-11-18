// Pengingat perpanjang hosting: kirim notif ke channel khusus tiap 3 hari,
// dengan tombol ke panel hosting dan tombol "Udah diperpanjang" buat reset hitungan.
import fs from "node:fs";
import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
} from "discord.js";

const CHANNEL_NAME = process.env.RENEW_CHANNEL ?? "renewal-bot";
const PANEL_URL = process.env.RENEW_PANEL_URL ?? "https://bot-hosting.net";
const FILE = process.env.RENEW_FILE ?? "data/renew.json";
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // ingetin 3 hari setelah terakhir diperpanjang
const REPEAT_MS = 6 * 60 * 60 * 1000; // kalau belum diklik, ingetin lagi tiap 6 jam
const CHECK_EVERY_MS = 10 * 60 * 1000;
const DONE_ID = "renew-done";

const REMINDERS = [
  "Udah 3 hari nih. Perpanjang hosting gue dong, masa tega biarin gue mati.",
  "Halo bos, jatah hidup gue tinggal dikit. Klik perpanjang, nggak sampai semenit kok.",
  "Pengingat rutin: gue cuma bot gratisan, tapi gue juga pengen hidup. Perpanjang ya.",
  "Kalau lo baca ini, berarti gue masih hidup. Biar tetep gitu, perpanjang hosting-nya.",
];
const NAGS = [
  "Masih belum diperpanjang lho. Gue nggak marah, cuma kecewa.",
  "Ini pengingat kedua. Yang ketiga gue nyanyi lagu galau.",
  "Hosting gue belum diperpanjang. Lagi sibuk ya? Sibuk ngelupain gue?",
];

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    // Pertama kali: belum tahu kapan terakhir diperpanjang, jadi langsung ingetin biar hitungannya sinkron
    return { renewedAt: 0, lastReminderAt: 0 };
  }
}

function save(state) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state));
    fs.renameSync(`${FILE}.tmp`, FILE);
  } catch (error) {
    console.error("Gagal menyimpan pengingat hosting:", error.message);
  }
}

const state = load();

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buttons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Buka panel hosting").setEmoji("🔗").setStyle(ButtonStyle.Link).setURL(PANEL_URL),
      new ButtonBuilder().setCustomId(DONE_ID).setLabel("Udah diperpanjang").setEmoji("✅").setStyle(ButtonStyle.Success),
    ),
  ];
}

/** Channel pengingat, cuma di server yang owner-nya pemilik bot (biar nggak nyasar ke server orang lain). */
function findChannels(client, owners) {
  return client.guilds.cache
    .filter((guild) => owners.includes(guild.ownerId))
    .map((guild) => guild.channels.cache.find((c) => c.name === CHANNEL_NAME && c.isTextBased()))
    .filter(Boolean);
}

async function ownerIds(client) {
  const app = await client.application.fetch().catch(() => null);
  if (!app?.owner) return [];
  return app.owner.members ? [...app.owner.members.keys()] : [app.owner.id];
}

async function sendReminder(client, isNag) {
  const owners = await ownerIds(client);
  const channels = findChannels(client, owners);
  if (!channels.length) return false;
  const days = Math.floor((Date.now() - state.renewedAt) / 86_400_000);
  const firstTime = state.renewedAt === 0;
  const opening = firstTime
    ? "Pengingat perpanjang hosting udah aktif! Gue belum tahu kapan terakhir lo perpanjang, jadi perpanjang sekarang biar hitungannya pas. Habis itu gue ingetin tiap 3 hari."
    : pick(isNag ? NAGS : REMINDERS);
  const lastTime = firstTime
    ? ""
    : `Terakhir diperpanjang: <t:${Math.floor(state.renewedAt / 1000)}:R> (${days} hari lalu)\n`;

  const embed = new EmbedBuilder()
    .setTitle(firstTime ? "⏰ Pengingat hosting aktif" : "⏰ Waktunya perpanjang hosting")
    .setDescription(
      `${opening}\n\n` +
        lastTime +
        `1. Klik **Buka panel hosting**, lalu perpanjang.\n` +
        `2. Balik ke sini, klik **Udah diperpanjang**.`,
    )
    .setColor(isNag ? 0xe74c3c : 0xf5a623);

  for (const channel of channels) {
    await channel
      .send({
        content: owners.map((id) => `<@${id}>`).join(" ") || undefined,
        embeds: [embed],
        components: buttons(),
        allowedMentions: { users: owners }, // cuma pemilik bot yang ke-ping
      })
      .catch((error) => console.warn(`Gagal kirim pengingat hosting ke #${channel.name}:`, error.message));
  }
  return true;
}

export function setupRenewReminder(client) {
  const tick = async () => {
    const now = Date.now();
    if (now - state.renewedAt < REMIND_AFTER_MS) return;
    if (now - state.lastReminderAt < REPEAT_MS) return;
    // Udah pernah diingetin tapi belum diklik (kecuali pengingat pertama kali)
    const isNag = state.renewedAt !== 0 && state.lastReminderAt > state.renewedAt;
    if (await sendReminder(client, isNag)) {
      state.lastReminderAt = now;
      save(state);
    }
  };
  client.once(Events.ClientReady, () => {
    save(state); // simpan titik awal hitungan kalau ini pertama kali
    tick();
    setInterval(tick, CHECK_EVERY_MS);
  });
}

/** Tombol "Udah diperpanjang". Return true kalau memang tombol ini. */
export async function handleRenewButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== DONE_ID) return false;

  // Cuma pemilik bot, karena cuma dia yang bisa perpanjang hosting-nya
  const owners = await ownerIds(interaction.client);
  if (!owners.includes(interaction.user.id)) {
    await interaction.reply({ content: "Tombol ini khusus yang ngurus hosting gue.", flags: MessageFlags.Ephemeral });
    return true;
  }

  state.renewedAt = Date.now();
  state.lastReminderAt = 0;
  save(state);
  const next = Math.floor((state.renewedAt + REMIND_AFTER_MS) / 1000);

  // Ubah pesan pengingat jadi "beres" dan matiin tombolnya
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setTitle("✅ Hosting udah diperpanjang")
    .setDescription(`Diperpanjang sama ${interaction.user} <t:${Math.floor(Date.now() / 1000)}:R>. Makasih, gue hidup 4 hari lagi.\nPengingat berikutnya <t:${next}:R>.`)
    .setColor(0x2ecc71);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Buka panel hosting").setEmoji("🔗").setStyle(ButtonStyle.Link).setURL(PANEL_URL),
    new ButtonBuilder().setCustomId(DONE_ID).setLabel("Udah diperpanjang").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(true),
  );
  await interaction.update({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  return true;
}
