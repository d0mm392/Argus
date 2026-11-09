// Argus Mining: kleines eigenständiges Programm für den PC vor Ort. Fragt die Miner im eigenen Netz ab
// (Hashrate, Temperatur, Lüfter, Verbrauch, Geräte- und Mining-Laufzeit) und schreibt daraus einen Tagesreport je Miner.
// Bedienung im Browser unter http://localhost:8420 (nur auf diesem PC, außer der Fernzugriff wird ausdrücklich eingeschaltet).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto"), { exec } = require("child_process");
const lan = require("./lanminer"), report = require("./report"), PAGE = require("./page");

const VERSION = "1.0.0";
const DIR = process.env.AM_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "Argus Mining");
fs.mkdirSync(DIR, { recursive: true });
const CFG = path.join(DIR, "config.json");
const DEF = { name: "Farm", ranges: "", jth: 0, vnishPass: "", port: 8420, remote: false, token: "", keepDays: 30 };
let cfg = { ...DEF };
try { cfg = { ...DEF, ...JSON.parse(fs.readFileSync(CFG, "utf8")) }; } catch {}
if (!cfg.token) cfg.token = crypto.randomBytes(16).toString("hex");
const saveCfg = () => { try { fs.writeFileSync(CFG, JSON.stringify(cfg, null, 1)); } catch (e) { log("Einstellungen nicht gespeichert: " + e.message); } };
saveCfg();
const LOG = path.join(DIR, "log.txt");
function log(t) { const l = `[${new Date().toLocaleString("de-DE")}] ${t}`; console.log(l); try { fs.appendFileSync(LOG, l + "\n"); if (fs.statSync(LOG).size > 2e6) fs.writeFileSync(LOG, ""); } catch {} }

report.init(DIR, cfg.keepDays);
lan.init(DIR, () => ({ on: true, ranges: cfg.ranges, jth: cfg.jth, vnishPass: cfg.vnishPass }));

// Nach jeder Abfrage eine Report-Stichprobe (der Report nimmt selbst nur alle 5 Minuten eine)
let lastNoNet = false;
async function tick() {
  const s = await lan.poll().catch((e) => { log("Abfrage fehlgeschlagen: " + e.message); return null; });
  if (!s?.miners?.length) return;
  const noNet = s.miners.length >= 3 && !s.miners.some((m) => m.err !== "keine Antwort");
  if (noNet !== lastNoNet) log(noNet ? "Kein Miner antwortet mehr. Netzwerk des PCs prüfen." : "Miner antworten wieder."); lastNoNet = noNet;
  report.record(s.miners, noNet);
}
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

// ---------- Webserver ----------
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { let b = ""; req.on("data", (d) => { b += d; if (b.length > 1e5) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });
const isLocal = (req) => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || "");
const status = () => { const s = lan.snapshot(); return { version: VERSION, name: cfg.name, ts: s.ts, scanning: s.scanning, scanTs: s.scanTs, scanned: s.scanned, ips: lan.parseRanges(cfg.ranges).ips.length, found: s.known, bad: s.bad, error: s.error, noNet: lastNoNet, miners: s.miners }; };
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
    if (p === "/api/report") return json(res, 200, report.build(u.searchParams.get("day") || report.dayKey()));
    if (p === "/api/report.csv") { const k = u.searchParams.get("day") || report.dayKey(); res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="argus-mining-${k}.csv"` }); return res.end(report.csv(k)); }
    if (p === "/api/config" && req.method === "GET") return json(res, 200, { ...cfg, vnishPass: "", hasVnishPass: !!cfg.vnishPass, autostart: autostartOn(), dir: DIR, lanIps: lanIps() });
    if (p === "/api/config" && req.method === "POST") {
      const b = await body(req), old = cfg.ranges;
      if (typeof b.name === "string") cfg.name = b.name.trim().slice(0, 40) || "Farm";
      if (typeof b.ranges === "string") cfg.ranges = b.ranges.slice(0, 4000);
      if (b.jth != null) cfg.jth = Math.max(0, Math.min(200, Number(b.jth) || 0));
      if (typeof b.vnishPass === "string" && b.vnishPass) cfg.vnishPass = b.vnishPass.slice(0, 100);
      if (b.clearVnishPass) cfg.vnishPass = "";
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
process.on("uncaughtException", (e) => log("Unerwarteter Fehler: " + (e.stack || e.message)));
console.log("Dieses Fenster offen lassen (minimieren reicht). Schließen beendet Argus Mining.");
