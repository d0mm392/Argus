"use strict";
// Oberflächenwechsel mit dem echten Hauptprozess (main.js): Klassisch → Apple → Klassisch über die Einstellungen mit echtem
// Neustart (app.relaunch + app.quit), Notizen und Anordnung bleiben erhalten; gescheiterter Apple-Start → einmal Klassisch.
// Isoliert, aber keine Sandbox: eigener Daten-, Benutzer-, AppData-, Gedächtnis- und Indexordner, Node-Netz nur zu 127.0.0.1, keine Benachrichtigungen,
// keine globalen Kurzbefehle, kein Autostart, Fremdanbindungen per Konfiguration aus. Kindprozesse/Named Pipes sind nicht abgeschirmt (nur auf dem eigenen Testrechner ausführen).
// Aufruf: electron tests/ui-switch-live.test.js   (ohne ARGUS_IT_DIR: Testablauf; mit ARGUS_IT_DIR: ein Argus-Lauf)
const fs = require("fs"), path = require("path"), os = require("os");
const { app } = require("electron");
const ROOT = path.join(__dirname, "..");

if (process.env.ARGUS_IT_DIR) instance(); else runner();

// ---------- ein Argus-Lauf im isolierten Ordner ----------
function instance() {
  const dir = process.env.ARGUS_IT_DIR, plan = process.env.ARGUS_IT_PLAN, log = (o) => fs.appendFileSync(path.join(dir, "log.jsonl"), JSON.stringify({ t: Date.now(), pid: process.pid, ...o }) + "\n");
  const runs = (() => { const f = path.join(dir, "runs.txt"); const n = (+(fs.existsSync(f) && fs.readFileSync(f, "utf8")) || 0) + 1; fs.writeFileSync(f, String(n)); return n; })();
  if (runs > 5) { log({ fail: "mehr als 5 Starts (Neustartschleife)" }); app.exit(3); return; }
  for (const [k, sub] of [["appData", "appdata"], ["userData", "userdata"], ["documents", "home/Documents"], ["desktop", "home/Desktop"], ["downloads", "home/Downloads"], ["music", "home/Music"], ["videos", "home/Videos"], ["pictures", "home/Pictures"]]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true }); app.setPath(k, path.join(dir, sub));
  }
  // Alle Benutzer- und Systempfade, die Argus über Umgebungsvariablen findet (z. B. Claude-Desktop-Konfiguration, Sensoren, Startmenü)
  const H = path.join(dir, "home");
  Object.assign(process.env, { USERPROFILE: H, HOME: H, APPDATA: path.join(H, "AppData", "Roaming"), LOCALAPPDATA: path.join(H, "AppData", "Local"),
    ProgramData: path.join(dir, "programdata"), PUBLIC: path.join(dir, "public"), JARVIS_CLAUDE_DESKTOP: path.join(dir, "claude_desktop_config.json"),
    JARVIS_MEMORY: path.join(H, "Argus-Gedaechtnis"), JARVIS_INDEX: path.join(H, "index.txt"), JARVIS_STRATA_URL: "http://127.0.0.1:9" });
  for (const d of [process.env.APPDATA, process.env.LOCALAPPDATA]) fs.mkdirSync(d, { recursive: true });
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ARGUS_OLD_DATA"]) delete process.env[k];
  // Netz: nur lokale Adressen
  const local = (u) => { try { const h = new URL(String(u?.url || u?.href || u)).hostname; return h === "127.0.0.1"; } catch { return false; } };
  const realFetch = globalThis.fetch; globalThis.fetch = (u, o) => (local(u) ? realFetch(u, o) : Promise.reject(new Error("Netz im Test gesperrt")));
  for (const mod of ["http", "https"]) { const m = require(mod), req = m.request, get = m.get;
    const ok = (a) => { const o = typeof a === "string" || a instanceof URL ? new URL(String(a)) : a || {}; const h = o.hostname || o.host || "localhost"; return /^127\.0\.0\.1(:\d+)?$/.test(String(h)); };
    m.request = function (a, ...r) { if (!ok(a)) throw new Error("Netz im Test gesperrt"); return req.call(this, a, ...r); };
    m.get = function (a, ...r) { if (!ok(a)) throw new Error("Netz im Test gesperrt"); return get.call(this, a, ...r); }; }
  const electron = require("electron"); try { electron.Notification.prototype.show = function () {}; } catch {} // keine Benachrichtigungen
  // Globale Kurzbefehle sind eine Windows-weite Ressource: nicht belegen (ein laufendes Argus behält Strg+Umschalt+J)
  Object.assign(electron.globalShortcut, { register: () => true, registerAll: () => {}, unregister: () => {}, unregisterAll: () => {}, isRegistered: () => false });
  app.setLoginItemSettings = () => log({ fail: "setLoginItemSettings aufgerufen" }); // Autostart nie anfassen
  app.whenReady().then(() => electron.session.defaultSession.webRequest.onBeforeRequest((d, done) => done({ cancel: !(local(d.url) || /^(file|data|blob|devtools|chrome|about):/.test(d.url)) })));
  const cfgFile = path.join(dir, "userdata", "argus-config.json"), marker = path.join(dir, "userdata", "ui-start.json");
  const readCfg = () => JSON.parse(fs.readFileSync(cfgFile, "utf8"));
  const step = path.join(dir, "step.txt"), stepN = +(fs.existsSync(step) && fs.readFileSync(step, "utf8")) || 0; fs.writeFileSync(step, String(stepN + 1));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function mainWindow() {
    for (let i = 0; i < 200; i++) {
      const w = electron.BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(x.webContents.getURL()) && !x.webContents.isLoading());
      if (w) return w; await sleep(100);
    }
    throw new Error("Hauptfenster nicht geladen");
  }
  const ui = (w) => w.webContents.executeJavaScript("document.documentElement.dataset.ui");
  const choose = (w, mode) => w.webContents.executeJavaScript(`(() => { const s = document.getElementById("setUiMode"); s.value = ${JSON.stringify(mode)}; s.dispatchEvent(new Event("change")); document.getElementById("setUiApply").click(); return true; })()`);
  app.whenReady().then(async () => {
    try {
      const w = await mainWindow(); await sleep(1000); const mode = await ui(w);
      log({ plan, step: stepN, mode, marker: fs.existsSync(marker) });
      if (plan === "switch" && stepN === 0) {
        // Notiz über die echte Oberfläche schreiben und sichern, dann Anordnung merken
        await w.webContents.executeJavaScript(`(() => { const t = document.getElementById("notesText"); t.value = "Live-Notiz 0.58.26"; t.dispatchEvent(new Event("input", { bubbles: true })); t.dispatchEvent(new Event("blur")); return true; })()`);
        await sleep(1500); fs.writeFileSync(path.join(dir, "before.json"), JSON.stringify(readCfg()));
        await sleep(4000); log({ action: "wechsel", to: "apple" }); await choose(w, "apple");
      } else if (plan === "switch" && stepN === 1) {
        await sleep(5000); log({ check: "bereit", marker: fs.existsSync(marker), cfgMode: readCfg().uiMode });
        log({ action: "wechsel", to: "klassisch" }); await choose(w, "klassisch");
      } else if (plan === "crash" && stepN === 0) {
        log({ action: "absturz vor Bereitschaft", marker: fs.existsSync(marker) }); app.exit(9); // wie ein Absturz: kein Aufräumen, kein Neustart
      } else {
        await sleep(2500); log({ done: true, mode, marker: fs.existsSync(marker), cfg: readCfg() }); app.quit();
      }
    } catch (e) { log({ fail: String(e?.stack || e) }); app.exit(4); }
  });
  // Fehler im Hauptprozess protokollieren und beenden statt eines Fehlerdialogs
  process.on("uncaughtException", (e) => { log({ fail: "uncaught: " + String(e?.stack || e).slice(0, 800) }); app.exit(5); });
  // Abhängigkeiten aus einem vorhandenen node_modules-Ordner (ARGUS_NODE_MODULES), falls der Arbeitsstand keinen eigenen hat
  if (process.env.ARGUS_NODE_MODULES) { process.env.NODE_PATH = process.env.ARGUS_NODE_MODULES; require("module")._initPaths(); }
  require(path.join(ROOT, "main.js"));
}

