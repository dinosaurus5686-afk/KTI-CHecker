/* KTI Checker NOR — jembatan desktop.
   Menyediakan window.claude.use("sample" | "downloads" | "mcp" | "permissions") seperti di claude.ai,
   tetapi memakai API key milik pengguna (Gemini, ClassAI Router, OpenAI, Anthropic, OpenRouter, kustom),
   dialog simpan Windows, dan basis data literatur terbuka (OpenAlex, Crossref, Semantic Scholar). */
(function () {
  "use strict";
  const D = window.ktiDesktop;
  if (!D) { console.warn("ktiDesktop tidak tersedia: bridge.js hanya berjalan di aplikasi desktop."); return; }

  let SETTINGS = null, PROVIDERS = null;
  const ready = Promise.all([D.getSettings(), D.providers()]).then(([s, p]) => { SETTINGS = s; PROVIDERS = p; updateBadge(); });

  const configured = () => {
    if (!SETTINGS) return false;
    const p = SETTINGS.providers[SETTINGS.provider];
    return !!(p && p.hasKey);
  };
  const provLabel = () => SETTINGS && PROVIDERS && PROVIDERS[SETTINGS.provider] ? PROVIDERS[SETTINGS.provider].label : "";
  const modelFor = tier => {
    if (!SETTINGS || !PROVIDERS) return "";
    const id = SETTINGS.provider, def = PROVIDERS[id] || { models: {} }, p = SETTINGS.providers[id] || {};
    const m = Object.assign({}, def.models, p.models || {});
    return m[tier] || m.default || "";
  };

  /* ─────────── AI (pengganti "sample") ─────────── */
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej({ code: "cancelled" }); }, { once: true });
  });
  // Antrean sederhana: paling banyak 3 permintaan berjalan bersamaan (tingkat gratis Gemini mudah kena 429).
  let running = 0; const waiters = [];
  const acquire = () => running < 3 ? (running++, Promise.resolve()) : new Promise(r => waiters.push(r));
  const release = () => { const w = waiters.shift(); if (w) w(); else running--; };

  async function callAI(messages, opts, system) {
    opts = opts || {};
    await ready;
    if (!configured()) throw { code: "not_granted", message: "API key belum diisi. Buka Pengaturan AI." };
    const tier = ["quick", "default", "complex"].includes(opts.modelTier) ? opts.modelTier : "default";
    const signal = opts.signal;
    if (signal && signal.aborted) throw { code: "cancelled" };
    const norm = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: typeof m.content === "string" ? m.content : (m.content || []).map(c => c.text || "").join("\n") }));
    await acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        const h = D.ai({ messages: norm, system, tier, stream: !!opts.onText }, opts.onText ? (text => { try { opts.onText({ text }); } catch (e) {} }) : null);
        const onAbort = () => h.abort();
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
        let r;
        try { r = await h.promise; } finally { if (signal) signal.removeEventListener("abort", onAbort); }
        if (r.ok) { lastStatus = { ok: true, model: r.model, at: Date.now() }; updateBadge(); return r.text; }
        const e = r.error || {};
        if (e.code === "cancelled" || (signal && signal.aborted)) throw { code: "cancelled" };
        const retriable = e.code === "rate_limited" || /^http_5\d\d$/.test(e.code) || e.code === "network";
        if (retriable && attempt < 3 && !/402|kredit|saldo/i.test(e.message || "")) {
          window.toast && window.toast(`Penyedia AI sibuk (${e.code === "rate_limited" ? "batas per menit" : "galat sementara"}). Mencoba lagi…`);
          await sleep([6000, 15000, 30000][attempt], signal);
          continue;
        }
        lastStatus = { ok: false, msg: e.message, at: Date.now() }; updateBadge();
        try { (window.toast || console.warn)(e.message || "Permintaan AI gagal."); } catch (_) {}
        throw { code: e.code || "error", message: e.message };
      }
    } finally { release(); }
  }
  let lastStatus = null;

  const JSON_SYS = "Anda asisten akademik yang teliti. Ikuti instruksi pengguna dengan saksama. Balas HANYA dengan satu nilai JSON yang valid (objek atau larik) sesuai format yang diminta: tanpa penjelasan, tanpa teks pembuka, tanpa blok kode markdown. Pastikan semua tanda kutip di dalam string di-escape dengan benar.";

  function parseJSONLoose(txt) {
    let t = String(txt || "").trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
    if (fence) t = fence[1].trim();
    try { return JSON.parse(t); } catch (e) {}
    const i = t.search(/[\[{]/);
    if (i < 0) throw new Error("no json");
    t = t.slice(i);
    const lastObj = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    const cut = lastObj >= 0 ? t.slice(0, lastObj + 1) : t;
    try { return JSON.parse(cut); } catch (e) {}
    const clean = s => s.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
    try { return JSON.parse(clean(cut)); } catch (e) {}
    // Perbaiki keluaran yang terpotong: tutup string dan kurung yang masih terbuka.
    let s = t, stack = [], inStr = false, esc = false, lastSafe = -1;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") { stack.pop(); lastSafe = k; }
      else if (c === ",") lastSafe = k - 1;
    }
    let base = s;
    if (inStr) base += '"';
    let fixed = clean(base + stack.slice().reverse().join(""));
    try { return JSON.parse(fixed); } catch (e) {}
    if (lastSafe > 0) {
      s = t.slice(0, lastSafe + 1); stack = []; inStr = false; esc = false;
      for (const c of s) {
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]"); else if (c === "}" || c === "]") stack.pop();
      }
      try { return JSON.parse(clean(s + stack.reverse().join(""))); } catch (e) {}
    }
    throw new Error("invalid json");
  }

  const sample = async function (messages, opts) {
    const text = await callAI(Array.isArray(messages) ? messages : [{ role: "user", content: String(messages) }], opts, null);
    return { text };
  };
  sample.json = async function (prompt, opts) {
    const msgs = Array.isArray(prompt) ? prompt : [{ role: "user", content: String(prompt) }];
    const text = await callAI(msgs, opts, JSON_SYS);
    try { return parseJSONLoose(text); }
    catch (e) {
      // Satu kali minta model memperbaiki JSON-nya sendiri.
      try {
        const fix = await callAI([{ role: "user", content: "Teks berikut seharusnya JSON valid tetapi rusak atau terpotong. Kembalikan versi JSON yang valid dengan isi yang sama (lengkapi bagian yang terpotong secara wajar). Balas HANYA JSON.\n\n" + text.slice(0, 60000) }], { modelTier: "quick", signal: opts && opts.signal }, JSON_SYS);
        return parseJSONLoose(fix);
      } catch (e2) {
        if (e2 && e2.code === "cancelled") throw e2;
        throw { code: "invalid_json", message: "Jawaban AI bukan JSON yang valid. Coba lagi atau pilih model lain." };
      }
    }
  };

  /* ─────────── Unduhan (dialog simpan Windows) ─────────── */
  const downloads = {
    async save({ filename, data }) {
      let payload, isText = false;
      if (typeof data === "string") { payload = data; isText = true; }
      else if (data instanceof Blob) payload = new Uint8Array(await data.arrayBuffer());
      else if (data instanceof ArrayBuffer) payload = new Uint8Array(data);
      else if (ArrayBuffer.isView(data)) payload = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      else { payload = JSON.stringify(data); isText = true; }
      const r = await D.saveFile(filename, payload, isText);
      if (!r || !r.ok) throw { code: "declined" };
      return { path: r.path };
    }
  };

  /* ─────────── Literatur: OpenAlex, Crossref, Semantic Scholar ─────────── */
  async function getJSON(url, signal) {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(url, { signal }).catch(e => { if (signal && signal.aborted) throw { code: "cancelled" }; throw { code: "network", message: String(e) }; });
      if (r.status === 429 && i < 2) { await sleep(1500 * (i + 1), signal); continue; }
      if (!r.ok) throw { code: r.status === 429 ? "rate_limited" : "http_" + r.status, message: "HTTP " + r.status };
      return r.json();
    }
  }
  const absFromInv = inv => {
    if (!inv) return "";
    const arr = [];
    for (const [w, pos] of Object.entries(inv)) for (const p of pos) arr[p] = w;
    return arr.filter(Boolean).join(" ");
  };
  const oaToHit = w => ({
    doi: String(w.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""),
    title: w.title || w.display_name || "",
    authors: (w.authorships || []).map(a => ({ authorName: (a.author && a.author.display_name) || "" })).filter(a => a.authorName),
    year: w.publication_year || null,
    journal: (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || "",
    volume: (w.biblio && w.biblio.volume) || "",
    issue: (w.biblio && w.biblio.issue) || "",
    page: w.biblio && w.biblio.first_page ? (w.biblio.first_page + (w.biblio.last_page && w.biblio.last_page !== w.biblio.first_page ? "–" + w.biblio.last_page : "")) : "",
    abstract: absFromInv(w.abstract_inverted_index).slice(0, 1200),
    citedBy: w.cited_by_count || 0,
    editorialNotices: w.is_retracted ? [{ status: "Retracted" }] : []
  });
  const OA = "https://api.openalex.org/works";
  const oaSel = "&select=doi,title,display_name,authorships,publication_year,primary_location,biblio,abstract_inverted_index,cited_by_count,is_retracted,type";
  async function openAlex(args, signal) {
    if (Array.isArray(args.titles) && args.titles.length) {
      const hits = [];
      await Promise.all(args.titles.map(async t => {
        const q = String(t).replace(/[,:|!*()"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 250);
        if (!q) return;
        try {
          const j = await getJSON(`${OA}?filter=title.search:${encodeURIComponent(q)}&per-page=2${oaSel}`, signal);
          (j.results || []).forEach(w => hits.push(oaToHit(w)));
        } catch (e) { if (e && e.code === "cancelled") throw e; }
      }));
      return { hits };
    }
    const term = String(args.term || args.query || "").replace(/\bAND\b|\bOR\b/g, " ").replace(/"/g, "").replace(/\s+/g, " ").trim();
    const f = ["type:article|review"]; if (args.date_from) f.push("from_publication_date:" + String(args.date_from).slice(0, 4) + "-01-01");
    const j = await getJSON(`${OA}?search=${encodeURIComponent(term)}&filter=${f.join(",")}&per-page=${Math.min(25, args.limit || 6)}${oaSel}`, signal);
    return { hits: (j.results || []).map(oaToHit) };
  }
  async function crossref(args, signal) {
    const q = String(args.query || "").slice(0, 300);
    let url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=8&filter=type:journal-article${args.year_min ? ",from-pub-date:" + args.year_min : ""}&select=DOI,title,author,container-title,issued,volume,issue,page,abstract,is-referenced-by-count,type`;
    const j = await getJSON(url, signal);
    const items = (j.message && j.message.items) || [];
    return {
      papers: items.map(it => ({
        title: (it.title || [])[0] || "",
        authors: (it.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ") || a.name || "").filter(Boolean),
        year: it.issued && it.issued["date-parts"] && it.issued["date-parts"][0] ? it.issued["date-parts"][0][0] : null,
        journal: (it["container-title"] || [])[0] || "",
        volume: it.volume || "", issue: it.issue || "", page: it.page || "",
        doi: it.DOI || "",
        abstract: String(it.abstract || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        citations: it["is-referenced-by-count"] || 0,
        publication_type: "journal-article"
      })).filter(p => p.title)
    };
  }
  async function semanticScholar(args, signal) {
    const q = String(args.searchQuestion || args.query || "").slice(0, 400);
    try {
      const j = await getJSON(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=8&fields=title,year,authors,venue,journal,externalIds,abstract,publicationTypes,citationCount`, signal);
      return {
        data: (j.data || []).map(p => ({
          title: p.title, authors: (p.authors || []).map(a => a.name), year: p.year,
          journal: (p.journal && p.journal.name) || p.venue || "",
          volume: (p.journal && p.journal.volume) || "", page: (p.journal && p.journal.pages || "").trim(),
          doi: (p.externalIds && p.externalIds.DOI) || "", abstract: p.abstract || "",
          publication_type: (p.publicationTypes || []).join(" ") || "JournalArticle"
        }))
      };
    } catch (e) {
      if (e && e.code === "cancelled") throw e;
      // Semantic Scholar tanpa kunci sering membatasi; pakai OpenAlex sebagai cadangan.
      const r = await openAlex({ term: q.split(/\s+/).slice(0, 12).join(" "), limit: 8 }, signal);
      return { data: r.hits.map(h => ({ title: h.title, authors: h.authors.map(a => a.authorName), year: h.year, journal: h.journal, volume: h.volume, issue: h.issue, page: h.page, doi: h.doi, abstract: h.abstract, publication_type: "JournalArticle" })) };
    }
  }
  const mcp = {
    async describeTool(server, tool) {
      if (server === "SciSpace") return { inputSchema: { type: "object", properties: { searchQuestion: { type: "string" } }, required: ["searchQuestion"] } };
      return { inputSchema: { type: "object", properties: {} } };
    },
    async callTool(server, tool, args, opts) {
      const signal = opts && opts.signal;
      args = args || {};
      try {
        if (server === "Scite" && tool === "search_literature") return { payload: await openAlex(args, signal) };
        if (server === "Consensus" && tool === "search") return { payload: await crossref(args, signal) };
        if (server === "SciSpace") return { payload: await semanticScholar(args, signal) };
      } catch (e) {
        if (signal && signal.aborted) throw { code: "cancelled" };
        throw e && e.code ? e : { code: "network", message: String(e) };
      }
      throw { code: "server_not_connected", message: server + " tidak tersedia di aplikasi desktop." };
    }
  };

  window.claude = {
    async use(name) {
      await ready;
      if (name === "sample") return configured() ? sample : null;
      if (name === "downloads") return downloads;
      if (name === "mcp") return mcp;
      return null;
    }
  };

  /* ─────────── Banner bila AI belum diatur ─────────── */
  window.__ktiBanner = function () {
    return `<div class="notice err nor-notice" role="alert" style="margin-bottom:16px;align-items:flex-start"><div style="flex:1;min-width:0"><b>AI belum diatur.</b> Review reviewer, profil reviewer, revisi, grammar, terjemahan, dan copyedit memakai API key Anda sendiri. Pilih penyedia (mis. <b>Google AI Studio</b> atau <b>ClassAI Router</b>), tempel API key, lalu simpan.
      <div class="toolbar" style="margin:10px 0 0"><button class="btn sm primary" type="button" onclick="window.ktiOpenSettings()">Buka Pengaturan AI</button></div>
      <p class="small muted" style="margin:8px 0 0">Pemeriksaan otomatis, LOA &amp; Invoice, dan template tetap berjalan tanpa API key.</p></div></div>`;
  };

  function applyToApp() {
    try {
      if (typeof S === "undefined") return;
      S.sample = configured() ? sample : null;
      S.downloads = downloads; S.mcp = mcp; S.sampleChecked = true;
      if (S.sample) { S.claudeWhy = null; S.aiErr = ""; if (S.jr) S.jr.err = ""; }
      if (typeof render === "function") render();
    } catch (e) { console.warn(e); }
  }

  function updateBadge() {
    const lab = document.getElementById("aiProvLabel"), dot = document.getElementById("aiDot");
    if (!lab || !SETTINGS) return;
    if (!configured()) { lab.textContent = "Belum diatur: klik untuk mengisi API key"; dot.className = "dot off"; return; }
    lab.textContent = provLabel() + " · " + modelFor("default");
    dot.className = "dot " + (lastStatus && !lastStatus.ok ? "bad" : "on");
    dot.title = lastStatus && !lastStatus.ok ? (lastStatus.msg || "") : "Siap";
  }

  /* ─────────── Layar Pengaturan AI ─────────── */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let draft = null;

  function openSettings() {
    if (!SETTINGS) return ready.then(openSettings);
    draft = JSON.parse(JSON.stringify(SETTINGS));
    draft.keys = {};
    let ov = document.getElementById("norSettings");
    if (!ov) { ov = document.createElement("div"); ov.id = "norSettings"; ov.className = "nor-ov"; document.body.appendChild(ov); }
    renderSettings();
    ov.hidden = false;
    document.addEventListener("keydown", escClose);
  }
  function escClose(e) { if (e.key === "Escape") closeSettings(); }
  function closeSettings() { const ov = document.getElementById("norSettings"); if (ov) ov.hidden = true; document.removeEventListener("keydown", escClose); }

  function renderSettings(msg) {
    const ov = document.getElementById("norSettings");
    const id = draft.provider, def = PROVIDERS[id], p = draft.providers[id];
    const m = Object.assign({}, def.models, p.models || {});
    const list = p.modelList || [];
    const dl = list.length ? `<datalist id="norModels">${list.map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : "";
    const tier = (k, label, hint) => `<label class="nor-f"><span>${label}<em>${hint}</em></span><input list="norModels" data-model="${k}" value="${esc(m[k] || "")}" placeholder="nama model"></label>`;
    ov.innerHTML = `<div class="nor-dlg" role="dialog" aria-modal="true" aria-labelledby="norSetT">
      <div class="nor-dlg-h"><img src="logo-mark.png" alt=""><div><h2 id="norSetT">Pengaturan AI</h2><p>Pilih penyedia dan tempel API key Anda. Kunci disimpan terenkripsi di laptop ini saja.</p></div><button class="nor-x" type="button" data-nor="close" aria-label="Tutup">✕</button></div>
      <div class="nor-provs">${Object.entries(PROVIDERS).map(([k, d]) => `<button type="button" class="nor-prov ${k === id ? "on" : ""}" data-prov="${k}"><b>${esc(d.label)}</b><small>${draft.providers[k].hasKey || draft.keys[k] ? "✓ kunci tersimpan" : "belum ada kunci"}</small></button>`).join("")}</div>
      <div class="nor-body">
        ${def.note ? `<p class="nor-note">${esc(def.note)}</p>` : ""}
        <label class="nor-f"><span>API key ${def.keyUrl ? `<a href="${esc(def.keyUrl)}" target="_blank" rel="noopener">Ambil kunci di ${esc(new URL(def.keyUrl).host)} ↗</a>` : ""}</span>
          <div class="nor-row"><input type="password" id="norKey" autocomplete="off" spellcheck="false" placeholder="${p.hasKey ? "Tersimpan (" + esc(p.keyHint) + "). Tempel kunci baru untuk mengganti." : "Tempel API key " + esc(def.keyHint || "")}" value="${esc(draft.keys[id] || "")}">
          <button type="button" class="btn sm" data-nor="peek">Lihat</button>${p.hasKey ? `<button type="button" class="btn sm" data-nor="delkey">Hapus</button>` : ""}</div></label>
        <label class="nor-f"><span>Base URL<em>${id === "custom" ? "wajib, mis. https://api.deepseek.com/v1" : "biarkan kosong untuk bawaan"}</em></span><input id="norBase" value="${esc(p.baseUrl || "")}" placeholder="${esc(def.baseUrl || "https://…/v1")}"></label>
        ${id === "custom" ? `<label class="nor-f"><span>Format API</span><select id="norFmt"><option value="openai" ${p.format !== "anthropic" ? "selected" : ""}>OpenAI Chat Completions</option><option value="anthropic" ${p.format === "anthropic" ? "selected" : ""}>Anthropic Messages</option></select></label>` : ""}
        <div class="nor-models"><div class="nor-models-h"><b>Model</b><button type="button" class="btn sm" data-nor="models">Muat daftar model</button>${list.length ? `<span class="small muted">${list.length} model tersedia, ketik untuk mencari</span>` : ""}</div>
          ${tier("quick", "Cepat", "kueri sumber, tugas ringan")}
          ${tier("default", "Standar", "review, grammar, profil reviewer")}
          ${tier("complex", "Teliti", "mode teliti, copyedit artikel")}
          ${dl}
        </div>
        <details class="nor-adv"><summary>Lanjutan</summary>
          <label class="nor-f"><span>Batas token keluaran<em>kosong = bawaan penyedia (Anthropic: 16000)</em></span><input id="norMax" inputmode="numeric" value="${esc(draft.maxTokens || "")}" placeholder="mis. 16000"></label>
          <label class="nor-f"><span>Temperatur<em>kosong = bawaan model</em></span><input id="norTemp" inputmode="decimal" value="${esc(draft.temperature || "")}" placeholder="mis. 0.3"></label>
        </details>
        ${msg ? `<div class="nor-msg ${msg.ok ? "ok" : "err"}">${esc(msg.text)}</div>` : ""}
      </div>
      <div class="nor-dlg-f"><button type="button" class="btn" data-nor="test">Uji koneksi</button><span style="flex:1"></span><button type="button" class="btn" data-nor="close">Batal</button><button type="button" class="btn primary" data-nor="save">Simpan &amp; pakai</button></div>
    </div>`;
  }
  function collect() {
    const id = draft.provider, p = draft.providers[id];
    const k = document.getElementById("norKey"); if (k && k.value.trim()) draft.keys[id] = k.value.trim();
    const b = document.getElementById("norBase"); if (b) p.baseUrl = b.value.trim();
    const f = document.getElementById("norFmt"); if (f) p.format = f.value;
    p.models = p.models || {};
    document.querySelectorAll("#norSettings [data-model]").forEach(i => { p.models[i.dataset.model] = i.value.trim(); });
    const mx = document.getElementById("norMax"); if (mx) draft.maxTokens = mx.value.trim();
    const tp = document.getElementById("norTemp"); if (tp) draft.temperature = tp.value.trim();
  }
  async function persist() {
    const patch = { provider: draft.provider, maxTokens: draft.maxTokens, temperature: draft.temperature, providers: {} };
    for (const [k, p] of Object.entries(draft.providers)) {
      patch.providers[k] = { baseUrl: p.baseUrl, models: p.models || {}, modelList: p.modelList || [] };
      if (p.format) patch.providers[k].format = p.format;
      if (draft.keys[k]) patch.providers[k].key = draft.keys[k];
      if (p._delete) patch.providers[k].key = null;
    }
    SETTINGS = await D.saveSettings(patch);
    const keep = draft.provider;
    draft = Object.assign(JSON.parse(JSON.stringify(SETTINGS)), { keys: {} }); draft.provider = keep;
  }
  document.addEventListener("click", async e => {
    const t = e.target.closest && e.target.closest("#btnAISet");
    if (t) { e.preventDefault(); return openSettings(); }
    const ov = document.getElementById("norSettings"); if (!ov || ov.hidden || !ov.contains(e.target)) return;
    if (e.target === ov) return closeSettings();
    const pv = e.target.closest("[data-prov]");
    if (pv) { collect(); draft.provider = pv.dataset.prov; return renderSettings(); }
    const b = e.target.closest("[data-nor]"); if (!b) return;
    const act = b.dataset.nor;
    if (act === "close") return closeSettings();
    if (act === "peek") { const k = document.getElementById("norKey"); k.type = k.type === "password" ? "text" : "password"; return; }
    collect();
    if (act === "delkey") { draft.providers[draft.provider]._delete = true; delete draft.keys[draft.provider]; await persist(); applyToApp(); updateBadge(); return renderSettings({ ok: true, text: "Kunci dihapus." }); }
    if (act === "models") {
      b.disabled = true; b.textContent = "Memuat…";
      const p = draft.providers[draft.provider];
      const r = await D.listModels(draft.provider, { key: draft.keys[draft.provider], baseUrl: p.baseUrl, format: p.format });
      if (r.ok) { p.modelList = r.list; renderSettings({ ok: true, text: `${r.list.length} model dimuat. Ketik di kolom model untuk memilih.` }); }
      else renderSettings({ ok: false, text: "Daftar model gagal dimuat: " + r.error });
      return;
    }
    if (act === "save" || act === "test") {
      b.disabled = true; b.textContent = act === "save" ? "Menyimpan…" : "Menguji…";
      try { await persist(); } catch (err) { return renderSettings({ ok: false, text: "Gagal menyimpan: " + (err && err.message || err) }); }
      applyToApp(); updateBadge();
      if (!configured()) return renderSettings({ ok: false, text: "Tersimpan, tetapi API key untuk penyedia ini masih kosong." });
      try {
        const h = D.ai({ messages: [{ role: "user", content: "Balas persis dengan kata: SIAP" }], tier: "quick", stream: false });
        const r = await h.promise;
        if (!r.ok) throw r.error;
        lastStatus = { ok: true }; updateBadge();
        if (act === "save") { closeSettings(); window.toast && window.toast(`AI siap: ${provLabel()} (${r.model}).`); }
        else renderSettings({ ok: true, text: `Berhasil. Model ${r.model} menjawab: "${String(r.text).trim().slice(0, 60)}"` });
      } catch (err) {
        lastStatus = { ok: false, msg: err && err.message }; updateBadge();
        renderSettings({ ok: false, text: (act === "save" ? "Tersimpan, tetapi uji koneksi gagal: " : "Uji koneksi gagal: ") + ((err && err.message) || err) });
      }
    }
  });
  window.ktiOpenSettings = openSettings;

  document.addEventListener("DOMContentLoaded", () => {
    updateBadge();
    ready.then(() => { if (!configured()) setTimeout(openSettings, 600); });
  });
})();
