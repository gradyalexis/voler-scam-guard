# Voler Scam Guard

Bot anti-scam Discord. Bot memindai link dan gambar di server, mencocokkannya
dengan blacklist lokal serta Google Safe Browsing, lalu
menghapus/memperingatkan/mencatat sesuai setting.

Dashboard admin (login Discord, log deteksi, CRUD blacklist/whitelist, setting
per server) ada di repo terpisah **voler-scam-guard-dashboard**. Repo ini tetap
pemilik skema database: migrasi, RLS, role read-only, dan backup ada di sini.

```
Discord  ──▶  bot (repo ini)                ──┐
                                               ├──▶  PostgreSQL (Supabase)
Browser  ──▶  voler-scam-guard-dashboard    ──┘      skema & migrasi: repo ini
```

## Fitur

- Deteksi URL: ekstraksi link, whitelist → blacklist lokal → Google Safe Browsing.
  Link yang **disamarkan** (`scam[.]com`, `hxxp://`, `scam . com`, `scam,com`,
  huruf fullwidth/Kiril, titik Unicode) langsung dianggap berbahaya tanpa
  menunggu Safe Browsing. Angka samaran (`s0akw1n.com`) ikut dicocokkan ke blacklist.
- **Deteksi gambar scam tanpa perlu data**: OCR dengan Tesseract, lalu teks
  hasilnya dinilai dengan heuristik pola (giveaway MrBeast palsu, "free Nitro",
  doubling crypto, permintaan OTP). Tidak butuh satu baris pun di blacklist.
- **Pemindaian QR code**: QR di dalam gambar didekode, lalu isinya diperlakukan
  seperti teks lain — link-nya dicek, nomor rekeningnya dicocokkan ke blacklist,
  dan QR pembayaran (QRIS) maupun wallet crypto ditandai ke moderator.
