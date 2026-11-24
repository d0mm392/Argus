// Selbstdiagnose (0.59.5): Blackbox, Sicherheitsstart und Diagnose-Paket. Alles bleibt auf diesem PC, nichts wird gesendet.
// - Blackbox: kurze Zeilen über das, was Argus gerade tut (YouTube öffnet, Grafikprozess weg, Standby …). Beim Start wird die
//   Datei des vorigen Laufs zu blackbox.prev.log, so stehen nach einem Absturz dessen letzte Schritte noch da.
// - Sicherheitsstart: endet Argus zweimal hintereinander unerwartet, startet es ohne Grafikbeschleunigung und ohne YouTube/Twitch.
// - Diagnose-Paket: Blackbox, Fehlerprotokoll, Berichte, Absturz-Abbilder und Systemangaben bereinigt in einer Zip-Datei.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const MAX_BYTES = 256 * 1024, KEEP_DUMPS = 5, SAFE_AFTER = 2;
let dir = "", file = "", prev = "", writes = 0;

function init(userData) {
  dir = userData; file = path.join(dir, "blackbox.log"); prev = path.join(dir, "blackbox.prev.log"); writes = 0;
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  try { if (fs.existsSync(file)) fs.renameSync(file, prev); } catch {}
}
const clean = (v) => String(v ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 300);
// Eine Zeile anhängen, synchron, damit sie auch bei einem harten Absturz direkt danach auf der Platte steht
function note(tag, ...parts) {
  if (!file) return;
  try {
    fs.appendFileSync(file, `${new Date().toISOString()} ${clean(tag).slice(0, 16)} ${parts.map(clean).join(" ")}\n`);
    if (++writes % 100 === 0 && fs.statSync(file).size > MAX_BYTES) { const t = fs.readFileSync(file, "utf8"); fs.writeFileSync(file, t.slice(t.indexOf("\n", t.length / 2) + 1)); }
  } catch {}
}

// Zähler aufeinanderfolgender unerwarteter Enden. unclean kommt aus crash.js (Markierung des vorigen Laufs)
const safeFile = () => path.join(dir, "safe-start.json");
function safeStart(unclean) {
  let s = {}; try { s = JSON.parse(fs.readFileSync(safeFile(), "utf8")) || {}; } catch {}
  const fails = unclean ? Math.min(99, (Number(s.fails) || 0) + 1) : 0;
  try { fs.writeFileSync(safeFile(), JSON.stringify({ fails, t: new Date().toISOString() })); } catch {}
  return { fails, safe: fails >= SAFE_AFTER };
}
// Lief Argus eine Weile stabil, zählt der Start als gelungen
function stable() { try { fs.writeFileSync(safeFile(), JSON.stringify({ fails: 0, t: new Date().toISOString() })); } catch {} }

// Absturz-Abbilder von Electron (Crashpad, nur lokal): die neuesten behalten, alte löschen
function dumps(dumpDir) {
  const out = [];
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 3) walk(p, depth + 1); else if (e.isFile() && /\.dmp$/i.test(e.name)) { try { out.push({ p, t: fs.statSync(p).mtimeMs, n: fs.statSync(p).size }); } catch {} } } };
  if (dumpDir) walk(dumpDir, 0);
  out.sort((a, b) => b.t - a.t);
  for (const d of out.slice(KEEP_DUMPS)) { try { fs.unlinkSync(d.p); } catch {} }
  return out.slice(0, KEEP_DUMPS);
}

// Diagnose-Paket als Zip. redact entfernt Benutzernamen, Pfade, Schlüssel (crash.redact). info: Systemangaben als Objekt
function bundle({ outFile, redact = (s) => s, info = {}, logFile = "", dumpDir = "" }) {
  const AdmZip = require("adm-zip"), zip = new AdmZip();
  const text = (name, f) => { try { if (f && fs.existsSync(f)) zip.addFile(name, Buffer.from(redact(fs.readFileSync(f, "utf8")), "utf8")); } catch {} };
  text("blackbox.log", file); text("blackbox-voriger-lauf.log", prev); text("fehlerprotokoll.log", logFile);
  text("berichte-offen.json", path.join(dir, "crash-pending.json")); text("berichte-verlauf.json", path.join(dir, "crash-history.json"));
  text("sicherheitsstart.json", safeFile());
  const ds = dumps(dumpDir);
  for (const d of ds.slice(0, 3)) { if (d.n < 30 * 1024 * 1024) try { zip.addLocalFile(d.p, "absturz-abbilder"); } catch {} }
  const sys = { erstellt: new Date().toISOString(), system: `${os.platform()} ${os.release()} ${os.arch()}`, ramGB: Math.round(os.totalmem() / 1024 ** 3), cpu: os.cpus()?.[0]?.model || "", absturzAbbilder: ds.length, ...info };
  zip.addFile("system.json", Buffer.from(redact(JSON.stringify(sys, null, 2)), "utf8"));
  zip.addFile("LIESMICH.txt", Buffer.from("Argus-Diagnose. Benutzername, Pfade, Schlüssel und Wallet-Adressen wurden aus den Textdateien entfernt.\nAbsturz-Abbilder (.dmp) sind Binärdateien von Electron und können Programmpfade enthalten.\nBitte nur an Personen schicken, denen du vertraust.\n", "utf8"));
  zip.writeZip(outFile);
  return { file: outFile, dumps: ds.length };
}

module.exports = { init, note, safeStart, stable, dumps, bundle, SAFE_AFTER };
