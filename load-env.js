// Membaca file .env kalau ada (untuk di laptop).
// Di hosting, pengaturan biasanya diisi lewat panel (environment variables), jadi file .env tidak wajib.
// Nilai yang sudah diset dari panel tidak akan ditimpa.
import fs from "node:fs";

try {
  const text = fs.readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // Tidak ada file .env: tidak apa-apa, pakai environment variables dari sistem/hosting
}
