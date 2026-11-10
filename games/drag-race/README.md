# 🏃 Drag Race

Game interaktif untuk TikTok LIVE dalam Game Hub: penonton **berlomba jadi pelari** di lintasan `FINISH_DISTANCE_M` meter. Semakin sering penonton berinteraksi (gift/like), semakin kencang pelarinya. Yang menyentuh garis finis paling awal adalah juara ronde.

Status: **Prototipe berjalan (playable end-to-end, mode dev)** — menunggu integrasi & tuning dengan event TikTok live sungguhan.

---

## 1. Konsep Game

| Aksi penonton | Efek di game |
|---|---|
| Komentar `1` / `join` (atau event join) | Bergabung jadi pelari (maks. 100, `MAX_RUNNERS`) dengan **animasi pop masuk**. **Mid-race join aktif default** (`MID_RACE_JOIN: true`): yang gabung saat race berjalan masuk di posisi paling belakang (di belakang pelari terbelakang), kamera menoleh sebentar ke dia (`MID_JOIN_FOCUS_SECONDS: 2,5`). Matikan → harus tunggu ronde berikutnya |
| **Tap/love (like)** | 💨 **Boost 1** — tiap 100 tap (set di panel ⚙️ GIFT baris 1) + dorongan progress kecil |
| **Gift** | 🔥 Boost 2–5 — level dari **harga per-unit gift** (ambang 1/5/20/30 koin), combo memperpanjang **durasi** (detail di §Boost) |

Alur ronde: `lobby` → (tombol Mulai) → `countdown` 3 dtk → `running` (deadline `ROUND_TIMEOUT_SECONDS`) → `finished` (overlay pemenang + podium + kembang api).

- Kecepatan dalam **m/s, berdiri sendiri**: mengubah `FINISH_DISTANCE_M` TIDAK mengubah kecepatan, hanya durasi.
- Tiap pelari punya jitter kecepatan acak (±7 m/s) agar urutan tidak selalu sama.
- Semua pelari finish / waktu habis → ronde berhenti, pemenang = paling jauh.
- Toast feed menampilkan event live (join, boost, rank finish).
- **Di luar fase lari (lobby, countdown, ronde selesai) SEMUA karakter berdiri** memakai frame `_idle`; animasi lari hanya saat `running`; juara #1 pakai `_victory`.

## 2. Teknis

### Struktur file
```
games/drag-race/
├── index.html      # shell: canvas + dock tombol (Mulai/Reset/Keluar + bot + simulasi) + panel pengaturan
├── e2e.html        # shell uji lokal (bypass gerbang TikTok) — hanya untuk harness puppeteer di tmp/
├── styles.css      # letterbox 16:9, dock, loading screen, panel pengaturan (flat UI)
├── boot.js         # gerbang entry: dev mode (?dev=1) atau cek koneksi TikTok via shared/game-entry
├── game.js         # SEMUA logika game (satu file, no build step)
└── assets/
    ├── audio/      # BGM (bgm-beyond-the-final-gate.mp3, loop)
    ├── bg/         # 4 strip siluet cakrawala parallax (gunung, city, candi, kampung)
    ├── characters/ # sprite statis per karakter (pose lari — fallback)
    ├── frames/     # per karakter: run_a…g + idle (berdiri) + victory; + pigeon 2 frame, firework 4 tahap
    ├── track/      # 3 file: rumput, gerbang start, gate finish checker
    ├── ui/         # leaderboard-frame (nine-slice)
    ├── vfx/        # flame, streaks, dust, star burst, confetti, lightning, nova
    └── rewards/    # piala + podium (overlay pemenang)
```
*(Cleanup besar: aset tema Indonesia lama — umbul-umbul, bunting, lampu/gapura, palem, crowd, tribune — dan 12 panel warna percobaan latar SUDAH DIHAPUS. Eksprimen `BG_THEMES`/`pickBgTheme`/tema warna juga dicabut dari kode; yang tersisa hanya siluet 4 lapis klasik.)*

### Trek & lajur — TIDAK pernah di-resize
- **5 lajur tetap** (`MIN_LANES: 5`): tinggi trek (640px) ÷ 5 = 128px/lajur, konstan berapa pun jumlah peserta (dulu: dinamis 4–N dan menyusut sampai 22px — sudah dihapus).
- Peserta ke-6 dst. **round-robin ke lajur yang sama** (`lane % 5` — fungsi `raceMetrics()` + `laneY()`), karakter tetap berukuran penuh dan boleh tumpang-tindih horizontal.
- **Ukuran karakter besar & konstan**: `RUNNER_SIZE_RATIO: 0.95`, floor = ukuran lajur 4-lajur lama, cap `RUNNER_SIZE_MAX: 220`.
- **Grid start anti-gumpal**: tiap baris (5 orang, diisi atas→bawah) mulai 150px dunia DI DEPAN garis start, sampai 10 baris (`startOffPx` per runner). Offset meluruh `(1 − progress)` → semua finis tepat di gerbang. Bug pernah ada: `state.nextLane++` terevaluasi sebelum `startOffPx` → pemain ke-5 melompat sendiri; kini `laneIdx` di-capture dulu.
- Latar: langit gradien + **4 strip siluet parallax** (gunung 0.10 asap animasi / city 0.16 Monas / candi 0.24 / kampung 0.34) + kabut krem 2 lapis, awan, matahari lens-flare, merpati flyby 2-frame. Aspal prosedural (gradien + skid + grain); garis lajur dash default MATI.

