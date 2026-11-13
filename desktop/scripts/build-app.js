// Menyalin ../index.html (versi web KTI Checker) ke app/index.html dan menyesuaikannya untuk desktop:
// pustaka lokal (tanpa CDN), jembatan AI (bridge.js), tema NOR (desktop.css), dan teks yang tidak lagi merujuk ke claude.ai.
// Setiap tambalan wajib cocok; bila versi web berubah dan tambalan tidak cocok, build berhenti dengan pesan jelas.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "..", "index.html");
const OUT = path.join(ROOT, "app", "index.html");
const VENDOR = path.join(ROOT, "app", "vendor");
const nm = p => path.join(ROOT, "node_modules", p);

let html = fs.readFileSync(SRC, "utf8");

/* 1. Pustaka lokal */
fs.mkdirSync(VENDOR, { recursive: true });
const libs = {
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js": ["jszip/dist/jszip.min.js", "jszip.min.js"],
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js": ["jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js": ["jspdf-autotable/dist/jspdf.plugin.autotable.min.js", "jspdf.plugin.autotable.min.js"],
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js": ["pdfjs-dist/build/pdf.min.js", "pdf.min.js"],
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js": ["pdfjs-dist/build/pdf.worker.min.js", "pdf.worker.min.js"]
};
for (const [url, [from, to]] of Object.entries(libs)) {
  fs.copyFileSync(nm(from), path.join(VENDOR, to));
  if (!html.includes(url)) throw new Error("URL pustaka tidak ditemukan di index.html: " + url);
  html = html.split(url).join("vendor/" + to);
}

/* 2. Pisahkan blok data base64 (template .docx) agar tidak ikut diganti teksnya */
const blobs = [];
html = html.replace(/<script id="[^"]+" type="application\/octet-stream">[\s\S]*?<\/script>/g, m => { blobs.push(m); return `\u0000BLOB${blobs.length - 1}\u0000`; });

let n = 0;
function patch(from, to, label) {
  if (typeof from === "string") {
    if (!html.includes(from)) throw new Error("Tambalan gagal (" + label + "): teks tidak ditemukan");
    html = html.split(from).join(to);
  } else {
    if (!from.test(html)) throw new Error("Tambalan gagal (" + label + "): pola tidak cocok");
    html = html.replace(from, to);
  }
  n++;
}

/* 3. Muat tema & jembatan desktop */
patch("<title>KTI Checker</title>", `<!doctype html>
<html lang="id"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KTI Checker NOR</title>
<link rel="icon" href="icon.png">
<script src="bridge.js"></script>`, "head");
patch(/<\/style>\s*<div class="app">/, m => m.replace("</style>", "</style>\n<link rel=\"stylesheet\" href=\"desktop.css\">"), "css-order");

/* 4. Merek NOR di rel kiri */
patch(/<div class="brand">\s*<svg[\s\S]*?<\/svg>\s*<div><b>KTI CHECKER <span>DASHBOARD<\/span><\/b><\/div>\s*<\/div>/,
  `<div class="brand nor-brand"><img src="logo-mark.png" alt="NOR" class="nor-logo"><div><b>KTI CHECKER</b><small>Nusantara of Research</small></div></div>
    <button type="button" class="aiset" id="btnAISet" title="Atur penyedia AI dan API key"><span class="dot" id="aiDot"></span><span><b>Pengaturan AI</b><small id="aiProvLabel">Belum diatur</small></span></button>`, "brand");

/* 5. Banner sambungan AI versi desktop */
patch("function claudeBanner(){", "function claudeBanner(){ if (window.__ktiBanner) return (!S.sampleChecked || S.sample) ? \"\" : window.__ktiBanner();", "banner");

/* 5b. Latar NOR merah sebagai pilihan bawaan */
patch(`const BG_OPTS = [["hutan","Hutan"],`, `const BG_OPTS = [["nor","NOR merah"],["hutan","Hutan"],`, "bg-opts");
patch(`bgApply(bgGet("kti.bg")||"hutan");`, `bgApply(bgGet("kti.bg")||"nor");`, "bg-default");

/* 6. Sumber literatur: OpenAlex / Crossref / Semantic Scholar menggantikan konektor */
patch(`const SRC_DB = {scite:"Scite", consensus:"Consensus", scispace:"SciSpace"};`,
  `const SRC_DB = {scite:"OpenAlex", consensus:"Crossref", scispace:"Semantic Scholar"};`, "srcdb");
patch(`quartile:c.via==="consensus"?qLabel:""`, `quartile:""`, "quartile");

/* 7. Google Drive tidak tersedia di desktop */
patch(`if (c==="server_not_connected") return "Google Drive belum tersambung untuk akun ini. Sambungkan di claude.ai → Pengaturan → Konektor → Google Drive, lalu coba lagi.";`,
  `if (c==="server_not_connected") return "Google Drive tidak tersedia di aplikasi desktop. Unduh berkas dari Drive ke laptop, lalu pilih lewat tombol unggah.";`, "gdrive");

/* 8. Teks yang merujuk claude.ai */
const T = [
  ["Buka halaman ini di claude.ai atau aplikasi Claude dengan akun Anda; revisi memakai kuota akun Claude Anda.", "Isi API key di Pengaturan AI (kiri atas); revisi memakai kuota API key Anda."],
  ["Hubungkan Scite, Consensus, atau SciSpace di claude.ai → Pengaturan → Konektor.", "Periksa koneksi internet (OpenAlex, Crossref, Semantic Scholar)."],
  ["Tanya Pembimbing hanya tersedia di claude.ai atau aplikasi Claude.", "Tanya Pembimbing tersedia setelah API key diisi di Pengaturan AI."],
  ["Fitur ini hanya berjalan saat aplikasi dibuka di claude.ai atau aplikasi Claude.", "Fitur ini berjalan setelah API key diisi di Pengaturan AI."],
  ["hanya tersedia saat halaman ini dibuka di claude.ai atau aplikasi Claude.", "tersedia setelah API key diisi di Pengaturan AI."],
  ["Sambungan Google Drive kedaluwarsa. Sambungkan ulang di claude.ai → Pengaturan → Konektor → Google Drive.", "Google Drive tidak tersedia di aplikasi desktop."]
];
for (const [a, b] of T) patch(a, b, a.slice(0, 30));
html = html.replace(/([Bb])uka (?:halaman ini |aplikasi )?di claude\.ai(?: atau aplikasi Claude)?/g, (m, b) => (b === "B" ? "I" : "i") + "si API key di Pengaturan AI");
// Sisa sebutan "Claude" pada teks antarmuka menjadi "AI" (pengenal kode huruf kecil tidak tersentuh)
html = html.replace(/(?<![A-Za-z0-9_$.\/-])Claude(?![A-Za-z0-9_])/g, "AI");

/* 9. Kembalikan blok data */
html = html.replace(/\u0000BLOB(\d+)\u0000/g, (m, i) => blobs[+i]);

fs.writeFileSync(OUT, html, "utf8");
console.log(`app/index.html siap (${n} tambalan, ${(html.length / 1048576).toFixed(1)} MB)`);
