// Dateien auf allen Laufwerken finden und lesen (nur lesen: nichts ändern, nichts löschen).
// Ein Namensverzeichnis aller Dateien wird im Hintergrund gebaut und regelmäßig erneuert; Inhalte sucht die Windows-Suche.
// Reines Node, damit es auch argus-mcp.js nutzen kann.
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { execFile } = require("child_process");

const INDEX = () => process.env.JARVIS_INDEX || path.join(os.homedir(), "Argus-Gedaechtnis", ".dateiindex.txt");
// Systemordner und Caches, in denen der Nutzer nie etwas sucht, machen das Verzeichnis nur langsam
const SKIP = new Set(["windows", "$recycle.bin", "system volume information", "$windows.~bt", "$windows.~ws", "$winreagent", "recovery", "config.msi",
  "node_modules", ".git", "__pycache__", "winsxs", "temp", "tmp", "inetcache", "cache", "caches", "code cache", "gpucache", "shadercache", ".cache",
  "packages", "crashdumps", "windowsapps", "msocache", "perflogs", ".ollama", "selfimprove-stage", "backups"]);
// Daten der abgeschalteten Selbstverbesserung (seit 0.58.20): archivierte Arbeitsordner und der alte Marker kommen weder in
// das Verzeichnis noch in Suchtreffer. Arbeitsordner und Sicherungen schließt SKIP oben schon aus.
const PROFILES = new Set(["argus-desktop", "jarvis-desktop", "jarvis"]);
const isSvName = (n) => { const l = String(n).toLowerCase(); return l.startsWith("selfimprove-verworfen-") || l === "selfimprove-pending.json"; };
// Pfad liegt in Daten der Selbstverbesserung: Archiv oder Marker irgendwo, Arbeitsordner oder Sicherungen direkt in einem Profilordner
function isSvPath(p) {
  const parts = String(p || "").split(/[\\/]+/).filter(Boolean).map((x) => x.toLowerCase());
  return parts.some((x, i) => isSvName(x) || x === "selfimprove-stage" || (x === "backups" && i > 0 && PROFILES.has(parts[i - 1])));
}
const norm = (s) => String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

function roots() {
  if (process.platform !== "win32") return [os.homedir()];
  const out = [];
  for (const l of "CDEFGHIJKLMNOPQRSTUVWXYZ") { const r = l + ":\\"; try { fs.accessSync(r); out.push(r); } catch {} }
  return out;
}

let building = null;
// Baut das Verzeichnis neu, wenn es fehlt oder älter als maxAgeH ist. Gibt die Anzahl Einträge zurück.
function build({ force = false, maxAgeH = 12, onDone } = {}) {
  if (building) return building;
  try { if (!force && Date.now() - fs.statSync(INDEX()).mtimeMs < maxAgeH * 3600e3) return Promise.resolve(-1); } catch {}
  building = (async () => {
    fs.mkdirSync(path.dirname(INDEX()), { recursive: true });
    const tmp = INDEX() + ".neu", out = fs.createWriteStream(tmp);
    let count = 0, chunk = [];
    const prot = protectedRoots(); // geschützte Ordner kommen nicht ins Verzeichnis (0.58.21)
    const flush = () => new Promise((r) => { if (!chunk.length) return r(); const ok = out.write(chunk.join("\n") + "\n"); chunk = []; ok ? r() : out.once("drain", r); });
    const walk = async (dir, depth) => {
      if (!enterDir(dir, prot)) return; // jeder Ordner wird direkt vor dem Lesen geprüft (0.58.21)
      let d; try { d = await fs.promises.opendir(dir); } catch { return; }
      const subs = [];
      try {
        for await (const e of d) {
          if (count > 3e6) break;
          if (isSvName(e.name)) continue; // vor Typauswertung, Aufnahme und Abstieg
          const p = path.join(dir, e.name);
          // Verknüpfte Ordner (Junctions, Links) werden nicht betreten. opendir meldet Junctions unter Node 20 (Electron 33) als
          // Verzeichnis, darum prüft enterDir mit lstat; scheitert es, wird der Ordner übersprungen
          if (e.isDirectory()) {
            const low = e.name.toLowerCase();
            if ((!SKIP.has(low) || (low === "windows" && depth > 0)) && !e.name.startsWith("$") && enterDir(p, prot)) { chunk.push(p + path.sep); count++; subs.push(p); }
          }
          else if (e.isFile()) { chunk.push(p); count++; }
          if (chunk.length >= 5000) await flush();
        }
      } catch {}
      if (depth < 40) for (const s of subs) await walk(s, depth + 1);
    };
    // Laufwerke nur, wenn sie sich auf sich selbst auflösen: subst- und Alias-Laufwerke und nicht auflösbare werden übersprungen
    for (const r of roots()) { let real = null; try { real = fs.realpathSync.native(r).replace(/^\\\\\?\\(?=[a-z]:)/i, ""); } catch {} if (real && key(real) === key(r)) await walk(r, 0); }
    await flush();
    await new Promise((r) => out.end(r));
    fs.renameSync(tmp, INDEX());
    return count;
  })().finally(() => { building = null; }).then((n) => { onDone?.(n); return n; }, (e) => { onDone?.(-2, e); return -2; });
  return building;
}
const ready = () => fs.existsSync(INDEX());

