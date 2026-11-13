// Sumber literatur untuk Revisi naskah / Revisi instan / cek similarity.
// Semua permintaan dijalankan di proses utama (kunci tidak keluar ke halaman, bebas CORS).
// Keluaran setiap layanan dinormalkan menjadi { papers: [{title, authors[], year, journal, volume, issue, page, doi, abstract, issn[], retracted, cites, url}] }.
const fs = require("fs");
const path = require("path");

const SERVICES = {
  openalex: {
    label: "OpenAlex", icon: "🌐", free: "Gratis", key: "optional", defaultOn: true, slot: "scite",
    keyHint: "kunci OpenAlex (opsional)", keyUrl: "https://openalex.org/settings/api",
    desc: "Basis data terbuka 250+ juta karya ilmiah. Dipakai juga untuk memverifikasi setiap kandidat sumber (DOI, penulis, volume, status penarikan). Tanpa kunci jatah harian kecil; kunci gratis menaikkan jatah 10 kali.",
    guide: ["Buka openalex.org lalu klik Sign up / Log in (gratis).", "Buka menu Settings → API key, salin kuncinya.", "Klik tautan aktivasi yang dikirim ke email Anda (kunci ditolak sebelum diaktifkan).", "Tempel kunci di sini, Simpan, lalu Tes kunci."]
  },
  crossref: {
    label: "Crossref", icon: "🔗", free: "Gratis", key: "none", defaultOn: true, slot: "consensus",
    desc: "Registri DOI resmi untuk jurnal. Tidak perlu kunci. Isi email agar masuk antrean 'polite' yang lebih cepat dan stabil.",
    extra: [{ id: "mailto", label: "Email untuk antrean polite (opsional)", placeholder: "nama@kampus.ac.id" }]
  },
  semanticscholar: {
    label: "Semantic Scholar", icon: "🧠", free: "Gratis", key: "optional", defaultOn: true, slot: "scispace",
    keyHint: "kunci Semantic Scholar (opsional)", keyUrl: "https://www.semanticscholar.org/product/api#api-key-form",
    desc: "Mesin pencari akademik dari Allen Institute. Tanpa kunci memakai jatah bersama yang sering penuh; kunci gratis memberi jatah sendiri.",
    guide: ["Buka semanticscholar.org/product/api lalu isi formulir API Key (gratis).", "Kunci dikirim lewat email dalam beberapa hari.", "Tempel kunci di sini, Simpan, lalu Tes kunci."]
  },
  scholar: {
    label: "Google Scholar (lewat SerpApi)", icon: "🎓", free: "Kunci gratis 250×/bulan", key: "required", defaultOn: false, slot: "scholar", srcLabel: "Google Scholar",
    keyHint: "kunci SerpApi", keyUrl: "https://serpapi.com/manage-api-key",
    desc: "Google Scholar tidak punya API resmi; aplikasi memakai SerpApi. Hasil Scholar tidak memuat DOI, jadi setiap judul dicocokkan ulang ke OpenAlex/Crossref sebelum dipakai.",
    guide: ["Buka serpapi.com lalu daftar (paket Free: 250 pencarian/bulan, tanpa kartu kredit).", "Buka Dashboard → Your Private API Key, salin kuncinya.", "Tempel di sini, Simpan, lalu Tes kunci. Satu kali revisi naskah memakai sekitar 4 pencarian."]
  },
  core: {
    label: "CORE", icon: "📂", free: "Kunci gratis", key: "required", defaultOn: false, slot: "core",
    keyHint: "kunci CORE", keyUrl: "https://core.ac.uk/services/api#form",
    desc: "Kumpulan artikel akses terbuka dari repositori kampus seluruh dunia, termasuk banyak jurnal Indonesia (Garuda/SINTA yang terindeks di repositori).",
    guide: ["Buka core.ac.uk/services/api lalu isi formulir Register for API key (gratis untuk penggunaan akademik).", "Kunci dikirim ke email Anda.", "Tempel di sini, Simpan, lalu Tes kunci."]
  },
  scite: {
    label: "Scite", icon: "✅", free: "Berbayar (paket Pro)", key: "required", defaultOn: false, slot: "sciteapi", srcLabel: "Scite",
    keyHint: "token API Scite", keyUrl: "https://scite.ai/users/me/api",
    desc: "Pencarian dengan Smart Citations (berapa kali artikel didukung atau dibantah). Kunci API hanya tersedia di paket Pro.",
    guide: ["Berlangganan paket Pro di scite.ai/pricing (paket Basic tidak memberi akses API).", "Buka scite.ai/users/me/api lalu buat token.", "Tempel token di sini, Simpan, lalu Tes kunci."]
  },
  consensus: {
    label: "Consensus", icon: "🧪", free: "Berbayar (kredit paket)", key: "required", defaultOn: false, slot: "consensusapi", srcLabel: "Consensus",
    keyHint: "kunci API Consensus", keyUrl: "https://consensus.app/home/api/",
    desc: "Pencarian makalah berbasis pertanyaan penelitian, dengan filter kuartil SJR. API memakai kredit paket Pro/Deep (setelah habis berbayar per panggilan).",
    guide: ["Berlangganan paket Pro atau Deep di consensus.app.", "Buka consensus.app/home/api lalu buat kunci API.", "Tempel di sini, Simpan, lalu Tes kunci."]
  },
  scispace: {
    label: "SciSpace", icon: "🔭", free: "Beta (kunci uji gratis)", key: "required", defaultOn: false, slot: "scispaceapi", srcLabel: "SciSpace",
    keyHint: "kunci SciSpace (sk_…)", keyUrl: "https://docs.api.scispace.com/get-started/quickstart",
    desc: "API SciSpace masih beta: memberi jawaban beserta daftar makalah rujukan. Judul rujukan dicocokkan ulang ke OpenAlex/Crossref sebelum dipakai.",
    guide: ["Buka docs.api.scispace.com lalu ikuti Quickstart untuk meminta akses API.", "Buat kunci; kunci uji (sk_test_…) mendapat 500 kredit per bulan.", "Tempel di sini, Simpan, lalu Tes kunci."]
  },
  perplexity: {
    label: "Perplexity (pencarian web akademik)", icon: "🔎", free: "Berbayar", key: "required", defaultOn: false, slot: "perplexity", srcLabel: "Perplexity",
    keyHint: "kunci Perplexity (pplx-…)", keyUrl: "https://www.perplexity.ai/account/api",
    desc: "Mencari di situs penerbit dan basis data ilmiah (PubMed, ScienceDirect, Springer, Wiley, Taylor & Francis, SAGE, DOAJ, Garuda, dll.). Hanya halaman yang memuat DOI atau judul yang cocok di OpenAlex/Crossref yang dipakai. Bila kosong, memakai kunci Perplexity di tab Penyedia AI.",
    guide: ["Buka perplexity.ai/account/api lalu masuk.", "Isi kredit API, lalu klik Generate API Key.", "Tempel kunci pplx-… di sini, Simpan, lalu Tes kunci."]
  }
};

