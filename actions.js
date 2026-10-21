// Aktionen: Programme, Webseiten, Ordner und Dokumente öffnen, wenn Domi es sagt oder tippt.
// Erkennt einfache deutsche Befehle direkt (schnell und zuverlässig) und fällt sonst auf die KI zurück.
const { shell } = require("electron");
const { spawn, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const files = require("./files");

const HOME = os.homedir();
const START_MENUS = [
  path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
  path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
  path.join(HOME, "Desktop"),
  path.join(process.env.PUBLIC || "C:\\Users\\Public", "Desktop"),
];
const FOLDERS = {
  downloads: path.join(HOME, "Downloads"), download: path.join(HOME, "Downloads"),
  dokumente: path.join(HOME, "Documents"), documents: path.join(HOME, "Documents"),
  desktop: path.join(HOME, "Desktop"), schreibtisch: path.join(HOME, "Desktop"),
  bilder: path.join(HOME, "Pictures"), musik: path.join(HOME, "Music"), videos: path.join(HOME, "Videos"),
};
// Gesprochene Namen, die Vosk anders schreibt, auf den Programmnamen abbilden
const ALIASES = { "brav": "brave", "bräwe": "brave", "breiv": "brave", "chrom": "chrome", "krom": "chrome", "fire fox": "firefox",
  "explorer": "datei-explorer", "rechner": "rechner", "taschenrechner": "rechner", "editor": "editor", "steam": "steam", "discord": "discord" };

// ---------- Programme aus Startmenü und Desktop einsammeln ----------
let apps = null, appsAt = 0;
// Weitere Quellen, die nicht im Startmenü als Verknüpfung liegen: Store-Apps (Get-StartApps), Steam-, Epic- und Battle.net-Spiele
let extraApps = [], extraAt = 0;
const BNET = { "diablo iv": "Fen", "diablo 4": "Fen", "diablo iii": "D3", "diablo 3": "D3", "overwatch": "Pro", "overwatch 2": "Pro", "world of warcraft": "WoW", "hearthstone": "WTCG", "starcraft ii": "S2", "call of duty": "auks", "diablo ii resurrected": "OSI" };
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function steamGames() {
  const out = [], roots = new Set();
  for (const base of [path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam")]) {
    let vdf = ""; try { vdf = fs.readFileSync(path.join(base, "steamapps", "libraryfolders.vdf"), "utf8"); } catch { continue; }
    roots.add(path.join(base, "steamapps"));
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) roots.add(path.join(m[1].replace(/\\\\/g, "\\"), "steamapps"));
  }
  for (const r of roots) {
    let list = []; try { list = fs.readdirSync(r).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch {}
    for (const f of list) {
      let t = ""; try { t = fs.readFileSync(path.join(r, f), "utf8"); } catch { continue; }
      const id = (/"appid"\s+"(\d+)"/.exec(t) || [])[1], name = (/"name"\s+"([^"]+)"/.exec(t) || [])[1];
      if (id && name && !/redistributable|steamworks|proton|runtime/i.test(name)) out.push({ name, uri: "steam://rungameid/" + id, kind: "Steam-Spiel" });
    }
  }
  return out;
}
function epicGames() {
  const dir = path.join(process.env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests"), out = [];
  let list = []; try { list = fs.readdirSync(dir).filter((f) => f.endsWith(".item")); } catch {}
  for (const f of list) { const j = readJSON(path.join(dir, f)); if (j?.DisplayName && j.AppName) out.push({ name: j.DisplayName, uri: `com.epicgames.launcher://apps/${encodeURIComponent(j.AppName)}?action=launch&silent=true`, kind: "Epic-Spiel" }); }
  return out;
}
function storeApps() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress"],
      { windowsHide: true, timeout: 15000, maxBuffer: 8 << 20 }, (err, out) => {
        if (err) return resolve([]);
        let l; try { l = JSON.parse(out || "[]"); } catch { return resolve([]); }
        resolve((Array.isArray(l) ? l : [l]).filter((x) => x?.Name && x.AppID && !/uninstall|deinstall|readme/i.test(x.Name)).map((x) => ({ name: x.Name, appId: x.AppID })));
      });
  });
}
async function refreshExtra() {
  if (Date.now() - extraAt < 10 * 60 * 1000 && extraApps.length) return;
  extraAt = Date.now();
  const bnet = fs.existsSync(path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Battle.net")) ? Object.entries(BNET).map(([n, code]) => ({ name: n.replace(/\b\w/g, (c) => c.toUpperCase()), uri: "battlenet://" + code, kind: "Battle.net-Spiel" })) : [];
  extraApps = [...steamGames(), ...epicGames(), ...bnet, ...(await storeApps())];
}
if (process.platform === "win32") setTimeout(() => refreshExtra().catch(() => {}), 5000);
function scanApps() {
  if (apps && Date.now() - appsAt < 10 * 60 * 1000) return apps;
  const found = new Map();
  const walk = (dir, depth) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (/\.(lnk|url|exe)$/i.test(e.name) && !/uninstall|deinstall|readme|hilfe|help/i.test(e.name)) {
        const name = e.name.replace(/\.(lnk|url|exe)$/i, "");
        if (!found.has(norm(name))) found.set(norm(name), { name, path: p });
      }
    }
  };
  START_MENUS.forEach((d) => walk(d, 0));
  // Eingebaute Windows-Programme, die nicht als Verknüpfung auftauchen
  for (const [name, cmd] of [["Datei-Explorer", "explorer.exe"], ["Rechner", "calc.exe"], ["Editor", "notepad.exe"], ["Task-Manager", "taskmgr.exe"], ["Einstellungen", "ms-settings:"]])
    if (!found.has(norm(name))) found.set(norm(name), { name, cmd });
  apps = [...found.values()]; appsAt = Date.now();
  refreshExtra().catch(() => {});
  return apps;
}
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Bestes Programm zum gesprochenen Namen: exakt, Wortanfang, enthalten, dann Tippfehler-tolerant
function findApp(spoken) {
  const q = norm(ALIASES[norm(spoken)] || spoken);
  if (!q) return null;
  let best = null, bestScore = 0;
  for (const a of [...scanApps(), ...extraApps]) {
    const n = norm(a.name), first = n.split(" ")[0];
    let score = n === q ? 100 : first === q ? 90 : n.startsWith(q) ? 80 : n.split(" ").includes(q) ? 70 : n.includes(q) && q.length >= 4 ? 50 : 0;
    if (!score && q.length >= 4) { const dist = Math.min(lev(q, first), lev(q, n)); if (dist <= (q.length > 6 ? 2 : 1)) score = 40 - dist * 10; }
    score -= n.length / 100; // kürzere Namen bevorzugen ("Brave" vor "Brave Beta Updater")
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > 15 ? best : null;
}
function launchApp(a, arg) {
  if (a.uri) return shell.openExternal(a.uri);
  if (a.appId) return spawn("explorer.exe", ["shell:AppsFolder\\" + a.appId], { detached: true, stdio: "ignore" }).unref();
  if (a.cmd) { if (a.cmd.endsWith(":")) return shell.openExternal(a.cmd); return spawn(a.cmd, arg ? [arg] : [], { detached: true, stdio: "ignore" }).unref(); }
  if (arg && /\.lnk$/i.test(a.path)) {
    try { const t = shell.readShortcutLink(a.path); return spawn(t.target, [...(t.args ? t.args.split(" ") : []), arg], { detached: true, stdio: "ignore", cwd: t.cwd || undefined }).unref(); } catch {}
  }
  return shell.openPath(a.path);
}

// ---------- Dokumente suchen (Dokumente, Desktop, Downloads, max. 3 Ebenen tief) ----------
function findFile(spoken) {
  const q = norm(spoken);
  if (q.length < 3) return null;
  let best = null, bestScore = 0, seen = 0;
  const walk = (dir, depth) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > 20000) return;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(dir, e.name), n = norm(e.name.replace(/\.[^.]+$/, ""));
      const score = n === q ? 100 : n.startsWith(q) ? 80 : n.includes(q) ? 60 : 0;
      if (score > bestScore) { bestScore = score; best = p; }
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
    }
  };
  for (const d of [FOLDERS.dokumente, FOLDERS.desktop, FOLDERS.downloads]) walk(d, 0);
  return best;
}

