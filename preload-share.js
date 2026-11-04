// Brücke für das Übertragungsfenster, die rote Übertragungsleiste und den Zeiger (app/share*.html)
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("share", {
  sources: () => ipcRenderer.invoke("share-sources"),
  config: () => ipcRenderer.invoke("share-config"),
  setConfig: (patch) => ipcRenderer.invoke("share-config-set", patch),
  ice: () => ipcRenderer.invoke("share-ice"),
  state: (s) => ipcRenderer.send("share-state", s),
  pointer: (p) => ipcRenderer.send("share-pointer", p),
  attention: (text) => ipcRenderer.send("share-attention", text),
  onStopRequest: (cb) => ipcRenderer.on("share-stop-req", () => cb()),
  // Vermittlung über den Hauptprozess (Ausweichweg)
  wsOpen: (url, proto) => ipcRenderer.invoke("share-ws-open", url, proto),
  wsSend: (id, data) => ipcRenderer.send("share-ws-send", id, data),
  wsClose: (id) => ipcRenderer.send("share-ws-close", id),
  onWs: (cb) => ipcRenderer.on("share-ws", (_e, id, k, v) => cb(id, k, v)),
  // Leiste
  onBar: (cb) => ipcRenderer.on("share-bar", (_e, s) => cb(s)),
  barStop: () => ipcRenderer.send("share-bar-stop"),
  barShow: () => ipcRenderer.send("share-bar-show"),
  // Zeiger
  onPointer: (cb) => ipcRenderer.on("share-ptr", (_e, p) => cb(p)),
});
