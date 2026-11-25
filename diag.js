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
  // Chromium-Protokoll (Hinweise des Browser-Unterbaus, z. B. „Check failed“ kurz vor einem harten Absturz): voriger Lauf bleibt erhalten
  const cl = path.join(dir, "chromium.log");
  try { if (fs.existsSync(cl)) { if (fs.statSync(cl).size > 8 * 1048576) fs.unlinkSync(cl); else fs.renameSync(cl, path.join(dir, "chromium.prev.log")); } } catch {}
  return cl;
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
function bundle({ outFile, redact = (s) => s, info = {}, logFile = "", dumpDir = "", extra = {} }) {
  const AdmZip = require("adm-zip"), zip = new AdmZip();
  const text = (name, f) => { try { if (f && fs.existsSync(f)) zip.addFile(name, Buffer.from(redact(fs.readFileSync(f, "utf8")), "utf8")); } catch {} };
  text("blackbox.log", file); text("blackbox-voriger-lauf.log", prev); text("fehlerprotokoll.log", logFile);
  text("berichte-offen.json", path.join(dir, "crash-pending.json")); text("berichte-verlauf.json", path.join(dir, "crash-history.json"));
  text("sicherheitsstart.json", safeFile());
  text("chromium.log", path.join(dir, "chromium.log")); text("chromium-voriger-lauf.log", path.join(dir, "chromium.prev.log"));
  // 0.59.6: Abbilder direkt als Daten einpacken (0.59.5 ließ sie still weg), Fehler und Größen in system.json vermerken
  const ds = dumps(dumpDir), packed = [];
  for (const d of ds.slice(0, 3)) {
    const name = "absturz-abbilder/" + new Date(d.t).toISOString().replace(/[:.]/g, "-") + "-" + path.basename(d.p);
    if (d.n > 150 * 1024 * 1024) { packed.push({ datei: path.basename(d.p), mb: +(d.n / 1048576).toFixed(1), fehler: "zu groß" }); continue; }
    try { zip.addFile(name, fs.readFileSync(d.p)); packed.push({ datei: path.basename(d.p), mb: +(d.n / 1048576).toFixed(1), zeit: new Date(d.t).toISOString() }); }
    catch (e) { packed.push({ datei: path.basename(d.p), fehler: e.code || e.message }); }
  }
  const sys = { erstellt: new Date().toISOString(), system: `${os.platform()} ${os.release()} ${os.arch()}`, ramGB: Math.round(os.totalmem() / 1024 ** 3), cpu: os.cpus()?.[0]?.model || "", absturzAbbilder: ds.length, abbilderImPaket: packed, ...info };
  zip.addFile("system.json", Buffer.from(redact(JSON.stringify(sys, null, 2)), "utf8"));
  text("versionen.json", path.join(dir, "versionen.json"));
  for (const [name, obj] of Object.entries(extra)) { try { zip.addFile(name, Buffer.from(redact(JSON.stringify(obj, null, 2)), "utf8")); } catch {} }
  zip.addFile("LIESMICH.txt", Buffer.from("Argus-Diagnose. Benutzername, Pfade, Schlüssel und Wallet-Adressen wurden aus den Textdateien entfernt.\nAbsturz-Abbilder (.dmp) sind Binärdateien von Electron und können Programmpfade enthalten.\nBitte nur an Personen schicken, denen du vertraust.\n", "utf8"));
  zip.writeZip(outFile);
  return { file: outFile, dumps: ds.length };
}

// 0.59.8: Versionsverlauf (wann lief welche Version zuerst), um „seit dem Update …“ belegen zu können
function versions(v) {
  const f = path.join(dir, "versionen.json"); let a = [];
  try { a = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  if (!Array.isArray(a)) a = [];
  if (v && a[a.length - 1]?.v !== v) { a.push({ v: String(v), ab: new Date().toISOString() }); a = a.slice(-30); try { fs.writeFileSync(f, JSON.stringify(a)); } catch {} }
  return a;
}
// Neue Absturz-Abbilder seit dem letzten Start (für Hinweis und Fehlerbericht)
function newDumps(dumpDir) {
  const f = path.join(dir, "abbilder-gesehen.json"); let seen = 0;
  try { seen = Number(JSON.parse(fs.readFileSync(f, "utf8")).t) || 0; } catch {}
  const ds = dumps(dumpDir), fresh = ds.filter((d) => d.t > seen);
  if (ds.length) try { fs.writeFileSync(f, JSON.stringify({ t: ds[0].t })); } catch {}
  return seen ? fresh : []; // beim allerersten Mal nichts melden, alte Abbilder sind schon bekannt
}
// Einstellungen ohne Geheimnisse und ohne persönliche Texte: Schlüssel, Adressen, Namen und lange Texte nur als „gesetzt/leer“
const PRIVATE = /key|token|pass|secret|addr|wallet|url|user|name|mail|steamid|client|invite|notes|text|info|places|clocks|accounts|portal|iob|mineaddr|profile|layout|ytlast|ytloading|ytbad|twlast|history|custompages|pagelooks/i;
function settings(config = {}, sealed = []) {
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    if (sealed.includes(k) || PRIVATE.test(k)) { out[k] = v === "" || v == null || (Array.isArray(v) && !v.length) ? "leer" : "gesetzt"; continue; }
    if (typeof v === "string") out[k] = v.length > 40 ? `(Text, ${v.length} Zeichen)` : v;
    else if (v && typeof v === "object") { const n = Array.isArray(v) ? v.length : Object.keys(v).length; out[k] = JSON.stringify(v).length > 300 ? `(${Array.isArray(v) ? "Liste" : "Objekt"}, ${n} Einträge)` : v; }
    else out[k] = v;
  }
  return out;
}

module.exports = { init, note, safeStart, stable, dumps, bundle, versions, newDumps, settings, SAFE_AFTER };
