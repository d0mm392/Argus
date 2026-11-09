// Argus Mining: Miner direkt im eigenen Netz abfragen, ohne Foreman und ohne Pickaxe.
// Nur lesend über die Miner-Schnittstelle auf Port 4028 (cgminer/bmminer/btminer: Antminer Stock, VNISH, Whatsminer),
// bei VNISH zusätzlich die Web-Schnittstelle (/api/v1/summary) für Verbrauch und Laufzeit.
// Es werden nur private Adressbereiche (10.x, 172.16–31.x, 192.168.x) abgefragt, die der Nutzer selbst einträgt.
const net = require("net"), fs = require("fs"), path = require("path");

const PORT = Number(process.env.AM_TEST_PORT) || 4028; // Umgebungsvariablen nur für Tests
const HTTP_PORT = Number(process.env.AM_TEST_HTTP) || 80;
const num = (v) => { if (typeof v === "boolean" || v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// ---------- Adressbereiche ----------
const ip2n = (s) => { const p = String(s).trim().split("."); if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) return null; return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3]; };
const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
const isPrivate = (n) => (n >>> 24) === 10 || ((n >>> 24) === 172 && ((n >>> 16) & 255) >= 16 && ((n >>> 16) & 255) <= 31) || ((n >>> 24) === 192 && ((n >>> 16) & 255) === 168) || (process.env.AM_TEST_PORT && (n >>> 24) === 127);
const MAX_IPS = 16384;
// Eine Zeile je Bereich (auch durch Komma getrennt): „172.16.8.0-255“, „10.0.0.1-10.0.0.200“, „10.0.1.0/24“ oder eine einzelne Adresse
function parseRanges(text) {
  const out = new Set(), bad = [];
  for (const raw of String(text || "").split(/[\n,;]+/)) {
    const s = raw.trim(); if (!s) continue;
    let a = null, b = null, m;
    if ((m = /^(\d+\.\d+\.\d+\.\d+)\s*\/\s*(\d{1,2})$/.exec(s))) { const base = ip2n(m[1]), bits = +m[2]; if (base != null && bits >= 16 && bits <= 32) { const size = 2 ** (32 - bits); a = Math.floor(base / size) * size; b = a + size - 1; } }
    else if ((m = /^(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)$/.exec(s))) { a = ip2n(m[1]); b = ip2n(m[2]); }
    else if ((m = /^(\d+\.\d+\.\d+)\.(\d{1,3})\s*-\s*(\d{1,3})$/.exec(s))) { a = ip2n(m[1] + "." + m[2]); b = ip2n(m[1] + "." + m[3]); }
    else if ((m = /^(\d+\.\d+\.\d+)\.\*$/.exec(s))) { a = ip2n(m[1] + ".0"); b = ip2n(m[1] + ".255"); }
    else { a = b = ip2n(s); }
    if (a == null || b == null || b < a || b - a > 65535 || !isPrivate(a) || !isPrivate(b)) { bad.push(s); continue; }
    for (let n = a; n <= b && out.size < MAX_IPS; n++) { const last = n & 255; if (last === 0 || last === 255) continue; out.add(n2ip(n)); } // Netz- und Broadcast-Adresse auslassen
  }
  return { ips: [...out], bad };
}

