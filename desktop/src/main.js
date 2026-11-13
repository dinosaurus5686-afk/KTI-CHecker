// KTI Checker NOR — proses utama Electron.
// Menyajikan app/ lewat protokol app://, menyimpan API key terenkripsi (safeStorage),
// dan meneruskan permintaan AI ke penyedia (Gemini, ClassAI Router, OpenAI, Anthropic, OpenRouter, kustom).
const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, safeStorage, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { PROVIDERS } = require("./providers");
const LIT = require("./literature");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const APP_DIR = path.join(__dirname, "..", "app");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

/* ───────────── Pengaturan & kunci ───────────── */
function defaultSettings() {
  return { provider: "gemini", providers: {}, maxTokens: "", temperature: "" };
}
function readRaw() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch (e) { return defaultSettings(); }
}
function writeRaw(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2), "utf8");
}
function encKey(k) {
  if (!k) return "";
  if (safeStorage.isEncryptionAvailable()) return "enc:" + safeStorage.encryptString(k).toString("base64");
  return "plain:" + Buffer.from(k, "utf8").toString("base64");
}
function decKey(v) {
  if (!v) return "";
  try {
    if (v.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
    if (v.startsWith("plain:")) return Buffer.from(v.slice(6), "base64").toString("utf8");
  } catch (e) { return ""; }
  return "";
}
// Untuk renderer: kunci tidak pernah dikirim utuh, hanya penanda.
function publicSettings() {
  const s = readRaw();
  const out = { provider: s.provider || "gemini", maxTokens: s.maxTokens || "", temperature: s.temperature || "", providers: {} };
  for (const id of Object.keys(PROVIDERS)) {
    const p = (s.providers || {})[id] || {};
    const k = decKey(p.key);
    out.providers[id] = {
      hasKey: !!k,
      keyHint: k ? (k.slice(0, 4) + "…" + k.slice(-4)) : "",
      baseUrl: p.baseUrl || "",
      format: p.format || "",
      models: p.models || {},
      modelList: p.modelList || []
    };
  }
  out.services = {};
  for (const id of Object.keys(LIT.SERVICES)) {
    const v = (s.services || {})[id] || {};
    const k = decKey(v.key);
    out.services[id] = { hasKey: !!k, keyHint: k ? (k.slice(0, 4) + "…" + k.slice(-4)) : "", enabled: v.enabled === undefined ? LIT.SERVICES[id].defaultOn !== false : !!v.enabled, extra: v.extra || {} };
  }
  return out;
}
function serviceConfig(id) {
  const s = readRaw(); const v = (s.services || {})[id] || {};
  return { key: decKey(v.key), enabled: v.enabled === undefined ? LIT.SERVICES[id].defaultOn !== false : !!v.enabled, extra: v.extra || {} };
}
function saveSettings(patch) {
  const s = readRaw();
  if (patch.provider) s.provider = patch.provider;
  if (patch.maxTokens !== undefined) s.maxTokens = String(patch.maxTokens || "");
  if (patch.temperature !== undefined) s.temperature = String(patch.temperature || "");
  s.providers = s.providers || {};
  for (const [id, p] of Object.entries(patch.providers || {})) {
    if (!PROVIDERS[id]) continue;
    const cur = s.providers[id] || {};
    if (p.key !== undefined) cur.key = p.key === null ? "" : (p.key ? encKey(String(p.key).trim()) : cur.key || "");
    if (p.baseUrl !== undefined) cur.baseUrl = String(p.baseUrl || "").trim();
    if (p.format !== undefined) cur.format = p.format;
    if (p.models !== undefined) cur.models = p.models;
    if (p.modelList !== undefined) cur.modelList = p.modelList;
    s.providers[id] = cur;
  }
  s.services = s.services || {};
  for (const [id, v] of Object.entries(patch.services || {})) {
    if (!LIT.SERVICES[id]) continue;
    const cur = s.services[id] || {};
    if (v.key !== undefined) cur.key = v.key === null ? "" : (v.key ? encKey(String(v.key).trim()) : cur.key || "");
    if (v.enabled !== undefined) cur.enabled = !!v.enabled;
    if (v.extra !== undefined) cur.extra = Object.assign({}, cur.extra || {}, v.extra);
    s.services[id] = cur;
  }
  writeRaw(s);
  return publicSettings();
}
function resolveProvider(id) {
  const s = readRaw();
  id = id || s.provider || "gemini";
  const def = PROVIDERS[id];
  if (!def) throw { code: "not_granted", message: "Penyedia AI tidak dikenal." };
  const p = (s.providers || {})[id] || {};
  const key = decKey(p.key);
  const baseUrl = (p.baseUrl || def.baseUrl || "").replace(/\/+$/, "");
  const format = p.format || def.format;
  if (!key && def.needsKey !== false) throw { code: "not_granted", message: "API key untuk " + def.label + " belum diisi. Buka Pengaturan AI." };
  if (!baseUrl) throw { code: "not_granted", message: "Base URL untuk " + def.label + " belum diisi." };
  const models = Object.assign({}, def.models, p.models || {});
  return { id, def, key, baseUrl, format, models, maxTokens: parseInt(s.maxTokens, 10) || 0, temperature: s.temperature === "" || s.temperature == null ? null : Number(s.temperature) };
}

/* ───────────── Panggilan AI ───────────── */
const active = new Map(); // reqId -> AbortController

function httpError(status, bodyText) {
  let msg = bodyText || "";
  try { const j = JSON.parse(bodyText); msg = (j.error && (j.error.message || j.error)) || j.message || msg; if (Array.isArray(j) && j[0] && j[0].error) msg = j[0].error.message; } catch (e) {}
  msg = String(typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 400);
  if (status === 429) return { code: "rate_limited", message: "Batas pemakaian/kuota penyedia tercapai (429). " + msg };
  if (status === 401 || status === 403) return { code: "not_granted", message: "API key ditolak (" + status + "). Periksa kunci di Pengaturan AI. " + msg };
  if (status === 402) return { code: "rate_limited", message: "Saldo/kredit penyedia habis (402). " + msg };
  return { code: "http_" + status, message: "Penyedia AI mengembalikan galat " + status + ". " + msg };
}

async function readSSE(res, onData, signal) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    if (signal.aborted) throw { code: "cancelled" };
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
      const data = block.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).replace(/^ /, "")).join("\n");
      if (!data || data === "[DONE]") continue;
      let ev = null;
      try { ev = JSON.parse(data); } catch (e) { continue; /* abaikan potongan rusak */ }
      onData(ev);
    }
  }
}

