import { tiktokConnector } from "../../shared/tiktok/tiktok-connector.js";

// ==========================================================================
// DRAG RACE
// Semua parameter game ada di CONFIG (di bawah) — ubah satu tempat, langsung
// bereaksi ke balapan/visual. Untuk cepat: FINISH_DISTANCE_M = panjang lintasan.
// ==========================================================================

const W = 1440;   // 4:3 — tengah antara landscape penuh & portrait; HUD & pelari terlihat besar di Live Studio
const H = 1080;

const CONFIG = {
  // ---- panjang lintasan ----
  FINISH_DISTANCE_M: 3000,           // panjang lintasan default (meter; nilai pertama kali sebelum user mengubah di Settings). Hanya mengubah DURASI balapan, TIDAK kecepatan.
  PX_PER_METER: 10,                  // skala: 1 m = sekian px dunia
  WORLD_START_X: 1500,               // px dunia garis start — BERI RUANG di belakangnya untuk grid start (baris-baris pelari menunggu DI BELAKANG garis)

  // ---- pembatasan peserta & feed ----
  MAX_RUNNERS: 100,                    // peserta maksimum dalam satu lajur balapan
  MIN_LANES: 4,                      // jumlah lajur tetap trek (4 pemain per baris grid start) — lajur lebih tinggi → karakter lebih besar
  MAX_TOASTS: 6,                     // jumlah toast di feed kanan
  TOAST_SECONDS: 3.6,                // berapa lama toast bertahan

  // ---- bot/demo (jumlah "dummy pemain" saat Mulai ditekan dgn lobi kosong) ----
  BOT_COUNT: 10,                      // ubah ini utk jumlah bot default per ronde (maks MAX_RUNNERS)
  BOT_NAMES: ["Budi", "Sari", "Joko", "Rina", "Tommy", "Dewi", "Agus", "Mila", "Nanda", "Fajar", "Intan", "Yoga", "Citra", "Rendi", "Maya", "Aldi", "Sinta", "Bayu", "Kirana", "Doni"],  // nama bot berurutan; lebih dari ini digenerate "pelari_N"
  SIM_NAMES: ["Viewer1", "Viewer2", "Viewer3", "Viewer4", "Viewer5", "Viewer6", "Viewer7", "Viewer8"],  // nama utk tombol "+ Viewer"

  // ---- kecepatan pemain (satuan m/s, TERPISAH dari jarak) ----
  // Kecepatan tidak bergantung panjang lintasan. Estimasi finish ≈ FINISH_DISTANCE_M / BASE_SPEED detik —
  // jika memperpanjang jarak, naikkan juga ROUND_TIMEOUT_SECONDS secukupnya.
  BASE_SPEED: 32,                    // kecepatan dasar tiap pelari (meter/detik)
  SPEED_JITTER_MIN: -1,              // offset acak per pemain (m/s): pemain bisa -7 s/d +7 dari dasar
  SPEED_JITTER_RANGE: 1,            // rentang jitter (min..min+range)
  SPEED_WANDER_AMP: 6,               // ±m/s fluktuasi SELAMA balapan (dua gelombang sinus acak per pemain) → urutan saling salip, tidak "pola tetap"
  ROUND_FINISH_AFTER: 3,             // ronde selesai setelah N pemain finish (podium penuh). Peserta < N → tunggu semuanya finish
  USE_ROUND_TIMEOUT: false,          // false (default): TIDAK ada batas waktu — ronde selesai hanya saat semua finish. true: aktifkan ROUND_TIMEOUT_SECONDS
  ROUND_TIMEOUT_SECONDS: 200,        // batas total satu ronde (hanya saat USE_ROUND_TIMEOUT=true); setelah ini yang belum finish diberi peringkat
  COUNTDOWN_SECONDS: 3,              // lama hitung mundur sebelum mulai
  JOIN_POP_MS: 620,                  // durasi animasi "pop masuk" pemain baru (ms)
  MID_RACE_JOIN: true,               // true (default): penonton boleh gabung SAAT race berjalan — masuk di posisi paling belakang; false: harus tunggu ronde berikutnya
  JOIN_KEYWORDS: ["1", "gas", "lari", "ikut"],   // komentar kunci buat ikut — bisa diubah di panel ⚙️; "gabung"/"join" DIBLOK filter TikTok (komentar langsung dihapus)
  JOIN_BOOST_CAM_GRACE_MS: 4000,     // boost dalam N dtk sejak join TIDAK menyorot kamera (join-gift/tap = boost pertama, jangan bikin kamera kesorot)
  MID_JOIN_FOCUS_SECONDS: 2.5,       // lama kamera fokus ke pemain baru yang join di tengah race
  BOOST_COMBO_MAX_SECONDS: 25,       // batas durasi boost hasil combo (detik dasar × jumlah combo, di-cap di sini)

  // ---- boost bertingkat: 5 level, masing2 punya NILAI tambah kecepatan (m/s) sendiri ----
  // Boost: B1 khusus dari TAP/LOVE (like) tiap LIKE_TAPS_PER_BOOST; B2–B5 dari GIFT.
  // minCoins (B2–B5) = HARGA PER-UNIT gift (coinValue) agar masuk level tsb.
  // speedAdd = +m/s selama boost; seconds = durasi; trail/fx = VFX key.
  BOOST_LEVELS: [
    // B1 DUAL-PATH: 100 tap/love (LIKE_TAPS_PER_BOOST) ATAU gift ≥1 koin (minCoins).
    // B2–B5 hanya dari gift, ambang per-unit default: 5, 10, 20, 30 koin.
    { minCoins: 1,    speedAdd: 20, seconds: 2,   label: "Boost 1", icon: "💨", color: "#cfd8e6", trail: "dust",     fx: "dust",     size: 0.85 },
    { minCoins: 5,    speedAdd: 35, seconds: 2.5, label: "Boost 2", icon: "🔥", color: "#ff8a3d", trail: "flame",    fx: "flame",    size: 1.45 },
    { minCoins: 10,   speedAdd: 55, seconds: 3,   label: "Boost 3", icon: "🌠", color: "#6db8ff", trail: "streaks",  fx: "streaks",  size: 1.55 },
    { minCoins: 20,   speedAdd: 75, seconds: 3.5, label: "Boost 4", icon: "⚡", color: "#c3a1ff", trail: "lightning", fx: "lightning", size: 1.7 },
    { minCoins: 30,   speedAdd: 100, seconds: 4,  label: "Boost 5", icon: "🌟", color: "#ffd35c", trail: "nova",     fx: "nova",     size: 1.9 }
  ],
  BOOST_FALLBACK_TRAIL: "flame",     // VFX level 4/5 ("lightning"/"nova") dipakai begitu aset PNG-nya dipasang; sebelum itu otomatis fallback ke flame
  LIKE_TAPS_PER_BOOST: 100,          // setiap N tap/love (like) dari satu penonton → 1× Boost 1 (via panel ⚙️ bisa diubah)

  // ---- kamera ----
  ZOOM: 1.0,                         // 1 = ukuran penuh (semua elemen dunia ikut besar; 0,8 membuat tampilan "kecil" saat di-embed)
  CAM_ANCHOR_X: 720,                 // posisi layar sang pemimpin — 720 = tengah kanvas 1440 (ruang kiri-kanan seimbang)
  CAM_SNAP: true,                    // true = TANPA pan halus: kamera LOCAT langsung saat posisi target berubah; false = smoothing normal
  CAM_SMOOTHING: 8,                  // besar = kamera lebih cepat mengejar pemimpin (naik dari 5: transisi terasa lebih gesit)
  CAM_FINISH_MARGIN: 380,            // ruang tambahan di belakang garis finish (px layar)
  CAM_FOCUS_SECONDS: 3,              // durasi kamera cutaway ke pemain yang di-boost, lalu kembali ke pemimpin
  CAM_FOCUS_ANCHOR_X: 700,           // posisi layar pemain yang difokus (tengah kanvas)
  CAM_FOCUS_COOLDOWN: 1.2,           // jeda minimum antar-pengalihan fokus (detik), anti kamera goyang
  CAM_FOCUS_MAX_BEHIND: 5000,        // batas jarak di belakang pemimpin agar tetap difokus (hanya untuk roam; boost selalu lolos)
  // roaming: kamera sesekali meninggalkan pemimpin untuk mengikuti pelari acak (boost SELALU memotong roam)
  CAM_ROAM_ENABLED: false,           // 🔀 auto-follow roam: default OFF — AUTO murni = fokus pemimpin; nyalakan via pill 🔀 di leaderboard
  CAM_ROAM_SECONDS: 5,               // durasi fokus ke pelari acak sebelum kembali ke pemimpin
  CAM_ROAM_EVERY_MIN: 12,            // jeda acak antar-roam (detik) — jarang agar tidak pusing
  CAM_ROAM_EVERY_MAX: 20,
  CAM_ROAM_SMOOTHING: 2.0,           // pan roam sangat lembut (vs cutaway boost yang galak)
  CAM_ROAM_MAX_BEHIND: 6000,         // roam boleh sampai ±4 layar di belakang pemimpin (dulu 1400→2900: kandidat nyaris selalu pelari 2 — paket cepat melebar jauh)
  CAM_ROAM_MAX_SPEED: 1200,          // cap kecepatan pan kamera px dunia/s selama roam & transisi balik (dulu 620 — terlalu lambat utk jarak jauh)
  CAM_LOCK_SMOOTHING: 6,             // kehalusan kamera saat terkunci ke pemain (mode manual)
  CAM_CUTAWAY_SMOOTHING: 12,         // saat cutaway kamera FOLLOW penuh ke pemain yg di-boost (tinggi = lebih galak mengejar)
  CAM_BOOST_PAN_MAX_SPEED: 3600,     // cap laju (px dunia/s) saat kamera menyusur ke pemain boost jauh — anti teleport (dulu 2400)
  CAM_CATCHUP_SPEED: 3200,           // (hanya saat CAM_SNAP=false) laju MINIMUM px/dtk kejar target jauh — anti "ngesot"

  // ---- visual trek ----
  WORLD_TICK_M: 52,                  // jarak antar penanda meter di trek (m)
  // ---- grid start (di BELAKANG garis start, seperti balapan sungguhan) ----
  START_LINE_MARGIN: 60,             // jarak baris paling depan dari garis start (px dunia, ke belakang)
  START_ROW_GAP: 150,                // jarak antar baris grid (px dunia); otomatis dipadatkan bila baris banyak
  GRID_BACK_MARGIN: 60,              // kamera menarik min. ini px agar pelari paling belakang terlihat
  LANE_HEIGHT_MAX: 240,              // tinggi lajur maksimum (px)
  LANE_HEIGHT_MIN: 22,               // tinggi lajur minimum — lajur boleh sekecil ini agar semua peserta tetap tergambar
  LANE_FIT_ALL: true,                // true: lajur MENDESAK hingga semua peserta masuk trek (menembus MIN bila perlu), jangan pernah digambar keluar kanvas
  NAMEPLATE_MIN_LANE_H: 30,          // (mode "auto") di bawah tinggi lajur ini, nameplate disembunyikan
  NAMEPLATE_MODE: "on",            // "auto" = sembunyi saat lajur sempit | "on" = selalu tampil | "off" = tidak pernah tampil
  LEADERBOARD_MAX_ROWS: 5,           // jumlah BARIS per kolom (leaderboard 2 kolom → tampung 10 nama); sisanya jadi baris "… N pelari lainnya"
  SHOW_MINIMAP: true,                // panel minimap atas — toggle via panel pengaturan ⚙️
  SHOW_TICKER: true,                 // teks CTA berjalan di langit saat lobi — toggle via panel pengaturan ⚙️
  SHOW_LEADERBOARD: true,            // leaderboard kiri — toggle via panel pengaturan ⚙️
  LANE_DASH_LINES: false,            // garis putus-putus pembatas lajur — user: "jangan ada dash line" (default mati; prosedural canvas)
  RUNNER_SIZE_RATIO: 1.1,            // tinggi karakter relatif terhadap tinggi lajur (besarkan; tumpang-tindih antar lajur diperbolehkan)
  RUNNER_SIZE_MAX: 250,              // ukuran karakter maksimum (px)
  RUNNER_SIZE_MIN: 78,               // ukuran karakter minimum (px) — dengan peserta banyak, pelar BIH besar dan boleh tumpang-tindih antar lajur daripada tidak terlihat
  STRIDE_MIN: 110,                   // panjang langkah minimum (px dunia)
  STRIDE_RATIO: 0.85,                // panjang langkah relatif tinggi karakter
  FINISH_BAND_COLS: 4,               // kolom kotak-kotak pita finish
  FINISH_BAND_CELL: 20,              // ukuran 1 kotak checker (px layar)

  // ---- efek & partikel ----
  FX_MAX: 60,                        // batas FX sprite di layar
  FX_LIFE: 0.9,                      // durasi FX default (detik)
  PARTICLE_MAX: 900,                 // batas partikel (confetti/spark/dust/smoke/ring)
  SCREEN_SHAKE_MAX: 18               // maksimum kuat screen shake (px)
};

// Konstanta turunan (jangan ubah — dihitung dari CONFIG):


const MAX_RUNNERS = CONFIG.MAX_RUNNERS;
const MAX_TOASTS = CONFIG.MAX_TOASTS;
const ZOOM = CONFIG.ZOOM;
const WORLD = {
  get startX() { return CONFIG.WORLD_START_X; },
  get finishX() { return CONFIG.WORLD_START_X + CONFIG.FINISH_DISTANCE_M * CONFIG.PX_PER_METER; }
};
const CAM_ANCHOR = CONFIG.CAM_ANCHOR_X;
const WORLD_TICK = CONFIG.WORLD_TICK_M * CONFIG.PX_PER_METER;
const VIEW_W = () => Math.round(W / ZOOM); // lebar dunia yang terlihat satu layar

const IMAGES = {
  runnerBlue: "assets/characters/athlete-girl-blue-jersey.png",
  runnerNinja: "assets/characters/ninja-black.png",
  chibiPocong: "assets/characters/chibi-pocong.png",
  chibiPaket: "assets/characters/chibi-paket.png",
  chibiGato: "assets/characters/chibi-gato.png",
  chibiAnaksd: "assets/characters/chibi-anaksd.png",
  chibiBayi: "assets/characters/chibi-bayi.png",
  chibiWalle: "assets/characters/chibi-walle.png",
  grass: "assets/track/grass-ground-strip.png",
  startGate: "assets/track/start-banner-arch.png",
  finishGate: "assets/track/finish-checkered-gate.png",
  flame: "assets/vfx/boost-flame-trail.png",
  streaks: "assets/vfx/speed-burst-streaks.png",
  dust: "assets/vfx/dust-puff-cloud.png",
  confetti: "assets/vfx/confetti-spray-cluster.png",
  starBurst: "assets/vfx/star-burst-impact.png",
  trophyGold: "assets/rewards/golden-trophy-cup.png",
  podium: "assets/rewards/winner-podium-block.png"
};

const CHAR_KEYS = ["runnerBlue", "runnerNinja", "chibiPocong", "chibiPaket", "chibiGato", "chibiAnaksd", "chibiBayi", "chibiWalle"];

