// Otak AI bot: Gemini (gratis) atau Claude (berbayar), dipilih lewat AI_PROVIDER di .env
import Anthropic from "@anthropic-ai/sdk";
import { PERSONA } from "./persona.js";
import { calculate, CALCULATOR_TOOL } from "./calculator.js";

const PROVIDER = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Bisa diisi beberapa model dipisah koma: dicoba berurutan kalau model sebelumnya penuh/error/jatahnya habis.
// gemini-3.8-flash sengaja nggak dipakai: lebih pintar, tapi sering penuh (503) dan mikirnya lama.
const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? "gemini-3.6-flash,gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
// Model pintar khusus /tanya: lebih lambat dan jatah gratisnya kecil, jadi cuma dipakai buat soal
const GEMINI_SMART_MODEL = process.env.GEMINI_SMART_MODEL ?? "gemini-3.8-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_TIMEOUT_MS = 30_000; // kelamaan dari ini -> langsung coba model cadangan
const GEMINI_SMART_TIMEOUT_MS = 60_000; // model pintar mikirnya lama, jadi dikasih waktu lebih
const MAX_TOOL_ROUNDS = 5; // maksimal berapa kali AI boleh pakai kalkulator dalam satu jawaban

export const REFUSAL_REPLY =
  "Hmm, yang itu gue skip dulu ya. Coba topik lain, yang lebih aman buat kesehatan kita bersama.";
const EMPTY_REPLY = "...gue speechless. Itu pujian atau hinaan, lo tentuin sendiri.";

/** Error dari Gemini, supaya bisa dibedakan saat menangani kesalahan. */
class GeminiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Cek pengaturan wajib. Mengembalikan pesan error, atau null kalau semua lengkap. */
export function checkConfig() {
  if (PROVIDER === "claude") return process.env.ANTHROPIC_API_KEY ? null : "ANTHROPIC_API_KEY belum diisi";
  if (PROVIDER === "gemini") return process.env.GEMINI_API_KEY ? null : "GEMINI_API_KEY belum diisi";
  return `AI_PROVIDER "${PROVIDER}" tidak dikenal. Pilih "gemini" atau "claude".`;
}

export function describeModel() {
  return PROVIDER === "claude"
    ? `claude / ${CLAUDE_MODEL}`
    : `gemini / ${GEMINI_MODELS.join(" → ")}, /tanya: ${GEMINI_SMART_MODEL}`;
}

let anthropic = null; // dibuat saat pertama dipakai

// Kalau yang barusan ngomong adalah orang spesial (nama bertanda ⭐), mode lembut dipertegas.
const GENTLE_MODE = `

MODE LEMBUT AKTIF: pesan terakhir datang dari pembuatmu (nama bertanda ⭐).
- Balas dengan hangat dan manis, kayak sahabat dekat yang sayang. Bercanda boleh, tapi godaannya halus dan bikin senyum, bukan nyindir pedas.
- Dilarang: kata-kata kasar atau merendahkan, nyebut dia bodoh/malas/gagal, dan komentar apa pun soal muka, ekspresi, mata, badan, atau penampilan.
- Kalau dia cerita kebiasaan buruk (misalnya begadang), godain dikit lalu tunjukin kamu peduli.
- Contoh nada yang pas: "Ya ampun, jam 4 pagi? Kamu tuh pejuang atau burung hantu sih. Tidur gih, besok aku mau kamu tetap waras."`;