// ---------- Port 4028 ----------
// Antworten enden mit \0; Antminer liefert in „stats“ teils „}{“ ohne Komma, das wird geflickt
function parseApi(s) {
  s = String(s || "").replace(/\0/g, "").trim(); if (!s) return null;
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(s.replace(/}\s*{/g, "},{").replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
}
function rawCmd(ip, payload, ms = 3000) {
  return new Promise((res) => {
    let buf = "", done = false; const sock = net.connect({ host: ip, port: PORT });
    const end = (v) => { if (done) return; done = true; clearTimeout(t); try { sock.destroy(); } catch {} res(v); };
    const t = setTimeout(() => end(buf ? parseApi(buf) : null), ms);
    sock.setEncoding("utf8");
    sock.on("connect", () => sock.write(JSON.stringify(payload)));
    sock.on("data", (d) => { buf += d; if (buf.length > 2e6) end(null); if (buf.includes("\0")) end(parseApi(buf)); });
    sock.on("end", () => end(parseApi(buf))); sock.on("close", () => end(parseApi(buf))); sock.on("error", () => end(null));
  });
}
// Antminer/VNISH verstehen „command“, neuere Whatsminer zum Teil nur „cmd“
async function cmd(ip, c, ms) {
  const j = await rawCmd(ip, { command: c }, ms);
  const st = j?.STATUS; const bad = !j || (Array.isArray(st) ? st[0]?.STATUS === "E" : st === "E" || (typeof st === "object" && st?.STATUS === "E"));
  if (!bad) return j;
  const j2 = await rawCmd(ip, { cmd: c }, ms);
  return j2 || j;
}
// Kommt auf Port 4028 überhaupt etwas an? (schnell, für die Suche)
function probe(ip, ms = 700) {
  return new Promise((res) => {
    const sock = net.connect({ host: ip, port: PORT }); let done = false;
    const end = (v) => { if (done) return; done = true; clearTimeout(t); try { sock.destroy(); } catch {} res(v); };
    const t = setTimeout(() => end(false), ms);
    sock.on("connect", () => end(true)); sock.on("error", () => end(false));
  });
}

// ---------- VNISH-Web-Schnittstelle (optional) ----------
async function http(ip, p, opts = {}, ms = 4000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`http://${ip}${HTTP_PORT === 80 ? "" : ":" + HTTP_PORT}${p}`, { ...opts, signal: ctl.signal, headers: { Accept: "application/json", ...(opts.headers || {}) } });
    if (!r.ok) return { status: r.status };
    return { status: r.status, json: await r.json() };
  } catch { return null; } finally { clearTimeout(t); }
}
const tokens = new Map(); // ip -> VNISH-Sitzungsschlüssel (nur im Speicher)
async function vnish(ip, pass) {
  let r = await http(ip, "/api/v1/summary", tokens.has(ip) ? { headers: { Authorization: "Bearer " + tokens.get(ip) } } : {});
  if (r?.status === 401 && pass) {
    tokens.delete(ip);
    const u = await http(ip, "/api/v1/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pw: pass }) });
    const tok = u?.json?.token; if (tok) { tokens.set(ip, tok); r = await http(ip, "/api/v1/summary", { headers: { Authorization: "Bearer " + tok } }); }
  }
  return r?.json && typeof r.json === "object" ? r.json : null;
}

// ---------- Werte lesen ----------
function flat(o, pre = "", out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    if (Array.isArray(v)) { if (v.every((x) => typeof x !== "object")) out[pre + k] = v; else v.forEach((x, i) => flat(x, pre + k + "." + i + ".", out)); }
    else if (v && typeof v === "object") flat(v, pre + k + ".", out); else out[pre + k] = v;
  }
  return out;
}
// „60-62-75-77“ (Antminer-Chiptemperaturen) oder Zahl
const nums = (v) => (Array.isArray(v) ? v : [v]).flatMap((x) => typeof x === "string" && /\d+\s*-\s*\d+/.test(x) ? x.split("-").map(num) : [num(x)]).filter((x) => x != null);
// Wirkungsgrad in J/TH je Modell (Werksangaben, grob), für den geschätzten Verbrauch, wenn der Miner keine Watt meldet
const JTH = [[/s21\s*xp/i, 13.5], [/s21\s*\+|s21\s*pro/i, 15], [/s21\s*hyd/i, 16], [/s21/i, 17.5], [/t21/i, 19], [/s19\s*xp\s*hyd/i, 20.8], [/s19\s*xp/i, 21.5], [/s19\s*k\s*pro/i, 23], [/s19\s*j\s*pro\s*\+/i, 27.5], [/s19\s*j\s*pro|s19\s*pro\s*\+?\s*hyd/i, 29.5], [/s19\s*pro/i, 29.5], [/s19\s*j/i, 34.5], [/s19a/i, 30.5], [/s19/i, 34.5], [/t19/i, 37.5], [/s17/i, 45], [/m66/i, 18.5], [/m63/i, 18.5], [/m60\s*s\s*\+/i, 17], [/m60\s*s/i, 18.5], [/m60/i, 19.9], [/m56/i, 23], [/m53/i, 29], [/m50\s*s\s*\+\+/i, 22], [/m50\s*s/i, 24], [/m50/i, 26], [/m33/i, 33], [/m31/i, 46], [/m30\s*s\s*\+\+/i, 31], [/m30\s*s\s*\+/i, 34], [/m30/i, 38], [/m21/i, 49], [/m20/i, 48]];
const jthOf = (type) => { for (const [re, v] of JTH) if (re.test(type || "")) return v; return null; };

