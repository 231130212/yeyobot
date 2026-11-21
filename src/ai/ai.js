// Otak AI bot: Gemini (gratis) atau Claude (berbayar), dipilih lewat AI_PROVIDER di .env
import Anthropic from "@anthropic-ai/sdk";
import { PERSONA } from "./persona.js";

const PROVIDER = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Bisa diisi beberapa model dipisah koma: dicoba berurutan kalau model sebelumnya penuh/error/jatahnya habis.
// gemini-3.8-flash sengaja nggak dipakai: lebih pintar, tapi sering penuh (503) dan mikirnya lama.
const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? "gemini-3.6-flash,gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_TIMEOUT_MS = 30_000; // kelamaan dari ini -> langsung coba model cadangan

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
  return PROVIDER === "claude" ? `claude / ${CLAUDE_MODEL}` : `gemini / ${GEMINI_MODELS.join(" → ")}`;
}

let anthropic = null; // dibuat saat pertama dipakai

// Kalau yang barusan ngomong adalah orang spesial (nama bertanda ⭐), mode lembut dipertegas.
const GENTLE_MODE = `

MODE LEMBUT AKTIF: pesan terakhir datang dari pembuatmu (nama bertanda ⭐).
- Balas dengan hangat dan manis, kayak sahabat dekat yang sayang. Bercanda boleh, tapi godaannya halus dan bikin senyum, bukan nyindir pedas.
- Dilarang: kata-kata kasar atau merendahkan, nyebut dia bodoh/malas/gagal, dan komentar apa pun soal muka, ekspresi, mata, badan, atau penampilan.
- Kalau dia cerita kebiasaan buruk (misalnya begadang), godain dikit lalu tunjukin kamu peduli.
- Contoh nada yang pas: "Ya ampun, jam 4 pagi? Kamu tuh pejuang atau burung hantu sih. Tidur gih, besok aku mau kamu tetap waras."`;

function systemPrompt(history) {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  // Tanda ⭐ bisa ada di nama pengirim ("[Budi ⭐]: ...") atau target /roast ("ke Budi ⭐")
  const special = typeof lastUser?.content === "string" && lastUser.content.includes("⭐");
  return special ? PERSONA + GENTLE_MODE : PERSONA;
}

// ===== Gemini =====

function toGeminiMessages(history, images) {
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
  return [{ role: "system", content: systemPrompt(history) }, ...messages];
}

async function callGemini(model, messages) {
  let res;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "content_filter") return REFUSAL_REPLY;
  return choice?.message?.content?.trim() || EMPTY_REPLY;
}

async function askGemini(history, images) {
  const messages = toGeminiMessages(history, images);
  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(model, messages);
    } catch (error) {
      lastError = error;
      // Server penuh/error/timeout atau jatah model ini habis (429) -> coba model berikutnya.
      // Error lain (misalnya key salah) -> berhenti, karena model lain juga pasti gagal.
      const retryable = error instanceof GeminiError && (error.status >= 500 || error.status === 429);
      if (!retryable) throw error;
      console.warn(`Model ${model} gagal (${error.status}), mencoba model cadangan...`);
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

async function askClaude(history, images) {
  anthropic ??= new Anthropic(); // otomatis membaca ANTHROPIC_API_KEY
  const response = await anthropic.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: systemPrompt(history),
    messages: toClaudeMessages(history, images),
    output_config: { effort: "low" }, // obrolan santai: cepat dan hemat
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
 */
export async function askAI(history, images = []) {
  const reply = PROVIDER === "claude" ? await askClaude(history, images) : await askGemini(history, images);
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
