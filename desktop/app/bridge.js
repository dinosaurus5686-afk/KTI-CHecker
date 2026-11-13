/* KTI Checker NOR — jembatan desktop.
   Menyediakan window.claude.use("sample" | "downloads" | "mcp" | "permissions") seperti di claude.ai,
   tetapi memakai API key milik pengguna (Gemini, ClassAI Router, OpenAI, Anthropic, OpenRouter, kustom),
   dialog simpan Windows, dan basis data literatur terbuka (OpenAlex, Crossref, Semantic Scholar). */
(function () {
  "use strict";
  const D = window.ktiDesktop;
  if (!D) { console.warn("ktiDesktop tidak tersedia: bridge.js hanya berjalan di aplikasi desktop."); return; }

  let SETTINGS = null, PROVIDERS = null, SERVICES = null, SJR_INFO = "";
  // Basis data literatur yang tampil di aplikasi (kunci = slot di KTI Checker, nilai = label).
  const SRC_DB = window.__KTI_SRC_DB = { scite: "OpenAlex", consensus: "Crossref", scispace: "Semantic Scholar" };
  const SLOT_TO_SVC = {};
  const ready = Promise.all([D.getSettings(), D.providers(), D.services(), D.sjrInfo()]).then(([s, p, sv, sj]) => { SETTINGS = s; PROVIDERS = p; SERVICES = sv; setSjrInfo(sj); syncSrcDb(); updateBadge(); });
  function setSjrInfo(sj) { SJR_INFO = sj ? `${sj.count.toLocaleString("id-ID")} jurnal SCImago${sj.year ? " (" + sj.year + ")" : ""} tersimpan di laptop ini.` : ""; }
  function svcUsable(id) { const d = SERVICES[id], st = SETTINGS.services[id]; return st && st.enabled && (d.key !== "required" || st.hasKey || (id === "perplexity" && SETTINGS.providers.perplexity && SETTINGS.providers.perplexity.hasKey)); }
  function syncSrcDb() {
    if (!SERVICES || !SETTINGS) return;
    for (const [id, d] of Object.entries(SERVICES)) {
      SLOT_TO_SVC[d.slot] = id;
      if (svcUsable(id)) SRC_DB[d.slot] = d.srcLabel || d.label; else if (!["scite", "consensus", "scispace"].includes(d.slot)) delete SRC_DB[d.slot];
    }
    try { if (typeof S !== "undefined" && S.srcOpt) for (const k of Object.keys(SRC_DB)) if (S.srcOpt[k] === undefined) S.srcOpt[k] = true; } catch (e) {}
  }
  window.__ktiSrcDefaults = () => { const o = { q: 2 }; Object.keys(SRC_DB).forEach(k => { o[k] = SERVICES ? svcUsable(SLOT_TO_SVC[k] || k) || ["scite", "consensus", "scispace"].includes(k) : true; }); return o; };

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

  /* ─────────── Literatur (semua lewat proses utama) ─────────── */
  async function lit(id, args, signal) {
    const h = D.lit(id, args);
    const onAbort = () => h.abort();
    if (signal) { if (signal.aborted) throw { code: "cancelled" }; signal.addEventListener("abort", onAbort, { once: true }); }
    try {
      const r = await h.promise;
      if (!r.ok) throw r.error || { code: "error" };
      return (r.data && r.data.papers) || [];
    } finally { if (signal) signal.removeEventListener("abort", onAbort); }
  }
  // Tambahkan label kuartil SJR dan buang jurnal di bawah batas kuartil yang dipilih (bila datanya ada).
  async function withQuartile(papers) {
    if (!papers.length) return papers;
    let qs = []; try { qs = await D.sjrLookup(papers.map(p => ({ issn: p.issn || [], journal: p.journal || "" }))); } catch (e) {}
    const maxQ = (() => { try { return (S.srcOpt && S.srcOpt.q) || 4; } catch (e) { return 4; } })();
    return papers.map((p, i) => { const q = qs[i]; if (q) { p.qn = +q.q.slice(1); p.quartile = `SJR ${q.q}${q.year ? " " + q.year : ""}`; } return p; })
      .filter(p => !p.qn || p.qn <= maxQ);
  }
  const toHit = p => ({ doi: p.doi, title: p.title, authors: (p.authors || []).map(a => ({ authorName: a })), year: p.year, journal: p.journal, volume: p.volume, issue: p.issue, page: p.page, abstract: p.abstract, quartile: p.quartile || "", editorialNotices: p.retracted ? [{ status: "Retracted" }] : [] });
  const toCand = p => ({ title: p.title, authors: p.authors || [], authorsText: (p.authors || []).join(", "), year: p.year, journal: p.journal, volume: p.volume || "", issue: p.issue || "", page: p.page || "", doi: p.doi || "", url: p.url || "", abstract: String(p.abstract || "").slice(0, 420), ptype: p.ptype || "", capped: false, cites: p.cites || null, quartile: p.quartile || "" });

  // Pencarian sumber tambahan (Google Scholar, CORE, Scite, Consensus, SciSpace, Perplexity) untuk KTI Checker.
  window.__ktiLit = async function (slot, o, signal) {
    const id = SLOT_TO_SVC[slot]; if (!id) return [];
    let ps = await lit(id, { q: o.q, question: o.question, yearFrom: o.nowY - 10, limit: 10, sjrMax: o.maxQ }, signal);
    ps = ps.filter(p => !p.retracted && (!p.year || p.year >= o.nowY - 10));
    // Kandidat tanpa DOI (Scholar, Perplexity, SciSpace) dilengkapi lewat DOI di URL bila ada; sisanya diverifikasi judul oleh KTI Checker.
    const withDoi = ps.filter(p => p.doi && (!p.authors.length || !p.journal));
    if (withDoi.length) {
      try {
        const full = await lit("openalex", { dois: withDoi.map(p => p.doi) }, signal);
        const m = new Map(full.map(f => [String(f.doi).toLowerCase(), f]));
        ps = ps.map(p => { const f = p.doi && m.get(p.doi.toLowerCase()); return f ? Object.assign({}, f, { cites: p.cites || f.cites }) : p; }).filter(p => !p.retracted);
      } catch (e) { if (e && e.code === "cancelled") throw e; }
    }
    return (await withQuartile(ps)).map(toCand);
  };

  const mcp = {
    async describeTool(server, tool) {
      if (server === "SciSpace") return { inputSchema: { type: "object", properties: { searchQuestion: { type: "string" } }, required: ["searchQuestion"] } };
      return { inputSchema: { type: "object", properties: {} } };
    },
    async callTool(server, tool, args, opts) {
      const signal = opts && opts.signal; args = args || {};
      try {
        if (server === "Scite" && tool === "search_literature") {
          let ps;
          const a = Array.isArray(args.titles) ? { titles: args.titles } : { q: args.term || args.query || "", yearFrom: args.date_from ? +String(args.date_from).slice(0, 4) : null, limit: args.limit || 6 };
          try { ps = await lit("openalex", a, signal); }
          catch (e) { if (e && e.code === "cancelled") throw e; ps = await lit("crossref", a, signal); } // cadangan bila jatah OpenAlex habis
          return { payload: { hits: (await withQuartile(ps)).map(toHit) } };
        }
        if (server === "Consensus" && tool === "search") {
          const ps = await withQuartile(await lit("crossref", { q: args.query, yearFrom: args.year_min, limit: 10 }, signal));
          return { payload: { papers: ps.map(p => Object.assign(toCand(p), { publication_type: "journal-article" })) } };
        }
        if (server === "SciSpace") {
          const q = args.searchQuestion || args.query || "";
          let ps;
          try { ps = await lit("semanticscholar", { question: q, limit: 8 }, signal); }
          catch (e) { if (e && e.code === "cancelled") throw e; ps = await lit("openalex", { q: q.split(/\s+/).slice(0, 12).join(" "), limit: 8 }, signal); }
          return { payload: { data: (await withQuartile(ps)).map(p => Object.assign(toCand(p), { publication_type: p.ptype || "JournalArticle" })) } };
        }
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

  /* ─────────── Layar Pengaturan (kartu per kunci) ─────────── */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let TAB = "ai";
  const UI = { modelList: {} };

  function badge(free) {
    if (!free) return "";
    const cls = /^gratis/i.test(free) ? "free" : /gratis/i.test(free) ? "mixed" : "paid";
    return `<span class="nk-badge ${cls}">${esc(free)}</span>`;
  }
  function guideBlock(d) {
    if (!d.guide || !d.guide.length) return "";
    const gratis = /gratis/i.test(d.free || "") ? " (gratis)" : "";
    return `<details class="nk-guide"><summary>Cara mendapatkan API key${gratis}</summary><ol>${d.guide.map(g => `<li>${esc(g)}</li>`).join("")}</ol>${d.keyUrl ? `<a href="${esc(d.keyUrl)}" target="_blank" rel="noopener">Buka ${esc(new URL(d.keyUrl).host)} ↗</a>` : ""}</details>`;
  }
  function keyCard(kind, id) {
    const isAI = kind === "ai";
    const d = isAI ? PROVIDERS[id] : SERVICES[id];
    const st = isAI ? SETTINGS.providers[id] : SETTINGS.services[id];
    const needsKey = isAI ? true : d.key !== "none";
    const active = isAI && SETTINGS.provider === id;
    const title = isAI ? `🔑 API key ${esc(d.short || d.label)}` : `${esc(d.icon || "📚")} ${esc(d.label)}`;
    const status = needsKey ? (st.hasKey ? `<span class="nk-st ok">✓ tersimpan (${esc(st.keyHint)})</span>` : (!isAI && d.key === "optional" ? `<span class="nk-st">kunci opsional</span>` : `<span class="nk-st">belum ada kunci</span>`)) : `<span class="nk-st ok">tanpa kunci</span>`;
    return `<section class="nk-card ${active ? "active" : ""}" data-card="${kind}:${id}">
      <h3>${title} ${badge(d.free)} ${active ? `<span class="nk-st on">dipakai</span>` : ""}</h3>
      <p class="nk-desc">${esc(d.desc || d.note || "")}</p>
      ${!isAI ? `<label class="nk-switch"><input type="checkbox" data-en="${id}" ${st.enabled ? "checked" : ""} ${needsKey && d.key !== "optional" && !st.hasKey ? "disabled" : ""}><span>Pakai saat mencari literatur</span></label>` : ""}
      ${needsKey ? `<label class="nk-lab">${esc(d.keyLabel || "API key")} ${status}</label>
      <div class="nk-row"><input type="password" class="nk-key" autocomplete="off" spellcheck="false" placeholder="${st.hasKey ? "•••••••••••••••• (tempel kunci baru untuk mengganti)" : "Tempel " + esc(d.keyHint || "API key")}"><button type="button" class="nk-eye" data-act="eye" title="Tampilkan/sembunyikan">👁</button></div>` : status}
      ${isAI && id === "custom" ? `<label class="nk-lab">Base URL</label><input class="nk-in nk-base" value="${esc(st.baseUrl || "")}" placeholder="https://…/v1"><label class="nk-lab">Format API</label><select class="nk-in nk-fmt"><option value="openai" ${st.format !== "anthropic" ? "selected" : ""}>OpenAI Chat Completions</option><option value="anthropic" ${st.format === "anthropic" ? "selected" : ""}>Anthropic Messages</option></select>` : ""}
      ${!isAI && d.extra ? d.extra.map(x => `<label class="nk-lab">${esc(x.label)}</label><input class="nk-in" data-extra="${esc(x.id)}" value="${esc((st.extra || {})[x.id] || "")}" placeholder="${esc(x.placeholder || "")}">`).join("") : ""}
      <div class="nk-acts">${needsKey || (!isAI && d.extra) ? `<button type="button" class="nk-btn gold" data-act="save">💾 Simpan</button>` : ""}<button type="button" class="nk-btn" data-act="test">🧪 Tes ${needsKey ? "kunci" : "koneksi"}</button>${isAI && !active && st.hasKey ? `<button type="button" class="nk-btn" data-act="use">⭐ Jadikan AI utama</button>` : ""}${needsKey && st.hasKey ? `<button type="button" class="nk-btn ghost" data-act="del">Hapus kunci</button>` : ""}</div>
      <div class="nk-msg" aria-live="polite"></div>
      ${guideBlock(d)}
    </section>`;
  }
  function activeCard() {
    const id = SETTINGS.provider, def = PROVIDERS[id], p = SETTINGS.providers[id] || {};
    const m = Object.assign({}, def.models, p.models || {});
    const list = UI.modelList[id] || p.modelList || [];
    const tier = (k, label, hint) => `<label class="nk-lab">${label} <em>${hint}</em></label><input class="nk-in" list="nkModels" data-model="${k}" value="${esc(m[k] || "")}">`;
    return `<section class="nk-card hero" data-card="active">
      <h3>🤖 AI yang dipakai</h3>
      <p class="nk-desc">Penyedia ini dipakai untuk review reviewer, revisi, grammar, terjemahan, copyedit, dan Tanya Pembimbing.</p>
      <label class="nk-lab">Penyedia</label>
      <select class="nk-in" id="nkProv">${Object.entries(PROVIDERS).map(([k, d]) => `<option value="${k}" ${k === id ? "selected" : ""}>${esc(d.label)}${SETTINGS.providers[k].hasKey ? " ✓" : " (belum ada kunci)"}</option>`).join("")}</select>
      ${tier("quick", "Model cepat", "kueri sumber, tugas ringan")}
      ${tier("default", "Model standar", "review, grammar, profil reviewer")}
      ${tier("complex", "Model teliti", "mode teliti, copyedit; pilih model terkuat")}
      ${list.length ? `<datalist id="nkModels">${list.map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}
      <div class="nk-acts"><button type="button" class="nk-btn gold" data-act="saveActive">💾 Simpan</button><button type="button" class="nk-btn" data-act="models">📋 Muat daftar model</button><button type="button" class="nk-btn" data-act="testActive">🧪 Tes</button>${list.length ? `<span class="nk-hint">${list.length} model tersedia; ketik untuk mencari</span>` : ""}</div>
      <div class="nk-msg" aria-live="polite"></div>
    </section>`;
  }
  function sjrCard() {
    return `<section class="nk-card" data-card="sjr"><h3>🏅 Kuartil jurnal (SCImago SJR) ${badge("Gratis")}</h3>
      <p class="nk-desc">Label Q1–Q4 dan filter "Kualitas jurnal" memakai peringkat SCImago (data Scopus). Data disimpan di laptop agar pencocokan cepat dan bisa luring.</p>
      <p class="nk-desc"><b>${SJR_INFO ? "✓ " + esc(SJR_INFO) : "Belum ada data kuartil."}</b></p>
      <div class="nk-acts"><button type="button" class="nk-btn gold" data-act="sjrDl">⬇️ ${SJR_INFO ? "Perbarui" : "Unduh"} data SJR</button><button type="button" class="nk-btn" data-act="sjrImp">📄 Impor berkas SJR</button></div>
      <div class="nk-msg" aria-live="polite"></div>
      <details class="nk-guide"><summary>Bila unduhan otomatis gagal</summary><ol><li>Buka scimagojr.com/journalrank.php di browser.</li><li>Klik tombol <b>Download data</b> di kanan atas tabel (berkas .csv).</li><li>Kembali ke sini, klik <b>Impor berkas SJR</b>, lalu pilih berkas tersebut.</li></ol><a href="https://www.scimagojr.com/journalrank.php" target="_blank" rel="noopener">Buka scimagojr.com ↗</a></details></section>`;
  }
  function advCard() {
    return `<section class="nk-card" data-card="adv"><h3>⚙️ Lanjutan</h3>
      <label class="nk-lab">Batas token keluaran <em>kosong = bawaan penyedia (Anthropic 16000). Naikkan bila review terpotong.</em></label><input class="nk-in" id="nkMax" inputmode="numeric" value="${esc(SETTINGS.maxTokens || "")}" placeholder="mis. 32000">
      <label class="nk-lab">Temperatur <em>kosong = bawaan model; 0–0.3 untuk penilaian yang konsisten</em></label><input class="nk-in" id="nkTemp" inputmode="decimal" value="${esc(SETTINGS.temperature || "")}" placeholder="mis. 0.2">
      <div class="nk-acts"><button type="button" class="nk-btn gold" data-act="saveAdv">💾 Simpan</button></div><div class="nk-msg"></div></section>`;
  }
  function renderSettings() {
    const ov = document.getElementById("norSettings");
    const tabs = [["ai", "🤖 Penyedia AI"], ["lit", "📚 Sumber literatur"], ["adv", "⚙️ Lanjutan"]];
    let body = "";
    if (TAB === "ai") body = activeCard() + Object.keys(PROVIDERS).map(id => keyCard("ai", id)).join("");
    else if (TAB === "lit") body = `<p class="nk-intro">Sumber yang diaktifkan dicari bersamaan saat <b>Revisi naskah</b> dan <b>Revisi instan</b>. Setiap kandidat dicocokkan ulang ke OpenAlex/Crossref (DOI, penulis, status penarikan) sebelum boleh dikutip, dan diberi label kuartil SJR bila jurnalnya terindeks Scopus.</p>` + sjrCard() + Object.keys(SERVICES).map(id => keyCard("lit", id)).join("");
    else body = advCard();
    ov.innerHTML = `<div class="nk-dlg" role="dialog" aria-modal="true" aria-labelledby="nkT">
      <div class="nk-head"><img src="logo-mark.png" alt=""><div><h2 id="nkT">Pengaturan</h2><p>Kunci hanya disimpan (terenkripsi) di laptop ini dan dikirim langsung ke layanan terkait.</p></div><button class="nk-x" type="button" data-act="close" aria-label="Tutup">✕</button></div>
      <div class="nk-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === TAB}" data-tab="${k}">${l}</button>`).join("")}</div>
      <div class="nk-body">${body}</div></div>`;
  }
  function openSettings(tab) {
    if (!SETTINGS || !SERVICES) return ready.then(() => openSettings(tab));
    if (typeof tab === "string") TAB = tab;
    let ov = document.getElementById("norSettings");
    if (!ov) { ov = document.createElement("div"); ov.id = "norSettings"; ov.className = "nor-ov"; document.body.appendChild(ov); }
    renderSettings(); ov.hidden = false;
    document.addEventListener("keydown", escClose);
  }
  function escClose(e) { if (e.key === "Escape") closeSettings(); }
  function closeSettings() { const ov = document.getElementById("norSettings"); if (ov) ov.hidden = true; document.removeEventListener("keydown", escClose); }
  function cardMsg(card, ok, text) { const m = card.querySelector(".nk-msg"); if (m) { m.className = "nk-msg " + (ok ? "ok" : "err"); m.textContent = text; } }
  function rerenderCard(card, msg) {
    const [kind, id] = card.dataset.card.split(":");
    const html = kind === "ai" ? keyCard("ai", id) : kind === "lit" ? keyCard("lit", id) : kind === "active" ? activeCard() : kind === "sjr" ? sjrCard() : advCard();
    const t = document.createElement("div"); t.innerHTML = html; const nc = t.firstElementChild;
    card.replaceWith(nc); if (msg) cardMsg(nc, msg.ok, msg.text); return nc;
  }
  async function savePatch(patch) { SETTINGS = await D.saveSettings(patch); syncSrcDb(); applyToApp(); updateBadge(); }

  document.addEventListener("click", async e => {
    if (e.target.closest && e.target.closest("#btnAISet")) { e.preventDefault(); return openSettings(); }
    const ov = document.getElementById("norSettings"); if (!ov || ov.hidden || !ov.contains(e.target)) return;
    if (e.target === ov) return closeSettings();
    const tb = e.target.closest("[data-tab]"); if (tb) { TAB = tb.dataset.tab; return renderSettings(); }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act; if (act === "close") return closeSettings();
    const card = b.closest(".nk-card"); if (!card) return;
    const [kind, id] = card.dataset.card.split(":");
    const keyIn = card.querySelector(".nk-key"); const typed = keyIn && keyIn.value.trim();
    if (act === "eye") { keyIn.type = keyIn.type === "password" ? "text" : "password"; return; }
    const busy = (t) => { b.disabled = true; b.dataset.l = b.textContent; b.textContent = t; };
    try {
      if (kind === "ai") {
        const draft = {};
        if (typed) draft.key = typed;
        const base = card.querySelector(".nk-base"); if (base) draft.baseUrl = base.value.trim();
        const fmt = card.querySelector(".nk-fmt"); if (fmt) draft.format = fmt.value;
        if (act === "save") {
          if (!typed && !base) return cardMsg(card, false, "Tempel API key dulu.");
          busy("Menyimpan…");
          const patch = { providers: { [id]: draft } };
          const firstKey = !Object.values(SETTINGS.providers).some(p => p.hasKey) || !SETTINGS.providers[SETTINGS.provider].hasKey;
          if (firstKey) patch.provider = id;
          await savePatch(patch);
          if (firstKey) { renderSettings(); const nc = document.querySelector(`#norSettings [data-card="ai:${id}"]`); if (nc) cardMsg(nc, true, "Tersimpan dan dijadikan AI utama. Atur modelnya di kartu AI yang dipakai (atas) bila perlu, lalu Tes kunci."); return; }
          return rerenderCard(card, { ok: true, text: firstKey ? "Tersimpan dan dijadikan AI utama. Klik Tes kunci untuk memastikan." : "Tersimpan. Klik Tes kunci untuk memastikan kunci berfungsi." });
        }
        if (act === "test") {
          busy("Menguji…");
          const r = await D.testAI(id, draft);
          b.disabled = false; b.textContent = b.dataset.l;
          return cardMsg(card, r.ok, r.ok ? `Berhasil. Model ${r.model} menjawab "${String(r.text).trim().slice(0, 40)}".${typed ? " Jangan lupa klik Simpan." : ""}` : "Gagal: " + r.error);
        }
        if (act === "use") { await savePatch({ provider: id }); return renderSettings(); }
        if (act === "del") { await savePatch({ providers: { [id]: { key: null } } }); return rerenderCard(card, { ok: true, text: "Kunci dihapus." }); }
      }
      if (kind === "lit") {
        const extra = {}; card.querySelectorAll("[data-extra]").forEach(i => extra[i.dataset.extra] = i.value.trim());
        if (act === "save") {
          busy("Menyimpan…");
          const v = { extra }; if (typed) { v.key = typed; v.enabled = true; }
          await savePatch({ services: { [id]: v } });
          return rerenderCard(card, { ok: true, text: "Tersimpan." + (typed ? " Sumber ini diaktifkan. Klik Tes kunci untuk memastikan." : "") });
        }
        if (act === "test") {
          busy("Menguji…");
          const h = D.lit(id, { q: "teacher professional development", question: "How does teacher professional development affect student achievement?", yearFrom: new Date().getFullYear() - 10, limit: 3 }, typed || "");
          const r = await h.promise;
          b.disabled = false; b.textContent = b.dataset.l;
          const n = r.ok ? (r.data.papers || []).length : 0;
          return cardMsg(card, r.ok && n > 0, r.ok ? (n ? `Berhasil: ${n} artikel ditemukan, mis. "${String(r.data.papers[0].title).slice(0, 70)}".` : "Tersambung, tetapi tidak ada hasil.") : "Gagal: " + (r.error && r.error.message || r.error));
        }
        if (act === "del") { await savePatch({ services: { [id]: { key: null, enabled: false } } }); return rerenderCard(card, { ok: true, text: "Kunci dihapus." }); }
      }
      if (kind === "active") {
        const pid = card.querySelector("#nkProv").value;
        const models = {}; card.querySelectorAll("[data-model]").forEach(i => models[i.dataset.model] = i.value.trim());
        if (act === "saveActive") {
          busy("Menyimpan…");
          const changed = pid !== SETTINGS.provider;
          await savePatch(changed ? { provider: pid } : { provider: pid, providers: { [pid]: { models } } });
          if (changed) return renderSettings();
          return rerenderCard(card, { ok: true, text: SETTINGS.providers[pid].hasKey ? "Tersimpan." : "Tersimpan, tetapi penyedia ini belum punya API key. Isi kuncinya di kartu di bawah." });
        }
        if (act === "models") {
          busy("Memuat…");
          if (pid !== SETTINGS.provider) await savePatch({ provider: pid });
          const r = await D.listModels(pid, {});
          if (r.ok) { UI.modelList[pid] = r.list; await D.saveSettings({ providers: { [pid]: { modelList: r.list } } }); }
          return rerenderCard(card, r.ok ? { ok: true, text: `${r.list.length} model dimuat. Ketik di kolom model untuk memilih, lalu Simpan.` } : { ok: false, text: "Gagal memuat model: " + r.error });
        }
        if (act === "testActive") {
          busy("Menguji…");
          const r = await D.testAI(pid, { models });
          b.disabled = false; b.textContent = b.dataset.l;
          return cardMsg(card, r.ok, r.ok ? `Berhasil. ${r.model} menjawab "${String(r.text).trim().slice(0, 40)}".` : "Gagal: " + r.error);
        }
      }
      if (kind === "sjr") {
        busy(act === "sjrDl" ? "Mengunduh…" : "Memilih berkas…");
        const r = act === "sjrDl" ? await D.sjrDownload() : await D.sjrImport();
        if (r.ok) { setSjrInfo(r); return rerenderCard(card, { ok: true, text: `Berhasil: ${r.count.toLocaleString("id-ID")} jurnal terindeks.` }); }
        b.disabled = false; b.textContent = b.dataset.l;
        return cardMsg(card, false, (act === "sjrDl" ? "Unduhan gagal (" + r.error + "). Pakai cara manual di bawah." : r.error));
      }
      if (kind === "adv" && act === "saveAdv") {
        await savePatch({ maxTokens: document.getElementById("nkMax").value.trim(), temperature: document.getElementById("nkTemp").value.trim() });
        return cardMsg(card, true, "Tersimpan.");
      }
    } catch (err) {
      b.disabled = false; if (b.dataset.l) b.textContent = b.dataset.l;
      cardMsg(card, false, "Gagal: " + ((err && err.message) || err));
    }
  });
  document.addEventListener("change", async e => {
    const ov = document.getElementById("norSettings"); if (!ov || ov.hidden || !ov.contains(e.target)) return;
    if (e.target.dataset.en) { await savePatch({ services: { [e.target.dataset.en]: { enabled: e.target.checked } } }); }
  });
  window.ktiOpenSettings = openSettings;

  document.addEventListener("DOMContentLoaded", () => {
    updateBadge();
    ready.then(() => { if (!configured()) setTimeout(openSettings, 600); });
  });
})();