// Namenssuche: alle Wörter müssen im Pfad stehen, Treffer im Dateinamen zählen mehr
async function search(query, n = 15) {
  const q = norm(query).split(/[\s_\-.]+/).filter((w) => w.length >= 2);
  if (!q.length) return [];
  if (!ready()) return quickSearch(q, n);
  const best = [], prot = protectedRoots();
  const rl = readline.createInterface({ input: fs.createReadStream(INDEX(), "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const low = norm(line);
    if (!q.every((w) => low.includes(w))) continue;
    if (isSvPath(line)) continue; // ein älteres Verzeichnis kann noch Einträge aus der Selbstverbesserung enthalten
    // Geschützte Pfade schon vor dem Kürzen der Kandidaten verwerfen, damit sie keine erlaubten Treffer verdrängen (0.58.21)
    const bare = line.replace(/[\\/]$/, ""); if (SECRET.test(bare) || nameBlocked(bare) || underRoot(key(bare), prot)) continue;
    const isDir = line.endsWith(path.sep), base = norm(path.basename(line)), stem = base.replace(/\.[^.]+$/, "");
    let s = q.filter((w) => base.includes(w)).length * 20;
    if (!s) continue;
    const whole = q.join(" ");
    if (stem === whole) s += 60; else if (stem.startsWith(q[0])) s += 25;
    if (/\\(users|benutzer)\\/i.test(line)) s += 15; // eigene Dateien vor Programmdateien
    if (/\\(program files|programdata|appdata)/i.test(line)) s -= 20;
    if (isDir) s += 5;
    s -= line.split(path.sep).length;
    if (!hitAllowed(line)) continue;
    best.push({ s, p: line });
    if (best.length > n * 8) { best.sort((a, b) => b.s - a.s); best.length = n * 2; }
  }
  // Jeder Treffer wird gegen sein tatsächliches Ziel geprüft (alter Index, Verknüpfungen, inzwischen verschobene Ordner)
  const out = [];
  for (const x of best.sort((a, b) => b.s - a.s)) { if (out.length >= n) break; if (hitAllowed(x.p)) out.push(x.p); }
  // Neue Dateien seit dem letzten Verzeichnisbau: im Benutzerordner direkt nachsehen
  return out.length ? out : quickSearch(q, n);
}
// Solange das Verzeichnis noch entsteht: die eigenen Ordner direkt durchsuchen
function quickSearch(q, n) {
  const hits = []; let seen = 0; const prot = protectedRoots();
  const walk = (dir, depth) => {
    if (!enterDir(dir, prot)) return; // jeder Ordner wird direkt vor dem Lesen geprüft (0.58.21)
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (++seen > 40000 || SKIP.has(e.name.toLowerCase()) || isSvName(e.name) || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (nameBlocked(p) || underRoot(key(p), prot)) continue;
      if (q.every((w) => norm(e.name).includes(w))) hits.push(e.isDirectory() ? p + path.sep : p);
      if (e.isDirectory() && depth < 6) walk(p, depth + 1);
    }
  };
  const home = walkRoot(os.homedir()); if (home) walk(home, 0);
  return hits.filter(hitAllowed).slice(0, n);
}
// Treffer: tatsächliches Ziel erlaubt und keine Datei mit mehreren harten Verknüpfungen (sonst ein Alias einer geschützten Datei)
const hitAllowed = (h) => checkPath(String(h).replace(/[\\/]$/, ""), { read: true }).ok;
// Darf ein automatischer Durchlauf diesen Ordner lesen? Kein verknüpfter Ordner (lstat), kein geschützter Name, kein geschützter Ordner.
// Der Startordner wird vorher mit walkRoot über sein tatsächliches Ziel geprüft; da nie eine Verknüpfung betreten wird,
// entspricht der Pfad jedes erreichten Ordners dann seinem tatsächlichen Ort.
function enterDir(dir, prot = protectedRoots()) {
  let st; try { st = fs.lstatSync(dir); } catch { return false; }
  return st.isDirectory() && !st.isSymbolicLink() && !SECRET.test(dir) && !SECRET.test(dir + path.sep) && !nameBlocked(dir) && !underRoot(key(dir), prot);
}
// Startordner eines Durchlaufs: tatsächliches Ziel prüfen und zurückgeben (durchlaufen wird der aufgelöste Pfad), sonst null
function walkRoot(dir) { const c = checkPath(dir); return c.ok && c.st.isDirectory() ? c.real : null; }

// Inhaltssuche über den Windows-Suchindex (deckt die Benutzerordner ab, wie die Suche im Explorer)
function searchContent(query, n = 15) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const term = String(query).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/['"]/g, " ").trim().slice(0, 200); if (!term) return resolve([]);
    const top = Math.max(1, Math.min(50, Math.floor(Number(n)) || 15)), want = Math.min(100, top * 3); // mehr abfragen, nach dem Filtern kürzen
    // Suchbegriff nur als Daten übergeben (Umgebungsvariable), nie in den PowerShell-Code einsetzen (0.58.21): sonst würden
    // Ausdrücke wie $(...) in einer Zeichenkette mit doppelten Anführungszeichen ausgeführt. In SQL werden Hochkommas verdoppelt.
    const ps = "$t=([string]$env:ARGUS_SUCHE) -replace \"'\",\"''\";$n=[int]$env:ARGUS_SUCHE_N;" +
      "$c=New-Object -ComObject ADODB.Connection;$r=New-Object -ComObject ADODB.Recordset;" +
      "$c.Open(\"Provider=Search.CollatorDSO;Extended Properties='Application=Windows';\");" +
      "$r.Open(('SELECT TOP ' + $n + ' System.ItemPathDisplay FROM SYSTEMINDEX WHERE FREETEXT(''' + $t + ''') ORDER BY System.DateModified DESC'),$c);" +
      "while(-not $r.EOF){$r.Fields.Item('System.ItemPathDisplay').Value;$r.MoveNext()}";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + ps],
      { windowsHide: true, timeout: 20000, maxBuffer: 1 << 20, env: { ...process.env, ARGUS_SUCHE: term, ARGUS_SUCHE_N: String(want) } }, (err, stdout) => resolve(err ? [] : stdout.split(/\r?\n/).filter(Boolean).filter((p) => !isSvPath(p) && hitAllowed(p)).slice(0, top)));
  });
}

