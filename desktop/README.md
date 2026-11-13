# KTI Checker NOR — aplikasi desktop Windows

Versi desktop (Electron) dari `index.html` KTI Checker, dengan merek Nusantara of Research (NOR) dan AI memakai **API key Anda sendiri**.

## Penyedia AI yang didukung

| Penyedia | Ambil kunci | Catatan |
|---|---|---|
| Google AI Studio (Gemini) | https://aistudio.google.com/api-keys | Lewat endpoint kompatibel OpenAI Gemini. Model bawaan: `gemini-flash-lite-latest`, `gemini-flash-latest`, `gemini-pro-latest`. |
| ClassAI Router | https://router.classai.id/dashboard | Base URL `https://router.classai.id/v1`, kunci `sk_live_…`. Satu kunci untuk Claude, GPT, Gemini, DeepSeek, Qwen, dll. |
| OpenAI | https://platform.openai.com/api-keys | |
| Anthropic (Claude API) | https://console.anthropic.com/settings/keys | Format Anthropic Messages. |
| OpenRouter | https://openrouter.ai/keys | |
| Perplexity (Sonar) | https://www.perplexity.ai/account/api | Berbayar. |
| Kustom | — | Penyedia apa pun yang kompatibel OpenAI Chat Completions (atau Anthropic Messages). |

Tiap penyedia punya tiga tingkat model (Cepat, Standar, Teliti) yang bisa diganti; tombol **Muat daftar model** mengambil model aktif dari penyedia. Kunci disimpan terenkripsi dengan Windows DPAPI (Electron `safeStorage`) di `%APPDATA%\KTI Checker NOR\settings.json` dan hanya dikirim ke penyedia yang dipilih.

## Sumber literatur (tab "Sumber literatur" di Pengaturan)

| Layanan | Biaya | Kunci | Catatan |
|---|---|---|---|
| OpenAlex | Gratis | Opsional (gratis, menaikkan jatah harian) | Juga memverifikasi semua kandidat (DOI, penulis, retraction). |
| Crossref | Gratis | Tidak perlu (email opsional) | Cadangan verifikasi bila jatah OpenAlex habis. |
| Semantic Scholar | Gratis | Opsional (gratis lewat formulir) | |
| Google Scholar | 250 pencarian/bulan gratis | Wajib (SerpApi) | Tidak ada API resmi Google Scholar; judul diverifikasi ulang. |
| CORE | Gratis untuk akademik | Wajib | Artikel akses terbuka dari repositori kampus. |
| Scite | Paket Pro | Wajib | Endpoint `api_partner/search`. |
| Consensus | Kredit paket Pro/Deep | Wajib | |
| SciSpace | Beta (kunci uji 500 kredit/bulan) | Wajib | |
| Perplexity | Berbayar | Wajib (bisa memakai kunci di tab AI) | Search API dibatasi ke domain akademik; hanya hasil yang cocok di OpenAlex/Crossref yang dipakai. |

Label kuartil (Q1–Q4) dan filter "Kualitas jurnal" memakai data SCImago SJR yang diunduh (atau diimpor dari berkas CSV scimagojr.com) dan disimpan di laptop.

Bentuk respons Scite, Consensus, dan SciSpace belum diuji dengan kunci sungguhan; adaptornya membaca beberapa nama kolom umum dan semua hasilnya tetap diverifikasi ke OpenAlex/Crossref.

## Yang berubah dibanding versi claude.ai

- **Review, revisi, grammar, terjemahan, copyedit, Tanya Pembimbing**: memakai penyedia di Pengaturan (bukan akun claude.ai).
- **Google Drive**: tidak tersedia. Unduh berkas dari Drive lalu pilih lewat tombol unggah.
- **Unduhan**: memakai dialog Simpan Windows.
- Pustaka (JSZip, jsPDF, pdf.js) dibundel, jadi pemeriksaan otomatis berjalan tanpa internet. Fitur AI dan pencarian literatur tetap butuh internet.

## Pengembangan

```bash
cd desktop
npm install
npm start        # menyiapkan app/index.html dari ../index.html lalu membuka aplikasi
npm run dist     # membuat installer NSIS (dijalankan di Windows / GitHub Actions)
```

`scripts/build-app.js` menyalin `../index.html` dan menerapkan tambalan kecil (tema NOR, jembatan AI, teks). Bila `index.html` berubah sehingga tambalan tidak cocok, build berhenti dan menyebut tambalan mana yang gagal. Installer dibangun otomatis oleh workflow `.github/workflows/desktop-windows.yml` di runner Windows dan diterbitkan sebagai rilis `desktop-v<versi>`.