// Dipakai kalau user pakai /tanya: jawabannya harus benar dulu, bercanda belakangan.
const SMART_MODE = `

MODE SOAL AKTIF: user lagi pakai /tanya buat nanya soal atau pertanyaan serius.
- Prioritas utama: jawabannya BENAR. Kerjain dengan teliti, cek ulang sebelum jawab.
- Tulis langkah-langkahnya singkat dan rapi, lalu jawaban akhirnya ditebalkan (**bold**). Boleh lebih panjang dari biasanya, tapi tetap di bawah 1500 karakter.
- Discord NGGAK bisa nampilin LaTeX, jadi jangan pakai $...$, $$...$$, \\sqrt, \\frac, dan sejenisnya. Tulis rumus pakai teks biasa, contoh: √(13² − 5²) = √144 = 12 m, atau (a + b) / 2.
- Kalau ada hitungan, pakai alat "hitung", jangan ngitung di kepala.
- Sindiran cukup satu kalimat pendek di awal atau akhir. Jangan sampai bercandanya bikin jawabannya ketutupan.
- Kalau soalnya nggak jelas atau datanya kurang, bilang aja apa yang kurang, jangan ngarang.`;

/** Tanggal dan jam sekarang (WIB), biar AI nggak nebak-nebak hari ini tanggal berapa. */
function currentTime() {
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  return `\n\nWaktu sekarang: ${formatted} WIB. Pakai ini kalau ditanya soal tanggal, hari, umur, atau hitung mundur.`;
}

function systemPrompt(history, smart) {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  // Tanda ⭐ bisa ada di nama pengirim ("[Budi ⭐]: ...") atau target /roast ("ke Budi ⭐")
  const special = typeof lastUser?.content === "string" && lastUser.content.includes("⭐");
  return PERSONA + (special ? GENTLE_MODE : "") + (smart ? SMART_MODE : "") + currentTime();
}

/** Jalankan alat yang diminta AI, hasilnya dikirim balik ke AI sebagai teks. */
function runTool(call) {
  if (call.function?.name !== "hitung") return `Error: alat "${call.function?.name}" nggak ada.`;
  let expression = "";
  try {
    expression = JSON.parse(call.function.arguments || "{}").ekspresi ?? "";
    const result = calculate(expression);
    console.log(`[hitung] ${expression} = ${result}`);
    return `Hasil: ${result}`;
  } catch (error) {
    console.log(`[hitung] ${expression} -> error: ${error.message}`);
    return `Error: ${error.message}. Perbaiki rumusnya lalu coba lagi.`;
  }
}

// ===== Gemini =====

function toGeminiMessages(history, images, smart) {
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  if (images.length) {
    const last = messages[messages.length - 1];
    last.content = [
      { type: "text", text: last.content },
      ...images.map((img) => ({
        type: "image_url",
        image_url: { url: `data:${img.mediaType};base64,${img.data}` },
      })),
    ];
  }
  return [{ role: "system", content: systemPrompt(history, smart) }, ...messages];
}

/** Satu kali panggil Gemini. Mengembalikan "choice" mentah dari API. */
async function callGemini(model, messages, { timeoutMs, allowTools }) {
  let res;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: [CALCULATOR_TOOL],
        tool_choice: allowTools ? "auto" : "none", // jatah pakai alat habis -> paksa langsung jawab
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Timeout atau koneksi putus: anggap seperti server sibuk supaya model cadangan dicoba
    throw new GeminiError(503, `${model}: ${error.name === "TimeoutError" ? "timeout" : error.message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(res.status, `${model}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0];
}

/** Minta jawaban dari satu model. Kalau AI minta pakai kalkulator, hitung lalu kirim hasilnya balik. */
async function runGemini(model, baseMessages, timeoutMs) {
  const messages = [...baseMessages];
  for (let round = 0; ; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS;
    const choice = await callGemini(model, messages, { timeoutMs, allowTools });
    if (choice?.finish_reason === "content_filter") return REFUSAL_REPLY;

    const message = choice?.message;
    const calls = message?.tool_calls ?? [];
    if (!calls.length) return message?.content?.trim() || EMPTY_REPLY;

    // Pesan AI dikirim balik apa adanya: Gemini nyelipin "tanda tangan pikiran" di situ dan wajib ada
    messages.push(message);
    for (const call of calls) messages.push({ role: "tool", tool_call_id: call.id, content: runTool(call) });
  }
}

