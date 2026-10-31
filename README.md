# KTI Checker — Nusantara of Research

Aplikasi web satu berkas (`index.html`) untuk memeriksa naskah skripsi/proposal (Pedoman KTI 2025 UNP Kediri) dan artikel jurnal **Nusantara of Research** (template NOR, APA edisi 7).

Fitur utama:
- Pemeriksaan struktur, isi, abstrak, ejaan & diksi (Indonesia/Inggris), sitasi & pustaka, tabel & gambar, format, dan kesesuaian template NOR.
- Review simulasi 1–3 reviewer + editor (dapat dikustomisasi), revisi naskah dengan sumber terverifikasi (Scite, Consensus, SciSpace), dan copyediting ke template.
- Bandingkan revisi (perbedaan redaksi, analisis aktivitas revisi, dokumen track changes), cek grammar, cek similarity, dan cek penggunaan AI (indikatif).
- LOA dan invoice (paket Internal, Reguler, Fastrack).
- Laporan per bagian dalam .docx dan .pdf; pilihan centang untuk menentukan isi laporan.

## Konektor AI (Claude, Gemini, ChatGPT)

Saat pertama dibuka, aplikasi menampilkan **pengaturan awal konektor AI**; pengaturan ini dapat diubah kapan saja lewat tombol **Konektor AI** di bagian atas. Pilihan:

| Konektor | Cara kerja | Kunci API |
|---|---|---|
| Claude di claude.ai | Memakai akun Claude saat aplikasi dibuka sebagai Artifact di claude.ai / aplikasi Claude. Satu-satunya pilihan dengan pencarian sumber Scite, Consensus, SciSpace. | Tidak perlu |
| Google Gemini | Memanggil Gemini API langsung dari peramban. | Google AI Studio (ada kuota gratis) |
| ChatGPT (OpenAI) | Memanggil OpenAI API langsung dari peramban. Langganan ChatGPT Plus tidak termasuk API. | platform.openai.com |
| Claude API (Anthropic) | Memakai Claude di luar claude.ai. | console.anthropic.com |

Kunci API disimpan hanya di `localStorage` peramban perangkat tersebut dan dikirim langsung ke penyedia. Model untuk mode Cepat/Standar/Teliti dapat diganti di bagian "Model (opsional)".

Di dalam claude.ai, halaman tidak dapat menghubungi penyedia lain, jadi Gemini dan ChatGPT dipakai dengan membuka `index.html` langsung di peramban atau dari hosting statis (misalnya GitHub Pages). Pemeriksaan otomatis lainnya tetap berjalan di peramban tanpa AI.
