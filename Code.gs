/**********************************************************************
 * KASIR ONLINE FULLSTACK - BACKEND GOOGLE APPS SCRIPT
 * File: Code.gs
 *
 * Aplikasi POS (Point of Sale) dengan Google Sheets sebagai database.
 * Seluruh akses data dilakukan lewat satu titik masuk: api(action, payload).
 *
 * Alur deploy singkat:
 *   1. Buat Google Spreadsheet baru (atau biarkan kosong, nanti dibuat otomatis)
 *   2. Extensions > Apps Script, tempel file ini + buat file HTML "index"
 *   3. Jalankan setupSpreadsheet() sekali untuk membuat semua sheet
 *   4. Deploy > New deployment > Web app
 **********************************************************************/

const APP = {
  /** Kosongkan jika script menempel (bound) pada spreadsheet.
   *  Isi dengan ID spreadsheet jika script standalone. */
  SPREADSHEET_ID: '',
  /** Garam untuk hash password (ubah sesuai kebutuhan). */
  SALT: 'KASIRPOS-2026-S4LT',
  /** Masa berlaku sesi login (jam). */
  SESI_JAM: 24,
  /** Skema seluruh sheet (baris 1 = header). */
  SKEMA: {
    'Produk': ['ID_Produk', 'Kode_Barcode', 'Nama_Produk', 'Kategori', 'Harga_Beli', 'Harga_Jual', 'Stok', 'Satuan', 'Minimal_Stok', 'Status_Aktif', 'Jenis_Produk', 'Pemilik_Titipan'],
    'Kategori': ['ID_Kategori', 'Nama_Kategori'],
    'Transaksi': ['No_Faktur', 'Tanggal_Waktu', 'Total_Belanja', 'Diskon_Global', 'Pajak', 'Total_Akhir', 'Jumlah_Bayar', 'Kembalian', 'Metode_Pembayaran', 'ID_Kasir', 'Catatan'],
    'Detail_Transaksi': ['ID_Detail', 'No_Faktur', 'ID_Produk', 'Nama_Produk', 'Harga_Satuan', 'Jumlah_Qty', 'Subtotal', 'Profit_Bersih'],
    'Pelanggan': ['ID_Pelanggan', 'Nama_Pelanggan', 'No_HP', 'Poin_Reward'],
    'Pengeluaran_Operasional': ['ID_Pengeluaran', 'Tanggal', 'Kategori_Pengeluaran', 'Nominal', 'Keterangan'],
    'Pengguna': ['ID_User', 'Username', 'Password_Hash', 'Nama_Lengkap', 'Peran']
  },
  /** Format kolom nominal (index 0-based per sheet). */
  FORMAT_RP: {
    'Produk': { 4: '#,##0', 5: '#,##0', 6: '#,##0' },
    'Transaksi': { 2: '#,##0', 3: '#,##0', 4: '#,##0', 5: '#,##0', 6: '#,##0', 7: '#,##0' },
    'Detail_Transaksi': { 4: '#,##0', 6: '#,##0', 7: '#,##0' },
    'Pengeluaran_Operasional': { 3: '#,##0' },
    'Pelanggan': { 3: '#,##0' }
  }
};

/* ====================================================================
 * 1. ENTRY POINT WEB APP
 * ==================================================================== */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Kasir Online - POS Berbasis Google Sheets')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menu muncul jika script terikat (bound) pada spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🛒 Kasir Online')
    .addItem('Setup / Perbaiki Database', 'setupSpreadsheet')
    .addItem('Buka Aplikasi Kasir (Web App)', 'bukaWebApp')
    .addToUi();
}

function bukaWebApp() {
  const ss = getSS_();
  SpreadsheetApp.getUi().alert('Buka URL deployment Web App dari menu Deploy > Manage deployments.\n\nDatabase: ' + ss.getUrl());
}

/* ====================================================================
 * 2. API DISPATCHER (satu-satunya titik masuk dari front-end)
 * ==================================================================== */

function api(action, payload) {
  try {
    payload = payload || {};
    if (action === 'login') return { ok: true, data: login_(payload) };
    if (action === 'auth.admin') return { ok: true, data: sesiAdmin_() };
    if (action === 'setup') return { ok: true, data: { pesan: setupSpreadsheet() } };

    const sesi = ambilSesi_(payload.token);

    switch (action) {
      case 'bootstrap':            return { ok: true, data: bootstrap_(sesi) };
      case 'transaksi.simpan':     return { ok: true, data: simpanTransaksi_(payload) };
      case 'transaksi.sync':       return { ok: true, data: syncTransaksi_(payload) };
      case 'produk.simpan':        return { ok: true, data: simpanProduk_(payload.data, sesi) };
      case 'produk.hapus':         return { ok: true, data: hapusProduk_(payload.id) };
      case 'produk.setStatus':      return { ok: true, data: setStatusProduk_(payload) };
      case 'produk.restok':         return { ok: true, data: restokProduk_(payload) };
      case 'kategori.simpan':      return { ok: true, data: simpanKategori_(payload.data) };
      case 'kategori.hapus':       return { ok: true, data: hapusKategori_(payload.id) };
      case 'pelanggan.simpan':     return { ok: true, data: simpanPelanggan_(payload.data) };
      case 'pelanggan.hapus':      return { ok: true, data: hapusPelanggan_(payload.id) };
      case 'pengeluaran.simpan':   wajibAdmin_(sesi); return { ok: true, data: simpanPengeluaran_(payload.data) };
      case 'pengeluaran.hapus':    wajibAdmin_(sesi); return { ok: true, data: hapusPengeluaran_(payload.id) };
      case 'pengeluaran.list':     wajibAdmin_(sesi); return { ok: true, data: listPengeluaran_(payload) };
      case 'laporan.get':          wajibAdmin_(sesi); return { ok: true, data: laporan_(payload) };
      case 'pengguna.list':        wajibAdmin_(sesi); return { ok: true, data: listPengguna_() };
      case 'pengguna.simpan':      wajibAdmin_(sesi); return { ok: true, data: simpanPengguna_(payload.data, sesi) };
      case 'pengguna.hapus':       wajibAdmin_(sesi); return { ok: true, data: hapusPengguna_(payload.id, sesi) };
      default: throw new Error('Aksi tidak dikenal: ' + action);
    }
  } catch (e) {
    return { ok: false, pesan: e && e.message ? e.message : String(e) };
  }
}

