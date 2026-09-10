# Voler Scam Guard

Bot anti-scam Discord + dashboard admin. Bot memindai link dan gambar di server,
mencocokkannya dengan blacklist lokal serta Google Safe Browsing, lalu
menghapus/memperingatkan/mencatat sesuai setting. Dashboard dipakai moderator
untuk melihat log, mengelola blacklist & whitelist, dan mengatur perilaku bot.

Semua service jalan di satu VPS lewat `docker compose`.

```
Discord  ──▶  bot (Node + discord.js)  ──┐
                                          ├──▶  PostgreSQL
Browser  ──▶  Caddy ──▶ dashboard (Next) ─┘
```

## Fitur

**Bot**
- Deteksi URL: ekstraksi link (termasuk yang diobfuskasi seperti `scam[.]com`
  atau `hxxp://`), whitelist → blacklist lokal → Google Safe Browsing.
- **Deteksi gambar scam tanpa perlu data**: OCR dengan Tesseract, lalu teks
  hasilnya dinilai dengan heuristik pola (giveaway MrBeast palsu, "free Nitro",
  doubling crypto, permintaan OTP). Tidak butuh satu baris pun di blacklist.
- **Pemindaian QR code**: QR di dalam gambar didekode, lalu isinya diperlakukan
  seperti teks lain — link-nya dicek, nomor rekeningnya dicocokkan ke blacklist,
  dan QR pembayaran (QRIS) maupun wallet crypto ditandai ke moderator.
- Teks OCR juga dicocokkan ke blacklist rekening/akun **dan** ke scanner URL
  (link scam di dalam screenshot ikut kena).
- Deteksi rekening yang diketik langsung di pesan.
- Empat mode per server: `auto_delete`, `warn`, `flag_only`, `off`.
- Pesan yang diedit ikut dipindai ulang.
- Mod-log embed ke channel pilihan, plus semua kejadian tercatat di `detection_logs`.
- Ingest laporan dari channel `#blacklist-account-rekening` → masuk antrean `pending`.
- Slash command `/scamguard` untuk blacklist, whitelist, cek cepat, laporan, dan setting.

**Dashboard**
- Login Discord OAuth; hanya user di tabel `admin_users` yang bisa masuk.
- Halaman log dengan filter server/tipe/aksi/rentang waktu + full-text search,
  lengkap dengan teks OCR dan link bukti.
- CRUD blacklist domain & rekening/akun, dengan alur approve/reject laporan.
- CRUD whitelist domain.
- Setting per server dan manajemen admin (role `owner`/`admin`/`moderator`).
- Ringkasan: deteksi 24 jam/7 hari, grafik 14 hari, top domain scam 30 hari.

## Prasyarat

- VPS dengan Docker + Docker Compose (`curl -fsSL https://get.docker.com | sh`)
- Domain yang A record-nya sudah mengarah ke IP VPS
- Aplikasi Discord (bot token + OAuth2 client secret)
- Google Safe Browsing API key (opsional, gratis)

## Setup aplikasi Discord

1. Buka <https://discord.com/developers/applications> → **New Application**.
2. **Bot** → Reset Token → salin ke `DISCORD_TOKEN`.
3. **Bot** → Privileged Gateway Intents → aktifkan **MESSAGE CONTENT INTENT**.
   Tanpa ini bot tidak bisa membaca isi pesan dan tidak akan mendeteksi apa pun.
4. **General Information** → Application ID → `DISCORD_CLIENT_ID`.
5. **OAuth2** → Client Secret → `DISCORD_CLIENT_SECRET`.
6. **OAuth2 → Redirects** → tambahkan `https://<domain-kamu>/api/auth/callback`
   (harus sama persis dengan `DASHBOARD_URL` + `/api/auth/callback`).
7. Undang bot dengan scope `bot applications.commands` dan permission:
   *View Channels, Read Message History, Send Messages, Manage Messages,
   Embed Links*.

## Deploy

