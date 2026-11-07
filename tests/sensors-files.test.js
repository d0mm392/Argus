// Die Temperaturmessung braucht Treiber-Setup und Messbibliothek im Paket (fehlten in 0.58.2 bis 0.59.2)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkSensors, REQUIRED } = require("../scripts/check-sensors.js");
const SRC = path.join(__dirname, "..", "sensors");

test("Sensor-Ordner ist vollständig und alle Prüfsummen stimmen", () => {
  assert.deepStrictEqual(checkSensors(), []);
  for (const f of REQUIRED) assert.ok(fs.existsSync(path.join(SRC, f)), f);
});

test("fehlende oder veränderte Datei wird erkannt", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "argus-sens-"));
  try {
    for (const f of fs.readdirSync(SRC)) fs.copyFileSync(path.join(SRC, f), path.join(tmp, f));
    fs.unlinkSync(path.join(tmp, "PawnIO_setup.exe"));
    fs.appendFileSync(path.join(tmp, "HidSharp.dll"), "x");
    fs.writeFileSync(path.join(tmp, "Fremd.dll"), "x");
    const p = checkSensors(tmp);
    assert.ok(p.includes("fehlt: PawnIO_setup.exe"), p.join("; "));
    assert.ok(p.includes("Prüfsumme falsch: HidSharp.dll"), p.join("; "));
    assert.ok(p.includes("nicht in SHA256SUMS.txt: Fremd.dll"), p.join("; "));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Bau-Konfiguration ruft die Prüfung auf und packt den Ordner ein", () => {
  const pkg = require("../package.json");
  assert.strictEqual(pkg.build.beforePack, "scripts/check-sensors.js");
  assert.ok(pkg.build.files.includes("sensors/**"));
});

test("setup.ps1 prüft Dateien vorab und überspringt die Prüfliste beim Kopieren", () => {
  const s = fs.readFileSync(path.join(SRC, "setup.ps1"), "utf8");
  assert.match(s, /Sensor-Dateien fehlen im Argus-Ordner/);
  assert.match(s, /Get-FileHash -Algorithm SHA256/);
  assert.match(s, /Get-AuthenticodeSignature/);
  assert.match(s, /-Exclude "PawnIO_setup.exe", "setup.ps1", "SHA256SUMS.txt"/);
});

test("Erststart installiert den Treiber nicht ohne Klick", () => {
  const m = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.doesNotMatch(m, /if \(!config\.sensorsAsked \|\| oldVer\)/);
  assert.match(m, /if \(oldVer\) setupSensors\(\); else \{ sensorState = "bereit"/);
  assert.match(m, /sensorFilesMissing\(\)/);
});
