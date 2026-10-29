"use strict";
// 0.58.27: Apple-Modus vorübergehend entfernt (gesichert unter archiv/apple-modus-0.58.26). Klassisch ist die einzige Oberfläche;
// gespeicherte Apple-Wahl und liegengebliebene Startsicherung werden beim Start bereinigt, sonst bleibt das Profil unverändert.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
test("keine Apple-Modus-Dateien und -Verweise im Produkt", () => {
  for (const f of ["app/apple.css", "app/ui-mode.js", "app/js/20-apple-modus.js"]) assert.equal(fs.existsSync(path.join(root, f)), false, f);
  const idx = fs.readFileSync(path.join(root, "app/index.html"), "utf8"), pre = fs.readFileSync(path.join(root, "preload.js"), "utf8"), menu = fs.readFileSync(path.join(root, "app/menu.html"), "utf8");
  assert.doesNotMatch(idx, /apple\.css|20-apple-modus|setUiMode/); assert.doesNotMatch(pre, /uiModeSwitch|uiReady/); assert.doesNotMatch(menu, /body\.ap\b/);
});
test("Startmigration: nur uiMode apple → klassisch und ui-start.json (Datei) entfernen", () => {
  const m = fs.readFileSync(path.join(root, "main.js"), "utf8").replace(/\r\n/g, "\n");
  const i = m.indexOf("app.whenReady().then(async () => {"), block = m.slice(i, i + 1200);
  assert.match(block, /if \(config\.uiMode === "apple"\) \{ config\.uiMode = "klassisch"; writeConfigNow\(\); \}/);
  assert.match(block, /fs\.rmSync\(path\.join\(app\.getPath\("userData"\), "ui-start\.json"\)\); \} catch \{\}/);
  assert.doesNotMatch(block, /recursive/); assert.doesNotMatch(m, /ui-mode-switch|uiStart\b|require\("\.\/app\/ui-mode"\)/);
});
