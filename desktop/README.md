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
| Kustom | — | Penyedia apa pun yang kompatibel OpenAI Chat Completions (atau Anthropic Messages). |

Tiap penyedia punya tiga tingkat model (Cepat, Standar, Teliti) yang bisa diganti; tombol **Muat daftar model** mengambil model aktif dari penyedia. Kunci disimpan terenkripsi dengan Windows DPAPI (Electron `safeStorage`) di `%APPDATA%\KTI Checker NOR\settings.json` dan hanya dikirim ke penyedia yang dipilih.

## Yang berubah dibanding versi claude.ai

- **Review, revisi, grammar, terjemahan, copyedit, Tanya Pembimbing**: memakai penyedia di Pengaturan AI (bukan akun claude.ai).
- **Pencarian literatur**: Scite → OpenAlex, Consensus → Crossref, SciSpace → Semantic Scholar (cadangan OpenAlex). Semua gratis tanpa kunci. Status penarikan (retraction) diambil dari OpenAlex; label kuartil Scopus/SJR tidak tersedia.
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
