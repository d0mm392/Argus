// ioBroker (Smart Home): liest ausgewählte Datenpunkte über den Web-Adapter (Socket.IO). Standard nur lesend, Schalten nur auf Wunsch.
// Anmeldung wie im Browser: Benutzer und Passwort gehen per POST /login an die eigene Adresse, Argus hält nur das Sitzungs-Cookie im Arbeitsspeicher.
const http = require("http"), https = require("https");
let io = null, sock = null, cfg = { on: false, url: "", user: "", pass: "", pick: [], write: false, all: false }, objs = [], vals = new Map(), snap = { state: "off", err: "", ts: 0, objCount: 0 };
let genId = 0, onChange = null;

const base = () => { try { const u = new URL(cfg.url); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch { return ""; } };
const nameOf = (c, id) => { const n = c?.name; const s = typeof n === "string" ? n : n && typeof n === "object" ? (n.de || n.en || Object.values(n)[0]) : ""; return String(s || id.split(".").slice(-1)[0]); };

// Sitzungs-Cookie holen (ioBroker-Web mit Authentifizierung); ohne Anmeldung bleibt es leer
function login() {
  return new Promise((res) => {
    const b = base(); if (!b || !cfg.user) return res("");
    const body = new URLSearchParams({ username: cfg.user, password: cfg.pass, origin: "/", stayloggedin: "true" }).toString(), u = new URL(b + "/login");
    const rq = (u.protocol === "https:" ? https : http).request(u, { method: "POST", timeout: 8000, rejectUnauthorized: false, headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } }, (r) => {
      r.resume(); res((r.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; "));
    });
    rq.on("error", () => res("")); rq.on("timeout", () => { rq.destroy(); res(""); }); rq.end(body);
  });
}
const call = (ev, ...a) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error("Zeitüberschreitung")), 20000); sock.emit(ev, ...a, (e, r) => { clearTimeout(to); e ? rej(new Error(String(e))) : res(r); }); });