function read(ip, sum, stats, pools, dev, vn, opt = {}) {
  const S = flat(sum?.SUMMARY?.[0] || sum?.Msg || {}), T = flat({ s: stats?.STATS || [] }), D = flat(dev?.DEVDETAILS || dev?.Msg || {}), V = flat(vn || {});
  const all = { ...T, ...S, ...D }, keys = Object.keys(all), low = (k) => k.toLowerCase();
  const first = (re, src = all) => { const k = Object.keys(src).find((k2) => re.test(k2.toLowerCase()) && src[k2] != null && src[k2] !== ""); return k ? src[k] : null; };
  // Modell: Antminer „Type“ in stats, Whatsminer „Model“ in devdetails, VNISH zusätzlich „miner_type“
  let type = String(first(/(^|\.)(type|model|miner_type)$/, { ...T, ...D }) || V["miner.miner_type"] || first(/miner_type|model/, V) || "").trim();
  const fw = /vnish/i.test(JSON.stringify(stats?.STATS?.[0] || {}) + JSON.stringify(vn?.miner || {}) + (type || "")) || vn ? "VNISH" : /btminer|whatsminer/i.test(JSON.stringify(sum || {}) + type) || /^m\d/i.test(type) ? "Whatsminer" : /antminer|bmminer/i.test(type + JSON.stringify(stats?.STATS?.[0] || {})) ? "Antminer" : "";
  if (type && !/antminer|whatsminer/i.test(type) && /^[ST]\d/i.test(type)) type = "Antminer " + type;
  if (type && /^M\d/i.test(type)) type = "Whatsminer " + type;
  if (fw === "VNISH" && type && !/vnish/i.test(type)) type += " (VNISH)";
  // Hashrate in H/s: GHS (Antminer, VNISH) oder MHS (Whatsminer); erst der aktuelle Wert, sonst Durchschnitt
  let hr = null;
  for (const [re, f] of [[/^ghs 5s$|^ghs 30m$/, 1e9], [/^mhs 5s$|^mhs 1m$/, 1e6], [/^ghs av$/, 1e9], [/^mhs av$/, 1e6], [/^ths 5s$|^ths av$/, 1e12]]) {
    const k = Object.keys(S).find((k2) => re.test(k2.toLowerCase()) && num(S[k2]) != null); if (k) { hr = num(S[k]) * f; break; }
  }
  if (hr == null) { const v = num(V["miner.hr_realtime"] ?? V["miner.instant_hashrate"]); if (v != null) hr = v * 1e12 > 1e18 ? v : v * 1e12; }
  let nom = num(first(/total_rateideal|rate_ideal|ideal_hashrate|factory_ghs/, T)); if (nom != null) nom *= 1e9; // GH/s
  if (nom == null) { const v = num(V["miner.hr_nominal"]); if (v != null) nom = v * 1e12; }
  const tk = keys.filter((k) => /temp/.test(low(k)) && !/num|limit|target|threshold|alarm|protect|_pcb_max_temp|^s\.0\./.test(low(k)));
  const temps = tk.flatMap((k) => nums(all[k])).concat(Object.keys(V).filter((k) => /temp/.test(low(k)) && !/target|limit/.test(low(k))).flatMap((k) => nums(V[k]))).filter((v) => v > 0 && v < 150);
  const fans = keys.filter((k) => /fan|rpm/.test(low(k)) && !/num|percent|pct|duty|pwm|count|mode/.test(low(k))).flatMap((k) => nums(all[k])).filter((v) => v > 100 && v < 30000);
  // Verbrauch: Whatsminer „Power“ in summary, VNISH „power_consumption“/„power_usage“ in der Web-Schnittstelle
  const wk = [...Object.keys(S).filter((k) => /^power$|^power_realtime$|^power_rt$|^input power$/i.test(k)).map((k) => S[k]), ...Object.keys(V).filter((k) => /power_consumption$|power_usage$|^miner\.power$/i.test(k)).map((k) => V[k]), ...Object.keys(T).filter((k) => /(^|\.)(power|chain_power|total_power)$/i.test(k)).map((k) => T[k])];
  let watt = wk.map(num).find((v) => v != null && v > 0 && v < 20000) ?? null, est = false;
  // Laufzeiten in Sekunden: Mining-Programm (Elapsed) und Gerät (Uptime bei Whatsminer, system.uptime bei VNISH)
  const hup = num(S.Elapsed ?? S.elapsed ?? first(/(^|\.)elapsed$/, T));
  let up = num(S.Uptime ?? S.uptime ?? V["system.uptime"] ?? V.uptime);
  if (up == null && typeof V["system.uptime"] === "string") { const m = /(\d+)\s*d.*?(\d+)\s*h.*?(\d+)\s*m/i.exec(V["system.uptime"]); if (m) up = +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60; }
  const on = hr != null ? hr > 0 : hup != null ? hup > 0 : true;
  if (watt == null) { const j = Number(opt.jth) > 0 ? Number(opt.jth) : jthOf(type); if (j && hr != null) { watt = Math.round((hr / 1e12) * j); est = true; } }
  if (!on && watt != null) watt = 0;
  // Name: Worker aus dem Pool (Teil nach dem letzten Punkt), sonst Rechnername, sonst die Adresse
  const user = String(pools?.POOLS?.find((p) => /alive/i.test(p.Status || "") && p.User)?.User || pools?.POOLS?.[0]?.User || "");
  const worker = user.includes(".") ? user.split(".").pop() : "";
  const host = String(V["network.hostname"] || V["system.network_status.hostname"] || first(/hostname/, V) || "");
  const name = (worker && !/^(x|\d+)$/i.test(worker) ? worker : host || ip).slice(0, 40);
  return { id: null, ip, name, on, hr, nom, type: type.slice(0, 60), fw, temp: temps.length ? Math.max(...temps) : null, fan: fans.length ? Math.max(...fans) : null, watt, wattEst: est, up, hup, err: "", pool: user ? user.split(".")[0].slice(0, 60) : "" };
}

