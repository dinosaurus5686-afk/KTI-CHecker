// Jembatan aman antara halaman dan proses utama.
const { contextBridge, ipcRenderer } = require("electron");
const listeners = new Map();
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
  ai: (payload, onDelta) => {
    const id = "r" + (++seq) + "_" + Date.now();
    if (onDelta) listeners.set(id, onDelta);
    const p = ipcRenderer.invoke("ai:request", id, payload).finally(() => listeners.delete(id));
    return { id, promise: p, abort: () => ipcRenderer.send("ai:abort", id) };
  }
});