function wajibAdmin_(sesi) {
  if (sesi.peran !== 'Admin') throw new Error('Maaf, fitur ini hanya untuk akun Admin.');
}

/* ====================================================================
 * 3. AUTENTIKASI & SESI
 * ==================================================================== */

function login_(payload) {
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  if (!username || !password) throw new Error('Username dan password wajib diisi.');

  const users = readSheet_('Pengguna');
  const user = users.find(u => String(u.Username).toLowerCase() === username.toLowerCase());
  if (!user) throw new Error('Username tidak terdaftar.');
  if (String(user.Password_Hash) !== hash_(password)) throw new Error('Password salah.');

  const token = Utilities.getUuid();
  const sesi = {
    id: String(user.ID_User),
    username: String(user.Username),
    nama: String(user.Nama_Lengkap),
    peran: String(user.Peran),
    exp: Date.now() + APP.SESI_JAM * 3600000
  };
  PropertiesService.getScriptProperties().setProperty('SES_' + token, JSON.stringify(sesi));
  return { token: token, user: { id: sesi.id, username: sesi.username, nama: sesi.nama, peran: sesi.peran } };
}

/** Tanpa login — halaman tidak punya gerbang masuk: setiap pembuka link
 *  otomatis memperoleh sesi Admin (memakai akun Admin pertama di sheet
 *  Pengguna; bila sheet belum ada, lempar agar frontend menjalankan setup). */
function sesiAdmin_() {
  const users = readSheet_('Pengguna');
  const user = users.find(u => String(u.Peran) === 'Admin') || users[0];
  if (!user) throw new Error('Belum ada pengguna — jalankan setup dulu.');
  const token = Utilities.getUuid();
  const sesi = {
    id: String(user.ID_User),
    username: String(user.Username),
    nama: String(user.Nama_Lengkap),
    peran: 'Admin',
    exp: Date.now() + APP.SESI_JAM * 3600000
  };
  PropertiesService.getScriptProperties().setProperty('SES_' + token, JSON.stringify(sesi));
  return { token: token, user: { id: sesi.id, username: sesi.username, nama: sesi.nama, peran: sesi.peran } };
}

function ambilSesi_(token) {
  if (!token) throw new Error('Sesi tidak ditemukan, silakan login ulang.');
  const raw = PropertiesService.getScriptProperties().getProperty('SES_' + token);
  if (!raw) throw new Error('Sesi berakhir, silakan login ulang.');
  const sesi = JSON.parse(raw);
  if (Date.now() > sesi.exp) {
    PropertiesService.getScriptProperties().deleteProperty('SES_' + token);
    throw new Error('Sesi kedaluwarsa, silakan login ulang.');
  }
  return sesi;
}

function hash_(teks) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    APP.SALT + '::' + teks,
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  return 'sha256$' + hex;
}

/* ====================================================================
 * 4. AKSES SPREADSHEET (DATABASE)
 * ==================================================================== */

function tz_() { return Session.getScriptTimeZone(); }

function getSS_() {
  const aktif = SpreadsheetApp.getActiveSpreadsheet();
  if (aktif) return aktif;

  const id = APP.SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* lanjut */ }
  }
  const baru = SpreadsheetApp.create('Database Kasir Online');
  PropertiesService.getScriptProperties().setProperty('SS_ID', baru.getId());
  return baru;
}

/** Dipanggil manual dari editor / menu sheet. Idempoten. */
function setupSpreadsheet() {
  const ss = getSS_();
  const log = [];

  Object.keys(APP.SKEMA).forEach(nama => {
    const head = APP.SKEMA[nama];
    let sh = ss.getSheetByName(nama);
    if (!sh) { sh = ss.insertSheet(nama); log.push('Sheet dibuat: ' + nama); }

    const lastCol = Math.max(sh.getLastColumn(), head.length);
    const current = sh.getRange(1, 1, 1, lastCol).getValues()[0];

    // Tulis header yang belum ada
    const barisHeader = head.map((h, i) => (current[i] === '' || current[i] === undefined) ? h : current[i]);
    sh.getRange(1, 1, 1, head.length).setValues([barisHeader]);

    // Gaya header
    sh.getRange(1, 1, 1, head.length)
      .setBackground('#1e293b').setFontColor('#ffffff')
      .setFontWeight('bold').setHorizontalAlignment('center');
    sh.setFrozenRows(1);

    // Lebar kolom & format rupiah
    head.forEach((h, i) => sh.setColumnWidth(i + 1, h.length > 14 ? 190 : 120));
    const fmt = APP.FORMAT_RP[nama];
    if (fmt) Object.keys(fmt).forEach(ci => {
      if (Number(ci) + 1 <= head.length) sh.getRange(2, Number(ci) + 1, Math.max(sh.getLastRow() - 1, 100), 1).setNumberFormat(fmt[ci]);
    });

    // Validasi dropdown sederhana
    if (nama === 'Produk') { statusAktifValidasi_(sh, head); jenisValidasi_(sh, head); }
    if (nama === 'Pengguna') peranValidasi_(sh, head);
  });

  // Hapus sheet default "Sheet1" yang kosong
  const s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) { ss.deleteSheet(s1); }

  // Seed data awal
  if (readSheet_('Kategori').length === 0) {
    ['Makanan', 'Minuman', 'Snack', 'Perlengkapan', 'Lainnya'].forEach(n => {
      appendRow_('Kategori', { ID_Kategori: newId_('KTG'), Nama_Kategori: n });
    });
    log.push('Kategori awal ditambahkan.');
  }

  if (readSheet_('Pengguna').length === 0) {
    appendRow_('Pengguna', { ID_User: newId_('USR'), Username: 'admin', Password_Hash: hash_('admin123'), Nama_Lengkap: 'Administrator', Peran: 'Admin' });
    appendRow_('Pengguna', { ID_User: newId_('USR'), Username: 'kasir', Password_Hash: hash_('kasir123'), Nama_Lengkap: 'Kasir Contoh', Peran: 'Kasir' });
    log.push('Pengguna awal: admin/admin123 & kasir/kasir123');
  }

  if (readSheet_('Produk').length === 0) {
    [
      ['BRG-001', '8991002101018', 'Indomie Goreng', 'Makanan', 2800, 3500, 120, 'pcs', 20],
      ['BRG-002', '8993007301016', 'Aqua 600ml', 'Minuman', 2500, 4000, 96, 'botol', 24],
      ['BRG-003', '8996009301017', 'Teh Pucuk 350ml', 'Minuman', 3500, 5000, 72, 'botol', 12],
      ['BRG-004', '8991005101014', 'Chitato Sapi Panggang', 'Snack', 9500, 12000, 40, 'pcs', 10],
      ['BRG-005', '8991111101012', 'Roti Tawar Sari Roti', 'Makanan', 13500, 16000, 18, 'pcs', 5],
      ['BRG-006', '8997001101015', 'Kopi Kapal Api Sachet', 'Minuman', 1400, 2000, 200, 'sachet', 50],
      ['BRG-007', '8992003101019', 'Sabun Lifebuoy 110g', 'Perlengkapan', 4200, 6000, 35, 'pcs', 10],
      ['BRG-008', '8993008101013', 'Kantong Plastik Besar', 'Perlengkapan', 500, 1000, 300, 'pcs', 100]
    ].forEach(p => {
      appendRow_('Produk', {
        ID_Produk: newId_('PRD'), Kode_Barcode: p[0] + '/' + p[1], Nama_Produk: p[2],
        Kategori: p[3], Harga_Beli: p[4], Harga_Jual: p[5], Stok: p[6],
        Satuan: p[7], Minimal_Stok: p[8], Status_Aktif: 'Aktif'
      });
    });
    log.push('8 produk contoh ditambahkan.');
  }

  if (readSheet_('Pelanggan').length === 0) {
    appendRow_('Pelanggan', { ID_Pelanggan: newId_('PLG'), Nama_Pelanggan: 'Pelanggan Umum', No_HP: '', Poin_Reward: 0 });
    log.push('Pelanggan umum ditambahkan.');
  }

  return log.length ? log.join('\n') : 'Database sudah siap (tidak ada perubahan). URL: ' + ss.getUrl();
}

