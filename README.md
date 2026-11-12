# KINSTEAD — World Builder

<p align="center">
  <strong>Bangun, jelajahi, dan kembangkan dunia 3D milikmu.</strong><br>
  Proyek World Builder berbasis web dengan JavaScript dan Three.js.
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-development-orange">
  <img alt="Platform" src="https://img.shields.io/badge/platform-web-blue">
  <img alt="Runtime" src="https://img.shields.io/badge/Node.js-24%2B-green">
  <img alt="License" src="https://img.shields.io/badge/license-not%20specified-lightgrey">
</p>

---

## Tentang Proyek

**KINSTEAD — World Builder** adalah proyek game dan editor dunia 3D berbasis web. Proyek ini disusun menggunakan HTML, CSS, JavaScript, dan Three.js.

Repository ini berisi aplikasi utama, editor, sistem game, aset 3D, serta data world. Proyek masih dalam tahap pengembangan; fitur dan struktur dapat berubah seiring pembaruan.

## Fitur dan Komponen

- **World Builder** — fondasi untuk membangun dan mengelola dunia.
- **3D Rendering** — menggunakan Three.js untuk menampilkan objek dan lingkungan 3D.
- **World Editor** — halaman editor terpisah melalui `editor.html`.
- **Game Systems** — modul untuk pengelolaan dunia, karakter, interaksi, dan sistem permainan.
- **Asset Library** — aset 3D dan aset pendukung di dalam folder `assets/` dan `public/`.
- **World Data** — data dunia disimpan di folder `worlds/`.

> Catatan: daftar ini menjelaskan komponen yang tersedia di struktur proyek, bukan klaim bahwa seluruh fitur sudah final.

## Teknologi

| Teknologi | Kegunaan |
|---|---|
| HTML5 | Struktur halaman aplikasi |
| CSS3 | Tampilan antarmuka |
| JavaScript ES Modules | Logika aplikasi dan sistem game |
| Three.js | Rendering grafis 3D |
| Node.js | Menjalankan server pengembangan melalui Termux |

## Struktur Proyek

```text
KINSTEAD-WORLD-BUILDER/
├── assets/                 # Aset 3D dan aset dunia
├── public/                 # Aset publik aplikasi
├── src/
│   ├── core/               # Modul inti
│   ├── editor/             # Modul editor
│   ├── game/               # Sistem dan logika game
│   ├── systems/            # Sistem permainan
│   └── ui/                 # Antarmuka pengguna
├── tools/                  # Tool inspeksi dan validasi
├── vendor/
│   └── three/              # Library Three.js lokal
├── worlds/                 # Data world
├── index.html              # Halaman utama
├── editor.html             # Halaman editor
└── README.md
```

## Menjalankan di Android (Termux)

Proyek ini tidak memiliki `package.json` pada root. Karena itu, **jangan menjalankan `npm install` atau `npm run dev`**. Jalankan server HTTP sederhana menggunakan `http-server`.

### 1. Masuk ke folder proyek

```bash
cd ~/KINSTEAD-WORLD-BUILDER
```

### 2. Pastikan Node.js tersedia

```bash
node --version
npm --version
```

Jika belum terpasang di Termux:

```bash
pkg update
pkg install nodejs-lts -y
```

### 3. Jalankan server

```bash
npx --yes http-server . -p 8080
```

Saat server aktif, buka browser Android dan kunjungi:

- **Aplikasi utama:** http://127.0.0.1:8080/
- **World Editor:** http://127.0.0.1:8080/editor.html

Biarkan Termux tetap berjalan selama aplikasi dibuka.

### 4. Menghentikan server

Kembali ke Termux, lalu tekan:

```text
CTRL + C
```

### Catatan penting

- Buka aplikasi melalui alamat server HTTP, bukan dengan membuka `index.html` langsung dari file manager. Modul JavaScript dan pemuatan aset dapat terkendala kebijakan browser jika dibuka memakai `file://`.
- Jika port `8080` sedang digunakan, pilih port lain, misalnya:

  ```bash
  npx --yes http-server . -p 8081
  ```

  Kemudian buka `http://127.0.0.1:8081/`.
- `npx` mungkin perlu mengunduh `http-server` saat pertama kali dijalankan, sehingga koneksi internet diperlukan.
- Folder `vendor/three/` berisi library Three.js lokal. Jangan menghapusnya tanpa memastikan aplikasi tidak lagi menggunakannya.

## Menjalankan di Komputer

Pastikan Node.js sudah terpasang, lalu buka terminal pada folder proyek:

```bash
npx --yes http-server . -p 8080
```

Buka browser dan akses:

```text
http://localhost:8080/
```

Untuk membuka editor:

```text
http://localhost:8080/editor.html
```

## Menyimpan Perubahan ke GitHub

Pastikan perubahan sudah diuji sebelum diunggah.

```bash
cd ~/KINSTEAD-WORLD-BUILDER

git status
git add .
git commit -m "Update KINSTEAD World Builder"
git push
```

Untuk melihat status repository:

```bash
git status
git log -5 --oneline
```

File yang tidak seharusnya masuk repository—seperti `.env`, `node_modules/`, file log, dan file backup—sudah dicantumkan dalam `.gitignore`.

## Troubleshooting

### `npm run dev` menampilkan `package.json` tidak ditemukan

Itu normal untuk struktur proyek saat ini. Root proyek tidak menyediakan `package.json` dan script `dev`. Gunakan:

```bash
npx --yes http-server . -p 8080
```

### Halaman tidak bisa dibuka

1. Pastikan server masih berjalan di Termux.
2. Pastikan alamat yang dibuka benar: `http://127.0.0.1:8080/`.
3. Periksa apakah terminal menampilkan pesan error.
4. Coba port lain jika `8080` sedang digunakan.

### Perubahan tidak muncul di browser

Coba muat ulang halaman. Jika masih sama, lakukan hard refresh atau bersihkan cache browser untuk situs lokal tersebut.

## Kontribusi dan Pengembangan

KINSTEAD masih dikembangkan. Sebelum mengubah sistem inti:

1. Periksa modul yang terkait dan alur pemanggilannya.
2. Buat cadangan di luar file yang akan di-commit jika perubahan berisiko.
3. Uji halaman utama dan editor setelah perubahan.
4. Periksa `git diff` sebelum melakukan commit.
5. Jangan memasukkan token, password, atau file rahasia ke repository.

## Repository

Source code proyek disimpan di:

**[github.com/williamcassanova/kinstead](https://github.com/williamcassanova/kinstead)**

---

<p align="center">
  <strong>KINSTEAD — Create your world.</strong><br>
  <sub>Dikembangkan secara bertahap. Dokumentasi akan diperbarui mengikuti perkembangan proyek.</sub>
</p>