// ---------- Testablauf ----------
function runner() {
  const assert = require("node:assert/strict"), { spawn } = require("child_process");
  const base = fs.mkdtempSync(path.join(process.env.ARGUS_TEST_ROOT || os.tmpdir(), "ui-live-"));
  const entries = (dir) => (fs.existsSync(path.join(dir, "log.jsonl")) ? fs.readFileSync(path.join(dir, "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  const until = async (dir, pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const e = entries(dir); if (pred(e)) return e; await new Promise((r) => setTimeout(r, 300)); } throw new Error("Zeitlimit; Protokoll: " + JSON.stringify(entries(dir)).slice(-1500)); };
  const start = (dir, plan) => { const env = { ...process.env, ARGUS_IT_DIR: dir, ARGUS_IT_PLAN: plan }; delete env.ELECTRON_RUN_AS_NODE;
    spawn(process.execPath, [__filename], { env, stdio: "ignore", detached: false }).unref(); };
  const seed = (name, cfg) => { const dir = path.join(base, name); fs.mkdirSync(path.join(dir, "userdata"), { recursive: true }); fs.mkdirSync(path.join(dir, "home"), { recursive: true });
    fs.writeFileSync(path.join(dir, "home", "index.txt"), ""); // frisches Dateiverzeichnis: kein Durchsuchen der Laufwerke
    // Reduziertes Profil wie tests/vm/harness-isolated.js: keine Schlüssel, Hintergrund- und Fremdanbindungen aus
    const quiet = { setupDone: true, autostart: false, claudeDesktopLink: false, discordAuto: false, backend: "none", crashReport: false, voiceOutput: false, micOnStart: false,
      sensors: false, sensorsAsked: true, strataOn: false, ollamaUrl: "http://127.0.0.1:9", systemWatch: false, mediaOn: false, steamDl: false, steamOn: false, discordOn: false,
      newsOn: false, tradeOn: false, weatherOn: false, iobOn: false, portalOn: false, fmDashOn: false, foremanOn: false, miningOn: false, mineOn: false, briefOn: false, reportOn: false, updateUrl: "" };
    fs.writeFileSync(path.join(dir, "userdata", "argus-config.json"), JSON.stringify({ ...quiet, ...cfg })); return dir; };
  // Wächter: echte Claude-Desktop-Konfigurationen dürfen sich durch den Test nicht ändern
  const realCd = () => { const L = process.env.LOCALAPPDATA || "", out = [path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json")];
    for (const base of [path.join(L, "Packages"), path.join(L, "Claude-Data")]) { try { for (const d of fs.readdirSync(base)) for (const f of [path.join(base, d, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"), path.join(base, d, "claude_desktop_config.json")]) out.push(f); } catch {} }
    return Object.fromEntries(out.filter((f) => fs.existsSync(f)).map((f) => [f, fs.statSync(f).mtimeMs + ":" + require("crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex")])); };
  const cdBefore = realCd();
  (async () => {
    // 1) Klassisch → Apple → Klassisch mit echtem Neustart
    const a = seed("wechsel", { uiMode: "klassisch", pins: { friends: { a: 1.25, r: 2.5 } }, friendsBox: { w: 222, h: 333 } });
    start(a, "switch");
    const e = await until(a, (l) => l.some((x) => x.done || x.fail), 150000);
    assert(!e.some((x) => x.fail), "kein Fehler: " + JSON.stringify(e.filter((x) => x.fail)));
    const starts = e.filter((x) => x.plan && x.mode); assert.deepEqual(starts.map((x) => x.mode), ["klassisch", "apple", "klassisch"], "Oberflächen nach jedem Neustart");
    assert.equal(new Set(e.map((x) => x.pid)).size, 3, "drei getrennte Prozesse (echte Neustarts)");
    const ready = e.find((x) => x.check === "bereit"); assert.equal(ready.marker, false, "Startsicherung nach Bereitschaft gelöscht"); assert.equal(ready.cfgMode, "apple");
    const done = e.find((x) => x.done), before = JSON.parse(fs.readFileSync(path.join(a, "before.json"), "utf8"));
    assert.equal(done.cfg.uiMode, "klassisch"); assert.equal(done.marker, false);
    for (const k of ["notesByPage", "pins", "friendsBox", "pageLayouts", "pages", "widgets", "setupDone"]) if (k in before) assert.deepEqual(done.cfg[k], before[k], "unverändert: " + k);
    assert.match(JSON.stringify(done.cfg.notesByPage || done.cfg.notesText || ""), /Live-Notiz 0\.58\.26/, "Notiz erhalten");
    assert.deepEqual(done.cfg.friendsBox, before.friendsBox); assert.equal(done.cfg.pins.friends.a, 1.25);
    // 2) Apple-Start stürzt vor der Bereitschaft ab → nächster Start einmal Klassisch, Einstellung zurückgesetzt, keine Schleife
    const c = seed("absturz", { uiMode: "apple", friendsBox: { w: 210, h: 310 } });
    start(c, "crash"); await until(c, (l) => l.some((x) => x.action || x.fail), 90000); await new Promise((r) => setTimeout(r, 2500));
    start(c, "crash");
    const ce = await until(c, (l) => l.some((x) => x.done || x.fail), 90000);
    assert(!ce.some((x) => x.fail), "kein Fehler: " + JSON.stringify(ce.filter((x) => x.fail)));
    assert.equal(ce.find((x) => x.action).marker, true, "Startsicherung lag beim Absturz vor");
    const cd = ce.find((x) => x.done); assert.equal(cd.mode, "klassisch"); assert.equal(cd.cfg.uiMode, "klassisch"); assert.equal(cd.marker, false);
    assert.deepEqual(cd.cfg.friendsBox, { w: 210, h: 310 }, "übrige Einstellungen unverändert");
    assert.equal(ce.filter((x) => x.plan && x.mode).length, 2, "kein weiterer automatischer Start");
    assert.deepEqual(realCd(), cdBefore, "echte Claude-Desktop-Konfiguration unverändert");
    console.log("PASS ui-switch-live: echter Hauptprozess, Klassisch→Apple→Klassisch mit 3 Neustarts, Startsicherung bestätigt, Notiz/Anordnung erhalten; Absturz vor Bereitschaft → einmal Klassisch ohne Schleife");
    app.exit(0);
  })().catch((err) => { console.error(err?.stack || err); console.error("Ordner: " + base);
    try { assert.deepEqual(realCd(), cdBefore); } catch { console.error("WARNUNG: echte Claude-Desktop-Konfiguration hat sich geändert, bitte prüfen"); } app.exit(1); });
}
