// Prüft vor jedem Bau, dass alle Dateien des Messdiensts (sensors/) da und unverändert sind.
// Hintergrund: Ab 0.58.2 fehlten PawnIO_setup.exe und LibreHardwareMonitorLib.dll samt Abhängigkeiten im Setup,
// weil sie nie im Repo lagen. Ohne sie bricht setup.ps1 ab und Argus misst keine Temperaturen.
// Läuft als electron-builder "beforePack" beim Windows-Bau (bricht ihn ab) und von Hand: node scripts/check-sensors.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(__dirname, "..", "sensors");
const REQUIRED = ["setup.ps1", "sensors.ps1", "version.txt", "LIZENZEN.txt", "SHA256SUMS.txt", "PawnIO_setup.exe", "LibreHardwareMonitorLib.dll"];

function readSums(dir = DIR) {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(dir, "SHA256SUMS.txt"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) out.set(m[2].trim(), m[1].toLowerCase());
  }
  return out;
}

function checkSensors(dir = DIR) {
  const problems = [];
  for (const f of REQUIRED) if (!fs.existsSync(path.join(dir, f))) problems.push(`fehlt: ${f}`);
  if (problems.some((p) => p.endsWith("SHA256SUMS.txt"))) return problems;
  const sums = readSums(dir);
  for (const [f, want] of sums) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { problems.push(`fehlt: ${f}`); continue; }
    const got = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    if (got !== want) problems.push(`Prüfsumme falsch: ${f}`);
  }
  // Jede Bibliothek im Ordner muss in der Liste stehen, damit nichts Ungeprüftes mitgeliefert wird
  for (const f of fs.readdirSync(dir)) if (/\.(dll|exe)$/i.test(f) && !sums.has(f)) problems.push(`nicht in SHA256SUMS.txt: ${f}`);
  return problems;
}

function guard() {
  const problems = checkSensors();
  if (problems.length) throw new Error("Sensor-Dateien unvollständig, Bau abgebrochen:\n  " + problems.join("\n  "));
}

module.exports = async function beforePack(ctx) {
  if (ctx && ctx.electronPlatformName !== "win32") return;
  guard();
  // Gleiche Falle bei Discord: discord-runtime liegt nicht im Repo (Discord-SDK-Bedingungen) und muss vor dem Bau bereitliegen
  if (!fs.existsSync(path.join(__dirname, "..", "discord-runtime", "argus-discord-social.exe"))) console.warn("WARNUNG: discord-runtime/ fehlt, das Setup hat dann keine Discord-Anbindung (siehe native/README.md)");
};
module.exports.checkSensors = checkSensors;
module.exports.REQUIRED = REQUIRED;

if (require.main === module) {
  try { guard(); console.log("Sensor-Dateien vollständig."); } catch (e) { console.error(e.message); process.exit(1); }
}
