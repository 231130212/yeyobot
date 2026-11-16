# Yeyo Rosting: Bot Discord Sarkas

Bot Discord yang bisa diajak ngobrol dengan gaya sarkas dan satir. Otaknya bisa pakai **Gemini** (gratis, default) atau **Claude** (berbayar).

## Cara menjalankan

1. **Bikin bot di Discord**
   - Buka https://discord.com/developers/applications, lalu klik **New Application**.
   - Di menu **Bot**, klik **Reset Token** dan salin tokennya.
   - Masih di menu **Bot**, nyalakan **Message Content Intent**. Ini wajib, kalau tidak bot nggak bisa baca pesan.
   - Di menu **OAuth2 → URL Generator**, centang `bot`, lalu centang izin *Send Messages*, *Read Message History*, dan *View Channels*. Buka URL yang muncul untuk mengundang bot ke servermu.

2. **Ambil API key Gemini (gratis)** di https://aistudio.google.com/apikey. Cukup login pakai akun Google.

3. **Isi konfigurasi**: salin `.env.example` jadi `.env`, lalu isi `DISCORD_TOKEN` dan `GEMINI_API_KEY`.

4. **Jalankan**:
   ```
   npm install
   npm start
   ```

## Cara ngobrol

- **Mention** bot di channel mana saja, misalnya `@Yeyo Rosting kenapa senin itu ada?`
- **DM** bot langsung.
- Bikin channel bernama `ngobrol-sama-bot`. Di channel itu bot membalas semua pesan tanpa perlu di-mention.
- Ketik `!reset` untuk menghapus ingatan obrolan di channel itu.

## Pindah ke Claude (berbayar)

Paket gratis Gemini punya batas jumlah pesan per menit dan per hari. Kalau batasnya habis, bot akan bilang jatahnya habis. Kalau suatu saat mau pindah ke Claude, ubah `.env`:

```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=isi_api_key_anthropic_kamu
CLAUDE_MODEL=claude-haiku-5-5
```

`claude-haiku-5-5` paling murah. Hapus baris `CLAUDE_MODEL` kalau mau pakai model default yang lebih pintar, `claude-opus-5-5`.

## Ganti kepribadian

Edit teks di `persona.js`, lalu restart bot. Di file itu kamu bisa mengubah nama, gaya bicara, dan batasannya.
