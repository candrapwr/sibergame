# 🏃 Drag Race

Game interaktif untuk TikTok LIVE dalam Game Hub: penonton **berlomba jadi pelari** di lintasan (default 3000 m, bisa diubah di panel ⚙️). Penonton ikut lari lewat komentar, jadi juara lewat gift & like. Ronde selesai saat **3 pemain pertama menyentuh garis finis** (podium terisi).

Status: **Siap dimainkan** — terhubung ke connector TikTok LIVE (`shared/tiktok/`), E2E teruji, panel pengaturan lengkap, 8 karakter, podium 3 juara.

---

## 1. Konsep Game

### Cara penonton jadi pemain (HANYA 3 jalur ini)
| Jalur | Syarat |
|---|---|
| **Komentar** | teks persis `join` / `gabung` (case-insensitive). Event room-join TikTok TIDAK membuat pemain |
| **Gift** | gift dengan harga per-unit ≥ ambang B1 (default 1 koin) → auto-join + langsung dapat boost sesuai levelnya |
| **Tap/Love (like)** | akumulasi tap seorang penonton ≥ `LIKE_TAPS_PER_BOOST` (default 100) → auto-join + 1× Boost 1 |

Semua jalur tunduk gerbang `MID_RACE_JOIN` (default **true**): saat race berjalan, pemain baru masuk di posisi paling belakang + animasi pop. `false` → tunggu ronde berikutnya (toast penolakan).

### Aksi setelah jadi pemain
| Aksi | Efek |
|---|---|
| **Tap/love (like)** | 💨 **Boost 1** tiap 100 tap — murni boost kecepatan (TIDAK menambah progress langsung, TIDAK menyentuh kamera, VFX debu kaki saja) |
| **Gift** | 🔥 B2–B5 — level dari **harga per-unit** (ambang 1/5/10/20/30 koin); combo (`giftCount`) hanya **memperpanjang durasi**, bukan level |

### Alur ronde
`lobby` → (▶ Mulai; **ditolak jika lobi kosong** — tidak ada auto-bot, kirim toast "Add player dulu") → `countdown` 3 dtk → `running` → `finished`.

- **Tanpa batas waktu (default)**: `USE_ROUND_TIMEOUT: false` → ronde hanya selesai saat **`ROUND_FINISH_AFTER: 3` pemain finish** (atau semua, bila peserta < 3). Batas 200 dtk opsional, bisa dihidupkan dari ⚙️.
- Status di minimap: `🏁 Finish 2/3 (dari 12)`.
- Saat bendera turun, pelari yang belum finish diberi peringkat berdasar **progress terjauh**.
- **Podium 3 juara**: overlay tengah = #1 (blok tertinggi), kiri = #2, kanan = #3; avatar bulat berbingkai emas/perak/perunggu + piala + kembang api + confetti.
- Kecepatan dalam **m/s, terpisah dari jarak**: mengubah jarak hanya mengubah DURASI (`jarak ÷ 32 m/s` ≈ durasi normal).
- Tiap pelari: jitter start acak + **wandering sinus** (`SPEED_WANDER_AMP: 6`, dua gelombang periode acak) → urutan saling salip, pola urutan tidak kaku.
- Di luar fase lari (lobby/countdown/finished) semua karakter **berdiri** (`_idle`); pelari #1 pakai `_victory`.

## 2. Teknis

### Struktur file
```
games/drag-race/
├── index.html      # shell: canvas + dock + panel pengaturan + modal bantuan
├── e2e.html        # shell uji lokal (bypass gerbang TikTok) — harness tmp/
├── styles.css      # letterbox 16:9, dock, panel & modal (flat UI), toast
├── boot.js         # gerbang entry: ?dev=1 | ?tiktokWs=ws://… | cek koneksi TikTok via shared/game-entry
├── game.js         # SEMUA logika game (satu file, no build step)
└── assets/
    ├── audio/      # BGM (bgm-beyond-the-final-gate.mp3, loop)
    ├── bg/         # 4 strip siluet cakrawala parallax (gunung, city, candi, kampung)
    ├── characters/ # sprite statis per karakter (fallback)
    ├── frames/     # per karakter: run_a…g + idle + victory; pigeon 2 frame; firework 4 tahap
    ├── track/      # rumput, gapura start, gate finish checker
    ├── ui/         # leaderboard-frame (nine-slice)
    ├── vfx/        # dust, flame, streaks, lightning, nova, star burst, confetti
    ├── rewards/    # piala + blok podium
    └── video/      # (kosong — eksprimen cutscene B5 sudah di-rollback)
```

