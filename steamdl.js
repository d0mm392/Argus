// Steam-Downloads mitlesen, ohne Login: Steam schreibt den Stand jedes Spiels in steamapps/appmanifest_<id>.acf
// (BytesDownloaded/BytesToDownload, StateFlags). Argus liest nur, ändert nichts.
const fs = require("fs"), path = require("path");
const { execFile } = require("child_process");

let steamDir = null, last = new Map(); // appid -> { bytes, t, rate }
const grow = new Map(); // appid -> { size, t, rate, base, acf } Größe von steamapps/downloading/<appid>

// Gesamtgröße eines Ordners (höchstens 20000 Dateien, damit es schnell bleibt)
function dirSize(dir) {
  let total = 0, n = 0; const stack = [dir];
  while (stack.length && n < 20000) {
    const d = stack.pop(); let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) stack.push(p); else { n++; try { total += fs.statSync(p).size; } catch {} } }
  }
  return total;
}

// Valves Textformat (VDF/ACF): "schlüssel" "wert" und verschachtelte { }
function parseVdf(txt) {
  const root = {}, stack = [root]; let key = null;
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g; let m;
  while ((m = re.exec(txt))) {
    if (m[2] === "{") { const o = {}; stack[stack.length - 1][key] = o; stack.push(o); key = null; }
    else if (m[2] === "}") { stack.pop(); key = null; }
    else if (key == null) key = m[1];
    else { stack[stack.length - 1][key] = m[1].replace(/\\\\/g, "\\"); key = null; }
  }
  return root;
}
function findSteam() {
  return new Promise((res) => {
    if (process.platform !== "win32") return res(process.env.JARVIS_STEAM_DIR || null);
    execFile("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], { windowsHide: true }, (e, out) => {
      const p = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out || "")?.[1]?.trim();
      res(p ? path.normalize(p) : fs.existsSync("C:\\Program Files (x86)\\Steam") ? "C:\\Program Files (x86)\\Steam" : null);
    });
  });
}
function libraries() {
  const libs = new Set([path.join(steamDir, "steamapps")]);
  try {
    const v = parseVdf(fs.readFileSync(path.join(steamDir, "steamapps", "libraryfolders.vdf"), "utf8"));
    for (const e of Object.values(v.libraryfolders || {})) if (e?.path) libs.add(path.join(e.path, "steamapps"));
  } catch {}
  // Steam schreibt denselben Ordner mal als „C:\\Program Files (x86)\\Steam“, mal klein mit / → nur einmal lesen
  const seen = new Set();
  return [...libs].filter((l) => { const k = path.resolve(l).toLowerCase().replace(/[\\/]+$/, ""); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Liste laufender und wartender Downloads: { id, name, done, total, pct, rate (Byte/s), active }
async function poll() {
  if (!steamDir) steamDir = await findSteam();
  if (!steamDir) return [];
  const out = [], now = Date.now(), ids = new Set(), info = logInfo(), names = new Map();
  for (const lib of libraries()) {
    let files = []; try { files = fs.readdirSync(lib).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      let a; try { a = parseVdf(fs.readFileSync(path.join(lib, f), "utf8")).AppState; } catch { continue; }
      if (!a || ids.has(a.appid)) continue;
      ids.add(a.appid); names.set(String(a.appid), a.name);
      const li = info.get(String(a.appid)), la = li ? logActive(li.state) : null;
      let mtime = 0; try { mtime = fs.statSync(path.join(lib, f)).mtimeMs; } catch {}
      const total = +a.BytesToDownload || 0, done = +a.BytesDownloaded || 0, flags = +a.StateFlags || 0;
      const stTotal = +a.BytesToStage || 0, stDone = +a.BytesStaged || 0;
      // Nur was noch fehlt: Herunterladen nicht fertig oder Installieren (Staging) läuft
      if (!(total > 0 && done < total) && !(stTotal > 0 && stDone < stTotal) && !la) continue;
      // UpdateRunning (1048576): lädt gerade. Manche Steam-Versionen setzen das Flag erst spät, deshalb zählt auch ein frisch geschriebenes Manifest
      // Steam schreibt BytesDownloaded nur selten ins Manifest. Was gerade wirklich ankommt, sieht man am Ordner
      // steamapps/downloading/<appid>, der beim Laden wächst: daraus Tempo und laufender Fortschritt
      const size = 0, g = grow.get(a.appid); // Ordnergröße nicht mehr messen: Steam legt die Dateien vorab voll an, und das Zählen bremste
      let grate = 0;
      if (g && now > g.t) { const d = size - g.size; grate = d > 0 ? d / ((now - g.t) / 1000) : g.rate * 0.5; }
      const gr = { size, t: now, rate: grate < 1000 ? 0 : grate, base: g && g.acf === done ? g.base : size, acf: done };
      grow.set(a.appid, gr);
      const extra = Math.max(0, size - gr.base); // seit dem letzten Manifest-Stand dazugekommen
      // Am verlässlichsten ist, was Steam selbst ins content_log schreibt („AppID 123 update changed : Running Update,Downloading,“).
      // Steam legt die Dateien im Download-Ordner oft vorab in voller Größe an, dann wächst der Ordner nicht
      const active = la != null ? la : !!(flags & 1048576) || now - mtime < 90000;
      const prev = last.get(a.appid);
      let rate = prev?.rate || 0;
      if (prev && now > prev.t) { const r = Math.max(0, (done - prev.bytes) / ((now - prev.t) / 1000)); rate = done !== prev.bytes ? r : active ? prev.rate * 0.7 : 0; }
      last.set(a.appid, { bytes: done, t: done !== prev?.bytes || !prev ? now : prev.t, rate });
      const fin = total > 0 && done >= total;
      // Laut Protokoll seit dem Start geladen; das Manifest hinkt hinterher
      const logDone = li && li.total ? li.start + li.dl : 0, tot0 = total || li?.total || 0;
      const cur = fin ? stDone : Math.min(tot0, Math.max(done + extra, logDone)), tot = fin ? stTotal : tot0;
      out.push({ id: a.appid, name: a.name || "App " + a.appid, done: cur, total: tot, pct: Math.min(100, Math.round((cur / tot || 0) * 100)), rate: gr.rate || (active ? rate : 0), active, phase: fin ? "installiert" : "lädt" });
    }
  }
  // Lädt laut Protokoll, aber keine passende Spieldatei gefunden (z. B. neues Spiel, Manifest noch nicht geschrieben)
  for (const [id, li] of info) {
    if (ids.has(id) || !logActive(li.state) || !li.total) continue;
    const cur = Math.min(li.total, li.start + li.dl);
    out.push({ id, name: names.get(id) || "Steam-Download " + id, done: cur, total: li.total, pct: Math.min(100, Math.round(cur / li.total * 100)), rate: 0, active: true, phase: "lädt" });
  }
  // Steam schreibt die Manifeste nicht laufend; das aktuelle Tempo steht zuverlässiger im content_log
  const live = out.find((d) => d.active && d.phase === "lädt");
  if (live) {
    const r = logRate();
    if (r != null && !live.rate) live.rate = r;
  }
  return out.sort((x, y) => y.active - x.active || y.pct - x.pct).slice(0, 4);
}

// Steams eigenes Protokoll logs/content_log.txt (nur neu lesen, wenn es sich geändert hat). Je App:
// letzter Zustand („App update changed : Running Update,Downloading,“ bzw. „… (Suspended)“), Gesamtgröße aus „update started : download a/b“
// und die seitdem geladenen Bytes aus den Statistik-Zeilen („stats: (Invalid, 0) : 821366496 Bytes“, alle ~5 Minuten).
// Die Spieldateien (appmanifest) schreibt Steam beim Laden nur selten, der Download-Ordner ist vorab voll angelegt.
let logCache = { key: "", map: new Map() };
function logInfo() {
  try {
    const f = path.join(steamDir, "logs", "content_log.txt"), st = fs.statSync(f), key = st.size + "|" + st.mtimeMs;
    if (key === logCache.key) return logCache.map;
    const fd = fs.openSync(f, "r"), n = Math.min(2 << 20, st.size), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd);
    const m = new Map(); let cur = null;
    const get = (id) => { if (!m.has(id)) m.set(id, { state: "", total: 0, start: 0, dl: 0, t: 0 }); return m.get(id); };
    for (const line of buf.toString("utf8").split(/\r?\n/)) {
      let x;
      if ((x = /AppID (\d+) (?:App )?(?:state|update) changed : (.*)$/.exec(line))) get(x[1]).state = x[2];
      else if ((x = /AppID (\d+) update started : download (\d+)\/(\d+)/.exec(line))) { const a = get(x[1]); a.start = +x[2]; a.total = +x[3]; a.dl = 0; cur = x[1]; }
      else if ((x = /AppID (\d+) (?:update canceled|finished update)/.exec(line))) { if (cur === x[1]) cur = null; }
      else if (cur && (x = /stats: \(Invalid, 0\) : (\d+) Bytes/.exec(line))) get(cur).dl += +x[1];
    }
    logCache = { key, map: m };
    return m;
  } catch { return logCache.map; }
}
const logActive = (ls) => !!ls && /Downloading|Running|Staging|Committing|Verifying|Preallocating|Reconfiguring/i.test(ls) && !/Paused|Suspended|Stopping|^None/i.test(ls);
// letzte „Current download rate: 28.84 Mbps“ aus den letzten 16 KB von logs/content_log.txt, in Byte/s
function logRate() {
  try {
    const f = path.join(steamDir, "logs", "content_log.txt"), st = fs.statSync(f);
    if (Date.now() - st.mtimeMs > 150000) return null; // Steam schreibt das Tempo etwa jede Minute // länger nichts geschrieben: kein aktueller Wert
    const fd = fs.openSync(f, "r"), n = Math.min(16384, st.size), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd);
    const all = [...buf.toString("utf8").matchAll(/download rate:\s*([\d.]+)\s*Mbps/gi)];
    return all.length ? Number(all[all.length - 1][1]) * 125000 : null;
  } catch { return null; }
}

module.exports = { poll, parseVdf };