function statusAktifValidasi_(sh, head) {
  const c = head.indexOf('Status_Aktif') + 1;
  if (!c) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Aktif', 'Nonaktif'], true).build();
  sh.getRange(2, c, 500, 1).setDataValidation(rule);
}

function jenisValidasi_(sh, head) {
  const c = head.indexOf('Jenis_Produk') + 1;
  if (!c) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Normal', 'Titipan'], true).build();
  sh.getRange(2, c, 500, 1).setDataValidation(rule);
}

function peranValidasi_(sh, head) {
  const c = head.indexOf('Peran') + 1;
  if (!c) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Admin', 'Kasir'], true).build();
  sh.getRange(2, c, 500, 1).setDataValidation(rule);
}

/* ---------- Helper baca/tulis sheet ---------- */

function sh_(nama) {
  const ss = getSS_();
  let s = ss.getSheetByName(nama);
  if (!s) { setupSpreadsheet(); s = ss.getSheetByName(nama); }
  if (!s) throw new Error('Sheet "' + nama + '" tidak ditemukan. Jalankan setupSpreadsheet().');
  return s;
}

function head_(nama) {
  const s = sh_(nama);
  if (s.getLastColumn() === 0) return APP.SKEMA[nama] || [];
  return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
}

function readSheet_(nama) {
  const s = sh_(nama);
  const lastRow = s.getLastRow();
  if (lastRow < 2) return [];
  const vals = s.getRange(1, 1, lastRow, s.getLastColumn()).getValues();
  const head = vals[0].map(String);
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (row.every(c => c === '' || c === null)) continue;
    const obj = {};
    head.forEach((h, j) => { if (h && h !== 'undefined') obj[h] = sel_(row[j]); });
    out.push(obj);
  }
  return out;
}

/** Normalisasi nilai sel: Date -> string ISO lokal (bebas masalah timezone). */
function sel_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss');
  return v;
}

function appendRow_(nama, obj) {
  const head = head_(nama);
  const row = head.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '');
  sh_(nama).appendRow(row);
  return obj;
}

function findRow_(nama, kolom, nilai) {
  const s = sh_(nama);
  const head = head_(nama);
  const c = head.indexOf(kolom) + 1;
  if (!c) return -1;
  const last = s.getLastRow();
  if (last < 2) return -1;
  const vals = s.getRange(2, c, last - 1, 1).getValues();
  const cari = String(nilai);
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === cari) return i + 2;
  }
  return -1;
}

function updateRow_(nama, kolomId, id, data) {
  const s = sh_(nama);
  const head = head_(nama);
  const r = findRow_(nama, kolomId, id);
  if (r < 0) throw new Error('Data tidak ditemukan (' + id + ')');
  Object.keys(data).forEach(k => {
    const c = head.indexOf(k);
    if (c >= 0) s.getRange(r, c + 1).setValue(data[k]);
  });
  return r;
}

function deleteRow_(nama, kolomId, id) {
  const r = findRow_(nama, kolomId, id);
  if (r < 0) throw new Error('Data tidak ditemukan (' + id + ')');
  sh_(nama).deleteRow(r);
}

function newId_(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() +
    Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
}

function nowStr_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss');
}

function hariIni_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function keyTgl_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  return isNaN(d) ? '' : Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}

/* Hari bisnis untuk LAPORAN: pergantian hari pukul 04.00 (angkringan
   buka 18.00 dan tutup ~02.00, jadi malam yang lewat tengah malam tetap
   dihitung sebagai hari yang sama — hari sebelum 04.00 itu). */
function jamHariBisnis_() { return 4; }

/** Tanggal ISO dari suatu waktu, sudah menyesuaikan hari bisnis:
 *  waktu SEBELUM pukul 04.00 dianggap milik hari sebelumnya. */
function hariBisnis_(v) {
  const s = (v instanceof Date)
    ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss')
    : String(v || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):/);
  const tgl = m ? m[1] : keyTgl_(v);
  if (!m || !tgl) return tgl;
  return Number(m[2]) < jamHariBisnis_() ? geserHari_(tgl, -1) : tgl;
}

/** Geser tanggal ISO (yyyy-MM-dd) sejumlah hari; delta boleh negatif. */
function geserHari_(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}

