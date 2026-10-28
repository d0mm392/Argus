// Startet Argus. Ging der letzte Start nach einer Selbstverbesserung schief, wird vorher die Sicherung zurückgeholt.
// Diese Datei ändert die Selbstverbesserung nie, damit der Rückweg immer funktioniert.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

// Umzug Jarvis → Argus (0.30): Datenordner %APPDATA%\jarvis-desktop einmalig nach %APPDATA%\argus-desktop kopieren.
// Der alte Ordner bleibt unverändert als Sicherung liegen. Klappt das Kopieren nicht, läuft Argus mit dem alten Ordner weiter
// und versucht es beim nächsten Start erneut. Caches werden nicht mitkopiert, die baut Chromium neu auf.
(function moveData() {
  const appData = app.getPath("appData"), newUD = path.join(appData, "argus-desktop");
  const oldUD = ["jarvis-desktop", "Jarvis"].map((n) => path.join(appData, n)).find((d) => fs.existsSync(path.join(d, "jarvis-config.json"))) || path.join(appData, "jarvis-desktop");
  const done = path.join(newUD, ".umzug-von-jarvis.json");
  if (fs.existsSync(done) || !fs.existsSync(path.join(oldUD, "jarvis-config.json"))) { app.setPath("userData", newUD); return; }
  const SKIP = new Set(["Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "ShaderCache", "GrShaderCache", "Crashpad", "blob_storage",
    "SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "selfimprove-pending.json"]);
  try {
    fs.mkdirSync(newUD, { recursive: true });
    fs.cpSync(oldUD, newUD, { recursive: true, force: true, filter: (src) => !SKIP.has(path.basename(src)) });
    fs.copyFileSync(path.join(oldUD, "jarvis-config.json"), path.join(newUD, "argus-config.json"));
    JSON.parse(fs.readFileSync(path.join(newUD, "argus-config.json"), "utf8")); // Kopie lesbar? Sonst Ausnahme → alter Ordner
    fs.writeFileSync(done, JSON.stringify({ von: oldUD, am: new Date().toISOString() }));
    try { fs.writeFileSync(path.join(oldUD, "UMGEZOGEN.txt"), "Argus nutzt jetzt " + newUD + ".\r\nDieser Ordner ist nur noch eine Sicherung und kann gelöscht werden, wenn alles läuft.\r\n"); } catch {}
    app.setPath("userData", newUD);
  } catch (e) {
    app.setPath("userData", oldUD);
    process.env.ARGUS_OLD_DATA = "1"; // main.js liest dann jarvis-config.json
    try { fs.appendFileSync(path.join(oldUD, "jarvis-error.log"), `[${new Date().toISOString()}] Umzug nach ${newUD} fehlgeschlagen: ${e.stack || e}\n`); } catch {}
  }
})();

const marker = path.join(app.getPath("userData"), "selfimprove-pending.json");
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === "boot.js" || e.name === "package.json") continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}
function rollback(m) {
  try { fs.unlinkSync(marker); } catch {}
  try { if (m?.backup && fs.existsSync(m.backup)) copyTree(m.backup, __dirname); } catch {}
}

let pending = null;
try { pending = JSON.parse(fs.readFileSync(marker, "utf8")); } catch {}
if (pending?.started) { rollback(pending); pending = null; } // zweiter Start ohne Bestätigung: die Änderung taugt nicht
else if (pending) { pending.started = true; try { fs.writeFileSync(marker, JSON.stringify(pending)); } catch {} }

try {
  require("./main.js");
} catch (e) {
  try { fs.appendFileSync(path.join(app.getPath("userData"), process.env.ARGUS_OLD_DATA ? "jarvis-error.log" : "argus-error.log"), `[${new Date().toISOString()}] Start fehlgeschlagen: ${e.stack || e}\n`); } catch {}
  if (pending) { rollback(pending); app.relaunch(); }
  app.exit(1);
}