### Trek & lajur — TIDAK pernah di-resize
- **5 lajur tetap** (`MIN_LANES: 5`, 128px/lajur); peserta ke-6 dst round-robin ke lajur sama, karakter ukuran penuh, boleh tumpang-tindih horizontal.
- Karakter besar & konstan: `RUNNER_SIZE_RATIO: 0.95`, cap 220px, floor 78px (`LANE_FIT_ALL` — jangan pernah keluar kanvas).
- **Grid start anti-gumpal**: tiap baris (5 orang) mulai 150px dunia di depan garis start, sampai 10 baris; offset meluruh `(1 − progress)` → semua finis tepat di gerbang.
- Latar: langit gradien + 4 strip siluet parallax + kabut, awan, matahari lens-flare, merpati flyby. Aspal prosedural; garis lajur dash MATI (`LANE_DASH_LINES: false`).

### Boost — aturan FINAL
`CONFIG.BOOST_LEVELS`: B1 +20 m/s/2s · B2 +35/2.5s · B3 +55/3s · B4 +75/3.5s · B5 +100/4s.
1. **B1 = TAP/LOVE.** Tiap `LIKE_TAPS_PER_BOOST` (default 100) tap → 1× B1. Burst besar (likeCount 500) → beberapa B1 sekaligus. **Murni boost speed×durasi** — tidak ada dorongan progress langsung (konstanta lama `LIKE_TAP_PROGRESS_PER` DIHAPUS: menyebabkan teleport "locat" 40%), tidak ada VFX streaks (milik B3), tidak memotong kamera.
   Bonus: B1 juga dual-path — gift ≥1 koin (ambang `minCoins[0]`) ikut memicu B1 (jalur join-penonton baru).
2. **B2–B5 dari GIFT**, level = harga per-unit (`coinValue`), ambang default **1/5/10/20/30**. Combo `giftCount` → durasi `detik × combo`.
3. **Kecepatan = boost level TERTINGGI yang aktif** (`add = cfg.speedAdd`), BUKAN jumlah semua boost (dulu dijumlah → spam B1 = "keceng"). Entry boost simpanan SEJAJAR level yang tumpang-tindih **menjahit ekor durasi** (satu window, cap `BOOST_COMBO_MAX_SECONDS: 25`); beda level → window terpisah, tetap hanya level tertinggi yang menghitung. VFX memakai level tertinggi.
4. Helper tunggal `grantBoost()` dipakai jalur gift & tap. Dock **💨B1 publish event `like` 100 tap**; 🔥B2–🌟B5 kirim gift tepat di ambangnya.

### Kamera
Mode default **`CAM_SNAP: true` — LOCAT**: kamera berpindah INSTAN ke target tiap frame (tanpa pan/smoothing). Matikan via ⚙️ → smoothing lama aktif lagi (4 tingkat: manual 6 / roam 2.0 / cutaway 12 / leader 8 + cap pan + catch-up).
Prioritas fokus (tertinggi → terendah):
1. **MANUAL LOCK = RAJA.** Klik pemain (leaderboard/dobel-klik) → 🔒 terkunci terus ke dia **sampai user mengembalikan ke AUTO** — boost maupun roam TIDAK memotong lagi (logika lama "boost potong lock → auto-reset" DIHAPUS, field `camLockCut` dihapus).
2. Cutaway boost (AUTO mode): `CAM_FOCUS_SECONDS: 3`, cooldown 1.2 dtk.
3. Roam acak (default OFF, pill 🔀) → ikut pelari lain ≤1 layar di belakang leader.
4. Follow pemimpin (`CAM_ANCHOR_X: 960` = tengah kanvas).
- **Grace join**: boost ≤4 dtk sejak join (`JOIN_BOOST_CAM_GRACE_MS`) tidak menyorot kamera (join-gift/tap = boost pertama, jangan bikin kamera kesorot).
- Event `like` TIDAK PERNAH menyentuh kamera.
- Lock lepas otomatis hanya bila pemain keluar daftar / finish saat countdown.

### UI
- **Toast feed (kanan-atas) — style FLAT**: kotak tajam tanpa radius/border, 17px, tinggi 30px, latar solid gelap + aksen kiri 4px sewarna event; slide-in kanan + fade-out. `MAX_TOASTS: 6`, bertahan 3.6 dtk.
- **Minimap** (atas, toggle ⚙️): garis START→FINISH + avatar bulat (foto profil TikTok via `avatarUrl`, fallback inisial), status race + klik avatar = kunci kamera.
- **Leaderboard** (kiri, toggle ⚙️): 2 kolom ×6 baris (`LEADERBOARD_MAX_ROWS`), ringkas "… N pelari lainnya"; klik baris = 🔒 manual; pill 🔀 + 🎥 AUTO⇄MANUAL.
- **Nameplate**: pelat gradien gelap + bingkai emas 1px + kilau sudut, teks cream non-bold, medali top-3, aksen amber saat boost. Mode on/auto/off (dock 🏷️ / ⚙️).
- **Modal bantuan** (`#help-modal`): auto-tampil saat sesi mulai (bisa "Jangan tampilkan lagi" → localStorage). Tab 🎮 CARA MAIN (cara join, boost, podium) + ⚙️ CARA SETING.