async function queryOne(ip, opt = {}) {
  const sum = await cmd(ip, "summary"); if (!sum || (!sum.SUMMARY && !sum.Msg)) return null;
  const [stats, pools] = await Promise.all([cmd(ip, "stats"), cmd(ip, "pools")]);
  const dev = stats?.STATS?.some((s) => s.Type) ? null : await cmd(ip, "devdetails");
  let vn = null;
  const looksVnish = /vnish/i.test(JSON.stringify(stats?.STATS?.[0] || {}) + JSON.stringify(sum?.STATUS || ""));
  if (opt.http !== false && (looksVnish || opt.vnishPass)) vn = await vnish(ip, opt.vnishPass);
  return read(ip, sum, stats, pools, dev, vn, opt);
}

// Viele Aufgaben mit begrenzter Parallelität
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ---------- Zustand: bekannte Miner, Suche, Abfrage ----------
let file = "", known = {}, last = new Map(), snap = { ts: 0, miners: [], scanning: false, scanTs: 0, scanned: 0, found: 0, bad: [], error: "" }, opts = () => ({}), timer = null, scanT = null, busy = false, saveT = null;
function init(dir, getOpts) { file = path.join(dir, "lan-miner.json"); opts = getOpts || opts; try { known = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { known = {}; } }
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(known)); } catch {} }, 3000); }
// Suche: alle Adressen der Bereiche auf Port 4028 prüfen, Antwortende als Miner merken
async function scan() {
  const o = opts(), { ips, bad } = parseRanges(o.ranges);
  snap.bad = bad; if (snap.scanning) return snap; snap.scanning = true; snap.scanned = 0; snap.found = 0;
  try {
    const hits = [];
    await pool(ips, 256, async (ip) => { if (await probe(ip)) hits.push(ip); snap.scanned++; });
    const now = Date.now(), inRange = new Set(ips);
    for (const ip of Object.keys(known)) if (!inRange.has(ip)) delete known[ip]; // Bereich entfernt: Miner vergessen
    for (const ip of hits) { const m = await queryOne(ip, o); if (m) { known[ip] = { ...(known[ip] || {}), name: m.name, type: m.type, seen: now }; last.set(ip, { ...m, ts: now }); } }
    // seit über 3 Tagen ohne Antwort: kein Miner mehr dort
    for (const [ip, k] of Object.entries(known)) if (now - (k.seen || 0) > 3 * 864e5) delete known[ip];
    snap.found = Object.keys(known).length; snap.scanTs = now; snap.error = ips.length ? "" : "Keine gültigen Adressbereiche eingetragen."; save();
  } catch (e) { snap.error = String(e.message || e).slice(0, 120); }
  finally { snap.scanning = false; }
  return snap;
}
// Abfrage aller bekannten Miner; wer nicht antwortet, zählt als offline (wie bei Foreman)
async function poll() {
  if (busy) return snap; busy = true;
  try {
    const o = opts(), ips = Object.keys(known), now = Date.now();
    const res = await pool(ips, 64, (ip) => queryOne(ip, o).catch(() => null));
    const miners = ips.map((ip, i) => {
      const m = res[i];
      if (m) { known[ip] = { ...known[ip], name: m.name, type: m.type, seen: now }; last.set(ip, { ...m, ts: now }); return m; }
      const k = known[ip] || {}; return { id: null, ip, name: k.name || ip, on: false, hr: 0, nom: null, type: k.type || "", temp: null, fan: null, watt: 0, wattEst: true, up: null, hup: null, err: "keine Antwort" };
    });
    // doppelte Namen eindeutig machen (gleicher Worker auf zwei Geräten)
    const cnt = {}; for (const m of miners) cnt[m.name] = (cnt[m.name] || 0) + 1;
    for (const m of miners) if (cnt[m.name] > 1) m.name = `${m.name} (${m.ip})`.slice(0, 40);
    snap.ts = now; snap.miners = miners; save();
  } finally { busy = false; }
  return snap;
}
function start() {
  stop();
  if (!opts().on) return;
  const first = Object.keys(known).length ? poll() : Promise.resolve();
  first.then(() => scan()).then(() => poll()).catch(() => {});
  timer = setInterval(() => poll().catch(() => {}), 60e3); timer.unref?.();
  scanT = setInterval(() => scan().then(() => poll()).catch(() => {}), 30 * 60e3); scanT.unref?.(); // neue Miner alle 30 Minuten finden
}
function stop() { clearInterval(timer); clearInterval(scanT); timer = scanT = null; }
const snapshot = () => ({ ...snap, known: Object.keys(known).length });
function reset() { known = {}; last.clear(); snap = { ...snap, ts: 0, miners: [], found: 0 }; save(); }

module.exports = { parseRanges, parseApi, read, queryOne, jthOf, init, scan, poll, start, stop, snapshot, reset };
