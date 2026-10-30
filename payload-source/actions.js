// Aktionen: Programme, Webseiten, Ordner und Dokumente öffnen, wenn der Nutzer es sagt oder tippt.
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
// Spieleerkennung liest nur Dateien und Ordner, die die gemeinsame Schutzprüfung zulässt (0.58.21)
function readChecked(p) { const c = files.checkPath(p, { read: true }); if (!c.ok || c.st.isDirectory()) return null; try { return fs.readFileSync(c.real, "utf8"); } catch { return null; } }
function readJSON(p) { const s = readChecked(p); if (s === null) return null; try { return JSON.parse(s); } catch { return null; } }
function listChecked(dir, rx) { const r = files.walkRoot(dir); if (!r || !files.enterDir(r)) return []; try { return fs.readdirSync(r).filter((f) => rx.test(f)).map((f) => path.join(r, f)); } catch { return []; } }
function steamGames() {
  const out = [], roots = new Set();
  for (const base of [path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam")]) {
    const vdf = readChecked(path.join(base, "steamapps", "libraryfolders.vdf")); if (vdf === null) continue;
    roots.add(path.join(base, "steamapps"));
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) roots.add(path.join(m[1].replace(/\\\\/g, "\\"), "steamapps"));
  }
  for (const r of roots) {
    for (const file of listChecked(r, /^appmanifest_\d+\.acf$/)) {
      const t = readChecked(file); if (t === null) continue;
      const id = (/"appid"\s+"(\d+)"/.exec(t) || [])[1], name = (/"name"\s+"([^"]+)"/.exec(t) || [])[1];
      if (id && name && !/redistributable|steamworks|proton|runtime/i.test(name)) out.push({ name, uri: "steam://rungameid/" + id, kind: "Steam-Spiel" });
    }
  }
  return out;
}
function epicGames() {
  const dir = path.join(process.env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests"), out = [];
  for (const file of listChecked(dir, /\.item$/)) { const j = readJSON(file); if (j?.DisplayName && j.AppName) out.push({ name: j.DisplayName, uri: `com.epicgames.launcher://apps/${encodeURIComponent(j.AppName)}?action=launch&silent=true`, kind: "Epic-Spiel" }); }
  return out;
}
const isPackagedAppId = (id) => /^[A-Za-z0-9.-]+_[a-z0-9]{13}![A-Za-z0-9.-]+$/.test(String(id || ""));
// App-IDs aus der Startmenü-Liste nur, wenn sie zu einer Anwendung im Manifest eines installierten Pakets gehören (Get-AppxPackage)
// und keine Verknüpfung im Startmenü oder auf dem Desktop dieselbe ID trägt: auch eine Verknüpfung kann eine paketartige ID tragen.
// Gestartet werden nur App-IDs aus dieser geprüften Menge (0.58.21).
const verifiedAppIds = new Set();
const STORE_PS = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;$ok=@{};" +
  "foreach($p in Get-AppxPackage){try{$m=$p|Get-AppxPackageManifest;foreach($a in @($m.Package.Applications.Application)){if($a.Id){$ok[$p.PackageFamilyName+'!'+$a.Id]=1}}}catch{}};" +
  "@(Get-StartApps|Where-Object{$ok.ContainsKey([string]$_.AppID)})|ConvertTo-Json -Compress";
function storeApps() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", STORE_PS], { windowsHide: true, timeout: 60000, maxBuffer: 8 << 20 }, (err, out) => {
      verifiedAppIds.clear();
      if (err) return resolve([]);
      let l; try { l = JSON.parse(out || "[]"); } catch { return resolve([]); }
      const { claimed, complete } = shortcutAppIds();
      if (!complete) return resolve([]);
      const list = (Array.isArray(l) ? l : [l]).filter((x) => x?.Name && isPackagedAppId(x.AppID) && !claimed.has(String(x.AppID).toLowerCase()) && !/uninstall|deinstall|readme/i.test(x.Name));
      verifiedAppIds.clear(); for (const x of list) verifiedAppIds.add(String(x.AppID).toLowerCase());
      resolve(list.map((x) => ({ name: x.Name, appId: x.AppID })));
    });
  });
}
// App-IDs, die Verknüpfungen in Startmenü und Desktop tragen (shell.readShortcutLink: appUserModelId)
function shortcutAppIds() {
  const claimed = new Set();
  let complete = true;
  const walked = walkMenus((p) => {
    if (!/\.lnk$/i.test(p)) return;
    const c = files.checkPath(p, { read: true });
    if (!c.ok || c.st.isDirectory()) { complete = false; return; }
    try { const id = shell.readShortcutLink(c.real).appUserModelId; if (id) claimed.add(String(id).toLowerCase()); }
    catch { complete = false; }
  });
  return { claimed, complete: complete && walked };
}
// Begrenzte Suche: jede ausgelassene Stelle macht die App-ID-Kollisionspruefung unvollstaendig.
function walkMenus(fn) {
  let complete = true;
  const walk = (dir, depth) => {
    if (!files.enterDir(dir)) { complete = false; return; }
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { complete = false; return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (files.isSvPath(p)) { complete = false; continue; }
      if (e.isDirectory()) {
        if (depth < 3) walk(p, depth + 1); else complete = false;
      } else if (e.isSymbolicLink()) { complete = false; }
      else fn(p, e);
    }
  };
  START_MENUS.forEach((d) => {
    // Nicht vorhandene Standardordner enthalten keine Kollision; andere Fehler bleiben unklar.
    try { fs.lstatSync(d); } catch (e) { if (e.code !== 'ENOENT') complete = false; return; }
    const r = files.walkRoot(d); if (r) walk(r, 0); else complete = false;
  });
  return complete;
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
  walkMenus((p, e) => {
    if (!/\.(lnk|url|exe)$/i.test(e.name) || /uninstall|deinstall|readme|hilfe|help/i.test(e.name)) return;
    const name = e.name.replace(/\.(lnk|url|exe)$/i, "");
    if (!found.has(norm(name))) found.set(norm(name), { name, path: p });
  });
  // Eingebaute Windows-Programme, die nicht als Verknüpfung auftauchen
  const win = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  for (const [name, cmd] of [["Datei-Explorer", path.join(win, "explorer.exe")], ["Rechner", path.join(win, "System32", "calc.exe")], ["Editor", path.join(win, "System32", "notepad.exe")], ["Task-Manager", path.join(win, "System32", "Taskmgr.exe")], ["Einstellungen", "ms-settings:"]])
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
    if (score > bestScore && (!a.path || launchCheck(a.path).ok)) { bestScore = score; best = a; } // nicht prüfbare Verknüpfungen überspringen (0.58.21)
  }
  return bestScore > 15 ? best : null;
}
// Startet ein Programm. Gibt null zurück, wenn gestartet wurde, sonst den Ablehnungssatz. Programme aus Pfaden (Startmenü, Desktop)
// laufen durch launchCheck; gestartet wird das geprüfte Ziel selbst, nicht die Verknüpfung (0.58.21).
function launchApp(a, arg) {
  if (a.uri) { shell.openExternal(a.uri); return null; } // von Argus selbst erzeugte Spiele-Adressen (Steam, Epic, Battle.net)
  if (a.appId) { if (!isPackagedAppId(a.appId) || !verifiedAppIds.has(String(a.appId).toLowerCase())) return DENIED(a.name || "Programm", "unklar"); spawn(path.join(process.env.SystemRoot || process.env.windir || "C:\\Windows", "explorer.exe"), ["shell:AppsFolder\\" + a.appId], { detached: true, stdio: "ignore" }).unref(); return null; }
  if (a.cmd) {
    if (a.cmd === "ms-settings:") { shell.openExternal(a.cmd); return null; }
    const c = files.checkPath(a.cmd, { read: true }); // eingebaute Programme: absoluter Pfad im Windows-Ordner, geprüft
    if (!c.ok || !/\.exe$/i.test(c.real)) return DENIED(a.cmd, c.ok ? "unklar" : c.why);
    spawn(c.real, arg ? [arg] : [], { detached: true, stdio: "ignore" }).unref(); return null;
  }
  const ck = launchCheck(a.path);
  if (!ck.ok) return DENIED(a.path, ck.why);
  if (ck.url) { shell.openExternal(ck.url); return null; }
  spawn(ck.exe, [...ck.args, ...(arg ? [arg] : [])], { detached: true, stdio: "ignore", cwd: ck.cwd }).unref();
  return null;
}

