# 🧾 KASIR ONLINE — POS dengan Google Sheets sebagai Database

Aplikasi Point of Sale responsif (HP / Tablet / PC) dengan **Google Apps Script** sebagai
back-end dan **Google Spreadsheet** sebagai database. Tanpa build step, tanpa server berbayar.

## Daftar Isi
1. [Struktur File](#1-struktur-file)
2. [Skema Database Spreadsheet](#2-skema-database-spreadsheet)
3. [Pemasangan Langkah demi Langkah (Google Apps Script)](#3-pemasangan-langkah-demi-langkah)
4. [Deploy ke Publik + Akses HP](#4-deploy-ke-publik)
5. [Hosting Alternatif (Netlify / Vercel)](#5-hosting-alternatif-netlify--vercel)
6. [Setelah Deploy: Konfigurasi & Akun Bawaan](#6-setelah-deploy)
7. [Cara Pakai Singkat](#7-cara-pakai-singkat)
8. [Mode Offline-First](#8-mode-offline-first)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Struktur File

```
Kasir Online Fullstack/
├── Code.gs          ← Back-end Google Apps Script (API + akses spreadsheet)
├── index.html       ← Seluruh front-end (HTML + Tailwind CSS + JavaScript) dalam 1 file
└── DEPLOYMENT.md    ← Dokumen ini (panduan + skema database)
```

**Stack**
| Lapisan | Teknologi |
|---|---|
| Front-end | HTML5, Tailwind CSS (CDN), JavaScript ES6+, Chart.js 4 (grafik), SheetJS (ekspor Excel) |
| Back-end | Google Apps Script — 1 titik masuk `api(action, payload)` |
| Database | Google Spreadsheet (7 sheet) |
| Akses | Tanpa login — pembuka link otomatis jadi **Admin**; sesi token di Script Properties (24 jam) |

---

## 2. Skema Database Spreadsheet

Jalankan fungsi **`setupSpreadsheet()`** sekali — seluruh sheet, header, format, dropdown,
data contoh, dan akun awal dibuat otomatis. Struktur berikut adalah referensinya
(**baris 1 = header, persis seperti definisi**):

### Sheet `Produk`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `ID_Produk` | teks | Kunci unik, contoh `PRD-Mxxxx` (dibuat otomatis) |
| `Kode_Barcode` | teks | Opsional — kolom warisan, **tidak dipakai UI** (kasir angkringan tanpa barcode) |
| `Nama_Produk` | teks | Nama barang |
| `Kategori` | teks | Nama kategori (relasi ke sheet `Kategori` lewat nama) |
| `Harga_Beli` | angka | HPP / modal |
| `Harga_Jual` | angka | Harga jual |
| `Stok` | angka | Berkurang otomatis saat transaksi |
| `Satuan` | teks | pcs / botol / kg / … |
| `Minimal_Stok` | angka | Batas peringatan stok menipis |
| `Status_Aktif` | teks | `Aktif` / `Nonaktif` (dropdown) |
| `Jenis_Produk` | teks | **Kepemilikan Produk** — `Normal` = *Milik Sendiri* (default) / `Titipan` = *Titipan Orang Lain*; titipan **tidak** dikelola stoknya |
| `Pemilik_Titipan` | teks | Nama penitip; **wajib** diisi bila kepemilikan = Titipan Orang Lain |

> **Instalasi lama:** tidak perlu menjalankan setup ulang — saat dibuka,
> `bootstrap_()` otomatis menambahkan dua kolom terakhir di atas ke sheet
> `Produk` yang sudah ada, me-reset stok negatif (kesalahan lama) ke 0, dan
> memperbaiki kepemilikan: baris bernama penitip namun `Jenis_Produk` kosong
> otomatis menjadi `Titipan` (stok/minimal dipaksa 0). Produk titipan yang
> penitipnya belum terisi sama sekali: cukup **Edit sekali** → pilih
> `Kepemilikan = Titipan Orang Lain` + isi penitip → Simpan.

### Sheet `Kategori`
| Kolom | Tipe |
|---|---|
| `ID_Kategori` | teks (`KTG-…`) |
| `Nama_Kategori` | teks (unik) |

### Sheet `Transaksi`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `No_Faktur` | teks | Kunci unik & idempoten, format `INVyyyymmdd-HHMMSSxx` |
| `Tanggal_Waktu` | teks `yyyy-MM-dd HH:mm:ss` | Waktu server (zona spreadsheet) |
| `Total_Belanja` | angka | Σ subtotal item (setelah diskon per item) |
| `Diskon_Global` | angka | Diskon transaksi (persen/rupiah) |
| `Pajak` | angka | PPN/PB1 |
| `Total_Akhir` | angka | Yang dibayar pelanggan |
| `Jumlah_Bayar` | angka | Uang diterima |
| `Kembalian` | angka | |
| `Metode_Pembayaran` | teks | `Tunai` / `QRIS` (riwayat lama bisa berisi `Transfer` / `Debit`) |
| `ID_Kasir` | teks | `ID_User` pelaku transaksi |
| `Catatan` | teks | |

> Rumus: `Total_Akhir = Total_Belanja − Diskon_Global + Pajak`,
> `Pajak = round((Total_Belanja − Diskon_Global) × %)`

### Sheet `Detail_Transaksi`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `ID_Detail` | teks (`DT-…`) | |
| `No_Faktur` | teks | Relasi ke `Transaksi` |
| `ID_Produk` | teks | Relasi ke `Produk` |
| `Nama_Produk` | teks | Snapshot nama saat jual |
| `Harga_Satuan` | angka | Harga jual saat itu |
| `Jumlah_Qty` | angka | |
| `Subtotal` | angka | `(Harga × Qty) − diskon item` |
| `Profit_Bersih` | angka | `(Harga − HPP) × Qty − diskon item` — dipakai laporan laba |

### Sheet `Pelanggan`
| Kolom | Tipe |
|---|---|
| `ID_Pelanggan` | teks (`PLG-…`) |
| `Nama_Pelanggan` | teks |
| `No_HP` | teks (format `628…`, untuk kirim struk WhatsApp) |
| `Poin_Reward` | angka (1 poin / Rp 10.000, bisa diubah di Pengaturan) |

### Sheet `Pengeluaran_Operasional`
| Kolom | Tipe |
|---|---|
| `ID_Pengeluaran` | teks (`PGL-…`) |
| `Tanggal` | teks `yyyy-MM-dd` |
| `Kategori_Pengeluaran` | teks (Listrik, Air, Gaji Harian, Sewa, Operasional, Pembungkusan, …) |
| `Nominal` | angka |
| `Keterangan` | teks |

### Sheet `Pengguna`
| Kolom | Tipe |
|---|---|
| `ID_User` | teks (`USR-…`) |
| `Username` | teks (unik) |
| `Password_Hash` | teks `sha256$…` (BUKAN password polos) |
| `Nama_Lengkap` | teks |
| `Peran` | teks `Admin` / `Kasir` (dropdown) |

**Catatan desain**
- Semua tanggal disimpan sebagai **teks ISO** agar bebas masalah zona waktu GAS.
- Profit disimpan per baris detail sehingga laporan laba tetap akurat meski HPP produk
  berubah di kemudian hari.
- `No_Faktur` bersifat **idempoten** — transaksi offline yang dikirim dua kali tidak dobel.

---

## 3. Pemasangan Langkah demi Langkah

### Langkah 1 — Buat Spreadsheet (opsional)
Buat Google Spreadsheet baru, beri nama mis. `Database Kasir Online`.
*(Opsional: script juga bisa membuat spreadsheet sendiri otomatis.)*

### Langkah 2 — Buka Apps Script
Dari spreadsheet: **Extensions → Apps Script**.
Atau buka <https://script.google.com> → **New project**.

### Langkah 3 — Tempel kode
1. Ganti isi file `Code.gs` dengan isi file **`Code.gs`** dari folder ini.
2. Klik ikon **+** di Files → **HTML** → beri nama persis **`index`**
   (tanpa `.html`) → tempel isi **`index.html`**.
3. **Save** (💾).

### Langkah 4 — Inisialisasi database
Di toolbar Apps Script, pilih fungsi **`setupSpreadsheet`** → **Run**.
> Izinkan akses saat diminta (*Review permissions → Advanced → Go to project (unsafe)* —
> wajar karena script baru Anda sendiri).

Hasil: 7 sheet terbentuk + 8 produk contoh + kategori + pelanggan umum.

### Langkah 5 — Cek versi proyek
**Project Settings (⚙) → show "appsscript.json"** → pastikan zona waktu sesuai
mis. `"timeZone": "Asia/Jakarta"`. (Ini menentukan tanggal laporan.)

### Langkah 6 — Deploy Web App
1. **Deploy → New deployment**
2. Klik ikon ⚙ → pilih **Web app**
3. Isi:
   - **Description**: `v1`
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone** ← agar bisa dibuka dari HP tanpa login Google
4. **Deploy** → salin **Web app URL**
   (`https://script.google.com/macros/s/AKf…/exec`)

### Langkah 7 — Buka aplikasi
Buka URL tersebut → langsung masuk sebagai **Admin** (tanpa halaman login) → selesai. 🎉

> **Update kode:** setelah mengubah kode → **Deploy → Manage deployments → ✏️ Edit →
> Version: New version → Deploy** (URL tetap sama).

---

## 4. Deploy ke Publik

| Kebutuhan | Cara |
|---|---|
| Dipakai bersama di 1 toko | Bagikan URL `/exec` (siapa pun yang punya link bisa akses) |
| Dipasang di HP sebagai aplikasi | Buka via Chrome HP → menu ⋮ → **Add to Home screen** |
| QR akses kasir | Buat QR dari URL `/exec` (mis. via qr-code-generator.com) |
| Perlu "install" PWA penuh | Tambahkan `manifest.webmanifest` + service worker (opsional, panduan di bawah) |

**Pasang di iPad/HP kasir:** buka URL → *Add to Home screen* → ikon aplikasi muncul,
tampilan sudah responsif (bottom-nav di HP, sidebar di tablet/PC).

**Keamanan wajib**
- **Siapa pun yang punya URL otomatis menjadi Admin** — bagikan hanya ke
  perangkat toko, jangan sebarkan ke publik yang tidak dikenal.
- Script hanya boleh dieksekusi oleh Anda (*Execute as: Me*).

---

## 5. Hosting Alternatif (Netlify / Vercel)

`index.html` berjalan di hosting statis mana pun, **tetapi** layer API-nya memakai
`google.script.run` yang hanya hidup di dalam iframe Apps Script.

Jika ingin statis-hosting + backend GAS, ganti **satu fungsi** `call()` di `index.html`
dengan versi REST ini, lalu deploy `index.html` ke Netlify/Vercel:

```js
const GAS_URL = 'https://script.google.com/macros/s/AKf.../exec'; // URL /exec Anda
function call(action, payload) {
  const data = Object.assign({ token: state.token }, payload || {});
  return fetch(GAS_URL + '?action=' + encodeURIComponent(action), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // hindari preflight CORS
    body: JSON.stringify(data)
  })
    .then(r => r.json())
    .then(res => res && res.ok ? res.data : Promise.reject(new Error(res && res.pesan || 'Gagal')));
}
```

Tambahkan endpoint POST ke `Code.gs` (bagian paling bawah):

```js
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  return ContentService.createTextOutput(JSON.stringify(api(body.action, body)))
    .setMimeType(ContentService.MimeType.JSON);
}
```
*(GET juga bisa: `?action=bootstrap&payload={…}` — tambahkan `doGet` yang memanggil `api`.)*

> Alternatif paling mudah & tetap resmi: **tetap pakai GAS Web App** (Langkah 6),
> karena seluruh fitur (sesi Admin otomatis, sync offline, cetak) sudah teruji di jalur itu.

---

## 6. Setelah Deploy

| Item | Nilai awal | Ubah di mana |
|---|---|---|
| Hak akses pembuka link | Otomatis **Admin** (tanpa login) | Tidak ada gerbang masuk |
| Nama toko / alamat / footer struk | default | Menu **Pengaturan** |
| Pajak (PPN/PB1) | 11 % | Menu **Pengaturan** → disimpan per perangkat |
| Poin reward | 1 poin / Rp 10.000 | Menu **Pengaturan** |
| Lebar struk | 58 mm / 80 mm | Menu **Pengaturan** |
| Salt hash password | `KASIRPOS-2026-S4LT` | `APP.SALT` di `Code.gs` (ubah SEBELUM isi data) |

**Hak akses**
- Setiap pembuka link otomatis memperoleh sesi **Admin** — seluruh menu
  (Kasir, Produk, Pengeluaran, Laporan, Pengguna, Pengaturan) tampil.
- Sheet `Pengguna` beserta aksi `login` lama masih ada di server untuk
  kompatibilitas API, tetapi tidak dipakai lagi oleh halaman.

---

## 7. Cara Pakai Singkat

**Modul Kasir**
- Ketik nama/kategori untuk mencari, lalu tekan **Enter** → item langsung masuk
  keranjang (cocok unik).
- Klik kartu produk = tambah; ubah qty `−/+`, catatan transaksi.
  Pelanggan selalu **Pelanggan Umum** (nama "Pelanggan Umum" tampil di struk —
  tidak ditampilkan lagi di box keranjang); pajak mengikuti Pengaturan
  (default 0); tanpa input diskon di keranjang.
- Pilih metode bayar (**Tunai** / **QRIS**) → input uang + tombol cepat
  (Uang Pas, 50rb, 100rb, …) → **Kembalian tampil real-time** → **Proses Pembayaran**.
- Checkbox **Cetak struk setelah bayar** di box keranjang: bila dicentang, struk
  langsung tercetak otomatis setelah pembayaran; **default tidak dicentang**
  (tidak ada cetak otomatis).
- Struk termal 58/80 mm siap **Cetak / Simpan PDF** dan **Kirim ke WhatsApp**
  (membuka WhatsApp berisi teks struk — pilih kontak tujuan di sana).
- Pintasan: **F2** = fokus pencarian, **Enter** = tambah produk yang cocok unik,
  **Esc** = tutup modal/keranjang.
- **Tampilan HP (smartphone)**: navigasi bar bawah; katalog 2 kolom rapi.
  Keranjang memakai **bar ringkas selebar layar** (`🧺 jumlah item • total`)
  di atas bar navigasi — hanya tampil bila keranjang berisi — lalu terbuka
  sebagai **bottom sheet setinggi ±58% layar** sehingga katalog tetap
  terlihat & bisa diklik di atasnya (bottom-nav tertutup saat sheet terbuka).
  Header keranjang cukup 1 baris, baris Subtotal & Pajak digabung (baris Pajak
  otomatis disembunyikan bila pajak 0), tombol qty besar untuk sentuhan,
  sheet menghormati safe-area/notch, input otomatis 16px mencegah zoom iOS,
  dan fokus pencarian otomatis hanya di desktop (keyboard tidak langsung
  terbuka saat buka aplikasi di HP).

**Modul Produk & Stok** — tambah/edit/hapus/nonaktifkan, peringatan otomatis
`Stok ≤ Minimal_Stok`, nilai aset inventaris. Input barang memakai dua halaman khusus:

- **Halaman Tambah Produk** (`+ Tambah Produk` di toolbar / sidebar / menu Lainnya) —
  form lebar berisi chip kategori, pratinjau kartu produk, dan **kalkulator laba**
  (laba per item, margin %, nilai stok awal) + peringatan bila harga jual < HPP.
  Tombol **Simpan** kembali ke daftar; **Simpan & Tambah Lagi** tetap di halaman
  untuk input massal. Tombol **Edit** pada tabel membuka halaman yang sama mode edit.
- **Halaman Tambah Stok** (`📥 Tambah Stok` di toolbar / sidebar / menu Lainnya) —
  pilih produk lewat pencarian, lihat stok/HPP/minimal/satuan saat ini, isi jumlah
  masuk dengan tombol cepat `+1 +5 +10 +50`, opsional **HPP baru**, ringkasan
  *stok setelah restok* & *nilai barang masuk*, daftar **Stok Menipis** yang bisa
  diklik langsung, serta konfirmasi hasil setelah tersimpan.
- **Produk Titipan** — pilih `Kepemilikan = Titipan Orang Lain` di form Tambah
  Produk lalu isi **Nama Penitip** (wajib). Produk ini: kartu kasir berlabel 📦 + nama penitip,
  **tanpa stok opname** (stok/minimal dipaksa 0, tidak boleh Restok, tidak
  dipotong saat dijual, tidak pernah masuk peringatan *Stok Menipis*), HPP =
  harga yang dibayar ke penitip. Penjualannya tetap tercatat & tampil di
  **Laporan → kartu Laporan Produk Titipan**: semua penitip yang ada di database
  tampil (walau belum terjual pada periode) beserta daftar produknya, unit,
  omzet, **HPP ke penitip**, keuntungan, dan baris **Total HPP diserahkan**;
  kartu tersembunyi hanya bila tidak ada produk titipan sama sekali. Rincian
  yang sama tersedia di sheet Excel **Titipan**, sedangkan **Rugi-Laba** &
  **Ringkasan Excel** hanya menampilkan penitip yang memiliki HPP periode ini.
  Titipan **tidak termasuk aset toko**:
  daftar Stok & Nilai Aset di laporan (maupun total "Nilai aset inventaris"
  di halaman Produk) mengecualikannya — meski kolom Stok terisi angka,
  nilainya tidak pernah dihitung. Penjualan yang melebihi stok pun
  **tidak pernah menghasilkan stok minus** (di-clamp ke 0 + peringatan).

**Modul Pengeluaran** — catat biaya harian (listrik, gaji, pembungkusan, …) agar
laba bersih akurat.

**Modul Laporan** — preset Hari Ini / Kemarin / 7 Hari / 30 Hari / Bulan Ini /
Bulan Lalu + rentang bebas:
- **Hari laporan berganti pukul 04.00** (jam `HARI_BISNIS` di Code.gs /
  fungsi `tanggalBisnis` di index.html): angkringan buka 18.00 — tutup ~02.00,
  jadi penjualan dini hari (00.00–03.59) tetap tercatat pada **hari sebelumnya**.
  Preset "Hari Ini" otomatis memakai tanggal hari bisnis berjalan.
- Kartu: Omzet, Jumlah Transaksi, Rata-rata (basket size), Laba Kotor, Pengeluaran, **Laba Bersih**
- Grafik tren Omzet & Laba (harian; otomatis per-bulan bila rentang > 45 hari) + donut metode bayar
- Tabel: Produk Terlaris, Rincian Pembayaran, **Rugi-Laba (Income Statement)**
  — HPP dipecah: `HPP produk normal` + satu baris per penitip
  (`Titipan Si A — diserahkan saat tutup`, dst.) untuk mudah menutup uang
  titipan, Pengeluaran, Transaksi Terakhir, Stok & Nilai Aset (produk normal
  saja), **Laporan Produk Titipan** (semua penitip dari database — termasuk
  yang belum terjual — dengan unit, omzet, HPP ke penitip, keuntungan, plus
  baris Total HPP diserahkan; otomatis tersembunyi bila tak ada produk titipan)
- Tombol **⬇ Excel** (8 sheet .xlsx) dan **🖨 Cetak / PDF** (via dialog print browser)

---

## 8. Mode Offline-First

| Keadaan | Perilaku |
|---|---|
| Online | Transaksi langsung tersimpan ke spreadsheet |
| Koneksi putus | Transaksi tetap bisa diproses → masuk **antrean lokal** (localStorage), struk bertanda *MENUNGGU SINKRON* |
| Koneksi kembali | Otomatis kirim antrean (`transaksi.sync`), indikator berubah **Online**; bisa juga tombol **Sinkron Sekarang** di Pengaturan |
| Buka aplikasi tanpa internet | Data terakhir dari **cache lokal** tetap tampil (mode baca) |

Idempoten `No_Faktur` menjamin antrean yang terkirim dua kali **tidak pernah menggandakan
transaksi maupun mengurangi stok dua kali**.

---

## 9. Troubleshooting

| Gejala | Solusi |
|---|---|
| `Sheet "…" tidak ditemukan` | Jalankan ulang `setupSpreadsheet()` |
| Halaman kosong setelah deploy | Pastikan file HTML bernama persis **`index`** |
| Layar boot "Gagal memuat aplikasi" | Jalankan `setupSpreadsheet()` (sheet `Pengguna` masih kosong) lalu buka ulang URL |
| (Lama) Login "Password salah" setelah ganti `APP.SALT` | Tidak berpengaruh — halaman sudah tanpa login; aksi `login` hanya untuk API lama |
| Laporan tanggal meleset | Setel zona waktu project Apps Script (⚙ Project Settings) |
| Cetak keluar 1 halaman kosong | Di dialog print: aktifkan **Background graphics**, margin **None/default**, ukuran kertas ikut struk |
| Transaksi offline tidak masuk | Pengaturan → cek jumlah antrean → **Sinkron Sekarang** (pastikan benar-benar online) |
| Terlalu lambat saat data ribuan baris | Arsipkan sheet `Transaksi`/`Detail_Transaksi` lama per bulan ke spreadsheet lain (rawan limit kuota GAS ~30 ribu sel/hari) |
| Ingin reset total | Buat spreadsheet baru → kosongkan `PropertiesService` (`Setup script properties` hapus `SS_ID`) → jalankan `setupSpreadsheet()` |

**Kuota:** Apps Script gratis normal untuk 1 toko (≈500–2000 transaksi/bulan sangat aman).
Pantau di <https://script.google.com> → **Executions**.

---

*Dirancang sebagai single-source-of-truth: semua kalkulasi (pajak, laba, profit, poin)
dihitung ulang oleh back-end — front-end hanya menampilkan dan mengantre.*
# 🧾 KASIR ONLINE — POS dengan Google Sheets sebagai Database

Aplikasi Point of Sale responsif (HP / Tablet / PC) dengan **Google Apps Script** sebagai
back-end dan **Google Spreadsheet** sebagai database. Tanpa build step, tanpa server berbayar.

## Daftar Isi
1. [Struktur File](#1-struktur-file)
2. [Skema Database Spreadsheet](#2-skema-database-spreadsheet)
3. [Pemasangan Langkah demi Langkah (Google Apps Script)](#3-pemasangan-langkah-demi-langkah)
4. [Deploy ke Publik + Akses HP](#4-deploy-ke-publik)
5. [Hosting Alternatif (Netlify / Vercel)](#5-hosting-alternatif-netlify--vercel)
6. [Setelah Deploy: Konfigurasi & Akun Bawaan](#6-setelah-deploy)
7. [Cara Pakai Singkat](#7-cara-pakai-singkat)
8. [Mode Offline-First](#8-mode-offline-first)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Struktur File

```
Kasir Online Fullstack/
├── Code.gs          ← Back-end Google Apps Script (API + akses spreadsheet)
├── index.html       ← Seluruh front-end (HTML + Tailwind CSS + JavaScript) dalam 1 file
└── DEPLOYMENT.md    ← Dokumen ini (panduan + skema database)
```

**Stack**
| Lapisan | Teknologi |
|---|---|
| Front-end | HTML5, Tailwind CSS (CDN), JavaScript ES6+, Chart.js 4 (grafik), SheetJS (ekspor Excel) |
| Back-end | Google Apps Script — 1 titik masuk `api(action, payload)` |
| Database | Google Spreadsheet (7 sheet) |
| Akses | Tanpa login — pembuka link otomatis jadi **Admin**; sesi token di Script Properties (24 jam) |

---

## 2. Skema Database Spreadsheet

Jalankan fungsi **`setupSpreadsheet()`** sekali — seluruh sheet, header, format, dropdown,
data contoh, dan akun awal dibuat otomatis. Struktur berikut adalah referensinya
(**baris 1 = header, persis seperti definisi**):

### Sheet `Produk`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `ID_Produk` | teks | Kunci unik, contoh `PRD-Mxxxx` (dibuat otomatis) |
| `Kode_Barcode` | teks | Opsional — kolom warisan, **tidak dipakai UI** (kasir angkringan tanpa barcode) |
| `Nama_Produk` | teks | Nama barang |
| `Kategori` | teks | Nama kategori (relasi ke sheet `Kategori` lewat nama) |
| `Harga_Beli` | angka | HPP / modal |
| `Harga_Jual` | angka | Harga jual |
| `Stok` | angka | Berkurang otomatis saat transaksi |
| `Satuan` | teks | pcs / botol / kg / … |
| `Minimal_Stok` | angka | Batas peringatan stok menipis |
| `Status_Aktif` | teks | `Aktif` / `Nonaktif` (dropdown) |
| `Jenis_Produk` | teks | **Kepemilikan Produk** — `Normal` = *Milik Sendiri* (default) / `Titipan` = *Titipan Orang Lain*; titipan **tidak** dikelola stoknya |
| `Pemilik_Titipan` | teks | Nama penitip; **wajib** diisi bila kepemilikan = Titipan Orang Lain |

> **Instalasi lama:** tidak perlu menjalankan setup ulang — saat dibuka,
> `bootstrap_()` otomatis menambahkan dua kolom terakhir di atas ke sheet
> `Produk` yang sudah ada, me-reset stok negatif (kesalahan lama) ke 0, dan
> memperbaiki kepemilikan: baris bernama penitip namun `Jenis_Produk` kosong
> otomatis menjadi `Titipan` (stok/minimal dipaksa 0). Produk titipan yang
> penitipnya belum terisi sama sekali: cukup **Edit sekali** → pilih
> `Kepemilikan = Titipan Orang Lain` + isi penitip → Simpan.

### Sheet `Kategori`
| Kolom | Tipe |
|---|---|
| `ID_Kategori` | teks (`KTG-…`) |
| `Nama_Kategori` | teks (unik) |

### Sheet `Transaksi`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `No_Faktur` | teks | Kunci unik & idempoten, format `INVyyyymmdd-HHMMSSxx` |
| `Tanggal_Waktu` | teks `yyyy-MM-dd HH:mm:ss` | Waktu server (zona spreadsheet) |
| `Total_Belanja` | angka | Σ subtotal item (setelah diskon per item) |
| `Diskon_Global` | angka | Diskon transaksi (persen/rupiah) |
| `Pajak` | angka | PPN/PB1 |
| `Total_Akhir` | angka | Yang dibayar pelanggan |
| `Jumlah_Bayar` | angka | Uang diterima |
| `Kembalian` | angka | |
| `Metode_Pembayaran` | teks | `Tunai` / `QRIS` (riwayat lama bisa berisi `Transfer` / `Debit`) |
| `ID_Kasir` | teks | `ID_User` pelaku transaksi |
| `Catatan` | teks | |

> Rumus: `Total_Akhir = Total_Belanja − Diskon_Global + Pajak`,
> `Pajak = round((Total_Belanja − Diskon_Global) × %)`

### Sheet `Detail_Transaksi`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `ID_Detail` | teks (`DT-…`) | |
| `No_Faktur` | teks | Relasi ke `Transaksi` |
| `ID_Produk` | teks | Relasi ke `Produk` |
| `Nama_Produk` | teks | Snapshot nama saat jual |
| `Harga_Satuan` | angka | Harga jual saat itu |
| `Jumlah_Qty` | angka | |
| `Subtotal` | angka | `(Harga × Qty) − diskon item` |
| `Profit_Bersih` | angka | `(Harga − HPP) × Qty − diskon item` — dipakai laporan laba |

### Sheet `Pelanggan`
| Kolom | Tipe |
|---|---|
| `ID_Pelanggan` | teks (`PLG-…`) |
| `Nama_Pelanggan` | teks |
| `No_HP` | teks (format `628…`, untuk kirim struk WhatsApp) |
| `Poin_Reward` | angka (1 poin / Rp 10.000, bisa diubah di Pengaturan) |

### Sheet `Pengeluaran_Operasional`
| Kolom | Tipe |
|---|---|
| `ID_Pengeluaran` | teks (`PGL-…`) |
| `Tanggal` | teks `yyyy-MM-dd` |
| `Kategori_Pengeluaran` | teks (Listrik, Air, Gaji Harian, Sewa, Operasional, Pembungkusan, …) |
| `Nominal` | angka |
| `Keterangan` | teks |

### Sheet `Pengguna`
| Kolom | Tipe |
|---|---|
| `ID_User` | teks (`USR-…`) |
| `Username` | teks (unik) |
| `Password_Hash` | teks `sha256$…` (BUKAN password polos) |
| `Nama_Lengkap` | teks |
| `Peran` | teks `Admin` / `Kasir` (dropdown) |

**Catatan desain**
- Semua tanggal disimpan sebagai **teks ISO** agar bebas masalah zona waktu GAS.
- Profit disimpan per baris detail sehingga laporan laba tetap akurat meski HPP produk
  berubah di kemudian hari.
- `No_Faktur` bersifat **idempoten** — transaksi offline yang dikirim dua kali tidak dobel.

---

## 3. Pemasangan Langkah demi Langkah

### Langkah 1 — Buat Spreadsheet (opsional)
Buat Google Spreadsheet baru, beri nama mis. `Database Kasir Online`.
*(Opsional: script juga bisa membuat spreadsheet sendiri otomatis.)*

### Langkah 2 — Buka Apps Script
Dari spreadsheet: **Extensions → Apps Script**.
Atau buka <https://script.google.com> → **New project**.

### Langkah 3 — Tempel kode
1. Ganti isi file `Code.gs` dengan isi file **`Code.gs`** dari folder ini.
2. Klik ikon **+** di Files → **HTML** → beri nama persis **`index`**
   (tanpa `.html`) → tempel isi **`index.html`**.
3. **Save** (💾).

### Langkah 4 — Inisialisasi database
Di toolbar Apps Script, pilih fungsi **`setupSpreadsheet`** → **Run**.
> Izinkan akses saat diminta (*Review permissions → Advanced → Go to project (unsafe)* —
> wajar karena script baru Anda sendiri).

Hasil: 7 sheet terbentuk + 8 produk contoh + kategori + pelanggan umum.

### Langkah 5 — Cek versi proyek
**Project Settings (⚙) → show "appsscript.json"** → pastikan zona waktu sesuai
mis. `"timeZone": "Asia/Jakarta"`. (Ini menentukan tanggal laporan.)

### Langkah 6 — Deploy Web App
1. **Deploy → New deployment**
2. Klik ikon ⚙ → pilih **Web app**
3. Isi:
   - **Description**: `v1`
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone** ← agar bisa dibuka dari HP tanpa login Google
4. **Deploy** → salin **Web app URL**
   (`https://script.google.com/macros/s/AKf…/exec`)

### Langkah 7 — Buka aplikasi
Buka URL tersebut → langsung masuk sebagai **Admin** (tanpa halaman login) → selesai. 🎉

> **Update kode:** setelah mengubah kode → **Deploy → Manage deployments → ✏️ Edit →
> Version: New version → Deploy** (URL tetap sama).

---

## 4. Deploy ke Publik

| Kebutuhan | Cara |
|---|---|
| Dipakai bersama di 1 toko | Bagikan URL `/exec` (siapa pun yang punya link bisa akses) |
| Dipasang di HP sebagai aplikasi | Buka via Chrome HP → menu ⋮ → **Add to Home screen** |
| QR akses kasir | Buat QR dari URL `/exec` (mis. via qr-code-generator.com) |
| Perlu "install" PWA penuh | Tambahkan `manifest.webmanifest` + service worker (opsional, panduan di bawah) |

**Pasang di iPad/HP kasir:** buka URL → *Add to Home screen* → ikon aplikasi muncul,
tampilan sudah responsif (bottom-nav di HP, sidebar di tablet/PC).

**Keamanan wajib**
- **Siapa pun yang punya URL otomatis menjadi Admin** — bagikan hanya ke
  perangkat toko, jangan sebarkan ke publik yang tidak dikenal.
- Script hanya boleh dieksekusi oleh Anda (*Execute as: Me*).

---

## 5. Hosting Alternatif (Netlify / Vercel)

`index.html` berjalan di hosting statis mana pun, **tetapi** layer API-nya memakai
`google.script.run` yang hanya hidup di dalam iframe Apps Script.

Jika ingin statis-hosting + backend GAS, ganti **satu fungsi** `call()` di `index.html`
dengan versi REST ini, lalu deploy `index.html` ke Netlify/Vercel:

```js
const GAS_URL = 'https://script.google.com/macros/s/AKf.../exec'; // URL /exec Anda
function call(action, payload) {
  const data = Object.assign({ token: state.token }, payload || {});
  return fetch(GAS_URL + '?action=' + encodeURIComponent(action), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // hindari preflight CORS
    body: JSON.stringify(data)
  })
    .then(r => r.json())
    .then(res => res && res.ok ? res.data : Promise.reject(new Error(res && res.pesan || 'Gagal')));
}
```

Tambahkan endpoint POST ke `Code.gs` (bagian paling bawah):

```js
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  return ContentService.createTextOutput(JSON.stringify(api(body.action, body)))
    .setMimeType(ContentService.MimeType.JSON);
}
```
*(GET juga bisa: `?action=bootstrap&payload={…}` — tambahkan `doGet` yang memanggil `api`.)*

> Alternatif paling mudah & tetap resmi: **tetap pakai GAS Web App** (Langkah 6),
> karena seluruh fitur (sesi Admin otomatis, sync offline, cetak) sudah teruji di jalur itu.

---

## 6. Setelah Deploy

| Item | Nilai awal | Ubah di mana |
|---|---|---|
| Hak akses pembuka link | Otomatis **Admin** (tanpa login) | Tidak ada gerbang masuk |
| Nama toko / alamat / footer struk | default | Menu **Pengaturan** |
| Pajak (PPN/PB1) | 11 % | Menu **Pengaturan** → disimpan per perangkat |
| Poin reward | 1 poin / Rp 10.000 | Menu **Pengaturan** |
| Lebar struk | 58 mm / 80 mm | Menu **Pengaturan** |
| Salt hash password | `KASIRPOS-2026-S4LT` | `APP.SALT` di `Code.gs` (ubah SEBELUM isi data) |

**Hak akses**
- Setiap pembuka link otomatis memperoleh sesi **Admin** — seluruh menu
  (Kasir, Produk, Pengeluaran, Laporan, Pengguna, Pengaturan) tampil.
- Sheet `Pengguna` beserta aksi `login` lama masih ada di server untuk
  kompatibilitas API, tetapi tidak dipakai lagi oleh halaman.

---

## 7. Cara Pakai Singkat

**Modul Kasir**
- Ketik nama/kategori untuk mencari, lalu tekan **Enter** → item langsung masuk
  keranjang (cocok unik).
- Klik kartu produk = tambah; ubah qty `−/+`, catatan transaksi.
  Pelanggan selalu **Pelanggan Umum** (nama "Pelanggan Umum" tampil di struk —
  tidak ditampilkan lagi di box keranjang); pajak mengikuti Pengaturan
  (default 0); tanpa input diskon di keranjang.
- Pilih metode bayar (**Tunai** / **QRIS**) → input uang + tombol cepat
  (Uang Pas, 50rb, 100rb, …) → **Kembalian tampil real-time** → **Proses Pembayaran**.
- Checkbox **Cetak struk setelah bayar** di box keranjang: bila dicentang, struk
  langsung tercetak otomatis setelah pembayaran; **default tidak dicentang**
  (tidak ada cetak otomatis).
- Struk termal 58/80 mm siap **Cetak / Simpan PDF** dan **Kirim ke WhatsApp**
  (membuka WhatsApp berisi teks struk — pilih kontak tujuan di sana).
- Pintasan: **F2** = fokus pencarian, **Enter** = tambah produk yang cocok unik,
  **Esc** = tutup modal/keranjang.
- **Tampilan HP (smartphone)**: navigasi bar bawah; katalog 2 kolom rapi.
  Keranjang memakai **bar ringkas selebar layar** (`🧺 jumlah item • total`)
  di atas bar navigasi — hanya tampil bila keranjang berisi — lalu terbuka
  sebagai **bottom sheet setinggi ±58% layar** sehingga katalog tetap
  terlihat & bisa diklik di atasnya (bottom-nav tertutup saat sheet terbuka).
  Header keranjang cukup 1 baris, baris Subtotal & Pajak digabung (baris Pajak
  otomatis disembunyikan bila pajak 0), tombol qty besar untuk sentuhan,
  sheet menghormati safe-area/notch, input otomatis 16px mencegah zoom iOS,
  dan fokus pencarian otomatis hanya di desktop (keyboard tidak langsung
  terbuka saat buka aplikasi di HP).

**Modul Produk & Stok** — tambah/edit/hapus/nonaktifkan, peringatan otomatis
`Stok ≤ Minimal_Stok`, nilai aset inventaris. Input barang memakai dua halaman khusus:

- **Halaman Tambah Produk** (`+ Tambah Produk` di toolbar / sidebar / menu Lainnya) —
  form lebar berisi chip kategori, pratinjau kartu produk, dan **kalkulator laba**
  (laba per item, margin %, nilai stok awal) + peringatan bila harga jual < HPP.
  Tombol **Simpan** kembali ke daftar; **Simpan & Tambah Lagi** tetap di halaman
  untuk input massal. Tombol **Edit** pada tabel membuka halaman yang sama mode edit.
- **Halaman Tambah Stok** (`📥 Tambah Stok` di toolbar / sidebar / menu Lainnya) —
  pilih produk lewat pencarian, lihat stok/HPP/minimal/satuan saat ini, isi jumlah
  masuk dengan tombol cepat `+1 +5 +10 +50`, opsional **HPP baru**, ringkasan
  *stok setelah restok* & *nilai barang masuk*, daftar **Stok Menipis** yang bisa
  diklik langsung, serta konfirmasi hasil setelah tersimpan.
- **Produk Titipan** — pilih `Kepemilikan = Titipan Orang Lain` di form Tambah
  Produk lalu isi **Nama Penitip** (wajib). Produk ini: kartu kasir berlabel 📦 + nama penitip,
  **tanpa stok opname** (stok/minimal dipaksa 0, tidak boleh Restok, tidak
  dipotong saat dijual, tidak pernah masuk peringatan *Stok Menipis*), HPP =
  harga yang dibayar ke penitip. Penjualannya tetap tercatat & tampil di
  **Laporan → kartu Laporan Produk Titipan**: semua penitip yang ada di database
  tampil (walau belum terjual pada periode) beserta daftar produknya, unit,
  omzet, **HPP ke penitip**, keuntungan, dan baris **Total HPP diserahkan**;
  kartu tersembunyi hanya bila tidak ada produk titipan sama sekali. Rincian
  yang sama tersedia di sheet Excel **Titipan**, sedangkan **Rugi-Laba** &
  **Ringkasan Excel** hanya menampilkan penitip yang memiliki HPP periode ini.
  Titipan **tidak termasuk aset toko**:
  daftar Stok & Nilai Aset di laporan (maupun total "Nilai aset inventaris"
  di halaman Produk) mengecualikannya — meski kolom Stok terisi angka,
  nilainya tidak pernah dihitung. Penjualan yang melebihi stok pun
  **tidak pernah menghasilkan stok minus** (di-clamp ke 0 + peringatan).

**Modul Pengeluaran** — catat biaya harian (listrik, gaji, pembungkusan, …) agar
laba bersih akurat.

**Modul Laporan** — preset Hari Ini / Kemarin / 7 Hari / 30 Hari / Bulan Ini /
Bulan Lalu + rentang bebas:
- **Hari laporan berganti pukul 04.00** (jam `HARI_BISNIS` di Code.gs /
  fungsi `tanggalBisnis` di index.html): angkringan buka 18.00 — tutup ~02.00,
  jadi penjualan dini hari (00.00–03.59) tetap tercatat pada **hari sebelumnya**.
  Preset "Hari Ini" otomatis memakai tanggal hari bisnis berjalan.
- Kartu: Omzet, Jumlah Transaksi, Rata-rata (basket size), Laba Kotor, Pengeluaran, **Laba Bersih**
- Grafik tren Omzet & Laba (harian; otomatis per-bulan bila rentang > 45 hari) + donut metode bayar
- Tabel: Produk Terlaris, Rincian Pembayaran, **Rugi-Laba (Income Statement)**
  — HPP dipecah: `HPP produk normal` + satu baris per penitip
  (`Titipan Si A — diserahkan saat tutup`, dst.) untuk mudah menutup uang
  titipan, Pengeluaran, Transaksi Terakhir, Stok & Nilai Aset (produk normal
  saja), **Laporan Produk Titipan** (semua penitip dari database — termasuk
  yang belum terjual — dengan unit, omzet, HPP ke penitip, keuntungan, plus
  baris Total HPP diserahkan; otomatis tersembunyi bila tak ada produk titipan)
- Tombol **⬇ Excel** (8 sheet .xlsx) dan **🖨 Cetak / PDF** (via dialog print browser)

---

## 8. Mode Offline-First

| Keadaan | Perilaku |
|---|---|
| Online | Transaksi langsung tersimpan ke spreadsheet |
| Koneksi putus | Transaksi tetap bisa diproses → masuk **antrean lokal** (localStorage), struk bertanda *MENUNGGU SINKRON* |
| Koneksi kembali | Otomatis kirim antrean (`transaksi.sync`), indikator berubah **Online**; bisa juga tombol **Sinkron Sekarang** di Pengaturan |
| Buka aplikasi tanpa internet | Data terakhir dari **cache lokal** tetap tampil (mode baca) |

Idempoten `No_Faktur` menjamin antrean yang terkirim dua kali **tidak pernah menggandakan
transaksi maupun mengurangi stok dua kali**.

---

## 9. Troubleshooting

| Gejala | Solusi |
|---|---|
| `Sheet "…" tidak ditemukan` | Jalankan ulang `setupSpreadsheet()` |
| Halaman kosong setelah deploy | Pastikan file HTML bernama persis **`index`** |
| Layar boot "Gagal memuat aplikasi" | Jalankan `setupSpreadsheet()` (sheet `Pengguna` masih kosong) lalu buka ulang URL |
| (Lama) Login "Password salah" setelah ganti `APP.SALT` | Tidak berpengaruh — halaman sudah tanpa login; aksi `login` hanya untuk API lama |
| Laporan tanggal meleset | Setel zona waktu project Apps Script (⚙ Project Settings) |
| Cetak keluar 1 halaman kosong | Di dialog print: aktifkan **Background graphics**, margin **None/default**, ukuran kertas ikut struk |
| Transaksi offline tidak masuk | Pengaturan → cek jumlah antrean → **Sinkron Sekarang** (pastikan benar-benar online) |
| Terlalu lambat saat data ribuan baris | Arsipkan sheet `Transaksi`/`Detail_Transaksi` lama per bulan ke spreadsheet lain (rawan limit kuota GAS ~30 ribu sel/hari) |
| Ingin reset total | Buat spreadsheet baru → kosongkan `PropertiesService` (`Setup script properties` hapus `SS_ID`) → jalankan `setupSpreadsheet()` |

**Kuota:** Apps Script gratis normal untuk 1 toko (≈500–2000 transaksi/bulan sangat aman).
Pantau di <https://script.google.com> → **Executions**.

---

*Dirancang sebagai single-source-of-truth: semua kalkulasi (pajak, laba, profit, poin)
dihitung ulang oleh back-end — front-end hanya menampilkan dan mengantre.*
