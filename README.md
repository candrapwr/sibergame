# Game Hub

Project ini memakai pola **modular monolith**: semua game berada dalam satu project, tetapi setiap game menyimpan halaman, tampilan, logika, dan asset-nya sendiri. Kode konektor dan kontrak event yang dipakai lintas game berada di `shared/`.

## Struktur

```text
.
├── index.html                    # Katalog game
├── styles.css                    # Tampilan katalog
├── server.js                     # HTTP, API, WebSocket, dan listener bersama
├── ecosystem.config.cjs          # Konfigurasi proses PM2
├── games/
│   ├── registry.js               # Daftar game yang tampil di katalog
│   └── faction-war/
│       ├── index.html
│       ├── styles.css
│       ├── boot.js
│       ├── game.js
│       ├── README.md             # Dokumentasi teknis Faction War
│       └── assets/
└── shared/
    ├── tiktok/
    │   ├── event-contract.js     # Format event bersama dan normalisasi payload
    │   └── tiktok-connector.js   # Subscriber dan koneksi WebSocket bersama
    └── game-settings-store.js    # Penyimpan SQLite terpisah untuk setiap game
```

## Informasi proyek

- **Pengembang:** DataSiberLab
- **Email:** [candrapwr@datasiber.com](mailto:candrapwr@datasiber.com)
- **Portal:** [game.idsiber.com](https://game.idsiber.com)

## Menjalankan

Game Hub menjalankan server aplikasi dan Siber Live Listener dalam satu proses. Node.js 22 atau lebih baru diperlukan.

```sh
npm install
npm start
```

`npm start` menjalankan server tanpa membuka tab browser otomatis. Buka Game Hub secara manual di `http://127.0.0.1:8050`. Port dapat diganti melalui environment variable `PORT`. Masukkan username akun TikTok yang sedang LIVE dan tunggu sampai status terhubung. Halaman game akan kembali ke hub untuk memulai koneksi jika dibuka langsung tanpa sesi listener yang aktif. Jika memang ingin server membuka browser, jalankan dengan `OPEN_BROWSER=true`.

Untuk menjalankan proses dengan PM2, install PM2 pada server lalu jalankan `pm2 start ecosystem.config.cjs`. Konfigurasi tersebut memakai port `8050`, mengikat Node ke `127.0.0.1`, dan tidak membuka browser dari server. Di production, tempatkan reverse proxy/domain di depan port lokal ini.

## Menambahkan game

1. Buat folder baru di `games/<nama-game>/` untuk HTML, CSS, logika, dan asset game tersebut.
2. Tambahkan metadata game ke array `games` di `games/registry.js`.
3. Buat `boot.js` yang memanggil `requireConnectedTikTok()` dari `shared/tiktok/game-entry.js` sebelum mengimpor logika game.
4. Import konektor bersama dari game: `../../shared/tiktok/tiktok-connector.js`.
5. Subscribe ke event dan terjemahkan ke aksi khusus game itu sendiri. Aturan satu game tidak ditaruh di konektor bersama.
6. Simpan state runtime dengan key `game-state:<nama-game>` agar state semua game dibersihkan otomatis saat sesi TikTok baru berhasil terhubung. Pengaturan game disimpan server-side melalui `/api/games/<nama-game>/settings` ke database `games/<nama-game>/data/settings.sqlite`, terpisah berdasarkan username LIVE.
7. Buat `README.md` di folder game tersebut untuk menjelaskan mekanik, alur event, pengaturan, state, dan asset khusus game. Dokumentasi global tetap untuk hub dan sistem bersama.

## Dokumentasi game

- [Faction War — dokumentasi teknis](games/faction-war/README.md): entry point, mekanik pertempuran, statistik troop, pemetaan event TikTok, pengaturan, penyimpanan state, dan asset.

## Konektor TikTok

Implementasi inti Siber Live yang dipakai server sudah disalin ke `shared/tiktok/siber-live`, sehingga project ini tidak lagi bergantung pada folder `siber-live-listener` di luar project. `server.js` menjaga satu koneksi LIVE bersama dan meneruskan event ke game melalui WebSocket `/tiktok`. Set `SIGN_API_KEY` jika ingin memakai key signing Euler; tanpa key, listener mencoba kuota anonim.

Konektor browser menerima event melalui WebSocket, menormalkannya, lalu membagikannya ke semua game yang subscribe. Aturan event khusus game tetap berada di folder game masing-masing.

Event yang dikenali: `comment`, `gift`, `like`, `follow`, `share`, dan `join`. Contoh payload dari listener:

```json
{"eventType":"comment","username":"User123","userId":"12345","comment":"1"}
```

```json
{"eventType":"gift","username":"User123","giftName":"Rose","giftId":"5655","giftCount":1,"coinValue":1}
```

Status koneksi disimpan oleh server selama proses server berjalan, jadi berpindah halaman dari hub ke game tidak memutus listener. Endpoint event `/tiktok` dibagi oleh semua game.

Konektor hanya menangani transport dan format event umum. Setiap game menentukan sendiri pemetaan event ke gameplay; lihat README di folder game untuk aturan khusus tersebut.

## Penyimpanan pengaturan

Setiap game menyimpan pengaturan di file SQLite miliknya sendiri pada `games/<nama-game>/data/settings.sqlite`. Baris pengaturan dibedakan berdasarkan username akun LIVE yang sedang tersambung. File database dan file journal SQLite diabaikan Git. State runtime pertandingan tetap menggunakan `localStorage` per browser; pengaturan tidak.
