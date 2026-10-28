// Electron-Test U7: echter Start über boot.js mit vorbereitetem Marker und Sicherung. NUR in der Test-VM.
// Aufruf je Lauf ein eigener Prozess:  electron tests\vm\ui-hotfix-boot.test.js <lauf-nr>
"use strict";
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const H = require("./harness-isolated").setup({ entry: "boot", label: "u7-" + (process.argv.slice(-1)[0] || "1") });
const { UD, check, finish, wait, mainWindow, calls } = H;
const put = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
put(path.join(UD, ".umzug-von-jarvis.json"), "{}"); // bereits umgezogen
put(path.join(UD, "selfimprove-pending.json"), JSON.stringify({ backup: path.join(UD, "backups", "2026-01-01"), started: true }));
put(path.join(UD, "backups", "2026-01-01", "main.js"), "// SENTINEL-ALT");
const before = { marker: sha(path.join(UD, "selfimprove-pending.json")), backup: sha(path.join(UD, "backups", "2026-01-01", "main.js")) };
const appDir = path.join(__dirname, "..", ".."), mainBefore = sha(path.join(appDir, "main.js"));

require(path.join(appDir, "boot.js"));

require("electron").app.whenReady().then(async () => {
  try {
    const w = await mainWindow(); check("U7 Fenster erscheint", !!w);
    await wait(20000); // über den ersten Indexierungslauf (8 s) hinaus
    check("U7 kein Neustart", calls.relaunch === 0, calls.relaunch);
    check("U7 Marker unverändert", sha(path.join(UD, "selfimprove-pending.json")) === before.marker);
    check("U7 Sicherung unverändert", sha(path.join(UD, "backups", "2026-01-01", "main.js")) === before.backup);
    check("U7 Programmordner nicht zurückgespielt", sha(path.join(appDir, "main.js")) === mainBefore && !fs.readFileSync(path.join(appDir, "main.js"), "utf8").includes("SENTINEL-ALT"));
    check("U7 Wächter", !H.violations.length, H.violations);
    finish();
  } catch (e) { check("TESTLAUF", false, String(e && e.stack || e)); finish(4); }
});
