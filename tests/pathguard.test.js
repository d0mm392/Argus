// Tests für die gemeinsame Schutzprüfung (0.58.21): files.checkPath, files.read/list, Suche, actions.openGuarded, MCP-Server.
// Ausschließlich künstliche Daten in einem eigenen Testordner. Aufruf: node --test tests/pathguard.test.js
// Fälle, die die Umgebung nicht hergibt (symbolische Links ohne Rechte, 8.3-Namen abgeschaltet, subst ohne ARGUS_TEST_SUBST=1),
// werden als "NICHT AUSGEFÜHRT" ausgegeben und zählen nicht als bestanden.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), Module = require("module");

const REPO = path.resolve(__dirname, "..");
const BASE = process.env.ARGUS_TEST_ROOT || path.join(os.tmpdir(), "argus-pathguard");
fs.mkdirSync(BASE, { recursive: true });
const T = fs.mkdtempSync(path.join(BASE, "pg-"));
const HOME = path.join(T, "home"), APPDATA = path.join(HOME, "AppData", "Roaming"), LOCAL = path.join(HOME, "AppData", "Local");
const PROF = path.join(APPDATA, "argus-desktop"), DOCS = path.join(HOME, "Documents");
Object.assign(process.env, { ProgramData: path.join(T, "programdata"), ProgramFiles: path.join(T, "pf"), "ProgramFiles(x86)": path.join(T, "pf86"), PUBLIC: path.join(T, "public"), USERPROFILE: HOME, HOME, APPDATA, LOCALAPPDATA: LOCAL, JARVIS_INDEX: path.join(T, "index", "dateiindex.txt"), JARVIS_MEMORY: path.join(T, "memory"), ARGUS_USERDATA: PROF });
const put = (p, s = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// Künstliche Testdaten
put(path.join(PROF, "notiz.txt"), "PROFIL"); put(path.join(PROF, "argus-config.json"), '{"kuenstlich":true}');
put(path.join(PROF, "backups", "1", "main.js"), "SICHERUNG"); put(path.join(PROF, "selfimprove-stage", "a.js"), "STAGE");
put(path.join(APPDATA, "jarvis-desktop", "j.txt"), "JPROFIL"); put(path.join(DOCS, "selfimprove-stage", "s.txt"), "SVDOK");
put(path.join(DOCS, "normal.txt"), "NORMAL"); put(path.join(DOCS, "Jarvis", "projekt.txt"), "PROJEKT"); put(path.join(DOCS, "argus-notizen.txt"), "ARGUSNAME");
fs.mkdirSync(path.join(T, "memory"), { recursive: true });

// Vorab (vor dem Wächter): Kurznamen über cmd ermitteln, sofern 8.3-Namen auf diesem Laufwerk erzeugt werden
const shortName = (p) => { try { return cp.execFileSync("cmd.exe", ["/d /s /c \"for %I in (\"" + p + "\") do @echo %~sI\""], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true }).trim(); } catch { return null; } };
const SHORT_PROF = shortName(PROF), SHORT_NOTIZ = shortName(path.join(PROF, "notiz.txt"));
const shortAvailable = !!(SHORT_PROF && SHORT_PROF.toLowerCase() !== PROF.toLowerCase()); // irgendein Pfadteil hat einen Kurznamen
const shortOwn = shortAvailable && !/argus-desktop/i.test(SHORT_PROF); // auch der geschützte Ordner selbst

// ---------- Wächter: Schreiben nur im Testordner, Lesen nur im Testordner/Repo (protokolliert, am Ende geprüft) ----------
const violations = [];
let testSubstDrive = null;
const inside = (p, root) => {
  // Ausschliesslich die vorab angelegten Test-Aliase dem kuenstlichen Profil zuordnen.
  const raw = String(p), low = raw.toLowerCase();
  if (SHORT_PROF && (low === SHORT_PROF.toLowerCase() || low.startsWith(SHORT_PROF.toLowerCase() + path.sep))) p = PROF + raw.slice(SHORT_PROF.length);
  if (testSubstDrive && low.startsWith(testSubstDrive.toLowerCase() + "\\")) p = path.join(PROF, raw.slice(3));
  const r = path.resolve(String(p)).toLowerCase(), b = path.resolve(root).toLowerCase(); return r === b || r.startsWith(b + path.sep); };
