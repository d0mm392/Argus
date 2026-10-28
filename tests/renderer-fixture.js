"use strict";
// Real product renderer + preload, synthetic IPC. Never loads main.js or user data.
const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("fs"), path = require("path"), http = require("http"), vm = require("vm"), os = require("os");
const ROOT = path.resolve(process.env.ARGUS_PRODUCT_ROOT || path.join(__dirname, ".."));
// Test failures must terminate with a log, never leave Electron's native error
// dialog waiting on the user's desktop.
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, error => {
  console.error(error?.stack || error); app.exit(1);
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "argus-renderer-fixture-"));
app.setPath("userData", profile);
app.on("window-all-closed", () => {});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup() {
  // Evaluate only the defaults literal in an empty context, never executable
  // startup code. Fail explicitly if its boundaries change.
  const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  const start = main.indexOf("const DEFAULTS = "), end = main.indexOf("\nlet config =");
  if (start < 0 || end <= start) throw Error("Defaults literal not found");
  const literal = main.slice(start + "const DEFAULTS = ".length, end).replace(/;\s*$/, "");
  const config = vm.runInNewContext("(" + literal + ")", { process: { env: {} } }, { timeout: 1000 });
  Object.assign(config, { setupDone: true, micOnStart: false, voiceOutput: false,
    backend: "none", strataOn: false, notesOn: true, notesText: "Synthetic Start note",
    weatherOn: false, miningOn: true, mineOn: true, pagesOn: true, version: "TEST", dcBot: { status: "aus", guilds: [] },
    voice: { ready: false, text: "Test microphone off" }, system: null });
  Object.assign(config, require(path.join(ROOT, "app/youtube-settings")).migrate(config));
  Object.assign(config, require(path.join(ROOT, "app/appearance")).migrate(config));
  Object.assign(config, require(path.join(ROOT, "app/notes-store")).migrate(config, () => "fixture"));
  const channels = [...fs.readFileSync(path.join(ROOT, "preload.js"), "utf8").matchAll(/ipcRenderer.invoke\("([^"]+)"/g)].map(m => m[1]);
  for (const channel of channels) ipcMain.handle(channel, (_event, patch) => {
    if (channel === "get-config") return config;
    if (channel === "set-config") { Object.assign(config, patch); return true; }
    if (channel === "sensor-status") return "aus";
    if (channel === "self-offer") return null;
    if (channel === "voice-list") return { voices: [], win: false };
    if (channel === "backend-info") return { kind: "none", label: "Isolated test" };
    if (channel === "ai-status") return { kind: "none" };
    if (/list|voices|accounts|hist|days|sources|archive/.test(channel)) return [];
    if (channel === "portal-data") return { on: false };
    if (channel === "trade-data") return { q: {}, m: {} };
    return {};
  });
  const errors = [];
  ipcMain.on("ui-error", (_event, message, stack) => errors.push({ message, stack }));
  const appRoot = path.join(ROOT, "app");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/vosk.js") { response.setHeader("Content-Type", "application/javascript"); return response.end("window.Vosk = {};"); }
    const file = path.resolve(appRoot, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(appRoot + path.sep)) { response.writeHead(403); return response.end(); }
    fs.readFile(file, (error, bytes) => {
      response.setHeader("Content-Type", file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
      if (error) { response.writeHead(404); return response.end(); }
      response.end(bytes);
    });
  });
  await app.whenReady();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const menuUrl = require("url").pathToFileURL(path.join(appRoot, "menu.html")).href;
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({ cancel: details.url !== menuUrl && !details.url.startsWith(base + "/") && !/^(data:|blob:)/.test(details.url) }));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, done) => done(false));
  const window = new BrowserWindow({ width: 1280, height: 900, frame: false, show: false, webPreferences: {
    preload: path.join(ROOT, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
  } });
  ipcMain.on("notes-flush", (event, snapshot) => {
    event.returnValue = false;
    if (event.sender !== window.webContents) return;
    event.returnValue = require(path.join(ROOT, "app/notes-persistence")).flush(config, snapshot,
      () => fs.writeFileSync(path.join(profile, "notes-backup.json"), JSON.stringify(config.notesByPage)),
      () => fs.writeFileSync(path.join(profile, "synthetic-config.json"), JSON.stringify(config)));
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2 && !/Electron Security Warning/.test(message)) errors.push(message);
  });
  await window.loadURL(base); window.showInactive(); window.webContents.send("expanded", true);
  await wait(1200);
  const evaluate = code => window.webContents.executeJavaScript(code);
  const evaluateWithValue = (fn, value) => evaluate(`(${fn.toString()})(${JSON.stringify(value)})`);
  return { app, window, config, errors, wait, evaluate, evaluateWithValue, profile, root: ROOT,
    screenshot: async name => {
      const out = process.env.ARGUS_TEST_ARTIFACTS || profile;
      fs.mkdirSync(out, { recursive: true });
      const file = path.join(out, name + ".png");
      fs.writeFileSync(file, (await window.capturePage()).toPNG()); return file;
    } };
}
module.exports = { setup };
