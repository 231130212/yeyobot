import "./load-env.js"; // harus paling atas
import Anthropic from "@anthropic-ai/sdk";
import { Client, Events, GatewayIntentBits, Partials, ChannelType } from "discord.js";
import { PERSONA } from "./persona.js";

// ===== Pengaturan =====
// "gemini" = gratis (Google AI Studio), "claude" = berbayar (Anthropic)
const PROVIDER = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Bisa diisi beberapa model dipisah koma: dicoba berurutan kalau model sebelumnya penuh/error
const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite,gemini-3.6-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MAX_HISTORY = 30; // jumlah pesan terakhir per channel yang diingat bot
// Nama channel tempat bot membalas SEMUA pesan tanpa perlu di-mention (kosongkan kalau tidak mau)
const FREE_CHAT_CHANNEL = process.env.FREE_CHAT_CHANNEL ?? "ngobrol-sama-bot";

const REFUSAL_REPLY =
  "Hmm, yang itu gue skip dulu ya. Coba topik lain, yang lebih aman buat kesehatan kita bersama.";
const EMPTY_REPLY = "...gue speechless. Itu pujian atau hinaan, lo tentuin sendiri.";

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`${name} belum diisi di file .env`);
    process.exit(1);
  }
}
requireEnv("DISCORD_TOKEN");
if (PROVIDER === "claude") requireEnv("ANTHROPIC_API_KEY");
else if (PROVIDER === "gemini") requireEnv("GEMINI_API_KEY");
else {
  console.error(`AI_PROVIDER "${PROVIDER}" tidak dikenal. Pilih "gemini" atau "claude".`);
  process.exit(1);
}

// Klien Claude hanya dibuat kalau memang dipakai
const anthropic = PROVIDER === "claude" ? new Anthropic() : null;

/** Error dari Gemini, supaya bisa dibedakan saat menangani kesalahan. */
class GeminiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // dibutuhkan supaya bot bisa menerima DM
});

/** Riwayat obrolan per channel: Map<channelId, Anthropic.MessageParam[]> */
const histories = new Map();
/** Antrian per channel supaya balasan tidak saling tumpang tindih */
const queues = new Map();

function getHistory(channelId) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  return histories.get(channelId);
}

function trimHistory(history) {
  while (history.length > MAX_HISTORY) history.shift();
  // Pesan pertama yang dikirim ke API harus dari "user"
  while (history.length && history[0].role !== "user") history.shift();
}

function enqueue(channelId, task) {
  const prev = queues.get(channelId) ?? Promise.resolve();
  const next = prev.then(task, task);
  queues.set(channelId, next.catch(() => {}));
  return next;
}

/** Discord membatasi 2000 karakter per pesan, jadi pecah kalau kepanjangan. */
function splitMessage(text, limit = 1900) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function callGemini(model, history) {
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
        messages: [{ role: "system", content: PERSONA }, ...history],
      }),
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

async function askGemini(history) {
  let lastError;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(model, history);
    } catch (error) {
      lastError = error;
      // Server penuh/error/timeout -> coba model berikutnya. Kuota habis (429) atau key salah -> berhenti.
      if (!(error instanceof GeminiError) || error.status < 500) throw error;
      console.warn(`Model ${model} gagal (${error.status}), mencoba model cadangan...`);
    }
  }
  throw lastError;
}

async function askAI(history) {
  const reply = PROVIDER === "claude" ? await askClaude(history) : await askGemini(history);
  // Buang awalan "[Nama]:" kalau model ikut-ikutan menulisnya
  return reply.replace(/^\s*\[[^\]\n]{1,40}\]:\s*/, "").trim() || EMPTY_REPLY;
}

async function askClaude(history) {
  const response = await anthropic.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: PERSONA,
    messages: history,
    output_config: { effort: "low" }, // obrolan santai: cepat dan hemat
    // Kalau model utama menolak menjawab, API otomatis mencoba model cadangan
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") return REFUSAL_REPLY;

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return text || EMPTY_REPLY;
}

discord.once(Events.ClientReady, (c) => {
  const model = PROVIDER === "claude" ? CLAUDE_MODEL : GEMINI_MODELS.join(" → ");
  console.log(`Bot online sebagai ${c.user.tag} (otak: ${PROVIDER} / ${model})`);
});

discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.users.has(discord.user.id);
  const isFreeChat = FREE_CHAT_CHANNEL && message.channel.name === FREE_CHAT_CHANNEL;
  if (!isDM && !isMentioned && !isFreeChat) return;

  // Hapus mention bot dari teks
  const content = message.content.replace(new RegExp(`<@!?${discord.user.id}>`, "g"), "").trim();

  if (content.toLowerCase() === "!reset") {
    histories.delete(message.channel.id);
    await message.reply("Ingatan gue udah dihapus. Kayak mantan, kita mulai dari nol lagi.");
    return;
  }
  if (!content) {
    await message.reply("Mention doang tanpa ngomong apa-apa? Kode morse ya?");
    return;
  }

  const name = message.member?.displayName ?? message.author.displayName ?? message.author.username;

  await enqueue(message.channel.id, async () => {
    const history = getHistory(message.channel.id);
    history.push({ role: "user", content: `[${name}]: ${content}` });
    trimHistory(history);

    try {
      await message.channel.sendTyping();
      const reply = await askAI(history);
      history.push({ role: "assistant", content: reply });
      trimHistory(history);

      const parts = splitMessage(reply);
      await message.reply(parts[0]);
      for (const part of parts.slice(1)) await message.channel.send(part);
    } catch (error) {
      history.pop(); // buang pesan user yang gagal dijawab supaya riwayat tetap rapi
      if (error instanceof GeminiError && error.status === 429) {
        console.error("Kuota gratis Gemini habis untuk sementara (429).");
        await message
          .reply("Jatah ngomong gratisan gue lagi habis. Namanya juga gratis, ya. Coba lagi nanti.")
          .catch(() => {});
        return;
      } else if (error instanceof GeminiError) {
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
      await message.reply("Otak gue lagi nge-lag. Coba lagi bentar, sabar itu sebagian dari iman.").catch(() => {});
    }
  });
});

discord.login(process.env.DISCORD_TOKEN);