function hariAntara_(mulai, akhir) {
  const out = [];
  const a = new Date(mulai + 'T00:00:00');
  const b = new Date(akhir + 'T00:00:00');
  while (a <= b && out.length < 400) {
    out.push(a.getFullYear() + '-' + String(a.getMonth() + 1).padStart(2, '0') + '-' + String(a.getDate()).padStart(2, '0'));
    a.setDate(a.getDate() + 1);
  }
  return out;
}

function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

/** Kepemilikan produk: titipan bila jenis Titipan ATAU sudah punya nama
 *  penitip — deteksi tetap benar walau kolom Jenis_Produk kosong (data lama). */
function titipan_(p) {
  return String(p.Jenis_Produk || '') === 'Titipan' || !!String(p.Pemilik_Titipan || '').trim();
}

/* ====================================================================
 * 5. BOOTSTRAP (data awal front-end setelah login)
 * ==================================================================== */

/** Migrasi otomatis saat sesi dimulai: tambahkan kolom skema yang belum ada
 *  (mis. Jenis_Produk/Pemilik_Titipan pada instalasi lama) tanpa perlu setup
 *  manual, perbaiki kepemilikan (nama penitip terisi → jenis jadi Titipan,
 *  stok/minimal dipaksa 0), dan reset stok negatif (sisa kesalahan lama) 0.
 *  @param {string=} saja proses hanya sheet dengan nama ini (hemat saat simpan) */
function pastikanKolom_(saja) {
  const ss = getSS_();
  Object.keys(APP.SKEMA).forEach(nama => {
    if (saja && nama !== saja) return;
    const sh = ss.getSheetByName(nama);
    if (!sh || sh.getLastColumn() === 0) return;
    const head = APP.SKEMA[nama];
    const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), head.length)).getValues()[0];
    const kurang = head.some((h, i) => String(current[i] === undefined ? '' : current[i]) !== h);
    if (kurang) {
      const baris = head.map((h, i) => (current[i] === '' || current[i] === undefined) ? h : current[i]);
      sh.getRange(1, 1, 1, head.length).setValues([baris]);
      if (nama === 'Produk') { statusAktifValidasi_(sh, head); jenisValidasi_(sh, head); }
    }
    if (nama !== 'Produk') return;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const cStok = head.indexOf('Stok') + 1;
    const cMin = head.indexOf('Minimal_Stok') + 1;
    const cJenis = head.indexOf('Jenis_Produk') + 1;
    const cPemilik = head.indexOf('Pemilik_Titipan') + 1;
    if (!cStok) return;
    const rows = sh.getRange(2, 1, lastRow - 1, head.length).getValues();
    rows.forEach((row, i) => {
      const r = i + 2;
      const jenis = cJenis > 0 ? String(row[cJenis - 1] || '') : '';
      const pemilik = cPemilik > 0 ? String(row[cPemilik - 1] || '').trim() : '';
      const titipan = jenis === 'Titipan' || !!pemilik;
      if (titipan) {
        if (cJenis > 0 && jenis !== 'Titipan') sh.getRange(r, cJenis).setValue('Titipan');
        if (num_(row[cStok - 1]) !== 0) sh.getRange(r, cStok).setValue(0);
        if (cMin > 0 && num_(row[cMin - 1]) !== 0) sh.getRange(r, cMin).setValue(0);
      } else if (num_(row[cStok - 1]) < 0) {
        sh.getRange(r, cStok).setValue(0);
      }
    });
  });
}

function bootstrap_(sesi) {
  pastikanKolom_();
  const ss = getSS_();
  const data = {
    serverTime: nowStr_(),
    produk: readSheet_('Produk'),
    kategori: readSheet_('Kategori'),
    pelanggan: readSheet_('Pelanggan'),
    spreadsheetUrl: ss.getUrl(),
    peran: sesi.peran
  };
  if (sesi.peran === 'Admin') data.pengguna = listPengguna_();
  return data;
}

/* ====================================================================
 * 6. PRODUK / STOK
 * ==================================================================== */

function simpanProduk_(d, sesi) {
  if (!d) throw new Error('Data produk kosong.');
  pastikanKolom_('Produk');
  const nama = String(d.Nama_Produk || '').trim();
  if (!nama) throw new Error('Nama produk wajib diisi.');

  const jenis = d.Jenis_Produk === 'Titipan' ? 'Titipan' : 'Normal';
  const pemilik = jenis === 'Titipan' ? String(d.Pemilik_Titipan || '').trim() : '';
  if (jenis === 'Titipan' && !pemilik) throw new Error('Nama penitip wajib diisi untuk produk titipan.');

  const data = {
    Kode_Barcode: String(d.Kode_Barcode || '').trim(),
    Nama_Produk: nama,
    Kategori: String(d.Kategori || '').trim(),
    Harga_Beli: num_(d.Harga_Beli),
    Harga_Jual: num_(d.Harga_Jual),
    Stok: jenis === 'Titipan' ? 0 : num_(d.Stok),
    Satuan: String(d.Satuan || 'pcs').trim(),
    Minimal_Stok: jenis === 'Titipan' ? 0 : num_(d.Minimal_Stok),
    Status_Aktif: d.Status_Aktif === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
    Jenis_Produk: jenis,
    Pemilik_Titipan: pemilik
  };

  if (d.ID_Produk) {
    updateRow_('Produk', 'ID_Produk', d.ID_Produk, data);
    return Object.assign({ ID_Produk: String(d.ID_Produk) }, data);
  }

  if (data.Kode_Barcode && findRow_('Produk', 'Kode_Barcode', data.Kode_Barcode) > 0) {
    throw new Error('Barcode "' + data.Kode_Barcode + '" sudah dipakai produk lain.');
  }
  const baru = Object.assign({ ID_Produk: newId_('PRD') }, data);
  appendRow_('Produk', baru);

  // Pastikan kategori ikut terdaftar
  if (data.Kategori && !readSheet_('Kategori').some(k => String(k.Nama_Kategori).toLowerCase() === data.Kategori.toLowerCase())) {
    appendRow_('Kategori', { ID_Kategori: newId_('KTG'), Nama_Kategori: data.Kategori });
  }
  return baru;
}

function hapusProduk_(id) {
  deleteRow_('Produk', 'ID_Produk', id);
  return { id: id };
}

