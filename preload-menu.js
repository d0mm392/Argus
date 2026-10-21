// Preload des Menüfensters (Rechtsklick-Menü im Argus-Stil): nimmt Einträge entgegen, meldet Größe und Auswahl.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("menu", {
  onShow: (fn) => ipcRenderer.on("menu-show", (_e, d) => fn(d)),
  size: (w, h) => ipcRenderer.send("menu-size", w, h),
  pick: (id) => ipcRenderer.send("menu-pick", id),
  close: () => ipcRenderer.send("menu-close"),
});
