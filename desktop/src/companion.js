// Pendamping AI: mendeteksi Claude, ChatGPT, atau Gemini yang sedang dibuka (aplikasi desktop atau tab browser),
// lalu menampilkan panel mengambang KTI Checker dan memeriksa otomatis teks yang disalin dari AI tersebut.
const { BrowserWindow, screen, clipboard, Tray, Menu, nativeImage, app, Notification } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

const BROWSERS = /^(chrome|msedge|firefox|brave|opera|opera_gx|vivaldi|arc|iexplore|librewolf|waterfox|yandex|thorium|zen|floorp|chromium)$/i;
const SELF = /^(kti checker nor|electron)$/i;

function classify(proc, title) {
  const p = String(proc || "").toLowerCase().replace(/\.exe$/, "");
  const t = String(title || "");
  if (/^claude$/.test(p)) return "claude";
  if (/^chatgpt$/.test(p)) return "chatgpt";
  if (/^(gemini|google gemini)$/.test(p)) return "gemini";
  if (BROWSERS.test(p) || p === "applicationframehost") {
    // Judul tab: "Claude", "… - Claude", "ChatGPT", "… | ChatGPT", "Gemini", "Google Gemini", "… - Gemini"
    if (/(^|[\s\-–—|·:])Claude($|[\s\-–—|·:])/.test(t) && !/claude\s*(code|api)\s*docs/i.test(t)) return "claude";
    if (/ChatGPT/.test(t)) return "chatgpt";
    if (/(^|[\s\-–—|·:])(Google )?Gemini($|[\s\-–—|·:])/.test(t)) return "gemini";
  }
  return null;
}
const LABEL = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };

