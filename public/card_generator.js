// =========================================================================
// FILE: card_generator.js
// Generator Cetak ID Card Peserta Massal (Menggunakan jsPDF)
// =========================================================================

async function generateCardsPDF(selectedPesertaList) {
  if (!window.jspdf) {
    alert('Library jsPDF gagal dimuat. Periksa koneksi internet Anda.');
    return;
  }

  if (!selectedPesertaList || selectedPesertaList.length === 0) {
    alert('Pilih setidaknya satu peserta untuk dicetak.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm

  // Dimensi Kartu ID (Standar ID Card Potret: 58mm x 86mm)
  const cardWidth = 58;
  const cardHeight = 86;

  // Konfigurasi Grid (3 Kolom x 3 Baris = 9 Kartu per Halaman A4)
  const cols = 3;
  const rows = 3;
  const cardsPerPage = cols * rows;

  // Koreksi Jarak Antar Kolom & Margin agar sisi kanan tidak terpotong
  const gapX = 5; // Jarak antar kolom disesuaikan
  const gapY = 5; // Jarak antar baris
  
  // Total lebar grid = (3 * 58) + (2 * 5) = 174 + 10 = 184 mm
  // Sisa ruang di halaman A4 (210mm) = 210 - 184 = 26 mm. 
  // Margin Kiri (MX) kita buat sedikit lebih besar (misal 13 mm) agar presisi di tengah.
  const totalGridWidth = (cols * cardWidth) + ((cols - 1) * gapX);
  const marginX = (pageWidth - totalGridWidth) / 2; 
  const totalGridHeight = (rows * cardHeight) + ((rows - 1) * gapY);
  const marginY = (pageHeight - totalGridHeight) / 2;

  let currentCardIndex = 0;

  for (let i = 0; i < selectedPesertaList.length; i++) {
    const peserta = selectedPesertaList[i];

    // Jika sudah 9 kartu, buat halaman baru (Pagination otomatis)
    if (currentCardIndex > 0 && currentCardIndex % cardsPerPage === 0) {
      doc.addPage();
    }

    const positionInPage = currentCardIndex % cardsPerPage;
    const colIndex = positionInPage % cols;
    const rowIndex = Math.floor(positionInPage / cols);

    // Hitung koordinat X dan Y dengan jarak gap baru
    const x = marginX + colIndex * (cardWidth + gapX);
    const y = marginY + rowIndex * (cardHeight + gapY);

    // -----------------------------------------------------------------
    // GAMBAR KARTU INDIVIDU
    // -----------------------------------------------------------------
    
    // Background Kartu (Putih bersih dengan sudut melengkung & garis potong tipis yang utuh)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225); // Slate-300 (Garis potong halus)
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'FD');

    // Header Kartu (Banner Biru Elegan)
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.rect(x, y, cardWidth, 16, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(191, 219, 254); // Blue-200
    doc.text('E-ABSENSI EVENT', x + cardWidth / 2, y + 5.5, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('DAERAHAN BANGKA', x + cardWidth / 2, y + 12, { align: 'center' });

    // Badge ID Peserta
    const badgeY = y + 20;
    doc.setFillColor(241, 245, 249); // Slate-100
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x + 10, badgeY, cardWidth - 20, 8, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175); // Blue-800
    doc.text(peserta.id, x + cardWidth / 2, badgeY + 5.5, { align: 'center' });

    // Generate QR Code Berbasis Vektor/Data menggunakan elemen canvas tersembunyi
    const qrDataURL = await getQRCodeDataURL(peserta.id);
    if (qrDataURL) {
      const qrSize = 34;
      const qrX = x + (cardWidth - qrSize) / 2;
      const qrY = y + 30;
      doc.addImage(qrDataURL, 'PNG', qrX, qrY, qrSize, qrSize);
    }

    // Label Utusan / Dapukan
    const utusanY = y + 68;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text('UTUSAN / DAPUKAN', x + cardWidth / 2, utusanY, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59); // Slate-800
    
    const utusanText = peserta.utusan || '-';
    const splitUtusan = doc.splitTextToSize(utusanText, cardWidth - 8);
    doc.text(splitUtusan, x + cardWidth / 2, utusanY + 4, { align: 'center' });

    // Footer Instruksi Kecil di Bawah Kartu
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Tunjukkan QR ini pada petugas scanner', x + cardWidth / 2, y + cardHeight - 3.5, { align: 'center' });

    currentCardIndex++;
  }

  // Simpan Dokumen PDF
  doc.save(`ID_Card_Peserta_Bangka_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Fungsi pembantu untuk membuat QR Code sementara secara instan di balik layar
function getQRCodeDataURL(text) {
  return new Promise((resolve) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    new QRCode(tempDiv, {
      text: text,
      width: 150,
      height: 150,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

    setTimeout(() => {
      const img = tempDiv.querySelector('img');
      const canvas = tempDiv.querySelector('canvas');
      let dataURL = '';
      if (img && img.src) {
        dataURL = img.src;
      } else if (canvas) {
        dataURL = canvas.toDataURL('image/png');
      }
      document.body.removeChild(tempDiv);
      resolve(dataURL);
    }, 40);
  });
}