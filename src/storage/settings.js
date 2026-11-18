// Pengaturan per server (misalnya channel log), disimpan ke file supaya nggak hilang saat restart.
import fs from "node:fs";
import path from "node:path";

const FILE = process.env.SETTINGS_FILE ?? "data/settings.json";

// Nama channel cadangan kalau server belum pakai /setlog
const DEFAULT_NAMES = {
  moderasi: [process.env.LOG_CHANNEL ?? "log-moderasi"],
  server: [process.env.SERVER_LOG_CHANNEL ?? "log-server", process.env.LOG_CHANNEL ?? "log-moderasi"],
};

/** { [guildId]: { moderasi?: channelId, server?: channelId } } */
const settings = load();

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
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (error) {
    console.error("Gagal menyimpan pengaturan:", error.message);
  }
}

/** kind: "moderasi" atau "server". channelId null = hapus pengaturan (balik ke nama default). */
export function setLogChannel(guildId, kind, channelId) {
  settings[guildId] ??= {};
  if (channelId) settings[guildId][kind] = channelId;
  else delete settings[guildId][kind];
  save();
}

/** Cari channel log: pakai pilihan dari /setlog dulu, kalau nggak ada cari berdasarkan nama. */
export function findLogChannel(guild, kind) {
  const id = settings[guild.id]?.[kind];
  const chosen = id && guild.channels.cache.get(id);
  if (chosen?.isTextBased()) return chosen;
  for (const name of DEFAULT_NAMES[kind]) {
    const channel = guild.channels.cache.find((c) => c.name === name && c.isTextBased());
    if (channel) return channel;
  }
  return null;
}
