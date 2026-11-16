# Yeyo Rosting: Bot Discord Sarkas

Bot Discord yang bisa diajak ngobrol dengan gaya sarkas dan satir. Otaknya bisa pakai **Gemini** (gratis, default) atau **Claude** (berbayar).

## Cara menjalankan

1. **Bikin bot di Discord**
   - Buka https://discord.com/developers/applications, lalu klik **New Application**.
   - Di menu **Bot**, klik **Reset Token** dan salin tokennya.
   - Masih di menu **Bot**, nyalakan **Message Content Intent** dan **Presence Intent**. Keduanya wajib: yang pertama supaya bot bisa baca pesan, yang kedua supaya bot bisa lihat lagu Spotify/game di profil orang.
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
- **Kirim gambar** (foto, meme, screenshot) sambil mention bot, atau di channel `ngobrol-sama-bot`. Dia akan mengomentarinya. Maksimal 3 gambar per pesan, masing-masing 5 MB.
- Ketik `!reset` atau `/reset` untuk menghapus ingatan obrolan di channel itu.

## Slash command

| Command | Fungsi |
|---|---|
| `/avatar [target]` | Tampilkan foto profil ukuran besar |
| `/roast target:@teman` | Sindir teman secara ringan (yang disindir kelakuannya, bukan fisiknya). Kalau dia lagi dengerin Spotify atau main game, itu ikut jadi bahan |
| `/roastlagu [target]` | Roasting lagu yang lagi didengerin seseorang di Spotify |
| `/ramal [pertanyaan]` | Ramalan nyeleneh ala dukun sok tahu |
| `/nasihat masalah:...` | Nasihat yang kedengarannya bijak tapi nyeleneh |
| `/spam target [jumlah]` | Panggil-panggil seseorang 1–5 kali dengan jeda 2 detik (jeda 1 menit sebelum bisa dipakai lagi) |
| `/reset` | Hapus ingatan bot di channel ini |

Slash command didaftarkan otomatis setiap bot menyala.

## Moderasi

Command ini hanya muncul untuk orang yang punya izin yang sesuai di server.

| Command | Fungsi | Izin yang dibutuhkan |
|---|---|---|
| `/timeout target durasi [alasan]` | Bisukan sementara (1 menit sampai 1 minggu) | Moderate Members |
| `/untimeout target [alasan]` | Cabut timeout | Moderate Members |
| `/kick target [alasan]` | Keluarkan dari server | Kick Members |
| `/ban target [alasan] [hapus_pesan]` | Ban, bisa sekalian hapus pesannya | Ban Members |
| `/unban user_id [alasan]` | Cabut ban (pakai ID user) | Ban Members |
| `/hapus jumlah` | Hapus 1–100 pesan terakhir di channel | Manage Messages |

Pengaman bawaan: tidak bisa menindak diri sendiri, owner server, bot ini, atau orang yang role-nya setara atau lebih tinggi.

**Supaya moderasi jalan:**
1. Undang bot dengan izin tambahan: *Moderate Members, Kick Members, Ban Members, Manage Messages, Embed Links*.
2. Di **Server Settings → Roles**, seret role bot ke **atas** role member biasa. Bot hanya bisa menindak orang yang role-nya di bawah role bot.
3. (Opsional) Buat channel `#log-moderasi`, sebaiknya privat untuk moderator saja. Bot akan mencatat tindakan moderasi serta pesan yang dihapus dan diedit di sana.

## Ingatan

Bot mengingat 30 pesan terakhir per channel dan menyimpannya di `data/memory.json`, jadi ingatannya **tidak hilang** saat bot restart. Folder `data/` tidak ikut ke GitHub karena berisi isi obrolan. Gambar tidak disimpan; di ingatan cuma tercatat "(kirim gambar)".

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