// ---------- Gefundenes merken und öffnen ----------
let lastHits = [], lastQuery = "";
// Ordner direkt öffnen, bei Dateien den Ordner mit markierter Datei
async function openHit(p) {
  const clean = p.replace(/[\\/]$/, "");
  if (/[\\/]$/.test(p)) return shell.openPath(clean);
  shell.showItemInFolder(clean);
}
// Gleichbedeutende Suchwörter: Lebenslauf heißt oft CV oder Resume
const SYN = [["cv", "lebenslauf", "resume"], ["rechnung", "invoice"], ["bilder", "fotos", "pictures"], ["vertrag", "contract"]];
function variants(q) {
  const out = [q], low = q.toLowerCase();
  for (const g of SYN) for (const w of g) if (new RegExp(`\\b${w}\\b`).test(low)) for (const o of g) if (o !== w) out.push(low.replace(new RegExp(`\\b${w}\\b`), o));
  return out;
}

// ---------- Befehle erkennen ----------
const TLD = "de|com|net|org|io|tv|eu|at|ch|info|gg|co|uk|fr|nl|app|dev";
function parse(raw) {
  let t = raw.trim().replace(/[.!?]+$/, "")
    .replace(/\s+punkt\s+/gi, ".") // "gamestar punkt de"
    .replace(/\bbitte\b[\s,]*/gi, "")
    .replace(/^(?:(?:hey|hallo|ok|okay|gut|so|und|also)[\s,]+)*(?:jarvis|argus|strata|lokale?(?:\s+ki)?)[\s,:]+/i, "")
    .replace(/^(jarvis|claude|kannst du( mir)?|könntest du( mir)?)[\s,]+/i, "").trim();
  let m;
  // Natürliche Sätze auf Befehle zurückführen: "Kannst du mir Excel öffnen", "Ich brauche meinen Lebenslauf", "Discord starten"
  t = t.replace(/\s+(?:für mich|bitte|mal|doch|schnell|kurz|einfach|jetzt)\b/gi, "").replace(/^(?:würdest du|wuerdest du|kann(?:st)? du|könntest du|koenntest du)\s+(?:mir\s+)?/i, "").trim();
  if ((m = /^(?:ich\s+)?(?:brauche|bräuchte|will|möchte|moechte|hätte gern|haette gern)\s+(?:gerne?\s+)?(?:mal\s+)?(.+?)$/i.exec(t)) && !/\b(?:öffnen|starten|suchen|finden|sehen|wissen)$/i.test(m[1])
    && !/^(?:wissen|sehen|hören|dass|das du|dich|dir|eine? antwort|mehr|nicht|kein|was|wie|warum|wann|ob)\b/i.test(m[1]) && m[1].split(/\s+/).length <= 5) t = "öffne " + m[1];
  if ((m = /^(.+?)\s+(öffnen|oeffnen|starten|aufmachen|anmachen|laden|ausführen|spielen|zocken)$/i.exec(t)) && !/^(?:öffne|starte|such|find)/i.test(t)) t = "öffne " + m[1];
  else if ((m = /^(.+?)\s+(suchen|finden|raussuchen|heraussuchen)$/i.exec(t)) && !/^(?:such|find)/i.test(t)) t = "such " + m[1];
  else if ((m = /^(.+?)\s+(zeigen|anzeigen)$/i.exec(t)) && !/^zeig/i.test(t)) t = "zeig " + m[1];
  t = t.replace(/^(?:mir|uns)\s+/i, "").replace(/^(?:spiel(?:e)?|zock(?:e)?)\s+(?=\w)/i, "starte ");
  // "mach (mal) X auf" → "öffne X"
  if ((m = /^mach(?:e)?\s+(?:mal\s+)?(.+?)\s+(?:auf|an)$/i.exec(t))) t = "öffne " + m[1];
  // Füllwörter vorn weg: "Gut, finde mir …", "Und dann such einfach …"
  t = t.replace(/^(?:(?:gut|ok|okay|und|dann|also|jetzt|nun|so|ja|na|hey|mal|einfach|du)[\s,]+)+/i, "").trim();
  // Twitch wie YouTube: "Öffne Twitch", "Twitch shroud"
  if (/\btwitch\b/i.test(t) && !/\.(?:com|de|tv)\b/i.test(t)) {
    const q = t.replace(/\b(?:auf|in|bei|über|im|mit)\s+(?:dem\s+)?twitch(?:[\s-]*fenster)?\b/gi, " ").replace(/\btwitch(?:[\s-]*fenster)?\b/gi, " ")
      .replace(/^\s*(?:öffne|oeffne|starte|start|zeig(?:e)?(?:\s+mir)?|mach|such(?:e)?|spiel(?:e)?|schau(?:e)?|geh(?:e)?\s+(?:auf|zu))\w*\s*/i, " ").replace(/^\s*(?:mir\s+)?(?:mal\s+)?(?:den\s+)?(?:kanal\s+)?/i, "")
      .replace(/\s+(?:auf|an|ab|nach)\s*$/i, "").replace(/\s+/g, " ").trim();
    return { kind: "twitch", q };
  }
  // YouTube läuft im eigenen Argus-Fenster: "Öffne YouTube", "Spiel Lofi auf YouTube", "YouTube Antminer S21 Review"
  if (/\byou\s?tube\b/i.test(t) && !/\.(?:com|de)\b/i.test(t)) {
    const q = t.replace(/\b(?:auf|in|bei|über|im|mit)\s+(?:dem\s+)?you\s?tube(?:[\s-]*fenster)?\b/gi, " ").replace(/\byou\s?tube(?:[\s-]*fenster)?\b/gi, " ")
      .replace(/^\s*(?:öffne|oeffne|starte|start|zeig(?:e)?(?:\s+mir)?|mach|such(?:e)?|spiel(?:e)?|schau(?:e)?|geh(?:e)?\s+(?:auf|zu))\w*\s*/i, " ").replace(/^\s*(?:mir\s+)?(?:mal\s+)?(?:nach\s+)?/i, "")
      .replace(/\s+(?:auf|an|ab|nach)\s*$/i, "").replace(/\s+/g, " ").trim();
    return { kind: "youtube", q };
  }
  // Suche im Netz nur, wenn ausdrücklich gewünscht: "google X", "such im Internet nach X"
  const WEB = /\b(?:im\s+internet|im\s+netz|im\s+web|online|bei\s+google|googl\w*|im\s+browser)\b/i;
  if (/^(?:such|find|google|googel|recherchier|schau)\w*/i.test(t) && WEB.test(t))
    return { kind: "search", q: t.replace(/^(?:such|find|google|googel|recherchier|schau)\w*\s*/i, "").replace(WEB, " ").replace(/^\s*(?:mir\s+)?(?:mal\s+)?(?:nach\s+)?/i, "").replace(/\s+nach\s*$/i, "").replace(/\s+/g, " ").trim() };
  // "Öffne ihn/es/den Ordner": das zuletzt Gefundene
  if (/^(?:öffne|oeffne|zeig|mach)\w*\s+(?:mir\s+)?(?:ihn|es|sie|das|den|die|den\s+ordner|die\s+datei|das\s+ding)(?:\s+(?:auf|mal))?$/i.test(t)) return { kind: "openLast" };
  // Dateien und Ordner auf dem PC: such, finde, wo ist; optional "in C" / "auf Laufwerk D"
  if ((m = /^(?:such|find|wo\s+(?:ist|liegt|sind|liegen|steckt|finde\s+ich)|zeig\w*\s+mir\s+wo)\w*\s*(.*)$/i.exec(t))) {
    let q = m[1], drive = null, dm;
    if ((dm = /\b(?:auf|in|unter|im)\s+(?:dem\s+|der\s+)?(?:laufwerk\s+|platte\s+)?([c-z])(?::\\?|\b)(?:\s*(?:laufwerk|platte))?/i.exec(q))) { drive = dm[1].toUpperCase(); q = q.replace(dm[0], " "); }
    q = q.replace(/\b(?:auf|in|an)\s+(?:meinem|meinen|dem|den)\s+(?:pc|rechner|computer|laptop|festplatte)\b/gi, " ")
      .replace(/^\s*(?:mir|mal|einfach|bitte|für mich)\s+/gi, "").replace(/^\s*nach\s+/i, "")
      .replace(/\b(?:die|den|das|der|dem|meine?n?m?|eine?n?)\s+/gi, " ").replace(/\b(?:datei(?:en)?|ordner|verzeichnis|dokument(?:e)?|namens|mit dem namen|einfach|mal|mir|bitte)\b/gi, " ")
      .replace(/\s+/g, " ").trim();
    return { kind: "locate", q, drive, soft: !/^(?:such|find)/i.test(t) && !drive };
  }
  // Öffnen / Starten
  if (!(m = /^(?:öffne|oeffne|öffnen|starte|start|starten|geh(?:e)?\s+(?:auf|zu)|zeig(?:e)?(?:\s+mir)?|ruf(?:e)?|spiel(?:e)?)\s+(.+?)(?:\s+(?:auf|an|auf|starten|öffnen|aufrufen))?$/i.exec(t))) return null;
  let target = m[1].replace(/^(den|die|das|mir|mal|meinen|meine|mein)\s+/i, "").replace(/^(den|die|das)\s+/i, "");
  let via = null;
  if ((m = /^(.+?)\s+(?:in|mit|im|über)\s+(.+)$/i.exec(target))) { target = m[1]; via = m[2].replace(/^(dem|der|den)\s+/i, ""); }
  if ((m = new RegExp(`\\b((?:https?://)?(?:[a-z0-9-]+\\.)+(?:${TLD})(?:/\\S*)?)$`, "i").exec(target.replace(/\s+/g, ""))) && /\./.test(target))
    return { kind: "url", url: /^https?:/i.test(m[1]) ? m[1] : "https://" + m[1], via };
  const folder = FOLDERS[norm(target).replace(/^(ordner|verzeichnis)\s+/, "").replace(/\s+ordner$/, "")];
  if (folder) return { kind: "path", path: folder, label: target };
  if ((m = /^(?:datei|dokument|ordner)\s+(.+)$/i.exec(target))) return { kind: "file", q: m[1] };
  return { kind: "app", q: target, via };
}

