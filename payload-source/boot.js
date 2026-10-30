// Startet Argus. Seit 0.58.20 gibt es keinen automatischen Rollback nach einer Selbstverbesserung mehr (abgeschaltet,
// siehe selfimprove.js): Marker und Sicherungen werden nicht gelesen und nicht zurückgespielt.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

// Umzug Jarvis → Argus (0.30): Datenordner %APPDATA%\jarvis-desktop einmalig nach %APPDATA%\argus-desktop kopieren.
// Der alte Ordner bleibt unverändert als Sicherung liegen. Klappt das Kopieren nicht, läuft Argus mit dem alten Ordner weiter
// und versucht es beim nächsten Start erneut. Caches werden nicht mitkopiert, die baut Chromium neu auf.
// Diagnose: keine Migration und kein Zugriff auf das produktive Profil.
const diagnosticRoot = process.env.ARGUS_DIAGNOSTIC_ROOT || path.resolve(__dirname, '../../diagnose-daten');
fs.mkdirSync(diagnosticRoot, {recursive:true});
app.setName('Argus-Startdiagnose');
app.setPath('userData', diagnosticRoot);
app.setPath('sessionData', diagnosticRoot);
delete process.env.ARGUS_OLD_DATA;
process.env.JARVIS_MEMORY = path.join(diagnosticRoot, 'Gedaechtnis');
process.env.JARVIS_INDEX = path.join(diagnosticRoot, 'dateiindex.txt');
require('./startup-diagnostic').init(app, diagnosticRoot);


try {
  require("./main.js");
} catch (e) {
  // Beim allerersten Start existiert der Datenordner noch nicht; ohne ihn ginge der Eintrag verloren
  try { const ud = app.getPath("userData"); fs.mkdirSync(ud, { recursive: true }); fs.appendFileSync(path.join(ud, process.env.ARGUS_OLD_DATA ? "jarvis-error.log" : "argus-error.log"), `[${new Date().toISOString()}] Start fehlgeschlagen: ${e.stack || e}\n`); } catch {}
  app.exit(1);
}
