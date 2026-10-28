// Startet Argus. Seit 0.58.20 gibt es keinen automatischen Rollback nach einer Selbstverbesserung mehr (abgeschaltet,
// siehe selfimprove.js): Marker und Sicherungen werden nicht gelesen und nicht zurückgespielt.
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
  // Daten der Selbstverbesserung (Arbeitsordner, Archive, Sicherungen, Marker) liegen nur direkt im Profil und werden nicht übernommen
  const sv = (n) => { const l = n.toLowerCase(); return l === "selfimprove-stage" || l === "backups" || l === "selfimprove-pending.json" || l.startsWith("selfimprove-verworfen-"); };
  // fs.cpSync übergibt dem Filter unter Node 20 (Electron 33) Pfade mit \\?\-Präfix: vor dem Vergleich entfernen
  const plain = (p) => path.resolve(String(p).replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "")).toLowerCase();
  const top = plain(oldUD);
  try {
    fs.mkdirSync(newUD, { recursive: true });
    fs.cpSync(oldUD, newUD, { recursive: true, force: true,
      filter: (src) => !SKIP.has(path.basename(src)) && !(plain(path.dirname(src)) === top && sv(path.basename(src))) });
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

try {
  require("./main.js");
} catch (e) {
  // Beim allerersten Start existiert der Datenordner noch nicht; ohne ihn ginge der Eintrag verloren
  try { const ud = app.getPath("userData"); fs.mkdirSync(ud, { recursive: true }); fs.appendFileSync(path.join(ud, process.env.ARGUS_OLD_DATA ? "jarvis-error.log" : "argus-error.log"), `[${new Date().toISOString()}] Start fehlgeschlagen: ${e.stack || e}\n`); } catch {}
  app.exit(1);
}