function setStatusProduk_(payload) {
  const status = payload.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
  updateRow_('Produk', 'ID_Produk', payload.id, { Status_Aktif: status });
  return { id: String(payload.id), Status_Aktif: status };
}

function restokProduk_(payload) {
  const id = String(payload.id || '');
  const qty = num_(payload.qty);
  if (qty <= 0) throw new Error('Jumlah restok harus lebih dari 0.');
  const r = findRow_('Produk', 'ID_Produk', id);
  if (r < 0) throw new Error('Produk tidak ditemukan.');
  const s = sh_('Produk');
  const head = head_('Produk');
  const cJenis = head.indexOf('Jenis_Produk') + 1;
  const cPemilik = head.indexOf('Pemilik_Titipan') + 1;
  const jenis = cJenis > 0 ? String(s.getRange(r, cJenis).getValue() || '') : '';
  const pemilik = cPemilik > 0 ? String(s.getRange(r, cPemilik).getValue() || '').trim() : '';
  if (jenis === 'Titipan' || pemilik) {
    throw new Error('Produk titipan tidak mengelola stok opname.');
  }
  const stokBaru = num_(s.getRange(r, head.indexOf('Stok') + 1).getValue()) + qty;
  s.getRange(r, head.indexOf('Stok') + 1).setValue(stokBaru);

  let hppBaru = null;
  if (num_(payload.hppBaru) > 0) {
    hppBaru = num_(payload.hppBaru);
    s.getRange(r, head.indexOf('Harga_Beli') + 1).setValue(hppBaru);
  }
  s.getRange(r, head.indexOf('Status_Aktif') + 1).setValue('Aktif');
  return { id: id, stok: stokBaru, hpp: hppBaru };
}

/* ====================================================================
 * 7. KATEGORI
 * ==================================================================== */

function simpanKategori_(d) {
  if (!d) throw new Error('Data kategori kosong.');
  const nama = String(d.Nama_Kategori || '').trim();
  if (!nama) throw new Error('Nama kategori wajib diisi.');

  const semua = readSheet_('Kategori');
  const kembar = semua.filter(k => String(k.Nama_Kategori).toLowerCase() === nama.toLowerCase());
  if (kembar.length > 1 || (kembar.length === 1 && String(kembar[0].ID_Kategori) !== String(d.ID_Kategori || ''))) {
    throw new Error('Kategori "' + nama + '" sudah ada.');
  }

  if (d.ID_Kategori) {
    updateRow_('Kategori', 'ID_Kategori', d.ID_Kategori, { Nama_Kategori: nama });
    return { ID_Kategori: String(d.ID_Kategori), Nama_Kategori: nama };
  }
  const baru = { ID_Kategori: newId_('KTG'), Nama_Kategori: nama };
  appendRow_('Kategori', baru);
  return baru;
}

function hapusKategori_(id) {
  const dipakai = readSheet_('Produk').some(p => String(p.ID_Kategori || '') === String(id) || String(p.Kategori || '').toLowerCase() === String(katNama_(id)).toLowerCase());
  if (dipakai) throw new Error('Kategori masih dipakai produk.');
  deleteRow_('Kategori', 'ID_Kategori', id);
  return { id: id };
}

function katNama_(id) {
  const k = readSheet_('Kategori').find(x => String(x.ID_Kategori) === String(id));
  return k ? k.Nama_Kategori : '';
}

/* ====================================================================
 * 8. PELANGGAN
 * ==================================================================== */

function simpanPelanggan_(d) {
  if (!d) throw new Error('Data pelanggan kosong.');
  const nama = String(d.Nama_Pelanggan || '').trim();
  if (!nama) throw new Error('Nama pelanggan wajib diisi.');
  const data = {
    Nama_Pelanggan: nama,
    No_HP: String(d.No_HP || '').trim(),
    Poin_Reward: num_(d.Poin_Reward)
  };
  if (d.ID_Pelanggan) {
    updateRow_('Pelanggan', 'ID_Pelanggan', d.ID_Pelanggan, data);
    return Object.assign({ ID_Pelanggan: String(d.ID_Pelanggan) }, data);
  }
  const baru = Object.assign({ ID_Pelanggan: newId_('PLG') }, data);
  appendRow_('Pelanggan', baru);
  return baru;
}

function hapusPelanggan_(id) {
  deleteRow_('Pelanggan', 'ID_Pelanggan', id);
  return { id: id };
}

/* ====================================================================
 * 9. PENGELUARAN OPERASIONAL
 * ==================================================================== */

function simpanPengeluaran_(d) {
  if (!d) throw new Error('Data pengeluaran kosong.');
  // Tanggal kosong = hari bisnis berjalan (ganti hari pukul 04.00)
  const tgl = keyTgl_(d.Tanggal) || hariBisnis_(nowStr_());
  const nominal = num_(d.Nominal);
  if (nominal <= 0) throw new Error('Nominal pengeluaran harus lebih dari 0.');
  const data = {
    Tanggal: tgl,
    Kategori_Pengeluaran: String(d.Kategori_Pengeluaran || 'Operasional').trim(),
    Nominal: nominal,
    Keterangan: String(d.Keterangan || '').trim()
  };
  if (d.ID_Pengeluaran) {
    updateRow_('Pengeluaran_Operasional', 'ID_Pengeluaran', d.ID_Pengeluaran, data);
    return Object.assign({ ID_Pengeluaran: String(d.ID_Pengeluaran) }, data);
  }
  const baru = Object.assign({ ID_Pengeluaran: newId_('PGL') }, data);
  appendRow_('Pengeluaran_Operasional', baru);
  return baru;
}

function hapusPengeluaran_(id) {
  deleteRow_('Pengeluaran_Operasional', 'ID_Pengeluaran', id);
  return { id: id };
}

function listPengeluaran_(payload) {
  const mulai = keyTgl_(payload.mulai) || '';
  const akhir = keyTgl_(payload.akhir) || '9999-12-31';
  return readSheet_('Pengeluaran_Operasional')
    .map(p => Object.assign({}, p, { Tanggal: keyTgl_(p.Tanggal) }))
    .filter(p => p.Tanggal >= mulai && p.Tanggal <= akhir)
    .sort((a, b) => b.Tanggal.localeCompare(a.Tanggal));
}

/* ====================================================================
 * 10. TRANSAKSI PENJUALAN
 * ==================================================================== */

