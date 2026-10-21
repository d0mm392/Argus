// Brücke für das Lagebild-Fenster: Daten empfangen, Links öffnen, schließen
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("news", {
  onMarket: (cb) => ipcRenderer.on("market", (_e, d) => cb(d)),
  open: (url) => ipcRenderer.send("open-url", url),
  refresh: () => ipcRenderer.send("news-refresh"),
  close: () => ipcRenderer.send("news-close"),
});
