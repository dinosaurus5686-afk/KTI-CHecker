// Daftar penyedia AI. Model per tingkat: quick (cepat), default (standar), complex (teliti).
// Semua bisa diubah di layar Pengaturan AI; tombol "Muat daftar model" mengambil model terbaru dari penyedia.
const PROVIDERS = {
  gemini: {
    label: "Google AI Studio (Gemini)",
    keyUrl: "https://aistudio.google.com/api-keys",
    keyHint: "AIza…",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    format: "openai",
    models: { quick: "gemini-flash-lite-latest", default: "gemini-flash-latest", complex: "gemini-pro-latest" },
    note: "Kunci gratis dari Google AI Studio. Tingkat gratis punya batas permintaan per menit; bila muncul galat 429, tunggu sebentar atau pakai model Flash."
  },
  classai: {
    label: "ClassAI Router",
    keyUrl: "https://router.classai.id/dashboard",
    keyHint: "sk_live_…",
    baseUrl: "https://router.classai.id/v1",
    format: "openai",
    models: { quick: "gemini-3.8-flash", default: "claude-sonnet-5.5", complex: "claude-opus-5.5" },
    note: "Satu kunci untuk banyak model (Claude, GPT, Gemini, DeepSeek, Qwen, dll.). Buat kunci di Dashboard → API Keys. Tekan Muat daftar model untuk melihat model aktif dan harganya."
  },
  openai: {
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
    label: "Anthropic (Claude API)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
    baseUrl: "https://api.anthropic.com/v1",
    format: "anthropic",
    models: { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" },
    note: ""
  },
  openrouter: {
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-…",
    baseUrl: "https://openrouter.ai/api/v1",
    format: "openai",
    models: { quick: "openrouter/auto", default: "openrouter/auto", complex: "openrouter/auto" },
    note: ""
  },
  custom: {
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
