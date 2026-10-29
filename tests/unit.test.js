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

// R-BRIEF-2: Briefing kurz/ausführlich, abgewählte Teile fehlen
test("R-BRIEF-2 Briefing respektiert Umfang und Auswahl", () => {
  const B = require("../briefing"), d = { name: "Alex", hour: 8, wx: { cur: { temp: 12, code: 3 }, days: [{ max: 15, rain: 10 }, { max: 17, min: 8, code: 0 }] }, btc: { usd: { price: 60000, change: 1 } }, cur: "usd", news: ["a", "b", "c"] };
  const s = B.build(d, { len: "short", parts: ["weather", "btc"] }), l = B.build(d, { len: "long", parts: ["weather", "headlines"] });
  assert.equal(s.cards.length, 2); assert.ok(/Guten Morgen, Alex/.test(s.speech));
  assert.ok(l.cards.some((c) => c[0] === "Morgen")); assert.ok(!l.cards.some((c) => c[0] === "Bitcoin"));
});

// R-POWER-1: Verbrauch aus Foreman-Feldern, Energie und Uptime im Report, Portal-Schätzung
test("R-POWER-1 Leistung, Energie, Uptime und Portal-Schätzung", () => {
  const F = require("../foreman"), os2 = require("os"), R = require("../report");
  assert.equal(F.miner({ name: "a", power: 3400, active: true }).watt, 3400);
  assert.equal(F.miner({ name: "b", power_kw: 3.2, active: true }).watt, 3200);
  assert.equal(F.miner({ name: "c", power_limit: 3000, active: true }).watt, null);
  R.init(fs.mkdtempSync(path.join(os2.tmpdir(), "rep-")));
  R.record("T", [{ name: "a", on: true, watt: 3000 }, { name: "b", on: false, watt: 0 }]);
  const f = R.build(R.dayKey()).farms[0];
  assert.ok(f.kwh > 0.24 && f.kwh < 0.26); assert.equal(f.uptime, 0.5);
});

// R-PORTAL-1: Typ-Namen aus Liste, Objekt-Map und verschachtelten Feldern; Leistungsschätzung nur für laufende Miner
test("R-PORTAL-1 Portal: Typnamen und Leistungsschätzung", () => {
  const P = require("../portal"), miners = [{ state: "working", minerTypeId: 1 }, { state: "off", minerTypeId: 1 }, { state: "working", minerTypeId: 2 }];
  const a = P.summarize(miners, [{ id: 1, name: "Modell A", power: 3000 }, { id: 2, model: { title: "Modell B" } }], null);
  assert.deepEqual(a.models.map((m) => m.name).sort(), ["Modell A", "Modell B"]); assert.equal(a.power.w, 3000); assert.equal(a.power.of, 2);
  const b = P.summarize(miners, { 1: { modelName: "Modell C", watt: 2500 } }, null);
  assert.equal(b.models.find((m) => m.n === 2).name, "Modell C"); assert.equal(b.power.w, 2500);
});

// R-STEAM-1: „App Running“ (Spiel läuft) ist kein Download; „Update Running“ schon
test("R-STEAM-1 Steam-Protokoll: laufendes Spiel gilt nicht als Download", async () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stm-")); fs.mkdirSync(path.join(dir, "logs")); fs.mkdirSync(path.join(dir, "steamapps"));
  process.env.JARVIS_STEAM_DIR = dir; const D = require("../steamdl");
  const log = (l) => fs.writeFileSync(path.join(dir, "logs", "content_log.txt"), l.join("\n") + "\n");
  log(["[2026-10-22 17:46:31] AppID 1203190 state changed : Fully Installed,Update Queued,Update Running,", "[2026-10-22 17:46:31] AppID 1203190 update started : download 10/5000", "[2026-10-22 17:46:39] AppID 1203190 state changed : Fully Installed,App Running,"]);
  assert.equal((await D.poll()).length, 0);
  log(["[2026-10-22 17:46:31] AppID 1203190 App update changed : Running Update,", "[2026-10-22 17:46:31] AppID 1203190 update started : download 10/5000"]);
  const l = await D.poll(); assert.equal(l.length, 1); assert.ok(l[0].active);
});

// R-PORTAL-2: Miner läuft = Ja/Nein-Feld, sonst Hashrate, sonst Zustandstext; Beispiel enthält keine Texte
test("R-PORTAL-2 Portal: Zustand je Miner aus Feldern, nicht nur aus dem Zustandstext", () => {
  const P = require("../portal");
  const r = P.summarize([{ state: "off", hashrate: 100, serial: "ABC123" }, { state: "off", hashrate: 0 }, { state: "x", online: true }, { state: "broken" }], null, null);
  assert.equal(r.up, 2); assert.equal(r.down, 2); assert.equal(r.total, 4);
  assert.equal(r.typeSample.miners[0].serial, "(Text)"); assert.equal(r.typeSample.miners[0].state, "off");
});