// Führt einen erkannten Befehl aus. Gibt den Satz zurück, den Argus sagt, oder null, wenn es kein Befehl war.
async function run(text) {
  const c = parse(text);
  if (!c) return null;
  if (c.kind === "twitch") { if (!hooks.twitch) return null; hooks.twitch(c.q); return c.q ? `Ich öffne den Twitch-Kanal ${c.q}.` : "Twitch ist offen."; }
  if (c.kind === "youtube") { if (!hooks.youtube) return null; hooks.youtube(c.q); return c.q ? `Ich suche auf YouTube nach ${c.q}.` : "YouTube ist offen."; }
  if (c.kind === "search") { await shell.openExternal("https://www.google.com/search?q=" + encodeURIComponent(c.q)); return `Ich suche im Internet nach ${c.q}.`; }
  if (c.kind === "url") {
    const host = c.url.replace(/^https?:\/\//, "").split("/")[0];
    const b = c.via && findApp(c.via);
    if (b) { launchApp(b, c.url); return `Öffne ${host} in ${b.name}.`; }
    await shell.openExternal(c.url); return `Öffne ${host}.`;
  }
  if (c.kind === "path") { await shell.openPath(c.path); return `Öffne ${c.label}.`; }
  if (c.kind === "openLast") {
    if (!lastHits.length) return null;
    await openHit(lastHits[0]); return `Öffne ${path.basename(lastHits[0].replace(/[\\/]$/, ""))}.`;
  }
  if (c.kind === "locate") {
    if (!c.q && lastQuery) c.q = lastQuery; // "Such einfach in C" sucht das Letzte noch einmal, nur dort
    if (!c.q) return c.soft ? null : "Was soll ich suchen? Sag zum Beispiel: Such den Ordner Diablo.";
    lastQuery = c.q;
    let hits = [];
    for (const q of variants(c.q)) { hits = (await files.search(q, 40)).filter((h) => !c.drive || h.toUpperCase().startsWith(c.drive + ":")).slice(0, 5); if (hits.length) break; }
    const where = c.drive ? ` auf Laufwerk ${c.drive}` : " auf deinem PC";
    if (!hits.length && !c.drive) hits = (await files.searchContent(c.q, 5)).filter(Boolean);
    if (!hits.length) {
      if (c.soft) return null;
      return `Ich habe${where} nichts zu „${c.q}“ gefunden.` + (files.ready() ? " Sag „Such im Internet nach …“, wenn ich online suchen soll." : " Das Dateiverzeichnis aller Laufwerke wird gerade noch aufgebaut, bisher habe ich nur deinen Benutzerordner durchsucht. Frag in ein paar Minuten nochmal.");
    }
    lastHits = hits;
    await openHit(hits[0]);
    const best = hits[0].replace(/[\\/]$/, ""), isDir = /[\\/]$/.test(hits[0]);
    return `Gefunden${where}: ${best}. ` + (isDir ? "Ich habe den Ordner geöffnet." : "Ich habe den Ordner mit der Datei geöffnet.") +
      (hits.length > 1 ? ` Außerdem gefunden: ${hits.slice(1, 4).map((h) => path.basename(h.replace(/[\\/]$/, ""))).join(", ")}.` : "");
  }
  if (c.kind === "file") { const f = (await files.search(c.q, 1))[0]?.replace(/[\\/]$/, "") || findFile(c.q); if (!f) return `Ich finde keine Datei namens ${c.q}.`; await shell.openPath(f); return `Öffne ${path.basename(f)}.`; }
  if (!extraApps.length) await refreshExtra().catch(() => {});
  const a = findApp(c.q);
  if (a) { launchApp(a); return `Starte ${a.name}` + (a.kind ? ` (${a.kind})` : "") + "."; }
  // Kein Programm: im Dateiverzeichnis aller Laufwerke nach Ordner oder Datei mit dem Namen schauen
  const hit = (await files.search(c.q, 1))[0];
  if (hit) { lastHits = [hit]; await shell.openPath(hit.replace(/[\\/]$/, "")); return `Öffne ${hit.replace(/[\\/]$/, "")}.`; }
  const f = findFile(c.q);
  if (f) { await shell.openPath(f); return `Öffne ${path.basename(f)}.`; }
  const ws = (await files.searchContent(c.q, 1))[0];
  if (ws) { lastHits = [ws]; await shell.openPath(ws); return `Öffne ${path.basename(ws)} (über die Windows-Suche gefunden).`; }
  return `Ich finde weder ein Programm noch einen Ordner oder eine Datei namens „${c.q}“.` + (files.ready() ? "" : " Das Dateiverzeichnis wird gerade noch aufgebaut, frag in ein paar Minuten nochmal.");
}

const hooks = {};
module.exports = { run, parse, findApp, scanApps, hooks };