```bash
git clone <repo> /opt/voler-scam-guard && cd /opt/voler-scam-guard

cp .env.example .env
openssl rand -base64 48          # tempel hasilnya ke AUTH_SECRET
nano .env                        # isi token, password DB, domain, bootstrap admin

docker compose up -d --build
docker compose logs -f bot
```

Caddy menerbitkan sertifikat Let's Encrypt otomatis begitu domain sudah
mengarah ke VPS. Buka `https://<domain-kamu>` dan login dengan akun Discord yang
ID-nya kamu isi di `BOOTSTRAP_ADMIN_DISCORD_IDS` — akun itu langsung jadi `owner`.

Skema database dibuat otomatis oleh `db/init/*.sql` **saat volume `pgdata` masih
kosong**. Kalau database sudah ada isinya, jalankan SQL-nya manual:

```bash
docker compose exec -T postgres psql -U "$DB_USER" -d voler_scam_guard < db/init/001_init.sql
```

Kalau database sudah dibuat sebelum fitur heuristik ada, jalankan migrasinya:

```bash
docker compose exec -T postgres psql -U "$DB_USER" -d voler_scam_guard < db/init/003_heuristics.sql
```

## Konfigurasi awal di Discord

```
/scamguard settings channel jenis:Mod log      channel:#mod-log
/scamguard settings channel jenis:Channel laporan channel:#blacklist-account-rekening
/scamguard settings mode    mode:Flag only
/scamguard settings show
```

Jalankan beberapa hari dengan `flag_only` dulu untuk melihat rasio salah
deteksi, baru naikkan ke `warn` atau `auto_delete`.

Command lain:

| Command | Guna |
|---|---|
| `/scamguard check nilai:<url\|rekening>` | Cek satu nilai tanpa mengubah data |
| `/scamguard testimage gambar:<file>` | Uji satu gambar: teks OCR + rincian skor heuristik |
| `/scamguard settings heuristic` | Atur mode & ambang heuristik |
| `/scamguard blacklist add-domain` | Blacklist domain |
| `/scamguard blacklist add-account` | Blacklist rekening/akun (langsung `verified`) |
| `/scamguard whitelist add` | Tandai domain aman (mis. midman resmi) |
| `/scamguard report` | Laporkan akun → status `pending` |
| `/scamguard verify id:<n> status:<…>` | Approve/reject laporan |
| `/scamguard stats` | Ringkasan isi database |

## Deteksi gambar scam tanpa blacklist

Mengisi blacklist butuh data yang harus dikumpulkan dulu, sementara gambar scam
yang beredar justru polanya seragam. Karena itu teks hasil OCR juga dinilai oleh
heuristik di `bot/src/services/heuristicScanner.ts` — aturannya ada di kode, jadi
bot langsung berguna sejak menit pertama tanpa admin mengisi apa pun.

Cara kerjanya: teks dinormalisasi (huruf kecil, `FR33 N1TR0` → `free nitro`),
lalu dicocokkan ke kategori berbobot.

| Kategori | Bobot | Contoh |
|---|---|---|
| Alamat wallet crypto | 5 | `0x…`, `bc1…` |
| Minta kredensial | 5 | "kode OTP", "masukkan PIN", "verify your account" |
| Umpan giveaway | 4 | "giveaway", "free nitro", "klaim hadiah", "you won" |
| Skema crypto | 4 | "double your", "connect wallet", "send BTC" |
| Ajakan klik/scan | 3 | "click here", "scan the QR", "klik link" |
| Ada link di gambar | 3 | domain apa pun yang tidak di-whitelist |
| Ada QR code di gambar | 3 | QR apa pun yang berhasil didekode |
| Brand sering dipalsukan | 2 | mrbeast, elon musk, steam, nitro, shopee |
| Tekanan waktu | 2 | "limited time", "buruan", "kuota terbatas" |
| Nominal uang besar | 2 | `$5,000`, `Rp10.000.000` |

Ditandai scam kalau **skor ≥ ambang (default 8) DAN kena minimal 2 kategori** —
syarat dua kategori mencegah satu kata umum seperti "giveaway" memicu deteksi.

