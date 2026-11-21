const mysql = require('mysql2/promise');

async function seedUsers() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'db_absensi_event'
  });

  const users = [
    ['D-0001', 'Pembina Daerah', 'Pengurus Daerah', 'D-0001'],
    ['D-0002', 'Wakil Pembina Daerah I', 'Pengurus Daerah', 'D-0002'],
    ['D-0003', 'Wakil Pembina Daerah II', 'Pengurus Daerah', 'D-0003'],
    // ... Seluruh data peserta
  ];

  try {
    await connection.query(
      'INSERT INTO users (nik, nama, wilayah, qr_code) VALUES ?',
      [users]
    );
    console.log('✅ Berhasil menginput data peserta ke database!');
  } catch (error) {
    console.error('❌ Gagal menginput data:', error);
  } finally {
    await connection.end();
  }
}

seedUsers();