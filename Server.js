const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

// Pastikan zona waktu mengikuti WIB (Asia/Jakarta)
process.env.TZ = 'Asia/Jakarta';

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================================
// PENGATURAN JAM SESI ABSENSI
// Ubah CEK_JAM_SESI menjadi false jika ingin testing di luar jam 07:00
// ========================================================
const CEK_JAM_SESI = true;
const JAM_BUKA_SESI_1 = 7 * 60 + 0;   // 07:00 (dalam menit: 420)
const JAM_BUKA_SESI_2 = 11 * 60 + 30; // 11:30 (dalam menit: 690)

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyajikan file statis dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Connection Pool MySQL untuk Aiven (SSL REQUIRED) + fallback lokal
const db = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-3693b7b1-royhanindallah41-3061.i.aivencloud.com',
  port: Number(process.env.DB_PORT) || 23096,
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'defaultdb',
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Uji koneksi awal ke pool database
db.getConnection((err, connection) => {
  if (err) {
    console.error('Gagal terhubung ke database MySQL:', err.message);
    return;
  }
  console.log(`Terhubung ke database MySQL: ${process.env.DB_NAME || 'defaultdb'}`);
  connection.release();
});

// ========================================================
// 0. ENDPOINT HEALTH CHECK (CEK SERVER & DATABASE)
// ========================================================
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err) => {
    if (err) {
      return res.status(500).json({
        status: 'error',
        message: 'Backend aktif, tetapi gagal terhubung ke database: ' + err.message
      });
    }
    res.json({
      status: 'ok',
      message: 'Server backend & database terhubung'
    });
  });
});

// ========================================================
// DAFTAR TABEL & MAPPING PREFIX ID WILAYAH
// ========================================================
const TABEL_WILAYAH = [
  'pengurus_daerah',
  'desa_barat',
  'desa_timur',
  'desa_utara',
  'desa_pangkalpinang_1',
  'desa_pangkalpinang_2',
  'desa_koba',
  'desa_lubuk',
  'desa_selatan'
];

const PREFIX_TO_TABLE = {
  'D-': 'pengurus_daerah',
  'B-': 'desa_barat',
  'T-': 'desa_timur',
  'U-': 'desa_utara',
  'P1-': 'desa_pangkalpinang_1',
  'P2-': 'desa_pangkalpinang_2',
  'K-': 'desa_koba',
  'L-': 'desa_lubuk',
  'S-': 'desa_selatan'
};

// Helper: Mengambil tanggal lokal (YYYY-MM-DD) dan jam lokal (HH:MM:SS) yang akurat (WIB)
function getLocalDateTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const map = {};
  parts.forEach(p => {
    if (p.type !== 'literal') map[p.type] = p.value;
  });

  const hoursNum = parseInt(map.hour, 10);
  const minutesNum = parseInt(map.minute, 10);

  return {
    tanggal: `${map.year}-${map.month}-${map.day}`,
    waktu: `${map.hour}:${map.minute}:${map.second}`,
    totalMenit: hoursNum * 60 + minutesNum
  };
}

// ========================================================
// 1. ENDPOINT AUTHENTICATION (LOGIN ADMIN)
// ========================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan Password wajib diisi!' });
  }

  const query = 'SELECT * FROM admins WHERE username = ? AND password = ?';
  db.query(query, [username, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length > 0) {
      const admin = results[0];
      res.json({
        message: 'Login berhasil!',
        admin: {
          id: admin.id,
          username: admin.username,
          nama_admin: admin.nama_admin
        }
      });
    } else {
      res.status(401).json({ error: 'Username atau Password salah!' });
    }
  });
});

// ========================================================
// 2. ENDPOINT DATA PESERTA (CRUD 9 TABEL WILAYAH)
// ========================================================

// A. Ambil Semua Data Peserta dari 9 Tabel (UNION ALL)
app.get('/api/peserta', (req, res) => {
  const queries = TABEL_WILAYAH.map(table => `SELECT id, nama, utusan, '${table}' AS tabel_asal FROM ${table}`);
  const combinedQuery = queries.join(' UNION ALL ') + ' ORDER BY id ASC';

  db.query(combinedQuery, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// B. Tambah Peserta Baru
app.post('/api/peserta', (req, res) => {
  const { id, nama, utusan } = req.body;

  if (!id || !nama || !utusan) {
    return res.status(400).json({ error: 'ID Peserta, Nama, dan Utusan wajib diisi!' });
  }

  const cleanId = id.trim().toUpperCase();
  const prefix = Object.keys(PREFIX_TO_TABLE).find(p => cleanId.startsWith(p));
  const tableName = PREFIX_TO_TABLE[prefix];

  if (!tableName) {
    return res.status(400).json({
      error: 'Prefix ID tidak dikenali! Gunakan prefix D-, B-, T-, U-, P1-, P2-, K-, L-, atau S-'
    });
  }

  const query = `INSERT INTO ${tableName} (id, nama, utusan) VALUES (?, ?, ?)`;
  db.query(query, [cleanId, nama.trim(), utusan.trim()], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: `ID Peserta (${cleanId}) sudah ada!` });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Peserta berhasil ditambahkan!', id: cleanId, table: tableName });
  });
});

// C. Update / Edit Nama & Utusan Peserta
app.put('/api/peserta/:id', (req, res) => {
  const cleanId = req.params.id.trim().toUpperCase();
  const { nama, utusan } = req.body;

  if (!nama || !utusan) {
    return res.status(400).json({ error: 'Nama dan Utusan wajib diisi!' });
  }

  const prefix = Object.keys(PREFIX_TO_TABLE).find(p => cleanId.startsWith(p));
  const tableName = PREFIX_TO_TABLE[prefix];

  if (!tableName) {
    return res.status(400).json({ error: 'Prefix ID tidak dikenali!' });
  }

  const query = `UPDATE ${tableName} SET nama = ?, utusan = ? WHERE id = ?`;
  db.query(query, [nama.trim(), utusan.trim(), cleanId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Peserta tidak ditemukan!' });
    }
    res.json({ message: 'Data peserta berhasil diperbarui!' });
  });
});

// D. Hapus Peserta
app.delete('/api/peserta/:id', (req, res) => {
  const cleanId = req.params.id.trim().toUpperCase();

  const prefix = Object.keys(PREFIX_TO_TABLE).find(p => cleanId.startsWith(p));
  const tableName = PREFIX_TO_TABLE[prefix];

  if (!tableName) {
    return res.status(400).json({ error: 'Prefix ID tidak dikenali!' });
  }

  const query = `DELETE FROM ${tableName} WHERE id = ?`;
  db.query(query, [cleanId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Peserta tidak ditemukan!' });
    }
    res.json({ message: 'Peserta berhasil dihapus!' });
  });
});

// ========================================================
// 3. ENDPOINT ABSENSI 2 SESI (07:00 & 11:30) + DISPENSASI
// ========================================================

// A. Record Absen Peserta (Otomatis Deteksi Sesi 1 & Sesi 2)
app.post('/api/absen', (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'ID Peserta wajib diisi!' });
  }

  const cleanId = user_id.trim().toUpperCase();
  const prefix = Object.keys(PREFIX_TO_TABLE).find(p => cleanId.startsWith(p));
  const tableName = PREFIX_TO_TABLE[prefix];

  if (!tableName) {
    return res.status(400).json({ error: 'ID Peserta tidak valid/tidak dikenali!' });
  }

  const { tanggal, waktu, totalMenit } = getLocalDateTime();

  let sesiAktif = 1;
  if (CE