### Boost — aturan FINAL (B1 khusus tap/love, B2–B5 gift)
`CONFIG.BOOST_LEVELS`: B1 +20 m/s/2s · B2 +35/2.5s · B3 +55/3s · B4 +75/3.5s · B5 +100/4s.
1. **B1 = jalur TAP/LOVE (like), bukan gift.** Setiap `LIKE_TAPS_PER_BOOST` (default **100**) tap dari satu penonton → 1× Boost 1 (debu kaki, tanpa sprite VFX). Counter tap per pelari (`runner.tapCount`) mengakumulasi antar-event; burst besar (mis. likeCount 250) langsung menghasilkan beberapa B1. Like juga memberi dorongan progress kecil (`LIKE_TAP_PROGRESS_PER: 0.0008`/tap). Jumlah tap diatur di panel ⚙️ tab GIFT baris 1.
2. **B2–B5 dari GIFT, level = HARGA PER-UNIT (`coinValue`)**, ambang default **1/5/20/30** koin. Gift < 5 koin = B2, dst. Combo (`giftCount`) TIDAK menaikkan level — hanya memPERPANJANG durasi (`detik × combo`, cap `BOOST_COMBO_MAX_SECONDS: 25`).
3. **Kumulatif lintas level**: antrian `runner.boosts = [{lvl, until}]`; kecepatan = `baseSpeed + Σ speedAdd semua boost aktif`. VFX memakai level tertinggi aktif. Helper tunggal `grantBoost()` dipakai jalur gift & tap (toast: `💨 nama Boost 1 (+20 m/s)`).
4. Dock **💨B1 mengirim event LIKE** (100 tap simulasi), 🔥B2–🌟B5 mengirim gift tepat di ambang levelnya.
*(Riwayat: dulu semua level dari gift; lalu B1 dipisah ke jalur tap sesuai permintaan + ambang gift diturunkan 50/200/600/1500 → 1/5/20/30.)*

### Animasi join (pop masuk)
Saat pemain baru masuk: sprite **pop dari skala 0.15 → overshoot elastic (easeOutBack)** sambil **turun dari atas**, anchor kaki (shadow ikut), disertai **star-burst emas + ring + 10 percikan + debu**. Nameplate baru fade-in setelah pop ~45%. Durasi `JOIN_POP_MS: 620`. Bot auto-fill saat Mulai di-stagger 90ms/orang (masuk bergelombang, bukan serentak).

### Nameplate (label di trek)
Gaya **mewah-ringkas**: pelat gradien gelap + drop shadow, **bingkai emas metalis 1px** bergradien + kilau dua sudut atas, teks **cream reguler (tidak bold)** + shadow tipis. **Tanpa prefiks @**, medali 🥇🥈🥉 top-3. Ukuran font 12–18px (proporsional sprite, `size × 0.22`), padding 11px. Aksen: amber saat boost, emas untuk juara. Mode `NAMEPLATE_MODE` auto/on/off via dock 🏷️.

### UI atas
- **Minimap** (panel atas): garis START→FINISH + **bulatan avatar besar (radius 15/17px boost, sumber foto 128px)**, semua di SATU garis tengah (menumpuk bila jarak dekat — sesuai permintaan, sebar baris per lajur dihapus). `avatarUrl` siap diisi foto profil TikTok (cache `avatarCanvas`). Tooltip hover %, klik = kunci kamera.
- **Leaderboard** kiri: frame nine-slice neon, gaya flat, klik baris = kunci kamera manual (🔒), pill 🔀 roam ON/OFF + 🎥 AUTO⇄MANUAL.

