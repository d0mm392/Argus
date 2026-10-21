// Schnelle Tests ohne Oberfläche (Node). Aufruf: node --test tests/unit.test.js
// Jeder Test trägt die Nummer der Anforderung aus ANFORDERUNGEN.md.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const G = require("../games"), fx = require("./fixtures/readyornot-prozesse.json");

// si-Format nachstellen: Name ohne .exe, Pfad = Ordner (so liefert systeminformation unter Windows), mit und ohne Pfad
const asSi = (withPath) => fx.prozesse.map((p) => ({ name: p.name, path: withPath ? path.win32.dirname(p.path) : "", cpu: p.name.includes("Shipping") ? 13 : 0 }));

test("R-GAME-1: Spiel wird am Programmpfad erkannt (echte Daten Ready or Not)", () => {
  const g = G.detect(asSi(true));
  assert.equal(g?.name, "Ready Or Not"); assert.equal(g.launcher, "Steam");
});
test("R-GAME-2: Spiel wird auch ohne Programmpfad am Prozessnamen erkannt (Anti-Cheat)", () => {
  const g = G.detect(asSi(false));
  assert.equal(g?.name, "Ready Or Not");
});
test("R-GAME-3: normale Programme sind kein Spiel", () => {
  assert.equal(G.detect([{ name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application", cpu: 5 }, { name: "Discord", path: "C:\\x", cpu: 1 }]), null);
});
test("R-GAME-4: Anzeigename aus Programmname (Wörter getrennt, Zusatz „Steam“ entfernt)", () => {
  assert.equal(G.prettyExe("ReadyOrNotSteam"), "Ready Or Not");
  assert.equal(G.prettyExe("EldenRing"), "Elden Ring");
});
test("R-GAME-5: Erkennung läuft auch über den Dauer-Prozess (Windows), nicht nur über die Einzelabfrage", () => {
  const Sys = Object.values(require("../system")).find((v) => typeof v === "function" && v.prototype?.detectGame);
  assert.ok(Sys, "detectGame fehlt");
  const o = Object.create(Sys.prototype); o.data = {}; o.gameSteam = null; o.gameT = Date.now(); // Steam-Abfrage überspringen
  const top = fx.prozesse.map((p) => ({ name: p.name + ".exe", key: p.name.toLowerCase(), cpu: p.name.includes("Shipping") ? 13 : 0 }));
  o.detectGame({ apps: fx.prozesse.filter((p) => p.fenster).map((p) => ({ n: p.name, d: p.fenster, p: p.path })) }, top);
  assert.equal(o.data.game?.name, "Ready Or Not");
  o.detectGame({ apps: [] }, top.filter((t) => !/ready/i.test(t.name)));
  assert.equal(o.data.game, null);
});

test("R-REP-1: eigene Fehlerberichte bleiben 14 Tage, danach werden sie gelöscht", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argus-crash-"));
  delete require.cache[require.resolve("../crash")]; const C = require("../crash");
  C.init(dir, path.join(dir, "e.log"), () => []);
  const id = C.archive("Test", "Bericht-Text", "gesendet");
  assert.ok(id); assert.equal(C.history().length, 1); assert.equal(C.view(id).text, "Bericht-Text");
  const f = path.join(dir, "crash-history.json"), a = JSON.parse(fs.readFileSync(f, "utf8"));
  a[0].t = new Date(Date.now() - 15 * 864e5).toISOString(); fs.writeFileSync(f, JSON.stringify(a));
  assert.equal(C.history().length, 0, "älter als 14 Tage muss weg sein");
  const id2 = C.archive("Neu", "x", "kopiert"); C.remove(id2); assert.equal(C.history().length, 0);
});
test("R-REP-2: Berichte enthalten keine Schlüssel oder Wallet-Adressen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argus-crash-"));
  delete require.cache[require.resolve("../crash")]; const C = require("../crash");
  C.init(dir, path.join(dir, "e.log"), () => ["geheimer-schluessel-123"]);
  const id = C.archive("T", "key=geheimer-schluessel-123 wallet bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq sk-ant-abcdef123456", "kopiert");
  const t = C.view(id).text; assert.ok(!/geheimer-schluessel|bc1qar0|sk-ant-abc/.test(t), t);
});

test("R-UPD-1: Update-Prüfung nur beim Start und von Hand, kein wiederkehrender Zeitgeber", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.ok(!/setInterval\(\s*checkUpdates/.test(src), "checkUpdates läuft noch in einem Intervall");
  assert.ok(/checkUpdates\(\);/.test(src), "Start-Prüfung fehlt");
});

test("R-SYS-5: bei integrierter plus eigener Grafikkarte zählt die eigene Karte; Lüfter mit Ansteuerung und 0 U/min erscheinen", () => {
  const { parseLHM } = require("../system");
  const hw = (img, text, kids) => ({ Text: text, ImageURL: img, Children: kids });
  const s = (Type, Value, Text) => ({ Type, Value, Text, Children: [] });
  const tree = { Text: "PC", Children: [
    hw("images_icon/gpu.png", "AMD Radeon(TM) Graphics", [s("Load", "0.0 %", "GPU Core"), s("Clock", "600.0 MHz", "GPU Core"), s("Temperature", "41.0 °C", "GPU VR SoC")]),
    hw("images_icon/gpu.png", "NVIDIA GeForce RTX 5070 Ti", [s("Load", "18.0 %", "GPU Core"), s("Clock", "1815.0 MHz", "GPU Core"), s("Temperature", "50.2 °C", "GPU Core")]),
    hw("images_icon/chip.png", "Board", [s("Control", "74.0 %", "System Fan #2"), s("Fan", "0.0 RPM", "System Fan #2"), s("Fan", "0.0 RPM", "System Fan #3"), s("Fan", "1021.0 RPM", "System Fan #1")]),
  ] };
  const r = parseLHM(tree);
  assert.equal(r.gpuName, "NVIDIA GeForce RTX 5070 Ti"); assert.equal(r.gpuLoad, 18); assert.equal(r.gpuMHz, 1815); assert.equal(r.gpu, 50);
  const names = r.fans.map((f) => f.name); assert.ok(names.includes("Lüfter System Fan #2") || names.some((n) => /#2/.test(n)), names.join()); assert.ok(!names.some((n) => /#3/.test(n)));
});
