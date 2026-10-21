// Dateien auf allen Laufwerken finden und lesen (nur lesen: nichts ändern, nichts löschen).
// Ein Namensverzeichnis aller Dateien wird im Hintergrund gebaut und regelmäßig erneuert; Inhalte sucht die Windows-Suche.
// Reines Node, damit es auch argus-mcp.js nutzen kann.
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { execFile } = require("child_process");

const INDEX = () => process.env.JARVIS_INDEX || path.join(os.homedir(), "Argus-Gedaechtnis", ".dateiindex.txt");
// Systemordner und Caches, in denen Domi nie etwas sucht, machen das Verzeichnis nur langsam
const SKIP = new Set(["windows", "$recycle.bin", "system volume information", "$windows.~bt", "$windows.~ws", "$winreagent", "recovery", "config.msi",
  "node_modules", ".git", "__pycache__", "winsxs", "temp", "tmp", "inetcache", "cache", "caches", "code cache", "gpucache", "shadercache", ".cache",
  "packages", "crashdumps", "windowsapps", "msocache", "perflogs", ".ollama", "selfimprove-stage", "backups"]);
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
    const flush = () => new Promise((r) => { if (!chunk.length) return r(); const ok = out.write(chunk.join("\n") + "\n"); chunk = []; ok ? r() : out.once("drain", r); });
    const walk = async (dir, depth) => {
      let d; try { d = await fs.promises.opendir(dir); } catch { return; }
      const subs = [];
      try {
        for await (const e of d) {
          if (count > 3e6) break;
          const p = path.join(dir, e.name);
          if (e.isDirectory()) { const low = e.name.toLowerCase(); if ((!SKIP.has(low) || (low === "windows" && depth > 0)) && !e.name.startsWith("$")) { chunk.push(p + path.sep); count++; subs.push(p); } }
          else if (e.isFile()) { chunk.push(p); count++; }
          if (chunk.length >= 5000) await flush();
        }
      } catch {}
      if (depth < 40) for (const s of subs) await walk(s, depth + 1);
    };
    for (const r of roots()) await walk(r, 0);
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
  const best = [];
  const rl = readline.createInterface({ input: fs.createReadStream(INDEX(), "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const low = norm(line);
    if (!q.every((w) => low.includes(w))) continue;
    const isDir = line.endsWith(path.sep), base = norm(path.basename(line)), stem = base.replace(/\.[^.]+$/, "");
    let s = q.filter((w) => base.includes(w)).length * 20;
    if (!s) continue;
    const whole = q.join(" ");
    if (stem === whole) s += 60; else if (stem.startsWith(q[0])) s += 25;
    if (/\\(users|benutzer)\\/i.test(line)) s += 15; // eigene Dateien vor Programmdateien
    if (/\\(program files|programdata|appdata)/i.test(line)) s -= 20;
    if (isDir) s += 5;
    s -= line.split(path.sep).length;
    best.push({ s, p: line });
    if (best.length > n * 8) { best.sort((a, b) => b.s - a.s); best.length = n * 2; }
  }
  const out = best.sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.p);
  // Neue Dateien seit dem letzten Verzeichnisbau: im Benutzerordner direkt nachsehen
  return out.length ? out : quickSearch(q, n);
}
// Solange das Verzeichnis noch entsteht: die eigenen Ordner direkt durchsuchen
function quickSearch(q, n) {
  const hits = []; let seen = 0;
  const walk = (dir, depth) => {
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (++seen > 40000 || SKIP.has(e.name.toLowerCase()) || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (q.every((w) => norm(e.name).includes(w))) hits.push(e.isDirectory() ? p + path.sep : p);
      if (e.isDirectory() && depth < 6) walk(p, depth + 1);
    }
  };
  walk(os.homedir(), 0);
  return hits.slice(0, n);
}

// Inhaltssuche über den Windows-Suchindex (deckt die Benutzerordner ab, wie die Suche im Explorer)
function searchContent(query, n = 15) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const term = String(query).replace(/['"]/g, " ").trim(); if (!term) return resolve([]);
    const ps = `$c=New-Object -ComObject ADODB.Connection;$r=New-Object -ComObject ADODB.Recordset;` +
      `$c.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';");` +
      `$r.Open("SELECT TOP ${n} System.ItemPathDisplay FROM SYSTEMINDEX WHERE FREETEXT('${term}') ORDER BY System.DateModified DESC",$c);` +
      `while(-not $r.EOF){$r.Fields.Item('System.ItemPathDisplay').Value;$r.MoveNext()}`;
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + ps],
      { windowsHide: true, timeout: 20000, maxBuffer: 1 << 20 }, (err, stdout) => resolve(err ? [] : stdout.split(/\r?\n/).filter(Boolean)));
  });
}

const TEXT = /\.(txt|md|csv|tsv|log|json|jsonl|xml|html?|css|js|ts|py|ps1|bat|cmd|ini|cfg|conf|yaml|yml|toml|sql|sh|c|cpp|h|cs|java|go|rs|php|rb|srt)$/i;
// Zugangsdaten, Schlüssel und Browser-/Programmprofile bleiben auch für die KI unlesbar (eingeschleuste Anweisungen aus fremden Texten könnten sie sonst herausgeben)
const SECRET = /(^|[\\/])(\.ssh|\.aws|\.gnupg|\.azure|\.kube|\.docker)([\\/]|$)|[\\/]\.env(\.[^\\/]*)?$|\.(pem|key|ppk|kdbx|p12|pfx|ovpn)$|[\\/](id_rsa|id_ed25519|id_ecdsa|wallet\.dat|login data|cookies|local state|argus-config\.json|jarvis-config\.json)$|[\\/]appdata[\\/](roaming|local)[\\/](google[\\/]chrome|microsoft[\\/]edge|mozilla|bravesoftware|opera software|discord|telegram desktop|argus|jarvis)([\\/]|$)/i;
function read(p, max = 60000) {
  if (SECRET.test(String(p))) return `${p} ist gesperrt (Zugangsdaten oder Profildaten). Das lese ich nicht.`;
  const st = fs.statSync(p);
  if (st.isDirectory()) return list(p);
  if (!TEXT.test(p)) {
    // Unbekannte Endung: lesen, wenn es nach Text aussieht
    const head = Buffer.alloc(Math.min(4096, st.size)); const fd = fs.openSync(p, "r"); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
    if (head.includes(0)) return `${p} ist keine Textdatei (${Math.round(st.size / 1024)} KB). Öffnen kann ich sie, lesen nicht.`;
  }
  const fd = fs.openSync(p, "r"), buf = Buffer.alloc(Math.min(max, st.size)); fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  return buf.toString("utf8") + (st.size > max ? `\n… (gekürzt, Datei hat ${Math.round(st.size / 1024)} KB)` : "");
}
function list(dir, n = 200) {
  const es = fs.readdirSync(dir, { withFileTypes: true }).slice(0, n);
  return es.map((e) => {
    if (e.isDirectory()) return e.name + path.sep;
    let s = ""; try { const st = fs.statSync(path.join(dir, e.name)); s = ` (${Math.round(st.size / 1024)} KB, ${st.mtime.toISOString().slice(0, 10)})`; } catch {}
    return e.name + s;
  }).join("\n") || "(leer)";
}

module.exports = { roots, build, ready, search, searchContent, read, list, INDEX };