/* ───────── util ───────── */
const ACADEMIC_DOMAINS = ["doi.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "sciencedirect.com", "springer.com", "link.springer.com", "wiley.com", "tandfonline.com", "sagepub.com", "mdpi.com", "frontiersin.org", "doaj.org", "garuda.kemdikbud.go.id", "researchgate.net", "eric.ed.gov", "jstor.org", "nature.com", "emerald.com", "ieeexplore.ieee.org", "scholar.archive.org"];
const doiIn = s => { const m = /(10\.\d{4,9}\/[^\s"<>?#]+)/i.exec(String(s || "")); return m ? decodeURIComponent(m[1]).replace(/[.,;)\]]+$/, "") : ""; };
const cleanDoi = d => String(d || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
const strip = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function httpErr(status, text, service) {
  let msg = text || ""; try { const j = JSON.parse(text); msg = j.error && (j.error.message || j.error) || j.message || j.detail || msg; } catch (e) {}
  msg = String(typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 240);
  if (status === 401 || status === 403) return { code: "not_granted", message: `${service}: kunci ditolak (${status}). ${msg}` };
  if (status === 429) return { code: "rate_limited", message: `${service}: batas pemakaian tercapai (429). ${msg}` };
  if (status === 402) return { code: "rate_limited", message: `${service}: kredit/saldo habis (402). ${msg}` };
  return { code: "http_" + status, message: `${service}: galat ${status}. ${msg}` };
}
async function getJSON(fetch, url, opts, service, signal) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, Object.assign({ signal }, opts || {}));
    if ((r.status === 429 || r.status >= 500) && i < 2) { await new Promise(res => setTimeout(res, 1200 * (i + 1))); continue; }
    const t = await r.text();
    if (!r.ok) throw httpErr(r.status, t, service);
    try { return JSON.parse(t); } catch (e) { throw { code: "bad_json", message: service + ": jawaban bukan JSON." }; }
  }
}
const pick = (o, ...ks) => { for (const k of ks) { const v = k.split(".").reduce((a, b) => a && a[b], o); if (v != null && v !== "") return v; } return ""; };
function genericPaper(p) {
  if (!p || typeof p !== "object") return null;
  const title = strip(pick(p, "title", "paper_title", "name", "display_name"));
  if (!title) return null;
  let au = p.authors || p.author || p.author_names || [];
  if (typeof au === "string") au = au.split(/\s*;\s*|\s*,\s*(?=[A-Z])/);
  if (!Array.isArray(au)) au = au.data || au.items || [];
  const authors = au.map(a => typeof a === "string" ? a : (a && (a.authorName || a.name || a.display_name || a.full_name || [a.given, a.family].filter(Boolean).join(" ") || (a.author && a.author.display_name))) || "").map(x => String(x).trim()).filter(Boolean);
  const j = p.journal && typeof p.journal === "object" ? (p.journal.name || p.journal.title || p.journal.display_name || "") : (p.journal || p.journal_name || p.venue || p.source || p.publication || "");
  const year = +(pick(p, "year", "publication_year", "yearPublished", "published_year") || String(pick(p, "publish_date", "published", "date", "publication_date")).slice(0, 4)) || null;
  let issn = p.issn || p.ISSN || (p.journal && p.journal.issn) || [];
  if (!Array.isArray(issn)) issn = [issn];
  return {
    title, authors, year, journal: String(typeof j === "string" ? j : "").trim(),
    volume: String(pick(p, "volume", "journal.volume") || ""), issue: String(pick(p, "issue", "journal.issue") || ""), page: String(pick(p, "page", "pages", "journal.pages") || "").trim(),
    doi: cleanDoi(pick(p, "doi", "DOI", "externalIds.DOI") || doiIn(pick(p, "url", "link", "doi_url"))),
    abstract: strip(pick(p, "abstract", "summary", "tldr", "takeaway", "snippet")).slice(0, 1200),
    issn: issn.filter(Boolean).map(String), retracted: !!(p.retracted || p.is_retracted || (p.editorialNotices || []).some(n => /retract/i.test(n.status || ""))),
    cites: +(pick(p, "citation_count", "citationCount", "citations", "cited_by_count") || 0) || 0,
    url: String(pick(p, "url", "link", "doi_url") || ""), ptype: String(pick(p, "publication_type", "type") || "")
  };
}
function findArray(obj, depth = 0) {
  if (!obj || depth > 4) return [];
  if (Array.isArray(obj)) return obj;
  for (const k of ["papers", "results", "data", "hits", "items", "organic_results", "documents"]) if (Array.isArray(obj[k])) return obj[k];
  let best = [];
  for (const v of Object.values(obj)) if (v && typeof v === "object") { const a = findArray(v, depth + 1); if (a.length > best.length && a.some(x => x && (x.title || x.paper_title))) best = a; }
  return best;
}

/* ───────── OpenAlex ───────── */
const absFromInv = inv => { if (!inv) return ""; const arr = []; for (const [w, pos] of Object.entries(inv)) for (const p of pos) arr[p] = w; return arr.filter(Boolean).join(" "); };
const OA_SEL = "&select=doi,title,display_name,authorships,publication_year,primary_location,biblio,abstract_inverted_index,cited_by_count,is_retracted,type";
function oaPaper(w) {
  const src = (w.primary_location && w.primary_location.source) || {};
  const b = w.biblio || {};
  return {
    title: w.title || w.display_name || "", authors: (w.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean),
    year: w.publication_year || null, journal: src.display_name || "", volume: b.volume || "", issue: b.issue || "",
    page: b.first_page ? b.first_page + (b.last_page && b.last_page !== b.first_page ? "–" + b.last_page : "") : "",
    doi: cleanDoi(w.doi), abstract: absFromInv(w.abstract_inverted_index).slice(0, 1200),
    issn: [].concat(src.issn || [], src.issn_l || []).filter(Boolean), retracted: !!w.is_retracted, cites: w.cited_by_count || 0, url: w.doi || "", ptype: w.type || ""
  };
}
async function openalex(args, cfg, signal, fetch) {
  const key = cfg.key ? "&api_key=" + encodeURIComponent(cfg.key) : "";
  const base = "https://api.openalex.org/works";
  if (Array.isArray(args.dois) && args.dois.length) {
    const out = [];
    await Promise.all(args.dois.slice(0, 25).map(async d => { try { out.push(oaPaper(await getJSON(fetch, `${base}/doi:${encodeURIComponent(cleanDoi(d))}?${OA_SEL.slice(1)}${key}`, null, "OpenAlex", signal))); } catch (e) { if (e && e.code === "not_granted") throw e; } }));
    return { papers: out };
  }
  if (Array.isArray(args.titles) && args.titles.length) {
    const out = [];
    await Promise.all(args.titles.slice(0, 20).map(async t => {
      const q = String(t).replace(/[,:|!*()"\[\]?]/g, " ").replace(/\s+/g, " ").trim().slice(0, 250); if (!q) return;
      try { const j = await getJSON(fetch, `${base}?filter=title.search:${encodeURIComponent(q)}&per-page=2${OA_SEL}${key}`, null, "OpenAlex", signal); (j.results || []).forEach(w => out.push(oaPaper(w))); }
      catch (e) { if (e && (e.code === "not_granted")) throw e; }
    }));
    return { papers: out };
  }
  const term = String(args.q || "").replace(/\bAND\b|\bOR\b/g, " ").replace(/"/g, "").replace(/\s+/g, " ").trim();
  const f = ["type:article|review"]; if (args.yearFrom) f.push(`from_publication_date:${args.yearFrom}-01-01`);
  const j = await getJSON(fetch, `${base}?search=${encodeURIComponent(term)}&filter=${f.join(",")}&per-page=${Math.min(25, args.limit || 8)}${OA_SEL}${key}`, null, "OpenAlex", signal);
  return { papers: (j.results || []).map(oaPaper) };
}

/* ───────── Crossref ───────── */
function crPaper(it) {
  const dp = (it.issued && it.issued["date-parts"] && it.issued["date-parts"][0]) || [];
  return {
    title: strip((it.title || [])[0]), authors: (it.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ") || a.name || "").filter(Boolean),
    year: dp[0] || null, journal: (it["container-title"] || [])[0] || "", volume: it.volume || "", issue: it.issue || "", page: it.page || "",
    doi: it.DOI || "", abstract: strip(it.abstract).slice(0, 1200), issn: it.ISSN || [],
    retracted: !!(it["update-to"] || []).some(u => /retract/i.test(u.type || "")) || /^retracted/i.test(strip((it.title || [])[0])),
    cites: it["is-referenced-by-count"] || 0, url: it.URL || "", ptype: it.type || ""
  };
}
async function crossref(args, cfg, signal, fetch) {
  const mail = cfg.extra && cfg.extra.mailto ? "&mailto=" + encodeURIComponent(cfg.extra.mailto) : "";
  const sel = "&select=DOI,title,author,container-title,issued,volume,issue,page,abstract,is-referenced-by-count,type,ISSN,URL,update-to";
  if (Array.isArray(args.titles) && args.titles.length) {
    const out = [];
    await Promise.all(args.titles.slice(0, 20).map(async t => {
      try { const j = await getJSON(fetch, `https://api.crossref.org/works?query.title=${encodeURIComponent(String(t).slice(0, 250))}&rows=2${sel}${mail}`, null, "Crossref", signal); ((j.message && j.message.items) || []).forEach(it => out.push(crPaper(it))); } catch (e) {}
    }));
    return { papers: out };
  }
  const j = await getJSON(fetch, `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(String(args.q || "").replace(/\bAND\b|"/g, " ").slice(0, 300))}&rows=${Math.min(20, args.limit || 8)}&filter=type:journal-article${args.yearFrom ? ",from-pub-date:" + args.yearFrom : ""}${sel}${mail}`, null, "Crossref", signal);
  return { papers: ((j.message && j.message.items) || []).map(crPaper).filter(p => p.title) };
}

/* ───────── Semantic Scholar ───────── */
async function semanticscholar(args, cfg, signal, fetch) {
  const headers = cfg.key ? { "x-api-key": cfg.key } : {};
  const q = String(args.question || args.q || "").slice(0, 400);
  const yr = args.yearFrom ? `&year=${args.yearFrom}-` : "";
  const j = await getJSON(fetch, `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${Math.min(20, args.limit || 8)}${yr}&fields=title,year,authors,venue,journal,externalIds,abstract,publicationTypes,citationCount,publicationVenue`, { headers }, "Semantic Scholar", signal);
  return {
    papers: (j.data || []).map(p => ({
      title: p.title || "", authors: (p.authors || []).map(a => a.name).filter(Boolean), year: p.year || null,
      journal: (p.journal && p.journal.name) || (p.publicationVenue && p.publicationVenue.name) || p.venue || "",
      volume: (p.journal && p.journal.volume) || "", issue: "", page: String((p.journal && p.journal.pages) || "").trim(),
      doi: (p.externalIds && p.externalIds.DOI) || "", abstract: String(p.abstract || "").slice(0, 1200),
      issn: [].concat((p.publicationVenue && p.publicationVenue.issn) || [], (p.publicationVenue && p.publicationVenue.alternate_issns) || []),
      retracted: false, cites: p.citationCount || 0, url: "", ptype: (p.publicationTypes || []).join(" ") || "JournalArticle"
    }))
  };
}

/* ───────── Google Scholar (SerpApi) ───────── */
async function scholar(args, cfg, signal, fetch) {
  if (!cfg.key) throw { code: "not_granted", message: "Kunci SerpApi belum diisi." };
  const j = await getJSON(fetch, `https://serpapi.com/search.json?engine=google_scholar&q=${encodeURIComponent(String(args.q || "").replace(/\bAND\b/g, " ").slice(0, 300))}&num=${Math.min(20, args.limit || 10)}${args.yearFrom ? "&as_ylo=" + args.yearFrom : ""}&hl=en&api_key=${encodeURIComponent(cfg.key)}`, null, "SerpApi", signal);
  if (j.error) throw { code: /invalid api key/i.test(j.error) ? "not_granted" : "error", message: "SerpApi: " + j.error };
  return {
    papers: (j.organic_results || []).map(r => {
      const sum = (r.publication_info && r.publication_info.summary) || "";
      const parts = sum.split(" - ");
      const yr = (/\b(19|20)\d{2}\b/.exec(sum) || [])[0];
      const jr = (parts[1] || "").replace(/,?\s*\b(19|20)\d{2}\b.*$/, "").trim();
      const authors = ((r.publication_info && r.publication_info.authors) || []).map(a => a.name).filter(Boolean);
      return { title: strip(r.title), authors: authors.length ? authors : (parts[0] || "").split(/,\s*/).filter(x => x && !/…/.test(x)), year: yr ? +yr : null, journal: jr, volume: "", issue: "", page: "", doi: doiIn(r.link), abstract: strip(r.snippet), issn: [], retracted: false, cites: (r.inline_links && r.inline_links.cited_by && r.inline_links.cited_by.total) || 0, url: r.link || "", ptype: r.type || "", needsVerify: true };
    }).filter(p => p.title)
  };
}

/* ───────── CORE ───────── */
async function core(args, cfg, signal, fetch) {
  if (!cfg.key) throw { code: "not_granted", message: "Kunci CORE belum diisi." };
  const q = String(args.q || "").replace(/\bAND\b|"/g, " ").trim();
  const j = await getJSON(fetch, `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(q + (args.yearFrom ? ` AND yearPublished>=${args.yearFrom}` : ""))}&limit=${Math.min(20, args.limit || 8)}`, { headers: { authorization: "Bearer " + cfg.key } }, "CORE", signal);
  return {
    papers: (j.results || []).map(p => {
      const g = genericPaper(p) || {};
      const jr = (p.journals || [])[0] || {};
      g.journal = g.journal || jr.title || ""; g.issn = (jr.identifiers || []).map(x => String(x).replace(/^issn:/i, "")).filter(x => /\d{4}-?\d{3}[\dxX]/.test(x));
      g.authors = (p.authors || []).map(a => a.name).filter(Boolean); g.year = p.yearPublished || g.year; g.needsVerify = !g.doi;
      return g;
    }).filter(p => p && p.title)
  };
}

/* ───────── Scite (API resmi) ───────── */
async function scite(args, cfg, signal, fetch) {
  if (!cfg.key) throw { code: "not_granted", message: "Token Scite belum diisi." };
  const j = await getJSON(fetch, `https://api.scite.ai/api_partner/search?term=${encodeURIComponent(String(args.q || "").slice(0, 300))}&limit=${Math.min(20, args.limit || 8)}${args.yearFrom ? "&date_from=" + args.yearFrom : ""}`, { headers: { authorization: "Bearer " + cfg.key } }, "Scite", signal);
  return { papers: findArray(j).map(genericPaper).filter(Boolean) };
}

/* ───────── Consensus ───────── */
async function consensus(args, cfg, signal, fetch) {
  if (!cfg.key) throw { code: "not_granted", message: "Kunci Consensus belum diisi." };
  const sj = args.sjrMax ? `&sjr_max=${args.sjrMax}` : "";
  const j = await getJSON(fetch, `https://api.consensus.app/v1/search?query=${encodeURIComponent(String(args.question || args.q || "").replace(/\bAND\b|"/g, " ").slice(0, 480))}${args.yearFrom ? "&year_min=" + args.yearFrom : ""}${sj}`, { headers: { "x-api-key": cfg.key } }, "Consensus", signal);
  return { papers: findArray(j).map(genericPaper).filter(Boolean) };
}

/* ───────── SciSpace ───────── */
async function scispace(args, cfg, signal, fetch) {
  if (!cfg.key) throw { code: "not_granted", message: "Kunci SciSpace belum diisi." };
  const j = await getJSON(fetch, "https://api.scispace.com/v1/searches", { method: "POST", headers: { authorization: "Bearer " + cfg.key, "content-type": "application/json", "SciSpace-Version": "2026-08-01" }, body: JSON.stringify({ query: String(args.question || args.q || "").slice(0, 500) }) }, "SciSpace", signal);
  let arr = findArray(j);
  const cits = (j.answer && j.answer.citations) || [];
  if (!arr.length && cits.length) arr = cits.map(c => c.source || c);
  return { papers: arr.map(genericPaper).filter(Boolean).map(p => Object.assign(p, { needsVerify: !p.doi })) };
}

/* ───────── Perplexity Search ───────── */
async function perplexity(args, cfg, signal, fetch, deps) {
  let key = cfg.key;
  if (!key && deps && deps.perplexityKey) key = deps.perplexityKey();
  if (!key) throw { code: "not_granted", message: "Kunci Perplexity belum diisi." };
  const j = await getJSON(fetch, "https://api.perplexity.ai/search", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify({ query: String(args.question || args.q || "").slice(0, 400) + " peer-reviewed journal article", max_results: Math.min(20, args.limit || 10), search_domain_filter: ACADEMIC_DOMAINS.slice(0, 20) }) }, "Perplexity", signal);
  return { papers: (j.results || []).map(r => ({ title: strip(r.title).replace(/\s*[|\-–]\s*(ScienceDirect|SpringerLink|Wiley Online Library|Taylor & Francis Online|PubMed|MDPI|SAGE Journals|ResearchGate).*$/i, ""), authors: [], year: +String(r.date || "").slice(0, 4) || null, journal: "", volume: "", issue: "", page: "", doi: doiIn(r.url) || doiIn(r.snippet), abstract: strip(r.snippet).slice(0, 800), issn: [], retracted: false, cites: 0, url: r.url || "", ptype: "", needsVerify: true })).filter(p => p.title) };
}

const IMPL = { openalex, crossref, semanticscholar, scholar, core, scite, consensus, scispace, perplexity };
async function search(id, args, cfg, signal, deps) {
  const f = IMPL[id]; if (!f) throw { code: "unknown", message: "Layanan tidak dikenal." };
  return f(args, cfg, signal, deps.fetch, deps);
}

/* ───────── Kuartil SJR (SCImago) ───────── */
let SJR = null; // { byIssn: {ISSN: [quartile, sjr]}, byTitle: {...}, year, count }
let sjrFile = null;
const normTitle = t => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
const normIssn = s => String(s || "").replace(/[^0-9xX]/g, "").toUpperCase();
function setSjrFile(p) { sjrFile = p; }
function loadSjr() {
  if (SJR || !sjrFile) return SJR;
  try { SJR = JSON.parse(fs.readFileSync(sjrFile, "utf8")); } catch (e) { SJR = null; }
  return SJR;
}
function parseSjrCsv(text, year) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 10) throw new Error("Berkas SJR kosong atau tidak dikenal.");
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = line => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === sep && !q) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
  const head = split(lines[0]).map(h => h.trim().toLowerCase());
  const iT = head.findIndex(h => h === "title"), iI = head.findIndex(h => h === "issn"), iQ = head.findIndex(h => /best quartile/.test(h)), iS = head.findIndex(h => h === "sjr"), iTy = head.findIndex(h => h === "type");
  if (iT < 0 || iI < 0 || iQ < 0) throw new Error("Kolom Title/Issn/SJR Best Quartile tidak ditemukan. Pastikan berkas diunduh dari scimagojr.com (Download data).");
  const byIssn = {}, byTitle = {}; let n = 0;
  for (let k = 1; k < lines.length; k++) {
    const c = split(lines[k]); const q = (c[iQ] || "").trim();
    if (!/^Q[1-4]$/.test(q)) continue;
    if (iTy >= 0 && c[iTy] && !/journal/i.test(c[iTy])) continue;
    const rec = [q, (c[iS] || "").replace(",", ".")];
    String(c[iI] || "").split(/[,\s]+/).map(normIssn).filter(x => x.length === 8).forEach(x => { byIssn[x] = rec; });
    const t = normTitle(c[iT]); if (t) byTitle[t] = rec;
    n++;
  }
  return { byIssn, byTitle, year: year || "", count: n };
}
function saveSjr(data) { SJR = data; if (sjrFile) fs.writeFileSync(sjrFile, JSON.stringify(data)); return { count: data.count, year: data.year }; }
function sjrLookup(items) {
  const d = loadSjr(); if (!d) return items.map(() => null);
  return items.map(it => {
    for (const x of (it.issn || [])) { const r = d.byIssn[normIssn(x)]; if (r) return { q: r[0], sjr: r[1], year: d.year }; }
    const r = it.journal && d.byTitle[normTitle(it.journal)]; return r ? { q: r[0], sjr: r[1], year: d.year } : null;
  });
}
function sjrInfo() { const d = loadSjr(); return d ? { count: d.count, year: d.year } : null; }

module.exports = { SERVICES, search, setSjrFile, parseSjrCsv, saveSjr, sjrLookup, sjrInfo };
