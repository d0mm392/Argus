// Argus Mining: kleines eigenständiges Programm für den PC vor Ort. Fragt die Miner im eigenen Netz ab
// (Hashrate, Temperatur, Lüfter, Verbrauch, Geräte- und Mining-Laufzeit) und schreibt daraus einen Tagesreport je Miner.
// Bedienung im Browser unter http://localhost:8420 (nur auf diesem PC, außer der Fernzugriff wird ausdrücklich eingeschaltet).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto"), { exec, spawn } = require("child_process");
const lan = require("./lanminer"), report = require("./report"), hist = require("./hist"), pools = require("./pools"), PAGE = require("./page");

const VERSION = "1.4.0";
// Update Schritt 2: die neue exe wird mit --replace gestartet, wartet bis die alte beendet ist, kopiert sich an ihren Platz und startet sie dort neu
const RI = process.argv.indexOf("--replace");
if (RI > 0) {
  const target = process.argv[RI + 1], pid = Number(process.argv[process.argv.indexOf("--pid") + 1]) || 0, t0 = Date.now();
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const done = (ok) => { try { spawn(ok ? target : process.execPath, ["--no-browser"], { detached: true, stdio: "ignore" }).unref(); } catch {} setTimeout(() => process.exit(0), 500); };
  const step = () => {
    if (pid && alive() && Date.now() - t0 < 60e3) return setTimeout(step, 500);
    try { fs.copyFileSync(process.execPath, target); done(true); } catch { if (Date.now() - t0 < 90e3) setTimeout(step, 1000); else done(false); }
  };
  setTimeout(step, 800);
  return;
}
const DIR = process.env.AM_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "Argus Mining");
fs.mkdirSync(DIR, { recursive: true });
const CFG = path.join(DIR, "config.json");
const DEF = { name: "Farm", ranges: "", jth: 0, vnishPass: "", antUser: "root", antPass: "root", port: 8420, remote: false, token: "", keepDays: 90, autoUpdate: true };
let cfg = { ...DEF };
try { cfg = { ...DEF, ...JSON.parse(fs.readFileSync(CFG, "utf8")) }; } catch {}
if (cfg.keepDays < 90) cfg.keepDays = 90; // seit 1.2.0: Report und Protokoll 90 Tage
if (!cfg.token) cfg.token = crypto.randomBytes(16).toString("hex");
const saveCfg = () => { try { fs.writeFileSync(CFG, JSON.stringify(cfg, null, 1)); } catch (e) { log("Einstellungen nicht gespeichert: " + e.message); } };
saveCfg();
// Protokoll: je Tag eine Datei logs/JJJJ-MM-TT.txt, aufbewahrt so lange wie der Report (Standard 90 Tage)
const LOGDIR = path.join(DIR, "logs"); fs.mkdirSync(LOGDIR, { recursive: true });
const logDays = () => { try { return fs.readdirSync(LOGDIR).map((f) => f.replace(/\.txt$/, "")).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort(); } catch { return []; } };
let logDay = "";
function log(t) {
  const now = new Date(), l = `[${now.toLocaleString("de-DE")}] ${t}`; try { console.log(l); } catch {}
  const k = report.dayKey(now.getTime());
  try {
    const f = path.join(LOGDIR, k + ".txt");
    if (k !== logDay) { logDay = k; for (const d of logDays().slice(0, -Math.max(2, cfg?.keepDays || 90))) try { fs.unlinkSync(path.join(LOGDIR, d + ".txt")); } catch {} }
    if (!fs.existsSync(f) || fs.statSync(f).size < 20e6) fs.appendFileSync(f, l + "\n");
  } catch {}
}
try { fs.renameSync(path.join(DIR, "log.txt"), path.join(LOGDIR, "alt-vor-1.2.txt")); } catch {}

