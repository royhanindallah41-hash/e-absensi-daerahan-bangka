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

// Menyajikan file HTML statis dari folder proyek
app.use(express.static(__dirname));

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
  if (CEK_JAM_SESI) {
    if (totalMenit < JAM_BUKA_SESI_1) {
      return res.status(400).json({ error: 'Absensi Sesi 1 belum dibuka (mulai pukul 07:00 WIB).' });
    } else if (totalMenit >= JAM_BUKA_SESI_2) {
      sesiAktif = 2;
    } else {
      sesiAktif = 1;
    }
  } else {
    sesiAktif = totalMenit >= JAM_BUKA_SESI_2 ? 2 : 1;
  }

  db.query(`SELECT * FROM ${tableName} WHERE id = ?`, [cleanId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) {
      return res.status(404).json({ error: 'Peserta tidak terdaftar di database!' });
    }

    const peserta = results[0];

    db.query(`SELECT * FROM attendances WHERE user_id = ? AND tanggal = ?`, [cleanId, tanggal], (cekErr, attResults) => {
      if (cekErr) return res.status(500).json({ error: cekErr.message });

      if (attResults.length === 0) {
        if (sesiAktif === 1) {
          const ket = 'Hadir (Sesi 1)';
          const insertQuery = `
            INSERT INTO attendances (user_id, nama, utusan, tanggal, waktu_sesi1, waktu_sesi2, keterangan)
            VALUES (?, ?, ?, ?, ?, NULL, ?)
          `;
          db.query(insertQuery, [cleanId, peserta.nama || '-', peserta.utusan, tanggal, waktu, ket], (insErr, insRes) => {
            if (insErr) return res.status(500).json({ error: insErr.message });
            return res.json({
              message: 'Absensi Sesi 1 berhasil direkam!',
              data: {
                no: insRes.insertId,
                id: cleanId,
                nama: peserta.nama || '-',
                utusan: peserta.utusan,
                tanggal,
                waktu,
                sesi: 'Sesi 1',
                keterangan: ket
              }
            });
          });
        } else {
          const ket = 'Hadir (Sesi 2)';
          const insertQuery = `
            INSERT INTO attendances (user_id, nama, utusan, tanggal, waktu_sesi1, waktu_sesi2, keterangan)
            VALUES (?, ?, ?, ?, NULL, ?, ?)
          `;
          db.query(insertQuery, [cleanId, peserta.nama || '-', peserta.utusan, tanggal, waktu, ket], (insErr, insRes) => {
            if (insErr) return res.status(500).json({ error: insErr.message });
            return res.json({
              message: 'Absensi Sesi 2 berhasil direkam (Paruh Waktu)!',
              data: {
                no: insRes.insertId,
                id: cleanId,
                nama: peserta.nama || '-',
                utusan: peserta.utusan,
                tanggal,
                waktu,
                sesi: 'Sesi 2',
                keterangan: ket
              }
            });
          });
        }
      } else {
        const record = attResults[0];

        if (sesiAktif === 1) {
          return res.status(400).json({
            error: `Peserta ${peserta.nama} (${cleanId}) sudah absen Sesi 1 pada pukul ${record.waktu_sesi1}!`
          });
        } else {
          if (record.waktu_sesi2) {
            return res.status(400).json({
              error: `Absensi ${peserta.nama} (${cleanId}) hari ini sudah lengkap (Sesi 1 & Sesi 2)!`
            });
          }

          const ket = 'Hadir Penuh';
          const updateQuery = `UPDATE attendances SET waktu_sesi2 = ?, keterangan = ? WHERE id = ?`;
          db.query(updateQuery, [waktu, ket, record.id], (updErr) => {
            if (updErr) return res.status(500).json({ error: updErr.message });
            return res.json({
              message: 'Absensi Sesi 2 berhasil! Status: Hadir Penuh.',
              data: {
                no: record.id,
                id: cleanId,
                nama: peserta.nama || '-',
                utusan: peserta.utusan,
                tanggal,
                waktu,
                sesi: 'Sesi 2',
                keterangan: ket
              }
            });
          });
        }
      }
    });
  });
});

// B. Ambil Rekapitulasi Absensi Hari Ini (Untuk Live Feed di Scanner)
app.get('/api/absen/today', (req, res) => {
  const { tanggal } = getLocalDateTime();
  const query = `
    SELECT id AS no, user_id AS id_peserta, nama, utusan, tanggal, 
           waktu_sesi1, waktu_sesi2,
           COALESCE(waktu_sesi2, waktu_sesi1) AS waktu_scan,
           keterangan
    FROM attendances
    WHERE tanggal = ?
    ORDER BY id DESC
  `;

  db.query(query, [tanggal], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// C. Dispensasi / Persetujuan Admin (Ubah Paruh Waktu -> Hadir Penuh 1 Klik)
app.put('/api/absen/dispensasi/:id', (req, res) => {
  const recordId = req.params.id;
  const query = `UPDATE attendances SET keterangan = 'Hadir Penuh' WHERE id = ?`;

  db.query(query, [recordId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Data absensi tidak ditemukan!' });
    }
    res.json({ message: 'Status kehadiran berhasil disetujui menjadi Hadir Penuh!' });
  });
});

// ========================================================
// 4. ENDPOINT REKAPITULASI ABSENSI (FILTER TANGGAL & WILAYAH)
// ========================================================
app.get('/api/rekap', (req, res) => {
  const { tanggal, wilayah } = req.query;

  const TABLE_TO_PREFIX = {
    'pengurus_daerah': 'D-',
    'desa_barat': 'B-',
    'desa_timur': 'T-',
    'desa_utara': 'U-',
    'desa_pangkalpinang_1': 'P1-',
    'desa_pangkalpinang_2': 'P2-',
    'desa_koba': 'K-',
    'desa_lubuk': 'L-',
    'desa_selatan': 'S-'
  };

  let query = `
    SELECT id AS no, user_id AS id_peserta, nama, utusan, tanggal, 
           waktu_sesi1, waktu_sesi2, keterangan
    FROM attendances
    WHERE 1=1
  `;
  const params = [];

  if (tanggal) {
    query += ` AND tanggal = ?`;
    params.push(tanggal);
  }

  if (wilayah && wilayah !== 'ALL' && TABLE_TO_PREFIX[wilayah]) {
    const prefix = TABLE_TO_PREFIX[wilayah];
    query += ` AND user_id LIKE ?`;
    params.push(`${prefix}%`);
  }

  query += ` ORDER BY id ASC`;

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Fallback halaman utama jika diakses langsung lewat domain
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================================================
// JALANKAN SERVER (LOKAL) & EXPORT APP (VERCEL)
// ========================================================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`Server Absensi Aktif di Port ${PORT}`);
    console.log(`Zona Waktu: ${process.env.TZ}`);
    console.log(`=================================`);
  });
}

module.exports = app;