// R-FMDASH-1: ohne Anmeldung/Schalter verändert das Dashboard-Modul keine Miner
test("R-FMDASH-1 Foreman-Dashboard: apply ändert ohne Daten nichts", () => {
  const F = require("../foremandash"); const ms = [{ name: "a.1", on: true, watt: 5 }];
  F.apply(ms); assert.equal(ms[0].watt, 5); assert.equal(F.data().state, "off");
});

// R-IOB-1: ohne Einschalten keine Verbindung, Schalten ist standardmäßig gesperrt
test("R-IOB-1 ioBroker: aus = keine Daten, Schalten gesperrt", async () => {
  const I = require("../iobroker"); I.init({ on: false, url: "", pick: [{ id: "a.b" }] }, () => {});
  assert.equal(I.data().state, "off"); assert.equal(I.browse("a").length, 0);
  assert.equal((await I.setState("a.b", true)).ok, false);
});

// R-PACK-1: jede lokal geladene Datei von main.js steht in der Paketliste (sonst startet die installierte App nicht)
test("R-PACK-1 Paketliste enthält alle von den Hauptdateien geladenen Module", () => {
  const fs = require("fs"), path = require("path"), root = path.join(__dirname, ".."), files = new Set(require("../package.json").build.files), miss = [];
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".js"))) for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(/require\("\.\/([\w-]+)"\)/g)) if (fs.existsSync(path.join(root, m[1] + ".js")) && !files.has(m[1] + ".js")) miss.push(m[1] + ".js");
  assert.deepEqual(miss, []);
});

// R-MEM-3: „Suche in meinem Argus-Gedächtnis nach …“ geht ins Gedächtnis, nicht in die Dateisuche; echte Dateisuchen bleiben Dateisuchen
test("R-MEM-3 Gedächtnis-Suche wird erkannt, Dateisuche nicht verwechselt", () => {
  const m = require("../memory.js");
  assert.deepEqual(m.parse("Suche in meinem Argus-Gedächtnis nach Bitcoin Mining.”"), { kind: "search", text: "Bitcoin Mining" });
  assert.deepEqual(m.parse("durchsuche mein Gedächtnis nach Foreman"), { kind: "search", text: "Foreman" });
  assert.equal(m.parse("Such die Datei Diablo"), null);
  assert.equal(m.parse("Such in C nach Foto"), null);
});

// R-MCP-1: Claude Desktop (ohne laufendes Argus) bekommt Gedächtnis, Dateien und Strata als Werkzeuge; Strata-Aufruf geht direkt an den lokalen Server
test("R-MCP-1 MCP-Server bietet strata_fragen ohne Argus an und meldet fehlende Strata verständlich", async () => {
  const { spawn } = require("child_process"), path = require("path");
  const env = { ...process.env, JARVIS_PORT: "", JARVIS_STRATA_URL: "http://127.0.0.1:9" };
  const p = spawn(process.execPath, [path.join(__dirname, "..", "argus-mcp.js")], { env: { ...env, ELECTRON_RUN_AS_NODE: "1" } });
  let buf = ""; const got = new Map(); p.stdout.on("data", (c) => { buf += c; const l = buf.split("\n"); buf = l.pop(); for (const x of l) { try { const m = JSON.parse(x); got.set(m.id, m); } catch {} } });
  const send = (m) => p.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n"), wait = async (id) => { for (let i = 0; i < 80 && !got.has(id); i++) await new Promise((r) => setTimeout(r, 100)); return got.get(id); };
  send({ id: 1, method: "tools/list" }); const l = await wait(1);
  send({ id: 2, method: "tools/call", params: { name: "strata_fragen", arguments: { prompt: "Hallo" } } }); const c = await wait(2);
  p.kill();
  const names = l.result.tools.map((t) => t.name);
  assert.ok(names.includes("strata_fragen") && names.includes("gedaechtnis_suchen") && !names.includes("lokale_ki"));
  assert.ok(c.result.isError && /Strata läuft gerade nicht/.test(c.result.content[0].text));
});

// R-START-1: Die Konfiguration wird geladen, bevor ioBroker, Foreman-Dashboard und Portal ihre Schalter lesen (sonst bleiben sie nach jedem Neustart aus)
test("R-START-1 loadConfig vor den init-Aufrufen von iob, fmdash und portal", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "main.js"), "utf8"), at = (re) => src.search(re), lc = at(/app\.whenReady\(\)\.then\(async \(\) => \{\s*(?:startStep\("[^"]+", \(\) => )?loadConfig\(\)/); // ab 0.58.27 abgesichert über startStep
  assert.ok(lc > 0, "loadConfig steht nicht am Anfang von whenReady");
  for (const re of [/iob\.init\(/, /fmdash\.init\(/, /portal\.init\(/]) assert.ok(at(re) > lc, String(re));
});