- **Review gambar dengan AI (opsional)**: gambar yang lolos heuristik tapi punya
  tanda mencurigakan dinilai AI (Gemini, Groq, OpenRouter — dirotasi). Lihat [Review gambar AI](#review-gambar-ai).
- Teks OCR juga dicocokkan ke blacklist rekening/akun **dan** ke scanner URL
  (link scam di dalam screenshot ikut kena).
- Deteksi rekening yang diketik langsung di pesan.
- Lima mode per server: `auto_delete`, `warn_delete`, `warn`, `flag_only`, `off`.
- Pesan yang diedit ikut dipindai ulang.
- Mod-log embed ke channel pilihan, plus semua kejadian tercatat di `detection_logs`.
- Ingest laporan dari channel `#blacklist-account-rekening` → masuk antrean `pending`.
- Semua pengaturan, blacklist, whitelist, dan review laporan lewat dashboard —
  bot tidak punya slash command.
- **Dipasang sendiri (self-hosted)**: setiap orang menjalankan bot dan dashboard
  miliknya sendiri. Hanya `BOT_OWNER_IDS` yang bisa login ke dashboard, dan bot
  otomatis keluar dari server yang tidak dikelola `BOT_OWNER_IDS`, supaya kuota
  AI, CPU OCR, dan database kamu tidak dipakai server orang lain.

## Prasyarat

- VPS dengan Docker + Docker Compose (`curl -fsSL https://get.docker.com | sh`)
- Project Supabase (paket gratis cukup)
- Aplikasi Discord (bot token)
- Google Safe Browsing API key (opsional, gratis)

## Setup aplikasi Discord

1. Buka <https://discord.com/developers/applications> → **New Application**.
2. **Bot** → Reset Token → salin ke `DISCORD_TOKEN`.
3. **Bot** → Privileged Gateway Intents → aktifkan **MESSAGE CONTENT INTENT**.
   Tanpa ini bot tidak bisa membaca isi pesan dan tidak akan mendeteksi apa pun.
4. **General Information** → Application ID → `DISCORD_CLIENT_ID`.
5. Bot dipasang ke server lewat dashboard (tombol **Pasang bot**), dengan scope
   `bot` dan permission *View Channels, Read Message History, Send Messages,
   Manage Messages, Embed Links*.
6. **Bot** → matikan **Public Bot**. Bot tetap keluar sendiri dari server yang
   tidak dikelola `BOT_OWNER_IDS`, tapi dengan Public Bot mati orang lain bahkan
   tidak bisa mengundangnya.

Client Secret, redirect OAuth2, dan pengaturan **Requires OAuth2 Code Grant**
(supaya bot tidak bisa dipasang lewat link invite biasa) dijelaskan di README
repo dashboard.

### Siapa bisa apa

| | Pemilik (`BOT_OWNER_IDS`) | Member server |
|---|---|---|
| Login dashboard: setting, blacklist, whitelist, review laporan | ✅ | ❌ |
| Server tempat bot boleh tinggal | Yang dia miliki / Administrator / Manage Server | — |
| Laporan lewat channel laporan | ✅ | ✅ → `pending` |

`BOT_OWNER_IDS` wajib diisi di `.env` bot **dan** `.env` dashboard dengan nilai
yang sama. Tanpa itu bot dan dashboard menolak start.

Blacklist berlaku di semua server yang memasang bot, jadi moderator satu server
tidak boleh bisa memblokir (atau membuka) domain untuk server lain.

## Setup Supabase

1. Buat project di <https://supabase.com/dashboard>. Simpan database password-nya.
2. **Connect** → **Session pooler** → salin connection string ke `DATABASE_URL`
   (ganti `[YOUR-PASSWORD]`; karakter `@ : / ? # %` di password harus di-URL-encode).
   Jangan pakai *Direct connection*: alamatnya hanya IPv6, sedangkan Docker
   umumnya belum punya jalur IPv6.
3. **Project Settings → Database → SSL Configuration** → *Download certificate*,
   simpan sebagai `certs/supabase-ca.crt`. Di halaman yang sama aktifkan
   **Enforce SSL on incoming connections**.
4. Isi `DB_PROVIDER=supabase`, `DATABASE_SSL_CA_FILE=certs/supabase-ca.crt`, dan
   `DB_RO_PASSWORD` (`openssl rand -hex 24`) di `.env`.
5. Buat skema dan role read-only:

   ```bash
   ./scripts/migrate.sh
   ./scripts/create-readonly-role.sh
   ```

6. Buka **Advisors → Security Advisor** — tidak boleh ada peringatan
   *RLS Disabled in Public*.

### Kenapa RLS wajib

Supabase membuka schema `public` lewat Data API (REST/GraphQL) yang bisa
dipanggil siapa pun dengan anon key — dan anon key memang bukan rahasia. Tanpa
pengaman, orang luar bisa menambahkan dirinya ke `admin_users` sebagai `owner`,
membaca `detection_logs` (isi pesan dan ID member Discord), atau mengubah
blacklist/whitelist.

Bot maupun dashboard tidak memakai Data API: keduanya konek langsung ke Postgres
sebagai `postgres`, pemilik tabel, yang tidak terkena RLS. Karena itu
`db/init/004_supabase_rls.sql` mengaktifkan RLS di **semua** tabel `public`
tanpa policy (menolak semua akses) dan mencabut hak `anon`/`authenticated`,
termasuk untuk tabel yang dibuat nanti. Kalau Data API memang tidak dipakai,
kamu juga bisa mematikannya di **Project Settings → Data API**.

**Setiap menambah tabel**: tulis migrasinya di `db/init/`, lalu jalankan ulang
`./scripts/migrate.sh` (004 ikut mengaktifkan RLS di tabel baru) dan
`./scripts/create-readonly-role.sh` (policy baca untuk `vsg_ro`).

### Koneksi & SSL

- Bot memverifikasi sertifikat Supabase dengan CA di `DATABASE_SSL_CA_FILE`.
  Kalau host `*.supabase.com`/`*.supabase.co` dipakai tanpa CA, bot menolak
  start — tidak pernah diam-diam konek tanpa TLS.
- Parameter `sslmode` di `DATABASE_URL` diabaikan; SSL selalu diatur lewat CA.
- Session pooler punya batas koneksi (**Project Settings → Database →
  Connection pooling → Pool Size**). `BOT_DB_POOL_MAX` (default 5) ditambah
  `DASHBOARD_DB_POOL_MAX` di repo dashboard (default 3) harus di bawah angka itu,
  termasuk kalau kamu menjalankan instance dev ke project yang sama.

## Deploy

```bash
git clone <repo> /opt/voler-scam-guard && cd /opt/voler-scam-guard

cp .env.example .env
openssl rand -hex 24             # tempel hasilnya ke DB_RO_PASSWORD
nano .env                        # isi token Discord dan DATABASE_URL Supabase
# simpan CA cert Supabase ke certs/supabase-ca.crt (lihat "Setup Supabase")

./scripts/migrate.sh             # buat/upgrade skema, aman diulang
./scripts/create-readonly-role.sh

docker compose up -d --build
docker compose logs -f bot

curl http://localhost:9000/health   # cek bot hidup
```

Bot tidak melayani HTTP apa pun selain endpoint health itu — koneksi ke Discord
berupa WebSocket keluar. `GET /health` mengembalikan 200 kalau gateway sudah
`ready` dan query `SELECT 1` ke database berhasil, 503 kalau tidak:

```json
{ "status": "ok", "discord": "ready", "db": "ok", "uptime": 1234 }
```

Endpoint yang sama dipakai `HEALTHCHECK` di image, jadi `docker compose ps`
menampilkan `healthy`/`unhealthy`. Port-nya diikat ke `127.0.0.1:9000` di
`docker-compose.yml` (hapus prefix `127.0.0.1:` kalau perlu diakses dari luar,
atau set `HEALTH_PORT=0` di `.env` untuk mematikan servernya).

Semua file `db/init/*.sql` ditulis idempoten, dan `./scripts/migrate.sh`
menjalankan semuanya berurutan — jalankan lagi setiap kali ada file migrasi baru.
Dengan `DB_PROVIDER=local`, container Postgres juga menjalankannya otomatis saat
volume `pgdata` masih kosong.

Dashboard dideploy dari repo `voler-scam-guard-dashboard` (boleh di VPS yang
sama; compose project-nya terpisah, dan dipublikasikan di port 9001 sehingga
tidak bentrok dengan 9000 di sini). Jalankan migrasi di repo ini lebih dulu.

## Konfigurasi awal

Login ke dashboard → pilih server → **Setting bot**: isi channel ID mod-log dan
channel laporan (klik kanan channel → *Copy Channel ID*, butuh Developer Mode di
Discord), lalu pilih mode.

Mode yang tersedia:

| Mode | Yang terjadi saat ada temuan |
|---|---|
| `auto_delete` | Pesan dihapus diam-diam, pengirim dapat DM. Paling bersih, tapi member lain tidak tahu ada yang dihapus. |
| `warn_delete` | Pesan dihapus, lalu bot mengumumkan di channel itu (menyebut pengirimnya, tanpa ping) dan DM pengirim. |
| `warn` | Bot membalas pesannya dengan peringatan. Pesan tidak dihapus. |
| `flag_only` | Tidak ada apa pun di channel — hanya dicatat ke `detection_logs` dan dikirim ke mod-log. |
| `off` | Scanner mati di server itu. |

Jalankan beberapa hari dengan `flag_only` dulu untuk melihat rasio salah
deteksi, baru naikkan ke `warn`, `warn_delete`, atau `auto_delete`.

`flag_only` tanpa mod-log channel berarti benar-benar senyap — kalau ingin
melihat bot bekerja, set mod-log channel dulu atau pakai mode yang lebih aktif.

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

Menyetel sensitivitas: dashboard → server → **Setting bot** → *Heuristik pola
scam* (mode `images` / `all` / `off`) dan *Ambang skor* (default 8; lebih kecil =
lebih sensitif). Jalankan dengan mode `flag_only` dulu: mod-log dan halaman log
menampilkan teks OCR, aturan yang kena beserta bobotnya, dan skor akhir — pakai
itu untuk menyetel ambang alih-alih menebak.

**Pengaman salah deteksi**: temuan heuristik yang skornya sedang diberi severity
`medium`, dan dalam mode `auto_delete` maupun `warn_delete` pesan bermuatan
severity `medium` **tidak dihapus** — hanya diperingatkan. Penghapusan otomatis disediakan hanya untuk
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
halaman log. Gambar yang isinya **hanya** QR tanpa
teks sama sekali tetap diperiksa — pemindaian QR tidak bergantung pada hasil OCR.

Matikan lewat `SCAN_QR_CODES=false` di `.env` kalau tidak diperlukan.

## Review gambar AI

Heuristik hanya membaca teks hasil OCR, jadi gambar yang OCR-nya berantakan atau
memakai kalimat baru bisa lolos. Untuk gambar seperti itu bot bisa meminta
pendapat model AI yang membaca gambarnya langsung.

**Menyalakan**

1. Isi minimal satu key di `.env`, lalu `docker compose up -d --build bot`:
   - `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com)
   - `GROQ_API_KEY` — [console.groq.com/keys](https://console.groq.com/keys)
   - `OPENROUTER_API_KEY` — [openrouter.ai/keys](https://openrouter.ai/keys)

   Log `[bot] Review gambar AI aktif: ...` menampilkan urutan rotasinya.
2. Nyalakan per server — default-nya mati: dashboard → Setting bot → *Review
   gambar dengan AI*.
3. Uji dengan mode `flag_only`: temuan AI di mod-log menampilkan verdict, tingkat
   keyakinan, dan model yang menjawab.

**Rotasi penyedia**

Tiap gambar dicoba berurutan sampai ada yang menjawab: semua model Gemini
(`GEMINI_MODEL`, lalu `GEMINI_FALLBACK_MODELS`) → `GROQ_MODELS` → `OPENROUTER_MODELS`.
Penyedia yang key-nya kosong dilewati.

| Balasan penyedia | Yang dilakukan bot |
| --- | --- |
| 5xx, timeout 15 detik, balasan bukan JSON | coba model berikutnya |
| 429 (kuota habis) | model itu dijeda sesuai `retry-after` / `x-ratelimit-reset` / `retryDelay`, coba berikutnya |
| 404 (model ditutup), 401/403 (key ditolak) | model itu dilewati 6 jam, coba berikutnya |

Groq dan OpenRouter dipanggil lewat endpoint chat completions bergaya OpenAI,
jadi model apa pun yang mendukung input gambar bisa dipakai. Model yang masih
muncul di daftar model penyedia belum tentu bisa dipakai akun baru — cek log
kalau ada model yang terus dilewati.

**Gambar mana yang dikirim**

Hanya gambar yang **belum** kena temuan `high` dan punya minimal satu tanda:
link yang tidak di-whitelist, QR code, atau satu aturan heuristik yang kena.
Meme dan screenshot tanpa tanda apa pun tidak dikirim. Kalau pesannya sudah pasti
ditindak (ada temuan `high` lain), AI dilewati.

**Aturan keputusan** (sama untuk semua penyedia)

| Jawaban AI | Hasil |
| --- | --- |
| `scam`, yakin ≥ 85% | temuan `high` (`image_ai`/`ai`) — ditindak sesuai mode server |
| `scam`, yakin 60–84% | temuan `medium` — masuk mod-log, pesan tidak dihapus |
| `not_scam`, `unsure`, yakin < 60%, semua model gagal | tidak ada temuan |

AI **hanya bisa menambah** temuan, tidak pernah membatalkan temuan blacklist,
Safe Browsing, atau heuristik. Ini sengaja: gambar scam bisa berisi tulisan yang
menyuruh AI menjawab "aman".

**Kuota & privasi**

- `AI_MAX_PER_MINUTE` (default 10) dan `AI_MAX_PER_DAY` (default 300) membatasi
  jumlah gambar yang dinilai, semua penyedia digabung.
- OpenRouter tanpa top-up hanya memberi 50 request/hari untuk semua model
  `:free` — cocok sebagai cadangan terakhir.
- Gambar yang sama (hash SHA-256) hanya dinilai sekali per 24 jam — cache di
  memori, hilang saat bot restart.
- Di free tier, penyedia boleh memakai data yang dikirim untuk melatih model.
  Beri tahu member di aturan server.

## Development lokal

**Dengan Supabase** (sebaiknya project terpisah dari production):

```bash
cd bot && npm install && cp ../.env .env && npm run dev
```

`DATABASE_SSL_CA_FILE=certs/supabase-ca.crt` tetap berlaku dari dalam `bot/` —
path relatif juga dicari dari folder induk.

**Dengan Postgres lokal**: di `.env` set `DB_PROVIDER=local`, aktifkan blok
"Hanya untuk DB_PROVIDER=local" (termasuk `COMPOSE_PROFILES=local-db` dan
`COMPOSE_DATABASE_URL`), arahkan `DATABASE_URL` ke `localhost:5433`, dan
kosongkan `DATABASE_SSL_CA_FILE`. Lalu:

```bash
docker compose up -d postgres     # port 5433 di loopback host
```

Container Postgres mempublish `127.0.0.1:${DB_PORT:-5433}` — cukup untuk `psql`
dan menjalankan bot di luar container, tapi tidak terbuka dari luar mesin.
Dashboard lokal bisa memakai database yang sama dengan mengarahkan
`DATABASE_URL` di repo dashboard ke `localhost:5433`. Ganti `DB_PORT` di `.env`
kalau 5433 sudah dipakai.

Slash command didaftarkan global saat bot start (propagasi bisa sampai 1 jam);
untuk server tes gunakan `GUILD_ID=<id> npm run register` yang langsung berlaku.

Perintah bantu di root:

```bash
npm run typecheck     # typecheck bot
npm run logs          # docker compose logs -f bot
curl -s localhost:9000/health | jq   # status gateway + database
```

## Akses database untuk Claude Code

Supaya Claude bisa memeriksa isi database sendiri tanpa minta izin tiap query —
tapi tetap tidak bisa mengubah data diam-diam — akses dipisah jadi dua jalur.

```bash
./scripts/create-readonly-role.sh                      # sekali saja, buat role vsg_ro
./scripts/db-read.sh  "SELECT count(*) FROM detection_logs"   # SELECT saja
./scripts/db-write.sh "DELETE FROM blacklist_domains WHERE id=3"  # hak tulis penuh
```

`db-read.sh` memakai role `vsg_ro` yang hanya punya `SELECT` (plus policy RLS
khusus baca); percobaan menulis ditolak oleh Postgres sendiri, bukan sekadar
oleh konvensi:

```
$ ./scripts/db-read.sh "DELETE FROM detection_logs"
ERROR:  permission denied for table detection_logs
```

`.claude/settings.json` meng-allowlist `db-read.sh` saja. `db-write.sh`,
`migrate.sh`, `restore.sh`, dan `create-readonly-role.sh` sengaja dimasukkan ke
daftar `ask`, jadi setiap perubahan yang dijalankan Claude tetap kamu lihat dan
setujui dulu. Jalankan skrip dari root project supaya cocok dengan aturan allowlist.

Semua skrip mengikuti `DB_PROVIDER`. Untuk Supabase, `psql`/`pg_dump` dijalankan
dari image `postgres` resmi (tidak perlu install psql di host; `pg_dump` otomatis
memakai versi mayor yang sama dengan server supaya dump-nya bisa di-restore)
dengan `sslmode=verify-full` memakai CA yang sama. User read-only untuk pooler
diturunkan otomatis dari `DATABASE_URL` menjadi `vsg_ro.<project_ref>`.

### MCP Supabase

Salin `.mcp.json.example` jadi `.mcp.json` dan ganti `<project_ref>` (file ini
di-gitignore). `.mcp.json` menyambungkan Claude Code ke project Supabase dengan `read_only=true`
dan fitur `database,docs,debugging` saja. Jangan hapus `read_only`: tanpa itu
Claude bisa menjalankan `execute_sql`/`apply_migration` dengan hak tulis penuh
dan melewati konfirmasi `db-write.sh`. Perubahan skema tetap lewat file di
`db/init/` + `./scripts/migrate.sh`.

Ingat juga bahwa `detection_logs.message_content` dan `ocr_text` berisi teks
yang ditulis **scammer**. Kalau meminta Claude membaca tabel itu (lewat MCP atau
`db-read.sh`), perlakukan isinya sebagai input tak tepercaya.

## Backup

```bash
./scripts/backup.sh                      # dump terkompresi ke ./backups
./scripts/restore.sh backups/xxx.sql.gz  # restore (satu transaksi)
```

Pasang di cron VPS:

```
0 3 * * * /opt/voler-scam-guard/scripts/backup.sh >> /var/log/vsg-backup.log 2>&1
```

Dengan Supabase, dump hanya berisi tabel di schema `public` (tanpa `auth`,
`storage`, dan schema internal lain) dengan `--no-owner`. Restore berjalan dalam
satu transaksi, lalu `004_supabase_rls.sql` dijalankan ulang supaya tabel hasil
restore tetap tertutup dari Data API. Untuk restore ke project baru, jalankan
dulu `./scripts/migrate.sh` dan `./scripts/create-readonly-role.sh`. Jangan
mengandalkan backup bawaan paket gratis — tetap pasang cron ini.

Isi `BACKUP_REMOTE` di `.env` (mis. `b2:voler-backups/scamguard`) kalau `rclone`
sudah dikonfigurasi, supaya backup ikut terkirim ke penyimpanan offsite.

## Struktur project

```
voler-scam-guard/
├── docker-compose.yml
├── .env.example
├── .mcp.json.example   # MCP Supabase (read-only) untuk Claude Code
├── certs/              # CA cert Supabase (supabase-ca.crt)
├── db/init/            # SQL schema, seed, migrasi, RLS (idempoten)
├── .claude/            # allowlist permission untuk akses DB read-only
├── scripts/            # migrate, backup, restore, akses DB
│   └── lib/db.sh          # helper koneksi: Supabase atau postgres lokal
└── bot/
    └── src/
        ├── index.ts            # bootstrap client, shutdown
        ├── config.ts           # validasi env (zod)
        ├── health.ts           # HTTP GET /health (port 9000)
        ├── events/             # messageCreate, messageUpdate, guildCreate, ready, …
        ├── services/
        │   ├── detector.ts        # pipeline scan satu pesan
        │   ├── urlScanner.ts      # ekstraksi URL + Safe Browsing (dengan cache)
        │   ├── aiReview.ts        # review gambar AI: rotasi Gemini/Groq/OpenRouter
        │   ├── ocrScanner.ts      # Tesseract worker
        │   ├── qrScanner.ts       # decode QR code + parser merchant QRIS
        │   ├── imageScanner.ts    # unduh gambar sekali -> OCR + QR
        │   ├── heuristicScanner.ts # skor pola scam untuk teks hasil OCR
        │   ├── blacklistCheck.ts  # blacklist/whitelist + cache memori
        │   ├── reportIntake.ts    # ingest channel laporan
        │   ├── settings.ts        # setting per guild
        │   └── actions.ts         # delete/warn/flag + mod-log + tulis log
        ├── db/                 # pool postgres + SSL (connection.ts) + skema drizzle
        └── util/               # logger, normalisasi teks/domain/identifier
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
- **Skema dipakai bersama dashboard**: `bot/src/db/schema.ts` dan
  `bot/src/db/connection.ts` adalah sumber aslinya; repo dashboard menyalinnya
  lewat `npm run sync:schema` di repo itu. Alur mengubah kolom: tulis migrasi
  baru di `db/init/` → `./scripts/migrate.sh` → ubah `schema.ts` di sini →
  sync di repo dashboard.
- **Region**: pilih region project Supabase yang dekat dengan VPS — bot menulis
  ke database untuk setiap deteksi.
- **Heuristik vs blacklist**: heuristik menangkap pola scam yang umum tanpa data;
  blacklist tetap berguna untuk kasus spesifik komunitas kamu (rekening penipu
  tertentu, domain midman palsu). Keduanya jalan bersamaan.
- **Laporan dari channel** selalu masuk sebagai `pending` dan tidak memblokir
  siapa pun sampai di-approve — ini mencegah orang menyalahgunakan bot untuk
  memblacklist rekening lawan.
