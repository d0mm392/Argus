// Hosting-Portal: Miner-Übersicht nur lesend. Keine Passwörter in Argus:
// Der Nutzer meldet sich selbst im Portal-Fenster an (reCAPTCHA bleibt unberührt). Der Anmelde-Schlüssel der Seite (Authorization-Header)
// wird mitgelesen, bleibt nur im Arbeitsspeicher und wird weder gespeichert noch protokolliert. Ausgegeben werden nur Zähler,
// keine Seriennummern, Pools oder Auszahlungsadressen.
// Die Adresse trägt der Nutzer selbst in den Einstellungen ein; im Programm steht kein Anbieter vorkonfiguriert.
let hostFn = () => "", hookedFor = "", langHdr = "";
// Eingetragen werden darf die ganze Adresse (auch mit Pfad, z. B. die Anmeldeseite); für die Abfragen zählt nur Protokoll und Rechnername
const FULL = () => { try { const u = new URL(String(hostFn() || "").trim()); return u.protocol === "https:" && /^[a-z0-9.-]+$/i.test(u.hostname) ? u.href : ""; } catch { return ""; } };
const HOST = () => { const f = FULL(); return f ? new URL(f).origin : ""; };
const PART = "persist:portal";
let hadToken = false, electron = null, token = "", lang = "ru", win = null, hooked = false, timer = null, busy = false;
let snap = { on: false, state: "off", ts: 0, err: "" };