Contoh pada sampel uji: gambar giveaway MrBeast palsu = 11, Nitro gratis = 9,
doubling Bitcoin + alamat wallet = 15, phishing OTP m-banking = 8. Sementara
pesan sah seperti "gw dapet giveaway dari shopee kemarin" = 6 dan "bitcoin lagi
turun ya" = 4, keduanya di bawah ambang.

Menyetel sensitivitas:

```
/scamguard settings heuristic mode:Gambar saja ambang:8   # default
/scamguard settings heuristic mode:Gambar saja ambang:7   # lebih sensitif
/scamguard settings heuristic mode:Gambar + teks pesan    # heuristik juga untuk teks chat
/scamguard testimage gambar:<upload>                       # lihat rincian skornya
```

`testimage` menampilkan teks yang dibaca OCR, aturan mana yang kena beserta
bobotnya, dan skor akhir — pakai ini untuk menyetel ambang alih-alih menebak.

**Pengaman salah deteksi**: temuan heuristik yang skornya sedang diberi severity
`medium`, dan dalam mode `auto_delete` pesan bermuatan severity `medium` **tidak
dihapus** — hanya diperingatkan. Penghapusan otomatis disediakan hanya untuk
temuan `high` (blacklist, Safe Browsing, atau skor heuristik ≥ 1.6× ambang).

Mau menambah pola sendiri? Sunting array `RULES` di
`bot/src/services/heuristicScanner.ts`, lalu `docker compose up -d --build bot`.

### QR code

Gambar scam makin sering memakai QR alih-alih link tertulis, supaya tujuannya
tidak kelihatan dan tidak bisa disalin. Bot mendekode QR dengan `jsqr` (murni
JavaScript, tanpa native build) dan memperlakukan isinya seperti teks lain di
gambar:

- **QR berisi link** → dicek ke whitelist, blacklist, lalu Safe Browsing. Kalau
  kena, log-nya bertipe `image_qr` supaya bisa dibedakan dari link tertulis.
- **QR berisi nomor rekening / username** → dicocokkan ke blacklist akun.
- **QR pembayaran QRIS** → ditandai `medium` beserta nama merchant-nya (dibaca
  dari tag 59 payload EMVCo), karena QR pembayaran di poster "giveaway" berarti
  korban diarahkan mengirim uang.
- **QR berisi alamat wallet crypto** (`bitcoin:`, `ethereum:`) → ditandai `medium`.
- Keberadaan QR juga menambah +3 ke skor heuristik, tapi hanya kalau ada sinyal
  lain — QR sendirian itu wajar (pembayaran toko, tiket, undangan).

Isi QR ikut disimpan ke kolom `ocr_text` dengan prefiks `[QR]`, jadi terlihat di
halaman log dan di `/scamguard testimage`. Gambar yang isinya **hanya** QR tanpa
teks sama sekali tetap diperiksa — pemindaian QR tidak bergantung pada hasil OCR.

Matikan lewat `SCAN_QR_CODES=false` di `.env` kalau tidak diperlukan.

## Development lokal

```bash
docker compose up -d postgres

cd bot       && npm install && cp ../.env .env && npm run dev
cd dashboard && npm install && npm run dev     # http://localhost:3000
```

Untuk dev, set `DASHBOARD_URL=http://localhost:3000` dan tambahkan redirect URI
yang sama di Discord OAuth2. Slash command didaftarkan global saat bot start
(propagasi bisa sampai 1 jam); untuk server tes gunakan `GUILD_ID=<id> npm run register`
yang langsung berlaku.

Perintah bantu di root:

```bash
npm run typecheck     # typecheck bot + dashboard
npm run sync:schema   # salin bot/src/db/schema.ts -> dashboard/lib/db/schema.ts
npm run logs          # docker compose logs -f bot dashboard
```

## Backup

```bash
./scripts/backup.sh                      # dump terkompresi ke ./backups
./scripts/restore.sh backups/xxx.sql.gz  # restore
```