/**
 * payload = {
 *   noFaktur, tanggal, items:[{idProduk, harga, qty, diskon}],
 *   diskonGlobal, pajakPct, bayar, metode, pelangganId, poinPerRp,
 *   idKasir, catatan
 * }
 * Idempoten: noFaktur yang sama tidak akan diproses dua kali
 * (penting untuk sinkronisasi transaksi offline).
 */
function simpanTransaksi_(payload) {
  const items = (payload && payload.items) || [];
  if (!items.length) throw new Error('Keranjang belanja kosong.');

  const noFaktur = String(payload.noFaktur || '').trim();
  if (!noFaktur) throw new Error('No_Faktur tidak boleh kosong.');
  if (findRow_('Transaksi', 'No_Faktur', noFaktur) > 0) {
    return { noFaktur: noFaktur, duplikat: true, pesan: 'Transaksi sudah tersimpan di spreadsheet.' };
  }

  // Peta produk (untuk HPP & stok)
  const peta = {};
  readSheet_('Produk').forEach(p => { peta[String(p.ID_Produk)] = p; });

  let totalBelanja = 0;
  const detailRows = [];
  const qtyPerProduk = {};
  const kurangStok = [];

  items.forEach(it => {
    const p = peta[String(it.idProduk)];
    if (!p) throw new Error('Produk tidak ditemukan: ' + (it.nama || it.idProduk));
    const harga = num_(it.harga);
    const qty = num_(it.qty);
    const disc = Math.max(0, num_(it.diskon));
    if (qty <= 0) return;

    const sub = harga * qty - disc;
    const hpp = num_(p.Harga_Beli);
    const profit = (harga - hpp) * qty - disc;
    const titipan = titipan_(p);

    totalBelanja += sub;
    detailRows.push([newId_('DT'), noFaktur, p.ID_Produk, p.Nama_Produk, harga, qty, sub, profit]);
    if (!titipan) {
      qtyPerProduk[String(p.ID_Produk)] = (qtyPerProduk[String(p.ID_Produk)] || 0) + qty;
      if (num_(p.Stok) < qty) kurangStok.push(String(p.Nama_Produk));
    }
  });

  if (!detailRows.length) throw new Error('Tidak ada item valid pada keranjang.');

  const diskonGlobal = Math.max(0, num_(payload.diskonGlobal));
  const pajakPct = Math.max(0, num_(payload.pajakPct));
  const dasar = Math.max(0, totalBelanja - diskonGlobal);
  const pajak = Math.round(dasar * pajakPct / 100);
  const totalAkhir = dasar + pajak;
  const bayar = payload.bayar === undefined || payload.bayar === null || payload.bayar === '' ? totalAkhir : num_(payload.bayar);
  const kembalian = Math.max(0, bayar - totalAkhir);
  const tanggal = String(payload.tanggal || '').trim() || nowStr_();
  const metode = String(payload.metode || 'Tunai').trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Cek ulang duplikat setelah mengunci (aman dari race condition)
    if (findRow_('Transaksi', 'No_Faktur', noFaktur) > 0) {
      return { noFaktur: noFaktur, duplikat: true, pesan: 'Transaksi sudah tersimpan di spreadsheet.' };
    }

    appendRow_('Transaksi', {
      No_Faktur: noFaktur,
      Tanggal_Waktu: tanggal,
      Total_Belanja: totalBelanja,
      Diskon_Global: diskonGlobal,
      Pajak: pajak,
      Total_Akhir: totalAkhir,
      Jumlah_Bayar: bayar,
      Kembalian: kembalian,
      Metode_Pembayaran: metode,
      ID_Kasir: String(payload.idKasir || ''),
      Catatan: String(payload.catatan || '')
    });
    detailRows.forEach(r => {
      sh_('Detail_Transaksi').appendRow(r);
    });

    // Kurangi stok
    const s = sh_('Produk');
    const head = head_('Produk');
    const cId = head.indexOf('ID_Produk') + 1;
    const cStok = head.indexOf('Stok') + 1;
    const last = s.getLastRow();
    if (last >= 2) {
      const ids = s.getRange(2, cId, last - 1, 1).getValues();
      Object.keys(qtyPerProduk).forEach(id => {
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === id) {
            const r = i + 2;
            const stokLama = num_(s.getRange(r, cStok).getValue());
            s.getRange(r, cStok).setValue(Math.max(0, stokLama - qtyPerProduk[id]));
            break;
          }
        }
      });
    }

    // Tambah poin reward pelanggan (default: 1 poin / Rp 10.000)
    const pelangganId = String(payload.pelangganId || '');
    if (pelangganId) {
      const rPlg = findRow_('Pelanggan', 'ID_Pelanggan', pelangganId);
      if (rPlg > 0) {
        const poinPerRp = num_(payload.poinPerRp) > 0 ? num_(payload.poinPerRp) : 10000;
        const poin = Math.floor(totalAkhir / poinPerRp);
        const sPlg = sh_('Pelanggan');
        const cPoin = head_('Pelanggan').indexOf('Poin_Reward') + 1;
        const poinLama = num_(sPlg.getRange(rPlg, cPoin).getValue());
        sPlg.getRange(rPlg, cPoin).setValue(poinLama + poin);
      }
    }
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    noFaktur: noFaktur,
    totalBelanja: totalBelanja,
    diskonGlobal: diskonGlobal,
    pajak: pajak,
    totalAkhir: totalAkhir,
    bayar: bayar,
    kembalian: kembalian,
    peringatanStok: kurangStok
  };
}

/** Batch sinkronisasi antrean transaksi offline. */
function syncTransaksi_(payload) {
  const items = (payload && payload.items) || [];
  const hasil = [];
  items.forEach(it => {
    try {
      const r = simpanTransaksi_(it);
      hasil.push(Object.assign({ noFaktur: it.noFaktur, ok: true }, r));
    } catch (e) {
      hasil.push({ noFaktur: it.noFaktur, ok: false, pesan: e && e.message ? e.message : String(e) });
    }
  });
  const sukses = hasil.filter(h => h.ok || h.duplikat).length;
  return { hasil: hasil, sukses: sukses, gagal: hasil.length - sukses };
}

/* ====================================================================
 * 11. PENGELOLA PENGGUNA
 * ==================================================================== */

