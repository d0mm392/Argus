// Foreman-Dashboard: Leistung (Watt) und Laufzeit je Miner. Die offizielle API liefert diese Werte nicht, das Dashboard zeigt sie in der Spalte „Wattage“.
// Nur lesend und mit der eigenen Anmeldung des Nutzers: Argus öffnet das Dashboard in einem eigenen Fenster (eigene Sitzung), der Nutzer meldet sich dort selbst an.
// Danach wird die Miner-Tabelle alle paar Minuten unsichtbar geladen und gelesen. Passwörter oder Sitzungsdaten verarbeitet Argus nicht.
const PART = "persist:foremandash", URL = "https://dashboard.foreman.mn/dashboard/miners/";
let electron = null, on = false, timer = null, busy = false, win = null, sampleOut = null, sampled = false;
let snap = { on: false, state: "off", ts: 0, err: "", count: 0, watt: 0 };
let byName = new Map(), pxCounts = new Map(); // pxCounts: kleingeschriebener Pickaxe-Name -> { n: alle Miner, on: mit Hashrate } // kleingeschriebener Minername -> { w: Watt | null, up: Laufzeit }

// Läuft im Dashboard: Tabelle suchen, alle Seiten laden, Zeilen als einfache Objekte zurückgeben
const SCRAPE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (/login|signin/i.test(location.pathname) || document.querySelector("input[type=password]")) return { login: true };
  const $ = window.jQuery || window.$; if (!$ || !$.fn || !$.fn.dataTable) return { err: "Tabelle nicht gefunden" };
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { const ts = $.fn.dataTable.tables({ api: true }); if (ts.count()) { const c = ts.table(0); if (c.rows().count() > 0) t = c; } if (!t) await wait(500); }
  if (!t) return { err: "Tabelle ist leer oder lädt nicht" };
  const draw = () => new Promise((res) => { const to = setTimeout(res, 20000); t.one("draw.dt", () => { clearTimeout(to); res(); }); t.draw(false); });
  t.page.len(1000); await draw();
  const strip = (v) => String(v == null ? "" : v).replace(/<[^>]*>/g, "").trim();
  const out = [], pages = Math.min(40, t.page.info().pages || 1);
  for (let p = 0; p < pages; p++) {
    if (p > 0) { t.page(p); await draw(); }
    for (const r of t.rows({ page: "current" }).data().toArray()) out.push({ n: strip(r.name), w: strip(r["power-draw"]), up: strip(r.uptime), s: strip(r.status), px: strip(r.pickaxe), hr: strip(r.hashrate) });
  }
  return { rows: out };
})()`;

function openWin(show) {
  if (win && !win.isDestroyed()) { if (show) { win.show(); win.focus(); } return win; }
  win = new electron.BrowserWindow({ width: 1100, height: 800, show: !!show, title: "Foreman anmelden", autoHideMenuBar: true, webPreferences: { partition: PART, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("closed", () => { win = null; });
  return win;
}
const loaded = (wc) => new Promise((res) => { const to = setTimeout(res, 30000); wc.once("did-finish-load", () => { clearTimeout(to); res(); }); });

async function poll() {
  if (busy || !on) return; busy = true;
  try {
    const w = openWin(false); w.webContents.loadURL(URL).catch(() => {}); await loaded(w.webContents);
    const r = await w.webContents.executeJavaScript(SCRAPE, true);
    if (r?.login) { snap = { ...snap, state: "login", err: "Bitte im Foreman-Fenster anmelden." }; return; }
    if (r?.err || !Array.isArray(r?.rows)) { snap = { ...snap, state: "err", err: String(r?.err || "Keine Daten").slice(0, 80) }; return; }
    const m = new Map(); let total = 0;
    for (const x of r.rows) { const wv = /^\d+(\.\d+)?$/.test(x.w) ? Number(x.w) : null; if (x.n) m.set(x.n.toLowerCase(), { w: wv, up: x.up, on: /okay|ok|online|running/i.test(x.s) }); if (wv != null) total += wv; }
    const pc = new Map(); for (const x of r.rows) { const k = x.px.toLowerCase(); if (!k) continue; const c = pc.get(k) || pc.set(k, { n: 0, on: 0 }).get(k); c.n++; if (parseFloat(String(x.hr).replace(",", ".")) > 0) c.on++; }
    pxCounts = pc; byName = m; snap = { ...snap, state: "ok", ts: Date.now(), err: "", count: m.size, watt: Math.round(total) };
    if (!sampled && r.rows.length) { sampled = true; sampleOut?.({ felder: Object.keys(r.rows[0]), zeilen: r.rows.slice(0, 3).map((x) => ({ w: x.w, up: x.up, s: x.s, px: x.px, hr: x.hr })), anzahl: r.rows.length }); }
    if (!win?.isVisible?.()) { try { win?.close(); } catch {} }
  } catch (e) { snap = { ...snap, state: "err", err: String(e.message || e).slice(0, 80) }; try { if (win && !win.isVisible()) win.close(); } catch {} }
  finally { busy = false; }
}
function init(el, onFlag, onSample) { electron = el; sampleOut = onSample; setOn(onFlag); }
function setOn(flag) {
  on = !!flag; snap.on = on; clearInterval(timer);
  if (!on) { snap.state = "off"; return; }
  snap.state = snap.state === "off" ? "wait" : snap.state;
  setTimeout(poll, 4000); timer = setInterval(poll, 5 * 60e3); timer.unref?.();
}
function login() { try { const w = openWin(true); w.webContents.loadURL(URL).catch(() => {}); return { ok: true }; } catch (e) { return { ok: false, reason: String(e.message || e).slice(0, 80) }; } }
// Watt je Miner in die Miner-Liste der Foreman-API eintragen (gleicher Name); offline zählt 0 W
function apply(miners) {
  if (!on || !byName.size) return;
  for (const m of miners) {
    const k = String(m.name || "").toLowerCase(), d = byName.get(k) || byName.get(k.split(".").pop());
    if (!d) continue;
    if (d.w != null) m.watt = m.on === false ? 0 : d.w;
    if (d.up) m.up = d.up;
  }
}
// Zähler je Pickaxe aus dem Dashboard (stimmen mit den Kacheln dort überein) an einen Standort hängen
function tag(site) { if (!on || !pxCounts.size || !site?.pxName) return; const c = pxCounts.get(String(site.pxName).toLowerCase()); if (c) { site.dashN = c.n; site.dashOn = c.on; } }
const data = () => ({ ...snap, px: [...pxCounts].map(([k, c]) => k + " " + c.on + "/" + c.n).slice(0, 12).join(", ") });
module.exports = { tag, init, setOn, login, data, apply, poll };
