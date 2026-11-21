// Link TikTok dan Reels IG biasanya nggak bisa diputar langsung di Discord (harus buka app dulu).
// Bot ganti domain link-nya ke layanan "embed fixer", jadi videonya bisa diputar langsung di chat.
// Bot nggak download video sendiri, jadi hosting nggak kebebanan. Layanan fixer kadang mati atau ganti nama,
// jadi domainnya bisa diganti lewat .env / panel hosting tanpa ubah kode (kosongkan buat mematikan).
import { PermissionFlagsBits } from "discord.js";
import { skipDeleteLog } from "../moderation/moderation.js";

const TIKTOK_DOMAIN = process.env.TIKTOK_EMBED_DOMAIN ?? "tnktok.com";
const INSTAGRAM_DOMAIN = process.env.INSTAGRAM_EMBED_DOMAIN ?? "eeinstagram.com";

// Link yang dibungkus <...> sengaja nggak mau ada preview, jadi dilewati (makanya ada (?<!<) di depan)
// tiktok.com/@user/video/123, vt.tiktok.com/ABC (link pendek dari HP), m.tiktok.com/...
const TIKTOK_LINK = /(?<!<)https?:\/\/(?:(www|m)\.|(vt|vm)\.)?tiktok\.com(\/[^\s<>]+)/gi;
// instagram.com/reel/ID, /reels/ID, /p/ID, /tv/ID (parameter pelacak kayak ?igsh=... dibuang)
const INSTAGRAM_LINK = /(?<!<)https?:\/\/(?:www\.)?instagram\.com\/(reels?|p|tv)\/([\w-]+)[^\s<>]*/gi;

/** Ganti semua link TikTok/IG di teks. Mengembalikan teks baru, atau null kalau nggak ada yang diganti. */
export function fixLinks(text) {
  let changed = false;
  let result = text;
  if (TIKTOK_DOMAIN) {
    result = result.replace(TIKTOK_LINK, (_, __, short, rest) => {
      changed = true;
      return `https://${short ? `${short}.` : ""}${TIKTOK_DOMAIN}${rest}`;
    });
  }
  if (INSTAGRAM_DOMAIN) {
    result = result.replace(INSTAGRAM_LINK, (_, type, id) => {
      changed = true;
      return `https://${INSTAGRAM_DOMAIN}/${type === "reels" ? "reel" : type}/${id}/`;
    });
  }
  return changed ? result : null;
}

/**
 * Kalau pesan berisi link TikTok/IG: hapus pesan aslinya lalu kirim ulang dengan link yang bisa diputar.
 * @param keepOriginal true kalau pesan ini juga bakal dibales AI, jadi jangan dihapus (cukup kirim link-nya)
 * @returns true kalau pesan aslinya dihapus
 */
export async function handleEmbedFix(message, { keepOriginal = false } = {}) {
  if (message.author.bot || message.webhookId || !message.guild) return false;
  const content = fixLinks(message.content);
  if (!content) return false;

  const canDelete = message.channel.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.ManageMessages);
  // Pesan yang ada lampirannya nggak dihapus, biar file-nya nggak hilang
  const repost = canDelete && !keepOriginal && !message.attachments.size;

  try {
    if (!repost) {
      // Nggak bisa/boleh hapus: cukup bales pakai link yang udah dibenerin
      const links = content.match(/https?:\/\/\S+/g)?.filter((l) => l.includes(TIKTOK_DOMAIN) || l.includes(INSTAGRAM_DOMAIN));
      if (links?.length) await message.reply({ content: links.join("\n"), allowedMentions: { parse: [] } });
      return false;
    }

    // Kalau pesan aslinya nge-reply pesan lain, kiriman ulangnya juga nge-reply pesan yang sama
    const replyTo = message.reference?.messageId;
    await message.channel.send({
      content: `<@${message.author.id}> ngirim:\n${content}`.slice(0, 2000),
      allowedMentions: { parse: [] }, // nama pengirimnya ditampilkan tanpa nge-ping
      ...(replyTo ? { reply: { messageReference: replyTo, failIfNotExists: false } } : {}),
    });
    skipDeleteLog(message.id); // ini bukan "pesan dihapus" beneran, jangan masuk log moderasi
    await message.delete();
    return true;
  } catch (error) {
    console.warn("Gagal benerin embed TikTok/IG:", error.message);
    return false;
  }
}
