"use strict";
// 0.58.27: Fehler im Startablauf dürfen nicht spurlos verschwinden (vorher: kein Fenster, kein Log, unsichtbarer Prozess hält die Einzelinstanz-Sperre).
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const m = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8").replace(/\r\n/g, "\n");
const start = m.indexOf("app.whenReady().then(async () => {"), end = m.indexOf("\n}).catch(", m.indexOf("startMarket();", start));
const body = m.slice(start, end + 4), tail = m.slice(end, end + 900);
test("Startablauf hat einen Abschluss-Handler: protokollieren, melden, beenden", () => {
  assert.match(tail, /^\n\}\)\.catch\(\(e\) => \{/);
  assert.match(tail, /logError\(new Error\("Start fehlgeschlagen: "/); assert.match(tail, /crash\.add\("Start fehlgeschlagen"/);
  assert.match(tail, /dialog\.showErrorBox\(/); assert.match(tail, /app\.exit\(1\)/);
});
test("abgelehnte Promises werden protokolliert", () => assert.match(m, /process\.on\("unhandledRejection", \(e\) => \{ logError\(e\);/));
test("Schritte vor und nach dem Fenster sind einzeln abgesichert", () => {
  for (const s of ["Einstellungen laden", "Discord-Konto", "Berechtigungen", "Tray", "Autostart", "Updater", "Sensoren"]) assert.ok(body.includes(`startStep("${s}"`), s);
  assert.ok(body.indexOf('startStep("Einstellungen laden"') < body.indexOf("await createWindow(port)"));
  assert.match(m, /function startStep\(name, fn\) \{ try \{ return fn\(\); \} catch \(e\) \{ logError\(/);
});
test("startStep fängt Fehler ab und gibt sonst den Wert zurück", () => {
  const logs = [], crashes = [];
  const src = m.match(/function startStep\(name, fn\) \{[^\n]*\n/)[0];
  const startStep = new Function("logError", "crash", src + "return startStep;")((e) => logs.push(String(e)), { add: (t) => crashes.push(t) });
  assert.equal(startStep("ok", () => 5), 5);
  assert.equal(startStep("kaputt", () => { throw new Error("x"); }), undefined);
  assert.match(logs[0], /Startschritt kaputt: Error: x/); assert.deepEqual(crashes, ["Startfehler: kaputt"]);
});
