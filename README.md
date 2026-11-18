# Yeyo Rosting: Bot Discord Sarkas

Bot Discord yang bisa diajak ngobrol dengan gaya sarkas dan satir. Otaknya pakai **Gemini** (gratis, default) atau **Claude** (berbayar).

**Fitur:** ngobrol dan lihat gambar, roasting teman (sampai lagu Spotify-nya), ramalan dan nasihat ngawur, radio di voice channel, moderasi, serta log aktivitas server ala Dyno.

## Undang ke server kamu

[**➕ Tambahkan Yeyo Rosting ke server**](https://discord.com/oauth2/authorize?client_id=1571845991177523230&scope=bot+applications.commands&permissions=1099514866694)

Setelah bot masuk:
1. Di **Server Settings → Roles**, seret role bot ke atas role member biasa (supaya moderasi jalan).
2. Jalankan `/setlog channel:#nama-channel` untuk memilih channel log (opsional).

Bot ini jalan di hosting gratis dan memakai kuota Gemini gratis yang dibagi ke semua server, jadi kadang bisa lambat atau kehabisan jatah ngomong.

## Cara ngobrol

- **Mention** bot di channel mana saja, misalnya `@Yeyo Rosting kenapa senin itu ada?`
- **DM** bot langsung (selama kamu dan bot ada di server yang sama).
- Bikin channel bernama `ngobrol-sama-bot`. Di channel itu bot membalas semua pesan tanpa perlu di-mention.
- **Kirim gambar** (foto, meme, screenshot) sambil mention bot, atau di channel `ngobrol-sama-bot`. Dia akan mengomentarinya. Maksimal 3 gambar per pesan, masing-masing 5 MB.
- Ketik `!reset` atau `/reset` untuk menghapus ingatan obrolan di channel itu.

Bot nggak bisa disuruh nge-tag atau ngatain orang lain lewat chat. Balasannya nggak pernah nge-ping siapa pun (termasuk `@everyone`). Kalau mau nge-roast orang, pakai `/roast`.

## Slash command

| Command | Fungsi |
|---|---|
| `/help` | Panduan buat pengguna baru, dengan menu pilihan kategori |
| `/avatar [target]` | Tampilkan foto profil ukuran besar |
| `/roast target:@teman` | Nge-tag dan nyindir teman secara ringan (yang disindir kelakuannya, bukan fisiknya). Kalau dia lagi dengerin Spotify atau main game, itu ikut jadi bahan |
| `/roastlagu [target]` | Roasting lagu yang lagi didengerin seseorang di Spotify |
| `/ramal [pertanyaan]` | Ramalan nyeleneh ala dukun sok tahu |
| `/nasihat masalah:...` | Nasihat yang kedengarannya bijak tapi nyeleneh |
| `/pilih pilihan:a, b, c [pertanyaan]` | Bingung milih? Bot milihin secara acak plus alasan ngawur |
| `/spam target [jumlah]` | Panggil-panggil seseorang 1–5 kali dengan jeda 2 detik (jeda 1 menit sebelum bisa dipakai lagi) |
| `/reset` | Hapus ingatan bot di channel ini |

`/roastlagu` cuma bisa membaca lagu kalau orangnya menyambungkan Spotify ke Discord, menyalakan "Display Spotify as your status", dan tidak sedang invisible.

## Radio

Bot bisa muter radio online di voice channel. Stasiunnya dicari lewat [Radio Browser](https://www.radio-browser.info) (gratis, ada ribuan radio dari seluruh dunia).

| Command | Fungsi |
|---|---|
| `/radio putar stasiun` | Masuk ke voice channel lo dan muter radio. Ketik nama radio (misalnya `prambors`, `lofi`, `dangdut`), lalu pilih dari daftar yang muncul |
| `/radio sekarang` | Lihat radio yang lagi diputer |
| `/radio stop` | Matikan radio dan keluar dari voice |

Bot keluar sendiri kalau voice channel-nya udah kosong, dan mencoba menyambung ulang kalau stream radionya putus. Bot butuh izin **Connect** dan **Speak** di voice channel.

Bot ini **tidak** memutar lagu dari YouTube atau Spotify: Spotify dikunci DRM, dan memutar YouTube lewat bot melanggar aturan YouTube.

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
| `/setlog [channel] [jenis]` | Pilih channel log untuk server ini (bisa beda tiap server) | Manage Server |
| `/giveaway mulai/akhiri/reroll/batal` | Atur giveaway (lihat bagian Giveaway) | Manage Server |

Pengaman bawaan: tidak bisa menindak diri sendiri, owner server, bot ini, atau orang yang role-nya setara atau lebih tinggi. Bot hanya bisa menindak orang yang role-nya di bawah role bot.

## Giveaway

Khusus staff. Defaultnya cuma yang punya izin **Manage Server** yang bisa pakai.

| Command | Fungsi |
|---|---|
| `/giveaway mulai hadiah durasi [pemenang] [channel] [syarat_role] [keterangan]` | Mulai giveaway. Durasi pakai format `30m`, `2h`, `1d`, `1d12h` (1 menit sampai 30 hari), pemenang 1–20 |
| `/giveaway akhiri giveaway` | Akhiri sekarang dan undi pemenangnya |
| `/giveaway reroll giveaway [jumlah]` | Undi pemenang tambahan (yang udah menang nggak ikut diundi lagi) |
| `/giveaway batal giveaway` | Batalin tanpa pemenang |

Peserta ikut dengan klik tombol 🎉 (klik lagi buat batal ikut). Kalau `syarat_role` diisi, cuma yang punya role itu yang boleh ikut. Pemenang diumumin dan di-tag otomatis waktu durasinya habis. Giveaway tetap jalan walau bot restart, karena datanya disimpan di `data/giveaways.json`.

**Biar role staff bisa pakai tanpa izin Manage Server:** buka **Server Settings → Integrations → Yeyo Rosting → /giveaway**, lalu tambahkan role staff dan centang ✅.

## Log

Pilih channel log pakai `/setlog`. Jenisnya bisa dipisah (`jenis:Moderasi` dan `jenis:Aktivitas server`) atau digabung jadi satu (default). Sebaiknya channel log dibuat privat untuk moderator saja.

**Log moderasi:** pesan yang dihapus dan diedit, serta semua tindakan `/timeout`, `/kick`, `/ban`, `/unban`, dan `/hapus`.

**Log aktivitas server:**
- Masuk, keluar, dan pindah voice channel
- Role ditambah atau dicabut
- Ganti nickname
- Member masuk server (ada peringatan kalau akunnya baru dibuat kurang dari 7 hari) dan keluar server

Kalau server belum pakai `/setlog`, bot otomatis mencari channel bernama `#log-server` (aktivitas) dan `#log-moderasi` (moderasi).

## Ingatan

Bot mengingat 30 pesan terakhir per channel dan menyimpannya di `data/memory.json`, jadi ingatannya **tidak hilang** saat bot restart. Pengaturan `/setlog` disimpan di `data/settings.json`. Folder `data/` tidak ikut ke GitHub karena berisi isi obrolan. Gambar tidak disimpan; di ingatan cuma tercatat "(kirim gambar)".

---

## Bikin versi sendiri

Bagian ini untuk yang mau menjalankan bot ini dengan akun dan kepribadian sendiri.

### 1. Bikin bot di Discord
- Buka https://discord.com/developers/applications, lalu klik **New Application**.
- Di menu **Bot**, klik **Reset Token** dan salin tokennya.
- Masih di menu **Bot**, nyalakan **ketiga** Privileged Gateway Intents: **Presence Intent** (lihat lagu Spotify/game di profil), **Server Members Intent** (log role dan member), dan **Message Content Intent** (baca pesan). Semuanya wajib, kalau tidak bot gagal nyala.
- Di menu **Installation**:
  - **Installation Contexts:** centang **Guild Install** saja.
  - **Install Link:** pilih **Discord Provided Link**.
  - **Default Install Settings → Guild Install:** scope `bot` dan `applications.commands`, lalu centang izin *View Channels, Send Messages, Read Message History, Embed Links, Manage Messages, Kick Members, Ban Members, Moderate Members, Connect, Speak*.
  - Pakai link di **Install Link** untuk mengundang bot ke servermu.

### 2. Ambil API key Gemini (gratis)
Buka https://aistudio.google.com/apikey dan login pakai akun Google.

### 3. Isi konfigurasi
Salin `.env.example` jadi `.env`, lalu isi minimal `DISCORD_TOKEN` dan `GEMINI_API_KEY`.

| Variabel | Fungsi | Default |
|---|---|---|
| `DISCORD_TOKEN` | Token bot Discord (wajib) | – |
| `AI_PROVIDER` | `gemini` atau `claude` | `gemini` |
| `GEMINI_API_KEY` | API key Gemini (wajib kalau pakai Gemini) | – |
| `GEMINI_MODEL` | Daftar model, dicoba berurutan kalau yang pertama penuh | `gemini-3.5-flash-lite,gemini-3.6-flash` |
| `ANTHROPIC_API_KEY` | API key Claude (wajib kalau pakai Claude) | – |
| `CLAUDE_MODEL` | Model Claude | `claude-opus-5-5` |
| `FREE_CHAT_CHANNEL` | Channel tempat bot membalas tanpa di-mention | `ngobrol-sama-bot` |
| `LOG_CHANNEL` | Nama channel log moderasi kalau belum pakai `/setlog` | `log-moderasi` |
| `SERVER_LOG_CHANNEL` | Nama channel log aktivitas kalau belum pakai `/setlog` | `log-server` |
| `SPECIAL_USER_IDS` | ID user (pisahkan koma) yang dapat "mode lembut", selain pembuat bot | – |

**Jangan pernah** menaruh token atau API key asli di `.env.example` atau file lain yang ikut ke GitHub.

### 4. Jalankan di komputer
Butuh **Node.js 22.12 atau lebih baru**.
```
npm install
npm start
```

### 5. Hosting 24 jam (gratis)
Supaya bot tetap nyala walau komputer mati, bot ini bisa dijalankan di [bot-hosting.net](https://bot-hosting.net) (paket gratis, tanpa kartu kredit):
1. Bikin deployment baru dengan source **GitHub**, tempel URL repo publik kamu, branch `main`, dan centang **Pull automatically at every restart**. Tidak perlu menekan **Connect GitHub**, karena itu meminta akses ke semua repo.
2. Pilih runtime **Node.js** versi 22 atau lebih baru.
3. Di tab **Environment**, isi variabel dari tabel di atas. Jadikan `DISCORD_TOKEN` dan API key sebagai **Secret**.
4. Klik **Start**, lalu tunggu sampai console menampilkan `Bot online sebagai ...`.

Catatan:
- **Update kode:** push ke GitHub, lalu klik **Restart** di panel. Bot otomatis mengambil kode terbaru.
- Paket gratis harus **diperpanjang manual tiap 4 hari** di panel. Kalau lupa, bot mati. Biar nggak lupa, bikin channel `#renewal-bot` di server yang owner-nya kamu (pemilik bot): bot akan nge-tag kamu di sana tiap 3 hari (dan tiap 6 jam kalau belum dikonfirmasi), lengkap dengan tombol ke panel dan tombol **Udah diperpanjang**. Nama channel dan link panel bisa diganti lewat `RENEW_CHANNEL` dan `RENEW_PANEL_URL`.
- Jangan menjalankan bot di komputer dan di hosting sekaligus, nanti bot membalas dobel.

### Kuota dan pindah ke Claude
Paket gratis Gemini punya batas jumlah pesan per menit dan per hari. Kalau batasnya habis, fitur AI (ngobrol, roast, ramal, nasihat, pilih) berhenti sementara dan bot bilang jatahnya habis. Fitur lain (radio, moderasi, log, avatar, spam) tetap jalan.

Kalau mau pindah ke Claude (berbayar), ubah variabelnya:
```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=isi_api_key_anthropic_kamu
CLAUDE_MODEL=claude-haiku-5-5
```
`claude-haiku-5-5` paling murah. Hapus `CLAUDE_MODEL` kalau mau pakai model default yang lebih pintar, `claude-opus-5-5`.

### Ganti kepribadian
Edit teks di `persona.js`, lalu restart bot. Di file itu kamu bisa mengubah nama, gaya bicara, dan batasannya. Pembuat bot (pemilik aplikasi di Developer Portal) otomatis mendapat "mode lembut": bot tetap bercanda tapi nggak nyelekit ke dia.
