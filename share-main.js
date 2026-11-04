// Bildschirm übertragen (Hauptprozess): Übertragungsfenster, sichtbare Leiste während der Übertragung, Zeiger des Zuschauers.
// Die Verbindung selbst (WebRTC, Vermittlung) läuft im Fenster app/share.html. Hier gibt es nur Fenster, Quellenliste und Einstellungen.
// Nichts startet von allein: Fenster, Code, Annehmen und Übertragung löst immer der Nutzer selbst aus.
"use strict";
const path = require("path");

const KEYS = ["shareName", "shareSignal", "shareStun", "shareTurnUrl", "shareTurnUser", "shareTurnPass", "shareRelayOnly", "sharePreset", "shareAudio", "shareBuffer", "shareVolume", "shareBox"];

function create({ electron, getConfig, saveConfig, appUrl, icon, log }) {
  const { BrowserWindow, ipcMain, desktopCapturer, screen, Notification } = electron;
  const wins = new Set();
  let bar = null, ptr = null, ptrTimer = null, state = { active: false };
  const alive = (w) => w && !w.isDestroyed();
  const fromShare = (e) => [...wins].some((w) => alive(w) && w.webContents === e.sender);

  function open(opts = {}) {
    const first = [...wins].find(alive);
    if (first && !opts.second) { if (first.isMinimized()) first.restore(); first.show(); first.focus(); return first; }
    const c = getConfig(), wa = screen.getPrimaryDisplay().workArea;
    const box = c.shareBox && screen.getAllDisplays().some((d) => d.workArea.x <= c.shareBox.x + 40 && c.shareBox.x + 40 <= d.workArea.x + d.workArea.width && d.workArea.y <= c.shareBox.y && c.shareBox.y <= d.workArea.y + d.workArea.height)
      ? c.shareBox : { width: Math.min(1100, wa.width - 40), height: Math.min(760, wa.height - 40), x: wa.x + Math.round((wa.width - Math.min(1100, wa.width - 40)) / 2), y: wa.y + Math.round((wa.height - Math.min(760, wa.height - 40)) / 2) };
    const w = new BrowserWindow({ ...box, minWidth: 640, minHeight: 460, title: "Argus · Bildschirm übertragen", backgroundColor: "#0a111c", autoHideMenuBar: true, show: false, icon,
      webPreferences: { preload: path.join(__dirname, "preload-share.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    wins.add(w);
    w.once("ready-to-show", () => w.show());
    const keepBox = () => { if (!w.isMaximized() && !w.isFullScreen() && !opts.second) { getConfig().shareBox = w.getBounds(); saveConfig(); } };
    w.on("moved", keepBox); w.on("resized", keepBox);
    const wcId = w.webContents.id;
    w.on("closed", () => { wins.delete(w); setState(wcId, { active: false }); });
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    w.loadURL(appUrl("share.html")).catch((e) => log && log(e));
    return w;
  }

  // Rote Leiste oben auf dem übertragenen Bildschirm: zeigt, dass und an wen übertragen wird, mit „Beenden“.
  // Sie ist vom Mitschnitt ausgenommen (der Zuschauer sieht sie nicht), damit sie das Bild nicht verdeckt.
  function showBar(info) {
    const d = (info.displayId && screen.getAllDisplays().find((x) => String(x.id) === String(info.displayId))) || screen.getPrimaryDisplay();
    const wa = d.workArea, W = 460, H = 38, x = wa.x + Math.round((wa.width - W) / 2), y = wa.y + 6;
    if (!alive(bar)) {
      bar = new BrowserWindow({ x, y, width: W, height: H, frame: false, transparent: true, backgroundColor: "#00000000", resizable: false, movable: true, minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, alwaysOnTop: true, show: false, focusable: true, hasShadow: false, title: "Argus Übertragungsleiste",
        webPreferences: { preload: path.join(__dirname, "preload-share.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      bar.setAlwaysOnTop(true, "screen-saver");
      try { bar.setContentProtection(true); } catch {}
      bar.on("closed", () => { bar = null; });
      bar.once("ready-to-show", () => { if (alive(bar)) { bar.showInactive(); bar.webContents.send("share-bar", state); } });
      bar.loadURL(appUrl("share-bar.html")).catch((e) => log && log(e));
    } else {
      bar.setBounds({ x, y, width: W, height: H }); bar.webContents.send("share-bar", state); if (!bar.isVisible()) bar.showInactive();
    }
  }
  function hideBar() { if (alive(bar)) bar.close(); bar = null; }

  // Zustand je Fenster; die Leiste zeigt das Fenster, das gerade sendet
  const perWin = new Map();
  function setState(wcId, s) {
    const one = { active: !!s.active, role: s.role || "", peer: String(s.peer || "").slice(0, 40), sending: !!s.sending, displayId: s.displayId || null, audio: !!s.audio };
    if (one.active) perWin.set(wcId, one); else perWin.delete(wcId);
    const all = [...perWin.values()];
    state = all.find((x) => x.sending) || all[0] || { active: false, role: "", peer: "", sending: false, displayId: null, audio: false };
    if (state.active && state.sending) showBar(state); else hideBar();
    if (!state.active) hidePointer();
    for (const fn of listeners) try { fn(state); } catch {}
  }
  const listeners = [];

  // Zeiger: Der Zuschauer klickt ins Bild, beim Übertragenden erscheint an der Stelle kurz ein Ring (nur bei ganzen Bildschirmen)
  function pointer(p) {
    if (!state.active || !state.sending || !p || !state.displayId) return;
    const x = Number(p.x), y = Number(p.y); if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
    const d = screen.getAllDisplays().find((q) => String(q.id) === String(state.displayId)); if (!d) return;
    const b = d.bounds;
    if (!alive(ptr)) {
      ptr = new BrowserWindow({ ...b, frame: false, transparent: true, backgroundColor: "#00000000", resizable: false, movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false,
        title: "Argus Zeiger", webPreferences: { preload: path.join(__dirname, "preload-share.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      ptr.setIgnoreMouseEvents(true); ptr.setAlwaysOnTop(true, "screen-saver");
      ptr.on("closed", () => { ptr = null; });
      ptr.loadURL(appUrl("share-ptr.html")).catch((e) => log && log(e));
      ptr.once("ready-to-show", () => { if (alive(ptr)) { ptr.showInactive(); ptr.webContents.send("share-ptr", { x, y, label: String(p.label || "").slice(0, 40) }); } });
    } else { ptr.setBounds(b); ptr.showInactive(); ptr.webContents.send("share-ptr", { x, y, label: String(p.label || "").slice(0, 40) }); }
    clearTimeout(ptrTimer); ptrTimer = setTimeout(hidePointer, 6000);
  }
  function hidePointer() { clearTimeout(ptrTimer); if (alive(ptr)) ptr.close(); ptr = null; }

  ipcMain.handle("share-sources", async (e) => {
    if (!fromShare(e)) return [];
    try {
      const src = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
      return src.filter((s) => s.name && !/^Argus (Übertragungsleiste|Zeiger)$/.test(s.name)).map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:"), displayId: s.display_id || "", thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : "" }))
        .sort((a, b) => (b.screen - a.screen) || a.name.localeCompare(b.name));
    } catch { return []; }
  });
  // Einstellungen fürs Fenster. Das TURN-Passwort geht nur als „gesetzt ja/nein“ raus, außer zum Verbinden (share-ice).
  ipcMain.handle("share-config", (e) => {
    if (!fromShare(e)) return {};
    const c = getConfig(), o = {};
    for (const k of KEYS) if (k !== "shareTurnPass" && k !== "shareBox") o[k] = c[k];
    o.hasTurnPass = !!c.shareTurnPass;
    return o;
  });
  ipcMain.handle("share-config-set", (e, patch) => {
    if (!fromShare(e) || !patch || typeof patch !== "object") return false;
    const c = getConfig();
    for (const [k, v] of Object.entries(patch)) {
      if (!KEYS.includes(k) || k === "shareBox") continue;
      if (typeof v === "boolean") c[k] = v;
      else if (typeof v === "number" && isFinite(v)) c[k] = Math.max(0, Math.min(100, v));
      else if (typeof v === "string") c[k] = v.slice(0, 600);
    }
    saveConfig(); return true;
  });
  ipcMain.handle("share-ice", (e) => {
    if (!fromShare(e)) return null;
    const c = getConfig();
    return { stun: c.shareStun, turnUrl: c.shareTurnUrl, turnUser: c.shareTurnUser, turnPass: c.shareTurnPass, relayOnly: !!c.shareRelayOnly, signal: c.shareSignal };
  });
  // Ausweichweg für die Vermittlung: WebSocket aus dem Hauptprozess (Node), falls das Fenster selbst keine Verbindung bekommt
  // (z. B. Virenschutz/Firewall-Filter für den Browser-Teil). Nur ws/wss, höchstens 8 gleichzeitig, nur für Übertragungsfenster.
  const WSLib = require("ws"), socks = new Map(); let sockN = 0;
  ipcMain.handle("share-ws-open", (e, url, proto) => {
    if (!fromShare(e) || typeof url !== "string" || !/^wss?:\/\//i.test(url) || socks.size >= 8) return 0;
    const id = ++sockN, wc = e.sender, emit = (k, v) => { try { if (!wc.isDestroyed()) wc.send("share-ws", id, k, v); } catch {} };
    let s; try { s = new WSLib(url, proto ? [String(proto)] : undefined, { handshakeTimeout: 9000 }); } catch (err) { setTimeout(() => emit("close", { code: 0, reason: String(err.message || err) }), 0); return id; }
    socks.set(id, { s, wc });
    s.on("open", () => emit("open"));
    s.on("message", (d, isBin) => emit("message", isBin ? new Uint8Array(d) : d.toString()));
    s.on("error", (err) => emit("error", String(err.message || err).slice(0, 160)));
    s.on("close", (code, reason) => { socks.delete(id); emit("close", { code, reason: String(reason || "") }); });
    wc.once("destroyed", () => { try { s.terminate(); } catch {} socks.delete(id); });
    return id;
  });
  ipcMain.on("share-ws-send", (e, id, data) => { const x = socks.get(id); if (x && x.wc === e.sender && x.s.readyState === 1) try { x.s.send(data); } catch {} });
  ipcMain.on("share-ws-close", (e, id) => { const x = socks.get(id); if (x && x.wc === e.sender) try { x.s.close(); } catch {} });
  ipcMain.on("share-state", (e, s) => { if (fromShare(e)) setState(e.sender.id, s || {}); });
  ipcMain.on("share-pointer", (e, p) => { if (fromShare(e)) pointer(p); });
  ipcMain.on("share-attention", (e, t) => {
    const w = [...wins].find((x) => alive(x) && x.webContents === e.sender); if (!w) return;
    try { w.flashFrame(true); setTimeout(() => alive(w) && w.flashFrame(false), 8000); } catch {}
    try { if (Notification.isSupported()) new Notification({ title: "Argus · Bildschirm übertragen", body: String(t || "").slice(0, 160), silent: false }).show(); } catch {}
  });
  // „Beenden“ in der Leiste: das Fenster beendet die Verbindung sauber
  const fromBar = (e) => alive(bar) && bar.webContents === e.sender;
  ipcMain.on("share-bar-stop", (e) => { if (!fromBar(e)) return; for (const w of wins) if (alive(w)) w.webContents.send("share-stop-req"); perWin.clear(); setState(0, { active: false }); });
  ipcMain.on("share-bar-show", (e) => { if (!fromBar(e)) return; const w = [...wins].find(alive); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });

  return { open, onState: (fn) => listeners.push(fn), state: () => state, stopAll: () => { for (const w of wins) if (alive(w)) w.webContents.send("share-stop-req"); }, KEYS };
}
let instance = null;
module.exports = { create: (o) => (instance = create(o)), get instance() { return instance; } };