### Dock (bawah, auto-hide)
`⇥ Keluar · ▶ Mulai · ↻ Reset │ 🤖 +1 · 🎲 Random · + Viewer · 💨B1…🌟B5 · 🏷️ · ⚙️`
- **🤖 +1**: tambah satu bot langsung — **nama ACAK** dari `BOT_NAMES` tiap klik (+ varian angka anti-duplikat); **karakter pakai sistem "bag"** (`nextCharKey()`): kedelapan karakter di-shuffle dan dikeluarkan satu-satu TANPA pengulangan sampai habis baru di-shuffle ulang — acak tapi merata, tidak berbasis nama. Bisa sebelum/atau saat race (mid-race → masuk di belakang field).
- **🎲 Random**: tambah 1–5 bot acak sekaligus.
- Auto-fill lama tetap ada: tekan ▶ Mulai dengan lobi kosong → `BOT_COUNT` (10) bot, masuk dengan animasi stagger.
- `+ Viewer` simulasi komentar join; `B1–B5` simulasi gift boost (rotasi target pelari hidup).

### Panel pengaturan (⚙️ di dock) + BGM
Panel **flat UI** (tanpa radius/border/shadow/gradien — warna solid, pemisahan lewat spasi) sebagai **modal di TENGAH layar** + scrim gelap (tutup via ✕ atau klik scrim). Dibuka lewat tombol **⚙️** di dock. Dua tab:
- **UMUM** (digrup label: Balapan / Tampilan / Musik): jarak lintasan (meter, live → `CONFIG.FINISH_DISTANCE_M`, berlaku mulai ronde berikutnya), gabung tengah race (`MID_RACE_JOIN`), plat nama (`NAMEPLATE_MODE`: on/auto/off — sinkron dg tombol 🏷️), **minimap ON/OFF** (`SHOW_MINIMAP`, klik avatar ikut mati), **leaderboard ON/OFF** (`SHOW_LEADERBOARD`, hit-rect klik mati saat off), musik ON/OFF + slider volume. Toast feed naik ke posisi atas saat minimap dimatikan.
- **GIFT**: baris 1 = **jumlah tap/love per Boost 1** (`LIKE_TAPS_PER_BOOST`, default 100 — B1 khusus tap, bukan gift); baris 2–5 = **ambang koin per-unit** (`minCoins`, default 1/5/20/30) tiap Boost 2–5 + **ikon toast**. Diedit live → CONFIG, dengan baris petunjuk satuan (tap vs koin). Default ikon mengikuti VFX: B1 💨 dust · B2 🔥 flame · B3 🌠 streaks · B4 ⚡ lightning · B5 🌟 nova. Mengubah ikon otomatis memperbarui label tombol dock (`syncBoostDockLabels()`).

**BGM**: `assets/audio/bgm-beyond-the-final-gate.mp3` (`new Audio`, loop, volume slider). Browser memblokir autoplay → audio baru jalan setelah klik pertama user (listener `pointerdown` sekali-pakai). Preferensi tersimpan.

**Persistensi**: localStorage key `dragRace.settings` — `{ finishM, midJoin, nameplate, minimap, leaderboard, bgmOn, bgmVol, tapsPerBoost, gifts:[{minCoins,icon}×5] }`; dibaca `initSettingsPanel()` SEBELUM race apa pun dan diterapkan ke CONFIG. `window.dragRaceSettings` masih placeholder — migrasi ke SQLite (`/api/games/drag-race/settings`) menyusul sesuai aturan hub.

### Kamera
Follow-leader + cutaway boost SELALU (susur cap 2400px/s, fokus adaptif walau >5000px di belakang) + roam acak opsional (default OFF via pill 🔀) + MANUAL lock dari leaderboard. Prioritas: boost > manual > roam > leader.

### Event & kontrol
- `handleTikTokEvent()` menerima `comment | join | gift | like` dari shared TikTok connector (`../../shared/tiktok/`) — tanpa WebSocket sendiri. Combo gift datang sebagai SATU event `giftCount = repeatCount`, `coinValue` per-unit (server.js: `extendedGiftInfo.diamondCount`).
- Debug hooks: `__dragRaceDebug()`, `__dragRaceAdd(name)`, `__dragRaceStart()`, `__dragRaceSpeeds()` (cek boost kumulatif live), `__dragRaceConfig.*` (ubah live dari konsol), `__dragRaceCam()`, `__dragRaceLbHit()`.

### Menjalankan
```bash
node server.js            # Game Hub di http://localhost:8050
open http://localhost:8050/games/drag-race/index.html?dev=1   # dev tanpa TikTok
```
Terdaftar di `games/registry.js` (id `drag-race`).

## 3. Status Pengembangan