const strip = (p) => String(p).replace(/^\\\\\?\\/, "");
for (const name of ["writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "rmSync", "unlinkSync", "copyFileSync", "cpSync", "symlinkSync", "linkSync", "createWriteStream"]) {
  const orig = fs[name]; fs[name] = function (...a) { const p = name === "symlinkSync" ? a[1] : a[0]; if (typeof p === "string" && !inside(p, T)) violations.push(name + " " + p); return orig.apply(this, a); };
}
for (const name of ["readFileSync", "readdirSync", "statSync", "lstatSync", "openSync", "realpathSync", "existsSync", "createReadStream"]) {
  const orig = fs[name], wrap = (n, o) => function (...a) { const p = strip(a[0]); if (typeof a[0] === "string" && /^[a-z]:/i.test(p) && !inside(p, T) && !inside(p, REPO)) violations.push(n + " " + p); return o.apply(this, a); };
  fs[name] = wrap(name, orig); if (orig.native) fs[name].native = wrap(name + ".native", orig.native);
}
const dirReads = []; // jedes gelesene Verzeichnis (readdirSync/opendir), für den Nachweis, dass geschützte Ordner nie durchlaufen werden
{ const r = fs.readdirSync; fs.readdirSync = function (p, ...a) { dirReads.push(String(p)); return r.call(this, p, ...a); }; const od = fs.promises.opendir; fs.promises.opendir = function (p, ...a) { dirReads.push(String(p)); return od.call(this, p, ...a); }; }
const fileReads = []; { const rf = fs.readFileSync; fs.readFileSync = function (p, ...a) { fileReads.push(String(p)); return rf.call(this, p, ...a); }; }
const notRun = [];
const skip = (t, id, why) => { notRun.push(`${id}: ${why}`); process.stdout.write(`# NICHT AUSGEFÜHRT ${id}: ${why}\n`); t.skip("NICHT AUSGEFÜHRT: " + why); };

// Electron-Attrappe für actions.js
const shortcutReads = [];
const shellCalls = [], spawnCalls = [], argsOf = {}, cwdOf = {}, aumidOf = {}; let shortcutTargets = {};
{ const realSpawn = cp.spawn; cp.spawn = function (cmd, args, ...r) { if (String(cmd) === process.execPath) return realSpawn.call(this, cmd, args, ...r); spawnCalls.push([cmd, args]); return { unref() {} }; }; } // nur der MCP-Test startet echte Prozesse
const electronMock = { shell: { openPath: async (p) => { shellCalls.push(["openPath", p]); return ""; }, showItemInFolder: (p) => shellCalls.push(["showItemInFolder", p]), openExternal: async (u) => shellCalls.push(["openExternal", u]),
  readShortcutLink: (p) => { shortcutReads.push(p); const k = path.resolve(p).toLowerCase(); if (!(k in shortcutTargets)) throw new Error("keine Verknüpfung"); return { target: shortcutTargets[k], args: argsOf[k] || "", cwd: cwdOf[k] || "", appUserModelId: aumidOf[k] || "" }; } } };
const origLoad = Module._load; Module._load = function (req, ...r) { return req === "electron" ? electronMock : origLoad.call(this, req, ...r); };
const realExecFile = cp.execFile; let execHook = null, startAppsJson = "[]";
cp.execFile = function (cmd, args, opts, cb) { if (Array.isArray(args) && args.some((x) => String(x).includes("Get-StartApps"))) { const done = typeof opts === "function" ? opts : cb; setImmediate(() => done(null, startAppsJson, "")); return {}; } if (execHook) return execHook(cmd, args, opts, cb); return realExecFile.apply(this, arguments); };
const F = require(path.join(REPO, "files.js")), A = require(path.join(REPO, "actions.js"));
const blocked = (r) => /ist gesperrt|Sonder- oder Netzpfad|nicht sicher zuordnen|gibt es nicht/.test(r);

// ===================== P1 direkter und alternativer Zugriff =====================
test("P1 direkte und alternative Schreibweisen geschützter Pfade werden abgelehnt", () => {
  const n = path.join(PROF, "notiz.txt"), rel = path.relative(process.cwd(), n);
  const cases = [n, PROF, n.toUpperCase(), n.replace(/\\/g, "/"), path.join(APPDATA, ".", "argus-desktop", "notiz.txt"), path.join(APPDATA, "x", "..", "argus-desktop", "notiz.txt"),
    rel, "\\\\?\\" + n, path.join(APPDATA, "argus-desktop.", "notiz.txt"), path.join(APPDATA, "argus-desktop ", "notiz.txt"), path.join(APPDATA, "jarvis-desktop", "j.txt"),
    path.join(PROF, "backups", "1", "main.js"), path.join(PROF, "argus-config.json"), path.join(DOCS, "selfimprove-stage", "s.txt")];
  for (const p of cases) { assert.ok(blocked(F.read(p)), "read " + p); assert.equal(F.checkPath(p).ok, false, "check " + p); }
  for (const p of [PROF, PROF + "\\", "\\\\?\\" + PROF]) assert.ok(blocked(F.list(p)), "list " + p);
  // Relativ zu einem anderen Arbeitsordner
  const cwd = process.cwd(); try { process.chdir(DOCS); assert.ok(blocked(F.read("..\\AppData\\Roaming\\argus-desktop\\notiz.txt"))); assert.ok(blocked(F.read("..\\AppData\\Roaming\\ARGUS-DESKTOP\\notiz.txt"))); } finally { process.chdir(cwd); }
});

test("P2 Windows-Sonderpfade, Netzpfade und alternative Datenströme werden abgelehnt", () => {
  const n = path.join(PROF, "notiz.txt"), drive = n.slice(0, 1), rest = n.slice(3);
  for (const p of ["\\\\.\\" + n, "\\??\\" + n, `\\\\localhost\\${drive}$\\${rest}`, `\\\\127.0.0.1\\${drive}$\\${rest}`, "\\\\?\\UNC\\localhost\\" + drive + "$\\" + rest,
    "\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy1\\" + rest, "\\\\?\\Volume{00000000-0000-0000-0000-000000000000}\\" + rest, path.join(DOCS, "normal.txt") + "::$DATA", path.join(DOCS, "normal.txt") + ":Zone.Identifier", n + "::$DATA", "//localhost/" + drive + "$/" + rest.replace(/\\/g, "/")]) {
    const c = F.checkPath(p); assert.equal(c.ok, false, p); assert.ok(blocked(F.read(p)), p);
  }
});

test("P3 8.3-Kurznamen in Elternordnern (geschützter Name bleibt lang)", (t) => {
  if (!shortAvailable) return skip(t, "P3", "auf diesem Laufwerk werden keine 8.3-Kurznamen erzeugt (" + (SHORT_PROF || "kein Ergebnis") + ")");
  assert.ok(blocked(F.read(path.join(SHORT_PROF, "notiz.txt"))), SHORT_PROF); assert.ok(blocked(F.list(SHORT_PROF)));
  if (SHORT_NOTIZ) assert.ok(blocked(F.read(SHORT_NOTIZ)));
  process.stdout.write(`# P3 Pfad mit Kurznamen geprüft: ${SHORT_PROF} (der Name argus-desktop selbst ist darin lang und würde auch ohne Auflösung erkannt)\n`);
});
test("P3b 8.3-Kurzname des geschützten Ordners selbst (nur über die tatsächliche Auflösung erkennbar)", (t) => {
  if (!shortOwn) return skip(t, "P3b", "für den geschützten Testordner wurde kein 8.3-Kurzname erzeugt (" + (SHORT_PROF || "kein Ergebnis") + ")");
  assert.ok(!/argus-desktop/i.test(SHORT_PROF)); assert.ok(blocked(F.read(path.join(SHORT_PROF, "notiz.txt"))), SHORT_PROF); assert.ok(blocked(F.list(SHORT_PROF)));
  process.stdout.write(`# P3b Kurzname des geschützten Ordners geprüft: ${SHORT_PROF}\n`);
});

// ===================== P4 Junctions, symbolische Links, harte Verknüpfungen =====================
test("P4 Junctions auf geschützte Ordner und verkettete Junctions", () => {
  const j1 = path.join(DOCS, "harmlos"); fs.symlinkSync(PROF, j1, "junction");
  const j2 = path.join(DOCS, "appdata-alias"); fs.symlinkSync(APPDATA, j2, "junction"); // Junction auf den Elternordner
  const j3 = path.join(DOCS, "kette"); fs.symlinkSync(j1, j3, "junction"); // Junction auf eine Junction
  const j4 = path.join(DOCS, "sv-alias"); fs.symlinkSync(path.join(DOCS, "selfimprove-stage"), j4, "junction");
  for (const p of [path.join(j1, "notiz.txt"), j1, path.join(j2, "argus-desktop", "notiz.txt"), path.join(j2, "jarvis-desktop", "j.txt"), path.join(j3, "notiz.txt"), path.join(j4, "s.txt"), path.join(j1, "backups", "1", "main.js")])
    assert.ok(blocked(F.read(p)), p);
  assert.ok(blocked(F.list(j1))); assert.ok(blocked(F.list(path.join(j2, "argus-desktop"))));
  // Junction auf einen normalen Ordner bleibt nutzbar
  const ok = path.join(DOCS, "projekt-link"); fs.symlinkSync(path.join(DOCS, "Jarvis"), ok, "junction"); assert.equal(F.read(path.join(ok, "projekt.txt")), "PROJEKT");
  // Verwaiste Junction: Ziel fehlt -> abgelehnt
  const tmpTarget = path.join(T, "weg"); fs.mkdirSync(tmpTarget); const dang = path.join(DOCS, "verwaist"); fs.symlinkSync(tmpTarget, dang, "junction"); fs.rmdirSync(tmpTarget);
  assert.equal(F.checkPath(path.join(dang, "x.txt")).ok, false);
});

test("P5 symbolische Links (Datei und Ordner)", (t) => {
  const sd = path.join(DOCS, "sym-ordner"), sf = path.join(DOCS, "sym-datei.txt");
  try { fs.symlinkSync(PROF, sd, "dir"); } catch (e) { return skip(t, "P5", "symbolische Links nicht erlaubt (" + e.code + "; Entwicklermodus oder Adminrechte nötig)"); }
  fs.symlinkSync(path.join(PROF, "notiz.txt"), sf, "file");
  assert.ok(blocked(F.read(path.join(sd, "notiz.txt")))); assert.ok(blocked(F.read(sf))); assert.ok(blocked(F.list(sd)));
  const rel = path.join(DOCS, "sym-relativ"); fs.symlinkSync("..\\AppData\\Roaming\\argus-desktop", rel, "dir"); assert.ok(blocked(F.read(path.join(rel, "notiz.txt"))));
});

test("P6 harte Verknüpfungen: weder gelesen noch geöffnet oder gestartet", async (t) => {
  const hl = path.join(DOCS, "kopie-notiz.txt");
  try { fs.linkSync(path.join(PROF, "notiz.txt"), hl); } catch (e) { return skip(t, "P6", "harte Verknüpfung nicht möglich (" + e.code + ")"); }
  assert.ok(blocked(F.read(hl)), "Hardlink auf Profildatei");
  assert.equal(F.checkPath(hl, { read: true }).ok, false);
  shellCalls.length = 0; assert.match(await A.openGuarded(hl), /öffne ich nicht/); assert.match(await A.openGuarded(hl, "show"), /öffne ich nicht/); assert.deepEqual(shellCalls, []);
  // Programmstart: harte Verknüpfung außerhalb von Program Files/Windows wird nicht gestartet
  const exe = path.join(DOCS, "werkzeug.exe"); fs.linkSync(path.join(PROF, "notiz.txt"), exe);
  assert.ok(/öffne ich nicht/.test(A._launchApp({ name: "werkzeug", path: exe }) || ""), "Start einer harten Verknüpfung abgelehnt"); assert.deepEqual(shellCalls, []);
  // Bekannte Grenze: eine normale Datei mit zweitem Namen ist ebenfalls nicht lesbar (Fehlalarm, dokumentiert)
  const a = path.join(DOCS, "zwei-namen.txt"), b = path.join(DOCS, "zwei-namen-2.txt"); put(a, "ZWEI"); fs.linkSync(a, b); assert.ok(blocked(F.read(a)));
});

// ===================== P7 erlaubte Zugriffe =====================
test("P7 normale Dateien und Ordner bleiben lesbar", () => {
  assert.equal(F.read(path.join(DOCS, "normal.txt")), "NORMAL"); assert.equal(F.read(path.join(DOCS, "Jarvis", "projekt.txt")), "PROJEKT");
  assert.equal(F.read(path.join(DOCS, "argus-notizen.txt")), "ARGUSNAME"); assert.equal(F.read("\\\\?\\" + path.join(DOCS, "normal.txt")), "NORMAL");
  assert.equal(F.read(path.join(DOCS, "normal.txt").replace(/\\/g, "/")), "NORMAL");
  const l = F.list(DOCS); assert.match(l, /normal\.txt/); assert.match(l, /Jarvis/);
  assert.match(l, /^harmlos \(Verknüpfung\)$/m, "Junction wird als Verknüpfung gelistet, ohne Angaben ihres Ziels");
  assert.match(F.read(path.join(DOCS, "fehlt.txt")), /gibt es nicht/);
  put(path.join(APPDATA, "NormalesProgramm", "x.txt")); const la = F.list(APPDATA); assert.match(la, /NormalesProgramm/); assert.doesNotMatch(la, /argus-desktop|jarvis-desktop/, "geschützte Einträge nicht aufgeführt");
  assert.doesNotMatch(l, /kopie-notiz|zwei-namen/, "Dateien mit mehreren harten Verknüpfungen nicht aufgeführt");
});

test("P8 eigener Datenordner über ARGUS_USERDATA ist geschützt", () => {
  const ud = path.join(HOME, "anderer-datenordner"); put(path.join(ud, "x.txt"), "UD");
  const prev = process.env.ARGUS_USERDATA; process.env.ARGUS_USERDATA = ud;
  try { assert.ok(blocked(F.read(path.join(ud, "x.txt")))); const j = path.join(DOCS, "ud-alias"); fs.symlinkSync(ud, j, "junction"); assert.ok(blocked(F.read(path.join(j, "x.txt")))); }
  finally { process.env.ARGUS_USERDATA = prev; }
  assert.equal(F.read(path.join(ud, "x.txt")), "UD", "ohne die Angabe ist der Ordner ein normaler Ordner");
});

// Verzeichnis gehört zu einem geschützten Ordner oder ist (über) eine Junction erreicht
const protEnum = (d) => /argus-desktop|jarvis-desktop|selfimprove-stage|[\\/](harmlos|appdata-alias|kette|sv-alias|projekt-link|verwaist|ud-alias|sym-ordner|sym-relativ)([\\/]|$)/i.test(d);
// ===================== P9 Suche =====================
test("P9 Suche: Index, Schnellsuche und Windows-Suche liefern keine geschützten Ziele", async (t) => {
  fs.rmSync(path.dirname(process.env.JARVIS_INDEX), { recursive: true, force: true });
  // Schnellsuche (ohne Index): betritt keine Junctions, kein Profil
  const d0 = dirReads.length; const q1 = await F.search("notiz", 50);
  assert.deepEqual(dirReads.slice(d0).filter(protEnum), [], "Schnellsuche liest kein geschütztes oder verknüpftes Verzeichnis"); assert.ok(!q1.some((p) => /argus-desktop|harmlos|kette|appdata-alias/i.test(p)), JSON.stringify(q1)); assert.ok(q1.some((p) => /argus-notizen\.txt$/.test(p)));
  // Index bauen (nur Benutzerordner simulieren: roots() liefert unter Windows alle Laufwerke, daher hier nur der Inhalt eines alten Index)
  const alias = path.join(DOCS, "harmlos");
  put(process.env.JARVIS_INDEX, [path.join(PROF, "notiz.txt"), path.join(alias, "notiz.txt"), path.join(DOCS, "appdata-alias", "argus-desktop", "notiz.txt"), path.join(DOCS, "argus-notizen.txt"), path.join(DOCS, "kopie-notiz.txt")].join("\n") + "\n");
  const q2 = await F.search("notiz", 50); assert.deepEqual(q2, [path.join(DOCS, "argus-notizen.txt")], "auch der Hardlink-Alias kopie-notiz.txt fehlt: " + JSON.stringify(q2));
  // Windows-Suche: Ergebnis wird gefiltert (Attrappe statt PowerShell)
  execHook = (cmd, args, opts, cb) => { setImmediate(() => cb(null, [path.join(alias, "notiz.txt"), path.join(PROF, "notiz.txt"), "\\\\localhost\\c$\\x.txt", path.join(DOCS, "normal.txt")].join("\r\n"))); return {}; };
  try { const F2 = (delete require.cache[require.resolve(path.join(REPO, "files.js"))], require(path.join(REPO, "files.js")));
    if (process.platform === "win32") assert.deepEqual(await F2.searchContent("notiz", 10), [path.join(DOCS, "normal.txt")]); else skip(t, "P9b", "nur Windows"); }
  finally { execHook = null; }
});

test("P10 Indexbau betritt weder Junctions noch geschützte Ordner", async () => {
  // build() durchsucht roots(); für einen begrenzten Lauf wird roots auf den Testordner umgelenkt
  const src = fs.readFileSync(path.join(REPO, "files.js"), "utf8").replace("function roots() {", "function roots() { if (process.env.PG_ROOT) return [process.env.PG_ROOT];");
  const m = new Module(path.join(REPO, "files-pg.js")); m.paths = Module._nodeModulePaths(REPO); m._compile(src, path.join(REPO, "files-pg.js"));
  const d0 = dirReads.length; process.env.PG_ROOT = HOME; try { const n = await m.exports.build({ force: true }); assert.ok(n > 0); } finally { delete process.env.PG_ROOT; }
  assert.deepEqual(dirReads.slice(d0).filter(protEnum), [], "Indexbau liest kein geschütztes oder verknüpftes Verzeichnis"); assert.ok(dirReads.slice(d0).some((d) => /Documents$/.test(d)), "Indexbau lief durch Documents");
  const idx = fs.readFileSync(process.env.JARVIS_INDEX, "utf8");
  assert.ok(!/argus-desktop|jarvis-desktop|selfimprove-stage/i.test(idx), "kein geschützter Ordner im Index");
  assert.ok(!/harmlos\\notiz|appdata-alias\\|kette\\/i.test(idx), "kein Abstieg in Junctions"); assert.match(idx, /normal\.txt/);
});

// ===================== P11 Öffnen und Programmstart =====================
const pathToUrl = (p) => require("url").pathToFileURL(p).href;
test("P11a Öffnen (actions.openGuarded): geschützte Ziele, Programme, Verknüpfungen und Indirektionen", async () => {
  shellCalls.length = 0;
  for (const p of [path.join(DOCS, "harmlos", "notiz.txt"), path.join(PROF, "notiz.txt"), PROF, "\\\\localhost\\c$\\x", path.join(DOCS, "appdata-alias", "argus-desktop")])
    assert.match(await A.openGuarded(p), /öffne ich nicht/, p);
  assert.deepEqual(shellCalls, [], "nichts geöffnet");
  assert.equal(await A.openGuarded(path.join(DOCS, "normal.txt")), null); assert.deepEqual(shellCalls.pop(), ["openPath", path.join(DOCS, "normal.txt")]);
  assert.equal(await A.openGuarded(path.join(DOCS, "normal.txt"), "show"), null); assert.deepEqual(shellCalls.pop(), ["showItemInFolder", path.join(DOCS, "normal.txt")]);
  assert.equal(await A.openGuarded(DOCS), null); assert.deepEqual(shellCalls.pop(), ["openPath", DOCS]);
  // Verknüpfungsdateien, Programme und Skripte werden über "Öffne Datei" nie ausgeführt, auch wenn ihr Ziel harmlos wäre
  const lnk = path.join(DOCS, "normal.lnk"); put(lnk, "LNK"); shortcutTargets[lnk.toLowerCase()] = path.join(DOCS, "normal.txt");
  for (const name of ["unbekannt.foo", "seite.html", "bild.svg", "daten.xml", "normal.lnk", "tool.exe", "start.bat", "skript.ps1", "a.vbs", "b.js", "c.hta", "d.msi", "e.reg", "f.scr", "x.library-ms", "x.search-ms", "x.searchConnector-ms", "x.scf", "x.website", "x.appref-ms", "x.settingcontent-ms", "x.rdp"]) {
    const p = path.join(DOCS, name); if (!fs.existsSync(p)) put(p, "X");
    assert.match(await A.openGuarded(p), /öffne ich nicht/, name);
  }
  // Gängige Dokument-, Bild- und Archivtypen werden geöffnet
  for (const name of ["brief.pdf", "tabelle.xlsx", "text.docx", "foto.JPG", "archiv.zip", "film.mp4"]) { const p = path.join(DOCS, name); put(p, "X"); assert.equal(await A.openGuarded(p), null, name); assert.deepEqual(shellCalls.pop(), ["openPath", p]); }
  // Internetverknüpfungen: nur http/https, dann wird die Adresse geöffnet, nicht die Datei
  const url = (name, u) => { const p = path.join(DOCS, name); put(p, "[InternetShortcut]\r\nURL=" + u + "\r\n"); return p; };
  for (const [name, u] of [["profil.url", pathToUrl(path.join(PROF, "notiz.txt"))], ["datei.url", pathToUrl(path.join(DOCS, "normal.txt"))], ["alias.url", pathToUrl(path.join(DOCS, "harmlos"))],
    ["shell.url", "shell:AppData"], ["suche.url", "search-ms:query=notiz&crumb=location:" + PROF], ["laufwerk.url", PROF], ["leer.url", ""], ["steam.url", "steam://rungameid/1"], ["fremd.url", "irgendwas://" + PROF]])
    assert.match(await A.openGuarded(url(name, u)), /öffne ich nicht/, name);
  assert.equal(await A.openGuarded(url("web.url", "https://example.com/")), null); assert.deepEqual(shellCalls.pop(), ["openExternal", "https://example.com/"]);
  assert.deepEqual(shellCalls, [], "keine weiteren Öffnungen: " + JSON.stringify(shellCalls));
});

test("P11b Programmstart (launchApp): nur geprüfte .exe, Verknüpfungen streng, Start des geprüften Ziels", async () => {
  shellCalls.length = 0; spawnCalls.length = 0; execHook = (c, a, o, cb) => { setImmediate(() => cb(null, "")); return {}; }; // keine echte Windows-Suche
  const tools = path.join(DOCS, "werkzeuge"); const okExe = path.join(tools, "app.exe"); put(okExe, "MZ"); const profExe = path.join(PROF, "tool.exe"); put(profExe, "MZ");
  const L = (name, target, args, cwd) => { const p = path.join(DOCS, name); put(p, "LNK"); shortcutTargets[p.toLowerCase()] = target; argsOf[p.toLowerCase()] = args || ""; if (cwd) cwdOf[p.toLowerCase()] = cwd; return p; };
  const launch = (p, arg) => A._launchApp({ name: path.basename(p), path: p }, arg);
  const deny = [
    ["Ziel im Profil", L("l1.lnk", profExe)], ["Ziel über Junction", L("l2.lnk", path.join(DOCS, "harmlos", "tool.exe"))], ["Ziel fehlt", L("l3.lnk", path.join(tools, "fehlt.exe"))],
    ["Ziel leer", L("l4.lnk", "")], ["Kette", L("l5.lnk", path.join(DOCS, "l1.lnk"))], ["Ziel ist Dokument", L("l6.lnk", path.join(DOCS, "normal.txt"))], ["Ziel ist Ordner", L("l7.lnk", tools)],
    ["Argument mit Pfad", L("l8.lnk", okExe, `"${path.join(PROF, "notiz.txt")}"`)], ["Argument Dateiname", L("l9.lnk", okExe, "notiz.txt", PROF)], ["Arbeitsordner Profil", L("l10.lnk", okExe, "--neu", PROF)],
    ["Argument mit Variable", L("l11.lnk", okExe, "--datei=%APPDATA%\\argus-desktop\\notiz.txt")], ["Argument Skript", L("l12.lnk", okExe, "-Command Get-Content x")], ["Arbeitsordner über Junction", L("l13.lnk", okExe, "", path.join(DOCS, "harmlos"))],
    ["Programm im Profil", profExe], ["Programm über Junction", path.join(DOCS, "harmlos", "tool.exe")], ["Dokument", path.join(DOCS, "normal.txt")], ["Unbekannte Verknüpfung", path.join(DOCS, "kaputt.lnk")]];
  put(path.join(DOCS, "kaputt.lnk"), "LNK");
  for (const [why, p] of deny) assert.match(launch(p) || "", /öffne ich nicht/, why);
  assert.deepEqual(spawnCalls, [], "nichts gestartet"); assert.deepEqual(shellCalls, []);
  // Erlaubt: .exe direkt, .lnk auf .exe mit reinen Optionen; gestartet wird das geprüfte Ziel, nicht die Verknüpfung
  assert.equal(launch(okExe), null); assert.deepEqual(spawnCalls.pop(), [okExe, []]);
  for (const args of ['--profile-directory="Profile 1"', "-n", "--require=modul"]) assert.match(launch(L("opt.lnk", okExe, args)) || "", /öffne ich nicht/, "Verknüpfung mit Argumenten: " + args); assert.deepEqual(spawnCalls, []);
  assert.equal(launch(L("gut2.lnk", okExe), "https://example.com/"), null); assert.deepEqual(spawnCalls.pop(), [okExe, ["https://example.com/"]]);
  const u = path.join(DOCS, "spiel.url"); put(u, "[InternetShortcut]\r\nURL=steam://rungameid/1\r\n"); assert.equal(launch(u), null); assert.deepEqual(shellCalls.pop(), ["openExternal", "steam://rungameid/1"]);
  const u2 = path.join(DOCS, "fremd2.url"); put(u2, "[InternetShortcut]\r\nURL=irgendwas://x\r\n"); assert.match(launch(u2) || "", /öffne ich nicht/);
  // Sprachbefehle: nicht prüfbare Startmenü-Verknüpfungen werden übersprungen, nichts Geschütztes gestartet
  const sm = path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  const bad = path.join(sm, "Testbrowser.lnk"); put(bad, "LNK"); shortcutTargets[bad.toLowerCase()] = profExe;
  const office = path.join(sm, "Officeprogramm.lnk"); put(office, "LNK"); shortcutTargets[office.toLowerCase()] = "";
  const good = path.join(sm, "Gutesprogramm.lnk"); put(good, "LNK"); shortcutTargets[good.toLowerCase()] = okExe;
  fs.symlinkSync(PROF, path.join(sm, "Profilmenue"), "junction"); // Junction im Startmenü auf das Profil
  shellCalls.length = 0; spawnCalls.length = 0; const d0 = dirReads.length;
  await A.run("Öffne example.com in Testbrowser"); await A.run("Starte Testbrowser"); await A.run("Starte Officeprogramm"); await A.run("Starte Tool");
  assert.ok(!spawnCalls.some((c) => /argus-desktop|harmlos/i.test(String(c[0]))), JSON.stringify(spawnCalls)); assert.ok(!shellCalls.some((c) => /argus-desktop|harmlos|\.lnk$/i.test(String(c[1]))), JSON.stringify(shellCalls));
  assert.deepEqual(dirReads.slice(d0).filter(protEnum).concat(dirReads.slice(d0).filter((d) => /Profilmenue/i.test(d))), [], "Startmenü-Junction nicht durchlaufen");
  spawnCalls.length = 0; assert.match(await A.run("Starte Gutesprogramm"), /^Starte Gutesprogramm/); assert.deepEqual(spawnCalls.pop(), [okExe, []]); execHook = null;
});

test("P11c Sprachbefehl über alten Index-Treffer und Startordner", async () => {
  put(process.env.JARVIS_INDEX, [path.join(DOCS, "harmlos", "geheimprofil.txt"), path.join(DOCS, "nutzbar-geheimprofil.txt")].join("\n") + "\n"); put(path.join(PROF, "geheimprofil.txt"), "G"); put(path.join(DOCS, "nutzbar-geheimprofil.txt"), "N");
  execHook = (c, a, o, cb) => { setImmediate(() => cb(null, "")); return {}; }; shellCalls.length = 0; const r = await A.run("Öffne Datei geheimprofil"); execHook = null;
  assert.ok(!shellCalls.some((c) => /harmlos|argus-desktop/i.test(c[1])), JSON.stringify(shellCalls)); assert.ok(shellCalls.some((c) => /nutzbar-geheimprofil/.test(c[1])), r);
  // Startordner eines Durchlaufs: Junction auf das Profil wird nicht durchlaufen, normale Ordner schon
  assert.equal(F.walkRoot(path.join(DOCS, "harmlos")), null); assert.equal(F.walkRoot(DOCS), DOCS); assert.equal(F.enterDir(path.join(DOCS, "harmlos")), false); assert.equal(F.enterDir(PROF), false);
  // Quelltext: Strata-Werkzeug "oeffnen" nutzt die geprüfte Öffnung, KI-Werkzeuge lesen über files.read
  const mj = fs.readFileSync(path.join(REPO, "main.js"), "utf8");
  assert.ok(mj.includes("return (await actions.openGuarded(p)) || \"Geöffnet: \" + p;")); assert.ok(!/fs\.existsSync\(p\)\) \{ await shell\.openPath\(p\)/.test(mj));
  assert.ok(mj.includes("datei_lesen: { d: \"Textdatei lesen oder Ordner auflisten. args: {pfad}\", run: async (a) => String(files.read("));
  assert.ok(mj.includes("process.env.ARGUS_USERDATA = app.getPath(\"userData\")"));
});

// ===================== P12 MCP-Server (eigener Prozess, wie bei Claude Code) =====================
test("P12 MCP-Server argus-mcp.js: datei_lesen und dateien_suchen", async () => {
  const child = cp.spawn(process.execPath, [path.join(REPO, "argus-mcp.js")], { env: { ...process.env, JARVIS_PORT: "", ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let out = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (d) => (out += d));
  const calls = [["datei_lesen", { pfad: path.join(DOCS, "harmlos", "notiz.txt") }], ["datei_lesen", { pfad: path.join(PROF, "notiz.txt") }], ["datei_lesen", { pfad: "\\\\localhost\\c$\\x.txt" }],
    ["datei_lesen", { pfad: path.join(DOCS, "normal.txt") }], ["dateien_suchen", { suchbegriff: "geheimprofil" }]];
  calls.forEach(([name, args], i) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name, arguments: args } }) + "\n"));
  child.stdin.end();
  await new Promise((r) => child.on("close", r));
  const res = out.trim().split("\n").map((l) => JSON.parse(l)).sort((a, b) => a.id - b.id).map((m) => m.result.content[0].text);
  assert.equal(res.length, 5, out);
  for (const i of [0, 1, 2]) assert.ok(blocked(res[i]), res[i]); assert.equal(res[3], "NORMAL");
  assert.ok(!/harmlos|argus-desktop/i.test(res[4]) && /nutzbar-geheimprofil/.test(res[4]), res[4]);
  assert.ok(!res.join("\n").includes("PROFIL\n") && !res.some((t) => t === "PROFIL" || t === "G"), "kein Profilinhalt");
});

