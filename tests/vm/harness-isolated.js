// Isolierter Electron-Testrahmen für den Hotfix 0.58.20. NUR in der wegwerfbaren Test-VM ausführen (siehe tests/vm/README-VM.md).
// Leitet Benutzer-, Programm- und Datenpfade auf einen Testordner um, schreibt das reduzierte Demo-Profil, installiert Wächter
// für Prozesse, Netz und Systemfunktionen, BEVOR Argus-Code geladen wird, und beendet jeden Lauf über genau eine Abschlussfunktion.
"use strict";
const path = require("path"), fs = require("fs"), os = require("os");
const { app, BrowserWindow, shell, globalShortcut, session } = require("electron");

const DISABLED = "Die Selbstverbesserung ist aus Sicherheitsgründen abgeschaltet.";
const LIMIT_MS = Number(process.env.ARGUS_VM_LIMIT_MS || 180000);

function setup({ entry = "main", label = "lauf" } = {}) {
  const base = process.env.ARGUS_VM_TESTROOT || path.join(os.tmpdir(), "argus-vm-tests");
  fs.mkdirSync(base, { recursive: true });
  const T = fs.mkdtempSync(path.join(base, label + "-"));
  const HOME = path.join(T, "home"), APPDATA = path.join(HOME, "AppData", "Roaming"), LOCAL = path.join(HOME, "AppData", "Local");
  for (const d of [HOME, APPDATA, LOCAL, path.join(T, "temp"), path.join(T, "logs")]) fs.mkdirSync(d, { recursive: true });
  Object.assign(process.env, {
    USERPROFILE: HOME, HOME, APPDATA, LOCALAPPDATA: LOCAL, TEMP: path.join(T, "temp"), TMP: path.join(T, "temp"),
    ProgramData: path.join(T, "programdata"), ProgramFiles: path.join(T, "pf"), "ProgramFiles(x86)": path.join(T, "pf86"), PUBLIC: path.join(T, "public"),
    JARVIS_MEMORY: path.join(T, "memory"), JARVIS_INDEX: path.join(T, "index", "dateiindex.txt"), JARVIS_STEAM_DIR: path.join(T, "steam"),
    JARVIS_STRATA_URL: "http://127.0.0.1:9", JARVIS_CLAUDE_DESKTOP: path.join(T, "claude_desktop_config.json"),
  });
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ELECTRON_RUN_AS_NODE", "ARGUS_OLD_DATA"]) delete process.env[k];
  app.setPath("home", HOME); app.setPath("appData", APPDATA); app.setPath("temp", path.join(T, "temp")); app.setPath("logs", path.join(T, "logs"));
  const UD = path.join(APPDATA, "argus-desktop");
  if (entry === "main") app.setPath("userData", UD); // beim Start über boot.js leitet boot.js den Datenordner selbst ab
  fs.mkdirSync(UD, { recursive: true });
  // Reduziertes Demo-Profil (Plan UMG-7): keine KI-Schlüssel, Backend "none", Hintergrundfunktionen aus, Indexierung an
  const cfg = {
    setupDone: true, multiUser: 1, crashReport: false, backend: "none", aiKey: "", anthropicApiKey: "", aiBase: "", dcBotToken: "", steamKey: "", iobPass: "", finnhubKey: "",
    voiceOutput: false, micOnStart: false, voiceEngine: "windows", sensors: false, sensorsAsked: true, autostart: false, claudeDesktopLink: false,
    strataOn: false, strataDir: "", strataWake: false, strataIdleMin: 0, ollamaOff: false, ollamaOffChecked: 2, ollamaUrl: "http://127.0.0.1:9",
    systemWatch: false, mediaOn: false, steamDl: false, steamOn: false, discordOn: false, newsOn: false, tradeOn: false, weatherOn: false, iobOn: false,
    portalOn: false, fmDashOn: false, foremanOn: false, miningOn: false, mineOn: false, briefOn: false, reportOn: false, ytOpen: "", twOpen: "", updateUrl: "",
    widgets: { btc: { on: false }, weather: { on: false }, steam: { on: false }, discord: { on: false } },
  };
  fs.writeFileSync(path.join(UD, "argus-config.json"), JSON.stringify(cfg, null, 2));

  // ---------- Wächter ----------
  const violations = [], calls = { shell: [], shortcut: [], relaunch: 0, process: [], net: [], known: [] };
  const cp = require("child_process");
  const isStartApps = (cmd, args) => /powershell/i.test(String(cmd)) && Array.isArray(args) && args.some((x) => String(x).includes("Get-StartApps"));
  const isSearchIndex = (cmd, args) => /powershell/i.test(String(cmd)) && Array.isArray(args) && args.some((x) => String(x).includes("SYSTEMINDEX"));
  let searchIndexResult = ""; // Testgesteuert (U9): simulierte Windows-Suche
  cp.execFile = (cmd, args, opts, cb) => {
    calls.process.push([cmd, (args || []).slice(0, 3)]);
    const done = typeof opts === "function" ? opts : cb;
    if (isStartApps(cmd, args)) { setImmediate(() => done && done(null, "[]", "")); return {}; }
    if (isSearchIndex(cmd, args)) { setImmediate(() => done && done(null, searchIndexResult, "")); return {}; }
    violations.push("execFile " + cmd); throw new Error("GUARD: Prozess " + cmd);
  };
  // Bekannt und vorbestehend (unverändert seit 0.58.19): systeminformation fragt die Codepage mit "chcp" ab (lib/util.js), simuliert
  for (const n of ["spawn", "spawnSync", "exec", "execSync", "execFileSync", "fork"]) cp[n] = (cmd) => {
    if (n === "execSync" && String(cmd).trim() === "chcp") { calls.known.push("execSync chcp (simuliert)"); return "Aktive Codepage: 65001."; }
    violations.push(n + " " + cmd); throw new Error("GUARD: Prozess " + cmd);
  };
  const loop = (h) => /^(127\.0\.0\.1|localhost|::1)$/i.test(String(h || ""));
  for (const m of ["http", "https"]) { const mod = require(m), orig = mod.request; mod.request = function (o, ...r) { const h = typeof o === "string" ? new URL(o).hostname : o && (o.hostname || o.host); calls.net.push(m + " " + h); if (!loop(h)) { violations.push("Netz " + h); throw new Error("GUARD: Netz " + h); } return orig.call(this, o, ...r); }; mod.get = (o, ...r) => { const q = mod.request(o, ...r); q.end(); return q; }; }
  const origFetch = globalThis.fetch;
  globalThis.fetch = (u, ...r) => { let h = ""; try { h = new URL(String(u && u.url ? u.url : u)).hostname; } catch {} calls.net.push("fetch " + h);
    // Bekannt und vorbestehend: einmaliger Download des lokalen Vosk-Sprachmodells (main.js ensureVoiceModel), blockiert wie offline
    if (h === "alphacephei.com" && /\/vosk\/models\//.test(String(u && u.url ? u.url : u))) { calls.known.push("fetch alphacephei.com Vosk-Modell (blockiert)"); return Promise.reject(new Error("GUARD: offline")); }
    if (!loop(h)) { violations.push("Netz fetch " + h); return Promise.reject(new Error("GUARD: Netz " + h)); } return origFetch(u, ...r); };
  shell.openPath = async (p) => { calls.shell.push(["openPath", p]); return ""; };
  shell.openExternal = async (u) => { calls.shell.push(["openExternal", u]); };
  shell.showItemInFolder = (p) => { calls.shell.push(["showItemInFolder", p]); };
  globalShortcut.register = (acc) => { calls.shortcut.push(acc); return true; };
  app.setLoginItemSettings = () => { violations.push("setLoginItemSettings"); };
  const realRelaunch = app.relaunch.bind(app); void realRelaunch;
  app.relaunch = () => { calls.relaunch++; violations.push("relaunch"); }; // ein Neustart ist im Hotfix-Profil nie erwartet
  const hardExit = app.exit.bind(app); void hardExit; // Abschluss läuft über app.exit (main.js umhüllt es), siehe finish()
  app.whenReady().then(() => {
    const allow = (url) => /^(file:|data:|devtools:|chrome-extension:|blob:)/i.test(url) || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url);
    for (const s of [session.defaultSession, ...["persist:youtube", "persist:twitch", "persist:streamkit", "persist:discordweb"].map((p) => session.fromPartition(p))])
      s.webRequest.onBeforeRequest((d, cb) => { if (allow(d.url)) return cb({}); calls.net.push("web " + d.url); if (/anthropic|openai|claude\.ai|googleapis|mistral|groq|openrouter/i.test(d.url)) violations.push("Cloud-KI " + d.url); cb({ cancel: true }); });
  });

  // ---------- Ergebnis und Abschluss ----------
  const results = []; let finished = false;
  const check = (id, ok, info) => { results.push({ id, ok: !!ok, info: ok ? undefined : info }); console.log((ok ? "PASS " : "FAIL ") + id + (ok ? "" : "  -> " + JSON.stringify(info))); };
  function finish(code) {
    if (finished) return; finished = true;
    const failed = results.filter((r) => !r.ok).length;
    let exit = code != null ? code : failed ? 1 : 0;
    if (violations.length && exit === 0) exit = 3;
    try { fs.writeFileSync(path.join(T, "result.json"), JSON.stringify({ label, entry, exit, results, violations, calls, node: process.versions.node, electron: process.versions.electron }, null, 2)); } catch {}
    console.log(`BEKANNT ${label}: ${[...new Set(calls.known)].join("; ") || "keine"}`);
    console.log(`ERGEBNIS ${label}: exit=${exit}, bestanden=${results.length - failed}/${results.length}, Verstöße=${violations.length}, Datei=${path.join(T, "result.json")}`);
    app.exit(exit);
  }
  setTimeout(() => { check("ZEITLIMIT", false, LIMIT_MS + " ms"); finish(2); }, LIMIT_MS).unref?.();
  process.on("uncaughtException", (e) => { check("INTERNER-FEHLER", false, String(e && e.stack || e).slice(0, 400)); finish(4); });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function mainWindow(timeout = 30000) { for (let i = 0; i < timeout / 250; i++) { const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "Argus"); if (w) return w; await wait(250); } return null; }
  return { T, HOME, APPDATA, UD, DISABLED, violations, calls, check, finish, wait, mainWindow, setSearchIndex: (s) => { searchIndexResult = s; } };
}
module.exports = { setup, DISABLED };
