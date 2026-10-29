"use strict";
// Moduswechsel Klassisch/Apple: Startsicherung, Rückfall ohne Neustartschleife, Wechselprüfung, HTML-Merkmal. Reines Node.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), os = require("os");
const M = require("../app/ui-mode");
const dir = () => fs.mkdtempSync(path.join(process.env.ARGUS_TEST_ROOT || os.tmpdir(), "ui-mode-"));

test("Standard und unbekannte Werte sind Klassisch, ohne Startsicherung", () => {
  for (const v of [undefined, null, "", "classic", "Apple", "skins", 1]) {
    const d = dir(); assert.deepEqual(M.decideStart(d, v), { mode: "klassisch", fallback: false }, String(v)); assert.equal(fs.existsSync(M.markerPath(d)), false);
  }
});

test("Apple-Start legt die Startsicherung an, Bereitschaft löscht sie", () => {
  const d = dir(); const r = M.decideStart(d, "apple", Date.UTC(2026, 9, 29));
  assert.deepEqual(r, { mode: "apple", fallback: false }); assert.equal(JSON.parse(fs.readFileSync(M.markerPath(d), "utf8")).mode, "apple");
  assert.equal(M.confirmStart(d), true); assert.equal(fs.existsSync(M.markerPath(d)), false);
  assert.deepEqual(M.decideStart(d, "apple"), { mode: "apple", fallback: false }, "nach bestätigtem Start erneut Apple");
});

test("Gescheiterter Apple-Start: einmal Klassisch, keine Schleife", () => {
  const d = dir(); M.decideStart(d, "apple"); // Start ohne Bereitschaftsmeldung (Absturz)
  const r = M.decideStart(d, "apple"); assert.equal(r.mode, "klassisch"); assert.equal(r.fallback, true); assert.ok(r.failedAt);
  assert.equal(fs.existsSync(M.markerPath(d)), false, "Rückfall-Start legt keine neue Startsicherung an");
  // main.js setzt danach uiMode auf klassisch; der folgende Start ist ein normaler Klassisch-Start
  assert.deepEqual(M.decideStart(d, "klassisch"), { mode: "klassisch", fallback: false });
  // Auch wenn die Einstellung (z. B. durch eine Sicherung) wieder auf apple stünde, entsteht nur ein neuer, geprüfter Versuch
  assert.deepEqual(M.decideStart(d, "apple"), { mode: "apple", fallback: false });
});

test("Verwaiste oder fremde Startsicherung wird verworfen", () => {
  const d = dir(); fs.writeFileSync(M.markerPath(d), "kein json"); assert.deepEqual(M.decideStart(d, "klassisch"), { mode: "klassisch", fallback: false }); assert.equal(fs.existsSync(M.markerPath(d)), false);
  fs.writeFileSync(M.markerPath(d), JSON.stringify({ mode: "anders" })); assert.deepEqual(M.decideStart(d, "klassisch"), { mode: "klassisch", fallback: false });
  // Unlesbare Startsicherung bei eingestelltem Apple-Modus: als gescheiterter Start behandeln (vorsichtig), danach kein Rest
  fs.writeFileSync(M.markerPath(d), "{abgeschnitten"); const r = M.decideStart(d, "apple"); assert.equal(r.mode, "klassisch"); assert.equal(r.fallback, true); assert.equal(fs.existsSync(M.markerPath(d)), false);
});

test("Startsicherung mit Lesefehler (kein ENOENT) gilt als gescheitert", () => {
  const d = dir(); fs.mkdirSync(M.markerPath(d)); // Ordner statt Datei: readFileSync wirft EISDIR
  const r = M.decideStart(d, "apple"); assert.equal(r.mode, "klassisch"); assert.equal(r.fallback, true);
  assert.equal(fs.existsSync(M.markerPath(d)), true, "ein Ordner wird nicht rekursiv gelöscht");
  assert.equal(M.decideStart(d, "apple").mode, "klassisch", "solange er besteht, bleibt es beim sicheren Rückfall");
  const d2 = dir(); fs.mkdirSync(M.markerPath(d2)); assert.deepEqual(M.decideStart(d2, "klassisch"), { mode: "klassisch", fallback: false });
});

test("Wechselprüfung", () => {
  assert.equal(M.switchCheck("apple", "klassisch", []).ok, true);
  assert.equal(M.switchCheck("klassisch", "apple", [false, null]).ok, true);
  assert.match(M.switchCheck("apple", "apple", []).text, /bereits aktiv/);
  assert.match(M.switchCheck("skins", "klassisch", []).text, /Unbekannte/);
  const b = M.switchCheck("apple", "klassisch", ["ein Update-Download", false]); assert.equal(b.ok, false); assert.match(b.text, /Update-Download/);
});

test("HTML-Merkmal vor dem ersten Zeichnen", () => {
  assert.equal(M.markHtml('<!doctype html><html lang="de"><head>', "apple"), '<!doctype html><html lang="de" data-ui="apple"><head>');
  assert.equal(M.markHtml('<html data-ui="apple" lang="de">', "klassisch"), '<html lang="de" data-ui="klassisch">');
  assert.equal(M.markHtml("<HTML>", "x"), '<html data-ui="klassisch">');
  const idx = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8"); assert.match(M.markHtml(idx, "apple"), /<html[^>]*data-ui="apple"/);
});

test("main.js: Wechsel nur über ui-mode-switch, uiMode nicht frei setzbar, Rückweg im Tray", () => {
  const m = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const settable = m.slice(m.indexOf("const SETTABLE = {"), m.indexOf("};", m.indexOf("const SETTABLE = {")));
  assert.ok(!/\buiMode\s*:/.test(settable), "uiMode nicht über set-config änderbar");
  assert.ok(m.includes('uiStart = uiMode.decideStart(app.getPath("userData"), config.uiMode)'));
  const sw = m.slice(m.indexOf("function switchUi(target) {"), m.indexOf('ipcMain.handle("ui-mode-switch"'));
  assert.ok(m.includes('ipcMain.handle("ui-mode-switch", (_e, target) => switchUi(target))'), "Einstellungen nutzen switchUi");
  // Regulär beenden (before-quit/will-quit laufen: Speichern, Notizen, eigene Prozesse), kein app.exit
  assert.ok(/app\.relaunch\(\); app\.quit\(\);/.test(sw) && sw.indexOf("app.relaunch()") > sw.indexOf("writeConfigNow()") && !/app\.exit\(/.test(sw), "erst speichern, dann Neustart über app.quit");
  assert.ok(/uiRelaunching/.test(sw), "nur ein Neustart");
  assert.ok(sw.includes("catch (e) { config.uiMode = prev;") && sw.indexOf("uiRelaunching = true") > sw.indexOf("writeConfigNow()"), "Schreibfehler: Modus zurück, keine Sperre, kein Neustart");
  const tray = m.slice(m.indexOf('label: "Oberfläche: Klassisch wiederherstellen"') - 200, m.indexOf('label: "Oberfläche: Klassisch wiederherstellen"') + 300);
  assert.ok(tray.includes('switchUi("klassisch")') && !tray.includes("restartForUi"), "Tray nutzt dieselbe Prüfung");
  assert.ok(/uiMode: "klassisch"/.test(m.slice(m.indexOf("const DEFAULTS = {"), m.indexOf("const DEFAULTS = {") + 400)), "Standard Klassisch");
});