function listPengguna_() {
  return readSheet_('Pengguna').map(u => ({
    ID_User: u.ID_User, Username: u.Username, Nama_Lengkap: u.Nama_Lengkap, Peran: u.Peran
  }));
}

function simpanPengguna_(d, sesi) {
  if (!d) throw new Error('Data pengguna kosong.');
  const username = String(d.Username || '').trim().toLowerCase();
  const nama = String(d.Nama_Lengkap || '').trim();
  if (!username || !nama) throw new Error('Username dan nama lengkap wajib diisi.');

  const semua = readSheet_('Pengguna');
  const kembar = semua.filter(u => String(u.Username).toLowerCase() === username);
  if (kembar.length > 1 || (kembar.length === 1 && String(kembar[0].ID_User) !== String(d.ID_User || ''))) {
    throw new Error('Username "' + username + '" sudah dipakai.');
  }

  if (d.ID_User) {
    const data = { Username: username, Nama_Lengkap: nama, Peran: d.Peran === 'Kasir' ? 'Kasir' : 'Admin' };
    if (String(d.Password_Hash || '').trim()) data.Password_Hash = hash_(String(d.Password_Hash));
    updateRow_('Pengguna', 'ID_User', d.ID_User, data);
    return { ID_User: String(d.ID_User), Username: username, Nama_Lengkap: nama, Peran: data.Peran };
  }

  if (!String(d.Password_Hash || '')) throw new Error('Password wajib diisi untuk pengguna baru.');
  const baru = {
    ID_User: newId_('USR'), Username: username, Password_Hash: hash_(String(d.Password_Hash)),
    Nama_Lengkap: nama, Peran: d.Peran === 'Kasir' ? 'Kasir' : 'Admin'
  };
  appendRow_('Pengguna', baru);
  return { ID_User: baru.ID_User, Username: username, Nama_Lengkap: nama, Peran: baru.Peran };
}

function hapusPengguna_(id, sesi) {
  if (String(id) === String(sesi.id)) throw new Error('Tidak bisa menghapus akun yang sedang login.');
  deleteRow_('Pengguna', 'ID_User', id);
  return { id: id };
}

/* ====================================================================
 * 12. LAPORAN & ANALITIK
 * ==================================================================== */

