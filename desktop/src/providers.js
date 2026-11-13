// Daftar penyedia AI. Model per tingkat: quick (cepat), default (standar), complex (teliti).
// Semua bisa diubah di layar Pengaturan AI; tombol "Muat daftar model" mengambil model terbaru dari penyedia.
const PROVIDERS = {
  gemini: {
    free: "Gratis",
    guide: ["Buka aistudio.google.com/api-keys lalu masuk dengan akun Google.","Klik Create API key (bila diminta, pilih atau buat proyek baru).","Salin kunci yang diawali AIza… lalu tempel di kolom API key, klik Simpan, lalu Tes kunci.","Tingkat gratis tidak perlu kartu kredit, tetapi dibatasi jumlah permintaan per menit dan per hari. Bila sering muncul galat 429, pakai model Flash atau aktifkan penagihan di Google Cloud."],
    label: "Google AI Studio (Gemini)",
    keyUrl: "https://aistudio.google.com/api-keys",
    keyHint: "AIza…",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    format: "openai",
    models: { quick: "gemini-flash-lite-latest", default: "gemini-flash-latest", complex: "gemini-pro-latest" },
    note: "Kunci gratis dari Google AI Studio. Tingkat gratis punya batas permintaan per menit; bila muncul galat 429, tunggu sebentar atau pakai model Flash."
  },
  classai: {
    free: "Ada model gratis",
    guide: ["Buka router.classai.id lalu daftar atau masuk.","Buka Dashboard → API Keys, lalu buat kunci baru.","Salin kunci yang diawali sk_live_… lalu tempel di sini, Simpan, lalu Tes kunci.","Model berakhiran :free bisa dipakai tanpa saldo; model lain (Claude, GPT, Gemini Pro, dll.) memotong saldo/kredit. Klik Muat daftar model untuk melihat model aktif."],
    label: "ClassAI Router",
    keyUrl: "https://router.classai.id/dashboard",
    keyHint: "sk_live_…",
    baseUrl: "https://router.classai.id/v1",
    format: "openai",
    models: { quick: "gemini-3.8-flash", default: "claude-sonnet-5.5", complex: "claude-opus-5.5" },
    note: "Satu kunci untuk banyak model (Claude, GPT, Gemini, DeepSeek, Qwen, dll.). Buat kunci di Dashboard → API Keys. Tekan Muat daftar model untuk melihat model aktif dan harganya."
  },
  openai: {
    free: "Berbayar",
    guide: ["Buka platform.openai.com/api-keys lalu masuk.","Isi saldo di Billing (API OpenAI tidak punya tingkat gratis).","Klik Create new secret key, salin kunci sk-…, lalu tempel di sini."],
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    baseUrl: "https://api.openai.com/v1",
    format: "openai",
    maxTokensField: "max_completion_tokens",
    models: { quick: "gpt-5-mini", default: "gpt-5", complex: "gpt-5" },
    note: ""
  },
  anthropic: {
    free: "Berbayar",
    guide: ["Buka console.anthropic.com lalu masuk.","Isi kredit di Plans & Billing.","Buka Settings → API Keys, buat kunci, salin sk-ant-…, lalu tempel di sini."],
    label: "Anthropic (Claude API)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
    baseUrl: "https://api.anthropic.com/v1",
    format: "anthropic",
    models: { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" },
    note: ""
  },
  openrouter: {
    free: "Ada model gratis",
    guide: ["Buka openrouter.ai lalu masuk.","Buka Keys, klik Create Key, salin kunci sk-or-….","Model berakhiran :free gratis dengan batas harian; ketik nama modelnya di kolom model setelah Muat daftar model."],
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-…",
    baseUrl: "https://openrouter.ai/api/v1",
    format: "openai",
    models: { quick: "openrouter/auto", default: "openrouter/auto", complex: "openrouter/auto" },
    note: ""
  },
  perplexity: {
    free: "Berbayar",
    guide: ["Buka perplexity.ai/account/api lalu masuk.","Isi kredit API (Perplexity Pro mendapat kredit bulanan).","Klik Generate API Key, salin pplx-…, lalu tempel di sini.","Kunci yang sama dipakai untuk sumber literatur Perplexity (mode akademik) di tab Sumber literatur."],
    label: "Perplexity (Sonar)",
    keyUrl: "https://www.perplexity.ai/account/api",
    keyHint: "pplx-…",
    baseUrl: "https://api.perplexity.ai",
    format: "openai",
    models: { quick: "sonar", default: "sonar-pro", complex: "sonar-reasoning-pro" },
    note: "Model Sonar selalu mencari di web sebelum menjawab. Cocok untuk Tanya Pembimbing; untuk review panjang lebih baik Gemini atau Claude."
  },
  custom: {
    free: "",
    guide: ["Isi Base URL penyedia sampai /v1 (mis. https://api.deepseek.com/v1).","Tempel API key penyedia tersebut, Simpan, lalu Tes kunci."],
    label: "Kustom (kompatibel OpenAI)",
    keyUrl: "",
    keyHint: "",
    baseUrl: "",
    format: "openai",
    models: { quick: "", default: "", complex: "" },
    note: "Untuk router/penyedia lain yang kompatibel dengan OpenAI Chat Completions (mis. DeepSeek, Groq, Together, LM Studio lokal). Isi Base URL sampai /v1."
  }
};
module.exports = { PROVIDERS };