// Skrip PowerShell yang terus berjalan: mencetak "proses|judul" setiap kali jendela aktif berganti.
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class KtiW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$last = ''
while ($true) {
  $h = [KtiW]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][KtiW]::GetWindowText($h, $sb, 512)
  $procId = 0
  [void][KtiW]::GetWindowThreadProcessId($h, [ref]$procId)
  $pn = ''
  try { $pn = (Get-Process -Id $procId).ProcessName } catch {}
  $cur = "$pn|$($sb.ToString())"
  if ($cur -ne $last) { [Console]::Out.WriteLine($cur); [Console]::Out.Flush(); $last = $cur }
  Start-Sleep -Milliseconds 800
}`;

class Companion {
  constructor(opts) {
    this.opts = opts; // { appDir, preload, getConfig, onOpenMain, iconPath }
    this.panel = null; this.tray = null; this.proc = null;
    this.state = { app: null, title: "", lastApp: null, lastSeen: 0, pinned: false, expanded: false };
    this.clipLast = ""; this.clipTimer = null; this.hideTimer = null;
  }
  config() { return this.opts.getConfig(); }

  start() {
    this.makeTray();
    this.applyConfig();
  }
  applyConfig() {
    const c = this.config();
    if (c.enabled) this.startWatcher(); else this.stopWatcher();
    try { app.setLoginItemSettings({ openAtLogin: !!(c.enabled && c.autostart), args: ["--background"] }); } catch (e) {}
    this.updateTray();
    this.broadcast();
  }

  /* ───── Deteksi jendela ───── */
  startWatcher() {
    if (this.proc || process.platform !== "win32") return;
    const enc = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    try {
      this.proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", enc], { windowsHide: true });
    } catch (e) { this.proc = null; return; }
    let buf = "";
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", d => {
      buf += d; let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1); const k = line.indexOf("|"); if (k >= 0) this.onForeground(line.slice(0, k), line.slice(k + 1)); }
    });
    this.proc.on("exit", () => { this.proc = null; if (this.config().enabled && !this.stopping) setTimeout(() => this.startWatcher(), 5000); });
  }
  stopWatcher() { if (this.proc) { this.stopping = true; try { this.proc.kill(); } catch (e) {} this.proc = null; this.stopping = false; } }

  onForeground(proc, title) {
    if (SELF.test(String(proc || ""))) return; // jendela KTI Checker sendiri: biarkan status apa adanya
    const c = this.config();
    let ai = classify(proc, title);
    if (ai && c.apps && c.apps[ai] === false) ai = null;
    const prev = this.state.app;
    this.state.app = ai; this.state.title = title;
    if (ai) {
      this.state.lastApp = ai; this.state.lastSeen = Date.now();
      clearTimeout(this.hideTimer);
      if (ai !== prev) {
        this.showPanel(false);
        if (!this.notified) { this.notified = true; this.notify(`${LABEL[ai]} terdeteksi`, "Pendamping KTI aktif. Salin (Ctrl+C) jawaban AI untuk diperiksa otomatis: rujukan fiktif, DOI, sitasi, dan kuartil jurnal."); }
      }
      this.startClipboard();
    } else if (prev) {
      // Panel tetap tampil sebentar agar hasil bisa dibaca; disembunyikan bila tidak disematkan.
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { if (!this.state.app && !this.state.pinned && !this.state.expanded) this.hidePanel(); this.stopClipboard(); }, 45000);
    }
    this.broadcast(); this.updateTray();
  }

  /* ───── Papan klip ───── */
  startClipboard() {
    if (this.clipTimer || !this.config().clipboard) return;
    this.clipLast = clipboard.readText() || "";
    this.clipTimer = setInterval(() => {
      const recent = this.state.app || Date.now() - this.state.lastSeen < 60000;
      if (!recent) return this.stopClipboard();
      const t = clipboard.readText() || "";
      if (t && t !== this.clipLast) {
        this.clipLast = t;
        if (t.trim().length >= (this.config().minChars || 120) && !/^Pemeriksaan KTI Checker NOR/.test(t)) this.pushText(t, this.state.lastApp, "clipboard");
      }
    }, 900);
  }
  stopClipboard() { clearInterval(this.clipTimer); this.clipTimer = null; }
  pushText(text, source, how) {
    this.showPanel(true);
    const send = () => this.panel && !this.panel.isDestroyed() && this.panel.webContents.send("companion:text", { text, source: source || this.state.lastApp, how });
    if (this.panel.webContents.isLoading()) this.panel.webContents.once("did-finish-load", send); else send();
  }

  /* ───── Panel mengambang ───── */
  bounds(expanded) {
    const wa = screen.getPrimaryDisplay().workArea;
    const w = expanded ? 430 : 360, h = expanded ? Math.min(680, wa.height - 40) : 96;
    return { x: wa.x + wa.width - w - 18, y: wa.y + wa.height - h - 18, width: w, height: h };
  }
  ensurePanel() {
    if (this.panel && !this.panel.isDestroyed()) return this.panel;
    this.panel = new BrowserWindow(Object.assign(this.bounds(false), {
      frame: false, resizable: true, alwaysOnTop: true, skipTaskbar: true, show: false, transparent: false,
      backgroundColor: "#160b0a", title: "Pendamping KTI", icon: this.opts.iconPath, minWidth: 320, minHeight: 90,
      webPreferences: { preload: this.opts.preload, contextIsolation: true, sandbox: true }
    }));
    this.panel.setAlwaysOnTop(true, "floating");
    this.panel.loadURL("app://kti/companion.html");
    this.panel.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) require("electron").shell.openExternal(url); return { action: "deny" }; });
    this.panel.on("closed", () => { this.panel = null; this.state.expanded = false; });
    return this.panel;
  }
  showPanel(expand) {
    if (!this.config().enabled) return;
    const p = this.ensurePanel();
    if (expand && !this.state.expanded) { this.state.expanded = true; p.setBounds(this.bounds(true)); }
    if (!p.isVisible()) { if (!this.state.expanded) p.setBounds(this.bounds(false)); p.showInactive(); }
    this.broadcast();
  }
  setExpanded(v) { this.state.expanded = !!v; if (this.panel && !this.panel.isDestroyed()) this.panel.setBounds(this.bounds(!!v)); this.broadcast(); }
  hidePanel() { if (this.panel && !this.panel.isDestroyed()) this.panel.hide(); this.state.expanded = false; }
  setPinned(v) { this.state.pinned = !!v; this.broadcast(); }

  publicState() {
    const c = this.config();
    return { app: this.state.app, appLabel: LABEL[this.state.app] || "", lastApp: this.state.lastApp, lastLabel: LABEL[this.state.lastApp] || "", pinned: this.state.pinned, expanded: this.state.expanded, enabled: !!c.enabled, watching: !!this.proc || process.platform !== "win32", platform: process.platform, clipboard: !!c.clipboard };
  }
  broadcast() {
    const st = this.publicState();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("companion:state", st);
  }

  /* ───── Tray ───── */
  makeTray() {
    if (this.tray) return;
    try {
      const img = nativeImage.createFromPath(this.opts.iconPath).resize({ width: 16, height: 16 });
      this.tray = new Tray(img);
      this.tray.setToolTip("KTI Checker NOR");
      this.tray.on("click", () => this.opts.onOpenMain());
      this.updateTray();
    } catch (e) { this.tray = null; }
  }
  updateTray() {
    if (!this.tray) return;
    const c = this.config();
    const st = this.state.app ? `${LABEL[this.state.app]} terdeteksi` : (c.enabled ? "Menunggu Claude/ChatGPT/Gemini" : "Pendamping nonaktif");
    this.tray.setToolTip("KTI Checker NOR · " + st);
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Buka KTI Checker", click: () => this.opts.onOpenMain() },
      { label: "Tampilkan panel pendamping", enabled: !!c.enabled, click: () => this.showPanel(true) },
      { type: "separator" },
      { label: "Pendamping otomatis (Claude, ChatGPT, Gemini)", type: "checkbox", checked: !!c.enabled, click: m => this.opts.saveConfig({ enabled: m.checked }) },
      { label: "Periksa teks yang disalin dari AI", type: "checkbox", checked: !!c.clipboard, click: m => this.opts.saveConfig({ clipboard: m.checked }) },
      { label: "Jalankan saat Windows menyala", type: "checkbox", checked: !!c.autostart, click: m => this.opts.saveConfig({ autostart: m.checked }) },
      { type: "separator" },
      { label: "Keluar", click: () => { app.isQuitting = true; app.quit(); } }
    ]));
  }
  notify(title, body) { try { if (Notification.isSupported()) new Notification({ title, body, icon: this.opts.iconPath, silent: true }).show(); } catch (e) {} }
  stop() { this.stopWatcher(); this.stopClipboard(); if (this.tray) { this.tray.destroy(); this.tray = null; } }
}

module.exports = { Companion, classify };
