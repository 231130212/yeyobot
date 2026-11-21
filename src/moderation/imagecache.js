// Simpan salinan gambar dari pesan, supaya kalau pesannya dihapus gambarnya masih bisa ditampilkan di log.
// Discord langsung menghapus file gambar begitu pesannya dihapus, jadi salinannya harus diambil duluan
// (cara yang sama dipakai Dyno). Salinan disimpan di disk, dibatasi ukuran dan umurnya biar hosting nggak penuh.
import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve("data/image-cache");
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // batas upload bot Discord 10 MB, sisain ruang
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // total semua salinan
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // lebih dari sehari dihapus
const MAX_PER_MESSAGE = 4;

/** messageId -> { savedAt, files: [{ path, name, size }] } atau Promise-nya kalau masih diunduh */
const entries = new Map();
let totalBytes = 0;

// Salinan dari sesi sebelumnya nggak kepakai lagi (pesan lama nggak bisa di-log), jadi dibersihkan
fs.rmSync(CACHE_DIR, { recursive: true, force: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

function removeEntry(messageId) {
  const entry = entries.get(messageId);
  entries.delete(messageId);
  if (!entry || entry instanceof Promise) return;
  for (const file of entry.files) {
    totalBytes -= file.size;
    fs.rm(file.path, { force: true }, () => {});
  }
}

/** Buang salinan yang kelamaan, lalu yang paling lama sampai totalnya di bawah batas. */
function prune() {
  const now = Date.now();
  // Map menyimpan urutan masuk, jadi yang pertama = yang paling lama
  for (const [id, entry] of entries) {
    if (entry instanceof Promise) continue;
    if (now - entry.savedAt > MAX_AGE_MS || totalBytes > MAX_TOTAL_BYTES) removeEntry(id);
    else break;
  }
}
setInterval(prune, 10 * 60 * 1000).unref();

async function download(message) {
  const files = [];
  const attachments = [...message.attachments.values()]
    .filter((a) => IMAGE_TYPES.has(a.contentType?.split(";")[0]) && a.size <= MAX_FILE_BYTES)
    .slice(0, MAX_PER_MESSAGE);

  for (const [i, attachment] of attachments.entries()) {
    try {
      const res = await fetch(attachment.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      // Nama file disederhanakan biar aman dipakai di disk dan di "attachment://"
      const name = `${i}-${attachment.name.replace(/[^\w.-]/g, "_")}`;
      const filePath = path.join(CACHE_DIR, `${message.id}-${name}`);
      await fs.promises.writeFile(filePath, data);
      files.push({ path: filePath, name, size: data.length });
    } catch (error) {
      console.warn(`Gagal nyimpen salinan gambar ${attachment.name}:`, error.message);
    }
  }
  return files;
}

/** Simpan salinan gambar dari pesan baru (kalau ada gambarnya). */
export function cacheImages(message) {
  const hasImage = message.attachments.some(
    (a) => IMAGE_TYPES.has(a.contentType?.split(";")[0]) && a.size <= MAX_FILE_BYTES,
  );
  if (!hasImage) return;

  const pending = download(message);
  entries.set(message.id, pending);
  pending.then((files) => {
    // Kalau pesannya udah dihapus selama download, takeImages() yang ngurus file-nya
    if (entries.get(message.id) !== pending) return;
    entries.set(message.id, { savedAt: Date.now(), files });
    for (const file of files) totalBytes += file.size;
    prune();
  });
}

/**
 * Ambil salinan gambar dari pesan yang dihapus. Mengembalikan [{ path, name }] (bisa kosong).
 * Salinannya otomatis dihapus dari disk semenit kemudian (setelah sempat di-upload ke log).
 */
export async function takeImages(messageId) {
  const entry = entries.get(messageId);
  if (!entry) return [];
  entries.delete(messageId);

  let files;
  if (entry instanceof Promise) {
    files = await entry; // masih diunduh: tunggu dulu (download() nggak pernah gagal, paling hasilnya kosong)
  } else {
    files = entry.files;
    for (const file of files) totalBytes -= file.size;
  }
  setTimeout(() => {
    for (const file of files) fs.rm(file.path, { force: true }, () => {});
  }, 60_000).unref();
  return files;
}