### Dock (bawah, auto-hide, collapsible)
`⇥ Keluar · ▶ Mulai · ↻ Reset │ 🤖 +1 · [▸💨B1 🔥B2 🌠B3 ⚡B4 🌟B5 🏷️] · ⚙️ · ▾`
- **🤖 +1**: bot baru — nama acak dari `BOT_NAMES` + varian angka anti-duplikat; karakter pakai sistem **bag** (`nextCharKey()`: 8 karakter di-shuffle, keluar satu-satu tanpa repetisi sampai habis).
- **▾ Collapse**: tombol paling kanan membuka/menutup grup simulasi (B1–B5, 🏷️). Default **tertutup** (~283px); state di `localStorage.dragRace.simCollapsed`.
- Tombol lama **+Viewer** dan **🎲 Random** DIHAPUS; auto-fill bot saat Mulai dengan lobi kosong juga DIHAPUS (start menolak lobi kosong).

### Panel pengaturan (⚙️) + BGM
Panel sebagai **modal TENGAH layar** + scrim radial-blur, desain game-like: kartu rounded dengan aksen warna per level boost, switch toggle, slider. Dua tab:
- **UMUM** (grup Balapan / Tampilan / Musik):
  - Jarak lintasan (default 3000 m, input bebas — persist)
  - Gabung di tengah race (`MID_RACE_JOIN`)
  - **Batas waktu ronde 200 dtk** (`USE_ROUND_TIMEOUT`, default OFF) — toggle berlaku juga untuk ronde yang sedang berjalan
  - Plat nama (on/auto/off) · Minimap ON/OFF · Leaderboard ON/OFF
  - **Kamera LOCAT** (`CAM_SNAP`, default ON)
  - BGM ON/OFF + volume
- **GIFT**: baris 1 = tap per Boost 1 (dual: input tap ATAU koin), baris 2–5 = ambang koin per level + ikon PNG VFX (ikon = preview, tidak editable); info ringkas `= N 🪙`. Label dock ikut ter-update (`syncBoostDockLabels()`).

**BGM**: loop `new Audio`; autoplay diblokir browser → jalan setelah klik pertama user.

**Persistensi**: localStorage `dragRace.settings` = `{ finishM, midJoin, roundTimeout, camSnap, nameplate, minimap, leaderboard, tapsPerBoost, gifts:[{minCoins,icon}×5], bgmOn, bgmVol }`; dibaca sebelum race apa pun. Collapsed dock: `dragRace.simCollapsed`. (Placeholder `window.dragRaceSettings` → migrasi SQLite `/api/games/drag-race/settings` menyusul.)

### Event & kontrol (integrasi TikTok)
- `handleTikTokEvent()` menerima `comment | gift | like` dari shared connector (`../../shared/tiktok/`) — tanpa WebSocket sendiri. **Event `join` (room-enter) TIDAK membuat pemain.**
- **`boot.js` menyimpan `window.tiktokListenerEndpoint`** SEBELUM `game.js` import (bug lama: return `requireConnectedTikTok()` dibuang → koneksi mati). Override dev: `?tiktokWs=ws://…`.
- Avatar: `avatarUrl` (validasi https-only via `safeAvatarUrl`) disimpan saat join/gift/like → cache `avatarCanvas` (key termasuk URL → auto-invalidate saat ganti foto).
- Gift combo datang sebagai SATU event: `giftCount = repeatCount`, `coinValue` per-unit (server: `extendedGiftInfo.diamondCount`).
- Debug hooks: `__dragRaceDebug()`, `__dragRaceCam()`, `__dragRaceSpeeds()` (wandering+boost aktif live), `__dragRaceAdd(name)`, `__dragRaceStart()`, `__dragRaceConfig.*`, `__dragRaceLbHit()`.

### Dashboard (Game Hub)
Terdaftar di `games/registry.js` id `drag-race`, status **Siap dimainkan**. Card pakai **cover art race** asli (tipe `cover.type: "race"`): langit + skyline kampung + strip rumput + 3 chibi pelari berjenjang + gerbang finis + garis kecepatan; hover = pelari "maju". Klik card membuka game di **tab/jendela yang sama** (`window.location.assign`, sessionId ikut).

