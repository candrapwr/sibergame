# Faction War — Dokumentasi Teknis

Dokumen ini berisi detail implementasi khusus Faction War. Cara menjalankan Game Hub, listener TikTok bersama, dan kontrak event global dijelaskan di [README utama](../../README.md).

## Ringkasan

Faction War adalah game arena dua tim berbasis canvas. Troop muncul dari sisi timnya, berjalan menuju frontline, lalu bertarung. Jika tidak ada troop lawan yang masih aktif, tim dapat mendorong wilayah. Pertandingan selesai ketika satu tim menguasai seluruh wilayah; skor ronde dipertahankan sampai game di-reset.

## Entry point dan alur startup

| File | Tanggung jawab |
| --- | --- |
| `index.html` | Membuat canvas 1080 × 1920, kontrol bawah, dialog pengaturan, dan memuat GSAP dari CDN. |
| `styles.css` | Layout fullscreen, kontrol, modal, serta tampilan responsif. |
| `boot.js` | Memeriksa mode main atau konfigurasi, memuat pengaturan dan katalog gift, lalu memuat `game.js`. |
| `game.js` | State, simulasi pertempuran, event TikTok, penyimpanan, dan orkestrasi modul game. |
| `renderer.js` | Setup canvas, pemuatan sprite, cache gambar, dan semua fungsi render arena. |
| `audio.js` | Efek suara, musik latar, serta pemutaran video animasi per ronde. |
| `settings-panel.js` | Modal pengaturan, tab, mapping gift, filter katalog, dan upload video. |
| `assets/images/` | Sprite kastil, troop, boss, ikon, dan VFX. |
| `assets/audio/` | Efek suara troop, suara kemenangan, dan musik latar. Lihat [daftar audio dan sumber lisensinya](assets/audio/README.md). |

Mode bermain dibuka melalui Game Hub setelah akun LIVE tersambung. `boot.js` mendapatkan status dan katalog melalui API dengan `sessionId`, lalu game membuka endpoint `/tiktok?sessionId=...`. Tombol **Mulai** mengaktifkan simulasi dan koneksi event untuk game ini. Selama belum dimulai atau ronde sudah selesai, event TikTok tidak mengubah gameplay. Mode **Pengaturan** dapat dibuka tanpa LIVE; mode ini tidak memulihkan pertandingan dan tidak menghubungkan listener.

Koneksi WebSocket browser memakai `ws://` pada HTTP lokal dan `wss://` pada HTTPS. Endpoint dibagikan oleh Game Hub; game tidak membuat koneksi listener kedua.

## Canvas dan siklus render

- Koordinat dasar canvas adalah `W = 1080`, `H = 1920`.
- Layout arena dapat melebar pada viewport landscape. Sprite dan teks tetap mempertahankan proporsi aslinya.
- Header stream diringkas ke judul, persentase wilayah, dan nama tim; skor ditampilkan saat hasil ronde. Sprite kastil, troop, avatar, nameplate, health bar, dan legenda gift memakai skala yang lebih besar agar mudah terbaca di OBS.
- Ketika game aktif, simulasi berjalan sekitar 30 frame per detik. State disimpan setiap 3 detik.
- Saat game belum mulai, canvas hanya dirender ketika tampilan perlu diperbarui; tidak ada loop simulasi yang terus berjalan.
- GSAP menggerakkan tween dan efek ambient. Jika CDN tidak tersedia atau pengguna memilih reduced motion, animasi dasar tetap ditangani oleh loop game.

## Aturan pertempuran

### Tim, wilayah, dan kemenangan

- **Red** mulai dari sisi kiri; **Blue** mulai dari sisi kanan. Sprite troop Blue menghadap ke kiri.
- Kapasitas gabungan wilayah adalah 300 poin. Awal ronde, masing-masing tim memegang 150 poin.
- Posisi frontline dan persentase wilayah dihitung dari rasio wilayah yang sama.
- Satu tim menang saat wilayahnya mencapai 300 poin. Skor tim pemenang bertambah satu, layar kemenangan muncul, lalu ronde baru dimulai sekitar 5,5 detik kemudian.
- Pergantian ronde menghapus troop dan afiliasi viewer, tetapi mempertahankan skor. Tombol Reset menghapus skor dan mengembalikan game ke status belum dimulai.

### Statistik unit

HP pada tabel sudah termasuk pengali HP global ×3. Damage serangan dan kekuatan dorong adalah nilai per aksi.

