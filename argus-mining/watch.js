// Wächter: schreibt ins Protokoll, wann das Programm aus war, wann der PC im Standby war und wann das Internet weg war.
// - Herzschlag alle 30 s in herzschlag.json. Beim Start: Lücke seit dem letzten Herzschlag = Programm war aus; mit Grund,
//   soweit erkennbar (Windows neu gestartet, Fenster geschlossen, Update, Absturz/beendet).
// - Läuft das Programm, aber ein Takt kommt viel zu spät: der PC war im Standby/Ruhezustand.
// - Internet: jede Minute eine Verbindung zu drei bekannten Adressen (Cloudflare, Google, Quad9, Port 443). Weg erst nach zwei
//   Fehlschlägen hintereinander, damit kurze Aussetzer nicht ins Protokoll kommen.
const fs = require("fs"), path = require("path"), os = require("os"), net = require("net");
let file = "", log = () => {}, lastBeat = 0, inet = { on: null, since: Date.now(), fails: 0, checked: 0 }, stopReason = "";
const HOSTS = (process.env.AM_INET_HOSTS || "1.1.1.1:443,8.8.8.8:443,9.9.9.9:443").split(",").map((h) => { const [host, port] = h.split(":"); return { host, port: Number(port) || 443 }; });
const fmt = (t) => new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dur = (ms) => { const m = Math.round(ms / 60e3), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60; return d ? `${d} Tag${d > 1 ? "e" : ""} ${h} h` : h ? `${h} h ${mi} min` : `${mi} min`; };
function beat(extra = {}) { lastBeat = Date.now(); try { fs.writeFileSync(file, JSON.stringify({ t: lastBeat, pid: process.pid, ...extra })); } catch {} }
// beim Beenden mit Grund festhalten (Fenster geschlossen, Update, Strg+C), damit der nächste Start ihn nennen kann
function mark(reason) { stopReason = reason; beat({ stop: reason }); }
function init(dir, logFn) {
  file = path.join(dir, "herzschlag.json"); log = logFn;
  let prev = null; try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const now = Date.now();
  if (prev?.t && now - prev.t > 3 * 60e3) {
    const boot = now - os.uptime() * 1000;
    const why = prev.stop ? prev.stop : boot > prev.t ? `Windows wurde um ${fmt(boot)} neu gestartet (PC war aus, Stromausfall oder Windows-Update)` : "Windows lief durchgehend: Programm wurde beendet oder ist abgestürzt";
    log(`Argus Mining war aus: ${fmt(prev.t)} bis ${fmt(now)} (${dur(now - prev.t)}). Grund: ${why}. In dieser Zeit gibt es keine Daten.`);
  }
  beat();
  setInterval(() => {
    const now2 = Date.now(), gap = now2 - lastBeat;
    if (gap > 3 * 60e3) log(`PC war im Standby oder angehalten: ${fmt(lastBeat)} bis ${fmt(now2)} (${dur(gap)}). In dieser Zeit gibt es keine Daten. Energieoptionen prüfen (Standby: Nie).`);
    beat();
  }, 30e3).unref?.();
  const check = () => checkInet().catch(() => {});
  setTimeout(check, 5e3); setInterval(check, 60e3).unref?.();
}
const tryHost = ({ host, port }) => new Promise((ok) => {
  const s = net.connect({ host, port }); let done = false;
  const end = (v) => { if (done) return; done = true; try { s.destroy(); } catch {} ok(v); };
  s.setTimeout(4000, () => end(false)); s.once("connect", () => end(true)); s.once("error", () => end(false));
});
async function checkInet() {
  const ok = (await Promise.all(HOSTS.map(tryHost))).some(Boolean), now = Date.now(); inet.checked = now;
  if (ok) {
    if (inet.on === false) log(`Internet wieder da (war weg seit ${fmt(inet.since)}, ${dur(now - inet.since)}).`);
    else if (inet.on === null) log("Internet erreichbar.");
    if (inet.on !== true) inet.since = now;
    inet.on = true; inet.fails = 0;
  } else if (++inet.fails >= 2 && inet.on !== false) {
    const since = now - 60e3; log(`Kein Internet seit ${fmt(since)}. Miner können dann ihre Pools nicht erreichen. Kabel/WLAN und Router prüfen.`);
    inet.on = false; inet.since = since;
  }
}
const state = () => ({ internet: inet.on, since: inet.since, checked: inet.checked });
module.exports = { init, mark, state, checkInet, _dur: dur };
