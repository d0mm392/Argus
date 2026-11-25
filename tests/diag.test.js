"use strict";
// 0.59.5 R-DIAG-1: Blackbox überlebt den Neustart, Sicherheitsstart nach zwei unerwarteten Enden, Diagnose-Paket bereinigt
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), os = require("os"), path = require("path");
const diag = require("../diag");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "argus-diag-"));
test("blackbox of the crashed run is kept as previous log", () => {
  const d = tmp(); diag.init(d); diag.note("youtube", "lädt Video", "abc\nzeile");
  diag.init(d); // nächster Start
  const prev = fs.readFileSync(path.join(d, "blackbox.prev.log"), "utf8");
  assert.match(prev, /youtube lädt Video abc zeile\n$/); assert.equal(fs.existsSync(path.join(d, "blackbox.log")), false);
});
test("safe start after two unclean ends in a row, reset after a clean or stable run", () => {
  const d = tmp(); diag.init(d);
  assert.deepEqual(diag.safeStart(true), { fails: 1, safe: false });
  assert.deepEqual(diag.safeStart(true), { fails: 2, safe: true });
  diag.stable(); assert.deepEqual(diag.safeStart(true), { fails: 1, safe: false });
  assert.deepEqual(diag.safeStart(false), { fails: 0, safe: false });
});
test("old crash dumps are pruned, newest kept", () => {
  const d = tmp(), dd = path.join(d, "Crashpad", "reports"); fs.mkdirSync(dd, { recursive: true });
  for (let i = 0; i < 8; i++) { const f = path.join(dd, `d${i}.dmp`); fs.writeFileSync(f, "x"); fs.utimesSync(f, 1000 + i, 1000 + i); }
  const kept = diag.dumps(path.join(d, "Crashpad"));
  assert.equal(kept.length, 5); assert.equal(path.basename(kept[0].p), "d7.dmp"); assert.equal(fs.readdirSync(dd).length, 5);
});
test("diagnostic bundle contains logs, system info and is redacted", () => {
  const d = tmp(); diag.init(d); diag.note("start", "Benutzer GEHEIM123 aktiv");
  fs.writeFileSync(path.join(d, "argus-error.log"), "Fehler bei GEHEIM123\n");
  const out = path.join(d, "diag.zip");
  const r = diag.bundle({ outFile: out, redact: (s) => s.split("GEHEIM123").join("<entfernt>"), info: { argus: "0.59.5" }, logFile: path.join(d, "argus-error.log"), dumpDir: path.join(d, "none") });
  assert.equal(r.file, out);
  const zip = new (require("adm-zip"))(out), names = zip.getEntries().map((e) => e.entryName).sort();
  assert.deepEqual(names, ["LIESMICH.txt", "blackbox.log", "fehlerprotokoll.log", "system.json"]);
  for (const e of zip.getEntries()) assert.doesNotMatch(e.getData().toString("utf8"), /GEHEIM123/);
  assert.equal(JSON.parse(zip.readAsText("system.json")).argus, "0.59.5");
});
test("crash dumps are packed into the bundle (0.59.5 left them out)", () => {
  const d = tmp(); diag.init(d); const dd = path.join(d, "Crashpad", "reports"); fs.mkdirSync(dd, { recursive: true });
  fs.writeFileSync(path.join(dd, "a.dmp"), Buffer.from([1, 2, 3]));
  const out = path.join(d, "x.zip"); diag.bundle({ outFile: out, dumpDir: path.join(d, "Crashpad") });
  const zip = new (require("adm-zip"))(out), dm = zip.getEntries().filter((e) => e.entryName.startsWith("absturz-abbilder/"));
  assert.equal(dm.length, 1); assert.deepEqual([...dm[0].getData()], [1, 2, 3]);
  assert.equal(JSON.parse(zip.readAsText("system.json")).abbilderImPaket[0].datei, "a.dmp");
});
test("chromium log of the previous run is kept", () => {
  const d = tmp(); fs.writeFileSync(path.join(d, "chromium.log"), "Check failed: x\n");
  assert.equal(diag.init(d), path.join(d, "chromium.log")); assert.match(fs.readFileSync(path.join(d, "chromium.prev.log"), "utf8"), /Check failed/);
});
test("settings snapshot hides secrets, addresses, names, long texts and watched videos", () => {
  const out = diag.settings({ steamKey: "abc", mineAddr: "bc1qxyz", userName: "Max", notesText: "privat", ytLast: { url: "https://www.youtube.com/watch?v=x" }, ytBad: ["x"], portalUrl: "", gfxSafe: false, lang: "de", userInfo: "lange Beschreibung", spin: 1.2, widgets: { a: 1 } }, ["steamKey"]);
  assert.deepEqual(out, { steamKey: "gesetzt", mineAddr: "gesetzt", userName: "gesetzt", notesText: "gesetzt", ytLast: "gesetzt", ytBad: "gesetzt", portalUrl: "leer", gfxSafe: false, lang: "de", userInfo: "gesetzt", spin: 1.2, widgets: { a: 1 } });
});
test("version history appends only on change; new dumps are reported once", () => {
  const d = tmp(); diag.init(d);
  diag.versions("0.59.7"); diag.versions("0.59.7"); const v = diag.versions("0.59.8");
  assert.deepEqual(v.map((x) => x.v), ["0.59.7", "0.59.8"]);
  const dd = path.join(d, "Crashpad"); fs.mkdirSync(dd);
  fs.writeFileSync(path.join(dd, "a.dmp"), "x"); fs.utimesSync(path.join(dd, "a.dmp"), 1000, 1000);
  assert.equal(diag.newDumps(dd).length, 0, "first look only remembers");
  fs.writeFileSync(path.join(dd, "b.dmp"), "x"); fs.utimesSync(path.join(dd, "b.dmp"), 2000, 2000);
  assert.equal(diag.newDumps(dd).length, 1); assert.equal(diag.newDumps(dd).length, 0);
});
test("bundle includes extra status files and version history", () => {
  const d = tmp(); diag.init(d); diag.versions("0.59.8");
  const out = path.join(d, "e.zip"); diag.bundle({ outFile: out, extra: { "funktionen.json": { ki: { anbieter: "keiner" } } } });
  const zip = new (require("adm-zip"))(out);
  assert.equal(JSON.parse(zip.readAsText("funktionen.json")).ki.anbieter, "keiner"); assert.equal(JSON.parse(zip.readAsText("versionen.json"))[0].v, "0.59.8");
});