| Unit | HP | Damage | Dorong wilayah | Cooldown serang |
| --- | ---: | ---: | ---: | ---: |
| Knight | 240 | 24 | 2 | 1,8 dtk |
| Mage | 360 | 30 | 2 | 1,8 dtk |
| Beast | 480 | 38 | 3 | 1,8 dtk |
| Golem Boss | 1.260 | 58 | 8 | 2,6 dtk |

Troop biasa bergerak dengan kecepatan dasar 108 unit/detik, sedangkan Boss 58. Tiap unit mendapat faktor kecepatan acak 0,92–1,12 saat muncul; jarak ke frontline tidak mengubah kecepatan dasarnya.

### Target dan tekanan pertempuran

- Troop yang sudah mencapai frontline berhenti maju dan menyerang troop lawan yang juga berada di frontline dan cukup dekat pada sumbu horizontal.
- Damage satu serangan dibagi rata ke semua target lawan yang memenuhi syarat serangan itu. Mage meluncurkan proyektil; unit lain memberi damage langsung.
- Selama kedua tim memiliki troop hidup, tekanan pertempuran mengurangi HP troop secara bertahap meski tidak ada pasangan yang sedang saling menyerang. Tekanan dasar adalah 0,35 HP/detik per troop biasa atau 0,5 HP/detik per Boss, ditambah tekanan lawan `min(4.5, totalDamageLawan / 30 × 0.8)`.
- Tekanan pasif tidak menghabisi unit: HP ditahan minimum satu. KO terjadi dari serangan langsung.
- Frontline hanya didorong ketika tidak ada troop lawan yang masih aktif, termasuk troop lawan yang sedang berjalan menuju garis. Setelah lawan habis, troop yang tersisa mulai mendorong wilayah.

## Integrasi event TikTok

Event diterima melalui konektor bersama, kemudian `handleTikTokEvent()` mengubahnya menjadi aksi Faction War. Identitas viewer memakai `userId` jika tersedia, dan username sebagai fallback.

| Event | Aturan Faction War |
| --- | --- |
| Komentar | `1` atau `join1` memilih Red; `2` atau `join2` memilih Blue. Huruf besar/kecil, spasi, `_`, dan `-` diabaikan. Komentar tim yang valid memicu aksi join dan menambah satu poin wilayah. Jika viewer berpindah tim pada mode coin, saldo coin viewer di-reset. |
| Gift — mode coin | Nilai `coinValue × giftCount` ditambahkan ke saldo viewer. Jika belum punya tim, gift pertama memilih tim acak, menjalankan aksi join (+1 wilayah), dan afiliasi itu bertahan sampai ronde berakhir. Selama saldo cukup, unit termahal yang bisa dibayar dipanggil lebih dulu. Maksimal 50 unit diproses dari satu event gift. |
| Gift — mode gift | ID atau nama gift dicocokkan dengan mapping unit dan tim. Setiap pengulangan gift memanggil satu unit; maksimal 25 unit diproses dari satu event. Nilai coin dan komentar pemilihan tim diabaikan. |
| Like | Jika fitur aktif, like diakumulasi per viewer. Setiap mencapai ambang yang dikonfigurasi, satu Knight dipanggil. Viewer tanpa tim mendapat tim acak dan aksi join (+1 wilayah) saat troop like pertamanya muncul. |
| Follow, share, join | Konektor mengenali event ini, tetapi Faction War saat ini belum memetakannya menjadi aksi permainan. |

Spawn dari gift dimasukkan ke antrean dengan jeda 220 ms per unit agar combo tidak muncul serentak. Jika gift yang sama dipetakan ke lebih dari satu unit/tim, pencocokan pertama dalam urutan Knight, Mage, Beast, Boss lalu Red/Blue yang digunakan; sebaiknya setiap gift hanya dipetakan sekali.

### Mode gift dan katalog

Server mengunduh katalog saat koneksi LIVE dibuat dan menyediakannya sepanjang sesi melalui `/api/tiktok/gifts`. Katalog yang berhasil diunduh disimpan per username di database game, sehingga bisa dipakai lagi saat membuka pengaturan offline. Jika belum pernah ada katalog untuk akun itu, pemilihan gift memerlukan satu koneksi LIVE yang berhasil; mode coin tetap dapat diatur tanpa katalog. Tab Gift menyediakan pencarian, filter harga minimum/maksimum diamond, pengurutan, dan pemuatan daftar bertahap. Mapping disimpan berdasarkan ID gift dan dipisah untuk setiap unit serta tim.

Legenda ikon di sisi arena hanya digambar ketika mode gift aktif, katalog siap, dan opsi **Tampilkan legenda gift** diaktifkan. Ikon troop/gift dan pengaturan label avatar serta username berada di canvas.

