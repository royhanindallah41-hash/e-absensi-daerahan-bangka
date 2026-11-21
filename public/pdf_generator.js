// =========================================================================
// FILE: pdf_generator.js
// Generator Laporan PDF Resmi & Modern (Menggunakan jsPDF + AutoTable)
// =========================================================================

function generateRekapPDF({ data, tanggalFormatted, wilayahText, tanggalRaw }) {
  // Pastikan library jsPDF sudah dimuat
  if (!window.jspdf) {
    alert('Library jsPDF gagal dimuat. Periksa koneksi internet Anda.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // -----------------------------------------------------------------------
  // 1. HEADER / KOP LAPORAN MODERN (Banner Navy/Blue + Aksen Emas/Biru)
  // -----------------------------------------------------------------------
  doc.setFillColor(15, 23, 42); // Slate-900 (Navy Gelap Elegan)
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Garis aksen biru di bawah header
  doc.setFillColor(37, 99, 235); // Blue-600
  doc.rect(0, 34, pageWidth, 2, 'F');

  // Judul Utama
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('LAPORAN REKAPITULASI KEHADIRAN 2 SESI', margin, 15);

  // Subjudul Instansi / Event
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text('SISTEM E-ABSENSI DIGITAL  •  PENGAJIAN DAERAHAN BANGKA', margin, 22);

  // Badge Tanggal Cetak di Pojok Kanan Atas
  const tglCetak = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Dicetak: ${tglCetak}`, pageWidth - margin, 22, { align: 'right' });

  // -----------------------------------------------------------------------
  // 2. KARTU RINGKASAN INFO (Summary Info Box)
  // -----------------------------------------------------------------------
  const boxY = 42;
  const boxHeight = 20;

  doc.setFillColor(248, 250, 252); // Slate-50
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.roundedRect(margin, boxY, pageWidth - margin * 2, boxHeight, 3, 3, 'FD');

  // Kolom 1: Hari / Tanggal Event
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text('HARI / TANGGAL EVENT', margin + 5, boxY + 7);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(tanggalFormatted || '-', margin + 5, boxY + 14);

  // Kolom 2: Wilayah / Filter
  const col2X = margin + 78;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('WILAYAH / KATEGORI', col2X, boxY + 7);

  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(wilayahText || 'Semua Wilayah', col2X, boxY + 14);

  // Kolom 3: Total Kehadiran (Highlight Hijau)
  const col3X = pageWidth - margin - 5;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL PESERTA', col3X, boxY + 7, { align: 'right' });

  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105); // Emerald-600
  doc.text(`${data.length} Orang`, col3X, boxY + 14.5, { align: 'right' });

  // -----------------------------------------------------------------------
  // 3. TABEL DATA KEHADIRAN 2 SESI (AutoTable)
  // -----------------------------------------------------------------------
  const tableRows = data.map((item, index) => [
    index + 1,
    item.user_id || '-',
    item.nama || '-',
    item.utusan || '-',
    item.waktu_sesi1 ? `${item.waktu_sesi1} WIB` : '-',
    item.waktu_sesi2 ? `${item.waktu_sesi2} WIB` : '-',
    (item.keterangan || 'Hadir').toUpperCase()
  ]);

  doc.autoTable({
    startY: boxY + boxHeight + 7,
    margin: { left: margin, right: margin, bottom: 25 },
    head: [['NO', 'ID PESERTA', 'NAMA PESERTA', 'UTUSAN / DAPUKAN', 'SESI 1', 'SESI 2', 'STATUS']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      cellPadding: 3.5
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // Efek Zebra lembut
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10, fontStyle: 'bold', textColor: [100, 116, 139] },
      1: { halign: 'center', cellWidth: 22, fontStyle: 'bold', textColor: [29, 78, 216] },
      2: { halign: 'left', cellWidth: 36, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: 42 },
      4: { halign: 'center', cellWidth: 24, fontStyle: 'mono' },
      5: { halign: 'center', cellWidth: 24, fontStyle: 'mono' },
      6: { halign: 'center', cellWidth: 24, fontStyle: 'bold', textColor: [5, 150, 105] }
    },
    // Footer Nomor Halaman Otomatis di Setiap Lembar
    didDrawPage: function (hookData) {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);

      // Garis tipis di atas footer
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

      doc.text(
        'Dokumen resmi dicetak otomatis oleh Sistem E-Absensi Daerahan Bangka',
        margin,
        pageHeight - 9
      );
      doc.text(
        `Halaman ${hookData.pageNumber} dari ${pageCount}`,
        pageWidth - margin,
        pageHeight - 9,
        { align: 'right' }
      );
    }
  });

  // -----------------------------------------------------------------------
  // 4. BLOK TANDA TANGAN RESMI (Otomatis pindah halaman jika ruang sempit)
  // -----------------------------------------------------------------------
  let finalY = doc.lastAutoTable.finalY + 14;

  if (finalY + 42 > pageHeight - 15) {
    doc.addPage();
    finalY = 25;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);

  const leftSignX = margin + 35;
  const rightSignX = pageWidth - margin - 35;

  // Tanda Tangan Kiri
  doc.text('Mengetahui,', leftSignX, finalY, { align: 'center' });
  doc.text('Pembina Daerah Bangka', leftSignX, finalY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('( ........................................ )', leftSignX, finalY + 28, { align: 'center' });

  // Tanda Tangan Kanan
  doc.setFont('helvetica', 'normal');
  doc.text(`Pangkalpinang, ${tglCetak}`, rightSignX, finalY, { align: 'center' });
  doc.text('Panitia / Admin Event', rightSignX, finalY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('( ........................................ )', rightSignX, finalY + 28, { align: 'center' });

  // -----------------------------------------------------------------------
  // 5. SIMPAN / DOWNLOAD FILE PDF
  // -----------------------------------------------------------------------
  const cleanWilayah = wilayahText.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Rekap_DualSession_${cleanWilayah}_${tanggalRaw || 'Event'}.pdf`;
  doc.save(fileName);
}