async function askGemini(history, images, smart) {
  const messages = toGeminiMessages(history, images, smart);
  // /tanya: coba model pintar dulu, kalau gagal/penuh/jatah habis turun ke model biasa
  const models = smart ? [GEMINI_SMART_MODEL, ...GEMINI_MODELS.filter((m) => m !== GEMINI_SMART_MODEL)] : GEMINI_MODELS;
  let lastError;
  for (const model of models) {
    try {
      const timeoutMs = model === GEMINI_SMART_MODEL ? GEMINI_SMART_TIMEOUT_MS : GEMINI_TIMEOUT_MS;
      return await runGemini(model, messages, timeoutMs);
    } catch (error) {
      lastError = error;
      // Server penuh/error/timeout atau jatah model ini habis (429) -> coba model berikutnya.
      // Error lain (misalnya key salah) -> berhenti, karena model lain juga pasti gagal.
      const retryable = error instanceof GeminiError && (error.status >= 500 || error.status === 429);
      if (!retryable) throw error;
      console.warn(`Model ${model} gagal (${error.status}: ${error.message.slice(model.length + 2, 120)}), mencoba model cadangan...`);
    }
  }
  throw lastError;
}

// ===== Claude =====

function toClaudeMessages(history, images) {
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  if (images.length) {
    const last = messages[messages.length - 1];
    last.content = [
      ...images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      })),
      { type: "text", text: last.content },
    ];
  }
  return messages;
}

async function askClaude(history, images, smart) {
  anthropic ??= new Anthropic(); // otomatis membaca ANTHROPIC_API_KEY
  const response = await anthropic.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: smart ? 8000 : 4000,
    system: systemPrompt(history, smart),
    messages: toClaudeMessages(history, images),
    output_config: { effort: smart ? "medium" : "low" }, // obrolan santai: cepat dan hemat; /tanya: lebih teliti
    // Kalau model utama menolak menjawab, API otomatis mencoba model cadangan
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") return REFUSAL_REPLY;

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

// ===== Dipakai dari luar =====

/**
 * Minta jawaban dari AI.
 * @param history daftar pesan {role, content} (teks saja); pesan terakhir harus dari user
 * @param images gambar untuk pesan terakhir: [{ mediaType, data (base64) }]
 * @param smart true untuk /tanya: pakai model paling pintar dan jawab lebih teliti
 */
export async function askAI(history, images = [], { smart = false } = {}) {
  const reply =
    PROVIDER === "claude" ? await askClaude(history, images, smart) : await askGemini(history, images, smart);
  // Buang awalan "[Nama]:" di awal baris mana pun kalau model ikut-ikutan menulisnya
  return (
    reply
      .replace(/^[ \t]*\[[^\]\n]{1,40}\]:[ \t]*/gm, "")
      .replace(/ ?⭐/g, "") // tanda orang spesial, jangan sampai ikut ditulis
      .trim() || EMPTY_REPLY
  );
}

/** Catat error ke console dan kembalikan pesan lucu untuk dikirim ke Discord. */
export function errorReply(error) {
  if (error instanceof GeminiError && error.status === 429) {
    console.error("Kuota gratis Gemini habis untuk sementara (429).");
    return "Jatah ngomong gratisan gue lagi habis. Namanya juga gratis, ya. Coba lagi nanti.";
  }
  if (error instanceof GeminiError) {
    console.error(`Gemini API error ${error.status}:`, error.message);
  } else if (error instanceof Anthropic.AuthenticationError) {
    console.error("ANTHROPIC_API_KEY salah atau tidak valid.");
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("Kena rate limit dari Claude API.");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Claude API error ${error.status}:`, error.message);
  } else {
    console.error(error);
  }
  return "Otak gue lagi nge-lag. Coba lagi bentar, sabar itu sebagian dari iman.";
}