// ===================== P14 Inhaltssuche: Suchbegriff wird nicht als PowerShell-Code ausgeführt =====================
test("P14 Windows-Inhaltssuche: keine PowerShell-Injection über den Suchbegriff", async (t) => {
  if (process.platform !== "win32") return skip(t, "P14", "nur Windows");
  const marker = path.join(T, "injection-ausgefuehrt.txt").replace(/'/g, "");
  const evil = [`$(New-Item -ItemType File -Path '${marker}')`, `x'); New-Item -ItemType File -Path '${marker}'; ('`, "`$(New-Item -ItemType File -Path " + marker + ")", `${"$"}{env:ARGUS_SUCHE}`];
  let captured = null; execHook = (cmd, args, opts, cb) => { captured = { cmd, args, opts }; setImmediate(() => cb(null, "")); return {}; };
  try {
    for (const term of evil) {
      captured = null; await F.searchContent(term, 7); assert.ok(captured, "aufgerufen");
      const script = captured.args[captured.args.length - 1];
      assert.ok(!script.includes("New-Item") && !script.includes(marker) && !script.includes("{env:ARGUS_SUCHE}"), "Suchbegriff steht nicht im Skript");
      assert.equal(captured.opts.env.ARGUS_SUCHE, term.replace(/['"]/g, " ").trim(), "Begriff als Daten übergeben"); assert.equal(captured.opts.env.ARGUS_SUCHE_N, "21", "dreifach abgefragt, nach dem Filtern gekürzt");
      // Das echte Skript ausführen, nur die COM-Aufrufe durch die Ausgabe der SQL-Abfrage ersetzt
      const probe = script.replace(/\$c=New-Object -ComObject ADODB\.Connection;\$r=New-Object -ComObject ADODB\.Recordset;/, "").replace(/\$c\.Open\([^;]*\);/, "")
        .replace(/\$r\.Open\(\((.*)\),\$c\);/, "Write-Output ($1);").replace(/while\(-not \$r\.EOF\)\{.*\}$/, "");
      assert.ok(/Write-Output \('SELECT TOP '/.test(probe), probe);
      const sql = await new Promise((res) => realExecFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", probe], { env: captured.opts.env, windowsHide: true, timeout: 30000 }, (e, so) => res(String(so || "").trim())));
      const expTerm = term.replace(/['"]/g, " ").trim().replace(/'/g, "''");
      assert.equal(sql, `SELECT TOP 21 System.ItemPathDisplay FROM SYSTEMINDEX WHERE FREETEXT('${expTerm}') ORDER BY System.DateModified DESC`, "Begriff erscheint wörtlich in der Abfrage");
      assert.ok(!fs.existsSync(marker), "Ausdruck wurde nicht ausgeführt");
    }
  } finally { execHook = null; }
});

test("P15 Startwege ohne Pfad: App-IDs nur von Paket-Apps, eingebaute Programme geprüft", async () => {
  assert.equal(A._isPackagedAppId("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"), true);
  for (const id of ["C:\\Users\\x\\AppData\\Roaming\\argus-desktop\\tool.exe", "{6D809377-6AF0-444B-8957-A3773F02200E}\\Programm\\app.exe", "Chrome", "", "a_b!c"]) assert.equal(A._isPackagedAppId(id), false, id);
  spawnCalls.length = 0;
  assert.match(A._launchApp({ name: "x", appId: "{6D809377-6AF0-444B-8957-A3773F02200E}\\Programm\\app.exe" }) || "", /öffne ich nicht/);
  assert.match(A._launchApp({ name: "x", cmd: path.join(PROF, "tool.exe") }) || "", /öffne ich nicht/);
  assert.match(A._launchApp({ name: "x", cmd: path.join(DOCS, "harmlos", "tool.exe") }) || "", /öffne ich nicht/);
  assert.deepEqual(spawnCalls, []);
  // Store-App-Liste (Attrappe für das PowerShell-Ergebnis, das nur App-IDs installierter Pakete enthält): kehrt zurück, übernimmt nur
  // paketartige IDs, die keine Verknüpfung in Startmenü oder Desktop trägt; gestartet wird nur aus dieser geprüften Menge
  const calc = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App", fake = "Firma.Gefaelscht_8wekyb3d8bbwe!App", other = "Firma.Nichtgelistet_8wekyb3d8bbwe!App";
  const sm = path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"); const fl = path.join(sm, "Gefaelscht.lnk"); put(fl, "LNK"); shortcutTargets[fl.toLowerCase()] = path.join(PROF, "tool.exe"); aumidOf[fl.toLowerCase()] = fake;
  fs.rmdirSync(path.join(sm, "Profilmenue")); // P11 fixture: incomplete scan tested separately below
  startAppsJson = JSON.stringify([{ Name: "Paketapp", AppID: "Firma.Paket_8wekyb3d8bbwe!App" }, { Name: "Rechner", AppID: calc }, { Name: "Gefaelscht", AppID: fake }, { Name: "Desktopapp", AppID: "{6D809377-6AF0-444B-8957-A3773F02200E}\\Programm\\desktop.exe" }, { Name: "Einzeln", AppID: "Chrome" }]);
  const sa = await Promise.race([A._storeApps(), new Promise((r) => setTimeout(() => r("ZEITLIMIT"), 5000))]); startAppsJson = "[]";
  assert.deepEqual(sa, [{ name: "Paketapp", appId: "Firma.Paket_8wekyb3d8bbwe!App" }, { name: "Rechner", appId: calc }], "storeApps kehrt zurück, filtert und schließt die von einer Verknüpfung getragene ID aus");
  for (const id of [fake, other]) assert.match(A._launchApp({ name: "x", appId: id }) || "", /öffne ich nicht/, id);
  assert.deepEqual(spawnCalls, []);
  assert.equal(A._launchApp({ name: "Rechner", appId: calc }), null); assert.equal(spawnCalls.pop()[1][0], "shell:AppsFolder\\" + calc);
  const asrc = fs.readFileSync(path.join(REPO, "actions.js"), "utf8"); assert.ok(asrc.includes("Get-AppxPackageManifest") && asrc.includes("$ok.ContainsKey([string]$_.AppID)"), "PowerShell prüft installierte Pakete");});

test("P15b unvollstaendige Kollisionssuche sperrt und widerruft App-IDs", async () => {
  const sm = path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  const id = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App";
  startAppsJson = JSON.stringify([{ Name: "Rechner", AppID: id }]);
  const denied = async () => {
    assert.deepEqual(await A._storeApps(), []);
    assert.match(A._launchApp({ name: "Rechner", appId: id }) || "", /\u00f6ffne ich nicht/);
  };
  const alias = path.join(sm, "alias.lnk"), source = path.join(PROF, "privat.lnk");
  put(source, "PRIVATE"); fs.linkSync(source, alias);
  const before = shortcutReads.length;
  await denied();
  assert.ok(!shortcutReads.slice(before).includes(alias), "Hardlink nicht an Shortcut-Leser uebergeben");
  fs.unlinkSync(alias);
  const junction = path.join(sm, "verknuepft"); fs.symlinkSync(PROF, junction, "junction");
  await denied(); fs.rmdirSync(junction);
  const broken = path.join(sm, "unlesbar.lnk"); put(broken, "BROKEN");
  await denied(); fs.unlinkSync(broken);
  const deep = path.join(sm, "a", "b", "c", "d"); put(path.join(deep, "kollision.lnk"), "LNK");
  await denied(); fs.rmSync(path.join(sm, "a"), { recursive: true });
  const original = fs.readdirSync;
  fs.readdirSync = function (p, ...args) { if (p === sm) throw Object.assign(new Error("Test"), { code: "EACCES" }); return original.call(this, p, ...args); };
  try { await denied(); } finally { fs.readdirSync = original; }
  assert.deepEqual(await A._storeApps(), [{ name: "Rechner", appId: id }], "vollstaendige Suche erlaubt Paketapp wieder");
  startAppsJson = "[]";
});

test("P16 Spieleerkennung: geschützte Bibliotheken und Manifest-Aliase werden weder durchlaufen noch gelesen", async () => {
  // Steam-Bibliothek, deren steamapps eine Junction ins Profil ist; Epic-Manifest als harte Verknüpfung einer Profildatei
  const steamBase = path.join(process.env["ProgramFiles(x86)"], "Steam", "steamapps"); const lib = path.join(T, "spielebib");
  fs.mkdirSync(lib, { recursive: true }); put(path.join(PROF, "appmanifest_1.acf"), '"appid" "1"\n"name" "Profilspiel"'); fs.symlinkSync(PROF, path.join(lib, "steamapps"), "junction");
  put(path.join(steamBase, "libraryfolders.vdf"), `"path" "${lib.replace(/\\/g, "\\\\")}"`); put(path.join(steamBase, "appmanifest_2.acf"), '"appid" "2"\n"name" "Normalspiel"');
  const epic = path.join(process.env.ProgramData, "Epic", "EpicGamesLauncher", "Data", "Manifests"); put(path.join(PROF, "geheim.item"), '{"DisplayName":"Profil","AppName":"p"}');
  fs.mkdirSync(epic, { recursive: true }); let hard = true; try { fs.linkSync(path.join(PROF, "geheim.item"), path.join(epic, "alias.item")); } catch { hard = false; } put(path.join(epic, "normal.item"), '{"DisplayName":"Normal","AppName":"n"}');
  const d0 = dirReads.length, r0 = fileReads.length;
  const s = A._steamGames().map((g) => g.name), e = A._epicGames().map((g) => g.name);
  assert.deepEqual(s, ["Normalspiel"]); assert.deepEqual(e, ["Normal"]);
  assert.deepEqual(dirReads.slice(d0).filter(protEnum).concat(dirReads.slice(d0).filter((d) => /spielebib/i.test(d))), [], "geschützte Bibliothek nicht durchlaufen");
  assert.deepEqual(fileReads.slice(r0).filter((f) => /argus-desktop|spielebib|alias\.item/i.test(f)), [], "keine geschützten Manifeste gelesen");
  hardEpic = hard;
});

let hardEpic = null;
test("P16b Epic-Manifest als harte Verknüpfung einer Profildatei", (t) => {
  if (!hardEpic) return skip(t, "P16b", "harte Verknüpfung für das Epic-Manifest nicht möglich");
  assert.ok(!A._epicGames().some((g) => g.name === "Profil"), "Alias-Manifest nicht übernommen");
});

test("P17 Zugangsdaten-Ordner und Listengrenze", async () => {
  put(path.join(APPDATA, "Argus", "geheim.txt"), "S"); put(path.join(HOME, ".ssh", "id_test"), "S");
  assert.equal(F.enterDir(path.join(APPDATA, "Argus")), false); assert.equal(F.enterDir(path.join(HOME, ".ssh")), false);
  const d0 = dirReads.length; fs.rmSync(path.dirname(process.env.JARVIS_INDEX), { recursive: true, force: true }); await F.search("geheim", 50);
  assert.deepEqual(dirReads.slice(d0).filter((d) => /[\\/](Argus|\.ssh)$/i.test(d)), [], "Zugangsdaten-Ordner nicht durchlaufen");
  // Liste: erst filtern, dann begrenzen
  const dir = path.join(DOCS, "liste"); for (let i = 0; i < 5; i++) put(path.join(dir, "selfimprove-verworfen-" + i, "x")); put(path.join(dir, "zz-normal.txt"), "N");
  assert.match(F.list(dir, 1), /zz-normal\.txt/);
  // Indexsuche: erlaubter Treffer hinter vielen geschützten Einträgen
  const lines = []; for (let i = 0; i < 300; i++) lines.push(path.join(PROF, "suchwort-" + i + ".txt")); const okFile = path.join(DOCS, "suchwort-erlaubt.txt"); put(okFile, "E"); lines.push(okFile);
  put(process.env.JARVIS_INDEX, lines.join("\n") + "\n"); assert.deepEqual(await F.search("suchwort", 1), [okFile]);
});
test("P17b ausgeschlossene Aliase verdraengen keinen erlaubten Indextreffer", async () => {
  const outside = path.join(T, "outside", "word-erlaubt.txt"); put(outside, "OK");
  const aliasDir = path.join(T, "alias-index"); fs.symlinkSync(PROF, aliasDir, "junction");
  const lines = [];
  for (let i = 0; i < 100; i++) { put(path.join(PROF, "word-" + i + ".txt")); lines.push(path.join(aliasDir, "word-" + i + ".txt")); }
  const hard = path.join(T, "word-hard.txt"); fs.linkSync(path.join(PROF, "notiz.txt"), hard);
  // Nach den Junctions aufnehmen, dann durch hoeher bewertete Aliase begrenzen lassen.
  lines.push(outside, ...Array(100).fill(hard), ...Array(100).fill(path.join(T, "word-fehlt.txt")));
  put(process.env.JARVIS_INDEX, lines.join("\n") + "\n");
  assert.deepEqual(await F.search("word", 1), [outside]);
});
// ===================== P13 subst-Laufwerk (nur VM: ARGUS_TEST_SUBST=1) =====================
test("P13 subst-Laufwerk auf das Profil", async (t) => {
  if (process.env.ARGUS_TEST_SUBST !== "1") return skip(t, "P13", "subst nur in der Test-VM (ARGUS_TEST_SUBST=1)");
  const free = "PQRSTUVWXY".split("").find((l) => { try { fs.accessSync(l + ":\\"); return false; } catch { return true; } });
  if (!free) return skip(t, "P13", "kein freier Laufwerksbuchstabe");
  cp.execFileSync("subst.exe", [free + ":", PROF]);
  testSubstDrive = free + ":";
  try { assert.ok(blocked(F.read(free + ":\\notiz.txt"))); assert.ok(blocked(F.list(free + ":\\"))); process.stdout.write(`# P13 subst ${free}: geprüft\n`); }
  finally { cp.execFileSync("subst.exe", [free + ":", "/d"]); testSubstDrive = null; }
});

test("Z Wächter und nicht ausgeführte Fälle", () => {
  process.stdout.write(`# Testordner: ${T}\n# Nicht ausgeführt: ${notRun.length ? notRun.join(" | ") : "keine"}\n`);
  assert.deepEqual(violations, []);
});
