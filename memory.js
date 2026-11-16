// Ingatan obrolan per channel, disimpan ke file supaya tidak hilang saat bot restart.
import fs from "node:fs";
import path from "node:path";

const FILE = process.env.MEMORY_FILE ?? "data/memory.json";
const MAX_HISTORY = 30; // jumlah pesan terakhir per channel yang diingat
const SAVE_DELAY_MS = 2000; // tunggu sebentar supaya tidak menulis file di setiap pesan

/** Map<channelId, {role, content}[]> */
const histories = load();
let saveTimer = null;

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const map = new Map(Object.entries(data));
    console.log(`Ingatan dimuat: ${map.size} channel dari ${FILE}`);
    return map;
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Gagal membaca ${FILE}, mulai dengan ingatan kosong:`, error.message);
    return new Map();
  }
}

export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    // Tulis ke file sementara dulu lalu ganti nama, supaya file tidak rusak kalau bot mati di tengah jalan
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(histories)));
    fs.renameSync(tmp, FILE);
  } catch (error) {
    console.error("Gagal menyimpan ingatan:", error.message);
  }
}

function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

function trim(history) {
  while (history.length > MAX_HISTORY) history.shift();
  // Pesan pertama yang dikirim ke AI harus dari "user"
  while (history.length && history[0].role !== "user") history.shift();
}

export function getHistory(channelId) {
  return histories.get(channelId) ?? [];
}

export function addMessage(channelId, role, content) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  const history = histories.get(channelId);
  history.push({ role, content });
  trim(history);
  scheduleSave();
}

/** Buang pesan terakhir kalau isinya sama (dipakai saat AI gagal menjawab). */
export function removeLast(channelId, content) {
  const history = histories.get(channelId);
  if (history?.at(-1)?.content === content) {
    history.pop();
    scheduleSave();
  }
}

export function resetHistory(channelId) {
  histories.delete(channelId);
  scheduleSave();
}