### ✅ Selesai (sesi terakhir)
- [x] Cleanup aset total: 13 file tak terpakai + 12 panel warna percobaan dihapus; sistem tema latar (BG_THEMES) dicabut — kembali ke siluet 4 lapis klasik
- [x] Minimap: avatar bulat besar, satu garis tumpuk, sumber foto 128px
- [x] Tombol 🤖 +1 dan 🎲 Random
- [x] Karakter idle (berdiri) semua di luar fase lari; lajur 5 tetap tanpa resize; karakter diperbesar
- [x] 3 karakter chibi Indonesia ditambahkan: **chibi-pocong**, **chibi-paket** (tukang paket), **chibi-gato** (Gatotkaca) — 7 frame run (a–g) + idle + victory per karakter
- [x] 3 karakter baru lagi: **chibi-anaksd** (anak SD), **chibi-bayi** (bayi comel), **chibi-walle** (robot) — total **8 karakter** di `CHAR_KEYS`; bag-shuffle otomatis merata, E2E 18 pelari: 27 frame baru termuat semua, lobby idle berdiri, race 10/10 tanpa artefak
- [x] **Mid-race join** (`MID_RACE_JOIN: true` default): komentar `1` saat race → masuk di belakang field (bukan garis start) + animasi pop + fokus kamera `MID_JOIN_FOCUS_SECONDS`; `false` = tolak spt dulu ("tunggu ronde berikutnya")
- [x] **Kamera lebih gesit**: `CAM_SMOOTHING` 5→8, cap pan roam 620→1200, pan boost 2400→3600, + `CAM_CATCHUP_SPEED: 3200` (jarak >1 layar dipaksa ngebut, anti "ngesot"). Terukur: pan max ~2000 px/dtk (dulu tercapai 620 saat roam)
- [x] Grid start stagger + jitter ±7 m/s (anti-gumpal) + fix bug baris ke-5
- [x] Nameplate mewah flat: pelat gradien + bingkai emas + teks cream non-bold, tanpa @, ukuran pas
- [x] Animasi join pop elastic + burst + stagger bot
- [x] Boost kumulatif + aturan combo per-unit/durasi (lihat §Boost) — diverifikasi E2E: 50×4 combo → B2 +35 selama 10 dtk; B5+B1 → +120
- [x] **Panel pengaturan flat (⚙️)**: modal TENGAH + scrim; tab UMUM (jarak lintasan, mid-race join, plat nama, minimap on/off, leaderboard on/off, musik+volume) & tab GIFT (tap per B1 + ambang koin B2–B5 + ikon) — live ke CONFIG, persist localStorage `dragRace.settings`
- [x] **Boost 1 dipisah ke jalur TAP/LOVE**: tiap `LIKE_TAPS_PER_BOOST` (default 100, bisa diset) → 1× B1; ambang gift B2–B5 = **1/5/20/30**; helper `grantBoost()` tunggal; dock 💨B1 kirim like. Ikon per VFX (🌠 streaks, ⚡ lightning) + label dock sync otomatis
- [x] **BGM** `bgm-beyond-the-final-gate.mp3` loop + toggle on/off + volume; autoplay diblokir browser → aktif setelah klik pertama. Teruji E2E: `playing/loop/volume currentTime` + pause saat OFF
- [x] E2E puppeteer-core (harness di `tmp/e2e-*.cjs`, server 8050): 0 page error di semua skenario

### 🔜 Berikutnya (urutan prioritas)
1. **Uji live sungguhan** dengan TikTok connector terkoneksi (verifikasi `coinValue` per-unit dari payload asli; gift mapping per giftId).
2. **Migrasi settings ke SQLite** — panel ⚙️ sudah jadi dg persist localStorage; hubungkan `window.dragRaceSettings` ke `/api/games/drag-race/settings` (per username TikTok).
3. **Variasi karakter** — kini 8 visual (athlete, ninja, pocong, tukang paket, Gatotkaca, anak SD, bayi comel, robot WALL-E). Cara menambah lagi: taruh `_run_a…g` + `_idle` + `_victory` di `assets/frames/` + pose fallback di `assets/characters/` + daftarkan key di `IMAGES`/`CHAR_KEYS` (registrasi frame otomatis).
4. Audio SFX event (hitungan, boost, fanfare) — BGM sudah, SFX belum.
5. Tuning balapan: durasi, bobot gift vs like, anti-comeback, hadiah peringkat.
6. Isi `avatarUrl` runner dari foto profil TikTok live (slot & cache sudah siap).

### ⚠️ Batasan yang diketahui
- Tanpa sinkronisasi multi-client (1 operator per LIVE stream).
- Leaderboard/toast font sistem, belum webfont brand.
- Overlay pemenang 1 besar (belum podium 3).
- >50 peserta: grid start penuh 10 baris → sisanya berbagi posisi baris (tumpang-tindih visual masih bisa terjadi di kerumunan).

---

*Terakhir diperbarui: setelah fitur boost kumulatif + aturan combo per-unit. Harness test: `tmp/e2e-boostcombo.cjs`, `tmp/e2e-join-anim.cjs`, `tmp/e2e-grid5.cjs`, `tmp/e2e-minimap-bubble.cjs`, `tmp/e2e-botbtns.cjs`.*