report.init(DIR, cfg.keepDays); hist.init(DIR); pools.init(DIR, cfg.keepDays);
lan.init(DIR, () => ({ on: true, ranges: cfg.ranges, jth: cfg.jth, vnishPass: cfg.vnishPass, antUser: cfg.antUser, antPass: cfg.antPass }));

// Nach jeder Abfrage eine Report-Stichprobe (der Report nimmt selbst nur alle 5 Minuten eine)
let lastNoNet = false;
async function tick() {
  const s = await lan.poll().catch((e) => { log("Abfrage fehlgeschlagen: " + e.message); return null; });
  if (!s?.miners?.length) return;
  const noNet = s.miners.length >= 3 && !s.miners.some((m) => m.err !== "keine Antwort");
  if (noNet !== lastNoNet) log(noNet ? "Kein Miner antwortet mehr. Netzwerk des PCs prüfen." : "Miner antworten wieder."); lastNoNet = noNet;
  // Ereignisse je Miner: offline erst nach zwei Abfragen ohne Hashrate (gegen Fehlalarm), zurück sofort
  if (!noNet) {
    const id = (m) => [m.ip, m.serial && "SN " + m.serial, m.pools?.[0]?.user].filter(Boolean).join(", ");
    const goneOff = [], back = [];
    for (const m of s.miners) {
      const p = seen.get(m.ip), off = m.on === false;
      if (!p) { seen.set(m.ip, { off, n: 0, ln: 0 }); continue; }
      if (off && !p.off) { if (++p.n >= 2) { p.off = true; p.n = 0; goneOff.push(`${m.name} (${id(m)})${m.err ? ": " + m.err : ""}`); } }
      else if (!off && p.off) { p.off = false; p.n = 0; back.push(`${m.name} (${id(m)})`); }
      else p.n = 0;
      // niedrige Hashrate (unter 80 % vom Nennwert, zwei Abfragen) und heiß (ab 90 °C), mit Entwarnung
      if (!off) {
        const low = m.nom > 0 && m.hr != null && m.hr < m.nom * 0.8, ok = !m.nom || m.hr >= m.nom * 0.9;
        if (low && !p.low) { if (++p.ln >= 2) { p.low = true; p.ln = 0; log(`Niedrige Hashrate: ${m.name} (${id(m)}) ${Math.round(m.hr / 1e12)} von ${Math.round(m.nom / 1e12)} TH/s`); } } else p.ln = 0;
        if (p.low && ok) { p.low = false; log(`Hashrate wieder normal: ${m.name} (${id(m)})`); }
        const hot = m.temp >= 90;
        if (hot && !p.hot) { p.hot = true; log(`Heiß: ${m.name} (${id(m)}) ${Math.round(m.temp)} °C`); } else if (p.hot && m.temp != null && m.temp < 85) { p.hot = false; log(`Temperatur wieder normal: ${m.name} (${id(m)}) ${Math.round(m.temp)} °C`); }
      }
    }
    for (const t of goneOff) log("Offline: " + t);
    for (const t of back) log("Wieder online: " + t);
  }
  if (!noNet) {
    hist.record(s.miners);
    const idp = (m) => [m.ip, m.serial && "SN " + m.serial].filter(Boolean).join(", ");
    for (const e of pools.record(s.miners)) log(e.kind === "Wechsel" ? `Pool-Wechsel: ${e.name} (${idp(e)}) ${e.text.replace(/^Aktiver Pool gewechselt: /, "")}` : `Pool geändert: ${e.name} (${idp(e)}) ${e.text}`);
  }
  const ev = report.record(s.miners, noNet);
  for (const [m, t] of ev || []) log(`${t}: ${m.name} (${m.ip}${m.serial ? ", SN " + m.serial : ""})`);
}
const seen = new Map();
let pollT = null, scanT = null;
function startLoops() {
  clearInterval(pollT); clearInterval(scanT);
  if (!lan.parseRanges(cfg.ranges).ips.length) return;
  (async () => { await tick(); await lan.scan(); log(`Suche fertig: ${lan.snapshot().found} Miner gefunden`); await tick(); })().catch((e) => log(e.message));
  pollT = setInterval(() => tick().catch(() => {}), 60e3);
  scanT = setInterval(() => lan.scan().then(() => log(`Suche fertig: ${lan.snapshot().found} Miner gefunden`)).catch(() => {}), 30 * 60e3);
}