// ---------- Dokumente suchen (Dokumente, Desktop, Downloads, max. 3 Ebenen tief) ----------
function findFile(spoken) {
  const q = norm(spoken);
  if (q.length < 3) return null;
  let best = null, bestScore = 0, seen = 0;
  const walk = (dir, depth) => {
    if (!files.enterDir(dir)) return; // jeder Ordner direkt vor dem Lesen geprüft (0.58.21)
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > 20000) return;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (files.isSvPath(p)) continue; // Daten der abgeschalteten Selbstverbesserung weder finden noch öffnen (0.58.20)
      const n = norm(e.name.replace(/\.[^.]+$/, ""));
      const score = n === q ? 100 : n.startsWith(q) ? 80 : n.includes(q) ? 60 : 0;
      if (score > bestScore) { bestScore = score; best = p; }
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
    }
  };
  for (const d of [FOLDERS.dokumente, FOLDERS.desktop, FOLDERS.downloads]) { const r = files.walkRoot(d); if (r) walk(r, 0); }
  return best;
}

// ---------- Öffnen und Starten nur nach der gemeinsamen Schutzprüfung (0.58.21) ----------
// Strikte Positivregeln statt Ausnahmen. Geprüft wird immer das tatsächliche Ziel (files.checkPath mit read: Dateien mit mehreren
// harten Verknüpfungen werden abgelehnt), ausgeführt wird nur das geprüfte Ziel selbst, nie eine Datei, die Windows weiter auflöst.
// Öffnen (Dateien und Ordner aus Suche, Sprachbefehlen, KI-Werkzeugen): Ordner und nur Dateitypen aus OPENABLE (Dokumente, Bilder,
//   Audio, Video, Archive). Programme, Skripte, Verknüpfungsdateien und unbekannte Typen nicht, weil ihr Standardprogramm sie weiter
//   auflösen oder ausführen könnte. .url nur mit http/https, dann wird die Adresse geöffnet, nicht die Datei.
// Programmstart (Startmenü, Desktop): .exe direkt; .lnk nur auf eine vorhandene .exe und ohne Argumente, Arbeitsordner geprüft; .url nur mit http/https oder einem Spiele-Launcher-Schema.
const RUNNABLE = /\.(exe|com|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|wsf|wsh|ws|hta|msi|msp|mst|scr|cpl|jar|reg|inf|sct|msc|rdp|application|appref-ms|xbap|gadget|lnk|pif|scf|url|website|library-ms|search-ms|searchconnector-ms|settingcontent-ms|desklink)$/i;
const OPENABLE = /\.(txt|md|csv|tsv|log|json|pdf|rtf|odt|ods|odp|doc|docx|xls|xlsx|ppt|pptx|png|jpe?g|gif|bmp|webp|tiff?|heic|ico|mp3|wav|flac|ogg|m4a|aac|wma|mp4|mkv|avi|mov|wmv|webm|m4v|zip|7z|rar|tar|gz|epub|srt)$/i;
const WEB = /^https?:\/\/[^\s]+$/i, GAME = /^(steam|com\.epicgames\.launcher|battlenet):\/\/[^\s"]+$/i;

const expandEnv = (s) => String(s || "").replace(/%([^%]+)%/g, (m, n) => process.env[n] ?? m);
const DENY = (why) => ({ ok: false, why });
function urlOf(file) { try { return ((/^\s*URL\s*=\s*(\S+?)\s*$/im.exec(fs.readFileSync(file, "utf8")) || [])[1]) || ""; } catch { return ""; } }
// Was öffnen? Ergebnis { ok, real, st, url? } oder { ok: false, why }
function openCheck(p, how = "open") {
  const c = files.checkPath(String(p || "").replace(/[\\/]$/, ""), { read: true });
  if (!c.ok || c.st.isDirectory() || how === "show") return c; // markiert anzeigen führt nichts aus
  if (/\.url$/i.test(c.real)) { const u = urlOf(c.real); return WEB.test(u) ? { ...c, url: u } : DENY("unklar"); }
  if (RUNNABLE.test(c.real) || !OPENABLE.test(c.real)) return DENY("programm");
  return c;
}
// Wie starten? Ergebnis { ok, exe, args, cwd } bzw. { ok, url } oder { ok: false, why }
function launchCheck(p) {
  const c = files.checkPath(p, { read: true });
  if (!c.ok) return c;
  if (c.st.isDirectory()) return DENY("unklar");
  if (/\.exe$/i.test(c.real)) return { ok: true, exe: c.real, args: [], cwd: path.dirname(c.real) };
  if (/\.url$/i.test(c.real)) { const u = urlOf(c.real); return WEB.test(u) || GAME.test(u) ? { ok: true, url: u } : DENY("unklar"); }
  if (!/\.lnk$/i.test(c.real)) return DENY("unklar");
  let t; try { t = shell.readShortcutLink(c.real); } catch { return DENY("unklar"); }
  if (!t || !t.target) return DENY("unklar"); // Ziel nicht feststellbar (z. B. Installer-Verknüpfungen): nicht über diesen Weg
  const tc = files.checkPath(expandEnv(t.target), { read: true });
  if (!tc.ok) return tc;
  if (tc.st.isDirectory() || !/\.exe$/i.test(tc.real)) return DENY("unklar");
  // Argumente werden nicht übernommen: ihre Bedeutung hängt vom Programm ab und kann ungeprüfte Dateien auswählen (0.58.21)
  if (String(t.args || "").trim()) return DENY("unklar");
  let cwd = path.dirname(tc.real);
  if (t.cwd) { const cc = files.checkPath(expandEnv(t.cwd)); if (!cc.ok || !cc.st.isDirectory()) return DENY("unklar"); cwd = cc.real; }
  return { ok: true, exe: tc.real, args: [], cwd };
}
const DENIED = (p, why) => `${path.basename(String(p).replace(/[\\/]$/, "")) || p} öffne ich nicht: ` +
  (why === "gesperrt" ? "Das gehört zu Argus' eigenen Daten." : why === "fehlt" ? "Das gibt es nicht." :
    why === "programm" ? "Programme, Verknüpfungen und unbekannte Dateitypen öffne ich nicht direkt (Programme starte ich über ihren Namen)." : "Der Pfad lässt sich nicht sicher zuordnen.");
// how: "open" öffnet, "show" zeigt eine Datei markiert im Ordner. Gibt null zurück, wenn geöffnet wurde, sonst den Ablehnungssatz.
async function openGuarded(p, how = "open") {
  const c = openCheck(p, how);
  if (!c.ok) return DENIED(p, c.why);
  if (c.url) await shell.openExternal(c.url);
  else if (how === "show" && !c.st.isDirectory()) shell.showItemInFolder(c.real);
  else await shell.openPath(c.real);
  return null;
}

// ---------- Gefundenes merken und öffnen ----------
let lastHits = [], lastQuery = "";
// Ordner direkt öffnen, bei Dateien den Ordner mit markierter Datei
async function openHit(p) {
  return openGuarded(p, /[\\/]$/.test(p) ? "open" : "show");
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
    if (b) return launchApp(b, c.url) || `Öffne ${host} in ${b.name}.`;
    await shell.openExternal(c.url); return `Öffne ${host}.`;
  }
  if (c.kind === "path") { return (await openGuarded(c.path)) || `Öffne ${c.label}.`; }
  if (c.kind === "openLast") {
    if (!lastHits.length) return null;
    return (await openHit(lastHits[0])) || `Öffne ${path.basename(lastHits[0].replace(/[\\/]$/, ""))}.`;
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
    const denied = await openHit(hits[0]); if (denied) return denied;
    const best = hits[0].replace(/[\\/]$/, ""), isDir = /[\\/]$/.test(hits[0]);
    return `Gefunden${where}: ${best}. ` + (isDir ? "Ich habe den Ordner geöffnet." : "Ich habe den Ordner mit der Datei geöffnet.") +
      (hits.length > 1 ? ` Außerdem gefunden: ${hits.slice(1, 4).map((h) => path.basename(h.replace(/[\\/]$/, ""))).join(", ")}.` : "");
  }
  if (c.kind === "file") { const f = (await files.search(c.q, 1))[0]?.replace(/[\\/]$/, "") || findFile(c.q); if (!f) return `Ich finde keine Datei namens ${c.q}.`; return (await openGuarded(f)) || `Öffne ${path.basename(f)}.`; }
  if (!extraApps.length) await refreshExtra().catch(() => {});
  const a = findApp(c.q);
  if (a) return launchApp(a) || `Starte ${a.name}` + (a.kind ? ` (${a.kind})` : "") + ".";
  // Kein Programm: im Dateiverzeichnis aller Laufwerke nach Ordner oder Datei mit dem Namen schauen
  const hit = (await files.search(c.q, 1))[0];
  if (hit) { lastHits = [hit]; return (await openGuarded(hit)) || `Öffne ${hit.replace(/[\\/]$/, "")}.`; }
  const f = findFile(c.q);
  if (f) return (await openGuarded(f)) || `Öffne ${path.basename(f)}.`;
  const ws = (await files.searchContent(c.q, 1))[0];
  if (ws) { lastHits = [ws]; return (await openGuarded(ws)) || `Öffne ${path.basename(ws)} (über die Windows-Suche gefunden).`; }
  return `Ich finde weder ein Programm noch einen Ordner oder eine Datei namens „${c.q}“.` + (files.ready() ? "" : " Das Dateiverzeichnis wird gerade noch aufgebaut, frag in ein paar Minuten nochmal.");
}

const hooks = {};
module.exports = { run, parse, findApp, scanApps, hooks, openGuarded, _launchApp: launchApp, _steamGames: steamGames, _epicGames: epicGames, _isPackagedAppId: isPackagedAppId, _storeApps: storeApps }; // _…: nur für Tests