function laporan_(payload) {
  const mulai = keyTgl_(payload.mulai);
  const akhir = keyTgl_(payload.akhir);
  if (!mulai || !akhir) throw new Error('Rentang tanggal wajib diisi.');
  if (mulai > akhir) throw new Error('Tanggal mulai harus sebelum tanggal akhir.');

  const semuaTrx = readSheet_('Transaksi');
  const trx = semuaTrx
    .map(t => Object.assign({}, t, { _tgl: hariBisnis_(t.Tanggal_Waktu) }))
    .filter(t => t._tgl >= mulai && t._tgl <= akhir);

  const petaTrx = {};
  trx.forEach(t => { petaTrx[String(t.No_Faktur)] = t; });

  const det = readSheet_('Detail_Transaksi').filter(d => petaTrx[String(d.No_Faktur)]);

  let omzet = 0, totalBelanja = 0, totalDiskon = 0, totalPajak = 0;
  trx.forEach(t => {
    omzet += num_(t.Total_Akhir);
    totalBelanja += num_(t.Total_Belanja);
    totalDiskon += num_(t.Diskon_Global);
    totalPajak += num_(t.Pajak);
  });

  let labaDetail = 0, totalHPP = 0, qtyTerjual = 0;
  det.forEach(d => {
    labaDetail += num_(d.Profit_Bersih);
    totalHPP += num_(d.Subtotal) - num_(d.Profit_Bersih);
    qtyTerjual += num_(d.Jumlah_Qty);
  });

  const labaKotor = labaDetail - totalDiskon; // diskon global mengurangi laba

  const pengeluaran = readSheet_('Pengeluaran_Operasional')
    .map(p => Object.assign({}, p, { Tanggal: keyTgl_(p.Tanggal) }))
    .filter(p => p.Tanggal >= mulai && p.Tanggal <= akhir);

  let totalPengeluaran = 0;
  pengeluaran.forEach(p => { totalPengeluaran += num_(p.Nominal); });

  const labaBersih = labaKotor - totalPengeluaran;
  const jumlahTrx = trx.length;
  const rata2 = jumlahTrx ? omzet / jumlahTrx : 0;

  // Breakdown metode pembayaran
  const petaMetode = {};
  trx.forEach(t => {
    const m = String(t.Metode_Pembayaran || 'Lainnya');
    if (!petaMetode[m]) petaMetode[m] = { metode: m, jumlah: 0, total: 0 };
    petaMetode[m].jumlah++;
    petaMetode[m].total += num_(t.Total_Akhir);
  });

  // Deret harian (diisi nol agar grafik mulus)
  const hari = hariAntara_(mulai, akhir);
  const petaHari = {};
  hari.forEach(h => { petaHari[h] = { tanggal: h, omzet: 0, laba: 0, trx: 0, profit: 0, diskon: 0, pengeluaran: 0 }; });
  trx.forEach(t => {
    const x = petaHari[t._tgl];
    if (x) { x.omzet += num_(t.Total_Akhir); x.trx++; x.diskon += num_(t.Diskon_Global); }
  });
  det.forEach(d => {
    const t = petaTrx[String(d.No_Faktur)];
    const x = t && petaHari[t._tgl];
    if (x) x.profit += num_(d.Profit_Bersih);
  });
  pengeluaran.forEach(p => {
    const x = petaHari[p.Tanggal];
    if (x) x.pengeluaran += num_(p.Nominal);
  });
  const harian = hari.map(h => {
    const x = petaHari[h];
    x.laba = x.profit - x.diskon - x.pengeluaran;
    return x;
  });

  // Deret bulanan
  const petaBulan = {};
  harian.forEach(h => {
    const b = h.tanggal.slice(0, 7);
    if (!petaBulan[b]) petaBulan[b] = { bulan: b, omzet: 0, laba: 0, trx: 0, pengeluaran: 0 };
    petaBulan[b].omzet += h.omzet;
    petaBulan[b].laba += h.laba;
    petaBulan[b].trx += h.trx;
    petaBulan[b].pengeluaran += h.pengeluaran;
  });
  const bulanan = Object.keys(petaBulan).sort().map(b => petaBulan[b]);

  // Peta jenis produk (Normal / Titipan) & pemilik penitip
  const produk = readSheet_('Produk');
  const petaJenis = {};
  produk.forEach(p => {
    petaJenis[String(p.ID_Produk)] = {
      jenis: titipan_(p) ? 'Titipan' : 'Normal',
      pemilik: String(p.Pemilik_Titipan || ''),
      nama: String(p.Nama_Produk || '')
    };
  });

  // Produk terlaris
  const petaProduk = {};
  det.forEach(d => {
    const id = String(d.ID_Produk);
    if (!petaProduk[id]) petaProduk[id] = { id: id, nama: String(d.Nama_Produk), qty: 0, omzet: 0, profit: 0 };
    petaProduk[id].qty += num_(d.Jumlah_Qty);
    petaProduk[id].omzet += num_(d.Subtotal);
    petaProduk[id].profit += num_(d.Profit_Bersih);
  });
  const topProduk = Object.keys(petaProduk).map(k => petaProduk[k])
    .sort((a, b) => b.qty - a.qty).slice(0, 15);

  // Laporan produk titipan per penitip — disemai dulu dari database (semua
  // produk titipan tampil walau belum terjual pada periode, sesuai data pemilik
  // di sheet Produk), lalu ditambah penjualan pada periode:
  // omzet = yang dibayar pelanggan, hpp = yang harus dibayar ke penitip,
  // untung = selisih (keuntungan toko).
  const kunciPenitip = v => String(v || '').trim() || 'Tanpa nama';
  const petaTitipan = {};
  const tambahPenitip = kunci => {
    if (!petaTitipan[kunci]) petaTitipan[kunci] = { pemilik: kunci, unit: 0, omzet: 0, hpp: 0, untung: 0, produk: {} };
    return petaTitipan[kunci];
  };
  produk.forEach(p => {
    if (!titipan_(p)) return;
    const t = tambahPenitip(kunciPenitip(p.Pemilik_Titipan));
    const nama = String(p.Nama_Produk || '');
    if (nama && !t.produk[nama]) t.produk[nama] = { nama: nama, unit: 0, omzet: 0, hpp: 0, untung: 0 };
  });
  det.forEach(d => {
    const info = petaJenis[String(d.ID_Produk)];
    if (!info || info.jenis !== 'Titipan') return;
    const t = tambahPenitip(kunciPenitip(info.pemilik));
    const qty = num_(d.Jumlah_Qty), sub = num_(d.Subtotal), profit = num_(d.Profit_Bersih);
    t.unit += qty; t.omzet += sub; t.untung += profit; t.hpp += sub - profit;
    const nama = info.nama || String(d.Nama_Produk || '');
    if (!t.produk[nama]) t.produk[nama] = { nama: nama, unit: 0, omzet: 0, hpp: 0, untung: 0 };
    const pr = t.produk[nama];
    pr.unit += qty; pr.omzet += sub; pr.untung += profit; pr.hpp += sub - profit;
  });
  const titipan = Object.keys(petaTitipan).map(k => {
    const t = petaTitipan[k];
    t.produk = Object.keys(t.produk).map(n => t.produk[n]).sort((a, b) => b.omzet - a.omzet);
    return t;
  }).sort((a, b) => b.omzet - a.omzet);

  // Pengeluaran per kategori
  const petaKategoriPengeluaran = {};
  pengeluaran.forEach(p => {
    const k = String(p.Kategori_Pengeluaran || 'Lainnya');
    petaKategoriPengeluaran[k] = (petaKategoriPengeluaran[k] || 0) + num_(p.Nominal);
  });
  const pengeluaranKategori = Object.keys(petaKategoriPengeluaran)
    .map(k => ({ kategori: k, nominal: petaKategoriPengeluaran[k] }))
    .sort((a, b) => b.nominal - a.nominal);

  // Daftar transaksi terbaru (maks 100)
  const daftarTrx = trx.slice()
    .sort((a, b) => String(b.Tanggal_Waktu).localeCompare(String(a.Tanggal_Waktu)))
    .slice(0, 100)
    .map(t => ({
      no: String(t.No_Faktur), tanggal: String(t.Tanggal_Waktu),
      total: num_(t.Total_Akhir), metode: String(t.Metode_Pembayaran || ''),
      kasir: String(t.ID_Kasir || ''), catatan: String(t.Catatan || '')
    }));

  // Nilai aset inventaris — produk TITIPAN dikeluarkan sepenuhnya:
  // bukan milik toko, tidak boleh menambah/menurunkan nilai aset
  // walaupun kolom Stok terisi angka (mis. salah input manual di sheet).
  const stokProduk = produk
    .filter(p => !titipan_(p))
    .map(p => ({
      kode: String(p.Kode_Barcode || ''), nama: String(p.Nama_Produk || ''),
      kategori: String(p.Kategori || ''), stok: num_(p.Stok), min: num_(p.Minimal_Stok),
      satuan: String(p.Satuan || ''), hpp: num_(p.Harga_Beli),
      nilai: num_(p.Stok) * num_(p.Harga_Beli), status: String(p.Status_Aktif || 'Aktif')
    }));
  const nilaiAset = stokProduk.reduce((s, p) => s + p.nilai, 0);
  const menipis = stokProduk.filter(p => p.status === 'Aktif' && p.stok <= p.min);

  return {
    mulai: mulai, akhir: akhir,
    ringkasan: {
      omzet: omzet, totalBelanja: totalBelanja, diskon: totalDiskon, pajak: totalPajak,
      hpp: totalHPP, labaKotor: labaKotor, pengeluaran: totalPengeluaran,
      labaBersih: labaBersih, jumlahTrx: jumlahTrx, rata2: rata2, qtyTerjual: qtyTerjual
    },
    metode: Object.keys(petaMetode).map(k => petaMetode[k]).sort((a, b) => b.total - a.total),
    harian: harian,
    bulanan: bulanan,
    topProduk: topProduk,
    titipan: titipan,
    pengeluaran: pengeluaran.slice(0, 500),
    pengeluaranKategori: pengeluaranKategori,
    transaksi: daftarTrx,
    stok: { nilaiAset: nilaiAset, jumlahItem: stokProduk.length, menipis: menipis, produk: stokProduk }
  };
}