// ---------- Autostart (nur auf Wunsch, über die Einstellungen) ----------
const STARTUP = process.env.APPDATA ? path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Argus Mining.cmd") : "";
const autostartOn = () => !!STARTUP && fs.existsSync(STARTUP);
function setAutostart(on) {
  if (!STARTUP) return false;
  if (on) fs.writeFileSync(STARTUP, `@echo off\r\nstart "Argus Mining" /min "${process.execPath}" --no-browser\r\n`); else try { fs.unlinkSync(STARTUP); } catch {}
  return autostartOn();
}

// ---------- Update: neue exe vom Update-Zweig holen, Prüfsumme prüfen, austauschen, neu starten ----------
const UPDATE_BASE = process.env.AM_UPDATE_URL || "https://raw.githubusercontent.com/d0mm392/Argus/argus-mining";
const isExe = /\.exe$/i.test(process.execPath) && !/(^|[\\/])node\.exe$/i.test(process.execPath); // nur die gebaute exe kann sich selbst austauschen (nicht „node main.js“)
let upd = { state: "idle", latest: "", notes: "", err: "", ts: 0, pct: 0 };
const newer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; };
// Laden über http/https (folgt Weiterleitungen), mit Fortschritt
function getBuf(url, ms, onPart, hops = 0) {
  return new Promise((ok, fail) => {
    const mod = url.startsWith("https:") ? require("https") : http;
    const rq = mod.get(url, { headers: { "Cache-Control": "no-cache", "User-Agent": "Argus-Mining/" + VERSION } }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 5) { r.resume(); return getBuf(new URL(r.headers.location, url).href, ms, onPart, hops + 1).then(ok, fail); }
      if (r.statusCode !== 200) { r.resume(); return fail(new Error("Server antwortet mit " + r.statusCode)); }
      const parts = [], total = Number(r.headers["content-length"]) || 0; let got = 0;
      r.on("data", (c) => { parts.push(c); got += c.length; onPart?.(got, total); }); r.on("end", () => ok(Buffer.concat(parts))); r.on("error", fail);
    });
    rq.setTimeout(ms, () => rq.destroy(new Error("Zeitüberschreitung"))); rq.on("error", fail);
  });
}
async function checkUpdate(auto = false) {
  if (upd.state === "download") return upd;
  try {
    const j = JSON.parse(String(await getBuf(`${UPDATE_BASE}/latest.json?t=${Date.now()}`, 15000))); upd.ts = Date.now(); upd.err = "";
    if (!/^\d+\.\d+\.\d+$/.test(j.version || "") || !/^[0-9a-f]{64}$/i.test(j.sha256 || "")) throw new Error("Update-Angaben unvollständig");
    upd.latest = j.version; upd.notes = String(j.notes || "").slice(0, 2000); upd.info = j;
    upd.state = newer(j.version, VERSION) ? "available" : "current";
    if (upd.state === "available") { log(`Update ${j.version} verfügbar`); if (auto && cfg.autoUpdate && isExe) installUpdate().catch(() => {}); }
  } catch (e) { upd.err = String(e.message || e).slice(0, 160); upd.state = upd.state === "available" ? "available" : "idle"; }
  return upd;
}
async function installUpdate() {
  if (!isExe) throw new Error("Nur die Argus-Mining.exe kann sich selbst aktualisieren.");
  if (upd.state !== "available" || !upd.info) await checkUpdate();
  if (upd.state !== "available") return upd;
  const j = upd.info; upd.state = "download"; upd.pct = 0; upd.err = "";
  try {
    const url = /^https:\/\//.test(j.url || "") ? j.url : `${UPDATE_BASE}/${encodeURIComponent(j.file || "Argus-Mining.exe")}`;
    const buf = await getBuf(url, 15 * 60e3, (got, total) => { total ||= j.size || 0; if (total) upd.pct = Math.round(got / total * 100); });
    if (crypto.createHash("sha256").update(buf).digest("hex").toLowerCase() !== j.sha256.toLowerCase()) throw new Error("Prüfsumme stimmt nicht, Update verworfen");
    const dir = path.join(DIR, "update"); fs.mkdirSync(dir, { recursive: true });
    const nexe = path.join(dir, `Argus-Mining-${j.version}.exe`); fs.writeFileSync(nexe, buf);
    // Austausch: die neue exe übernimmt (siehe --replace oben), diese hier beendet sich
    log(`Update ${j.version} geladen, Argus Mining startet neu`); report.flush();
    for (const f of fs.readdirSync(dir)) if (f !== path.basename(nexe)) try { fs.unlinkSync(path.join(dir, f)); } catch {}
    spawn(nexe, ["--replace", process.execPath, "--pid", String(process.pid)], { detached: true, stdio: "ignore" }).unref();
    upd.state = "restart"; setTimeout(() => process.exit(0), 800);
  } catch (e) { upd.state = "available"; upd.err = String(e.message || e).slice(0, 160); log("Update fehlgeschlagen: " + upd.err); }
  return upd;
}
// übrig gebliebene Update-Dateien vom letzten Austausch aufräumen
setTimeout(() => { const d = path.join(DIR, "update"); try { for (const f of fs.readdirSync(d)) fs.unlinkSync(path.join(d, f)); } catch {} }, 15e3);
setTimeout(() => checkUpdate(true), 20e3); setInterval(() => checkUpdate(true), 6 * 3600e3).unref?.();