let apiBase = "", apiQuery = "", seenMiners = false;
// Nur für die Fehlersuche: welche Pfade die Portal-Seite abfragt (Rechnername und Pfad, ohne Parameter, ohne Schlüssel), in userData/portal-anfragen.txt
const seenReq = new Map();
function noteReq(u, hasAuth) {
  try {
    const k = u.hostname + u.pathname; if (seenReq.has(k) || seenReq.size > 60) return; seenReq.set(k, hasAuth);
    if (!/\.(js|css|png|svg|woff2?|ico|jpg|gif)$/i.test(u.pathname)) require("fs").writeFileSync(require("path").join(electron.app.getPath("userData"), "portal-anfragen.txt"), [...seenReq].filter(([x]) => !/\.(js|css|png|svg|woff2?|ico|jpg|gif)$/i.test(x)).map(([x, a]) => x + (a ? "  (mit Schlüssel)" : "")).join("\n"));
  } catch {}
}
// Alle Anfragen im Portal-Fenster beobachten (eigene Sitzung, nur dieses Fenster): Die Seite kann ihre Daten von einer anderen Adresse laden.
// Den Pfad der Miner-Abfrage merken wir uns; der Schlüssel (falls die Seite einen schickt) bleibt nur im Arbeitsspeicher.
function hook(ses) {
  const h = HOST(); if (!h || hookedFor === h) return; hookedFor = h; hooked = true;
  ses.webRequest.onBeforeSendHeaders({ urls: ["https://*/*"] }, (d, cb) => {
    try {
      const u = new URL(d.url), m = /^(.*)\/miners\/?$/.exec(u.pathname);
      if (m && d.method === "GET") { const first = !seenMiners; apiBase = u.origin + m[1]; seenMiners = true; if (first) setTimeout(() => { poll(); }, 2500); // gleich abfragen, nicht erst im nächsten Takt
      apiQuery = u.search.length < 400 ? u.search : ""; } // Parameter der Seite (z. B. Seitengröße) mitnehmen, sonst liefert die Abfrage evtl. nur eine leere erste Seite
      const a = d.requestHeaders?.Authorization || d.requestHeaders?.authorization; if (d.resourceType === "xhr" || d.resourceType === "fetch") noteReq(u, !!a);
      if (a && typeof a === "string" && a.length < 4000 && (u.origin === h || seenMiners && d.url.startsWith(apiBase))) { token = a; const hk = Object.keys(d.requestHeaders).find((k) => /^x-[a-z]+-user-language$/i.test(k)), l = hk && d.requestHeaders[hk]; if (typeof l === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(l)) { lang = l; langHdr = hk; } }
    } catch {}
    cb({ requestHeaders: d.requestHeaders });
  });
}
const ses = () => electron.session.fromPartition(PART);
function openWin(show) {
  if (win && !win.isDestroyed()) { if (show) { win.show(); win.focus(); } return win; }
  const { BrowserWindow } = electron;
  win = new BrowserWindow({ width: 1100, height: 800, show: !!show, title: "Portal anmelden", autoHideMenuBar: true, webPreferences: { partition: PART, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadURL(FULL() || HOST() + "/").catch((e) => { snap.err = "Seite lässt sich nicht öffnen: " + String(e.message || e).slice(0, 60); });
  win.on("closed", () => { win = null; });
  return win;
}
async function get(path) {
  const r = await ses().fetch((apiBase || HOST() + "/clients/current") + path + (path === "/miners" ? apiQuery : ""), { headers: { ...(token ? { Authorization: token } : {}), Accept: "application/json", ...(langHdr ? { [langHdr]: lang } : {}) }, signal: AbortSignal.timeout(30000) });
  if (r.status === 401 || r.status === 403) { const e = new Error("auth"); e.auth = true; throw e; }
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
// Modellname eines Typs: übliche Felder, sonst das erste Textfeld mit name/title/model/label im Namen (auch eine Ebene tiefer)
const label = (t) => {
  if (!t || typeof t !== "object") return null;
  const direct = t.name || t.title || t.model || t.label || t.displayName; if (typeof direct === "string" && direct) return direct;
  const pick = (o) => { for (const [k, v] of Object.entries(o)) if (/name|title|model|label/i.test(k) && typeof v === "string" && v && !/^\d+$/.test(v) && !/url|id$/i.test(k)) return v; return null; };
  const own = pick(t); if (own) return own;
  for (const v of Object.values(t)) if (v && typeof v === "object" && !Array.isArray(v)) { const n = pick(v); if (n) return n; }
  return null;
};
// Die Antwort kann eine Liste oder ein Objekt mit Kennung als Schlüssel sein
const typeList = (types) => Array.isArray(types) ? types : types && typeof types === "object" ? (Array.isArray(types.results || types.items || types.data) ? (types.results || types.items || types.data) : Object.entries(types).map(([k, v]) => (v && typeof v === "object" ? { id: Number.isFinite(+k) ? +k : k, ...v } : null)).filter(Boolean)) : [];
// Läuft der Miner? Reihenfolge: Ja/Nein-Felder der Seite, dann Hashrate, dann der Zustandstext (die Namen kommen von der Seite)
// Ein Wort wie „off“ kann „aus“ oder „kein Auftrag“ heißen: nur eindeutige Wörter zählen, alles andere bleibt „unbekannt“
const UP_RE = /work|mining|online|active|running|alive|^on$/i, DOWN_RE = /offline|broken|error|fail|dead|defekt/i;
function upOf(m) {
  if (!m || typeof m !== "object") return null;
  for (const k of ["online", "isOnline", "is_online", "working", "isWorking", "active", "isActive", "alive", "isAlive"]) if (typeof m[k] === "boolean") return m[k];
  for (const k of ["hashrate", "hashRate", "hash_rate", "currentHashrate", "hashrate5m", "hashrate1m", "ghs", "ths"]) { const v = m[k]; if (v != null && v !== "" && Number.isFinite(+v)) return +v > 0; }
  const st = String(m.state ?? m.status ?? ""); if (UP_RE.test(st) && !DOWN_RE.test(st)) return true; if (DOWN_RE.test(st)) return false;
  return null;
}
// Beispiel eines Miner-Eintrags ohne Kennungen: nur Feldnamen, Zahlen, Wahrheitswerte und kurze Zustandswörter
const shape = (m) => Object.fromEntries(Object.entries(m || {}).slice(0, 40).map(([k, v]) => [k, typeof v === "boolean" || typeof v === "number" ? v : typeof v === "string" ? (/^[A-Za-z_ -]{2,20}$/.test(v) ? v : "(Text)") : v === null ? null : Array.isArray(v) ? "(Liste)" : "(Objekt)"]));
function summarize(miners, types, hr) {
  let up = 0, down = 0;
  for (const m of miners) { const u = upOf(m); if (u === true) up++; else if (u === false) down++; }
  const byState = {}, byType = {}, byLoc = {};
  for (const m of miners) { const s = String(m?.state ?? "?").slice(0, 24); byState[s] = (byState[s] || 0) + 1; byType[m?.minerTypeId] = (byType[m?.minerTypeId] || 0) + 1; byLoc[m?.locationId] = (byLoc[m?.locationId] || 0) + 1; }
  types = typeList(types);
  const pw = new Map(types.map((t) => { const k = t && typeof t === "object" ? Object.keys(t).find((x) => /power|watt|consum/i.test(x) && Number.isFinite(Number(t[x])) && Number(t[x]) > 0) : null; return [t?.id, k ? Number(t[k]) : null]; }));
  let pwW = 0, pwN = 0, pwOf = 0;
  for (const m of miners) if (upOf(m) === true) { pwOf++; const w = pw.get(m?.minerTypeId); if (w) { pwW += w; pwN++; } }
  const power = pwN ? { w: Math.round(pwW), est: true, known: pwN, of: pwOf } : null;
  const tm = new Map(types.map((t) => [t?.id, label(t)]));
  const models = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ name: String(tm.get(+id) || "Typ " + id).slice(0, 30), n }));
  let hrv = null;
  if (typeof hr === "number") hrv = hr; else if (hr && typeof hr === "object") hrv = JSON.stringify(hr).slice(0, 200);
  const unknown = miners.length - up - down;
  return { unknown, typeSample: { types: types.slice(0, 2), miners: miners.slice(0, 3).map(shape) }, up, down, total: miners.length, states: Object.entries(byState).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })), models, locations: Object.keys(byLoc).length, hashrate: hrv, power };
}
async function poll() {
  if (busy || !snap.on) return; busy = true;
  try {
    if (!HOST()) { snap.state = "nohost"; snap.err = "Adresse des Portals fehlt (Einstellungen, Mining)."; return; }
    if (!token && !seenMiners) { // vielleicht gilt schon eine Anmeldung per Cookie: Abfrage versuchen, bevor „bitte anmelden“ erscheint
      const ok = await get("/miners").then((m) => Array.isArray(m)).catch(() => false);
      if (!ok) { snap.state = "login"; openWin(false); return; }
    }
    let miners = await get("/miners");
    if (!Array.isArray(miners) && miners && typeof miners === "object") { const k = ["items", "data", "results", "miners", "rows", "list"].find((x) => Array.isArray(miners[x])); if (k) miners = miners[k]; }
    if (!Array.isArray(miners)) throw new Error("Antwortformat unbekannt");
    if (!miners.length) { snap = { ...snap, state: "empty", err: "Das Portal liefert 0 Miner (leere Antwort). Anmeldung gilt, Abfrage liefert nichts." }; return; }
    const [types, hr] = await Promise.all([get("/types").catch(() => null), get("/hashrate").catch(() => null)]);
    const sm = summarize(miners, types, hr); sampleOut?.(sm.typeSample); delete sm.typeSample;
    snap = { ...snap, state: "ok", ts: Date.now(), err: "", ...sm };
    if (win && !win.isDestroyed() && win.isVisible()) win.close(); // angemeldet und verbunden: Anmeldefenster schließt sich
  } catch (e) {
    if (e.auth) { token = ""; seenMiners = false; apiBase = ""; hadToken = false; snap.state = "login"; snap.err = "Bitte neu anmelden."; } else snap.err = String(e.message || e).slice(0, 80); // Zähler vom letzten Mal bleiben stehen
  } finally { busy = false; }
}
let sampleOut = null, sampled = false;
function init(el, on, onSample, host) { electron = el; hostFn = host || hostFn; sampleOut = (s) => { if (!sampled && s) { sampled = true; onSample?.(s); } }; setOn(on); }
function setOn(on) {
  snap.on = !!on; clearInterval(timer);
  if (!on) { snap.state = "off"; return; }
  hook(ses()); snap.state = token || seenMiners ? "wait" : "login";
  poll(); timer = setInterval(poll, 3 * 60e3); timer.unref?.();
}
function login() {
  if (!HOST()) { snap.state = "nohost"; snap.err = "Adresse des Portals fehlt oder ist ungültig (muss mit https:// beginnen)."; return { ok: false, reason: snap.err }; }
  try { hook(ses()); openWin(true); return { ok: true }; } catch (e) { return { ok: false, reason: "Fenster lässt sich nicht öffnen: " + String(e.message || e).slice(0, 80) }; }
}
function rehost() { token = ""; seenMiners = false; apiBase = ""; hadToken = false; if (win && !win.isDestroyed()) win.close(); if (snap.on) { hook(ses()); setTimeout(poll, 300); } }
const data = () => ({ ...snap });
module.exports = { init, setOn, login, data, poll, rehost, summarize };
