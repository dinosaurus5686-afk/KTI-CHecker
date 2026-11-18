// Jembatan aman antara halaman dan proses utama.
const { contextBridge, ipcRenderer } = require("electron");
const listeners = new Map();
const compSubs = new Set(), textSubs = new Set(), analyzeSubs = new Set();
ipcRenderer.on("companion:state", (e, st) => compSubs.forEach(f => f(st)));
ipcRenderer.on("companion:text", (e, p) => textSubs.forEach(f => f(p)));
ipcRenderer.on("companion:analyze", (e, p) => analyzeSubs.forEach(f => f(p)));
ipcRenderer.on("ai:delta", (e, id, text) => { const f = listeners.get(id); if (f) f(text); });
let seq = 0;
contextBridge.exposeInMainWorld("ktiDesktop", {
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: patch => ipcRenderer.invoke("settings:save", patch),
  providers: () => ipcRenderer.invoke("settings:providers"),
  listModels: (id, draft) => ipcRenderer.invoke("ai:listModels", id, draft),
  info: () => ipcRenderer.invoke("app:info"),
  saveFile: (filename, data, isText) => ipcRenderer.invoke("file:save", { filename, data, isText }),
  reveal: p => ipcRenderer.invoke("file:reveal", p),
  services: () => ipcRenderer.invoke("settings:services"),
  companion: {
    state: () => ipcRenderer.invoke("companion:state"),
    onState: f => { compSubs.add(f); return () => compSubs.delete(f); },
    onText: f => { textSubs.add(f); return () => textSubs.delete(f); },
    onAnalyze: f => { analyzeSubs.add(f); return () => analyzeSubs.delete(f); },
    expand: v => ipcRenderer.invoke("companion:expand", v),
    hide: () => ipcRenderer.invoke("companion:hide"),
    show: () => ipcRenderer.invoke("companion:show"),
    pin: v => ipcRenderer.invoke("companion:pin", v),
    clipboard: () => ipcRenderer.invoke("companion:clipboard"),
    openMain: payload => ipcRenderer.invoke("companion:openMain", payload),
    simulate: (p, t) => ipcRenderer.invoke("companion:simulate", p, t),
    simText: t => ipcRenderer.invoke("companion:simText", t)
  },
  testAI: (id, draft) => ipcRenderer.invoke("ai:test", id, draft),
  lit: (id, args, draftKey) => {
    const rid = "l" + (++seq) + "_" + Date.now();
    const p = ipcRenderer.invoke("lit:search", rid, id, args, draftKey);
    return { promise: p, abort: () => ipcRenderer.send("lit:abort", rid) };
  },
  sjrLookup: items => ipcRenderer.invoke("sjr:lookup", items),
  sjrInfo: () => ipcRenderer.invoke("sjr:info"),
  sjrDownload: () => ipcRenderer.invoke("sjr:download"),
  sjrImport: () => ipcRenderer.invoke("sjr:import"),
  ai: (payload, onDelta) => {
    const id = "r" + (++seq) + "_" + Date.now();
    if (onDelta) listeners.set(id, onDelta);
    const p = ipcRenderer.invoke("ai:request", id, payload).finally(() => listeners.delete(id));
    return { id, promise: p, abort: () => ipcRenderer.send("ai:abort", id) };
  }
});
