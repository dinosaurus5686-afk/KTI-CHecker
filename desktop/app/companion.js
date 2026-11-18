/* Panel Pendamping KTI: tampil otomatis saat Claude, ChatGPT, atau Gemini dibuka.
   Teks yang disalin dari AI diperiksa: setiap rujukan dicocokkan ke OpenAlex/Crossref (fiktif, DOI salah, ditarik,
   metadata berbeda), sitasi dalam teks dibandingkan dengan daftar pustaka, dan jurnal diberi label kuartil SJR. */
(function () {
  "use strict";
  const D = window.ktiDesktop, C = D && D.companion, R = window.KtiRefCheck;
  const root = document.getElementById("root");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let ST = { app: null, appLabel: "", lastLabel: "", pinned: false, expanded: false, enabled: true };
  let RUN = null; // { id, text, source, stats, refs:[{ref, res}], cites, cross, busy }
  let runSeq = 0;

  function head() {
    const who = ST.appLabel || ST.lastLabel;
    const status = ST.app ? `<span class="dot on"></span>${esc(ST.appLabel)} terbuka · pendamping aktif` : who ? `<span class="dot"></span>Terakhir: ${esc(who)}` : `<span class="dot"></span>Menunggu Claude, ChatGPT, atau Gemini`;
    return `<div class="bar"><img src="logo-mark.png" alt="NOR"><div class="t"><b>Pendamping KTI</b><small>${status}</small></div>
      <button class="ib" data-a="paste" title="Periksa teks di papan klip">📋</button>
      <button class="ib" data-a="pin" aria-pressed="${ST.pinned}" title="Sematkan (jangan sembunyikan otomatis)">📌</button>
      <button class="ib" data-a="toggle" title="${ST.expanded ? "Perkecil" : "Perbesar"}">${ST.expanded ? "▾" : "▴"}</button>
      <button class="ib" data-a="hide" title="Sembunyikan">✕</button></div>`;
  }
  function intro() {
    return `<div class="card"><h3>✨ Cara kerja</h3><p class="muted" style="margin:0">Salin (Ctrl+C) jawaban dari Claude, ChatGPT, atau Gemini. Panel ini langsung memeriksa:</p>
      <ul class="muted small" style="margin:6px 0 0;padding-left:18px"><li>apakah setiap rujukan benar-benar ada (OpenAlex/Crossref), DOI-nya cocok, dan tidak ditarik;</li><li>sitasi dalam teks yang tidak ada di daftar pustaka, dan sebaliknya;</li><li>kuartil SJR jurnal (bila data SJR sudah diunduh di Pengaturan).</li></ul>
      <textarea id="manual" placeholder="Atau tempel teks di sini…"></textarea>
      <div class="acts"><button class="btn gold" data-a="checkManual">🔍 Periksa</button><button class="btn" data-a="paste">📋 Ambil dari papan klip</button></div></div>`;
  }
  function counts() {
    const c = { ok: 0, warn: 0, err: 0, wait: 0 };
    (RUN.refs || []).forEach(r => { const s = r.res ? r.res.status : "wait"; if (s === "ok") c.ok++; else if (s === "wait") c.wait++; else if (["partial", "similar", "doi_mismatch"].includes(s)) c.warn++; else c.err++; });
    return c;
  }
  function result() {
    const c = counts(), st = RUN.stats;
    const refsHTML = RUN.refs.length ? `<ul class="refs">${RUN.refs.map(r => {
      const s = r.res ? r.res.status : "wait", m = r.res && r.res.match;
      return `<li class="${s}"><span class="st">${r.res ? esc(r.res.label) : '<span class="spin"></span>Memeriksa'}</span>${m && m.quartile ? `<span class="q">${esc(m.quartile)}</span>` : ""}
        <div class="raw">${esc(r.ref.raw.length > 260 ? r.ref.raw.slice(0, 260) + "…" : r.ref.raw)}</div>
        ${r.res && r.res.note ? `<div class="note">${esc(r.res.note)}</div>` : ""}
        ${m ? `<div class="note">↳ ${esc((m.authors || []).slice(0, 3).join(", "))}${(m.authors || []).length > 3 ? " dkk." : ""} (${esc(m.year || "t.t.")}). ${esc(m.title)}. <i>${esc(m.journal || "")}</i>${m.doi ? ` · <a href="https://doi.org/${esc(m.doi)}" target="_blank" rel="noopener">doi:${esc(m.doi)}</a>` : ""}</div>` : ""}</li>`;
    }).join("")}</ul>` : `<p class="muted" style="margin:0">Tidak ada daftar rujukan atau DOI di teks ini.</p>`;
    const miss = RUN.cross.missing, unused = RUN.cross.unused;
    return `<div class="card"><h3>📊 Ringkasan ${RUN.source ? `<span class="faint small">dari ${esc(RUN.source)}</span>` : ""}</h3>
        <div class="kpis"><div class="kpi"><b>${st.words.toLocaleString("id-ID")}</b><span>kata</span></div><div class="kpi ok"><b>${c.ok}</b><span>rujukan valid</span></div><div class="kpi warn"><b>${c.warn}</b><span>perlu dicek</span></div><div class="kpi err"><b>${c.err}</b><span>bermasalah</span></div></div>
        ${RUN.busy ? `<p class="small muted" style="margin:8px 0 0"><span class="spin"></span>Mencocokkan ${RUN.refs.length} rujukan ke OpenAlex dan Crossref…</p>` : ""}
        <div class="acts"><button class="btn red" data-a="full">📄 Analisis penuh di KTI Checker</button><button class="btn" data-a="copy">📋 Salin laporan</button><button class="btn" data-a="new">↺ Teks lain</button></div></div>
      <div class="card"><h3>📚 Rujukan (${RUN.refs.length})</h3>${refsHTML}</div>
      ${RUN.cites.length || miss.length || unused.length ? `<div class="card"><h3>🔗 Sitasi dalam teks (${RUN.cites.length})</h3>
        ${miss.length ? `<p class="small" style="margin:0 0 4px;color:var(--err)">Dikutip tetapi tidak ada di daftar pustaka:</p><div class="chips">${miss.map(m => `<span class="chip err">${esc(m.text)}</span>`).join("")}</div>` : `<p class="small muted" style="margin:0">${RUN.refs.length ? "Semua sitasi dalam teks ada di daftar pustaka." : "Teks memuat sitasi, tetapi tidak ada daftar pustaka untuk dicocokkan. Minta AI menuliskan daftar pustaka lengkap dengan DOI."}</p>`}
        ${unused.length ? `<p class="small" style="margin:8px 0 4px;color:var(--warn)">Ada di daftar pustaka tetapi tidak dikutip:</p><div class="chips">${unused.map(u => `<span class="chip">${esc(u.firstAuthor)} (${esc(u.year)})</span>`).join("")}</div>` : ""}</div>` : ""}
      ${st.longSentences.length ? `<div class="card"><h3>✂️ Kalimat sangat panjang (&gt;40 kata)</h3>${st.longSentences.map(s => `<p class="small muted" style="margin:0 0 6px">${esc(s.slice(0, 220))}…</p>`).join("")}</div>` : ""}`;
  }
  function render() {
    document.body.classList.toggle("collapsed", !ST.expanded);
    const keepManual = document.getElementById("manual"); const mv = keepManual ? keepManual.value : "";
    root.innerHTML = head() + `<div class="body">${RUN ? result() : intro()}</div>`;
    const m = document.getElementById("manual"); if (m && mv) m.value = mv;
  }

  /* ───── Pemeriksaan ───── */
  async function lit(id, args, ctx) { const h = D.lit(id, args); const r = await h.promise; if (!r.ok) { if (ctx) ctx.err = r.error || {}; throw r.error || {}; } if (ctx) ctx.ok++; return (r.data && r.data.papers) || []; }
  async function byTitle(ref, ctx) {
    let cands = [];
    try { cands = await lit("crossref", { q: ref.raw.replace(/https?:\S+|doi:\s*\S+/gi, ""), limit: 4, anyType: true }, ctx); } catch (e) {}
    const best = Math.max(0, ...cands.map(c => R.sim(ref.title || ref.raw, c.title)));
    if (best < 0.82 && ref.title) { try { cands = cands.concat(await lit("openalex", { titles: [ref.title] }, ctx)); } catch (e) {} }
    return cands;
  }
  async function verify(ref) {
    const ctx = { ok: 0, err: null };
    const res = await verifyInner(ref, ctx);
    // Bila tidak satu pun layanan menjawab, jangan menyimpulkan "fiktif": laporkan gagal periksa.
    if (!ctx.ok && !res.match) throw ctx.err || new Error("tidak ada jawaban");
    return res;
  }
  async function verifyInner(ref, ctx) {
    let res;
    if (ref.doi) {
      let cands = [];
      try { cands = await lit("openalex", { dois: [ref.doi] }, ctx); } catch (e) {}
      if (!cands.length) { try { cands = (await lit("crossref", { q: ref.doi, limit: 3, anyType: true }, ctx)).filter(p => R.cleanDoi(p.doi) === ref.doi); } catch (e) {} }
      if (cands.length) res = R.judge(ref, cands, true);
      else if (ref.title) {
        const r2 = R.judge(ref, await byTitle(ref, ctx), false);
        res = r2.match && ["ok", "partial"].includes(r2.status)
          ? Object.assign(r2, { status: "doi_mismatch", label: "DOI salah", note: `DOI ${ref.doi} tidak terdaftar, tetapi karyanya ada dengan DOI ${r2.match.doi || "lain"}. Perbaiki DOI.` })
          : { status: "doi_missing", label: "DOI tidak terdaftar", match: null, note: "DOI ini tidak ada di OpenAlex/Crossref dan judulnya juga tidak ditemukan. Kemungkinan rujukan fiktif." };
      } else res = R.judge(ref, [], true);
    } else res = R.judge(ref, await byTitle(ref, ctx), false);
    if (res.match) { try { const q = (await D.sjrLookup([{ issn: res.match.issn || [], journal: res.match.journal || "" }]))[0]; if (q) res.match.quartile = "SJR " + q.q; } catch (e) {} }
    return res;
  }
  async function check(text, source) {
    const id = ++runSeq;
    const sp = R.splitText(text);
    const refs = R.refLines(sp.refsText, sp.body, sp.hasHeading).map(R.parseRef);
    // DOI yang tertulis di isi (bukan di daftar pustaka) juga diperiksa.
    const extraDois = (sp.body.match(/\b10\.\d{4,9}\/[^\s"<>()\[\]{}]+[^\s"<>()\[\]{}.,;:]/g) || []).map(R.cleanDoi).filter(d => !refs.some(r => r.doi === d));
    [...new Set(extraDois)].slice(0, 10).forEach(d => refs.push({ raw: "doi:" + d, doi: d, year: null, authors: "", firstAuthor: "", title: "", venue: "" }));
    const cites = R.inTextCitations(sp.hasHeading ? sp.body : text);
    RUN = { id, text, source, stats: R.stats(sp.body || text), refs: refs.map(ref => ({ ref, res: null })), cites, cross: R.crossCheck(cites, refs), busy: !!refs.length };
    if (!ST.expanded) await C.expand(true);
    render();
    let i = 0;
    const worker = async () => { while (i < RUN.refs.length && RUN.id === id) { const it = RUN.refs[i++]; try { it.res = await verify(it.ref); } catch (e) { it.res = { status: "similar", label: "Gagal diperiksa", note: "Koneksi ke OpenAlex/Crossref gagal: " + ((e && e.message) || e) }; } if (RUN.id === id) render(); } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (RUN.id === id) { RUN.busy = false; render(); }
  }
  function report() {
    const c = counts();
    const lines = [`Pemeriksaan KTI Checker NOR${RUN.source ? " (teks dari " + RUN.source + ")" : ""}`, `Rujukan: ${RUN.refs.length} · valid ${c.ok} · perlu dicek ${c.warn} · bermasalah ${c.err}`, ""];
    RUN.refs.forEach((r, k) => { lines.push(`${k + 1}. [${r.res ? r.res.label : "belum"}] ${r.ref.raw}`); if (r.res && r.res.note) lines.push("   " + r.res.note); if (r.res && r.res.match && r.res.match.doi) lines.push("   Cocok dengan: https://doi.org/" + r.res.match.doi + (r.res.match.quartile ? " (" + r.res.match.quartile + ")" : "")); });
    if (RUN.cross.missing.length) lines.push("", "Sitasi tanpa entri pustaka: " + RUN.cross.missing.map(m => m.text).join("; "));
    if (RUN.cross.unused.length) lines.push("Entri pustaka yang tidak dikutip: " + RUN.cross.unused.map(u => `${u.firstAuthor} (${u.year})`).join("; "));
    return lines.join("\n");
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "hide") return C.hide();
    if (a === "pin") { ST.pinned = !ST.pinned; await C.pin(ST.pinned); return render(); }
    if (a === "toggle") return C.expand(!ST.expanded);
    if (a === "paste") { const t = await C.clipboard(); if (t && t.trim().length > 20) return check(t, "papan klip"); if (!ST.expanded) await C.expand(true); RUN = null; render(); return; }
    if (a === "checkManual") { const t = (document.getElementById("manual") || {}).value || ""; if (t.trim().length > 20) check(t, "teks tempelan"); return; }
    if (a === "new") { RUN = null; runSeq++; return render(); }
    if (a === "copy") { try { await navigator.clipboard.writeText(report()); b.textContent = "✓ Tersalin"; } catch (err) { b.textContent = "Gagal menyalin"; } return; }
    if (a === "full") { const name = `Teks_${(RUN.source || "AI").replace(/\W+/g, "_")}_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.txt`; return C.openMain({ text: RUN.text, name }); }
  });

  if (!C) { root.innerHTML = "<p style='padding:12px'>Panel ini hanya berjalan di aplikasi desktop.</p>"; return; }
  C.onState(s => { ST = Object.assign(ST, s); render(); });
  C.onText(p => check(p.text, { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" }[p.source] || "papan klip"));
  C.state().then(s => { if (s) ST = Object.assign(ST, s); render(); });
  render();
})();
