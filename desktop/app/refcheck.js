/* Pemeriksa rujukan & sitasi untuk teks dari Claude / ChatGPT / Gemini.
   Murni (tanpa jaringan): memecah daftar pustaka, membaca DOI/tahun/penulis/judul, menemukan sitasi dalam teks,
   dan menilai kecocokan dengan metadata dari OpenAlex/Crossref. Dipakai panel pendamping; juga bisa diuji di Node. */
(function (root) {
  "use strict";
  const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>()\[\]{}]+[^\s"<>()\[\]{}.,;:])/gi;
  const YEAR_IN = /\((\d{4})[a-z]?(?:,[^)]*)?\)|\((?:n\.d\.|t\.t\.|in press|sedang terbit)\)/i;
  const HEAD_RE = /^\s*(?:#+\s*|\*\*)?\s*(daftar\s+(?:pustaka|rujukan|referensi)|referensi|references?|bibliography|bibliografi|sumber(?:\s+rujukan)?|kepustakaan|works\s+cited)\s*:?\s*(?:\*\*)?\s*$/im;
  const STOP = new Set("a an the of and or in on for to with by from at as is are be into its their this that dan di ke dari yang untuk pada dalam dengan terhadap sebagai atau oleh".split(" "));

  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = s => norm(s).split(" ").filter(w => w && !STOP.has(w));
  function sim(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    return (2 * inter) / (A.size + B.size);
  }
  const cleanDoi = d => String(d || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/[.,;:)\]]+$/, "").toLowerCase();

  function stripMd(line) { return String(line).replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 $2").replace(/\*/g, "").trim(); }

  // Pecah teks menjadi bagian isi dan daftar pustaka.
  function splitText(text) {
    const t = String(text || "").replace(/\r/g, "");
    const m = HEAD_RE.exec(t);
    if (m) return { body: t.slice(0, m.index), refsText: t.slice(m.index + m[0].length), hasHeading: true };
    return { body: t, refsText: "", hasHeading: false };
  }
  function looksLikeRef(line) {
    const l = stripMd(line);
    if (l.length < 25 || l.split(/\s+/).length < 5) return false;
    if (DOI_RE.test(l)) { DOI_RE.lastIndex = 0; return true; }
    DOI_RE.lastIndex = 0;
    if (/^[-•*\d.\[\]()\s]*[A-Z][A-Za-z'’\-]+,\s*(?:[A-Z]\.|[A-Z][a-z]+)/.test(l) && /\(?\b(19|20)\d{2}[a-z]?\b\)?/.test(l)) return true;
    if (/^\s*\[\d+\]\s+\S/.test(l) && /\b(19|20)\d{2}\b/.test(l)) return true;
    return false;
  }
  // Gabungkan baris lanjutan (rujukan yang terpotong ke baris berikutnya).
  function refLines(refsText, body, hasHeading) {
    const src = hasHeading ? refsText : body;
    const raw = src.split(/\n/).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (const r of raw) {
      const l = stripMd(r).replace(/^[-•*]\s+/, "").replace(/^\d{1,3}[.)]\s+/, "");
      if (looksLikeRef(l) || (hasHeading && /^\[\d+\]/.test(l))) out.push(l);
      else if (hasHeading && out.length && !/^#/.test(r) && l.length < 160 && !/[.!?]\s*$/.test(out[out.length - 1])) out[out.length - 1] += " " + l;
      else if (hasHeading && out.length && /^(https?:|doi:)/i.test(l)) out[out.length - 1] += " " + l;
    }
    return out.filter(l => l.length >= 25).slice(0, 40);
  }
  function parseRef(line) {
    const l = stripMd(line);
    DOI_RE.lastIndex = 0;
    const dm = DOI_RE.exec(l); DOI_RE.lastIndex = 0;
    const doi = dm ? cleanDoi(dm[1]) : "";
    let year = null, authors = "", title = "", venue = "";
    const ym = YEAR_IN.exec(l);
    if (ym) {
      year = ym[1] ? +ym[1] : null;
      authors = l.slice(0, ym.index).replace(/^\[\d+\]\s*/, "").trim();
      const rest = l.slice(ym.index + ym[0].length).replace(/^[.\s]+/, "");
      const tm = /^(.+?[.?!])(\s+|$)(.*)$/.exec(rest);
      if (tm) { title = tm[1].replace(/[.]$/, ""); venue = tm[3]; } else title = rest;
    } else {
      const q = /[“"]([^”"]{10,})[”"]/.exec(l); // gaya IEEE: Penulis, "Judul," Jurnal, 2020.
      const y = /\b(19|20)\d{2}\b/.exec(l); year = y ? +y[0] : null;
      if (q) { title = q[1].replace(/[,.]$/, ""); authors = l.slice(0, q.index).replace(/^\[\d+\]\s*/, "").replace(/,\s*$/, ""); venue = l.slice(q.index + q[0].length); }
      else { const parts = l.replace(/^\[\d+\]\s*/, "").split(/\.\s+/); authors = parts[0] || ""; title = parts[1] || ""; venue = parts.slice(2).join(". "); }
    }
    title = title.replace(/https?:\S+/g, "").replace(/\s+/g, " ").trim();
    venue = venue.replace(/https?:\S+|doi:\s*\S+/gi, "").replace(/\s+/g, " ").trim();
    const first = (/^([A-Z][A-Za-z'’\-]+(?:\s+[a-z]{1,3}\s+[A-Z][A-Za-z'’\-]+)?)\s*,/.exec(authors) || /^([A-Z][A-Za-z'’\-]+)/.exec(authors) || [])[1] || "";
    return { raw: l, doi, year, authors, firstAuthor: first, title, venue };
  }

  // Sitasi dalam teks: (Nama, 2020), (Nama & Nama, 2020; Nama et al., 2019), Nama (2020), Nama dkk. (2020)
  function inTextCitations(body) {
    const out = [];
    const t = String(body || "");
    const paren = /\(([^()]*?\b(?:19|20)\d{2}[a-z]?[^()]*)\)/g; let m;
    while ((m = paren.exec(t))) {
      m[1].split(/;\s*/).forEach(part => {
        const mm = /([A-Z][A-Za-z'’\-]+)(?:\s+(?:et al\.|dkk\.?|&|dan|and)\s*(?:[A-Z][A-Za-z'’\-]+)?)?,?\s*((?:19|20)\d{2})[a-z]?/.exec(part.trim());
        if (mm) out.push({ name: mm[1], year: +mm[2], text: part.trim() });
      });
    }
    const narr = /\b([A-Z][A-Za-z'’\-]+)(?:\s+(?:et al\.|dkk\.?|(?:&|dan|and)\s+[A-Z][A-Za-z'’\-]+))?\s+\(((?:19|20)\d{2})[a-z]?\)/g;
    while ((m = narr.exec(t))) out.push({ name: m[1], year: +m[2], text: m[0] });
    const seen = new Set();
    return out.filter(c => { const k = c.name.toLowerCase() + c.year; if (seen.has(k) || /^(Tabel|Table|Gambar|Figure|Bab|Pasal|Tahun|UU|Permendikbud)$/i.test(c.name)) return false; seen.add(k); return true; });
  }

  // Nilai kecocokan satu rujukan dengan kandidat metadata (OpenAlex/Crossref).
  function judge(ref, cands, viaDoi) {
    let best = null, bestScore = -1;
    for (const c of cands || []) {
      const s = ref.title ? sim(ref.title, c.title) : (viaDoi ? 0.9 : sim(ref.raw, c.title));
      const yOk = !ref.year || !c.year || Math.abs(ref.year - c.year) <= 1;
      const aOk = !ref.firstAuthor || (c.authors || []).some(a => norm(a).split(" ").includes(norm(ref.firstAuthor).split(" ").pop()));
      const score = s + (yOk ? 0.08 : -0.25) + (aOk ? 0.08 : -0.12);
      if (score > bestScore) { bestScore = score; best = { c, s, yOk, aOk }; }
    }
    if (!best) return { status: viaDoi ? "doi_missing" : "not_found", label: viaDoi ? "DOI tidak terdaftar" : "Tidak ditemukan", note: viaDoi ? "DOI ini tidak ada di OpenAlex/Crossref. Kemungkinan DOI atau rujukan fiktif." : "Tidak ada karya yang cocok di OpenAlex/Crossref. Kemungkinan rujukan fiktif; periksa manual sebelum dipakai." };
    const c = best.c;
    if (c.retracted) return { status: "retracted", label: "Ditarik (retracted)", match: c, note: "Artikel ini sudah ditarik penerbit. Jangan dikutip." };
    if (viaDoi && ref.title && best.s < 0.5) return { status: "doi_mismatch", label: "DOI tidak cocok", match: c, note: `DOI mengarah ke karya lain: "${c.title}". Judul atau DOI pada rujukan salah.` };
    if (best.s >= 0.82 && best.yOk && best.aOk) return { status: "ok", label: "Terverifikasi", match: c, note: "" };
    if (best.s >= 0.82 && (!best.yOk || !best.aOk)) return { status: "partial", label: "Metadata berbeda", match: c, note: `Karya ditemukan, tetapi ${!best.yOk ? `tahunnya ${c.year}` : ""}${!best.yOk && !best.aOk ? " dan " : ""}${!best.aOk ? `penulis pertamanya ${(c.authors || [])[0] || "berbeda"}` : ""}. Sesuaikan rujukan.` };
    if (best.s >= 0.6) return { status: "similar", label: "Mirip, perlu dicek", match: c, note: `Yang paling mirip: "${c.title}" (${c.year || "t.t."}). Pastikan ini karya yang dimaksud.` };
    return { status: "not_found", label: "Tidak ditemukan", match: null, note: "Tidak ada karya yang cocok di OpenAlex/Crossref. Kemungkinan rujukan fiktif; periksa manual sebelum dipakai." };
  }

  function crossCheck(cites, refs) {
    const key = r => [norm(r.firstAuthor).split(" ").pop(), r.year];
    const refKeys = refs.map(key);
    const missing = cites.filter(c => !refKeys.some(([n, y]) => n && n === norm(c.name).split(" ").pop() && (!y || y === c.year)));
    const unused = refs.filter(r => r.firstAuthor && r.year && !cites.some(c => norm(c.name).split(" ").pop() === norm(r.firstAuthor).split(" ").pop() && c.year === r.year));
    return { missing, unused };
  }

  function stats(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const words = t ? t.split(" ").length : 0;
    const sents = t.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).filter(s => s.split(" ").length >= 3);
    const long = sents.filter(s => s.split(" ").length > 40);
    return { words, sentences: sents.length, longSentences: long.slice(0, 5) };
  }

  const API = { splitText, refLines, parseRef, inTextCitations, judge, crossCheck, sim, stats, cleanDoi };
  if (typeof module === "object" && module.exports) module.exports = API; else root.KtiRefCheck = API;
})(typeof self !== "undefined" ? self : this);