async function loadObjects() {
  const r = await call("getObjectView", "system", "state", { startkey: "", endkey: "香" });
  objs = (r?.rows || []).filter((x) => x.id && !/^(system|admin|web|socketio|mqtt|javascript|backitup|discovery|cloud)\./.test(x.id) || /^(javascript|0_userdata)\./.test(x.id)).map((x) => ({ id: x.id, name: nameOf(x.value?.common, x.id), role: x.value?.common?.role || "", type: x.value?.common?.type || "", unit: x.value?.common?.unit || "", write: x.value?.common?.write !== false }));
  snap.objCount = objs.length;
}
async function loadPicked() {
  const ids = cfg.pick.map((p) => p.id); if (!ids.length) return;
  const st = await call("getStates", ids).catch(() => ({}));
  for (const id of ids) if (st?.[id]) vals.set(id, { v: st[id].val, ts: st[id].ts });
  sock.emit("subscribe", ids);
}
// „Alle Datenpunkte“: Werte aller Datenpunkte holen und alles abonnieren
async function loadAll() {
  const ids = objs.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 400) { const st = await call("getStates", ids.slice(i, i + 400)).catch(() => ({})); for (const id of Object.keys(st || {})) if (st[id]) vals.set(id, { v: st[id].val, ts: st[id].ts }); }
  sock.emit("subscribe", "*");
}
async function connect() {
  const my = ++genId; try { sock?.close(); } catch {} sock = null; vals.clear(); objs = [];
  if (!cfg.on) { snap = { state: "off", err: "", ts: 0, objCount: 0 }; return; }
  const b = base(); if (!b) { snap = { state: "nohost", err: "Adresse fehlt oder ist keine http(s)-Adresse.", ts: 0, objCount: 0 }; return; }
  snap = { state: "wait", err: "", ts: 0, objCount: 0 }; changed();
  try {
    io = io || require("socket.io-client");
    const cookie = await login(); if (my !== genId) return;
    const opts = { reconnection: true, reconnectionDelay: 5000, reconnectionDelayMax: 60000, timeout: 10000, rejectUnauthorized: false, extraHeaders: cookie ? { Cookie: cookie } : {} };
    sock = io(b, opts);
    sock.on("connect", async () => {
      if (my !== genId) return;
      try { await loadObjects(); await loadPicked(); if (cfg.all) await loadAll(); snap = { ...snap, state: "ok", err: "", ts: Date.now() }; } catch (e) { snap = { ...snap, state: "err", err: String(e.message || e).slice(0, 90) }; }
      changed();
    });
    sock.on("stateChange", (id, s) => { if (my === genId && s && (cfg.all || vals.has(id))) { vals.set(id, { v: s.val, ts: s.ts }); snap.ts = Date.now(); changed(); } });
    sock.on("connect_error", () => {
      const admin = /:8081\/?$/.test(cfg.url.trim());
      snap = { ...snap, state: cfg.user ? "login" : "err", err: admin ? "Port 8081 ist die Admin-Oberfläche. Bitte den Web-Adapter nehmen (meist Port 8082)." : cfg.user ? "Anmeldung fehlgeschlagen oder ioBroker nicht erreichbar." : "ioBroker nicht erreichbar (Benutzer eintragen?)." }; changed();
    });
    sock.on("disconnect", () => { snap = { ...snap, state: "err", err: "Verbindung getrennt, versuche es erneut." }; changed(); });
    sock.on("reauthenticate", () => { snap = { ...snap, state: "login", err: "Anmeldung abgelaufen." }; changed(); });
  } catch (e) { snap = { ...snap, state: "err", err: String(e.message || e).slice(0, 90) }; changed(); }
}
const changed = () => { try { onChange?.(); } catch {} };
function init(c, cb) { onChange = cb; cfg = { ...cfg, ...c }; if (cfg.on) connect(); }
function set(c) { const re = ["on", "url", "user", "pass", "all"].some((k) => k in c && c[k] !== cfg[k]); const pk = "pick" in c; cfg = { ...cfg, ...c }; if (re) connect(); else if (pk && sock?.connected) loadPicked().then(changed).catch(() => {}); }
function data() {
  return { ...snap, write: !!cfg.write, items: cfg.pick.map((p) => { const o = objs.find((x) => x.id === p.id) || p, v = vals.get(p.id); return { id: p.id, name: p.label || o.name || p.id, role: o.role || p.role || "", type: o.type || p.type || "", unit: o.unit || p.unit || "", write: o.write !== false && !!cfg.write, val: v ? v.v : null, ts: v?.ts || 0 }; }) };
}
function browse(q) {
  const s = String(q || "").toLowerCase().trim(), words = s.split(/\s+/).filter(Boolean);
  const sys = (o) => /^(javascript|0_userdata|scene|alias)\./.test(o.id) || /\.(debug|info)\./.test(o.id), hit = objs.filter((o) => words.every((w) => o.id.toLowerCase().includes(w) || o.name.toLowerCase().includes(w)));
  const vv = (o) => ({ ...o, val: vals.has(o.id) ? vals.get(o.id).v : null });
  if (words.length) return hit.sort((a, b) => sys(a) - sys(b)).slice(0, 150).map(vv);
  // ohne Suchwort: von jedem Adapter ein paar Datenpunkte, Geräte vor Systemwerten
  const per = new Map(), out = [];
  for (const o of hit.sort((a, b) => sys(a) - sys(b))) { const k = o.id.split(".").slice(0, 2).join("."), n = per.get(k) || 0; if (n < 8) { per.set(k, n + 1); out.push(o); } }
  return out.slice(0, 150).map(vv);
}
async function setState(id, val) {
  if (!cfg.write) return { ok: false, reason: "Schalten ist aus (Einstellungen, ioBroker)." };
  if ((!cfg.all && !cfg.pick.some((p) => p.id === id)) || !sock?.connected) return { ok: false, reason: "Nicht verbunden oder Datenpunkt nicht ausgewählt." };
  try { await call("setState", id, { val, ack: false }); return { ok: true }; } catch (e) { return { ok: false, reason: String(e.message || e).slice(0, 80) }; }
}
// Baum für „Alle Datenpunkte“: Adapter-Instanzen mit Anzahl, dann je Instanz die Datenpunkte mit aktuellem Wert
function tree() { const m = new Map(); for (const o of objs) { const k = o.id.split(".").slice(0, 2).join("."); m.set(k, (m.get(k) || 0) + 1); } return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => (/^(javascript|0_userdata|scene|alias)\./.test(a.key) - /^(javascript|0_userdata|scene|alias)\./.test(b.key)) || a.key.localeCompare(b.key)); }
function group(key) {
  if (!cfg.all) return []; const pre = String(key) + ".";
  return objs.filter((o) => o.id.startsWith(pre)).slice(0, 800).map((o) => { const v = vals.get(o.id); return { id: o.id, name: o.name, role: o.role, type: o.type, unit: o.unit, write: o.write && !!cfg.write, val: v ? v.v : null }; });
}
module.exports = { tree, group, init, set, data, browse, setState };