Pasang di cron VPS:

```
0 3 * * * /opt/voler-scam-guard/scripts/backup.sh >> /var/log/vsg-backup.log 2>&1
```

Isi `BACKUP_REMOTE` di `.env` (mis. `b2:voler-backups/scamguard`) kalau `rclone`
sudah dikonfigurasi, supaya backup ikut terkirim ke penyimpanan offsite.

## Struktur project

```
voler-scam-guard/
├── docker-compose.yml
├── .env.example
├── db/init/            # SQL schema + seed (dijalankan postgres saat init)
├── caddy/Caddyfile     # reverse proxy + auto HTTPS
├── scripts/            # backup, restore, sync schema
├── bot/
│   └── src/
│       ├── index.ts            # bootstrap client, register command, shutdown
│       ├── config.ts           # validasi env (zod)
│       ├── commands/           # slash command /scamguard
│       ├── events/             # messageCreate, messageUpdate, interactionCreate, …
│       ├── services/
│       │   ├── detector.ts        # pipeline scan satu pesan
│       │   ├── urlScanner.ts      # ekstraksi URL + Safe Browsing (dengan cache)
│       │   ├── ocrScanner.ts      # Tesseract worker
│       │   ├── qrScanner.ts       # decode QR code + parser merchant QRIS
│       │   ├── imageScanner.ts    # unduh gambar sekali -> OCR + QR
│       │   ├── heuristicScanner.ts # skor pola scam untuk teks hasil OCR
│       │   ├── blacklistCheck.ts  # blacklist/whitelist + cache memori
│       │   ├── reportIntake.ts    # ingest channel laporan
│       │   ├── settings.ts        # setting per guild
│       │   └── actions.ts         # delete/warn/flag + mod-log + tulis log
│       ├── db/                 # pool postgres + skema drizzle
│       └── util/               # logger, normalisasi teks/domain/identifier
└── dashboard/
    ├── app/                    # login, ringkasan, logs, blacklist, whitelist, settings
    ├── components/             # Shell, Nav, primitives
    ├── lib/                    # auth (OAuth + sesi JWT), db, queries, normalisasi
    └── middleware.ts           # proteksi semua route non-publik
```

## Catatan operasional

- **OCR**: file `*.traineddata` diunduh sekali saat bot pertama jalan dan
  disimpan di volume `tessdata`. Deteksi gambar baru aktif setelah unduhan
  selesai — cek log `[ocr] Tesseract worker siap`. `OCR_LANGS=eng` lebih ringan
  kalau CPU VPS terbatas.
- **Biaya per gambar**: satu gambar diunduh sekali lalu dipakai bersama oleh OCR
  dan pemindai QR. OCR adalah bagian yang lambat (hitungan detik); decode QR
  hanya ratusan milidetik.
- **Cache**: blacklist di-cache 60 detik dan setting per server 30 detik, jadi
  perubahan dari dashboard berlaku maksimal setelah jeda itu.
- **Safe Browsing**: hasilnya di-cache 12 jam di tabel `url_scan_cache`. Kalau
  API key kosong, deteksi URL tetap jalan memakai blacklist lokal saja.
- **Skema drizzle diduplikasi** di `bot/src/db/schema.ts` dan
  `dashboard/lib/db/schema.ts` karena kedua service punya `node_modules` sendiri.
  Ubah versi bot, lalu jalankan `npm run sync:schema`. Perubahan kolom juga harus
  ditulis sebagai file SQL baru di `db/init/`.
- **Heuristik vs blacklist**: heuristik menangkap pola scam yang umum tanpa data;
  blacklist tetap berguna untuk kasus spesifik komunitas kamu (rekening penipu
  tertentu, domain midman palsu). Keduanya jalan bersamaan.
- **Laporan dari channel** selalu masuk sebagai `pending` dan tidak memblokir
  siapa pun sampai di-approve — ini mencegah orang menyalahgunakan bot untuk
  memblacklist rekening lawan.