### Menjalankan
```bash
node server.js            # Game Hub di http://localhost:8050
open http://localhost:8050/games/drag-race/index.html?dev=1   # dev tanpa TikTok
# uji connector: ?tiktokWs=ws://127.0.0.1:<port> (mock/live)
```

## 3. Status Pengembangan

### ✅ Selesai (sesi terakhir)
- [x] **Finish rule baru**: ronde selesai saat 3 finisher (`ROUND_FINISH_AFTER`), peserta < 3 menyesuaikan; **batas waktu dinonaktifkan** (default) + toggle opsional di ⚙️
- [x] **Kamera LOCAT** (`CAM_SNAP` default ON — tanpa pan) + switch ⚙️; smoothing klasik tetap tersedia saat OFF
- [x] **Manual lock = prioritas tertinggi**: boost tidak memotong lock lagi; reset hanya manual ke AUTO (`camLockCut` dihapus)
- [x] **Toast flat** tanpa radius, lebih kecil (17px/30px baris)
- [x] **Card dashboard Drag Race** jadi cover art (chibi + gerbang finis + skyline) alih-alih emoji
- [x] Default jarak **3000 m**, input terkembalikan normal (tanpa lock); localStorage tetap berfungsi
- [x] **B1 murni boost**: direct-progress & streak-VFX dihapus (fix teleport "locat" 40% & judder kamera); like tidak menyentuh kamera; grace boost-terhubung-join (`JOIN_BOOST_CAM_GRACE_MS`)
- [x] **Durasi boost menjahit** (satu window per level, cap 25 dtk), kecepatan = level tertinggi saja (anti "keceng" aditif)
- [x] **Wandering kecepatan** sinus ganda per pelari (`SPEED_WANDER_AMP`) → salip-menyalip hidup, 32 urutan unik/12 dtk (terukur)
- [x] **Start menolak lobi kosong** (toast), auto-bot & +Viewer & 🎲 Random dihapus; dock collapsible default tertutup
- [x] **Join hanya via komentar `join`/`gabung`** (regex persis), gift ≥ B1, atau tap ≥ ambang; event `join` TikTok tidak lagi membuat pemain
- [x] **Podium 3 juara** (1 tengah tertinggi, 2 kiri, 3 kanan; avatar bulat + bingkai medali + piala)
- [x] **Modal bantuan** auto-tampil + 2 tab + "jangan tampilkan lagi" persist
- [x] **Fix konektor TikTok**: endpoint tersimpan sebelum game.js + override `?tiktokWs`; jalur avatar https validasi + cache invalidation. Mock WS E2E: comment→join, gift→boost, like→B1, avatar propagate — 0 error
- [x] Panel ⚙️ redesign game-like (scrim radial, kartu aksen per boost, switch/slider) + tab GIFT ikon PNG
- [x] 8 karakter: athlete, ninja, pocong, paket, gato, anaksd, bayi, walle (9 frame masing-masing; bag-shuffle merata)

### 🔜 Berikutnya (urutan prioritas)
1. **Uji live sungguhan** dengan stream TikTok terkoneksi (verifikasi `coinValue` per-unit payload asli, gift mapping per giftId, rate like burst).
2. **Migrasi settings ke SQLite** (`/api/games/drag-race/settings`) — panel ⚙️ sudah jadi, tinggal mengganti localStorage.
3. Audio SFX event (hitungan, boost, fanfare podium) — BGM sudah, SFX belum.
4. Tuning: keseimbangan gift vs like, jumlah finisher podium, panjang lintasan default utk durasi sesi ideal.
5. Variasi karakter/lintasan baru bila perlu (cara tambah: `_run_a…g`+`_idle`+`_victory` di `assets/frames/` + fallback di `assets/characters/` + daftar di `IMAGES`/`CHAR_KEYS` — registrasi otomatis).

### ⚠️ Batasan yang diketahui
- Tanpa sinkronisasi multi-client (1 operator per LIVE stream).
- Font UI masih font sistem (belum webfont brand).
- >50 peserta: grid start 10 baris penuh → sisanya berbagi posisi (tumpang-tindih visual mungkin di kerumunan).
- CAM_SNAP ON = pindahan kamera instan; kalau penonton merasa "patah", matikan via ⚙️ (kembali ke pan halus).

---

*Terakhir diperbarui: setelah finish-3-pemain + batas-waktu-off + kamera LOCAT + lock-supremasi + toast flat + card dashboard race. Harness: `tmp/e2e-*.cjs` (mock WS connector, boost combo, join-anim, grid5, minimap, dock).*