// Bounding box konten (pixel alpha>8) tiap image, dihitung sekali. Dipakai agar
// pose dengan crop/tinggi berbeda tetap menapak tanah & ukuran karakter konsisten.
const contentBoxes = new Map();
(function measureBoxes() {
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  window.__measureSprite = (img, key) => {
    if (contentBoxes.has(key)) return contentBoxes.get(key);
    scratch.width = img.naturalWidth || img.width;
    scratch.height = img.naturalHeight || img.height;
    if (!scratch.width || !scratch.height) return null;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.drawImage(img, 0, 0);
    let data;
    try { data = sctx.getImageData(0, 0, scratch.width, scratch.height).data; }
    catch { return null; }
    let minX = scratch.width, minY = scratch.height, maxX = -1, maxY = -1;
    for (let y = 0; y < scratch.height; y++) {
      for (let x = 0; x < scratch.width; x++) {
        if (data[(y * scratch.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const box = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, iw: scratch.width, ih: scratch.height };
    contentBoxes.set(key, box);
    charScaleCache = {};        // skala karakter dihitung ulang saat ada box baru
    return box;
  };
})();

// Satu skala seragam per karakter, diambil dari frame run TERTINGGI (pose
// kontak/push). Frame airborne lebih pendek secara konten; kalau tiap frame
// di-scale ke "size" sendiri, karakter tampak membesar-mengecil tiap langkah.
let charScaleCache = {};
function getCharScale(charKey, targetH) {
  let tallest = charScaleCache[charKey];
  if (tallest === undefined) {
    tallest = 0;
    for (const [k, box] of contentBoxes)
      if (box && k.startsWith(`${charKey}_run_`) && box.h > tallest) tallest = box.h;
    if (!tallest) {
      const box = contentBoxes.get(charKey);
      tallest = box ? box.h : (assets[charKey] ? assets[charKey].height : 0);
    }
    charScaleCache[charKey] = tallest;
  }
  return tallest ? targetH / tallest : 0;
}

// Run-cycle per karakter dicari otomatis: assets/frames/<nama>_run_a…h + _idle + _victory
const OPTIONAL_IMAGES = {};
const RUN_SUFFIXES = ["a", "b", "c", "d", "e", "f", "g", "h"];   // s/d 8 frame run-cycle
for (const key of CHAR_KEYS) {
  const base = IMAGES[key].replace(/^assets\/characters\//, "").replace(/\.png$/, "");
  for (const s of RUN_SUFFIXES) OPTIONAL_IMAGES[`${key}_run_${s}`] = `assets/frames/${base}_run_${s}.png`;
  OPTIONAL_IMAGES[`${key}_idle`] = `assets/frames/${base}_idle.png`;
  OPTIONAL_IMAGES[`${key}_victory`] = `assets/frames/${base}_victory.png`;
}
// VFX boost level 4 & 5 — belum ada asetnya; begitu file PNG dipasang, langsung terpakai
OPTIONAL_IMAGES.lightning = "assets/vfx/boost-lightning-arcs.png";
OPTIONAL_IMAGES.nova = "assets/vfx/boost-nova-explosion.png";
// frame UI arcade — opsional: tanpa file, fallback rounded solid
OPTIONAL_IMAGES.lbFrame = "assets/ui/leaderboard-frame.png";
// --- tema "Indonesia": hanya cakrawala parallax 4 lapis yang dipakai ---
OPTIONAL_IMAGES.bgVolcano = "assets/bg/volcano-skyline-strip.png";
OPTIONAL_IMAGES.bgCity = "assets/bg/city-skyline-strip.png";
OPTIONAL_IMAGES.bgTemple = "assets/bg/temple-skyline-strip.png";
OPTIONAL_IMAGES.bgKampung = "assets/bg/kampung-rooftops-strip.png";
OPTIONAL_IMAGES.pigeon_flap_1 = "assets/frames/pigeon_indo_flap_1.png";
OPTIONAL_IMAGES.pigeon_flap_2 = "assets/frames/pigeon_indo_flap_2.png";
OPTIONAL_IMAGES.firework_1 = "assets/frames/firework_stage_1.png";
OPTIONAL_IMAGES.firework_2 = "assets/frames/firework_stage_2.png";
OPTIONAL_IMAGES.firework_3 = "assets/frames/firework_stage_3.png";
OPTIONAL_IMAGES.firework_4 = "assets/frames/firework_stage_4.png";

const canvas = document.getElementById("game-canvas");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d");

// ---------- asset loading ----------
const assets = {};
let assetsReady = null;

function loadAssets() {
  const entries = Object.entries(IMAGES);
  const optionalEntries = Object.entries(OPTIONAL_IMAGES);
  let loaded = 0, failed = 0;
  const total = entries.length;
  const bar = document.getElementById("asset-loader-bar");
  const countEl = document.getElementById("asset-loader-count");
  const update = () => {
    loaded += 1;
    if (bar) bar.style.width = `${Math.round(loaded / total * 100)}%`;
    if (countEl) countEl.textContent = `${loaded} / ${total} ASSET`;
  };
  const startedAt = Number(window.dragRaceLoaderStartedAt) || performance.now();
  // frame run-cycle opsional: gagal load = tanpa animasi kaki, tidak dihitung error
  optionalEntries.forEach(([key, src]) => {
    const img = new Image();
    img.onload = () => { assets[key] = img; window.__measureSprite(img, key); };
    img.src = src;
  });
  return Promise.all(entries.map(([key, src]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { assets[key] = img; update(); resolve(); };
    img.onerror = () => { failed += 1; update(); resolve(); };
    img.src = src;
  }))).then(() => new Promise((resolve) => {
    const remain = 1200 - (performance.now() - startedAt);
    setTimeout(() => resolve({ total, failed }), Math.max(0, remain));
  }));
}

// ---------- state ----------
const state = {
  phase: "lobby",          // lobby | countdown | running | finished
  runners: [],
  countdownEnds: 0,
  roundStarts: 0,
  roundDeadline: 0,
  toasts: [],              // {text, color, time}
  fx: [],                  // posisi dalam koordinat dunia
  winner: null,
  nextLane: 0,
  camX: 0,                 // posisi kamera (px dunia)
  camFocusUntil: 0,        // sampai kapan kamera cutaway ke pemain yang di-boost (ms)
  camFocusRunner: null,    // pemain yang sedang difokus
  camFocusBoost: false,    // true = fokus karena boost (prioritas tinggi, tidak dipotong roam)
  camNextRoamAt: 0,        // kapan kamera boleh mulai roam ke pelari acak (ms)
  camMode: "auto",         // auto = roam acak + cutaway boost; manual = user mengunci fokus dari leaderboard
  camLockRunner: null,     // pemain yang dikunci (mode manual); fokus permanen sampai user kembalikan ke AUTO
  camSoft: false,          // true = sedang pan lembut (roam / transisi balik ke pemimpin, cap kecepatan aktif)
  camLastFocusAt: 0,       // waktu pengalihan fokus terakhir (cooldown anti-goyang)
  parts: [],               // partikel prosedural (confetti, spark, dust, smoke)
  shake: 0,                // screen shake
  speedFx: 0,              // 0..1 intensitas FX ngebut B5 (speed lines + vignette emas), meluruh tiap frame
  goFlash: 0,              // 0..1 kilat "GO!" sesaat setelah countdown berakhir
  finishAt: 0,             // performance.now() saat ronde berubah ke finished (delay+punch overlay)
  roundCoins: 0,           // total koin gift yang masuk ronde ini ( utk panel finish )
  leaderRef: null,         // pelari terdepan yang belum finish (mahkota & aura)
  lbRankAt: 0,             // waktu evaluasi rank terakhir (panah ▲▼ leaderboard)
  lbOrder: new Map(),      // username → rank pada evaluasi terakhir
  flashes: [],             // kilatan kamera penonton di tribun
  birds: [],               // merpati yang melintas layar (flyby)
  nextBirdAt: 0,
  nextFireworkAt: 0
};
let selectedChar = 0;
// "bag" karakter: 5 key di-shuffle, dikeluarkan satu per satu TANPA pengulangan
// sampai habis → baru di-shuffle ulang (siklus baru). Jadi semua karakter pasti
// muncul dulu sebelum ada yang tampil dua kali — acak tapi merata.
let charBag = [];
function nextCharKey() {
  if (!charBag.length) charBag = [...CHAR_KEYS].sort(() => Math.random() - 0.5);
  return charBag.pop();
}

function pushToast(text, color = "#ffd08a", opts = {}) {
  state.toasts.push({ text, color, bg: opts.bg || null, time: CONFIG.TOAST_SECONDS, life: CONFIG.TOAST_SECONDS });
  if (state.toasts.length > MAX_TOASTS) state.toasts.shift();
}

// boost pemain: level tersimpang + config aktif (fallback trail bila aset level belum ada)
function boostOf(r, now) {
  // Boost: tiap gift/tap = satu entry dengan masa aktif sendiri. Entry level SAMA yang
  // overlap sudah dilebur jadi satu di grantBoost (durasinya yang nambah, speed tetap).
  // Level BEDA yang aktif bersamaan → kecepatan DIJUMLAH (mis. gift 25k = B4+B2 →
  // +75+35 m/s selama keduanya jalan), VFX/kamera memakai level tertinggi.
  const act = (r.boosts || []).filter((b) => b.until > now);
  if (act.length) {
    let idx = 0, add = 0;
    const seen = new Set();
    for (const b of act) {
      if (!seen.has(b.lvl)) { seen.add(b.lvl); add += CONFIG.BOOST_LEVELS[b.lvl].speedAdd; }
      if (b.lvl > idx) idx = b.lvl;
    }
    const cfg = CONFIG.BOOST_LEVELS[idx];
    const trailKey = assets[cfg.trail] ? cfg.trail : CONFIG.BOOST_FALLBACK_TRAIL;
    return { active: true, idx, cfg, trailKey, add };
  }
  const cfg = CONFIG.BOOST_LEVELS[0];
  const trailKey = assets[cfg.trail] ? cfg.trail : CONFIG.BOOST_FALLBACK_TRAIL;
  return { active: false, idx: 0, cfg, trailKey, add: 0 };
}

function safeAvatarUrl(value) {
  // hanya https — pola sama seperti faction-war; melindungi dari URL liar/lokal
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function addRunner(username, { silent = false, joinDelay = 0, randomChar = false, avatarUrl = "", userId = "" } = {}) {
  const clean = String(username || "Viewer").replace(/^@+/, "").slice(0, 24) || "Viewer";
  if (state.runners.length >= MAX_RUNNERS) {
    pushToast(`🚫 ${clean}: lintasan penuh (${MAX_RUNNERS})`, "#ff8a7a");
    return null;
  }
  const dup = state.runners.find((r) => r.username.toLowerCase() === clean.toLowerCase());
  if (dup) {
    // event berikutnya dari orang sama → perbarui foto/profil tanpa bikin pemain baru
    rememberProfile(dup, { avatarUrl, userId });
    return null;
  }
  const laneIdx = state.nextLane++ % MAX_RUNNERS;   // capture dulu: startOffPx memakai baris dari nilai ini
  // join di TENGAH race: masuk di posisi PALING BELAKANG (di belakang pelari terbelakang
  // yang belum finish + celah 1,5% lintasan) — bukan di garis start. Grid stagger tidak dipakai.
  const midRace = state.phase === "running" || state.phase === "countdown";
  const alive = state.runners.filter((r) => !r.finished);
  const minProg = alive.length ? Math.min(...alive.map((r) => r.progress)) : 0;
  const enterProgress = midRace ? Math.max(0, minProg - 0.015) : 0;
  const runner = {
    username: clean,
    joinedAt: performance.now(),   // untuk grace kamera: boost saat join tidak menyorot
    userId: String(userId || "").slice(0, 64),
    avatarUrl: safeAvatarUrl(avatarUrl),   // foto profil TikTok → avatar lingkaran (minimap & podium)
    charKey: randomChar ? nextCharKey() : CHAR_KEYS[selectedChar % CHAR_KEYS.length],
    lane: laneIdx,
    progress: enterProgress,
    distM: enterProgress * CONFIG.FINISH_DISTANCE_M,  // jarak tempuh (meter) — kecepatan m/s × waktu; progress = distM / FINISH_DISTANCE_M
    baseSpeed: CONFIG.BASE_SPEED + CONFIG.SPEED_JITTER_MIN + Math.random() * CONFIG.SPEED_JITTER_RANGE, // m/s rata-rata permanen per pemain
    // fluktuasi kecepatan SELAMA balapan: dua sinus frekuensi & fasa acak per pemain (pelari "napas")
    wanderAmp: CONFIG.SPEED_WANDER_AMP * (0.7 + Math.random() * 0.6),  // tiap pemain beda kekuatan naik-turun
    wanderT: Math.random() * 60,       // offset waktu awal (faSe acak)
    wanderP1: 6 + Math.random() * 8,   // periode gelombang lambat 6-14 dtk
    wanderP2: 1.6 + Math.random() * 2, // periode gelombang cepat 1,6-3,6 dtk
    boostFxUntil: 0,     // performance.now(): sampai kapan trail FX per-pemain digambar (max dari semua boost)
    boosts: [],          // antrian boost kumulatif: { lvl, until(performance.now()) }
    wobbleSeed: Math.random() * 10,
    // posisi start: grid rapi DI BELAKANG garis start (seperti balapan sungguhan) —
    // baris ke-0 terdekat garis (margin kecil), tiap baris berikutnya makin ke belakang.
    // Jarak antar baris dipadatkan otomatis agar muat di layar. Meluruh (→0) menjelang
    // finish sehingga semua tetap finis tepat di gerbang.
    startOffPx: midRace ? 0 : -(CONFIG.START_LINE_MARGIN + (Math.floor(laneIdx / CONFIG.MIN_LANES) % 10) * Math.min(CONFIG.START_ROW_GAP, Math.floor((CONFIG.WORLD_START_X - CONFIG.START_LINE_MARGIN - 200) / 10))),
    laneOff: 0,                       // grid rapi: tidak ada geser acak dalam lajur
    joinAt: performance.now() + joinDelay,   // awal animasi "pop masuk" (bisa di-stagger utk bot massal)
    joinFx: false,                    // sudah ditembakkan FX-nya?
    stepDist: 0,
    lastStep: -1,
    finished: false,
    place: 0,
    finishTime: 0
  };
  selectedChar++;
  state.runners.push(runner);
  if (!silent) pushToast(`🏃 ${clean} bergabung!`, "#8ef0a8");
  return runner;
}

function findRunner(username) {
  const key = String(username || "").toLowerCase();
  return state.runners.find((r) => r.username.toLowerCase() === key) || null;
}

// Perbarui foto profil/userId dari event TikTok yang datang (tanpa bikin pemain baru)
function rememberProfile(runner, event) {
  const av = safeAvatarUrl(event.avatarUrl);
  if (av && av !== runner.avatarUrl) { runner.avatarUrl = av; runner.avatarImg = null; runner.avatarLoading = false; }
  if (event.userId && !runner.userId) runner.userId = String(event.userId).slice(0, 64);
}

function startRace() {
  if (state.phase === "countdown" || state.phase === "running") return;
  if (state.runners.length === 0) {
    // Lobi kosong TIDAK lagi diisi bot otomatis — start harus ada pemain dulu
    // (join lewat komentar "1" / tombol + Viewer / + N Bot).
    pushToast(`⏳ Add player dulu — via komentar, gift, atau tombol ➕`, "#ff8a7a");
    return;
  }
  state.phase = "countdown";
  const countdownMs = CONFIG.COUNTDOWN_SECONDS * 1000;
  state.countdownEnds = performance.now() + countdownMs;
  state.winner = null;
  state.tapPool = new Map();      // penonton yang lagi numpuk tap menuju join, di-reset tiap ronde
  state.runners.forEach((r) => {
    r.distM = 0; r.progress = 0; r.finished = false; r.place = 0; r.boosts = []; r.boostFxUntil = 0; r.tapCount = 0;
  });
  state.roundStarts = performance.now() + countdownMs;
  state.roundCoins = 0;                    // reset pemboran koin untuk ronde baru
  state.roundDeadline = CONFIG.USE_ROUND_TIMEOUT
    ? performance.now() + countdownMs + CONFIG.ROUND_TIMEOUT_SECONDS * 1000
    : Infinity;                                  // tanpa batas waktu: ronde selesai hanya saat semua finish
  state.camFocusUntil = 0; state.camFocusRunner = null; state.camLastFocusAt = 0; state.camFocusBoost = false;
  scheduleNextRoam(performance.now());           // roam pertama muncuL beberapa detik setelah start
}

function resetGame() {
  state.phase = "lobby";
  state.runners = [];
  state.toasts = [];
  state.fx = [];
  state.parts = [];
  state.flashes = [];
  state.birds = [];
  state.nextBirdAt = performance.now() + 6000;
  state.shake = 0;
  state.speedFx = 0;
  state.winner = null;
  state.nextLane = 0;
  selectedChar = 0;
  charBag = [];
  pushToast("Game di-reset", "#9fb4d8");
}

function finishRunner(runner) {
  runner.finished = true;
  runner.distM = CONFIG.FINISH_DISTANCE_M;
  runner.progress = 1;
  runner.place = state.runners.filter((r) => r.finished).length;
  runner.finishTime = performance.now();
  spawnFx("starBurst", runnerWorldX(runner), laneY(runner.lane), 220);
  spawnParticle("ring", worldToScreen(runnerWorldX(runner)), laneY(runner.lane), { size: 60, color: "#ffd35c", life: 0.7 });
  addShake(runner.place === 1 ? 10 : 4);
  if (runner.place === 1) {
    state.winner = runner;
    spawnFx("confetti", runnerWorldX(runner), laneY(runner.lane) - 160, 300);
    confettiBurst(W / 2, 180, 120);
    for (let fw = 0; fw < 3; fw++) spawnFirework(W * (0.2 + fw * 0.3) + Math.random() * 80, 90 + Math.random() * 90);
    addShake(12);
    pushToast(`🏆 ${runner.username} menang!`, "#ffd35c");
  } else {
    pushToast(`#${runner.place} ${runner.username}`, "#cfe3ff");
  }
}

function spawnFx(imgKey, x, y, size, opts = {}) {
  if (state.fx.length > CONFIG.FX_MAX) state.fx.shift();
  state.fx.push({ imgKey, x, y, size, time: 0, life: opts.life ?? CONFIG.FX_LIFE, follow: opts.follow || null, offsetX: opts.offsetX ?? 0, offsetY: opts.offsetY ?? 0, drift: opts.drift ?? true, frames: opts.frames || 0 });
}

// kembang api: 4 tahap siklus cepat (pakai frame firework_1..4 bila tersedia)
// (x, y) = KOORDINAT LAYAR; fx butuh koordinat dunia → dikonversi; partikel memang layar
function spawnFirework(x, y) {
  if (!assets.firework_1) {
    // fallback prosedural bila aset belum ada
    const c2 = ["#ffd35c", "#ff6b6b", "#5ce1e6", "#ff8ad4"][Math.floor(Math.random() * 4)];
    for (let s = 0; s < 14; s++) {
      const ang = Math.random() * Math.PI * 2, spd = 90 + Math.random() * 220;
      spawnParticle("spark", x, y, { vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 60, size: 5 + Math.random() * 7, life: 0.9, color: s % 5 === 4 ? "#ffffff" : c2, grav: 300, drag: 0.965 });
    }
    return;
  }
  spawnFx("firework", screenToWorld(x), y, 150 + Math.random() * 130, { life: 0.92, drift: false, frames: 4 });
  const col = ["#ffd35c", "#ff6b6b", "#5ce1e6", "#ff8ad4"][Math.floor(Math.random() * 4)];
  for (let s = 0; s < 12; s++) {
    const ang = Math.random() * Math.PI * 2, spd = 90 + Math.random() * 220;
    spawnParticle("spark", x, y, { vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 60, size: 5 + Math.random() * 7, life: 0.9 + Math.random() * 0.5, color: s % 5 === 4 ? "#ffffff" : col, grav: 300, drag: 0.965 });
  }
}

// ---------- partikel prosedural (gambar murni canvas, presisi & murah) ----------
function spawnParticle(type, x, y, opts = {}) {
  if (state.parts.length > CONFIG.PARTICLE_MAX) state.parts.shift();
  state.parts.push({
    type, x, y,
    vx: opts.vx ?? 0, vy: opts.vy ?? 0,
    size: opts.size ?? 8,
    life: opts.life ?? 1, time: 0,
    rot: opts.rot ?? Math.random() * Math.PI * 2,
    vr: opts.vr ?? (Math.random() - 0.5) * 8,
    color: opts.color || "#fff",
    grav: opts.grav ?? 0,
    drag: opts.drag ?? 0.99
  });
}
function updateParticles(dt) {
  let w = 0;
  for (let i = 0; i < state.parts.length; i++) {
    const p = state.parts[i];
    p.time += dt;
    if (p.time < p.life) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.rot += p.vr * dt;
      state.parts[w++] = p;
    }
  }
  state.parts.length = w;
}
function drawParticles(types) {
  for (let i = 0; i < state.parts.length; i++) {
    const p = state.parts[i];
    if (types && !types.includes(p.type)) continue;
    const t = p.time / p.life;
    const a = Math.min(1, (1 - t) * 2.2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.type === "confetti") {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);   // pita kecil berputar
    } else if (p.type === "spark") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, p.size * 0.12);
      ctx.beginPath(); ctx.moveTo(-p.size / 2, 0); ctx.lineTo(p.size / 2, 0); ctx.stroke();
    } else if (p.type === "smoke" || p.type === "dust") {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.size * (1 + t * 1.6), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(2, 8 * (1 - t));
      ctx.beginPath(); ctx.arc(0, 0, p.size * (0.4 + t * 2.4), 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === "flash") {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = a * 0.9;
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Burst confetti perayaan (dipakai pemenang & tombol test)
function confettiBurst(cx, cy, n = 90, spread = 420) {
  const colors = ["#ff5c7a", "#ffd35c", "#8ef0a8", "#4da3ff", "#c3a1ff", "#ff9d4d", "#ffffff"];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
    const sp = spread * (0.45 + Math.random() * 0.9);
    spawnParticle("confetti", cx + (Math.random() - 0.5) * 60, cy, {
      vx: Math.cos(ang) * sp * 0.6, vy: Math.sin(ang) * sp,
      size: 8 + Math.random() * 12, life: 1.8 + Math.random() * 1.4,
      color: colors[(Math.random() * colors.length) | 0], grav: 620, drag: 0.995, vr: (Math.random() - 0.5) * 14
    });
  }
}
function addShake(amount) { state.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX, state.shake + amount); }

// hujan confetti jatuh dari atas (overlay pemenang)
function confettiRain(n = 10) {
  const colors = ["#ff5c7a", "#ffd35c", "#8ef0a8", "#4da3ff", "#c3a1ff", "#ff9d4d", "#ffffff"];
  for (let i = 0; i < n; i++) {
    spawnParticle("confetti", Math.random() * W, -20 - Math.random() * 60, {
      vx: (Math.random() - 0.5) * 90, vy: 180 + Math.random() * 260,
      size: 8 + Math.random() * 12, life: 3 + Math.random() * 2,
      color: colors[(Math.random() * colors.length) | 0], grav: 90, drag: 0.999, vr: (Math.random() - 0.5) * 12
    });
  }
}

// ---------- TikTok events ----------
window.publishTikTokEvent = (input) => tiktokConnector.publish(input);

// Beri boost lvl (0..4) ke runner, combo memperpanjang durasi. Dipakai jalur GIFT (B2–B5)
// maupun jalur TAP/LOVE (B1). `who` utk toast.
// Pecah harga per-unit gift jadi beberapa level boost (greedy dari level tertinggi,
// tiap level maksimal 1× per gift). Mis. ambang 1/5/10/20/30: 25 → [B4,B2]; 99 →
// [B5,B4,B3,B2,B1]; 3 → [B1]; 4 → [B1] (sisa di bawah ambang terendah dibuang).
function splitGiftCoins(coins) {
  const out = [];
  let sisa = coins;
  for (let i = CONFIG.BOOST_LEVELS.length - 1; i >= 1; i--) {
    if (sisa >= CONFIG.BOOST_LEVELS[i].minCoins) { out.push(i); sisa -= CONFIG.BOOST_LEVELS[i].minCoins; }
  }
  if (out.length === 0 && sisa >= CONFIG.BOOST_LEVELS[0].minCoins) out.push(0);   // tidak ada level ≥2 → B1 saja
  return out;
}

function grantBoost(runner, lvl, combo, who, now = performance.now()) {
  const cfg = CONFIG.BOOST_LEVELS[lvl];
  let seconds = Math.min(cfg.seconds * combo, CONFIG.BOOST_COMBO_MAX_SECONDS);
  runner.boosts = (runner.boosts || []).filter((b) => b.until > now);   // bersihkan yang kedaluwarsa
  const prevTop = runner.boosts.reduce((mx, b) => Math.max(mx, b.lvl), -1);
  // DURASI BERSIFAT AKUMULATIF: boost level SAMA yang datang saat entry-nya masih aktif
  // (klik beruntun / burst) → waktunya DITEMPEL DI EKOR entry yang ada, bukan timer paralel.
  // (Dulu tiap grant = entry sendiri dari `now` → overlap terbuang, durasi terasa tidak nambah.)
  // Level BEDA tetap jendela sendiri-sendiri; kecepatan = level tertinggi aktif.
  const same = runner.boosts.filter((b) => b.lvl === lvl);
  if (same.length) {
    const tail = Math.max(...same.map((b) => b.until));
    seconds = Math.max(seconds, seconds + (tail - now) / 1000);           // sisa jendela lama + baru
    runner.boosts = runner.boosts.filter((b) => b.lvl !== lvl);           // lebur jadi satu entry
    const until = Math.min(now + seconds * 1000, now + CONFIG.BOOST_COMBO_MAX_SECONDS * 1000);
    seconds = (until - now) / 1000;
    runner.boosts.push({ lvl, until });
  } else {
    runner.boosts.push({ lvl, until: now + seconds * 1000 });
  }
  runner.boostFxUntil = Math.max(runner.boostFxUntil, now + seconds * 1000);
  const effLvl = Math.max(lvl, prevTop);            // level efektif utk VFX/kejutan = tertinggi saat ini
  const effCfg = CONFIG.BOOST_LEVELS[effLvl];
  // Boost 1 (tap) tanpa sprite VFX — debu kaki + tambahan kecepatan saja.
  if (lvl > 0) {
    const fxKey = assets[cfg.fx] ? cfg.fx : CONFIG.BOOST_FALLBACK_TRAIL;
    spawnFx(fxKey, 0, 0, Math.round(220 * cfg.size), { follow: runner, offsetX: -70, life: Math.min(seconds, 4) });
  }
  const intensity = effLvl === 0 ? 3 : 6 + effLvl * 4;
  spawnParticle("ring", worldToScreen(runnerWorldX(runner)), laneY(runner.lane), { size: effLvl === 0 ? 16 : 40, color: effCfg.color, life: 0.35 });
  for (let s = 0; s < intensity; s++) {
    const ang = Math.random() * Math.PI * 2;
    spawnParticle(effLvl === 0 ? "dust" : "spark", worldToScreen(runnerWorldX(runner)), laneY(runner.lane), {
      vx: Math.cos(ang) * (120 + Math.random() * 200), vy: Math.sin(ang) * (120 + Math.random() * 200),
      size: 16 + Math.random() * 20, life: 0.4, color: effCfg.color, drag: 0.92
    });
  }
  addShake(effLvl === 0 ? 2 : 4 + effLvl * 2.5);
  // B5 (level tertinggi) → FX ngebut layar: speed lines + vignette emas ±1,6 dtk
  if (lvl === CONFIG.BOOST_LEVELS.length - 1) state.speedFx = 1;
  // KAMERA TIDAK menyorot pemain yang baru saja JOIN (join via gift/tap sekaligus boost) —
  // sorotan hanya untuk boost pemain yang sudah lama di lintasan. (Permintaan user.)
  const justJoined = now - (runner.joinedAt || 0) < CONFIG.JOIN_BOOST_CAM_GRACE_MS;
  if (!justJoined) focusCameraOn(runner, now);
  const activeTop = Math.max(...runner.boosts.map((b) => b.lvl));
  const comboTxt = combo > 1 ? ` ×${combo} → ${seconds.toFixed(0)} dtk` : "";
  pushToast(`${cfg.icon} ${who} ${cfg.label} (+${cfg.speedAdd} m/s)${comboTxt}${runner.boosts.length > 1 && activeTop > lvl ? ` — tumpang dengan ${CONFIG.BOOST_LEVELS[activeTop].label}` : ""}`, "#ffffff", { bg: cfg.color });
}

// Gabung pemain dari event apa pun (komentar kunci / gift ≥ B1 / tap ≥ setting).
// Gate MID_RACE_JOIN & batas lintasan ditegakkan di sini.
function isJoinComment(txt) {
  // txt sudah lower-case & trimmed. Persis = ikut; memuat keyword + pendek = ikut.
  // Keyword pendek (≤2 char, mis. "1") HARUS persis — kalau tidak, semua komentar
  // berisi angka 1 ("harga 100rb") akan dianggap join.
  for (const kw of CONFIG.JOIN_KEYWORDS) {
    const k = kw.toLowerCase();
    if (!k) continue;
    if (txt === k) return true;
    if (k.length > 2 && txt.length <= 40 && txt.includes(k)) return true;
  }
  return false;
}
// Teks kata kunci untuk UI (tanpa tanda petik): 1 / gas / lari / ikut
function joinKeywordsText() { return CONFIG.JOIN_KEYWORDS.filter(Boolean).join(" / "); }
function tryAutoJoin(event) {
  if ((state.phase === "running" || state.phase === "countdown") && !CONFIG.MID_RACE_JOIN) {
    pushToast(`⏳ ${event.username}: tunggu ronde berikutnya`, "#9fb4d8");
    return null;
  }
  const r = addRunner(event.username, { avatarUrl: event.avatarUrl, userId: event.userId });
  if (r && (state.phase === "running" || state.phase === "countdown")) {
    pushToast(`🏃 ${event.username} nyusul dari belakang!`, "#8ef0a8");
  }
  return r;
}

function handleTikTokEvent(event) {
  const now = performance.now();
  if (event.type === "comment") {
    // hanya komentar KUNCI yang membuat pemain — bukan semua chat.
    // Cocok longgar: komentar persis ATAU komentar pendek (≤40 char) yang memuat kata kunci —
    // mis. "gas" dan "gas dong!" sama-sama ikut; komentar panjang/obrolan diabaikan.
    const txt = event.comment.trim().toLowerCase();
    if (!isJoinComment(txt)) return;
    tryAutoJoin(event);
    return;
  }
  if (event.type === "join") {
    // ⚠️ event "join" TikTok = orang MASUK room (member) — BUKAN daftar pemain.
    // (Bug lama: tiap penonton yang lewat masuk room langsung jadi pelari.)
    // Ikut serta yang benar: komentar kunci (CONFIG.JOIN_KEYWORDS), gift ≥ ambang B1, atau tap ≥ setting.
    return;
  }
  if (event.type === "gift") {
    let runner = findRunner(event.username);
    if (runner) rememberProfile(runner, event);
    const combo = Math.max(1, event.giftCount || 1);
    const unitCoins = event.coinValue > 0 ? event.coinValue : 1;
    // GIFT = salah satu cara JOIN: belum pemain tapi nilai gift ≥ ambang B1 → auto-gabung
    if (!runner && unitCoins >= CONFIG.BOOST_LEVELS[0].minCoins) {
      runner = tryAutoJoin(event);
    }
    if (state.phase !== "running") {
      pushToast(`⭐ ${event.username} kasih dukungan ×${event.giftCount} (boost hanya saat race)`, "#c3a1ff");
      return;
    }
    if (!runner) { pushToast(`⭐ ${event.username}: kirim dukungan ≥${CONFIG.BOOST_LEVELS[0].minCoins} atau tap 💗 buat ikut`, "#ff8a7a"); return; }
    if (runner.finished) { pushToast(`⭐ ${event.username} sudah finish`, "#9fb4d8"); return; }
    // Level boost gift: HARGA PER-GIFT (coinValue) DIPECAH ke ambang-ambang (greedy),
    // mis. 25 koin = B4 (20) + B2 (5) → dua boost sekaligus: kecepatan DIJUMLAH selama
    // keduanya aktif, durasi tiap level jalan sendiri (4 dtk B4? → sesuai cfg masing2).
    // Sisa < ambang B2 tapi ≥ ambang B1 → 1× B1. Combo (giftCount) memperpanjang
    // durasi tiap bagian (detik dasar × combo, di-cap BOOST_COMBO_MAX_SECONDS).
    state.roundCoins += unitCoins * combo;   // total koin riil yang dibakar ronde ini
    const parts = splitGiftCoins(unitCoins);
    for (const p of parts) grantBoost(runner, p, combo, event.username);
    return;
  }
  if (event.type === "like") {
    const taps = Math.max(1, event.likeCount || 1);
    const per = Math.max(10, CONFIG.LIKE_TAPS_PER_BOOST || 100);
    const runner = findRunner(event.username);
    if (runner) rememberProfile(runner, event);
    if (!runner) {
      // TAP = salah satu cara JOIN: belum pemain → akumulasikan tap di pool;
      // sampai LIKE_TAPS_PER_BOOST → auto-gabung lalu dapat 1× B1.
      if (!state.tapPool) state.tapPool = new Map();
      const key = String(event.username || "").toLowerCase();
      const n = (state.tapPool.get(key) || 0) + taps;
      if (n < per) { state.tapPool.set(key, n); return; }
      state.tapPool.delete(key);
      const joined = tryAutoJoin(event);
      if (joined && state.phase === "running" && !joined.finished) grantBoost(joined, 0, 1, event.username, now);
      return;
    }
    if (state.phase !== "running") return;
    if (runner.finished) return;
    // Tap/love = AKUMULATOR BOOST 1: tiap LIKE_TAPS_PER_BOOST tap dari penonton yang sama
    // → 1× Boost 1. Like burst besar menghasilkan beberapa boost sekaligus
    // (combo = jumlah boost pada event ini) → durasi memanjang, kecepatan tetap.
    runner.tapCount = (runner.tapCount || 0) + taps;
    const earned = Math.floor(runner.tapCount / per);
    if (earned > 0) {
      runner.tapCount -= earned * per;
      grantBoost(runner, 0, earned, event.username, now);
    }
    // Bekas: 35% spawn sprite "streaks" per like — itu VFX B3 (biru), muncul aneh di B1. B1 = debu kaki saja.
    return;
  }
}

const unsubscribe = tiktokConnector.subscribe(handleTikTokEvent);
if (!window.dragRaceDevMode && window.tiktokListenerEndpoint) {
  tiktokConnector.connect(window.tiktokListenerEndpoint);
}

// ---------- simulation ----------
// (tombol "+ Viewer" & "🎲 Random" dihapus dari dock; tambah pemain via 🤖 +1 atau komentar join)

// ---------- tombol tambah pemain manual (bot) ----------
// Nama: ACAK dari BOT_NAMES tiap klik (bukan urut); anti-duplikat dengan varian angka.
function botName() {
  const pool = CONFIG.BOT_NAMES;
  const base = pool[Math.floor(Math.random() * pool.length)];
  let name = base;
  let n = 2;
  while (state.runners.some((r) => r.username.toLowerCase() === name.toLowerCase())) {
    name = `${base}${n++}`;
  }
  return name;
}
// +1 bot: satu pemain baru langsung masuk lobi (bisa sebelum ATAU saat balapan berjalan)
// karakter juga ACAK supaya visual tidak berpola bergiliran.
function addOneBot() {
  const r = addRunner(botName(), { silent: true, randomChar: true });
  if (r) pushToast(`🤖 ${r.username} bergabung!`, "#9fb4d8");
}
// 🎲 Random (1–5 bot) dihapus dari dock — fungsi dipangkas; 🤖 +1 tetap ada di atas.

// Dock simulasi boost. B1 = jalur TAP/LOVE (like), B2–B5 = gift dengan coinValue tepat
// di ambang level tsb agar tidak salah bucket.
let boostTarget = 0;
function simBoost(level) {
  const idx = Math.max(1, Math.min(CONFIG.BOOST_LEVELS.length, level)) - 1;
  const alive = state.runners.filter((r) => !r.finished);
  const target = alive.length ? alive[boostTarget++ % alive.length] : null;
  const username = target?.username || "Tester";
  if (idx === 0) {
    window.publishTikTokEvent({ eventType: "like", username, likeCount: CONFIG.LIKE_TAPS_PER_BOOST });
    return;
  }
  window.publishTikTokEvent({ eventType: "gift", username, giftName: "Boost", giftId: "5655", giftCount: 1, coinValue: CONFIG.BOOST_LEVELS[idx].minCoins });
}

// ---------- layout ----------
const LAYOUT = {
  headerY: 10,
  headerH: 108,
  boardY: 8,
  crowdY: 236,
  crowdH: 82,
  grassY: 322,
  grassH: 32,
  trackTop: 380,
  trackBottom: 1020
};

function raceMetrics() {
  // Area lajur TIDAK pernah di-resize berapa pun jumlah peserta: selalu 4 lajur
  // tetap (MIN_LANES) dengan tinggi tetap. Peserta ke-5 dan seterusnya menumpuk
  // di lajur yang sama (round-robin) — tidak ada proses pengecilan area/karakter.
  const lanes = CONFIG.MIN_LANES;
  const trackH = LAYOUT.trackBottom - LAYOUT.trackTop;
  const laneH = Math.floor(trackH / lanes);
  const totalH = laneH * lanes;
  const top = LAYOUT.trackTop + Math.floor((trackH - totalH) / 2);
  return { lanes, laneH, top, bottom: top + totalH };
}
function laneY(lane) {
  const m = raceMetrics();
  const idx = ((lane % m.lanes) + m.lanes) % m.lanes;   // round-robin ke 4 lajur tetap
  return m.top + idx * m.laneH + m.laneH / 2;
}
function runnerWorldX(r) {
  // posisi dunia = start + stagger awal (mengecil progresif → semua finis tepat di gerbang)
  return WORLD.startX + (r.startOffPx || 0) * (1 - r.progress) + (WORLD.finishX - WORLD.startX) * r.progress;
}
function worldToScreen(wx) { return (wx - state.camX) * ZOOM; }
function screenToWorld(sx) { return sx / ZOOM + state.camX; }

// ---------- update (single central updater, no per-object tweens) ----------
// cutaway kamera: saat ada pemain di-boost, kamera fokus ke dia beberapa detik, lalu kembali ke pemimpin
function focusCameraOn(runner, now, isBoost = true) {
  if (!runner || state.phase !== "running") return false;
  // MODE MANUAL (lock) = RAJA: roam & boost sama sekali tidak memotong.
  // Kamera tetap ke pemain terkunci sampai user mengembalikan ke AUTO.
  if (state.camMode === "manual") return false;
  // boost = aksi penting: SELALU difokus walau pelari jauh di belakang pemimpin
  // (kamera menyusur mundur; pan jarak jauh dibatasi kecepatan di update)
  // roam dibatasi di belakang pemimpin HANYA di mode pan halus — di LOCAT (CAM_SNAP)
  // tidak ada animasi perjalanan, jadi batas jarak tidak relevan (semua pemain dijangkau)
  if (!isBoost && !CONFIG.CAM_SNAP) {
    const alive = state.runners.filter((r) => !r.finished);
    const leaderX = alive.length ? Math.max(...alive.map((r) => runnerWorldX(r))) : runnerWorldX(runner);
    if (leaderX - runnerWorldX(runner) > CONFIG.CAM_FOCUS_MAX_BEHIND) return false;
  }
  // prioritas: boost SELALU memotong fokus (roam/leader); roam tidak boleh memotong boost aktif
  // dan roam↔beruntun dibatasi cooldown agar kamera tidak goyang
  if (!isBoost) {
    if (state.camFocusRunner && state.camFocusBoost && now < state.camFocusUntil) return false;
    if (now - state.camLastFocusAt < CONFIG.CAM_FOCUS_COOLDOWN * 1000 && state.camFocusRunner !== runner) return false;
  }
  state.camFocusRunner = runner;
  state.camFocusBoost = !!isBoost;
  let seconds = isBoost ? CONFIG.CAM_FOCUS_SECONDS : CONFIG.CAM_ROAM_SECONDS;
  if (isBoost) {
    // beri waktu cukup agar kamera sempat menyusur ke pelari jauh sebelum fokus kedaluwarsa
    const dist = Math.abs(runnerWorldX(runner) - state.camX);
    seconds = Math.max(seconds, dist / CONFIG.CAM_BOOST_PAN_MAX_SPEED + 1.5);
  }
  state.camFocusUntil = now + seconds * 1000;
  state.camLastFocusAt = now;
  return true;
}

// roam: sesekali kamera ikut pelari acak (bukan pemimpin), memberi kesan "semua pemain dilihat"
function scheduleNextRoam(now, overrideSec) {
  const min = CONFIG.CAM_ROAM_EVERY_MIN, max = CONFIG.CAM_ROAM_EVERY_MAX;
  const delay = Number.isFinite(overrideSec) ? overrideSec : min + Math.random() * (max - min);
  state.camNextRoamAt = now + delay * 1000;
}

function maybeRoam(now) {
  if (state.camMode !== "auto") return;          // manual: roam mati
  if (!CONFIG.CAM_ROAM_ENABLED || now < state.camNextRoamAt) return;
  if (state.runners.length < 2) return;          // 1 pemain: tidak ada yang bisa di-roam
  const leader = state.runners.reduce((a, b) => (b.progress > a.progress ? b : a));
  const leaderX = runnerWorldX(leader);
  // mode LOCAT (CAM_SNAP): lompat instan, tanpa batas jarak → semua pelari terjangkau
  const maxBehind = CONFIG.CAM_SNAP ? Infinity : CONFIG.CAM_ROAM_MAX_BEHIND;
  const cand = state.runners.filter((r) => !r.finished && r !== leader && !(r.boosts.some((b) => b.until > now))
    && leaderX - runnerWorldX(r) <= maxBehind);
  if (!cand.length) { scheduleNextRoam(now); return; }
  // ROUND-ROBIN, bukan acak murni: acak dengan bobot jarak → yang disorot hampir selalu
  // pelari 2 (dekat pemimpin), penonton belakang tak pernah kelihatan.
  // Ambil yang PALING LAMA tidak disorot (iklan "semua pemain dilihat" terbukti).
  cand.sort((a, b) => (a.lastRoamAt || 0) - (b.lastRoamAt || 0));
  const freshest = cand.filter((r) => (r.lastRoamAt || 0) === (cand[0].lastRoamAt || 0));
  const pick = freshest[Math.floor(Math.random() * freshest.length)];
  const taken = focusCameraOn(pick, now, false);
  if (taken) pick.lastRoamAt = now;   // hitung "pernah disorot" hanya bila roam tidak ditolak boost
  // BUG LAMA: jadwal roam berikutnya selalu 12–20 dtk meski pick DITOLAK (boost masih
  // aktif / cooldown) → di live yang sering boost, roam nggak pernah sempat jalan.
  // Sekarang: ditolak → retry cepat 3 dtk; diterima → interval normal.
  scheduleNextRoam(now, taken ? undefined : 3);
}

function update(dt, now) {
  // kamera: default mengikuti pemimpin; sementara cutaway ke pemain yang di-boost
  let leader = null;
  for (let i = 0; i < state.runners.length; i++) {
    if (!leader || state.runners[i].progress > leader.progress) leader = state.runners[i];
  }
  if (state.camFocusRunner && (now > state.camFocusUntil || state.camFocusRunner.finished || state.phase !== "running")) state.camFocusRunner = null;
  maybeRoam(now);                                 // sesekali ikut pelari lain; boost tetap yang terkuat
  // lock MANUAL menang atas boost: kunci tetap difokus sampai user mengembalikan ke AUTO
  const boostFocus = state.camFocusRunner && now < state.camFocusUntil;
  if (state.camLockRunner && (!state.runners.includes(state.camLockRunner) || (state.camLockRunner.finished && state.phase === "countdown"))) state.camLockRunner = null;
  const focus = (state.camMode === "manual" && state.camLockRunner) ? state.camLockRunner : (boostFocus ? state.camFocusRunner : null);
  const camSubject = focus || leader;
  const anchor = focus ? CONFIG.CAM_FOCUS_ANCHOR_X : CAM_ANCHOR;
  let targetCam = camSubject ? runnerWorldX(camSubject) - anchor / ZOOM : 0;
  // kamera "mengikuti paket": selama seluruh pelari masih muat ±1 layar, kamera
  // TIDAK boleh melewati pelari paling belakang — jadi grid start, joiner baru di
  // belakang, dan penyusulan selalu terbingkai. Setelah paket terpisah >1 layar,
  // kamera kembali murni mengikuti pemimpin.
  if (!focus && state.runners.length) {
    const xs = state.runners.filter((r) => !r.finished).map(runnerWorldX);
    if (xs.length) {
      const rearX = Math.min(...xs), frontX = Math.max(...xs);
      if (state.phase === "lobby" || state.phase === "countdown") {
        targetCam = (rearX + frontX) / 2 - anchor / ZOOM;   // bingkai grid start utuh (di belakang garis)
      } else if (frontX - rearX <= VIEW_W() - CONFIG.GRID_BACK_MARGIN * 2) {
        targetCam = Math.min(targetCam, rearX - CONFIG.GRID_BACK_MARGIN / ZOOM);
      }
    } else if (state.phase === "lobby") {
      targetCam = WORLD.startX - anchor / ZOOM;             // lobi kosong: tetap sorot garis start
    }
  }
  const maxCam = WORLD.finishX + CONFIG.CAM_FINISH_MARGIN / ZOOM - VIEW_W();
  targetCam = Math.min(maxCam, Math.max(0, targetCam));
  // smoothing: kunci manual (paling tinggi) > roam lembut > cutaway boost > pengikut pemimpin
  if (CONFIG.CAM_SNAP) {
    // TANPA pan halus: kamera LOCAT langsung ke posisi target saat posisi berubah.
    // Fokus roam/lane/boost tetap dipertahankan durasinya — hanya cara berpindahnya instant.
    state.camX = targetCam;
    state.camSoft = false;
  } else {
    const smoothing = focus === state.camLockRunner ? CONFIG.CAM_LOCK_SMOOTHING
      : focus && !state.camFocusBoost ? CONFIG.CAM_ROAM_SMOOTHING
      : focus ? CONFIG.CAM_CUTAWAY_SMOOTHING : CONFIG.CAM_SMOOTHING;
    const k = 1 - Math.exp(-smoothing * dt);
    // fase "soft" = roam sedang jalan ATAU sedang kembali dari roam ke pemimpin:
    // pan lembut + cap kecepatan; boost/manual memotong fase ini
    if (focus && !state.camFocusBoost && focus !== state.camLockRunner) state.camSoft = true;
    if (state.camFocusBoost || state.camMode === "manual") state.camSoft = false;
    const soft = state.camSoft && !focus;
    if (soft && Math.abs(targetCam - state.camX) < 40) state.camSoft = false;   // sudah merapat → lepas
    const cap = (focus && !state.camFocusBoost && focus !== state.camLockRunner) || soft
      ? CONFIG.CAM_ROAM_MAX_SPEED
      : (focus && state.camFocusBoost) ? CONFIG.CAM_BOOST_PAN_MAX_SPEED : 0;   // boost jauh: menyusur, bukan teleport
    let nextDelta = (targetCam - state.camX) * k;
    // catch-up paksa: jarak kamera→target > 1 layar → laju MINIMUM CAM_CATCHUP_SPEED
    // (jarak jauh tidak boleh "ngesot"; di atas 1 layar tetap dibatasi cap pan anti-teleport)
    const gapPx = targetCam - state.camX;
    const catchMin = CONFIG.CAM_CATCHUP_SPEED * dt;
    if (Math.abs(gapPx) > W / ZOOM) nextDelta = Math.sign(gapPx) * Math.max(Math.abs(nextDelta), Math.min(Math.abs(gapPx), catchMin * 2));
    if (cap) nextDelta = Math.max(-cap * dt, Math.min(cap * dt, nextDelta));
    state.camX += nextDelta;
    if (Math.abs(targetCam - state.camX) < 0.5 && !cap) state.camX = targetCam;
  }

  // countdown
  if (state.phase === "countdown") {
    if (now >= state.countdownEnds) {
      state.phase = "running";
      state.goFlash = 1;                      // kilat "GO!" melebar & memudar
      pushToast("GO! 🚦", "#8ef0a8");
    }
  }

  if (state.phase === "running") {
    for (let i = 0; i < state.runners.length; i++) {
      const r = state.runners[i];
      if (r.finished) continue;
      const boost = boostOf(r, now);
      // kecepatan = rata-rata dasar + boost + NAIK-TURUN selama lari (dua sinus, ±SPEED_WANDER_AMP)
      r.wanderT += dt;
      const wander = r.wanderAmp * (Math.sin((r.wanderT * 2 * Math.PI) / r.wanderP1) + 0.5 * Math.sin((r.wanderT * 2 * Math.PI) / r.wanderP2)) / 1.5;
      const speed = r.baseSpeed + boost.add + wander;
      r.distM += speed * dt;
      r.progress = Math.min(1, r.distM / CONFIG.FINISH_DISTANCE_M);
      r.stepDist += speed * CONFIG.PX_PER_METER * dt;                         // px dunia utk siklus langkah
      if (r.progress >= 1) finishRunner(r);
    }
    // Ronde selesai saat ROUND_FINISH_AFTER pemain finish (podium 1-2-3 terisi).
    // Bila peserta lebih sedikit dari N → tunggu SEMUANYA finish (allDone).
    const need = Math.min(CONFIG.ROUND_FINISH_AFTER, state.runners.length);
    const finishedCount = state.runners.filter((r) => r.finished).length;
    if (finishedCount >= need || now >= state.roundDeadline) {
      // yang belum finish diberi peringkat berdasarkan progress (lebih jauh = lebih baik)
      state.runners.filter((r) => !r.finished).sort((a, b) => b.progress - a.progress)
        .forEach((r) => {
          r.finished = true;
          r.place = state.runners.filter((x) => x.place > 0).length + 1;
        });
      if (!state.winner) {
        state.winner = state.runners.reduce((best, r) => (!best || r.place < best.place ? r : best), null);
      }
      state.phase = "finished";
      state.finishAt = now;                  // overlay podium muncul setelah jeda dramatis
    }
  }

  // fx + toast (prune in-place)
  updateParticles(dt);
  state.shake = Math.max(0, state.shake - dt * 40);
  state.speedFx = Math.max(0, state.speedFx - dt * 0.6);   // FX ngebut B5 meluruh ±1,6 dtk
  state.goFlash = Math.max(0, state.goFlash - dt * 1.4);   // kilat GO ±0,7 dtk
  // kilatan kamera penonton DIHAPUS (tribun tidak lagi digambar)
  // merpati flyby sesekali (hanya bila aset frame tersedia)
  if (assets.pigeon_flap_1 && state.phase !== "lobby" && now > state.nextBirdAt) {
    state.nextBirdAt = now + (8000 + Math.random() * 12000);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const flock = 1 + Math.floor(Math.random() * 3);
    for (let b = 0; b < flock; b++) {
      state.birds.push({
        x: dir > 0 ? -80 - b * 70 : W + 80 + b * 70,
        baseY: 150 + Math.random() * 90,   // di bawah panel minimap/bunting, masih area langit
        vx: dir * (240 + Math.random() * 140),
        amp: 12 + Math.random() * 16,
        phase: Math.random() * 6.28,
        scale: 0.7 + Math.random() * 0.5,
        dir, t: 0
      });
    }
  }
  for (let i = state.birds.length - 1; i >= 0; i--) {
    const b = state.birds[i];
    b.t += dt; b.x += b.vx * dt;
    if ((b.dir > 0 && b.x > W + 120) || (b.dir < 0 && b.x < -120)) state.birds.splice(i, 1);
  }
  // hujan confetti berkelanjutan selama overlay pemenang tampil
  if (state.phase === "finished" && state.winner) confettiRain(4);
  // kembang api berkala di langit selama fase juara (timer, bukan probabilitas dt)
  if (state.phase === "finished" && state.winner && now >= state.nextFireworkAt) {
    state.nextFireworkAt = now + 650 + Math.random() * 900;
    spawnFirework(140 + Math.random() * (W - 280), 60 + Math.random() * 150);
    if (Math.random() < 0.5) spawnFirework(140 + Math.random() * (W - 280), 60 + Math.random() * 150);
  }
  for (let i = state.flashes.length - 1; i >= 0; i--) {
    state.flashes[i].time += dt;
    if (state.flashes[i].time > 0.16) state.flashes.splice(i, 1);
  }
  let w = 0;
  for (let i = 0; i < state.fx.length; i++) {
    const f = state.fx[i];
    f.time += dt;
    if (f.time < f.life) state.fx[w++] = f;
  }
  state.fx.length = w;

  w = 0;
  for (let i = 0; i < state.toasts.length; i++) {
    const t = state.toasts[i];
    t.time -= dt;
    if (t.time > 0) state.toasts[w++] = t;
  }
  state.toasts.length = w;
}

// ---------- draw helpers (aspect-preserving, no stretch) ----------
function drawImage(imgKey, cx, cy, height) {
  const img = assets[imgKey];
  if (!img) return;
  const w = height * (img.width / img.height);
  ctx.drawImage(img, cx - w / 2, cy - height / 2, w, height);
}

// Tile a strip image horizontally at fixed height, native aspect (no stretch).
// scroll = geser dunia (untuk parallax, kalikan faktor per lapisan).
function tileStrip(imgKey, y, h, scroll = 0) {
  const img = assets[imgKey];
  if (!img) return;
  const tw = h * (img.width / img.height);          // ukuran tile natural (tanpa distorsi)
  const off = scroll * ZOOM;                        // kamera zoom-out → geser lebih pelan di layar
  let x = -(((off % tw) + tw) % tw);
  for (; x < W; x += tw) ctx.drawImage(img, x, y, tw, h);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Tile gambar 2D mengikuti dunia (scroll X kamera, clamp Y dalam area). alpha global.
// Rect konten (crop padding transparan terukur) dari aset, dengan margin inset opsional.
function srcBox(key, inset = 0) {
  const img = assets[key];
  if (!img) return null;
  const b = contentBoxes.get(key) || { x: 0, y: 0, w: img.width, h: img.height };
  if (!b.w || !b.h) return null;
  const ix = b.w * inset, iy = b.h * inset;
  return { x: b.x + ix, y: b.y + iy, w: b.w - 2 * ix, h: b.h - 2 * iy };
}

function tileWorld(imgKey, x0, y0, x1, y1, scrollPx, alpha = 1, tileH = null) {
  const img = assets[imgKey];
  const r = srcBox(imgKey, 0.02);       // inset 2%: buang baris tepi semi-transparan sumber garis
  if (!img || !r) return;
  const h = tileH || (y1 - y0);
  const w = h * (r.w / r.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.globalAlpha = alpha;
  const off = ((scrollPx % w) + w) % w;
  let ti = Math.floor(scrollPx / w);       // indeks tile utk pola mirror bolak-balik
  for (let x = x0 - off; x < x1; x += w, ti++) {
    for (let y = y0; y < y1; y += h) {
      // mirror tile genap/ganjil: tepi yang bertemu = piksel identik → seam grain hilang
      if (ti % 2) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w + 1, Math.min(h, y1 - y));
        ctx.restore();
      } else {
        ctx.drawImage(img, r.x, r.y, r.w, r.h, x, y, w + 1, Math.min(h, y1 - y));
      }
    }
  }
  ctx.restore();
}

// Frame PNG 9-slice: 4 sudut digambar utuh, tepi direntang, tengah kosong (untuk konten kanvas).
function nineSlice(imgKey, x, y, w, h, corner = 48, alpha = 1) {
  const img = assets[imgKey];
  const b = img && (contentBoxes.get(imgKey) || { x: 0, y: 0, w: img.width, h: img.height });
  if (!b) return false;
  // potong dari bounding-box konten (buang padding transparan PNG) + inset 2px anti seam
  const ins = 2;
  const sx = b.x + ins, sy = b.y + ins, sw = b.w - ins * 2, sh = b.h - ins * 2;
  const c = Math.min(corner, sh / 2, h / 2);
  const cw = Math.min(corner, sw / 2, w / 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  // sudut (proporsional dari box konten)
  ctx.drawImage(img, sx, sy, cw, c, x, y, cw, c);
  ctx.drawImage(img, sx + sw - cw, sy, cw, c, x + w - cw, y, cw, c);
  ctx.drawImage(img, sx, sy + sh - c, cw, c, x, y + h - c, cw, c);
  ctx.drawImage(img, sx + sw - cw, sy + sh - c, cw, c, x + w - cw, y + h - c, cw, c);
  // tepi direntang
  ctx.drawImage(img, sx + cw, sy, sw - 2 * cw, c, x + cw, y, w - 2 * cw, c);
  ctx.drawImage(img, sx + cw, sy + sh - c, sw - 2 * cw, c, x + cw, y + h - c, w - 2 * cw, c);
  ctx.drawImage(img, sx, sy + c, cw, sh - 2 * c, x, y + c, cw, h - 2 * c);
  ctx.drawImage(img, sx + sw - cw, sy + c, cw, sh - 2 * c, x + w - cw, y + c, cw, h - 2 * c);
  ctx.restore();
  return true;
}

// "#rrggbb" → "rgba(r,g,b,a)" (untuk glow boost per level)
function hexToRgba(hex, a) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawToasts() {
  // style FLAT: kotak tanpa radius, tanpa border, lebih kecil
  ctx.textAlign = "left";
  ctx.font = "700 22px 'Trebuchet MS', system-ui";
  const x1 = W - 28;                      // tepi kanan panel
  const rowH = 44, padX = 14, maxW = 620;
  for (let i = 0; i < state.toasts.length; i++) {
    const t = state.toasts[i];
    const age = t.life - t.time;          // detik sejak muncul
    const slideIn = Math.min(1, age * 4); // slide dari kanan
    const fadeOut = Math.min(1, t.time * 2);
    const y = (CONFIG.SHOW_MINIMAP ? 128 : 24) + i * (rowH + 6);
    const tw = Math.min(ctx.measureText(t.text).width, maxW);
    const bw = tw + padX * 2;
    const px = x1 - bw + (1 - easeOut(slideIn)) * (bw + 60);
    ctx.globalAlpha = fadeOut * 0.97;
    if (t.bg) {
      // CHIP boost: latar warna level penuh + strip gelap + teks gelap → "mahal"
      ctx.fillStyle = t.bg;
      ctx.fillRect(px, y - rowH + 6, bw, rowH);
      ctx.fillStyle = "rgba(10,14,26,.85)";
      ctx.fillRect(px, y - rowH + 6, 6, rowH);
      ctx.fillStyle = "#10162a";
    } else {
      ctx.fillStyle = "rgba(10,14,26,.82)";
      ctx.fillRect(px, y - rowH + 6, bw, rowH);   // kotak tajam, flat
      ctx.fillStyle = t.color;
      ctx.fillRect(px, y - rowH + 6, 4, rowH);     // aksen kiri tipis kotak
    }
    ctx.fillText(t.text, px + padX + 6, y - 8, tw);
    ctx.globalAlpha = 1;
  }
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
// ease "back": overshoot elastic — dipakai pop masuk pemain baru
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

function drawBackground(now) {
  const m = raceMetrics();

  // === langit: gradien hangat + matahari berpendar — turun sampai tepi rumput
  // (dulu berhenti di tribun; tribun dihapus → area tengah jadi gelap/block kosong) ===
  const skyBottom = LAYOUT.grassY + 4;
  const sky = ctx.createLinearGradient(0, 0, 0, skyBottom);
  sky.addColorStop(0, "#3d8fd8");
  sky.addColorStop(0.42, "#8cc5f0");
  sky.addColorStop(0.72, "#cfe8fb");
  sky.addColorStop(1, "#f3e9d2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, skyBottom);

  // matahari + halo + flare lensa lembut
  const sunX = W * 0.82, sunY = 74;
  const halo = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 170);
  halo.addColorStop(0, "rgba(255,244,214,.95)");
  halo.addColorStop(0.35, "rgba(255,225,150,.45)");
  halo.addColorStop(1, "rgba(255,225,150,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 180, sunY - 180, 360, 360);
  ctx.fillStyle = "#fff6d8";
  ctx.beginPath(); ctx.arc(sunX, sunY, 30, 0, Math.PI * 2); ctx.fill();
  // sinar bintang 4 arah + flare lensa kecil menuju tengah layar
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#fff2c4";
  ctx.lineWidth = 3;
  for (let a = 0; a < 4; a++) {
    const ang = (Math.PI / 4) * a + Math.sin(now / 2400) * 0.08;
    const len = 74 + Math.sin(now / 900 + a) * 10;
    ctx.beginPath();
    ctx.moveTo(sunX - Math.cos(ang) * len, sunY - Math.sin(ang) * len);
    ctx.lineTo(sunX + Math.cos(ang) * len, sunY + Math.sin(ang) * len);
    ctx.stroke();
  }
  const flareDir = { x: W / 2 - sunX, y: H * 0.45 - sunY };
  for (let f = 1; f <= 3; f++) {
    const fx2 = sunX + flareDir.x * f * 0.35, fy2 = sunY + flareDir.y * f * 0.35;
    const fr = [16, 10, 22][f - 1];
    const fg = ctx.createRadialGradient(fx2, fy2, 1, fx2, fy2, fr);
    fg.addColorStop(0, "rgba(255,236,180,.4)");
    fg.addColorStop(1, "rgba(255,236,180,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(fx2, fy2, fr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // === awan multi-lapis (parallax 0.05, bentuk tumpang tindih lembut) ===
  const cloudBase = (now / 45 - state.camX * 0.05 * ZOOM);
  ctx.fillStyle = "rgba(255,255,255,.75)";
  for (let i = 0; i < 5; i++) {
    const span = W + 700;
    const cxp = ((cloudBase + i * 460 + i * i * 53) % span + span) % span - 350;
    const cyp = 46 + (i % 3) * 42;
    const s = 0.7 + (i % 3) * 0.35;
    ctx.beginPath();
    ctx.ellipse(cxp, cyp, 96 * s, 24 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cxp + 62 * s, cyp + 7 * s, 64 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cxp - 58 * s, cyp + 9 * s, 56 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cxp + 10 * s, cyp - 16 * s, 58 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // === cakrawala jauh "Indonesia" — tribun/palem/lampu DIHAPUS, siluet diturunkan
  // menempel tepi rumput (grassY) sebagai latar belakang utama ===
  const skyline = [
    ["bgVolcano", 0.08, 228, 0.9],
    ["bgCity", 0.12, 190, 0.95],
    ["bgTemple", 0.16, 160, 1],
    ["bgKampung", 0.22, 128, 1]
  ];
  const skyBase = LAYOUT.grassY + 6;               // dasar siluet = sedikit masuk ke bawah tepi rumput
  const hasSkyline = skyline.some(([k]) => assets[k]);
  if (hasSkyline) {
    const drawSky = ([key, par, h, alpha]) => {
      if (!assets[key]) return;
      const img = assets[key];
      const tw = h * (img.width / img.height);
      const off = ((state.camX * par * ZOOM) % tw + tw) % tw;
      ctx.globalAlpha = alpha;
      for (let x = -off; x < W; x += tw) ctx.drawImage(img, x, skyBase - h, tw, h);
      ctx.globalAlpha = 1;
    };
    const haze = (from, to, a1, a2) => {
      const g2 = ctx.createLinearGradient(0, from, 0, to);
      g2.addColorStop(0, `rgba(243,233,210,${a1})`);
      g2.addColorStop(1, `rgba(243,233,210,${a2})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, from, W, to - from);
    };
    skyline.slice(0, 3).forEach(drawSky);          // jauh: gunung, kota, candi
    haze(skyBase - 130, skyBase, 0, 0.55);         // kabut horizon — melunakkan dasar gelap siluet jauh
    drawSky(skyline[3]);                            // kampung = layer depan
    haze(skyBase - 46, skyBase + 4, 0, 0.4);       // kabut tipis menimpa dasar kampung agar tidak "block"
  } else {
    const drawHills = (par, baseY, hgt, color, seedOff) => {
      const off = (state.camX * par * ZOOM) % (W * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-80, baseY);
      for (let x = -80; x <= W + 80; x += 40) {
        const wx2 = x + off;
        const yy = baseY - (Math.sin(wx2 * 0.0042 + seedOff) * 0.5 + Math.sin(wx2 * 0.0107 + seedOff * 2.3) * 0.32 + 0.18) * hgt;
        ctx.lineTo(x, Math.max(baseY - hgt * 1.4, yy));
      }
      ctx.lineTo(W + 80, baseY);
      ctx.closePath();
      ctx.fill();
    };
    drawHills(0.10, skyBase, 96, "rgba(126,163,196,.55)", 1.3);
    drawHills(0.18, skyBase, 70, "rgba(96,140,178,.68)", 4.7);
  }

  // umbul-umbul DIHAPUS dari render (terlalu ramai) — aset tetap ada bila ingin diaktifkan lagi
  // tribun penonton, palem, lampu hias & gapura DIHAPUS — siluet cakrawala mengisi ruang belakang

  // render kilatan penonton DIHAPUS bersama tribunya

  // rumput tepi
  tileStrip("grass", LAYOUT.grassY, LAYOUT.grassH, state.camX);

  // bahu tanah: transisi rumput → aspal dengan kerikil samar
  const shoulderTop = LAYOUT.grassY + LAYOUT.grassH;
  const shoulder = ctx.createLinearGradient(0, shoulderTop, 0, m.top);
  shoulder.addColorStop(0, "#6f9c6b");
  shoulder.addColorStop(0.6, "#5b7a63");
  shoulder.addColorStop(1, "#46525f");
  ctx.fillStyle = shoulder;
  ctx.fillRect(0, shoulderTop, W, Math.max(0, m.top - shoulderTop));

  // === aspal bertekstur (gradien gelap-terang + bintik halus deterministik) ===
  const asphalt = ctx.createLinearGradient(0, m.top, 0, m.bottom);
  asphalt.addColorStop(0, "#2c3546");
  asphalt.addColorStop(0.35, "#3a4459");
  asphalt.addColorStop(0.7, "#333c4f");
  asphalt.addColorStop(1, "#29313f");
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, m.top, W, m.bottom - m.top);

  // tekstur aspal PROSEDURAL (skid + grain) — ubin PNG arcade telah dihapus dari proyek
  const scrollPx = state.camX * ZOOM;
  // jejak ban (skid marks) tipis mengikuti dunia
  ctx.fillStyle = "rgba(10,12,20,.16)";
  const skidOff = state.camX * ZOOM;
  for (let i = 0; i < 8; i++) {
    const sxw = ((i * 613 + 97 - skidOff) % (W + 260) + W + 260) % (W + 260) - 130;
    const sy = m.top + ((i * 151) % (m.bottom - m.top - 30)) + 15;
    ctx.beginPath();
    ctx.ellipse(sxw, sy, 90 + (i % 3) * 30, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // bintik aspal prosedural
  ctx.fillStyle = "rgba(255,255,255,.05)";
  const grainOff = state.camX * ZOOM;
  for (let i = 0; i < 70; i++) {
    const gx = ((i * 379 + 113 - grainOff) % (W + 40) + W + 40) % (W + 40) - 20;
    const gy = m.top + ((i * 271) % (m.bottom - m.top - 8)) + 4;
    ctx.fillRect(gx, gy, 2 + (i % 3), 1.5);
  }
  ctx.fillStyle = "rgba(0,0,0,.14)";
  for (let i = 0; i < 50; i++) {
    const gx = ((i * 523 + 61 - grainOff) % (W + 40) + W + 40) % (W + 40) - 20;
    const gy = m.top + ((i * 197) % (m.bottom - m.top - 8)) + 4;
    ctx.fillRect(gx, gy, 2 + (i % 2), 1.5);
  }
  // kilau specular horizontal di tengah trek (kesan aspal halus terpapar cahaya)
  const sheen = ctx.createLinearGradient(0, m.top, 0, m.bottom);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.45, "rgba(190,210,255,.05)");
  sheen.addColorStop(0.55, "rgba(190,210,255,.05)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, m.top, W, m.bottom - m.top);

  // garis pembatas lajur horizontal (dashed prosedural, ikut dunia) — default MATI (LANE_DASH_LINES)
  // (aset lane-dash PNG arcade telah dihapus; tinggal versi canvas)
  if (CONFIG.LANE_DASH_LINES) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, m.top, W, m.bottom - m.top);
    ctx.clip();
    ctx.globalAlpha = 0.5;
    for (let l = 1; l < m.lanes; l++) {
      const y = m.top + l * m.laneH;
      ctx.fillStyle = "rgba(230,238,250,.55)";
      const dashW = 46, gap = 34;
      const off = ((scrollPx % (dashW + gap)) + dashW + gap) % (dashW + gap);
      for (let x = -off; x < W; x += dashW + gap) ctx.fillRect(x, y - 1.5, dashW, 3);
    }
    ctx.restore();
  }

  // tepi aspal: garis putih solid + curb merah-putih atas/bawah (bukan antar-lajur)
  ctx.fillStyle = "rgba(240,244,255,.85)";
  ctx.fillRect(0, m.top + 3, W, 4);
  ctx.fillRect(0, m.bottom - 7, W, 4);
  const curbH = 12;
  const curbCell = 34;
  const curbOff = state.camX * ZOOM;
  // drop shadow di bawah curb merah-putih → pagar terlihat "di atas" aspal (kedalaman)
  const shH = 18;
  // curb atas → bayangan jatuh ke bawah (ke aspal); curb bawah → ke atas
  for (const [sy, dir] of [[m.top + 3, 1], [m.bottom - shH - 1, -1]]) {
    const y0 = dir > 0 ? sy : sy + shH;
    const y1 = dir > 0 ? sy + shH : sy;
    const sh = ctx.createLinearGradient(0, y0, 0, y1);
    sh.addColorStop(0, "rgba(2,4,10,.78)");
    sh.addColorStop(0.35, "rgba(2,4,10,.38)");
    sh.addColorStop(1, "rgba(2,4,10,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(0, Math.min(y0, y1), W, shH);
  }
  for (let x = -(((curbOff % (curbCell * 2)) + curbCell * 2) % (curbCell * 2)); x < W; x += curbCell) {
    const idx = Math.floor((x + curbOff) / curbCell);
    ctx.fillStyle = idx % 2 ? "#e8ecf5" : "#d8434a";
    ctx.fillRect(x, m.top - curbH + 3, curbCell + 1, curbH);
    ctx.fillRect(x, m.bottom - 3, curbCell + 1, curbH);
  }

  // === garis start + banner ===
  const startSx = worldToScreen(WORLD.startX);
  if (startSx > -160 && startSx < W + 160) {
    // garis start lebar + teks "START" melintang
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillRect(startSx - 5, m.top, 10, m.bottom - m.top);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.fillRect(startSx - 40, m.top, 30, m.bottom - m.top);
    ctx.save();
    ctx.translate(startSx + 30, (m.top + m.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = "800 26px 'Trebuchet MS', system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillText("S T A R T", 0, 9);
    ctx.restore();
    const startH = Math.min(300, m.laneH * 1.5);
    drawImage("startGate", startSx, m.top - startH * 0.5 + 20, startH);
  }

  // === penanda jarak: dicat di aspal + tiang kecil di tepi ===
  const firstTick = Math.max(WORLD.startX, Math.floor(state.camX / WORLD_TICK) * WORLD_TICK);
  for (let wx = firstTick; wx < screenToWorld(W) + WORLD_TICK; wx += WORLD_TICK) {
    if (wx > WORLD.finishX) break;
    const sx = worldToScreen(wx);
    // garis putus-putus di aspal
    ctx.fillStyle = "rgba(255,255,255,.20)";
    for (let yy = m.top + 10; yy < m.bottom - 6; yy += 26) ctx.fillRect(sx - 1.5, yy, 3, 14);
    // label di bahu atas
    ctx.font = "800 26px 'Trebuchet MS', system-ui";
    ctx.textAlign = "center";
    const label = `${Math.round((wx - WORLD.startX) / CONFIG.PX_PER_METER)}m`;
    const lw = ctx.measureText(label).width + 20;
    ctx.fillStyle = "rgba(10,14,26,.72)";
    roundRect(sx - lw / 2, m.top - 52, lw, 38, 10);
    ctx.fill();
    ctx.fillStyle = "#ffd08a";
    ctx.fillText(label, sx, m.top - 25);
  }

  // === pita finis checker 3D-ish + gate ===
  const cell = CONFIG.FINISH_BAND_CELL;
  const bandCols = CONFIG.FINISH_BAND_COLS;
  const bandW = cell * bandCols;
  const finSx = worldToScreen(WORLD.finishX);
  if (finSx > -400 && finSx < W + 400) {
    // bayangan pita di aspal
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(finSx - bandW / 2 + 7, m.top + 4, bandW, m.bottom - m.top);
    for (let yy = m.top, row = 0; yy < m.bottom; yy += cell, row++) {
      const rh = Math.min(cell, m.bottom - yy);
      for (let c = 0; c < bandCols; c++) {
        const light = (c + row) % 2 === 0;
        ctx.fillStyle = light ? "#f4f7ff" : "#20263a";
        ctx.fillRect(finSx - bandW / 2 + c * cell, yy, cell, rh);
        if (light) {                              // kilau tipis di kotak putih
          ctx.fillStyle = "rgba(255,255,255,.5)";
          ctx.fillRect(finSx - bandW / 2 + c * cell, yy, cell, 3);
        }
      }
    }
    const gateH = Math.min(360, Math.max(240, (m.bottom - m.top) * 0.3));
    drawImage("finishGate", finSx, m.top + gateH * 0.42, gateH);
  }
}

function drawRunners(now) {
  const m = raceMetrics();
  // ukuran karakter TIDAK menyusut di bawah acuan MIN_LANES (4) lajur — dengan >4 peserta,
  // lajur memang menyempit tapi sprite tetap seukuran "4 pemain" dan boleh tumpang-tindih
  const baseLaneH = (LAYOUT.trackBottom - LAYOUT.trackTop) / CONFIG.MIN_LANES;
  const size = Math.max(CONFIG.RUNNER_SIZE_MIN, Math.min(Math.max(m.laneH, baseLaneH) * CONFIG.RUNNER_SIZE_RATIO, CONFIG.RUNNER_SIZE_MAX)) * ZOOM;
  const running = state.phase === "running";
  // pemimpin saat ini (untuk mahkota & aura emas)
  state.leaderRef = null;
  for (const r of state.runners) if (!r.finished && (!state.leaderRef || r.progress > state.leaderRef.progress)) state.leaderRef = r;
  for (let i = 0; i < state.runners.length; i++) {
    const r = state.runners[i];
    const x = worldToScreen(runnerWorldX(r));
    const y = laneY(r.lane) + (r.laneOff || 0);
    const boost = boostOf(r, now);
    const boosted = boost.active;

    // === animasi JOIN: pop elastic + turun + burst bintang/ring/debu ===
    const jAge = now - (r.joinAt || 0);
    const popping = jAge >= 0 && jAge < CONFIG.JOIN_POP_MS;
    if (jAge >= 0 && !r.joinFx) {
      r.joinFx = true;   // sekali saja saat pop mulai
      const wxj = runnerWorldX(r);
      spawnFx("starBurst", wxj, y, 260, { drift: false });
      spawnParticle("ring", worldToScreen(wxj), y, { size: 84, color: "#ffd35c", life: 0.55 });
      for (let d = 0; d < 10; d++) {
        const ang = Math.random() * Math.PI * 2, spd = 60 + Math.random() * 160;
        spawnParticle("spark", worldToScreen(wxj), y, {
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 40,
          size: size * (0.06 + Math.random() * 0.07), life: 0.45 + Math.random() * 0.3,
          color: ["#ffd35c", "#fff3c4", "#ffb36b"][d % 3], grav: 260, drag: 0.95
        });
      }
      for (let d = 0; d < 6; d++) {
        spawnParticle("dust", worldToScreen(wxj) + (Math.random() - 0.5) * size * 0.7, y + size * 0.44, {
          vx: (Math.random() - 0.5) * 70, vy: -(10 + Math.random() * 40),
          size: size * 0.09, life: 0.5, color: "rgba(220,210,190,.5)", drag: 0.93
        });
      }
    }
    let popK = 1, popDrop = 0, popA = 1;
    if (popping) {
      const t = jAge / CONFIG.JOIN_POP_MS;                 // 0..1
      popK = 0.15 + easeOutBack(Math.min(1, t * 1.35)) * 0.92;  // kecil → overshoot → 1
      popDrop = (1 - easeOut(Math.min(1, t * 1.6))) * size * 0.85;  // turun dari atas
      popA = Math.min(1, t * 5);
    }

    // shadow
    ctx.fillStyle = `rgba(0,0,0,${0.25 * (popping ? popK : 1)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.46, size * 0.36 * popK, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // === aura PEMIMPIN: pendar emas lembut + mahkota — langsung terlihat siapa #1 ===
    if (state.leaderRef === r && (running || state.phase === "countdown")) {
      const ar = size * (0.75 + Math.sin(now / 260) * 0.05);
      const ag = ctx.createRadialGradient(x, y, size * 0.15, x, y, ar);
      ag.addColorStop(0, "rgba(255,211,92,.28)");
      ag.addColorStop(1, "rgba(255,211,92,0)");
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(x, y, ar, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(size * 0.26)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("👑", x + size * 0.34, y - size * (0.62 + Math.sin(now / 400) * 0.02));
    }

    // trail boost per level (VFX + glow mengikuti warna & ukuran level)
    if (boosted && running) {
      const glowR = size * (0.9 + Math.sin(now / 90) * 0.06) * (0.9 + boost.idx * 0.12);
      if (boost.idx === 0) {
        // Boost 1 = cuma ngebut: asap/debu tipis dari kaki, TANPA sprite & glow
        if (Math.random() < 0.55) {
          spawnParticle("dust", x - size * 0.45, y + size * 0.42, {
            vx: -(90 + Math.random() * 120), vy: -(8 + Math.random() * 26),
            size: size * (0.05 + Math.random() * 0.05), life: 0.45,
            color: "rgba(225,225,215,.4)", drag: 0.92
          });
        }
      } else {
        const bg = ctx.createRadialGradient(x, y, size * 0.1, x, y, glowR);
        bg.addColorStop(0, hexToRgba(boost.cfg.color, 0.3));
        bg.addColorStop(0.6, hexToRgba(boost.cfg.color, 0.12));
        bg.addColorStop(1, hexToRgba(boost.cfg.color, 0));
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.85;
        drawImage(boost.trailKey, x - size * 0.55, y + size * 0.05, size * (0.9 * boost.cfg.size));
        ctx.globalAlpha = 1;
        // partikel presisi dari punggung: warna mengikuti level (api oranye utk B1-2,
        // biru/ungu/emas untuk level atasnya)
        const isFlame = boost.idx === 1;
        if (Math.random() < 0.8) {
          spawnParticle("smoke", x - size * 0.6, y + (Math.random() - 0.5) * size * 0.3, {
            vx: -(160 + Math.random() * 220), vy: -(30 + Math.random() * 60),
            size: size * (0.07 + Math.random() * 0.07), life: 0.45 + Math.random() * 0.3,
            color: isFlame ? (Math.random() < 0.5 ? "rgba(255,140,60,.85)" : "rgba(255,220,120,.8)")
                            : hexToRgba(boost.cfg.color, 0.75), drag: 0.94
          });
        }
        if (Math.random() < 0.3) {
          spawnParticle("spark", x - size * 0.5, y + (Math.random() - 0.5) * size * 0.5, {
            vx: -(300 + Math.random() * 350), vy: (Math.random() - 0.5) * 60,
            size: size * (0.2 + Math.random() * 0.25), life: 0.25, color: isFlame ? "#ffe9a8" : boost.cfg.color, drag: 0.96
          });
        }
      }
    }

    const frames = RUN_SUFFIXES.map((s) => `${r.charKey}_run_${s}`).filter((f) => assets[f]);
    const hasFrames = frames.length >= 2;
    const stepLen = Math.max(CONFIG.STRIDE_MIN, size * CONFIG.STRIDE_RATIO) / ZOOM;   // panjang satu langkah (px dunia; dikompensasi zoom)

    // Di luar fase lari (lobi, hitung mundur, ronde selesai), SEMUA karakter
    // memakai frame _idle = berdiri (bukan pose lari dari sprite dasar).
    let key = (state.phase !== "running" && assets[`${r.charKey}_idle`]) ? `${r.charKey}_idle` : r.charKey;
    let bounce = 0, tilt = 0, squash = 1;
    // Saat boost: langkah dipercepat (turn-over lebih pendek) + langkah tetap
    // mengikuti jarak → kaki berputar jelas lebih cepat, tanpa moonwalk.
    const cycleLen = boosted ? stepLen * 1.3 : stepLen * 2;
    if (running && !hasFrames) {
      // prosedural: frekuensi mengikuti jarak, bukan waktu → kaki tidak "moonwalk"
      const phase = r.stepDist / (boosted ? cycleLen / 2 : stepLen) * Math.PI;
      bounce = Math.abs(Math.sin(phase)) * size * 0.09;
      tilt = Math.sin(phase) * (boosted ? 0.09 : 0.06);
      squash = 1 - bounce / (size * 0.9) * 0.06;
    }
    if (running && hasFrames) {
      // siklus penuh = 2 langkah (kiri+kanan); frame tersebar merata di siklus
      const fi = Math.floor(r.stepDist / cycleLen * frames.length) % frames.length;
      const airborne = fi === Math.floor(frames.length / 2);
      key = frames[fi];
      bounce = airborne ? size * (boosted ? 0.09 : 0.05) : 0;
      if (boosted) tilt = 0.08;   // condong agresif saat ngebut
      // debu partikel tepat di kaki saat frame kontak (2× per siklus langkah)
      const stepNow = Math.floor(r.stepDist / (cycleLen / 2));
      if (stepNow !== r.lastStep) {
        r.lastStep = stepNow;
        const footX = x - size * 0.18, footY = y + size * 0.42;
        const strongBoost = boosted && boost.idx > 0;   // Boost 1: debu langkah tetap normal
        const n = strongBoost ? 5 : 3;
        for (let d = 0; d < n; d++) {
          spawnParticle("dust", footX + (Math.random() - 0.5) * size * 0.3, footY + (Math.random() - 0.5) * 8, {
            vx: -(40 + Math.random() * 90) * (strongBoost ? 2.2 : 1), vy: -(20 + Math.random() * 50),
            size: size * (0.05 + Math.random() * 0.06), life: 0.5 + Math.random() * 0.4,
            color: strongBoost ? "rgba(255,214,160,.7)" : "rgba(214,204,186,.65)", grav: -30, drag: 0.96
          });
        }
      }
    }
    if (state.phase === "finished" && r.place === 1) {
      if (assets[`${r.charKey}_victory`]) key = `${r.charKey}_victory`;
    } else if (state.phase === "countdown") {
      if (assets[`${r.charKey}_idle`]) key = `${r.charKey}_idle`;
    }

    ctx.save();
    ctx.translate(x, y - bounce + popDrop);
    if (popping) { ctx.translate(0, size * 0.42); ctx.scale(popK, popK); ctx.translate(0, -size * 0.42); }
    ctx.rotate(tilt);
    ctx.scale(1, squash);
    const img = assets[key];
    if (img) {
      const box = contentBoxes.get(key) || window.__measureSprite(img, key);
      if (box && box.h > 0) {
        // skala seragam utk semua frame karakter ini; kaki selalu di baseline lajur
        const k = getCharScale(r.charKey, size);
        const dw = box.w * k, dh = box.h * k;
        // afterimage motion-blur saat boost (2 bayangan tertinggal)
        if (boosted && running) {
          for (let g = 2; g >= 1; g--) {
            ctx.globalAlpha = 0.13 * g;
            ctx.drawImage(img, box.x, box.y, box.w, box.h, -dw / 2 - g * size * 0.28, size * 0.42 - dh, dw, dh);
          }
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(img, box.x, box.y, box.w, box.h, -dw / 2, size * 0.42 - dh, dw, dh);
      } else {
        const h = size * (img.height / img.width);
        ctx.drawImage(img, -size / 2, -h / 2 + size * 0.12, size, h);
      }
    }
    ctx.restore();

    // nameplate di atas kepala — mode manual via CONFIG.NAMEPLATE_MODE / tombol dock 🏷️
    const showName = CONFIG.NAMEPLATE_MODE === "on"
      || (CONFIG.NAMEPLATE_MODE !== "off" && m.laneH >= CONFIG.NAMEPLATE_MIN_LANE_H);
    const npFont = Math.max(16, Math.min(26, size * 0.16));   // pelat sedang: jelas tapi tidak menutupi
    if (!showName) { ctx.restore(); continue; }
    // pelat nama ikut "hadir" setelah pop hampir selesai: fade + naik halus
    const plateA = popping ? Math.max(0, Math.min(1, (jAge / CONFIG.JOIN_POP_MS - 0.45) / 0.4)) : 1;
    if (plateA <= 0) { ctx.restore(); continue; }
    ctx.globalAlpha = plateA;
    ctx.font = `${npFont}px 'Trebuchet MS', system-ui`;   // reguler (tidak bold), ketegasan dari bg+outline
    ctx.textAlign = "center";
    const medal = r.finished && r.place <= 3 ? `${["🥇","🥈","🥉"][r.place - 1]} ` : "";
    const label = medal + r.username;                     // tanpa prefiks @
    // lebar maksimum nameplate mengikuti UKURAN SPRITE (konstan), bukan laneH —
    // bug lama: dengan 40 peserta laneH ±16px → label tercekik jadi ~25px, tak terbaca
    const tw = Math.min(ctx.measureText(label).width, Math.max(size * 1.5, 100));
    const py = y - size * 0.72;
    // === nameplate "mewah": pelat gelap bergradien + bingkai emas metalis tipis + teks cream ===
    const npH = npFont + 12;
    const bx = x - tw / 2 - 11, bw = tw + 22, by = py - npH / 2;
    // bayangan lembut di bawah pelat → terasa melayah premium
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const plate = ctx.createLinearGradient(0, by, 0, by + npH);
    plate.addColorStop(0, "rgba(26,32,56,.9)");
    plate.addColorStop(0.5, "rgba(10,13,26,.93)");
    plate.addColorStop(1, "rgba(3,5,12,.96)");
    ctx.fillStyle = plate;
    ctx.fillRect(bx, by, bw, npH);
    ctx.restore();
    // bingkai 1px: emas metalis bergradien (gelap→terang→gelap) — bukan neon satu warna
    const gold = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    gold.addColorStop(0, "rgba(140,105,30,.5)");
    gold.addColorStop(0.5, "rgba(255,225,140,.85)");
    gold.addColorStop(1, "rgba(140,105,30,.5)");
    ctx.fillStyle = gold;
    ctx.fillRect(bx, by, bw, 1);                       // atas
    ctx.fillRect(bx, by + npH - 1, bw, 1);             // bawah
    ctx.fillRect(bx, by + 1, 1, npH - 2);              // kiri
    ctx.fillRect(bx + bw - 1, by + 1, 1, npH - 2);     // kanan
    // kilau halus hanya di dua sudut atas → kesan logam terpahat, tidak seragam kaku
    ctx.fillStyle = "rgba(255,240,190,.9)";
    ctx.fillRect(bx, by, 6, 1); ctx.fillRect(bx, by, 1, 4);
    ctx.fillRect(bx + bw - 6, by, 6, 1); ctx.fillRect(bx + bw - 1, by, 1, 4);
    // teks: reguler (tidak bold), cream lembut dengan shadow tipis — saat boost aksen amber
    ctx.shadowColor = "rgba(0,0,0,.85)";
    ctx.shadowBlur = 2;
    ctx.fillStyle = boosted ? "#ffe2b8" : r.finished && r.place === 1 ? "#ffdf8f" : "#fdf6e2";
    ctx.fillText(label, x, py + npFont * 0.35 + (1 - plateA) * 8, tw);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function drawFx() {
  for (let i = 0; i < state.fx.length; i++) {
    const f = state.fx[i];
    const t = f.time / f.life;
    const attached = !!f.follow;
    const wx = (attached ? runnerWorldX(f.follow) : f.x) + f.offsetX;
    const wy = (attached ? laneY(f.follow.lane) + (f.follow.laneOff || 0) : f.y) + f.offsetY;
    ctx.globalAlpha = attached ? Math.min(1, (1 - t) * 3) : Math.min(1, (1 - t) * 2);
    const fxX = worldToScreen(wx) + (attached || !f.drift ? 0 : t * 60 * ZOOM);
    const fxY = wy - (attached || !f.drift ? 0 : t * 80);
    if (f.frames) {
      // fx multi-frame (kembang api 4 tahap): pilih frame berdasar progres hidup
      const fi = Math.min(f.frames - 1, Math.floor(t * f.frames));
      const img = assets[`${f.imgKey}_${fi + 1}`];
      if (img) {
        const h = f.size * ZOOM;
        const w2 = h * (img.width / img.height);
        ctx.drawImage(img, fxX - w2 / 2, fxY - h / 2, w2, h);
        ctx.globalAlpha = 1;
        continue;
      }
    }
    drawImage(f.imgKey, fxX, fxY, f.size * ZOOM * (1 + (attached || !f.drift ? 0 : t * 0.4)));
    ctx.globalAlpha = 1;
  }
}

function drawCtaTicker(now) {
  // Banner CTA berjalan di langit (fase lobby): instruksi cara ikut + ajakan — bikin
  // penonton baru yang scroll lewat langsung paham tanpa baca deskripsi live.
  const txt = `👇 KETIK ${joinKeywordsText().toUpperCase()} DI KOMENTAR BUAT IKUT LARI!   💗 TAP 100× = LANGSUNG IKUT LARI!   `;
  ctx.font = "800 26px 'Trebuchet MS', system-ui";
  ctx.textAlign = "left";
  const tw = ctx.measureText(txt).width;
  // Siklus halus: naik lembut (20%) → tahan sebentar (25%) → hilang perlahan (55%)
  // pakai smoothstep dua sisi; tanpa cut-off mendadak, alpha benar-benar → 0 di akhir.
  const T = 4200;                                // durasi 1 siklus (ms)
  const u = (now % T) / T;                       // 0..1
  const smooth = (t) => t * t * (3 - 2 * t);     // ease in-out 0..1
  let pulse;
  if (u < 0.2) pulse = smooth(u / 0.2);
  else if (u < 0.45) pulse = 1;
  else pulse = 1 - smooth((u - 0.45) / 0.55);
  const y = 208;
  // pita gelap tipis sebagai dasar teks — ikut memudar bersama teks
  ctx.fillStyle = `rgba(8,11,22,${0.55 * pulse})`;
  ctx.fillRect(0, y - 34, W, 48);
  const off = (now * 0.14) % tw;
  ctx.fillStyle = `rgba(255,226,184,${pulse})`;
  ctx.shadowColor = "rgba(255,179,71,.5)"; ctx.shadowBlur = 12;
  for (let x = -off; x < W; x += tw) ctx.fillText(txt, x, y);
  ctx.shadowBlur = 0;
}

function drawHeader(now) {
  const m = raceMetrics();
  ctx.textAlign = "center";
  // panel judul DIHAPUS; status race kini digambar di dalam panel minimap (drawMinimap)

  if (state.phase === "countdown") {
    // === LENTERA START: 3 lampu lalu-lintas menyala berurutan + angka besar ===
    const remain = (state.countdownEnds - now) / 1000;
    const n = Math.max(1, Math.ceil(remain));                 // 3 → 1
    const frac = 1 - (remain - Math.floor(remain));            // 0..1 dalam detik berjalan
    const cy = (m.top + m.bottom) / 2;
    ctx.save();
    ctx.translate(W / 2, cy);
    // pelat lentera
    ctx.fillStyle = "rgba(8,10,20,.72)";
    roundRect(-230, -240, 460, 300, 18); ctx.fill();
    // tiga bohlam: merah (3) → kuning (2) → hijau (1), menyala kumulatif
    const lampOn = 4 - n;                                      // detik berjalan ke-1..3
    const lampCols = [["#ff4d4d", "#5a1f1f"], ["#ffcf5c", "#6b5320"], ["#7cf39a", "#1f5a30"]];
    for (let li = 0; li < 3; li++) {
      const lx = -130 + li * 130, ly = -185;
      const on = li < lampOn;
      if (on) {
        const glow = ctx.createRadialGradient(lx, ly, 6, lx, ly, 62);
        glow.addColorStop(0, lampCols[li][0]); glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.65; ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(lx, ly, 62, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = on ? lampCols[li][0] : lampCols[li][1];
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(lx, ly, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // angka besar pop tiap detik
    const pop = 1 + (1 - Math.min(1, frac * 3)) * 0.55;
    ctx.scale(pop, pop);
    ctx.shadowColor = "rgba(255,255,255,.55)";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 190px 'Trebuchet MS', system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(n), 0, 66);
    ctx.restore();
  }

  if (state.goFlash > 0 && state.phase === "running") {
    // "GO!" meledak sesaat setelah lampu hijau — zoom-out + fade
    const k = state.goFlash;
    const sc = 1 + (1 - k) * 0.6;
    ctx.save();
    ctx.translate(W / 2, (m.top + m.bottom) / 2);
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.font = "900 260px 'Trebuchet MS', system-ui";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(140,240,168,.9)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#8ef0a8";
    ctx.fillText("GO!", 0, 90);
    ctx.restore();
  }
}

// ---------- minimap: garis START→FINISH dengan avatar bulat tiap pelari ----------
// Avatar bot = inisial + warna stabil dari hash username. Kalau runner.avatarUrl
// diisi (mis. foto profil TikTok nanti), foto otomatis dipakai dan dipotong bulat.
const MINI = { x1: 560, x2: 1356, cy: 54 };

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
function avatarCanvas(runner) {
  if (!state.avatarCache) state.avatarCache = new Map();
  const key = runner.username + "|" + (runner.avatarUrl ? runner.avatarUrl : "ph");
  let c = state.avatarCache.get(key);
  if (c) {
    // foto sudah dimuat? render ulang sekali dengan foto
    if (runner.avatarUrl && !runner.avatarImg) loadAvatarImg(runner, key);
    return c;
  }
  const S = 128, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  if (runner.avatarUrl && runner.avatarImg && runner.avatarImg.complete) {
    g.save();
    g.beginPath(); g.arc(S/2, S/2, S/2, 0, Math.PI*2); g.clip();
    const im = runner.avatarImg, sc = S / Math.min(im.width, im.height);
    g.drawImage(im, (S - im.width*sc)/2, (S - im.height*sc)/2, im.width*sc, im.height*sc);
    g.restore();
  } else {
    const hue = hashHue(runner.username);
    g.fillStyle = `hsl(${hue} 62% 34%)`;
    g.fillRect(0, 0, S, S);
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, `hsl(${hue} 70% 58% / .55)`);
    grd.addColorStop(1, `hsl(${hue} 70% 30% / .55)`);
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.fillStyle = "#fff";
    g.font = "800 56px 'Trebuchet MS', system-ui";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(runner.username.slice(0, 2).toUpperCase(), S/2, S/2 + 1);
  }
  state.avatarCache.set(key, cv);
  return cv;
}
function loadAvatarImg(runner, key) {
  if (!runner.avatarUrl || runner.avatarLoading) return;
  runner.avatarLoading = true;
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onload = () => { runner.avatarImg = im; state.avatarCache.delete(key); };
  im.onerror = () => { runner.avatarLoading = false; };  // biarkan pakai avatar prosedural
  im.src = runner.avatarUrl;
}

function drawMinimap(now) {
  const { x1, x2, cy } = MINI, w = x2 - x1;
  // panel melebar: status race di kiri + garis START→FINISH + avatar pelari
  ctx.fillStyle = "rgba(6,8,18,.68)";
  roundRect(x1 - 44, 6, w + 88, 108, 10);
  ctx.fill();
  // status (dipindah ke sini karena panel judul sudah dihapus)
  const statusText = {
    lobby: "Menunggu pelari…",
    countdown: "Bersiap di garis start…",
    running: CONFIG.USE_ROUND_TIMEOUT && Number.isFinite(state.roundDeadline)
      ? `⏱ Sisa ${Math.max(0, Math.ceil((state.roundDeadline - now) / 1000))} dtk`
      : `🏁 Finish ${Math.min(state.runners.filter((r) => r.finished).length, Math.min(CONFIG.ROUND_FINISH_AFTER, state.runners.length))}/${Math.min(CONFIG.ROUND_FINISH_AFTER, state.runners.length)} (dari ${state.runners.length})`,
    finished: "Ronde selesai — Reset / Mulai lagi"
  }[state.phase];
  ctx.textAlign = "left";
  ctx.font = "700 22px 'Trebuchet MS', system-ui";
  ctx.fillStyle = state.phase === "running" ? "#8ef0a8" : "#cfe0f5";
  ctx.fillText(statusText, x1 - 34, 36);
  ctx.font = "700 16px 'Trebuchet MS', system-ui";
  ctx.fillStyle = "#9fd8a8";
  ctx.fillText("START", x1 - 4, cy + 44);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffd35c";
  ctx.fillText("🏁 FINISH", x2 + 40, cy + 44);
  // garis lintasan (dua lajur tipis)
  const grd = ctx.createLinearGradient(x1, 0, x2, 0);
  grd.addColorStop(0, "rgba(120,160,210,.25)");
  grd.addColorStop(1, "rgba(255,211,92,.45)");
  ctx.fillStyle = grd;
  ctx.fillRect(x1, cy - 6, w, 12);
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke();
  ctx.fillStyle = "#9fd8a8";
  ctx.fillRect(x1 - 2, cy - 8, 3, 16);
  // bendera finish kotak-kotak mini
  for (let fx = 0; fx < 4; fx++) for (let fy = 0; fy < 3; fy++) {
    ctx.fillStyle = (fx + fy) % 2 ? "#e8eef7" : "#20263a";
    ctx.fillRect(x2 + 4 + fx * 4, cy - 6 + fy * 4, 4, 4);
  }
  // titik avatar per pelari (yang sudah finish menempel di garis finish)
  // Semua avatar digambar di SATU posisi (tumpuk di tengah garis) sesuai permintaan;
  // ukurannya dibesarkan supaya foto profil TikTok terlihat jelas saat sudah konek.
  const hits = [];
  for (const r of state.runners) {
    const px = x1 + Math.max(0, Math.min(1, r.progress)) * (w - 8) + 4;
    const py = cy;
    const now2 = performance.now();
    const boosted = r.boosts.some((b) => b.until > now2);
    const rad = boosted ? 21 : 19;
    if (r.avatarUrl && !r.avatarImg && !r.avatarLoading) avatarCanvas(r);  // picu load foto
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarCanvas(r), px - rad, py - rad, rad * 2, rad * 2);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = boosted ? "#ff8a3d" : r.finished ? "#ffd35c" : `hsl(${hashHue(r.username)} 70% 62%)`;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.stroke();
    if (r.place === 1) { ctx.font = "20px system-ui"; ctx.textAlign = "center"; ctx.fillText("👑", px, py - rad - 6); }
    hits.push({ runner: r, x: px - rad - 2, y: py - rad - 2, w: rad * 2 + 4, h: rad * 2 + 4 });
  }
  state.miniHit = hits;
  // tooltip nama saat hover titik (hit-test dari mousemove)
  const hv = state.miniHover;
  if (hv && state.runners.includes(hv.runner)) {
    const px = x1 + Math.max(0, Math.min(1, hv.runner.progress)) * (w - 8) + 4;
    const label = `${hv.runner.username} · ${Math.round(hv.runner.progress * 100)}%` + (hv.runner.finished ? ` · P${hv.runner.place}` : "");
    ctx.font = "700 18px 'Trebuchet MS', system-ui";
    const tw = ctx.measureText(label).width + 16;
    const bx = Math.min(x2 + 44 - tw, Math.max(x1 - 40, px - tw / 2));
    ctx.fillStyle = "rgba(8,11,22,.92)";
    roundRect(bx, cy + 26, tw, 30, 6); ctx.fill();
    ctx.fillStyle = "#e8eef7"; ctx.textAlign = "left";
    ctx.fillText(label, bx + 8, cy + 46);
  }
}

function drawLeaderboard() {
  const rows = state.runners.slice().sort((a, b) => (b.progress - a.progress) || (a.place && b.place ? a.place - b.place : 0));
  // panah naik/turun: bandingkan urutan sekarang vs snapshot terakhir (perbarui tiap 2 dtk)
  const nowT = performance.now();
  const rankDelta = new Map();
  if (nowT - state.lbRankAt > 2000) {
    rows.forEach((r, i) => {
      const prev = state.lbOrder.get(r.username);
      if (prev !== undefined && prev !== i) rankDelta.set(r.username, prev > i ? 1 : -1);   // 1=naik
      state.lbOrder.set(r.username, i);
    });
    state.lbRankAt = nowT;
  } else {
    rows.forEach((r, i) => {
      const prev = state.lbOrder.get(r.username);
      if (prev !== undefined && prev !== i) rankDelta.set(r.username, prev > i ? 1 : -1);
    });
  }
  const MAX_ROWS = CONFIG.LEADERBOARD_MAX_ROWS; // baris per kolom; sisanya diringkas
  const shown = rows.length > MAX_ROWS * 2 ? rows.slice(0, MAX_ROWS * 2) : rows;
  const cols = shown.length > MAX_ROWS ? 2 : 1;
  const rowH = 42;
  const x0 = 24, w0 = cols === 2 ? 440 : 340, y0 = LAYOUT.boardY;
  const overflow = rows.length > shown.length;
  const padTop = 46, padBot = 12;
  const panelH = Math.max(rows.length ? 72 : 104, padTop + Math.min(shown.length, MAX_ROWS) * rowH + (overflow ? 30 : 0) + padBot);
  const framePad = 10;                               // konten masuk dari tepi frame
  // urutan presisi: backdrop rounded digambar DULUAN, lalu frame neon menumpuk di atas —
  // tepi backdrop terpotong border frame sehingga bentuk yang terlihat = radius dalam frame
  const hasFrame = Boolean(assets.lbFrame);
  if (hasFrame) {
    ctx.fillStyle = "rgba(6,8,18,.82)";
    roundRect(x0 - framePad + 8, y0 - framePad + 14, w0 + framePad * 2 - 16, panelH + framePad * 2 - 16, 22);
    ctx.fill();
    nineSlice("lbFrame", x0 - framePad, y0 - framePad + 6, w0 + framePad * 2, panelH + framePad * 2, 42, 0.95);
  } else {
    ctx.fillStyle = "rgba(12,16,30,.88)";
    ctx.fillRect(x0, y0, w0, panelH);
  }
  // judul panel
  ctx.textAlign = "left";
  ctx.font = "700 20px 'Trebuchet MS', system-ui";
  ctx.fillStyle = "#8fa1bd";
  ctx.fillText("LEADERBOARD", x0 + 12, y0 + 28);
  // dua pill di header: [🔀 roam on/off] [🎥 AUTO/MANUAL] — klik via canvas
  ctx.font = "700 16px 'Trebuchet MS', system-ui";
  const camTxt = state.camMode === "manual" ? "🎥 MANUAL" : "🎥 AUTO";
  const camW = ctx.measureText(camTxt).width + 18;
  const camR = { x: x0 + w0 - camW - 8, y: y0 + 8, w: camW, h: 28 };
  const roamTxt = CONFIG.CAM_ROAM_ENABLED ? "🔀 ON" : "🔀 OFF";
  const roamW = ctx.measureText(roamTxt).width + 18;
  const roamR = { x: camR.x - roamW - 8, y: y0 + 8, w: roamW, h: 28 };
  ctx.fillStyle = state.camMode === "manual" ? "rgba(94,180,255,.22)" : "rgba(255,255,255,.08)";
  ctx.fillRect(camR.x, camR.y, camR.w, camR.h);
  ctx.fillStyle = CONFIG.CAM_ROAM_ENABLED ? "rgba(142,240,168,.18)" : "rgba(255,255,255,.08)";
  ctx.fillRect(roamR.x, roamR.y, roamR.w, roamR.h);
  ctx.textAlign = "center";
  ctx.fillStyle = state.camMode === "manual" ? "#8ecbff" : "#9fb4d8";
  ctx.fillText(camTxt, camR.x + camR.w / 2, camR.y + 20);
  ctx.fillStyle = CONFIG.CAM_ROAM_ENABLED ? "#8ef0a8" : "#778399";
  ctx.fillText(roamTxt, roamR.x + roamR.w / 2, roamR.y + 20);
  state.lbHit = { camR, roamR, rows: [] };          // untuk hit-test klik canvas
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(x0, y0 + 38, w0, 1);

  if (!rows.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#8fa1bd";
    ctx.font = "600 19px 'Trebuchet MS', system-ui";
    ctx.fillText("Belum ada pelari", x0 + w0 / 2, y0 + 66);
    ctx.fillText("tunggu penonton ikut…", x0 + w0 / 2, y0 + 92);
    return;
  }
  const cellW = (w0 - 8) / cols;
  const now = performance.now();
  const hover = state.lbHover || null;
  for (let i = 0; i < shown.length; i++) {
    const r = shown[i];
    const col = cols === 2 && i >= MAX_ROWS ? 1 : 0;
    const rowInCol = cols === 2 && i >= MAX_ROWS ? i - MAX_ROWS : i;
    const cx = x0 + 4 + col * cellW;
    const cy = y0 + 46 + rowInCol * rowH + rowH / 2;
    state.lbHit.rows.push({ runner: r, x: cx, y: cy - rowH / 2, w: cellW - 4, h: rowH });
    const boosted = r.boosts.some((b) => b.until > now);
    const locked = state.camMode === "manual" && state.camLockRunner === r;
    const hovered = hover && hover.runner === r;
    // highlight pemimpin / boost / hover / terkunci — blok flat, tanpa radius
    // NB: jangan assign fillStyle = null (nilai invalid diabaikan ctx → sisa warna putih)
    let hl = null;
    if (locked) hl = "rgba(94,180,255,.18)";
    else if (hovered) hl = "rgba(255,255,255,.08)";
    else if (i === 0) hl = "rgba(255,211,92,.10)";
    else if (boosted) hl = "rgba(255,138,61,.10)";
    if (hl) {
      ctx.fillStyle = hl;
      ctx.fillRect(cx, cy - rowH / 2, cellW - 4, rowH);
    }
    // #1 = denyut emas: overlay berdenyut + garis kiri emas tebal
    if (i === 0 && state.runners.length) {
      ctx.fillStyle = `rgba(255,211,92,${0.08 + Math.sin(now / 300) * 0.06})`;
      ctx.fillRect(cx, cy - rowH / 2, cellW - 4, rowH);
      ctx.fillStyle = "#ffd35c";
      ctx.fillRect(cx, cy - rowH / 2, 4, rowH);
    }
    // panah naik/turun rank (sesuai pergeseran sejak snapshot terakhir)
    const delta = rankDelta.get(r.username);
    if (delta && !locked) {
      ctx.font = "700 15px 'Trebuchet MS', system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = delta > 0 ? "#8ef0a8" : "#ff8a7a";
      ctx.fillText(delta > 0 ? "▲" : "▼", cx + cellW - 40, cy + 5);
      ctx.textAlign = "left";
    }
    // badge peringkat kotak flat
    const badge = `${i + 1}`;
    ctx.font = "700 18px 'Trebuchet MS', system-ui";
    ctx.textAlign = "center";
    const badgeColor = i === 0 ? "#ffd35c" : i === 1 ? "#c8d4e6" : i === 2 ? "#d99a5f" : "#4a566e";
    ctx.fillStyle = badgeColor;
    ctx.fillRect(cx + 7, cy - 12, 24, 24);
    ctx.fillStyle = "#10162a";
    ctx.fillText(badge, cx + 19, cy + 6);
    // nama
    ctx.textAlign = "left";
    ctx.font = i === 0 ? "700 22px 'Trebuchet MS', system-ui" : "600 21px 'Trebuchet MS', system-ui";
    ctx.fillStyle = locked ? "#8ecbff" : i === 0 ? "#ffd35c" : r.finished ? "#8fa1bd" : "#e8eefb";
    const label = `@${r.username}`;
    ctx.fillText(label, cx + 40, cy + 7, cellW - 58);
    if (locked) {
      ctx.font = "700 16px 'Trebuchet MS', system-ui";
      ctx.fillText("🔒", cx + cellW - 30, cy + 6);
    }
    if (boosted) {
      ctx.font = "700 18px 'Trebuchet MS', system-ui";
      ctx.fillStyle = "#ff8a3d";
      const lw = Math.min(ctx.measureText(label).width, cellW - 58);
      ctx.fillText("🔥", cx + 44 + lw, cy + 6);
    }
  }
  // baris ringkasan bila daftar dipotong
  if (overflow) {
    const fy = y0 + 46 + MAX_ROWS * rowH + 20;
    ctx.textAlign = "center";
    ctx.font = "600 17px 'Trebuchet MS', system-ui";
    ctx.fillStyle = "#8fa1bd";
    ctx.fillText(`… ${rows.length - shown.length} pelari lainnya`, x0 + w0 / 2, fy);
  }
}

window.__dragRaceDebug = () => ({ fxKeys: state.fx.map((f) => [f.imgKey, Math.round(f.x), Math.round(f.y), f.frames || 0, +f.time.toFixed(2)]), fwNextMs: Math.round(state.nextFireworkAt - performance.now()), birds: state.birds.length, birdPos: state.birds.map(b => [Math.round(b.x), Math.round(b.baseY), +b.t.toFixed(2)]), assetKeys: Object.keys(assets).filter((k) => k.startsWith("firework") || k.startsWith("pigeon") || k.startsWith("bg")), phase: state.phase, runners: state.runners.length, fx: state.fx.length, camX: Math.round(state.camX), camFocus: (state.camFocusRunner && performance.now() < state.camFocusUntil ? state.camFocusRunner : (state.camMode === "manual" ? state.camLockRunner : state.camFocusRunner))?.username || null, camLock: state.camLockRunner?.username || null, camFocusBoost: state.camFocusRunner ? state.camFocusBoost : null, camNextRoamInMs: Math.max(0, Math.round(state.camNextRoamAt - performance.now())), camFocusX: Math.round(runnerWorldX((state.camMode === "manual" ? state.camLockRunner : state.camFocusRunner) || state.runners[0] || { progress: 0 })), camFocusLeftMs: Math.max(0, Math.round(state.camFocusUntil - performance.now())), winner: state.winner?.username || null, ranks: state.runners.map((r) => [r.username, +(r.progress * 100).toFixed(1)]), chars: state.runners.map((r) => r.charKey), bgmState: () => ({ playing: !bgm.paused, loop: bgm.loop, volume: +bgm.volume.toFixed(2), currentTime: Math.round(bgm.currentTime) }) });
window.__dragRaceConfig = CONFIG;          // ubah live dari konsol, mis: __dragRaceConfig.FINISH_DISTANCE_M = 1200
window.__dragRaceCam = () => ({ mode: state.camMode, lock: state.camLockRunner?.username || null });   // status kamera
window.__dragRaceProfiles = () => state.runners.map((r) => ({ u: r.username, avatarUrl: r.avatarUrl || "", userId: r.userId || "" }));
window.__dragRaceHasAsset = (key) => Boolean(assets[key]);
window.__dragRaceLbHit = () => state.lbHit; // rect leaderboard utk uji klik
window.__dragRaceStart = () => startRace();
window.__dragRaceAdd = (n) => addRunner(n);
// daftar kecepatan tiap pemain (m/s; boost menambah speedAdd sesuai levelnya)
window.__dragRaceSpeeds = () => state.runners.map((r) => {
  const b = boostOf(r, performance.now());
  return {
    name: r.username,
    base: +r.baseSpeed.toFixed(1),
    now: +(r.baseSpeed + b.add + r.wanderAmp * (Math.sin((r.wanderT * 2 * Math.PI) / r.wanderP1) + 0.5 * Math.sin((r.wanderT * 2 * Math.PI) / r.wanderP2)) / 1.5).toFixed(1),
    unit: "m/s",
    boost: b.active ? `${b.cfg.label} (+${b.cfg.speedAdd})` : null,
    progress: +(r.progress * 100).toFixed(1)
  };
});

function drawFinishedOverlay() {
  if (state.phase !== "finished" || !state.winner) return;
  // vignette gelap radial (fokus ke tengah)
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.78);
  vg.addColorStop(0, "rgba(8,10,20,.55)");
  vg.addColorStop(1, "rgba(4,6,14,.9)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // delay dramatis ±0,45 dtk sejak finish, lalu overlay "punch" masuk (zoom besar→pas)
  const since = performance.now() - (state.finishAt || 0);
  if (since < 450) return;
  const pk = Math.min(1, (since - 450) / 320);
  const e = 1 - Math.pow(1 - pk, 3);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1 + (1 - e) * 0.35, 1 + (1 - e) * 0.35);
  ctx.globalAlpha = Math.min(1, pk * 1.6);
  ctx.translate(-W / 2, -H / 2);

  ctx.textAlign = "center";
  // juara 1-3 berurutan place; kalau <3 pemain yang finish, slot sisa dikosongkan
  const top3 = state.runners.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).slice(0, 3);
  const medal = ["🥇", "🥈", "🥉"];

  ctx.save();
  ctx.shadowColor = "rgba(255,211,92,.7)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffd35c";
  ctx.font = "800 74px 'Trebuchet MS', system-ui";
  ctx.fillText("🏆 PODIUM JUARA", W / 2, 130);
  ctx.restore();

  // podium 3 anak tangga: tengah paling tinggi (juara 1)
  const baseY = 800, stepW = 380, heights = [300, 250, 190];        // tengah (P1) tertinggi, kiri (P2), kanan (P3)
  const slots = [                                                    // x, lantai y, skala
    { x: W / 2,           y: baseY - heights[0], k: 1.0 },
    { x: W / 2 - stepW,   y: baseY - heights[1], k: 0.8 },
    { x: W / 2 + stepW,   y: baseY - heights[2], k: 0.8 }
  ];
  const order = [0, 1, 2];                                           // top3[0]→tengah, [1]→kiri, [2]→kanan
  for (let s = 0; s < 3; s++) {
    const slot = slots[order.indexOf(s)] || slots[s];
    const r = top3[s];
    if (!r) continue;
    // balok podium
    ctx.fillStyle = ["#d4a017", "#9aa4b5", "#b0682f"][s];
    roundRect(slot.x - stepW / 2, slot.y, stepW, baseY - slot.y + 40, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.fillRect(slot.x - stepW / 2, slot.y, stepW, 10);
    ctx.fillStyle = "#0b1020";
    ctx.font = "800 44px 'Trebuchet MS', system-ui";
    ctx.fillText(String(s + 1), slot.x, baseY + 24);
    // avatar lingkaran + medal + nama
    const rad = Math.round(58 * slot.k);
    const ay = slot.y - rad - 18;
    ctx.save();
    ctx.beginPath(); ctx.arc(slot.x, ay, rad, 0, Math.PI * 2); ctx.closePath();
    ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#222"; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(slot.x, ay, rad, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatarCanvas(r), slot.x - rad, ay - rad, rad * 2, rad * 2);
    ctx.restore();
    ctx.lineWidth = 5;
    ctx.strokeStyle = ["#ffd35c", "#cfd8e6", "#e0955a"][s];
    ctx.beginPath(); ctx.arc(slot.x, ay, rad + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `${Math.round(54 * slot.k)}px system-ui`;
    ctx.fillText(medal[s], slot.x, ay - rad - 14);
    if (s !== 0) {   // juara 1 tidak perlu nama kecil — nama besarnya sudah tampil di bawah
      ctx.font = `800 ${Math.round(34 * slot.k)}px 'Trebuchet MS', system-ui`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`@${r.username}`, slot.x, baseY + 86);
    }
  }
  // piala di atas tengah (di antara judul dan avatar juara 1)
  drawImage("trophyGold", W / 2, 235, 120);
  const pulse = 1 + Math.sin(performance.now() / 320) * 0.03;
  ctx.save();
  ctx.translate(W / 2, baseY + 168);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = "rgba(255,255,255,.45)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#ffd35c";
  ctx.font = "800 52px 'Trebuchet MS', system-ui";
  ctx.fillText(`@${state.winner.username}`, 0, 0);
  ctx.restore();
  ctx.font = "700 34px 'Trebuchet MS', system-ui";
  ctx.fillStyle = "#ffd35c";
  ctx.fillText(`⭐ Total skor dukungan ronde ini: ${state.roundCoins.toLocaleString("id-ID")}`, W / 2, 1026);
  ctx.font = "500 26px 'Trebuchet MS', system-ui";
  ctx.fillStyle = "#cfe3ff";
  ctx.fillText("Tekan Reset atau Mulai untuk ronde baru", W / 2, 1058);
  ctx.restore();
}

function drawBirds() {
  if (!state.birds.length) return;
  const img1 = assets.pigeon_flap_1, img2 = assets.pigeon_flap_2;
  if (!img1) return;
  for (const b of state.birds) {
    const frame = Math.floor(b.t / 0.16) % 2 === 0 ? img1 : img2;
    const h = 34 * b.scale;
    const w = h * (frame.width / frame.height);
    const y = b.baseY + Math.sin(b.t * 3 + b.phase) * b.amp;
    ctx.save();
    ctx.translate(b.x, y);
    if (b.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(frame, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawSpeedFx(now) {
  // FX ngebut B5: garis-garis kecepatan horizontal menyapu trek + vignette emas.
  const k = state.speedFx;
  if (k <= 0) return;
  const m = raceMetrics();
  const a = Math.min(1, k * 1.4);            // alpha plateau lalu fade di ekor
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, m.top - 60, W, m.bottom - m.top + 120);
  ctx.clip();
  // speed lines: strip tipis putih-emas, scroll cepat ke kiri (arah berlawanan lari)
  const scroll = now * 1.8;
  for (let i = 0; i < 26; i++) {
    const ly = m.top - 40 + ((i * 173 + 29) % (m.bottom - m.top + 80));
    const lw = 130 + (i % 5) * 110;
    const lx = ((-((scroll + i * 480) % (W + 600))) + W + 300) % (W + 600) - 300;
    const g = ctx.createLinearGradient(lx, ly, lx + lw, ly);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(${i % 3 ? "255,211,92" : "255,255,255"},${(0.22 + (i % 4) * 0.05) * a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(lx, ly, lw, i % 4 === 0 ? 3 : 1.5);
  }
  ctx.restore();
  // vignette emas lembut di tepi layar + kilau cepat di awal (kick saat grant)
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, "rgba(255,211,92,0)");
  vg.addColorStop(1, `rgba(255,196,60,${0.28 * a})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (state.shake > 0.4) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake * 0.7);
  }
  drawBackground(now);
  drawFx();          // FX sprite di belakang pelari (trail nempel punggung)
  drawParticles(["smoke", "dust", "spark", "ring", "flash"]);   // partikel dunia di belakang pelari
  drawRunners(now);
  drawBirds(now);    // merpati flyby di depan trek
  // bunting merah-putih DIHAPUS dari render (permintaan user) — aset tetap tersimpan
  ctx.restore();
  drawSpeedFx(now);  // FX ngebut B5 (speed lines + vignette emas) — di belakang HUD biar teks tetap bersih
  if (!(state.phase === "finished" && state.winner)) {
    if (state.phase === "lobby" && CONFIG.SHOW_TICKER) drawCtaTicker(now);   // CTA cara ikut saat menunggu pemain
    drawHeader(now);
    if (CONFIG.SHOW_MINIMAP) drawMinimap(now);
    else state.miniHit = [];         // matikan klik avatar saat minimap sembunyi
    if (CONFIG.SHOW_LEADERBOARD) drawLeaderboard();
    else state.lbHit = null;         // matikan klik area saat leaderboard sembunyi
    drawToasts();
  }
  drawFinishedOverlay();
  drawFireworksFront();          // kembang api di depan overlay juara (langit tetap terlihat)
  drawParticles(["confetti"]);   // confetti jatuh di depan semuanya (termasuk overlay)
}

// fx multi-frame (kembang api) digambar ulang di atas overlay; yang di bawah di-mask
function drawFireworksFront() {
  if (!(state.phase === "finished" && state.winner)) return;
  for (const f of state.fx) {
    if (!f.frames) continue;
    const t = f.time / f.life;
    const fi = Math.min(f.frames - 1, Math.floor(t * f.frames));
    const img = assets[`${f.imgKey}_${fi + 1}`];
    if (!img) continue;
    ctx.globalAlpha = Math.min(1, (1 - t) * 2);
    const h = f.size * ZOOM;
    const w2 = h * (img.width / img.height);
    const sx = worldToScreen(f.x), sy = f.y;
    ctx.drawImage(img, sx - w2 / 2, sy - h / 2, w2, h);
    ctx.globalAlpha = 1;
  }
}

// ---------- main loop (rAF must survive errors) ----------
let last = performance.now();
function frame(now) {
  try {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt, now);
    draw(now);
  } catch (error) {
    console.error("Frame error:", error);
  } finally {
    window.requestAnimationFrame(frame);
  }
}

// ---------- DOM wiring ----------
document.getElementById("start-game").addEventListener("click", startRace);
document.getElementById("reset-game").addEventListener("click", resetGame);
document.getElementById("back-to-dashboard").addEventListener("click", () => {
  unsubscribe();
  tiktokConnector.disconnect();
  window.location.href = "/";
});
document.getElementById("add-bot").addEventListener("click", addOneBot);
// ---------- modal panduan awal sesi ----------
(function wireHelpModal() {
  const scrim = document.getElementById("help-scrim");
  const modal = document.getElementById("help-modal");
  if (!scrim || !modal) return;
  const tabPlay = document.getElementById("help-tab-play");
  const tabSet = document.getElementById("help-tab-set");
  const bodyPlay = document.getElementById("help-body-play");
  const bodySet = document.getElementById("help-body-set");
  const dontShow = document.getElementById("help-dont-show");
  let visible = false;
  const show = () => {
    visible = true;
    scrim.hidden = false;
    modal.hidden = false;
    const kw = document.getElementById("help-join-keywords");
    if (kw) kw.textContent = CONFIG.JOIN_KEYWORDS.join(" / ");
    requestAnimationFrame(() => modal.classList.add("is-open"));
  };
  const hide = () => {
    visible = false;
    modal.classList.remove("is-open");
    if (dontShow.checked) { try { localStorage.setItem("dragRace.helpHidden", "1"); } catch (_) {} }
    window.setTimeout(() => { scrim.hidden = true; modal.hidden = true; }, 220);
  };
  const setTab = (play) => {
    tabPlay.classList.toggle("is-active", play);
    tabSet.classList.toggle("is-active", !play);
    bodyPlay.hidden = !play;
    bodySet.hidden = play;
  };
  tabPlay.addEventListener("click", () => setTab(true));
  tabSet.addEventListener("click", () => setTab(false));
  document.getElementById("help-close").addEventListener("click", hide);
  document.getElementById("help-start").addEventListener("click", hide);
  scrim.addEventListener("click", hide);
  // tombol ⚙️ dock: tutup panduan kalau terbuka (hindari dua modal bertumpuk)
  const oldOpen = document.getElementById("open-settings");
  if (oldOpen) oldOpen.addEventListener("click", () => { if (visible) hide(); }, true);
  window.__dragRaceHelpOpen = () => visible;
  // tampilkan SEKALI per sesi browser kecuali disenyapkan via "jangan tampilkan lagi"
  let hiddenBefore = false;
  try { hiddenBefore = localStorage.getItem("dragRace.helpHidden") === "1"; } catch (_) {}
  if (!hiddenBefore) show();
})();
// collapse tool simulasi tambahan (▸/▾) — default TERTUTUP; tersimpan antar sesi
(function wireSimCollapse() {
  const inner = document.querySelector(".bottom-base-inner");
  const btn = document.getElementById("toggle-sim");
  let collapsed = true;
  try { collapsed = localStorage.getItem("dragRace.simCollapsed") !== "0"; } catch (_) {}
  const apply = () => {
    inner.classList.toggle("sim-collapsed", collapsed);
    btn.textContent = collapsed ? "▸" : "▾";
    btn.title = collapsed ? "Buka tool simulasi" : "Tutup tool simulasi (collapse)";
  };
  apply();
  btn.addEventListener("click", () => {
    collapsed = !collapsed;
    try { localStorage.setItem("dragRace.simCollapsed", collapsed ? "1" : "0"); } catch (_) {}
    apply();
  });
})();
function syncBoostDockLabels() {
  CONFIG.BOOST_LEVELS.forEach((lvl, i) => {
    const btn = document.getElementById(`sim-boost-${i + 1}`);
    if (btn) btn.textContent = `${lvl.icon || ""}B${i + 1}`;
  });
}
syncBoostDockLabels();      // label awal = icon CONFIG
for (let b = 1; b <= CONFIG.BOOST_LEVELS.length; b++) {
  document.getElementById(`sim-boost-${b}`).addEventListener("click", () => simBoost(b));
}

// Toggle manual label nama: auto (sembunyi saat padat) → on (selalu) → off (jangan pernah)
const NAME_MODES = ["auto", "on", "off"];
const nameBtn = document.getElementById("toggle-name");
function cycleNameMode() {
  const i = NAME_MODES.indexOf(CONFIG.NAMEPLATE_MODE);
  CONFIG.NAMEPLATE_MODE = NAME_MODES[(i + 1) % NAME_MODES.length];
  nameBtn.textContent = `🏷️ ${CONFIG.NAMEPLATE_MODE.toUpperCase()}`;
  nameBtn.blur();
  pushToast(`🏷️ Label pemain: ${CONFIG.NAMEPLATE_MODE}`, "#ffe28a");
}
nameBtn.addEventListener("click", cycleNameMode);
nameBtn.textContent = `🏷️ ${(CONFIG.NAMEPLATE_MODE || "auto").toUpperCase()}`;

// ---------- klik/hover leaderboard: kunci kamera ke pemain (mode manual) ----------
// koordinat mouse → koordinat kanvas internal (1440×1080), sesuai hit-rect dari drawLeaderboard
function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: (ev.clientX - rect.left) * (W / rect.width), y: (ev.clientY - rect.top) * (canvas.height / rect.height) };
}
function lbHitTest(p) {
  const hit = state.lbHit;
  if (!hit) return null;
  const inRect = (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (inRect(hit.camR)) return { type: "cam" };
  if (hit.roamR && inRect(hit.roamR)) return { type: "roam" };
  for (const r of hit.rows) if (inRect(r)) return { type: "runner", runner: r.runner };
  return null;
}
function toggleCamMode() {
  state.camMode = state.camMode === "auto" ? "manual" : "auto";
  if (state.camMode === "auto") {
    state.camLockRunner = null;
    scheduleNextRoam(performance.now());
    pushToast("🎥 Kamera AUTO — roam acak + cutaway boost", "#9fb4d8");
  } else {
    pushToast("🎥 Kamera MANUAL — klik pemain di leaderboard untuk mengunci fokus", "#8ecbff");
  }
}
function miniHitTest(p) {
  const hits = state.miniHit || [];
  for (const r of hits) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.runner;
  return null;
}
canvas.addEventListener("pointerdown", (ev) => {
  const pos = canvasPos(ev);
  const mr = miniHitTest(pos);
  if (mr) {
    if (state.camMode !== "manual") toggleCamMode();
    state.camLockRunner = state.camLockRunner === mr ? null : mr;
    const name = state.camLockRunner ? `@${state.camLockRunner.username}` : null;
    pushToast(name ? `🔒 Kamera terkunci ke ${name}` : "🔓 Kunci kamera dilepas", name ? "#8ecbff" : "#9fb4d8");
    return;
  }
  const h = lbHitTest(pos);
  if (!h) return;
  if (h.type === "roam") {
    CONFIG.CAM_ROAM_ENABLED = !CONFIG.CAM_ROAM_ENABLED;
    saveSettings({ camRoam: CONFIG.CAM_ROAM_ENABLED });
    if (CONFIG.CAM_ROAM_ENABLED) scheduleNextRoam(performance.now());
    pushToast(`🔀 Auto-follow roam: ${CONFIG.CAM_ROAM_ENABLED ? "ON — kamera sesekali ikut pelari lain" : "OFF — AUTO selalu fokus pemimpin"}`, "#8ef0a8");
    return;
  }
  if (h.type === "cam") { toggleCamMode(); return; }
  if (state.camMode !== "manual") { toggleCamMode(); }   // klik pemain langsung mengaktifkan manual
  state.camLockRunner = state.camLockRunner === h.runner ? null : h.runner;
  const name = state.camLockRunner ? `@${state.camLockRunner.username}` : null;
  pushToast(name ? `🔒 Kamera terkunci ke ${name}` : "🔓 Kunci kamera dilepas", name ? "#8ecbff" : "#9fb4d8");
});
canvas.addEventListener("pointermove", (ev) => {
  const pos = canvasPos(ev);
  const mr = miniHitTest(pos);
  state.miniHover = mr ? { runner: mr } : null;
  const h = lbHitTest(pos);
  state.lbHover = h && h.type === "runner" ? { runner: h.runner } : null;
  canvas.style.cursor = (h || mr) ? "pointer" : "";
});

// ---------- boot ----------
const loader = document.getElementById("game-asset-loader");
assetsReady = loadAssets();
assetsReady.then((result) => {
  const msg = document.getElementById("asset-loader-message");
  if (msg) msg.textContent = result.failed ? `Siap dengan ${result.failed} asset cadangan.` : "Lintasan siap!";
  loader.classList.add("is-leaving");
  setTimeout(() => { loader.hidden = true; }, 520);
  window.requestAnimationFrame(frame);
});

// ---------- panel pengaturan + BGM ----------
// Persistensi localStorage (SQLite menyusul via dragRaceSettings). Struktur:
// { finishM, midJoin, nameplate, bgmOn, bgmVol, gifts:[{minCoins,icon} × 5] }
const SETTINGS_KEY = "dragRace.settings";
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(patch) {
  const merged = { ...loadSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch {}
  return merged;
}

// BGM: elemen <audio> loop. Browser blokir autoplay → baru jalan setelah interaksi
// pertama (klik mana pun), sesuai preferensi yang tersimpan.
const bgm = new Audio("assets/audio/bgm-beyond-the-final-gate.mp3");
bgm.loop = true;
bgm.preload = "auto";
function applyBgm(on, vol) {
  bgm.volume = Math.max(0, Math.min(1, vol));
  if (on) {
    bgm.play().catch(() => {
      // autoplay diblokir → tunggu interaksi user pertama
      const once = () => { bgm.play().catch(() => {}); window.removeEventListener("pointerdown", once); };
      window.addEventListener("pointerdown", once, { once: true });
    });
  } else bgm.pause();
}

function initSettingsPanel() {
  const saved = loadSettings();
  // terapkan hasil simpanan ke CONFIG SEBELUM race apa pun
  if (Number.isFinite(saved.finishM)) CONFIG.FINISH_DISTANCE_M = saved.finishM;
  if (typeof saved.midJoin === "boolean") CONFIG.MID_RACE_JOIN = saved.midJoin;
  if (saved.nameplate) CONFIG.NAMEPLATE_MODE = saved.nameplate;
  if (typeof saved.minimap === "boolean") CONFIG.SHOW_MINIMAP = saved.minimap;
  if (typeof saved.ticker === "boolean") CONFIG.SHOW_TICKER = saved.ticker;
  if (typeof saved.camRoam === "boolean") CONFIG.CAM_ROAM_ENABLED = saved.camRoam;
  if (typeof saved.leaderboard === "boolean") CONFIG.SHOW_LEADERBOARD = saved.leaderboard;
  if (typeof saved.camSnap === "boolean") CONFIG.CAM_SNAP = saved.camSnap;
  if (typeof saved.roundTimeout === "boolean") CONFIG.USE_ROUND_TIMEOUT = saved.roundTimeout;
  if (Number.isFinite(saved.tapsPerBoost)) CONFIG.LIKE_TAPS_PER_BOOST = saved.tapsPerBoost;
  if (Array.isArray(saved.gifts)) saved.gifts.forEach((g, i) => {
    if (CONFIG.BOOST_LEVELS[i] && Number.isFinite(g?.minCoins)) CONFIG.BOOST_LEVELS[i].minCoins = Math.max(1, g.minCoins);
    if (CONFIG.BOOST_LEVELS[i] && g?.icon) CONFIG.BOOST_LEVELS[i].icon = g.icon;
  });
  if (Array.isArray(saved.joinKeywords) && saved.joinKeywords.length) CONFIG.JOIN_KEYWORDS = saved.joinKeywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 6);
  const bgmOn = saved.bgmOn ?? true, bgmVol = saved.bgmVol ?? 0.6;

  const panel = document.getElementById("settings-panel");
  const openBtn = document.getElementById("open-settings");
  const closeBtn = document.getElementById("close-settings");
  const tabG = document.getElementById("tab-general"), tabF = document.getElementById("tab-gift");
  const bodyG = document.getElementById("settings-general"), bodyF = document.getElementById("settings-gift");

  // form Umum
  const elFinish = document.getElementById("set-finish-m");
  const elMid = document.getElementById("set-mid-join");
  const elName = document.getElementById("set-nameplate");
  const elBgm = document.getElementById("set-bgm");
  const elVol = document.getElementById("set-bgm-vol");
  const elMini = document.getElementById("set-minimap");
  const elLb = document.getElementById("set-leaderboard");
  const elTicker = document.getElementById("set-ticker");
  const elKeywords = document.getElementById("set-join-keywords");
  const scrim = document.getElementById("settings-scrim");
  elFinish.value = CONFIG.FINISH_DISTANCE_M;
  elMid.checked = CONFIG.MID_RACE_JOIN;
  elName.value = CONFIG.NAMEPLATE_MODE;
  elBgm.checked = bgmOn;
  elVol.value = Math.round(bgmVol * 100);
  elMini.checked = CONFIG.SHOW_MINIMAP;
  elLb.checked = CONFIG.SHOW_LEADERBOARD;
  if (elTicker) elTicker.checked = CONFIG.SHOW_TICKER;
  if (elKeywords) elKeywords.value = CONFIG.JOIN_KEYWORDS.join(", ");
  const elCamSnap = document.getElementById("set-cam-snap");
  if (elCamSnap) elCamSnap.checked = CONFIG.CAM_SNAP;
  const elRoundTO = document.getElementById("set-round-timeout");
  if (elRoundTO) elRoundTO.checked = CONFIG.USE_ROUND_TIMEOUT;

  // form Gift: kartu per level. B1 = DUAL (tap/love ATAU koin gift); B2-5 = ambang koin.
  const rows = document.getElementById("gift-rows");
  function persistGifts() {
    saveSettings({ gifts: CONFIG.BOOST_LEVELS.map((l) => ({ minCoins: l.minCoins, icon: l.icon })) });
  }
  const statEls = [];
  function renderStats() {
    CONFIG.BOOST_LEVELS.forEach((lvl, i) => {
      if (!statEls[i]) return;
      statEls[i].textContent = i === 0 ? "= " + CONFIG.LIKE_TAPS_PER_BOOST + " \ud83d\udc97 atau skor " + lvl.minCoins
                                       : "= skor " + lvl.minCoins;
    });
  }
  CONFIG.BOOST_LEVELS.forEach((lvl, i) => {
    const isB1 = i === 0;
    const card = document.createElement("div");
    card.className = "gift-card";
    card.style.setProperty("--gc", lvl.color);

    const icon = document.createElement("img");
    icon.className = "gift-icon-img";
    // Ikon = GAMBAR VFX aslinya (tidak bisa diganti-ganti lagi; emoji toast/dock tetap dari CONFIG)
    icon.src = IMAGES[lvl.fx] || OPTIONAL_IMAGES[lvl.fx] || "";
    icon.alt = lvl.label;
    icon.title = lvl.fx + " (" + (IMAGES[lvl.fx] || OPTIONAL_IMAGES[lvl.fx] || "") + ")";

    const info = document.createElement("div");
    info.className = "gift-info";
    info.innerHTML = "<b>" + lvl.label.toUpperCase() + "</b>";
    const stat = document.createElement("span");
    stat.className = "gift-stat";
    info.append(stat);
    statEls[i] = stat;

    const fields = document.createElement("div");
    fields.className = "gift-fields";
    const mkField = (cls, min, max, step, val, title, unit, onchange) => {
      const box = document.createElement("label");
      box.className = "gift-field";
      const inp = document.createElement("input");
      inp.type = "number"; inp.className = cls; inp.min = min; inp.max = max; inp.step = step;
      inp.value = val; inp.title = title;
      inp.addEventListener("change", () => { onchange(inp); renderStats(); });
      box.append(inp);
      box.insertAdjacentHTML("beforeend", "<em>" + unit + "</em>");
      fields.append(box);
    };
    if (isB1) {
      mkField("gift-num", 10, 10000, 10, CONFIG.LIKE_TAPS_PER_BOOST, "Jumlah tap/love untuk 1\u00d7 Boost 1", "\ud83d\udc97", (inp) => {
        CONFIG.LIKE_TAPS_PER_BOOST = Math.max(10, Number(inp.value) || 100);
        inp.value = CONFIG.LIKE_TAPS_PER_BOOST;
        saveSettings({ tapsPerBoost: CONFIG.LIKE_TAPS_PER_BOOST });
      });
    }
    mkField("gift-num", 1, 10000, 1, lvl.minCoins, isB1 ? "Atau dukungan dengan skor \u2265 sekian \u2192 Boost 1" : "Skor dukungan minimal agar memicu level ini \u2014 dukungan besar dipecah ke beberapa level sekaligus", "\u2b50", (inp) => {
      lvl.minCoins = Math.max(1, Number(inp.value) || 1);
      inp.value = lvl.minCoins;
      persistGifts();
    });
    card.append(icon, info, fields);
    rows.appendChild(card);
  });
  renderStats();
  const legend = document.createElement("div");
  legend.className = "gift-legend";
  legend.textContent = "\ud83d\udc97 tap/love \u00b7 \u2b50 skor dukungan \u00b7 boost sejenis menumpuk DURASI";
  rows.appendChild(legend);

  // wiring Umum → CONFIG live + persist
  elFinish.addEventListener("change", () => {
    const v = Math.min(20000, Math.max(500, Number(elFinish.value) || CONFIG.FINISH_DISTANCE_M));
    elFinish.value = v;
    CONFIG.FINISH_DISTANCE_M = v;
    saveSettings({ finishM: v });
    pushToast(`📏 Lintasan ${v} m (berlaku mulai ronde berikutnya)`, "#9fd8a8");
  });
  elMid.addEventListener("change", () => { CONFIG.MID_RACE_JOIN = elMid.checked; saveSettings({ midJoin: elMid.checked }); });
  elName.addEventListener("change", () => { CONFIG.NAMEPLATE_MODE = elName.value; saveSettings({ nameplate: elName.value }); });
  elMini.addEventListener("change", () => { CONFIG.SHOW_MINIMAP = elMini.checked; saveSettings({ minimap: elMini.checked }); });
  elLb.addEventListener("change", () => { CONFIG.SHOW_LEADERBOARD = elLb.checked; saveSettings({ leaderboard: elLb.checked }); });
  if (elTicker) elTicker.addEventListener("change", () => { CONFIG.SHOW_TICKER = elTicker.checked; saveSettings({ ticker: elTicker.checked }); });
  if (elKeywords) elKeywords.addEventListener("change", () => {
    const kws = elKeywords.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 6);
    if (!kws.length) { elKeywords.value = CONFIG.JOIN_KEYWORDS.join(", "); return; }
    CONFIG.JOIN_KEYWORDS = kws;
    elKeywords.value = kws.join(", ");
    saveSettings({ joinKeywords: kws });
    pushToast(`🔑 Kata kunci ikut: ${kws.join(" / ")}`, "#9fd8a8");
  });
  if (elCamSnap) elCamSnap.addEventListener("change", () => { CONFIG.CAM_SNAP = elCamSnap.checked; saveSettings({ camSnap: elCamSnap.checked }); });
  if (elRoundTO) elRoundTO.addEventListener("change", () => {
    CONFIG.USE_ROUND_TIMEOUT = elRoundTO.checked;
    saveSettings({ roundTimeout: elRoundTO.checked });
    // terapkan juga ke ronde yang sedang berjalan
    if (state.phase === "running" || state.phase === "countdown") {
      const cd = Math.max(0, state.roundStarts - performance.now());
      state.roundDeadline = elRoundTO.checked ? performance.now() + cd + CONFIG.ROUND_TIMEOUT_SECONDS * 1000 : Infinity;
    }
    pushToast(elRoundTO.checked ? `⏱ Batas waktu aktif: ${CONFIG.ROUND_TIMEOUT_SECONDS} dtk/ronde` : "⏱ Batas waktu OFF — balapan sampai semua finish", "#9fd8a8");
  });
  // tombol 💾 Simpan — ambil SEMUA kontrol, terap + simpan sekaligus (bukan cuma auto per-field)
  const saveBtn = document.getElementById("save-settings");
  if (saveBtn) saveBtn.addEventListener("click", () => {
    const vFinish = Math.max(500, Math.min(20000, Number(elFinish.value) || CONFIG.FINISH_DISTANCE_M));
    elFinish.value = CONFIG.FINISH_DISTANCE_M = vFinish;
    const kws = elKeywords ? elKeywords.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 6) : [];
    if (kws.length) { CONFIG.JOIN_KEYWORDS = kws; if (elKeywords) elKeywords.value = kws.join(", "); }
    CONFIG.MID_RACE_JOIN = elMid.checked;
    CONFIG.NAMEPLATE_MODE = elName.value;
    CONFIG.SHOW_MINIMAP = elMini.checked;
    CONFIG.SHOW_LEADERBOARD = elLb.checked;
    if (elTicker) CONFIG.SHOW_TICKER = elTicker.checked;
    if (elCamSnap) CONFIG.CAM_SNAP = elCamSnap.checked;
    if (elRoundTO) CONFIG.USE_ROUND_TIMEOUT = elRoundTO.checked;
    CONFIG.LIKE_TAPS_PER_BOOST = Math.max(1, Math.round(Number(document.getElementById("set-taps-per-boost")?.value) || CONFIG.LIKE_TAPS_PER_BOOST));
    const bgmOn2 = elBgm.checked, vol2 = Number(elVol.value) / 100;
    applyBgm(bgmOn2, vol2);
    saveSettings({
      finishM: vFinish,
      joinKeywords: CONFIG.JOIN_KEYWORDS,
      midJoin: CONFIG.MID_RACE_JOIN,
      nameplate: CONFIG.NAMEPLATE_MODE,
      minimap: CONFIG.SHOW_MINIMAP,
      leaderboard: CONFIG.SHOW_LEADERBOARD,
      ticker: CONFIG.SHOW_TICKER,
      camSnap: CONFIG.CAM_SNAP,
      roundTimeout: CONFIG.USE_ROUND_TIMEOUT,
      tapsPerBoost: CONFIG.LIKE_TAPS_PER_BOOST,
      bgmOn: bgmOn2, bgmVol: vol2,
      gifts: CONFIG.BOOST_LEVELS.map((l) => ({ minCoins: l.minCoins, icon: l.icon })),
    });
    saveBtn.classList.remove("is-saved");
    void saveBtn.offsetWidth;           // restart animasi bila klik berkali-kali
    saveBtn.classList.add("is-saved");
    pushToast("💾 Pengaturan disimpan", "#9fd8a8");
    setTimeout(() => setPanel(false), 260);   // close panel setelah animasi simpan sempat terlihat
  });
  elBgm.addEventListener("change", () => { applyBgm(elBgm.checked, Number(elVol.value) / 100); saveSettings({ bgmOn: elBgm.checked }); });
  elVol.addEventListener("input", () => { applyBgm(elBgm.checked, Number(elVol.value) / 100); });
  elVol.addEventListener("change", () => { saveSettings({ bgmVol: Number(elVol.value) / 100 }); });

  // tabs + buka/tutup
  function showTab(general) {
    tabG.classList.toggle("is-active", general);
    tabF.classList.toggle("is-active", !general);
    bodyG.hidden = !general;
    bodyF.hidden = general;
  }
  tabG.addEventListener("click", () => showTab(true));
  tabF.addEventListener("click", () => showTab(false));
  function setPanel(open) {
    panel.hidden = !open;
    if (scrim) scrim.hidden = !open;
  }
  openBtn.addEventListener("click", () => {
    // sinkronkan form dg nilai saat ini (bisa berubah via tombol dock 🏷️ dll.)
    elFinish.value = CONFIG.FINISH_DISTANCE_M;
    elMid.checked = CONFIG.MID_RACE_JOIN;
    elName.value = CONFIG.NAMEPLATE_MODE;
    elMini.checked = CONFIG.SHOW_MINIMAP;
    elLb.checked = CONFIG.SHOW_LEADERBOARD;
    if (elTicker) elTicker.checked = CONFIG.SHOW_TICKER;
    if (elKeywords) elKeywords.value = CONFIG.JOIN_KEYWORDS.join(", ");
    setPanel(panel.hidden);          // toggle
  });
  closeBtn.addEventListener("click", () => setPanel(false));
  if (scrim) scrim.addEventListener("click", () => setPanel(false));

  applyBgm(bgmOn, bgmVol);
}
initSettingsPanel();
