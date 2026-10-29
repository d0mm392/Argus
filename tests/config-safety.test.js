"use strict";
// 0.58.28: Einstellungen nie stillschweigend verlieren. Lädt loadConfig/writeConfigNow aus main.js in eine isolierte Umgebung.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const slice = src.slice(src.indexOf("const readJson = "), src.indexOf("\n}", src.indexOf("function writeConfigNow()")) + 2);
const DEFAULTS_SRC = src.slice(src.indexOf("const DEFAULTS = {"), src.indexOf("\n};", src.indexOf("const DEFAULTS = {")) + 3);
function load(dir) {
  const logs = [], ctx = { fs, path, require: (m) => require(m.startsWith("./") ? path.join(__dirname, "..", m) : m), console, Date, JSON, Object, Array, String, Number, Error, process: { env: {}, platform: process.platform },
    CONFIG_PATH: path.join(dir, "argus-config.json"), SEALED: [], seal: (x) => x, openSecrets: () => {}, cfgTimer: null, clearTimeout,
    logError: (e) => logs.push(String(e?.message || e)), memory: { setUser() {} }, saveConfig: () => {}, os, app: { getPath: () => dir } };
  vm.createContext(ctx);
  vm.runInContext(DEFAULTS_SRC.replace("const DEFAULTS", "var DEFAULTS") + "\nvar config = { ...DEFAULTS };\n" + slice.replace("let configLoadedOk", "var configLoadedOk") + "\nthis.loadConfig = loadConfig; this.writeConfigNow = writeConfigNow; this.get = () => config;", ctx);
  return { ctx, logs };
}
const tmp = () => fs.mkdtempSync(path.join(process.env.ARGUS_TEST_ROOT || os.tmpdir(), "cfg-safety-"));
test("Einstellungen mit UTF-8-BOM (z. B. vom Editor) werden gelesen", () => {
  const d = tmp(); fs.writeFileSync(path.join(d, "argus-config.json"), "\uFEFF" + JSON.stringify({ customPages: ["Büro"], notesText: "Notiz", setupDone: true }));
  const { ctx } = load(d); ctx.loadConfig(); assert.deepEqual(ctx.get().customPages, ["Büro"]); assert.equal(ctx.get().notesText, "Notiz");
});
test("Speichern ist atomar und hält die vorige Fassung als .bak", () => {
  const d = tmp(), f = path.join(d, "argus-config.json"); fs.writeFileSync(f, JSON.stringify({ customPages: ["A"] }));
  const { ctx } = load(d); ctx.loadConfig(); ctx.get().customPages = ["A", "B"]; ctx.writeConfigNow();
  assert.deepEqual(JSON.parse(fs.readFileSync(f, "utf8")).customPages, ["A", "B"]); assert.deepEqual(JSON.parse(fs.readFileSync(f + ".bak", "utf8")).customPages, ["A"]);
  assert.equal(fs.existsSync(f + ".tmp"), false);
});
test("unlesbare Einstellungen: Original bleibt erhalten, letzte lesbare Fassung (.bak) wird geladen", () => {
  const d = tmp(), f = path.join(d, "argus-config.json"); fs.writeFileSync(f, '{"customPages":["Büro"], abgeschnitten'); fs.writeFileSync(f + ".bak", JSON.stringify({ customPages: ["Büro"], notesText: "aus Sicherung" }));
  const { ctx, logs } = load(d); ctx.loadConfig();
  assert.equal(ctx.get().notesText, "aus Sicherung"); assert.ok(logs.some((l) => /unlesbar, Original gesichert/.test(l)) && logs.some((l) => /wiederhergestellt/.test(l)));
  const kept = fs.readdirSync(d).filter((n) => /^argus-config\.unlesbar-.*\.json$/.test(n)); assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(d, kept[0]), "utf8"), '{"customPages":["Büro"], abgeschnitten');
  ctx.writeConfigNow(); assert.equal(JSON.parse(fs.readFileSync(f + ".bak", "utf8")).notesText, "aus Sicherung", "unlesbare Datei überschreibt die Sicherung nicht");
});
test("unlesbar ohne Sicherung: Standardwerte, Original bleibt als Kopie, .bak entsteht nicht daraus", () => {
  const d = tmp(), f = path.join(d, "argus-config.json"); fs.writeFileSync(f, "kaputt");
  const { ctx } = load(d); ctx.loadConfig(); ctx.writeConfigNow();
  assert.equal(fs.readdirSync(d).filter((n) => /unlesbar/.test(n)).length, 1); assert.equal(fs.existsSync(f + ".bak"), false);
});