async function chat(cfg, { messages, system, tier, stream, jsonMode }, signal, onDelta) {
  const model = (cfg.models[tier] || cfg.models.default || "").trim();
  if (!model) throw { code: "not_granted", message: "Model untuk " + cfg.def.label + " belum dipilih. Buka Pengaturan AI." };
  let text = "";
  if (cfg.format === "anthropic") {
    const body = { model, max_tokens: cfg.maxTokens || 16000, messages, stream: !!stream };
    if (system) body.system = system;
    if (cfg.temperature != null && !isNaN(cfg.temperature)) body.temperature = cfg.temperature;
    const res = await net.fetch(cfg.baseUrl + "/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": cfg.key, "authorization": "Bearer " + cfg.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw httpError(res.status, await res.text());
    if (stream) {
      await readSSE(res, ev => {
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") { text += ev.delta.text; onDelta(text); }
        if (ev.type === "error") throw { code: "http_stream", message: (ev.error && ev.error.message) || "Galat streaming." };
      }, signal);
    } else {
      const j = await res.json();
      text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    }
    return { text, model };
  }
  // Format OpenAI Chat Completions (Gemini, ClassAI Router, OpenAI, OpenRouter, kustom)
  const msgs = system ? [{ role: "system", content: system }, ...messages] : messages;
  const body = { model, messages: msgs, stream: !!stream };
  if (cfg.maxTokens) body[cfg.def.maxTokensField || "max_tokens"] = cfg.maxTokens;
  if (cfg.temperature != null && !isNaN(cfg.temperature)) body.temperature = cfg.temperature;
  const headers = { "content-type": "application/json", "authorization": "Bearer " + cfg.key };
  if (cfg.id === "openrouter") { headers["HTTP-Referer"] = "https://nusantaraofresearch.local"; headers["X-Title"] = "KTI Checker NOR"; }
  const res = await net.fetch(cfg.baseUrl + "/chat/completions", { method: "POST", signal, headers, body: JSON.stringify(body) });
  if (!res.ok) throw httpError(res.status, await res.text());
  if (stream) {
    await readSSE(res, ev => {
      if (ev.error) throw { code: "http_stream", message: ev.error.message || JSON.stringify(ev.error) };
      const d = ev.choices && ev.choices[0] && ev.choices[0].delta;
      if (d && typeof d.content === "string" && d.content) { text += d.content; onDelta(text); }
    }, signal);
  } else {
    const j = await res.json();
    const m = j.choices && j.choices[0] && j.choices[0].message;
    text = (m && (typeof m.content === "string" ? m.content : (m.content || []).map(c => c.text || "").join(""))) || "";
  }
  return { text, model };
}

ipcMain.handle("ai:request", async (ev, reqId, payload) => {
  const ctl = new AbortController();
  active.set(reqId, ctl);
  const wc = ev.sender;
  let last = 0;
  try {
    const cfg = resolveProvider(payload.provider);
    const out = await chat(cfg, payload, ctl.signal, txt => {
      const now = Date.now();
      if (now - last > 120 && !wc.isDestroyed()) { last = now; wc.send("ai:delta", reqId, txt); }
    });
    if (!out.text) throw { code: "empty", message: "Penyedia AI tidak mengembalikan teks. Coba model lain atau naikkan batas token." };
    return { ok: true, text: out.text, model: out.model };
  } catch (e) {
    if (ctl.signal.aborted || (e && e.name === "AbortError")) return { ok: false, error: { code: "cancelled", message: "Dibatalkan." } };
    return { ok: false, error: { code: (e && e.code) || "network", message: (e && e.message) || String(e) } };
  } finally {
    active.delete(reqId);
  }
});
ipcMain.on("ai:abort", (ev, reqId) => { const c = active.get(reqId); if (c) c.abort(); });

ipcMain.handle("ai:listModels", async (ev, id, draft) => {
  try {
    const def = PROVIDERS[id];
    const s = readRaw(); const p = (s.providers || {})[id] || {};
    const key = (draft && draft.key) || decKey(p.key);
    const baseUrl = ((draft && draft.baseUrl) || p.baseUrl || def.baseUrl || "").replace(/\/+$/, "");
    const format = (draft && draft.format) || p.format || def.format;
    if (!key) return { ok: false, error: "Isi API key dulu." };
    const headers = format === "anthropic"
      ? { "x-api-key": key, "authorization": "Bearer " + key, "anthropic-version": "2023-06-01" }
      : { "authorization": "Bearer " + key };
    const res = await net.fetch(baseUrl + "/models" + (format === "anthropic" ? "?limit=1000" : ""), { headers });
    const t = await res.text();
    if (!res.ok) return { ok: false, error: httpError(res.status, t).message };
    const j = JSON.parse(t);
    const arr = j.data || j.models || [];
    const list = arr.map(m => String(m.id || m.name || "").replace(/^models\//, "")).filter(Boolean)
      .filter(x => !/embed|tts|imagen|veo|whisper|dall-e|moderation|audio|image-generation|aqa/i.test(x))
      .sort();
    return { ok: true, list };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle("settings:get", () => publicSettings());
ipcMain.handle("settings:save", (ev, patch) => saveSettings(patch || {}));
ipcMain.handle("settings:providers", () => PROVIDERS);
ipcMain.handle("settings:services", () => LIT.SERVICES);
// Pencarian literatur dijalankan di proses utama agar kunci tidak keluar ke halaman dan bebas CORS.
const litActive = new Map();
ipcMain.handle("lit:search", async (ev, reqId, id, args, draftKey) => {
  const ctl = new AbortController(); litActive.set(reqId, ctl);
  try {
    if (!LIT.SERVICES[id]) throw { code: "unknown", message: "Layanan tidak dikenal: " + id };
    const cfg = serviceConfig(id);
    if (draftKey) cfg.key = draftKey;
    const data = await LIT.search(id, args || {}, cfg, ctl.signal, { fetch: net.fetch, perplexityKey: () => { const r = readRaw(); return decKey(((r.providers || {}).perplexity || {}).key); } });
    return { ok: true, data };
  } catch (e) {
    if (ctl.signal.aborted) return { ok: false, error: { code: "cancelled" } };
    return { ok: false, error: { code: (e && e.code) || "network", message: (e && e.message) || String(e) } };
  } finally { litActive.delete(reqId); }
});
ipcMain.on("lit:abort", (ev, reqId) => { const c = litActive.get(reqId); if (c) c.abort(); });
ipcMain.handle("sjr:lookup", (ev, items) => LIT.sjrLookup(items || []));
ipcMain.handle("sjr:info", () => LIT.sjrInfo());
// Data kuartil SCImago: diunduh langsung dari scimagojr.com, atau diimpor dari berkas yang diunduh pengguna.
ipcMain.handle("sjr:download", async () => {
  const year = new Date().getFullYear() - 1;
  const urls = [`https://www.scimagojr.com/journalrank.php?out=xls&year=${year}`, "https://www.scimagojr.com/journalrank.php?out=xls"];
  let lastErr = "";
  for (const u of urls) {
    try {
      const r = await net.fetch(u, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KTI-Checker-NOR" } });
      if (!r.ok) { lastErr = "HTTP " + r.status; continue; }
      const t = await r.text();
      const data = LIT.parseSjrCsv(t, u.includes("year=") ? String(year) : "");
      return Object.assign({ ok: true }, LIT.saveSjr(data));
    } catch (e) { lastErr = (e && e.message) || String(e); }
  }
  return { ok: false, error: lastErr };
});
ipcMain.handle("sjr:import", async ev => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(win, { title: "Pilih berkas SJR dari scimagojr.com", filters: [{ name: "CSV SCImago", extensions: ["csv", "txt", "xls"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, error: "Dibatalkan." };
  try {
    const t = fs.readFileSync(r.filePaths[0], "utf8");
    const y = (/(19|20)\d{2}/.exec(path.basename(r.filePaths[0])) || [""])[0];
    return Object.assign({ ok: true }, LIT.saveSjr(LIT.parseSjrCsv(t, y)));
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});
// Uji kunci penyedia AI tertentu (tanpa mengubah penyedia aktif).
ipcMain.handle("ai:test", async (ev, id, draft) => {
  try {
    const def = PROVIDERS[id]; if (!def) throw { message: "Penyedia tidak dikenal." };
    const s = readRaw(); const p = (s.providers || {})[id] || {};
    const key = (draft && draft.key) || decKey(p.key);
    if (!key) throw { message: "Isi API key dulu." };
    const baseUrl = ((draft && draft.baseUrl) || p.baseUrl || def.baseUrl || "").replace(/\/+$/, "");
    if (!baseUrl) throw { message: "Isi Base URL dulu." };
    const models = Object.assign({}, def.models, p.models || {}, (draft && draft.models) || {});
    const cfg = { id, def, key, baseUrl, format: (draft && draft.format) || p.format || def.format, models, maxTokens: 0, temperature: null };
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    const out = await chat(cfg, { messages: [{ role: "user", content: "Balas persis dengan kata: SIAP" }], tier: "quick", stream: false }, ctl.signal, () => {});
    clearTimeout(t);
    return { ok: true, text: out.text, model: out.model };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

/* ───────────── Simpan berkas ───────────── */
ipcMain.handle("file:save", async (ev, { filename, data, isText }) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const ext = (path.extname(filename || "") || "").slice(1);
  const r = await dialog.showSaveDialog(win, {
    title: "Simpan berkas",
    defaultPath: path.join(app.getPath("documents"), filename || "berkas"),
    filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: "Semua berkas", extensions: ["*"] }] : undefined
  });
  if (r.canceled || !r.filePath) return { ok: false, code: "declined" };
  fs.writeFileSync(r.filePath, isText ? Buffer.from(data, "utf8") : Buffer.from(data));
  return { ok: true, path: r.filePath };
});
ipcMain.handle("file:reveal", (ev, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.handle("app:info", () => ({ version: app.getVersion(), userData: app.getPath("userData") }));

/* ───────────── Jendela ───────────── */
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 960, minHeight: 640,
    backgroundColor: "#1c0808",
    title: "KTI Checker NOR",
    icon: path.join(APP_DIR, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, spellcheck: false }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.loadURL("app://kti/index.html");
  return win;
}

app.whenReady().then(() => {
  LIT.setSjrFile(path.join(app.getPath("userData"), "sjr.json"));
  protocol.handle("app", req => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Berkas", submenu: [{ role: "reload", label: "Muat ulang" }, { role: "toggleDevTools", label: "Alat pengembang" }, { type: "separator" }, { role: "quit", label: "Keluar" }] },
    { label: "Edit", submenu: [{ role: "undo", label: "Urungkan" }, { role: "redo", label: "Ulangi" }, { type: "separator" }, { role: "cut", label: "Potong" }, { role: "copy", label: "Salin" }, { role: "paste", label: "Tempel" }, { role: "selectAll", label: "Pilih semua" }] },
    { label: "Tampilan", submenu: [{ role: "zoomIn", label: "Perbesar" }, { role: "zoomOut", label: "Perkecil" }, { role: "resetZoom", label: "Ukuran asli" }, { role: "togglefullscreen", label: "Layar penuh" }] }
  ]));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
