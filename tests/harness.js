// Gemeinsamer Start für UI-Tests: frischer, leerer Datenordner + Test-Konfiguration, nichts von echten Nutzerdaten.
const { app, BrowserWindow } = require("electron"); const fs = require("fs"), os = require("os"), path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argus-ui-")); app.setPath("userData", dir);
fs.writeFileSync(path.join(dir, "argus-config.json"), JSON.stringify({ setupDone: true, crashReport: false, updateChannel: "updates", autoUpdate: false, ballOn: true, pagesOn: true, mineOn: true, miningOn: true }));
const errs = [], mainErrs = [];
process.on("uncaughtException", (e) => mainErrs.push(String(e && e.stack || e).slice(0, 300)));
app.on("web-contents-created", (_e, wc) => wc.on("console-message", (_e2, lvl, msg) => { if (lvl >= 2 && !/Security|ResizeObserver loop|Canvas2D|ScriptProcessorNode|Vosk|^\d+$|streamkit/.test(msg)) errs.push(msg); }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (id, ok, info) => { results.push({ id, ok: !!ok, info }); console.log((ok ? "PASS " : "FAIL ") + id + (ok ? "" : "  → " + JSON.stringify(info))); };
async function run(body) {
  require(path.join(__dirname, "..", "main.js"));
  await app.whenReady(); setTimeout(() => { console.log("TIMEOUT"); app.exit(2); }, 150000);
  await wait(12000);
  const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "Argus");
  if (!w) { check("START", false, "Hauptfenster fehlt"); return app.exit(1); }
  const ev = (c) => w.webContents.executeJavaScript(c);
  const menus = () => BrowserWindow.getAllWindows().filter((x) => /^Argus (Menü|Untermenü)$/.test(x.getTitle()) && x.isVisible());
  try { await body({ w, ev, wait, check, menus, BrowserWindow, app, dir }); } catch (e) { check("TESTLAUF", false, String(e.stack || e)); }
  check("R-QUAL-1 keine Konsolenfehler im Renderer", errs.length === 0, errs.slice(0, 5));
  check("R-QUAL-2 keine Fehler im Hauptprozess (z. B. frische Installation ohne gespeicherte Ansicht)", mainErrs.length === 0, mainErrs.slice(0, 3));
  const bad = results.filter((r) => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} bestanden`); app.exit(bad ? 1 : 0);
}
module.exports = { run };