// ---------- Webserver ----------
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { let b = ""; req.on("data", (d) => { b += d; if (b.length > 1e5) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });
const isLocal = (req) => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || "");
const status = () => { const s = lan.snapshot(); return { version: VERSION, name: cfg.name, ts: s.ts, scanning: s.scanning, scanTs: s.scanTs, scanned: s.scanned, ips: lan.parseRanges(cfg.ranges).ips.length, found: s.known, bad: s.bad, error: s.error, noNet: lastNoNet, update: { state: upd.state, latest: upd.latest, notes: upd.notes, err: upd.err, pct: upd.pct, canInstall: isExe }, miners: s.miners }; };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), p = u.pathname;
  // Fernzugriff (nur wenn eingeschaltet): nur lesende Daten und nur mit Schlüssel
  if (!isLocal(req)) {
    const ok = cfg.remote && (u.searchParams.get("token") === cfg.token || req.headers.authorization === "Bearer " + cfg.token);
    if (!ok || req.method !== "GET" || !p.startsWith("/api/") || p === "/api/config") return json(res, 403, { error: "kein Zugriff" });
  }
  // Schutz gegen fremde Webseiten im Browser dieses PCs, die Einstellungen ändern wollen
  if (req.method === "POST" && req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) return json(res, 403, { error: "kein Zugriff" });
  try {
    if (p === "/" || p === "/index.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); return res.end(PAGE); }
    if (p === "/api/status") return json(res, 200, status());
    if (p === "/api/days") return json(res, 200, report.days());
    if (p === "/api/months") return json(res, 200, report.months());
    if (p === "/api/range") return json(res, 200, report.buildRange(u.searchParams.get("from") || "", u.searchParams.get("to") || ""));
    if (p === "/api/month") return json(res, 200, report.buildMonth(u.searchParams.get("month") || report.dayKey().slice(0, 7)));
    // Detailansicht eines Miners: nur bekannte Adressen (keine beliebigen Ziele über diese Schnittstelle)
    if (p.startsWith("/api/miner")) {
      const ip = u.searchParams.get("ip") || "", snapM = (lan.snapshot().miners || []).find((m) => m.ip === ip);
      if (!snapM) return json(res, 404, { error: "Miner nicht bekannt" });
      if (p === "/api/miner") { const d = await lan.detail(ip, lan.opts()).catch(() => null); return json(res, 200, d ? { live: true, ...d } : { live: false, ...snapM, sensors: [], fans: [], boards: [], poolsAll: (snapM.pools || []) }); }
      if (p === "/api/miner/history") { const r = u.searchParams.get("range") || "1d"; return json(res, 200, { range: r, nom: snapM.nom ? Math.round(snapM.nom / 1e10) / 100 : null, points: r === "1d" ? hist.get(ip).map(([t, th, tp, on]) => [t, on ? th : 0, on, tp]) : report.history(ip, r) }); }
      if (p === "/api/miner/activity") {
        const keys = [`(${ip},`, `(${ip})`, snapM.serial ? "SN " + snapM.serial : null].filter(Boolean), out = [];
        for (const k of logDays().slice(-30).reverse()) {
          let txt = ""; try { txt = fs.readFileSync(path.join(LOGDIR, k + ".txt"), "utf8"); } catch {}
          for (const l of txt.split("\n").reverse()) if (l && keys.some((x) => l.includes(x))) { out.push(l); if (out.length >= 300) break; }
          if (out.length >= 300) break;
        }
        return json(res, 200, out);
      }
      return json(res, 404, { error: "nicht gefunden" });
    }
    if (p === "/api/logdays") return json(res, 200, logDays());
    // Pool-Report: Änderungen und Wechsel in einem Zeitraum (Standard: letzte 30 Tage) und der aktuelle Stand je Pool
    if (p === "/api/pools" || p === "/api/pools.csv") {
      const day = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : null), today = pools.dayKey();
      const to = day(u.searchParams.get("to")) || today, from = day(u.searchParams.get("from")) || pools.dayKey(Date.now() - 29 * 864e5);
      if (p === "/api/pools.csv") { res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="argus-mining-pools-${from}-bis-${to}.csv"` }); return res.end(pools.csv(from, to)); }
      return json(res, 200, { from, to, first: pools.days()[0] || null, events: pools.events(from, to).slice(0, 5000), current: pools.current(lan.snapshot().miners || []) });
    }
    if (p === "/api/log" || p === "/api/log.txt") {
      const k = u.searchParams.get("day") || report.dayKey(); if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return json(res, 400, { error: "Tag fehlt" });
      let txt = ""; try { txt = fs.readFileSync(path.join(LOGDIR, k + ".txt"), "utf8"); } catch {}
      if (p === "/api/log.txt") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="argus-mining-protokoll-${k}.txt"` }); return res.end(txt); }
      return json(res, 200, { day: k, lines: txt.split("\n").filter(Boolean).slice(-5000) });
    }
    if (p === "/api/report") return json(res, 200, report.build(u.searchParams.get("day") || report.dayKey()));
    if (p === "/api/report.csv") { const to = u.searchParams.get("to") || "", k = u.searchParams.get("from") || u.searchParams.get("month") || u.searchParams.get("day") || report.dayKey(); res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="argus-mining-${k}${to ? "-bis-" + to : ""}.csv"` }); return res.end(report.csv(k, to || undefined)); }
    if (p === "/api/config" && req.method === "GET") return json(res, 200, { ...cfg, vnishPass: "", antPass: "", hasAntPass: !!cfg.antPass, hasVnishPass: !!cfg.vnishPass, autostart: autostartOn(), dir: DIR, lanIps: lanIps() });
    if (p === "/api/config" && req.method === "POST") {
      const b = await body(req), old = cfg.ranges;
      if (typeof b.name === "string") cfg.name = b.name.trim().slice(0, 40) || "Farm";
      if (typeof b.ranges === "string") cfg.ranges = b.ranges.slice(0, 4000);
      if (b.jth != null) cfg.jth = Math.max(0, Math.min(200, Number(b.jth) || 0));
      if (typeof b.vnishPass === "string" && b.vnishPass) cfg.vnishPass = b.vnishPass.slice(0, 100);
      if (b.clearVnishPass) cfg.vnishPass = "";
      if (typeof b.antUser === "string" && b.antUser.trim()) cfg.antUser = b.antUser.trim().slice(0, 40);
      if (typeof b.antPass === "string" && b.antPass) cfg.antPass = b.antPass.slice(0, 100);
      if (typeof b.autoUpdate === "boolean") cfg.autoUpdate = b.autoUpdate;
      if (typeof b.remote === "boolean") cfg.remote = b.remote;
      if (b.newToken) cfg.token = crypto.randomBytes(16).toString("hex");
      if (typeof b.autostart === "boolean") setAutostart(b.autostart);
      saveCfg();
      const r = lan.parseRanges(cfg.ranges);
      if (cfg.ranges !== old) { log(`Adressbereiche geändert: ${r.ips.length} Adressen`); startLoops(); }
      if ((b.remote != null) && server.listening) relisten();
      return json(res, 200, { ok: true, ips: r.ips.length, bad: r.bad });
    }
    if (p === "/api/scan" && req.method === "POST") { lan.scan().then(() => { log(`Suche fertig: ${lan.snapshot().found} Miner gefunden`); return tick(); }).catch(() => {}); return json(res, 200, { ok: true }); }
    if (p === "/api/update/check" && req.method === "POST") return json(res, 200, await checkUpdate(false));
    if (p === "/api/update/install" && req.method === "POST") { installUpdate().catch(() => {}); return json(res, 200, { ok: true }); }
    if (p === "/api/forget" && req.method === "POST") { lan.reset(); lan.scan().then(tick).catch(() => {}); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "nicht gefunden" });
  } catch (e) { log("Fehler: " + e.message); json(res, 500, { error: e.message }); }
});
function lanIps() { return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address); }
function relisten() { server.close(() => listen()); }
function listen() {
  server.listen(cfg.port, cfg.remote ? "0.0.0.0" : "127.0.0.1", () => {
    const url = `http://localhost:${cfg.port}`;
    log(`Argus Mining ${VERSION} läuft: ${url}` + (cfg.remote ? ` (Fernzugriff an, im Netz unter ${lanIps().map((i) => `http://${i}:${cfg.port}`).join(", ")})` : ""));
    if (!opened && !process.argv.includes("--no-browser") && process.platform === "win32") { opened = true; exec(`start "" "${url}"`); }
  });
}
let opened = false;
server.on("error", (e) => { if (e.code === "EADDRINUSE") { log(`Port ${cfg.port} ist belegt. Läuft Argus Mining schon? Dann im Browser http://localhost:${cfg.port} öffnen.`); if (process.platform === "win32" && !process.argv.includes("--no-browser")) exec(`start "" "http://localhost:${cfg.port}"`); setTimeout(() => process.exit(1), 4000); } else log("Server: " + e.message); });
listen();
startLoops();
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { report.flush(); process.exit(0); });
// ohne Konsole (z. B. versteckt gestartet) schlägt das Schreiben fehl: still ignorieren statt Fehler-Schleife
for (const st of [process.stdout, process.stderr]) st?.on?.("error", () => {});
process.on("uncaughtException", (e) => { if (/EBADF|EPIPE/.test(e.code || e.message)) return; log("Unerwarteter Fehler: " + (e.stack || e.message)); });
try { console.log("Dieses Fenster offen lassen (minimieren reicht). Schließen beendet Argus Mining."); } catch {}