## Pengaturan dan penyimpanan

Pengaturan disimpan di `games/faction-war/data/settings.sqlite`, pada tabel `game_settings` dengan username TikTok sebagai key. Katalog gift tersimpan di tabel `gift_catalogs` pada database yang sama. Akun yang berbeda mempunyai pengaturan dan katalog terpisah; akun yang sama memakai datanya lagi saat tersambung pada sesi berikutnya. Database dan file journal SQLite tidak dimasukkan ke Git.

Tombol **Pengaturan** di dashboard membuka jendela khusus untuk mengubah konfigurasi berdasarkan username yang dimasukkan meski akun sedang offline. Mode ini tidak memulihkan state pertandingan, menghubungkan listener, menjalankan gameplay, atau mengubah state pertandingan saat ditutup.

Saat pertama kali dibuka setelah pembaruan ini, pengaturan lama dari `localStorage` key `faction-war-ui-settings-v1` dipindahkan satu kali ke database untuk username yang dipilih, lalu key lama dihapus setelah migrasi berhasil. Pengaturan berikutnya hanya dibaca dan ditulis melalui API SQLite. Dialog menampilkan status **Menyimpan…** selama permintaan berlangsung dan pesan error jika server gagal menyimpan.

Tab **Animasi** menerima video MP4 atau WebM hingga 100 MB. Satu video disimpan per username pada `games/faction-war/data/videos/<username>.<format>`; upload baru untuk username yang sama menggantikan file sebelumnya. Saat event gift dari username yang cocok diterima selama ronde, video itu ditampilkan menutupi arena selama 10 detik. Video diputar maksimal sekali per ronde; penandanya tersimpan saat refresh dan di-reset otomatis saat ronde baru dimulai setelah kemenangan. Tombol Reset game juga membuka sesi baru. Setelah refresh, game mencocokkan troop yang masih aktif supaya gift yang sudah memunculkan troop tetap dapat memicu videonya. MP3 adalah audio, bukan format video yang diterima.

| Pengaturan | Default |
| --- | --- |
| Judul dan nama Red/Blue | Faction War, Red Team, Blue Team |
| Avatar dan username gifter | Aktif |
| Legenda gift | Aktif |
| Efek suara | Aktif, volume 42% |
| Musik latar | Aktif, volume 25% |
| Tap like | Aktif, 100 like per Knight |
| Mode coin | Knight 1, Mage 5, Beast 15, Boss 100 coin |
| Mapping gift | Kosong; dipilih terpisah untuk tiap unit dan tim |

State pertandingan disimpan pada `localStorage` key `game-state:<listener-session>:faction-war`. Troop, HP, wilayah, skor, ronde, antrean spawn, tim viewer, saldo coin, dan sisa like disimpan berkala dan saat halaman ditutup. Refresh halaman melanjutkan state game. Saat akun pada satu listener session diganti, hanya state game milik session itu yang direset; session streamer lain dan database pengaturan tidak ikut dihapus.

Reset game menghentikan koneksi event game, membersihkan troop dan skor, mengosongkan afiliasi/saldo/like viewer, serta menghentikan audio. Pengaturan tidak ikut di-reset.

## Audio dan asset

- Efek spawn dan attack memiliki file terpisah untuk Knight, Mage, Beast, dan Boss. Tim Red dan Blue memakai sound yang sama.
- `finish.wav` dimainkan saat tim menang. Efek suara dan musik latar memiliki toggle serta volume terpisah.
- `bg1.mp3` diputar berulang selama game aktif.
- Nama file dan sumber efek suara dicatat di [assets/audio/README.md](assets/audio/README.md). Jika file efek tertentu tidak ada, efek itu dilewati.
- Sprite dan VFX yang dipakai canvas didefinisikan pada `imageFiles` di `renderer.js`.

## Simulasi dan debugging browser

Kontrol bawah dapat memanggil unit untuk simulasi lokal. Untuk debugging melalui DevTools, game harus sudah dimulai:

```js
window.handleGameCommand({
  action: "SPAWN_TROOP",
  team: "RED",
  troopType: "knight",
  username: "DevUser"
});

window.publishTikTokEvent({
  eventType: "gift",
  username: "DevUser",
  giftId: "5655",
  giftName: "Rose",
  giftCount: 1,
  coinValue: 1
});
```

Event simulasi melewati normalisasi dan handler yang sama dengan konektor browser, sehingga aturan `game.js` yang diuji tetap merupakan aturan gameplay yang sebenarnya.