const TEXT = /\.(txt|md|csv|tsv|log|json|jsonl|xml|html?|css|js|ts|py|ps1|bat|cmd|ini|cfg|conf|yaml|yml|toml|sql|sh|c|cpp|h|cs|java|go|rs|php|rb|srt)$/i;
// Zugangsdaten, Schlüssel und Browser-/Programmprofile bleiben auch für die KI unlesbar (eingeschleuste Anweisungen aus fremden Texten könnten sie sonst herausgeben)
const SECRET = /(^|[\\/])(\.ssh|\.aws|\.gnupg|\.azure|\.kube|\.docker)([\\/]|$)|[\\/]\.env(\.[^\\/]*)?$|\.(pem|key|ppk|kdbx|p12|pfx|ovpn)$|[\\/](id_rsa|id_ed25519|id_ecdsa|wallet\.dat|login data|cookies|local state|argus-config\.json|jarvis-config\.json)$|[\\/]appdata[\\/](roaming|local)[\\/](google[\\/]chrome|microsoft[\\/]edge|mozilla|bravesoftware|opera software|discord|telegram desktop|argus|jarvis)([\\/]|$)/i;

// ---------- Gemeinsame Schutzprüfung für KI-Werkzeuge, Suche und Öffnen (0.58.21) ----------
// Geschützt sind die Argus-Profilordner und die Daten der Selbstverbesserung. Geprüft wird der angegebene Pfad UND das tatsächliche
// Ziel (fs.realpathSync.native: löst Junctions, symbolische Links, 8.3-Kurznamen und subst-Laufwerke auf). Was sich nicht sicher
// auflösen lässt, wird abgelehnt: Gerätepfade (\\.\, \\?\ außer \\?\C:\…, \??\), UNC- und Netzpfade, alternative Datenströme (:),
// Dateien mit mehreren harten Verknüpfungen (sie haben keinen eindeutigen Ort) und Ziele, deren Auflösung fehlschlägt.
// Interne Zugriffe von Argus (Einstellungen, Gedächtnis, Index) laufen nicht hierüber und bleiben unverändert.
const PROFILE_DIRS = ["argus-desktop", "jarvis-desktop", "Jarvis"];
const key = (p) => String(p).replace(/^\\\\\?\\(?=[a-z]:)/i, "").replace(/[\\/]+/g, "\\").replace(/\\$/, "").toLowerCase();
function protectedRoots() {
  const out = new Set(), home = os.homedir();
  const add = (p) => { if (!p) return; const r = path.resolve(p); out.add(key(r)); try { out.add(key(fs.realpathSync.native(r))); } catch {} };
  for (const base of new Set([process.env.APPDATA || path.join(home, "AppData", "Roaming"), process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")]))
    for (const n of PROFILE_DIRS) add(path.join(base, n));
  add(process.env.ARGUS_USERDATA); // von main.js gesetzt: app.getPath("userData"), auch wenn es anders heißt
  return [...out];
}
const underRoot = (k, roots) => roots.some((r) => k === r || k.startsWith(r + "\\"));
// Namensregeln wie 0.58.20 (Profilnamen, Selbstverbesserung, Zugangsdaten), auf einen schon absoluten Pfad angewandt
function nameBlocked(abs) {
  const parts = String(abs).split(/[\\/]+/).filter(Boolean).map((x) => x.toLowerCase());
  return parts.some((x, i) => x === "argus-desktop" || x === "jarvis-desktop" || (x === "jarvis" && i > 0 && (parts[i - 1] === "roaming" || parts[i - 1] === "local"))) || isSvPath(parts.join("/"));
}
// Ergebnis { ok, real, st, why }: why = "gesperrt" | "sonderpfad" | "unklar" | "fehlt"; real = aufgelöster Pfad für den eigentlichen Zugriff.
// read: true lehnt zusätzlich Dateien mit mehreren harten Verknüpfungen ab. Lesen, Auflisten, Suchtreffer, Öffnen und Programmstart
// verwenden es; ohne read prüfen nur Ordner-Startpunkte und Arbeitsordner.
function checkPath(input, { read = false } = {}) {
  let s = String(input == null ? "" : input).trim().replace(/\//g, "\\");
  if (!s || s.includes("\0")) return { ok: false, why: "unklar" };
  if (/^\\\\\?\\[a-z]:\\/i.test(s)) s = s.slice(4); // \\?\C:\… ist ein gewöhnlicher Laufwerkspfad
  if (/^\\\\|^\\\?\?\\/.test(s)) return { ok: false, why: "sonderpfad" }; // \\.\, \\?\Volume…, \\?\GLOBALROOT…, \\?\UNC…, UNC, \??\
  if (s.slice(2).includes(":")) return { ok: false, why: "sonderpfad" }; // alternativer Datenstrom (datei:strom) oder unzulässiger Name
  const abs = path.resolve(s);
  if (/^\\\\/.test(abs)) return { ok: false, why: "sonderpfad" };
  const roots = protectedRoots();
  if (SECRET.test(abs) || nameBlocked(abs) || underRoot(key(abs), roots)) return { ok: false, why: "gesperrt" };
  let real;
  try { real = fs.realpathSync.native(abs); } catch (e) { return { ok: false, why: e && e.code === "ENOENT" ? "fehlt" : "unklar" }; }
  if (/^\\\\/.test(real) && !/^\\\\\?\\[a-z]:\\/i.test(real)) return { ok: false, why: "unklar" }; // Ziel liegt auf einem Netz- oder Gerätepfad
  real = real.replace(/^\\\\\?\\(?=[a-z]:)/i, "");
  if (SECRET.test(real) || nameBlocked(real) || underRoot(key(real), roots)) return { ok: false, why: "gesperrt" };
  let st; try { st = fs.statSync(real); } catch { return { ok: false, why: "unklar" }; }
  if (read && !st.isDirectory() && st.nlink > 1) return { ok: false, why: "unklar" }; // harte Verknüpfung: anderer Name derselben Datei möglich
  return { ok: true, real, st };
}
const allowed = (p) => checkPath(p).ok;
const DENY = { gesperrt: "ist gesperrt (Argus-Profil, Daten der Selbstverbesserung oder Zugangsdaten)", sonderpfad: "ist ein Sonder- oder Netzpfad, den ich nicht lese",
  unklar: "lässt sich nicht sicher zuordnen (Verknüpfung, harte Verknüpfung oder unlesbarer Pfad)", fehlt: "gibt es nicht" };
const BLOCKED = (p, why) => `${p} ${DENY[why] || DENY.gesperrt}. Das lese ich nicht.`;
function read(p, max = 60000) {
  const c = checkPath(p, { read: true });
  if (!c.ok) return BLOCKED(p, c.why);
  const f = c.real, st = c.st;
  if (st.isDirectory()) return list(f);
  if (!TEXT.test(f)) {
    // Unbekannte Endung: lesen, wenn es nach Text aussieht
    const head = Buffer.alloc(Math.min(4096, st.size)); const fd = fs.openSync(f, "r"); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
    if (head.includes(0)) return `${p} ist keine Textdatei (${Math.round(st.size / 1024)} KB). Öffnen kann ich sie, lesen nicht.`;
  }
  const fd = fs.openSync(f, "r"), buf = Buffer.alloc(Math.min(max, st.size)); fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  return buf.toString("utf8") + (st.size > max ? `\n… (gekürzt, Datei hat ${Math.round(st.size / 1024)} KB)` : "");
}
function list(input, n = 200) {
  const c = checkPath(input, { read: true });
  if (!c.ok) return BLOCKED(input, c.why);
  if (!c.st.isDirectory()) return `${input} ist kein Ordner.`;
  const dir = c.real;
  const es = fs.readdirSync(dir, { withFileTypes: true });
  // 0.58.21: geschützte Einträge und Dateien mit mehreren harten Verknüpfungen werden nicht aufgeführt; Verknüpfungen nur mit Namen
  // (lstat: keine Angaben von ihrem womöglich geschützten Ziel)
  const prot = protectedRoots();
  return es.map((e) => {
    const full = path.join(dir, e.name);
    if (SECRET.test(full) || nameBlocked(full) || underRoot(key(full), prot)) return null;
    let st = null; try { st = fs.lstatSync(full); } catch { return null; }
    if (st.isSymbolicLink()) return e.name + " (Verknüpfung)";
    if (st.isDirectory()) return e.name + path.sep;
    if (st.nlink > 1) return null;
    return e.name + ` (${Math.round(st.size / 1024)} KB, ${st.mtime.toISOString().slice(0, 10)})`;
  }).filter((x) => x !== null).slice(0, n).join("\n") || "(leer)"; // erst filtern, dann begrenzen
}

module.exports = { roots, build, ready, search, searchContent, read, list, INDEX, isSvPath, checkPath, allowed, enterDir, walkRoot };
