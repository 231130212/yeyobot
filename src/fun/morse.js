// Penerjemah kode Morse pakai tabel biasa (bukan AI), jadi hasilnya instan dan pasti benar.
// AI jelek banget baca titik-strip satu per satu, makanya terjemahannya dikasih ke AI dalam bentuk jadi.

const TABLE = {
  ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H",
  "..": "I", ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P",
  "--.-": "Q", ".-.": "R", "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X",
  "-.--": "Y", "--..": "Z",
  "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6",
  "--...": "7", "---..": "8", "----.": "9",
  ".-.-.-": ".", "--..--": ",", "..--..": "?", "-.-.--": "!", "-..-.": "/", "-.--.": "(", "-.--.-": ")",
  ".-...": "&", "---...": ":", "-...-": "=", ".-.-.": "+", "-....-": "-", ".--.-.": "@", ".----.": "'",
};

// Deretan kode Morse: minimal 3 huruf, dipisah spasi (antar-huruf) dan / atau | (antar-kata)
const MORSE_RUN = /[.-]{1,7}(?:[ \t]*[/|][ \t]*[.-]{1,7}|[ \t]+[.-]{1,7}){2,}/g;

/** Samakan simbol mirip titik/strip (dari HP sering jadi — atau •) ke . dan - */
function normalize(text) {
  return text.replace(/[—–−_]/g, "-").replace(/[·•∙]/g, ".");
}

/** Terjemahkan satu deretan Morse. Null kalau ada kode yang nggak dikenal (berarti bukan Morse). */
function decodeRun(run) {
  const words = run.trim().split(/\s*[/|]\s*/);
  const decoded = [];
  for (const word of words) {
    let letters = "";
    for (const code of word.split(/\s+/).filter(Boolean)) {
      const letter = TABLE[code];
      if (!letter) return null;
      letters += letter;
    }
    decoded.push(letters);
  }
  return decoded.join(" ");
}

/**
 * Cari kode Morse di teks dan terjemahkan.
 * Mengembalikan daftar terjemahan (kosong kalau nggak ada Morse).
 */
export function findMorse(text) {
  const results = [];
  for (const run of normalize(text).match(MORSE_RUN) ?? []) {
    const decoded = decodeRun(run);
    if (decoded && decoded.replace(/\s/g, "").length >= 2) results.push(decoded);
  }
  return results;
}
