// Tests zum Sicherheits-Hotfix 0.58.20 (Selbstverbesserung abgeschaltet). Reines Node, kein Electron, kein Argus-Start.
// Aufruf: node tests/hotfix.test.js   (bewusst ohne --test: alles in einem Prozess, keine Kindprozesse)
// Wächter vor jedem Argus-Modul: Schreiben nur im Testordner, keine Prozesse, kein Netz, Benutzerpfade umgeleitet.
"use strict";
const path = require("path"), fs = require("fs"), os = require("os"), vm = require("vm"), Module = require("module");
const REPO = path.resolve(__dirname, "..");
const ROOT = process.env.ARGUS_TEST_ROOT || path.join(os.tmpdir(), "argus-hotfix-tests");
fs.mkdirSync(ROOT, { recursive: true });
const T = fs.mkdtempSync(path.join(ROOT, "run-"));
// \\?\-Langpfade (z. B. intern von fs.rmSync unter Node 20) wie normale Pfade behandeln
const unlong = (p) => String(p).replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "");
const inside = (p, base) => { const r = path.relative(base, path.resolve(unlong(p))); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };

// ---------- Umgebung ----------
const HOME = path.join(T, "home"), APPDATA = path.join(HOME, "AppData", "Roaming"), LOCAL = path.join(HOME, "AppData", "Local");
for (const d of [HOME, APPDATA, LOCAL]) fs.mkdirSync(d, { recursive: true });
Object.assign(process.env, { USERPROFILE: HOME, HOME, APPDATA, LOCALAPPDATA: LOCAL, JARVIS_MEMORY: path.join(T, "memory"), JARVIS_INDEX: path.join(T, "index", "dateiindex.txt"),
  ProgramData: path.join(T, "programdata"), ProgramFiles: path.join(T, "pf"), "ProgramFiles(x86)": path.join(T, "pf86"), PUBLIC: path.join(T, "public"), JARVIS_STEAM_DIR: path.join(T, "steam") });
delete process.env.ANTHROPIC_API_KEY; delete process.env.ARGUS_OLD_DATA;

// ---------- Wächter ----------
const violations = [], access = [];
let phase = "FIX";
const W = ["writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "rmSync", "rmdirSync", "unlinkSync", "copyFileSync", "cpSync", "symlinkSync", "linkSync", "createWriteStream", "utimesSync", "truncateSync", "writeSync", "mkdtempSync"];
const R = ["readFileSync", "readdirSync", "opendirSync", "statSync", "lstatSync", "existsSync", "accessSync", "openSync", "realpathSync", "createReadStream"];
const pathArgs = (name, a) => (name === "renameSync" || name === "copyFileSync" || name === "cpSync" || name === "linkSync" || name === "symlinkSync") ? [a[0], a[1]] : [a[0]];
for (const name of W) {
  const orig = fs[name]; if (typeof orig !== "function") continue;
  fs[name] = function (...a) {
    for (const p of pathArgs(name, a)) if (typeof p === "string" || p instanceof URL) {
      const target = name === "symlinkSync" && p === a[0] ? null : p; // Ziel einer Verknüpfung darf außerhalb liegen? nein, aber es wird nicht beschrieben
      if (target && !inside(target, T)) { violations.push(`${name} ausserhalb Testordner: ${target}`); throw new Error("GUARD: Schreiben ausserhalb des Testordners: " + target); }
    }
    access.push({ op: name, p: String(a[0]), p2: a[1] && typeof a[1] === "string" ? a[1] : undefined, phase });
    return orig.apply(this, a);
  };
}
for (const name of R) {
  const orig = fs[name]; if (typeof orig !== "function") continue;
  fs[name] = function (...a) {
    const p = typeof a[0] === "string" ? a[0] : String(a[0]);
    if (!inside(p, T) && !inside(p, REPO)) { violations.push(`${name} ausserhalb Testordner/Repo: ${p}`); throw new Error("GUARD: Lesen ausserhalb des Testordners: " + p); }
    access.push({ op: name, p, phase });
    return orig.apply(this, a);
  };
}
{ const orig = fs.promises.opendir; fs.promises.opendir = function (p, ...r) { if (!inside(p, T)) { violations.push(`opendir ausserhalb: ${p}`); return Promise.reject(new Error("GUARD: opendir ausserhalb: " + p)); } access.push({ op: "opendir", p: String(p), phase }); return orig.call(this, p, ...r); }; }
const cp = require("child_process");
let execFileHandler = null; // Testgesteuerte Simulation (nur searchContent)
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFileSync", "fork"]) cp[name] = (...a) => { violations.push(`Prozess ${name}: ${a[0]}`); throw new Error("GUARD: Prozess " + a[0]); };
const isStartApps = (cmd, args) => cmd === "powershell.exe" && Array.isArray(args) && args.some((x) => String(x).includes("Get-StartApps"));
cp.execFile = (...a) => {
  if (execFileHandler) return execFileHandler(...a);
  if (isStartApps(a[0], a[1])) { const cb = a.find((x) => typeof x === "function"); setImmediate(() => cb && cb(null, "[]", "")); return {}; } // simuliert, actions.js:59
  violations.push(`Prozess execFile: ${a[0]}`); throw new Error("GUARD: Prozess " + a[0]);
};
const withPhase = async (ph, fn) => { const prev = phase; phase = ph; try { return await fn(); } finally { phase = prev; } };
for (const m of ["http", "https", "net", "tls"]) { const mod = require(m); for (const k of ["request", "get", "connect", "createConnection"]) if (mod[k]) mod[k] = () => { violations.push(`Netz ${m}.${k}`); throw new Error("GUARD: Netz"); }; }
globalThis.fetch = () => { violations.push("Netz fetch"); throw new Error("GUARD: Netz"); };

// Electron-Attrappe
const UD = path.join(APPDATA, "argus-desktop");
const shellCalls = [];
const electronStub = {
  app: { getPath: (n) => (n === "userData" ? UD : n === "appData" ? APPDATA : n === "home" ? HOME : T), setPath() {}, exit() {}, relaunch() {} },
  shell: { openPath: async (p) => { shellCalls.push(["openPath", p]); return ""; }, showItemInFolder: (p) => shellCalls.push(["showItemInFolder", p]), openExternal: async (u) => { shellCalls.push(["openExternal", u]); } },
};
const origLoad = Module._load;
Module._load = function (req, parent, isMain) { if (req === "electron") return electronStub; return origLoad.call(this, req, parent, isMain); };

const test = require("node:test"), assert = require("node:assert/strict");
const sha = (p) => require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const tree = (d) => { const out = {}; const walk = (x, rel) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const r = rel ? rel + "/" + e.name : e.name, p = path.join(x, e.name); if (e.isSymbolicLink()) out[r] = "LINK"; else if (e.isDirectory()) { out[r + "/"] = "DIR"; walk(p, r); } else out[r] = sha(p); } }; if (fs.existsSync(d)) walk(d, ""); return out; };
const put = (p, s = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const fresh = (rel) => { const m = path.join(REPO, rel); delete require.cache[require.resolve(m)]; return require(m); };

const SI = fresh("selfimprove.js");
const parseOld = require(path.join(REPO, "tests", "fixtures", "parse-0.58.19.js"));
const DISABLED = SI.respond({ kind: "improve" }).text;
const kindOf = (r) => (r ? r.kind : null);
const oldKind = (text, prev = "", offer = null) => { const r = parseOld(text, prev, offer); return r ? r.kind : null; };
const oldPrevOk = (prev) => { const p = parseOld(prev); return !!(p && p.kind === "improve" && p.wish); };

// ===================== T1–T5 Parser =====================
const B3VERBS = ["verwirf", "verwerf", "verwerfe", "verwerfen", "abbrech", "abbreche", "abbrechen", "lösch", "lösche", "löschen"];
const B3OBJ = ["", " es", " das", " die änderung"], B3PRE = ["", "nein, "];
const B3FORMS = []; for (const p of B3PRE) for (const v of B3VERBS) for (const o of B3OBJ) B3FORMS.push(p + v + o);

test("T1 Parser: Regeln B1 bis B10, Rückgabevertrag, Normalisierung", () => {
  const cases = [["Mach die letzte Verbesserung rückgängig", "undo"], ["Nimm die letzte Änderung zurück", "undo"], ["Übernehmen", "apply"], ["Ja, übernimm das", "apply"],
    ["Prüf dich auf Fehler", "check"], ["Checkt euch gegenseitig ab", "check"], ["Was ist Selbstverbesserung", "explain"], ["Verbessere dich", "explain"], ["Arbeite an dir", "explain"],
    ["Verbessere dich: zeig die Uhr", "improve"], ["Gut. Zudem verbessere dich: Timer", "improve"], ["Arbeite an dir: mehr Farben", "improve"], ["Bau dir einen Timer ein", "improve"],
    ["Jarvis, Übernehmen!", "apply"], ["Claude verbessere dich: X.", "improve"], ["  Verbessere dich!!!  ", "explain"]];
  for (const [t, k] of cases) assert.equal(kindOf(SI.classify(t, "", { stage: "absent" })), k, t);
  const r = SI.classify("Übernehmen", "", { stage: "absent" });
  assert.deepEqual(Object.keys(r), ["kind"]); assert.ok(Object.isFrozen(r));
  for (const bad of [undefined, 42, {}, null]) assert.equal(SI.classify(bad, "", {}), null);
  assert.equal(SI.classify("Führ es durch", 42, {}), null, "prev kein String gilt als leer");
  // B3: jede der 80 Formen wird erkannt und von parse() 0.58.19 (mit offer) ebenfalls als Verwerfen erkannt
  assert.equal(B3FORMS.length, 80);
  const spread = (f) => f.replace(" die änderung", "\u0000").replace(/ /g, "   ").replace(",", ",,").replace("\u0000", "   die änderung");
  for (const f of B3FORMS) for (const form of [f, spread(f)]) {
    assert.equal(kindOf(SI.classify(form, "", { stage: "present" })), "discard", form);
    assert.equal(kindOf(SI.classify(form, "", { stage: "unknown" })), "discard", form);
    assert.equal(oldKind(form, "", {}), "discard", "0.58.19 erkennt " + form);
  }
  // D3-3: Suffixformen nicht mehr B3
  for (const f of ["verwerfung", "löschst", "verwirfst", "abbrechung", "verwerf123", "löschst das", "nein, verwerfung"]) {
    assert.equal(oldKind(f, "", {}), "discard", "Referenz " + f);
    for (const st of ["present", "absent", "unknown"]) assert.notEqual(kindOf(SI.classify(f, "", { stage: st })), "discard", f);
  }
});

test("T2 Parser: isSelfWish, Überschneidungen, einmalige Normalisierung von prev", () => {
  const c = (t, prev) => kindOf(SI.classify(t, prev, { stage: "absent" }));
  assert.equal(c("Verbessere dich mit einer Uhr"), "improve");
  assert.equal(c("Verbessere dich selbst"), "explain");
  assert.equal(c("Prüf dich und verbessere dich: X"), "check");
  assert.equal(c("Was ist Selbstverbesserung? Verbessere dich: X"), "improve");
  const confirm = ["Mach das", "Führ es durch", "Leg los", "Lege los", "Ja, lege los", "Bitte leg los", "Setz es um", "Bau es ein", "Starte die Verbesserung", "Führ den Auftrag aus"];
  for (const prev of ["Prüf dich auf Fehler", "Verbessere dich: Uhr anzeigen", "Arbeite an dir: Timer", "Bau dir einen Timer ein"]) for (const t of confirm) {
    assert.equal(c(t, prev), "improve", `${t} nach ${prev}`);
    assert.equal(oldPrevOk(prev), true, "Referenz-Berechtigung " + prev);
  }
  for (const prev of ["Was ist Selbstverbesserung", "Verbessere dich", "Verbessere dich selbst", "Arbeite an dir", "Verbessere dich:", "", "Wie spät ist es", "Übernehmen", "Mach die letzte Verbesserung rückgängig", "Führ es durch"])
    for (const t of ["Mach das", "Führ es durch", "Leg los"]) { assert.equal(c(t, prev), null, `${t} nach ${prev}`); assert.equal(oldKind(t, prev), null, `Referenz ${t} nach ${prev}`); }
  // prev wird genau einmal normalisiert (nur ein Anredepräfix)
  for (const prev of ["jarvis claude prüf dich auf Fehler", "claude jarvis kontrollier dich", "Jarvis, Jarvis, bau dir einen Timer ein"]) {
    assert.equal(c("Mach das", prev), null, prev); assert.equal(oldKind("Mach das", prev), null, "Referenz " + prev);
  }
  assert.equal(c("Mach das", "claude, jarvis verbessere dich: Uhr"), "improve"); assert.equal(oldKind("Mach das", "claude, jarvis verbessere dich: Uhr"), "improve");
  assert.equal(c("Mach das", "jarvis prüf dich auf Fehler"), "improve"); assert.equal(oldKind("Mach das", "jarvis prüf dich auf Fehler"), "improve");
});

const NORMAL = ["Starte Elden Ring", "Öffne Steam", "Wer von meinen Freunden spielt gerade?", "Beende Ready or Not", "Wie steht Bitcoin?", "Zeig mir den Bitcoin-Kurs", "Kauf-Signal für Ethereum?",
  "Wie ist der Fear-and-Greed-Index?", "Schalte das Licht im Wohnzimmer an", "Mach die Heizung im Bad aus", "Wie warm ist es im Kinderzimmer?", "Wie spät ist es?", "Öffne Discord", "Merk dir: Zahnarzt Dienstag",
  "Vergiss Zahnarzt", "Such die Datei Rechnung", "Lösch die Notiz Einkauf", "Verwirf die Notiz Einkauf", "Verwirf den Vorschlag", "Verwerfe den Timer", "Ändere die Lautstärke", "Übersetze das", "Spiel Lofi auf YouTube", "Twitch shroud",
  "Bitte verwirf es", "Verwirf es bitte", "Verwirf die Verbesserung"];
test("T3 Weiterleitung: normale Befehle ergeben null in jedem Stage-Zustand", () => {
  for (const t of NORMAL) for (const opts of [{ stage: "present" }, { stage: "absent" }, { stage: "unknown" }, { stage: undefined }, undefined, { stage: "x" }]) for (const prev of ["", "Verbessere dich: Uhr anzeigen"]) {
    assert.equal(SI.classify(t, prev, opts), null, `${t} (${JSON.stringify(opts)}, prev=${prev})`);
  }
  for (const t of NORMAL) assert.equal(oldKind(t, "", {}), null, "Referenz unverändert: " + t);
});

test("T4 Parser: B9 nur als ganze Bestätigung", () => {
  for (const prev of ["Verbessere dich: Uhr anzeigen", "Bau dir einen Timer ein"]) for (const t of ["Mach das Licht an", "Mach das Licht im Wohnzimmer aus", "Starte das Spiel Elden Ring", "Mach Steam auf", "Leg Musik auf", "Setz den Bitcoin-Alarm auf 120000", "Führ das Update von Steam durch"]) {
    assert.equal(SI.classify(t, prev, { stage: "absent" }), null, `${t} nach ${prev}`);
  }
});

test("T5 Abgleich mit parse() 0.58.19: nur dokumentierte Abweichungen", () => {
  const D = []; // [Eingabe, prev, offer, erwartet alt, erwartet neu (stage absent/present)]
  const rows = [["Mach die letzte Verbesserung rückgängig", "", null, "undo", "undo", "undo"], ["Übernehmen", "", null, null, "apply", "apply"], ["Übernehmen", "", {}, "apply", "apply", "apply"],
    ["Verwirf es", "", null, null, null, "discard"], ["Verwirf es", "", {}, "discard", null, "discard"], ["Prüf dich auf Fehler", "", null, "improve", "check", "check"],
    ["Was ist Selbstverbesserung", "", null, "improve", "explain", "explain"], ["Verbessere dich", "", null, "improve", "explain", "explain"], ["Verbessere dich: Uhr", "", null, "improve", "improve", "improve"],
    ["Bau dir einen Timer ein", "", null, "improve", "improve", "improve"], ["Führ es durch", "Verbessere dich: Uhr", null, "improve", "improve", "improve"], ["Lege los", "Verbessere dich: Uhr", null, "improve", "improve", "improve"],
    ["Mach das Licht an", "Verbessere dich: Uhr", null, "improve", null, null], ["Starte das Spiel Elden Ring", "Verbessere dich: Uhr", null, "improve", null, null],
    ["verwerfung", "", {}, "discard", null, null]];
  for (const [t, prev, offer, alt, neuAbs, neuPres] of rows) {
    assert.equal(oldKind(t, prev, offer), alt, "alt " + t);
    assert.equal(kindOf(SI.classify(t, prev, { stage: "absent" })), neuAbs, "neu absent " + t);
    assert.equal(kindOf(SI.classify(t, prev, { stage: "present" })), neuPres, "neu present " + t);
  }
  // Ohne Abweichung: alle normalen Befehle (T3) und alle Paare aus T2 sind bereits verglichen
  void D;
});

// ===================== T6/T7 respond, stageState, discard =====================
const STAGE = path.join(UD, "selfimprove-stage");
const recFs = (base = fs, hooks = {}) => { const ops = []; const p = new Proxy(base, { get(t, k) { const v = t[k]; if (typeof v !== "function") return v; return (...a) => { ops.push([k, a[0], a[1]]); if (hooks[k]) return hooks[k](v.bind(t), ...a); return v.apply(t, a); }; } }); return { fs: p, ops }; };
const clean = () => { fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true }); };
const FIXED = () => new Date("2026-01-01T00:00:00.000Z");
const ARCH = (r) => path.join(UD, "selfimprove-verworfen-2026-01-01T00-00-00-000Z-" + r);

test("T6 Exporte, respond, stageState", () => {
  assert.deepEqual(Object.keys(SI).sort(), ["CHANGELOG", "classify", "discard", "respond", "stageState"]);
  for (const k of ["improve", "check", "explain", "apply", "undo", "xyz", undefined]) { const r = SI.respond({ kind: k }); assert.deepEqual(r, { ok: false, text: DISABLED }); }
  assert.deepEqual(SI.respond(null), { ok: false, text: DISABLED });
  assert.match(DISABLED, /abgeschaltet/);
  const n = access.length; assert.equal(SI.CHANGELOG(), path.join(UD, "selbst-verbesserungen.md")); assert.equal(access.length, n, "CHANGELOG greift auf keine Datei zu");
  clean();
  assert.equal(SI.stageState(), "absent");
  fs.mkdirSync(STAGE); assert.equal(SI.stageState(), "present");
  fs.rmSync(STAGE, { recursive: true }); fs.writeFileSync(STAGE, "datei"); assert.equal(SI.stageState(), "present");
  fs.rmSync(STAGE); fs.symlinkSync(path.join(T, "gibt-es-nicht"), STAGE, "junction"); assert.equal(SI.stageState(), "present", "Junction mit ungültigem Ziel");
  fs.rmSync(STAGE);
  for (const code of ["EACCES", "EPERM", "EBUSY"]) assert.equal(SI.stageState({ fs: { lstatSync: () => { throw Object.assign(new Error(code), { code }); } } }), "unknown");
  assert.equal(SI.stageState({ fs: { lstatSync: () => { throw Object.assign(new Error(), { code: "ENOTDIR" }); } } }), "absent");
  const { fs: rf, ops } = recFs(); SI.stageState({ fs: rf }); assert.deepEqual(ops.map((o) => o[0]), ["lstatSync"]);
});

test("T7 discard: nur Umbenennen, Ergebnisse und erlaubte Operationen", () => {
  const allowed = (ops) => { for (const [op] of ops) assert.ok(["lstatSync", "renameSync"].includes(op), "unerlaubte Operation " + op); assert.ok(ops.filter((o) => o[0] === "renameSync").length <= 1); assert.ok(ops.filter((o) => o[0] === "lstatSync").length <= 7); };
  // (1) normaler Ordner
  clean(); put(path.join(STAGE, "a.js"), "A"); put(path.join(STAGE, "sub", "b.js"), "B"); const before = tree(STAGE);
  let { fs: rf, ops } = recFs(); let r = SI.discard({ fs: rf, now: FIXED, rand: () => "aaaa0001" });
  assert.equal(r.outcome, "moved_dir"); assert.equal(r.ok, true); assert.ok(!fs.existsSync(STAGE)); assert.deepEqual(tree(ARCH("aaaa0001")), before); allowed(ops);
  assert.ok(path.basename(ARCH("aaaa0001")).startsWith("selfimprove-verworfen-"));
  // (2) kein Eintrag
  clean(); r = SI.discard(); assert.deepEqual([r.outcome, r.ok], ["none", true]);
  // (3) Datei, Junction
  clean(); fs.writeFileSync(STAGE, "datei"); r = SI.discard({ now: FIXED, rand: () => "b" }); assert.equal(r.outcome, "refused"); assert.equal(fs.readFileSync(STAGE, "utf8"), "datei");
  clean(); const ziel = path.join(T, "fremd"); fs.rmSync(ziel, { recursive: true, force: true }); put(path.join(ziel, "f.txt"), "F"); fs.symlinkSync(ziel, STAGE, "junction");
  r = SI.discard({ now: FIXED, rand: () => "c" }); assert.equal(r.outcome, "refused"); assert.equal(fs.readFileSync(path.join(ziel, "f.txt"), "utf8"), "F"); fs.rmSync(STAGE);
  // (4) Kollision deterministisch: erster Name belegt, zweiter frei; vorhandener Ordner bleibt
  clean(); put(path.join(STAGE, "a.js")); put(path.join(ARCH("aaaa0001"), "marker.txt"), "M"); const seq = ["aaaa0001", "aaaa0002"]; let calls = 0;
  r = SI.discard({ now: FIXED, rand: () => seq[calls++] }); assert.equal(r.outcome, "moved_dir"); assert.equal(calls, 2); assert.ok(fs.existsSync(path.join(ARCH("aaaa0002"), "a.js"))); assert.equal(fs.readFileSync(path.join(ARCH("aaaa0001"), "marker.txt"), "utf8"), "M");
  // (4b) fünf Kollisionen
  clean(); put(path.join(STAGE, "a.js")); for (let i = 1; i <= 5; i++) put(path.join(ARCH("x" + i), "m.txt"), "M" + i); calls = 0;
  r = SI.discard({ now: FIXED, rand: () => "x" + ++calls }); assert.equal(r.outcome, "failed"); assert.equal(calls, 5); assert.ok(fs.existsSync(path.join(STAGE, "a.js"))); for (let i = 1; i <= 5; i++) assert.equal(fs.readFileSync(path.join(ARCH("x" + i), "m.txt"), "utf8"), "M" + i);
  // (5) Umbenennen scheitert
  clean(); put(path.join(STAGE, "a.js"));
  ({ fs: rf, ops } = recFs(fs, { renameSync: () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); } }));
  r = SI.discard({ fs: rf, now: FIXED, rand: () => "d" }); assert.equal(r.outcome, "failed"); assert.match(r.text, /EBUSY/); assert.ok(fs.existsSync(path.join(STAGE, "a.js"))); assert.ok(!fs.existsSync(ARCH("d"))); allowed(ops);
  // (6) Stage zwischen Prüfung und Umbenennen durch Junction ersetzt: verschoben wird die Verknüpfung, Ziel unverändert
  clean(); put(path.join(STAGE, "a.js")); const fremd2 = path.join(T, "fremd2"); fs.rmSync(fremd2, { recursive: true, force: true }); put(path.join(fremd2, "g.txt"), "G");
  ({ fs: rf, ops } = recFs(fs, { renameSync: (real, a, b) => { fs.rmSync(STAGE, { recursive: true }); fs.symlinkSync(fremd2, STAGE, "junction"); return real(a, b); } }));
  r = SI.discard({ fs: rf, now: FIXED, rand: () => "e" }); assert.equal(r.outcome, "moved_other"); assert.equal(r.ok, false); assert.equal(fs.readFileSync(path.join(fremd2, "g.txt"), "utf8"), "G"); assert.ok(fs.lstatSync(ARCH("e")).isSymbolicLink());
  fs.rmSync(ARCH("e"));
  // (7) Zielpfad zwischen Prüfung und Umbenennen als Ordner belegt
  clean(); put(path.join(STAGE, "a.js"), "A");
  ({ fs: rf } = recFs(fs, { renameSync: (real, a, b) => { put(path.join(b, "vorhanden.txt"), "V"); return real(a, b); } }));
  r = SI.discard({ fs: rf, now: FIXED, rand: () => "f" }); const t7 = { outcome: r.outcome, vorhanden: fs.existsSync(path.join(ARCH("f"), "vorhanden.txt")) ? fs.readFileSync(path.join(ARCH("f"), "vorhanden.txt"), "utf8") : null };
  assert.equal(t7.vorhanden, "V", "vorhandener Eintrag am Ziel bleibt erhalten"); assert.equal(r.outcome, "failed"); assert.ok(fs.existsSync(path.join(STAGE, "a.js")));
  // (8) kombiniert: Ziel ist Verknüpfung auf fremden Ordner mit Datei, Stage durch Datei ersetzt
  clean(); put(path.join(STAGE, "a.js")); const fremd3 = path.join(T, "fremd3"); fs.rmSync(fremd3, { recursive: true, force: true }); put(path.join(fremd3, "h.txt"), "H");
  ({ fs: rf } = recFs(fs, { renameSync: (real, a, b) => { fs.rmSync(STAGE, { recursive: true }); fs.writeFileSync(STAGE, "neu"); fs.symlinkSync(fremd3, b, "junction"); return real(a, b); } }));
  r = SI.discard({ fs: rf, now: FIXED, rand: () => "g" });
  assert.equal(fs.readFileSync(path.join(fremd3, "h.txt"), "utf8"), "H", "Inhalt des Verknüpfungsziels unverändert"); assert.notEqual(r.outcome, "moved_dir");
  process.stdout.write(`# T7(8) festgehaltenes Ergebnis: ${r.outcome}\n`);
  // (9) Nachprüfung nicht möglich
  clean(); put(path.join(STAGE, "a.js")); let n = 0;
  ({ fs: rf } = recFs(fs, { lstatSync: (real, p) => { if (p.includes("selfimprove-verworfen-") && n++ > 0) throw Object.assign(new Error("acc"), { code: "EACCES" }); return real(p); } }));
  r = SI.discard({ fs: rf, now: FIXED, rand: () => "h" }); assert.equal(r.outcome, "moved_unverified"); assert.equal(r.ok, false);
  // (10) lstat des Arbeitsordners scheitert
  r = SI.discard({ fs: { lstatSync: () => { throw Object.assign(new Error(), { code: "EACCES" }); } } }); assert.deepEqual([r.outcome, r.ok], ["failed", false]);
  clean();
});

// ===================== T8/T10 boot.js =====================
const BOOT = path.join(REPO, "boot.js"), BOOT_OLD = path.join(REPO, "tests", "fixtures", "boot-0.58.19.js");
function runBoot(file, appData, opts = {}) { const prev = phase; phase = file === BOOT ? "HOT" : "REF"; try { return runBoot0(file, appData, opts); } finally { phase = prev; } }
function runBoot0(file, appData, { mainThrows = false, mkdirThrows = false } = {}) {
  const calls = { setPath: [], exit: [], relaunch: 0, main: 0 };
  const paths = { appData, userData: path.join(appData, "argus-desktop") };
  const app = { getPath: (n) => paths[n], setPath: (n, v) => { paths[n] = v; calls.setPath.push([n, v]); }, exit: (c) => calls.exit.push(c), relaunch: () => { calls.relaunch++; } };
  const req = (m) => { if (m === "electron") return { app }; if (m === "./main.js") { calls.main++; if (mainThrows) throw new Error("main kaputt"); return {}; }
    // mkdirThrows: nur mkdirSync scheitert (Codex-Hinweis 3/1), alle anderen fs-Aufrufe bleiben die instrumentierten
    if (m === "fs" && mkdirThrows) { calls.append = 0; return { ...fs, mkdirSync: () => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); }, appendFileSync: (...a) => { calls.append++; return fs.appendFileSync(...a); } }; }
    return require(m); };
  const saved = process.env.ARGUS_OLD_DATA; delete process.env.ARGUS_OLD_DATA;
  try { vm.runInNewContext(fs.readFileSync(file, "utf8"), { require: req, process, console, __dirname: path.join(T, "appdir-" + path.basename(file)) }, { filename: file }); }
  finally { calls.oldData = process.env.ARGUS_OLD_DATA; if (saved === undefined) delete process.env.ARGUS_OLD_DATA; else process.env.ARGUS_OLD_DATA = saved; }
  calls.userData = paths.userData; return calls;
}
const SVTOP = ["selfimprove-stage/", "selfimprove-verworfen-2026/", "Selfimprove-Verworfen-X/", "backups/", "Backups-alt-nicht-sv/"];
function profile(dir, { config = '{"a":1}', sv = true } = {}) {
  put(path.join(dir, "nutz.txt"), "N"); put(path.join(dir, "selbst-verbesserungen.md"), "# Log"); put(path.join(dir, "nutzdaten", "backups", "d.txt"), "D"); put(path.join(dir, "nutzdaten", "selfimprove-stage", "e.txt"), "E");
  if (config !== null) put(path.join(dir, "jarvis-config.json"), config);
  if (sv) { put(path.join(dir, "selfimprove-pending.json"), '{"backup":"x","started":true}'); put(path.join(dir, "selfimprove-stage", "a.js"), "S"); put(path.join(dir, "selfimprove-verworfen-2026", "b.js"), "A"); put(path.join(dir, "Selfimprove-Verworfen-X", "c.js"), "A2"); put(path.join(dir, "backups", "1", "main.js"), "// SENTINEL-ALT"); put(path.join(dir, "Backups-alt-nicht-sv", "z.txt"), "Z"); }
}
const appDataFor = (name) => { const d = path.join(T, "boot", name, "Roaming"); fs.rmSync(path.dirname(d), { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; };

test("T8 boot.js: Marker und Sicherungen unberührt, Startfehler ohne Rollback", () => {
  for (const marker of ['{"backup":"B","started":true}', '{"backup":"B","started":false}', "kein json", null]) {
    const ad = appDataFor("t8"), ud = path.join(ad, "argus-desktop");
    put(path.join(ud, ".umzug-von-jarvis.json"), "{}"); put(path.join(ud, "backups", "2026", "main.js"), "// SENTINEL-ALT");
    if (marker === null) fs.mkdirSync(path.join(ud, "selfimprove-pending.json"), { recursive: true }); else put(path.join(ud, "selfimprove-pending.json"), marker);
    const before = tree(ud);
    for (let i = 0; i < 3; i++) {
      const n0 = access.length; const c = runBoot(BOOT, ad);
      assert.equal(c.main, 1); assert.equal(c.relaunch, 0); assert.deepEqual(c.exit, []); assert.equal(c.userData, ud);
      assert.ok(!access.slice(n0).some((a) => /selfimprove-pending|[\\/]backups[\\/]/i.test(a.p)), "kein Zugriff auf Marker/Sicherungen");
    }
    assert.deepEqual(tree(ud), before);
  }
  // Startfehler: genau exit(1), kein Rollback, kein Neustart, Protokoll argus-error.log
  let ad = appDataFor("t8b"), ud = path.join(ad, "argus-desktop"); put(path.join(ud, ".umzug-von-jarvis.json"), "{}"); put(path.join(ud, "selfimprove-pending.json"), '{"backup":"B","started":false}');
  let c = runBoot(BOOT, ad, { mainThrows: true }); assert.deepEqual(c.exit, [1]); assert.equal(c.relaunch, 0); assert.match(fs.readFileSync(path.join(ud, "argus-error.log"), "utf8"), /Start fehlgeschlagen: Error: main kaputt/);
  assert.equal(fs.readFileSync(path.join(ud, "selfimprove-pending.json"), "utf8"), '{"backup":"B","started":false}');
  // Erster Start, userData fehlt noch (VM-Befund I6): Ordner wird angelegt, Eintrag geschrieben, genau exit(1), sonst nichts im Ordner
  ad = appDataFor("t8c"); ud = path.join(ad, "argus-desktop"); assert.ok(!fs.existsSync(ud));
  c = runBoot(BOOT, ad, { mainThrows: true }); assert.deepEqual(c.exit, [1]); assert.equal(c.relaunch, 0);
  assert.match(fs.readFileSync(path.join(ud, "argus-error.log"), "utf8"), /Start fehlgeschlagen: Error: main kaputt/); assert.deepEqual(fs.readdirSync(ud), ["argus-error.log"]);
  // Ordner kann nicht angelegt werden: kein Logversuch, trotzdem genau exit(1), kein Neustart, nichts angelegt
  ad = appDataFor("t8c-mkdir"); ud = path.join(ad, "argus-desktop");
  c = runBoot(BOOT, ad, { mainThrows: true, mkdirThrows: true }); assert.deepEqual(c.exit, [1]); assert.equal(c.relaunch, 0); assert.equal(c.append, 0); assert.ok(!fs.existsSync(ud));
  // Referenz 0.58.19: dort ging der Eintrag in diesem Fall verloren (dokumentiert, vorbestehend)
  ad = appDataFor("t8c-ref"); c = runBoot(BOOT_OLD, ad, { mainThrows: true }); assert.deepEqual(c.exit, [1]); assert.ok(!fs.existsSync(path.join(ad, "argus-desktop", "argus-error.log")));
  // Rückfallmodus: jarvis-error.log im Quellprofil
  ad = appDataFor("t8d"); profile(path.join(ad, "jarvis-desktop"), { config: "kaputt", sv: false });
  c = runBoot(BOOT, ad, { mainThrows: true }); assert.equal(c.oldData, "1"); assert.deepEqual(c.exit, [1]); assert.match(fs.readFileSync(path.join(ad, "jarvis-desktop", "jarvis-error.log"), "utf8"), /Start fehlgeschlagen/);
});

test("T10 Profilumzug: keine SV-Daten (oberste Ebene), Abschlussmarker, Fehlerfall, Referenz 0.58.19", () => {
  const svOf = (tr) => Object.keys(tr).filter((k) => /^(selfimprove-stage|selfimprove-verworfen-|backups[\\/]|selfimprove-pending)/i.test(k));
  // Q1 Erfolg
  let ad = appDataFor("q1"), src = path.join(ad, "jarvis-desktop"), dst = path.join(ad, "argus-desktop"); profile(src); const srcBefore = tree(src);
  let c = runBoot(BOOT, ad); assert.equal(c.userData, dst); assert.equal(c.oldData, undefined);
  let t = tree(dst);
  assert.deepEqual(svOf(t), [], "keine SV-Daten im Ziel");
  for (const k of ["nutz.txt", "selbst-verbesserungen.md", "argus-config.json", ".umzug-von-jarvis.json", "nutzdaten/backups/d.txt", "nutzdaten/selfimprove-stage/e.txt", "Backups-alt-nicht-sv/z.txt"]) assert.ok(t[k], "im Ziel: " + k);
  assert.ok(!t["Selfimprove-Verworfen-X/"], "Schreibweise egal");
  const srcAfter = tree(src); const added = Object.keys(srcAfter).filter((k) => !(k in srcBefore)); assert.deepEqual(added, ["UMGEZOGEN.txt"]); for (const k of Object.keys(srcBefore)) assert.equal(srcAfter[k], srcBefore[k], "Quelle unverändert: " + k);
  // Referenz 0.58.19 auf identischem Profil: kopiert Arbeitsordner, Archiv und Sicherungen (Befund nachgewiesen); Nicht-SV-Ergebnis gleich
  const adR = appDataFor("q1ref"); profile(path.join(adR, "jarvis-desktop")); runBoot(BOOT_OLD, adR); const tR = tree(path.join(adR, "argus-desktop"));
  assert.ok(tR["selfimprove-stage/a.js"] && tR["backups/1/main.js"] && tR["selfimprove-verworfen-2026/b.js"], "Referenz kopiert SV-Daten");
  const nonSv = (tr) => Object.keys(tr).filter((k) => !/^(selfimprove-stage|selfimprove-verworfen-|backups[\\/]|selfimprove-pending)/i.test(k) && k !== ".umzug-von-jarvis.json").sort();
  assert.deepEqual(nonSv(t), nonSv(tR), "Nicht-SV-Einträge wie 0.58.19");
  // (f) zweiter Start: kein erneuter Umzug
  put(path.join(src, "nutz.txt"), "GEAENDERT"); c = runBoot(BOOT, ad); assert.equal(fs.readFileSync(path.join(dst, "nutz.txt"), "utf8"), "N");
  // Q2 Jarvis, Q3 beide (Vorrang jarvis-desktop), Q4 ohne Konfiguration
  ad = appDataFor("q2"); profile(path.join(ad, "Jarvis")); c = runBoot(BOOT, ad); assert.equal(c.userData, path.join(ad, "argus-desktop")); assert.deepEqual(svOf(tree(path.join(ad, "argus-desktop"))), []);
  ad = appDataFor("q3"); profile(path.join(ad, "jarvis-desktop")); profile(path.join(ad, "Jarvis")); put(path.join(ad, "Jarvis", "nur-jarvis.txt")); runBoot(BOOT, ad); assert.ok(!fs.existsSync(path.join(ad, "argus-desktop", "nur-jarvis.txt")));
  ad = appDataFor("q4"); profile(path.join(ad, "jarvis-desktop"), { config: null }); const q4 = tree(path.join(ad, "jarvis-desktop")); c = runBoot(BOOT, ad); assert.ok(!fs.existsSync(path.join(ad, "argus-desktop", "nutz.txt"))); assert.deepEqual(tree(path.join(ad, "jarvis-desktop")), q4);
  // Q5 Ziel ohne Abschlussmarker: Umzug läuft erneut (wie 0.58.19), ohne SV-Daten
  ad = appDataFor("q5"); profile(path.join(ad, "jarvis-desktop")); put(path.join(ad, "argus-desktop", "nutz.txt"), "ALT"); runBoot(BOOT, ad); assert.equal(fs.readFileSync(path.join(ad, "argus-desktop", "nutz.txt"), "utf8"), "N"); assert.deepEqual(svOf(tree(path.join(ad, "argus-desktop"))), []);
  // Q6 nur UMGEZOGEN.txt: verhindert nichts
  ad = appDataFor("q6"); profile(path.join(ad, "jarvis-desktop")); put(path.join(ad, "jarvis-desktop", "UMGEZOGEN.txt"), "alt"); runBoot(BOOT, ad); assert.ok(fs.existsSync(path.join(ad, "argus-desktop", ".umzug-von-jarvis.json")));
  // (e) Fehlerfall: ungültige jarvis-config.json
  ad = appDataFor("e"); src = path.join(ad, "jarvis-desktop"); profile(src, { config: "{kaputt" }); put(path.join(src, "jarvis-error.log"), "ALT\n"); const eBefore = tree(src);
  c = runBoot(BOOT, ad); assert.equal(c.userData, src); assert.equal(c.oldData, "1");
  const log = fs.readFileSync(path.join(src, "jarvis-error.log"), "utf8"); assert.ok(log.startsWith("ALT\n")); assert.match(log, /Umzug nach .* fehlgeschlagen/);
  assert.ok(!fs.existsSync(path.join(src, "UMGEZOGEN.txt"))); assert.ok(!fs.existsSync(path.join(ad, "argus-desktop", ".umzug-von-jarvis.json")));
  assert.deepEqual(svOf(tree(path.join(ad, "argus-desktop"))), [], "teilweise angelegtes Ziel ohne SV-Daten");
  for (const k of Object.keys(eBefore)) if (k !== "jarvis-error.log") assert.equal(tree(src)[k], eBefore[k]);
  // (g) Verknüpfung im Quellprofil: Verhalten festhalten
  ad = appDataFor("g"); src = path.join(ad, "jarvis-desktop"); profile(src, { sv: false }); const aussen = path.join(T, "boot", "g", "aussen"); put(path.join(aussen, "geheim.txt"), "G");
  fs.symlinkSync(aussen, path.join(src, "link-nach-aussen"), "junction"); fs.symlinkSync(aussen, path.join(src, "selfimprove-verworfen-link"), "junction");
  const cg = runBoot(BOOT, ad); const lg = path.join(ad, "argus-desktop", "link-nach-aussen");
  const linkInfo = fs.existsSync(lg) ? (fs.lstatSync(lg).isSymbolicLink() ? "als Verknüpfung kopiert" : "Inhalt kopiert") : "nicht kopiert";
  assert.ok(!fs.existsSync(path.join(ad, "argus-desktop", "selfimprove-verworfen-link")), "SV-Name als Junction ausgeschlossen");
  assert.ok(!fs.existsSync(path.join(ad, "argus-desktop", "link-nach-aussen", "geheim.txt")) || fs.lstatSync(lg).isSymbolicLink(), "Inhalt ausserhalb des Profils nicht kopiert");
  const elog = fs.existsSync(path.join(src, "jarvis-error.log")) ? fs.readFileSync(path.join(src, "jarvis-error.log"), "utf8") : "";
  // Referenz 0.58.19 mit gleicher Junction: gleiches Ergebnis (bestehendes Verhalten, nicht durch den Hotfix verursacht)
  const adG = appDataFor("gref"), srcG = path.join(adG, "jarvis-desktop"); profile(srcG, { sv: false }); const aussenG = path.join(T, "boot", "gref", "aussen"); put(path.join(aussenG, "geheim.txt"), "G");
  fs.symlinkSync(aussenG, path.join(srcG, "link-nach-aussen"), "junction"); const cr = runBoot(BOOT_OLD, adG);
  assert.equal(cg.oldData, cr.oldData, "Rückfallverhalten wie 0.58.19");
  process.stdout.write(`# T10(g) Junction ausserhalb der SV-Namen (Node ${process.version}): ${linkInfo}; Rückfall auf altes Profil: ${cg.oldData === "1" ? "ja" : "nein"}; Ursache: ${(elog.match(/fehlgeschlagen: ([^\n]*)/) || [, "–"])[1].slice(0, 60)}; 0.58.19 gleich: ${cg.oldData === cr.oldData}\n`);
});

// ===================== T11–T13 files.js =====================
const PROF = path.join(APPDATA, "argus-desktop");
function filesFixture() {
  fs.rmSync(HOME, { recursive: true, force: true }); fs.mkdirSync(APPDATA, { recursive: true });
  put(path.join(PROF, "selfimprove-stage", "stage-geheim.js")); put(path.join(PROF, "selfimprove-verworfen-2026-x", "sv-geheim.js")); put(path.join(PROF, "selfimprove-verworfen-2026-x", "unter", "sv2-geheim.js"));
  put(path.join(PROF, "Selfimprove-Verworfen-Y", "sv3-geheim.js")); put(path.join(PROF, "backups", "1", "backup-geheim.js")); put(path.join(PROF, "selfimprove-pending.json"), "{}");
  put(path.join(HOME, "Documents", "nutz-test.txt"), "NUTZ"); put(path.join(HOME, "Documents", "normal-geheim.txt"), "NORMAL"); put(path.join(HOME, "Documents", "selfimprove-verworfen-datei.txt"), "SVDATEI");
  fs.rmSync(path.dirname(process.env.JARVIS_INDEX), { recursive: true, force: true });
}
const asLinux = async (fn) => { const d = Object.getOwnPropertyDescriptor(process, "platform"); Object.defineProperty(process, "platform", { value: "linux" }); try { return await fn(); } finally { Object.defineProperty(process, "platform", d); } };
const SVRX = /selfimprove-verworfen|selfimprove-pending|selfimprove-stage|[\\/]backups[\\/]/i;

test("T11 Dateiverzeichnis und Suche ohne Index schließen SV-Daten aus (inkl. Referenz 0.58.19)", async () => {
  // Referenz: alter Code nimmt Archiv und Marker auf
  filesFixture(); const old = fresh("tests/fixtures/files-0.58.19.js");
  await withPhase("REF", () => asLinux(() => old.build({ force: true }))); const refIdx = fs.readFileSync(process.env.JARVIS_INDEX, "utf8");
  assert.match(refIdx, /selfimprove-verworfen-2026-x/); assert.match(refIdx, /selfimprove-pending\.json/);
  fs.rmSync(process.env.JARVIS_INDEX); const refQ = await withPhase("REF", () => old.search("sv-geheim")); assert.ok(refQ.some((p) => /selfimprove-verworfen/.test(p)), "Referenz-Schnellsuche findet Archivinhalt");
  // Hotfix
  filesFixture(); const F = fresh("files.js");
  for (let run = 0; run < 2; run++) {
    const n0 = access.length; const n = await withPhase("HOT", () => asLinux(() => F.build({ force: true })));
    assert.ok(n > 0, "Durchlauf fand statt"); const idx = fs.readFileSync(process.env.JARVIS_INDEX, "utf8");
    assert.ok(!SVRX.test(idx.split("\n").filter((l) => !/nutz|normal/.test(l)).join("\n")), "keine SV-Pfade im Index");
    assert.match(idx, /nutz-test\.txt/); assert.match(idx, /normal-geheim\.txt/);
    assert.ok(!access.slice(n0).some((a) => a.op === "opendir" && /selfimprove-verworfen|Selfimprove-Verworfen/.test(a.p)), "kein Abstieg in Archive");
  }
  // Suche ohne Index (files.js:62) und mit Index ohne Treffer (files.js:82)
  for (const variant of ["ohne-index", "index-ohne-treffer"]) {
    fs.rmSync(path.dirname(process.env.JARVIS_INDEX), { recursive: true, force: true });
    if (variant === "index-ohne-treffer") put(process.env.JARVIS_INDEX, "C:\\gar\\nichts.txt\n");
    const n0 = access.length; phase = "HOT";
    assert.deepEqual(await F.search("sv-geheim"), [], variant); assert.deepEqual(await F.search("sv2-geheim"), []); assert.deepEqual(await F.search("stage-geheim"), []); assert.deepEqual(await F.search("backup-geheim"), []);
    assert.deepEqual(await F.search("selfimprove-pending"), []);
    assert.ok((await F.search("nutz-test")).some((p) => p.endsWith("nutz-test.txt")), "Gegenprobe " + variant);
    assert.ok(access.slice(n0).some((a) => a.op === "readdirSync" && a.p === HOME), "Schnellsuche lief: " + variant);
    assert.ok(!access.slice(n0).some((a) => a.op === "readdirSync" && /selfimprove-verworfen|Selfimprove-Verworfen|selfimprove-stage|[\\/]backups$/i.test(a.p)), "kein Abstieg: " + variant);
    phase = "FIX";
  }
});

test("T12 Treffer aus vorhandenem altem Index und aus der Windows-Suche werden gefiltert", async () => {
  filesFixture(); const F = fresh("files.js");
  const P = "C:\\Users\\X\\AppData\\Roaming";
  put(process.env.JARVIS_INDEX, [`${P}\\argus-desktop\\selfimprove-pending.json`, `${P}\\argus-desktop\\selfimprove-verworfen-1\\geheim.js`, `${P}\\argus-desktop\\selfimprove-stage\\geheim.js`,
    `${P}\\argus-desktop\\backups\\1\\geheim.js`, `${P}\\jarvis-desktop\\backups\\geheim.js`, `${P}\\Jarvis\\Backups\\geheim.js`, "D:\\Daten\\backups\\geheim-eigen.txt", "C:\\Users\\X\\Documents\\geheim.txt"].join("\n") + "\n");
  const r = await withPhase("HOT", () => F.search("geheim", 50));
  assert.deepEqual(r.sort(), ["C:\\Users\\X\\Documents\\geheim.txt", "D:\\Daten\\backups\\geheim-eigen.txt"].sort());
  assert.deepEqual(await F.search("selfimprove-pending"), []);
  // Windows-Suche: nicht leere Treffer mit SV-Pfaden und normalen Pfaden
  const lines = [`${P}\\argus-desktop\\selfimprove-verworfen-1\\a.js`, `${P}\\argus-desktop\\backups\\1\\b.js`, `${P}\\argus-desktop\\selfimprove-stage\\c.js`, `${P}\\argus-desktop\\selfimprove-pending.json`, "D:\\Daten\\backups\\eigene.txt", "C:\\Docs\\normal.txt"];
  let called = 0; execFileHandler = (cmd, args, opts, cb) => { called++; assert.equal(cmd, "powershell.exe"); setImmediate(() => cb(null, lines.join("\r\n") + "\r\n")); return {}; };
  try { const s = await F.searchContent("geheim", 15); assert.equal(called, 1); assert.deepEqual(s, ["D:\\Daten\\backups\\eigene.txt", "C:\\Docs\\normal.txt"]); }
  finally { execFileHandler = null; }
});

test("T13 Begrenzte Sperre für direkte Zugriffe (R-FILE-1) und bekannte Grenze", () => {
  filesFixture(); const F = fresh("files.js");
  put(path.join(PROF, "notiz.txt"), "PROFIL"); put(path.join(APPDATA, "jarvis-desktop", "x.txt"), "J");
  put(path.join(APPDATA, "Jarvis", "y.txt"), "JA"); phase = "HOT";
  for (const p of [path.join(APPDATA, "Jarvis", "y.txt"), path.join(APPDATA, ".", "Jarvis", "y.txt"), path.join(APPDATA, "x", "..", "Jarvis", "y.txt"), APPDATA + "\\.\\Jarvis\\y.txt", path.join(LOCAL, "..", "Roaming", "jarvis", "y.txt"),
    APPDATA + "\\.\\argus-desktop\\notiz.txt", path.join(PROF, "notiz.txt"), PROF, path.join(PROF, "backups", "1", "backup-geheim.js"), path.join(APPDATA, "jarvis-desktop", "x.txt"), path.join(PROF.toUpperCase(), "notiz.txt"),
    path.join(HOME, "Documents", "selfimprove-verworfen-datei.txt"), path.join(PROF, "selfimprove-verworfen-2026-x", "sv-geheim.js"), path.join(HOME, "Documents", "..", "AppData", "Roaming", "argus-desktop", "notiz.txt")]) {
    assert.match(F.read(p), /ist gesperrt/, p);
  }
  assert.match(F.list(PROF), /ist gesperrt/); assert.match(F.list(APPDATA + "\\.\\Jarvis"), /ist gesperrt/);
  put(path.join(HOME, "Documents", "Jarvis", "projekt.txt"), "P"); assert.equal(F.read(path.join(HOME, "Documents", "Jarvis", "projekt.txt")), "P", "Ordner Jarvis ausserhalb von AppData bleibt lesbar");
  assert.equal(F.read(path.join(HOME, "Documents", "nutz-test.txt")), "NUTZ", "normale Datei bleibt lesbar");
  // Bekannte Grenze (dokumentiert, kein Schutz behauptet): eine Junction mit anderem Namen umgeht die Pfadprüfung
  const alias = path.join(HOME, "Documents", "alias"); fs.symlinkSync(PROF, alias, "junction");
  const viaAlias = F.read(path.join(alias, "notiz.txt"));
  assert.equal(viaAlias, "PROFIL", "Grenze bestätigt: Junction-Alias wird nicht erkannt");
  process.stdout.write("# T13 bekannte Grenze: Lesen über eine Junction mit anderem Namen ist NICHT gesperrt\n"); phase = "FIX";
});

// ===================== T14 Such- und Öffnungswege über actions.js =====================
test("T14 actions.run(): Suchtreffer aus SV-Daten werden weder gefunden noch geöffnet (inkl. Referenz 0.58.19)", async () => {
  const docs = path.join(HOME, "Documents");
  const prep = () => { filesFixture(); put(path.join(docs, "selfimprove-verworfen-1", "geheimx.js"), "SV"); put(path.join(docs, "selfimprove-stage", "geheimy.js"), "SV"); put(path.join(PROF, "selfimprove-verworfen-2", "geheimz.js"), "SV"); put(path.join(docs, "nutz-test.txt"), "NUTZ"); };
  const svWin = [`${PROF}\\selfimprove-verworfen-2\\geheimz.js`, `${PROF}\\backups\\1\\geheimz.js`];
  const cmds = ["Öffne Datei geheimx", "Öffne Datei geheimy", "Öffne Datei geheimz", "Öffne geheimx", "Such geheimx", "Wo ist geheimz", "Öffne selfimprove-verworfen-1", "Öffne Datei selfimprove-pending"];
  const run = async (mod, ph) => {
    const out = []; shellCalls.length = 0; let content = 0;
    execFileHandler = (cmd, args, opts, cb) => { if (isStartApps(cmd, args)) { setImmediate(() => cb(null, "[]", "")); return {}; } content++; setImmediate(() => cb(null, svWin.join("\r\n") + "\r\n")); return {}; };
    try { await withPhase(ph, async () => { for (const c of cmds) out.push([c, await mod.run(c)]); }); } finally { execFileHandler = null; }
    return { out, opened: shellCalls.map((x) => x[1]), content };
  };
  // Referenz 0.58.19: öffnet SV-Dateien (Befund nachgewiesen)
  prep(); delete require.cache[require.resolve(path.join(REPO, "tests", "fixtures", "files-0.58.19.js"))]; const oldA = fresh("tests/fixtures/actions-0.58.19.js");
  const ref = await run(oldA, "REF"); assert.ok(ref.opened.some((p) => /selfimprove-verworfen|selfimprove-stage/i.test(p)), "Referenz öffnet SV-Datei: " + JSON.stringify(ref.opened));
  // Hotfix: ohne Index (Schnellsuche) und mit Index
  for (const withIndex of [false, true]) {
    prep(); fresh("files.js"); const A = fresh("actions.js"); const F = require(path.join(REPO, "files.js"));
    if (withIndex) await withPhase("HOT", () => asLinux(() => F.build({ force: true })));
    const r = await run(A, "HOT");
    assert.deepEqual(r.opened.filter((p) => /selfimprove-verworfen|selfimprove-stage|selfimprove-pending|[\\/]backups[\\/]/i.test(p)), [], `kein SV-Pfad geöffnet (Index: ${withIndex})`);
    assert.ok(r.content > 0, "Windows-Suche wurde mit nicht leeren SV-Treffern aufgerufen");
    for (const [c, ans] of r.out) assert.ok(!/[\\/](selfimprove-verworfen|selfimprove-stage|selfimprove-pending)/i.test(String(ans)), `Antwort nennt keinen SV-Pfad: ${c} -> ${ans}`);
    shellCalls.length = 0; await withPhase("HOT", () => A.run("Öffne Datei nutz-test"));
    assert.deepEqual(shellCalls, [["openPath", path.join(docs, "nutz-test.txt")]], "Gegenprobe öffnet normale Datei");
  }
  // Programmsuche scanApps (actions.js:74-95): Programm in einem Archivordner auf dem Desktop wird nicht gestartet, normales Programm schon
  const desk = path.join(HOME, "Desktop");
  const prepApps = () => { prep(); put(path.join(desk, "selfimprove-verworfen-9", "Svwerkzeug.exe"), "EXE"); put(path.join(desk, "Normalwerkzeug.exe"), "EXE"); };
  const runApps = async (mod, ph) => { shellCalls.length = 0; execFileHandler = (cmd, args, opts, cb) => { setImmediate(() => cb(null, isStartApps(cmd, args) ? "[]" : "")); return {}; };
    try { const a = await withPhase(ph, () => mod.run("Starte Svwerkzeug")); const opened1 = shellCalls.map((x) => x[1]); shellCalls.length = 0; const b = await withPhase(ph, () => mod.run("Starte Normalwerkzeug")); return { a, b, opened1, opened2: shellCalls.map((x) => x[1]) }; } finally { execFileHandler = null; } };
  prepApps(); delete require.cache[require.resolve(path.join(REPO, "tests", "fixtures", "files-0.58.19.js"))]; const refApps = await runApps(fresh("tests/fixtures/actions-0.58.19.js"), "REF");
  assert.ok(refApps.opened1.some((p) => /selfimprove-verworfen-9/i.test(p)), "Referenz startet Programm aus Archivordner: " + JSON.stringify(refApps.opened1));
  prepApps(); fresh("files.js"); const hotApps = await runApps(fresh("actions.js"), "HOT");
  assert.deepEqual(hotApps.opened1.filter((p) => /selfimprove-verworfen/i.test(p)), [], "kein Start aus Archivordner");
  assert.deepEqual(hotApps.opened2, [path.join(desk, "Normalwerkzeug.exe")], "Gegenprobe: normales Programm wird gestartet");
});

// ===================== T9 Quelltext, Systemtext, IPC-Pfade (Node-Ersatz für Electron) =====================
const src = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
test("T9 Quelltextprüfungen", () => {
  const si = src("selfimprove.js"), bt = src("boot.js"), mj = src("main.js"), fj = src("files.js");
  for (const bad of ["child_process", "spawn(", "rmSync", "unlinkSync", "rmdirSync", "copyFileSync", "selfimprove-pending", "backups", "recursive"]) assert.ok(!si.includes(bad), "selfimprove.js enthält " + bad);
  for (const bad of ["relaunch", "copyTree", "rollback", "marker"]) assert.ok(!bt.includes(bad), "boot.js enthält " + bad);
  assert.ok(bt.includes('require("./main.js")') && bt.includes("app.exit(1)"));
  for (const bad of ["rollbackPending", "confirmHealthy", "selfimprove.pending", "selfimprove.improve", "selfimprove.apply", "selfimprove.undo", "selfimprove.parse", "currentOffer", "Verbessere dich:"]) assert.ok(!mj.includes(bad), "main.js enthält " + bad);
  assert.ok(mj.includes('function restartSoon(ms = 6000) { setTimeout(() => { crash.clean(); app.relaunch(); app.exit(0); }, ms); }'));
  assert.ok(mj.includes('function selfResult(r) { sendUI("self-improve", r); if (r.restart) restartSoon(); return r.text; }'));
  assert.ok(mj.includes("const reindex = () => files.build({") && mj.includes("setTimeout(reindex, 8000); setInterval(reindex, 3600e3);"));
  assert.ok(fj.includes('"selfimprove-stage", "backups"]);'), "SKIP unverändert");
});

function evalSnippet(from, to, ctx) {
  const lines = src("main.js").split(/\r?\n/); const a = lines.findIndex((l) => l.includes(from)); let b = -1;
  const hit = typeof to === "function" ? to : (l) => l.includes(to);
  for (let i = a; i >= 0 && i < lines.length; i++) if (hit(lines[i])) { b = i; break; }
  assert.ok(a >= 0 && b >= a, `Ausschnitt ${from} … ${to}`); vm.runInNewContext(lines.slice(a, b + 1).join("\n"), ctx); return ctx;
}
test("T9b Systemanweisung vollständig zusammengesetzt (main.js rules)", () => {
  const ctx = { config: { userName: "Test", userInfo: "" } };
  evalSnippet("const userName = () =>", (l) => l.trim() === "};", ctx);
  vm.runInContext("globalThis.__r = rules('Argus')", ctx);
  const r = ctx.__r;
  assert.match(r, /Selbstverbesserung von Argus ist in dieser Version aus Sicherheitsgründen abgeschaltet/);
  assert.ok(!/Verbessere dich|Prüf dich|erkläre genau diese Befehle|Änderung an Argus/.test(r), r);
  assert.match(r, /Fragt Test nach dem Gedächtnis, erkläre den Befehl "Merk dir: …"/);
});

test("T9c IPC-Pfade und Befehlsweiterleitung (Ausschnitt aus main.js mit Attrappen)", async () => {
  clean();
  const handlers = {}, ui = [], sys = { relaunch: 0, exit: [], clean: 0, opened: [] }, actionsCalls = [], memCalls = [];
  const ctx = {
    selfimprove: SI, sendUI: (ch, r) => ui.push([ch, r]), crash: { clean: () => sys.clean++ }, app: { relaunch: () => sys.relaunch++, exit: (c) => sys.exit.push(c) }, setTimeout: () => 0,
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { handlers[ch] = fn; } }, fs, shell: { openPath: (p) => sys.opened.push(p) },
    memory: { parse: (t) => (memCalls.push(t), /^merk dir/i.test(t) ? { kind: "remember" } : null), run: () => "Gemerkt." }, actions: { run: async (t) => (actionsCalls.push(t), null) }, remember: () => {},
  };
  evalSnippet("function restartSoon(", 'ipcMain.handle("self-offer"', ctx);
  evalSnippet('ipcMain.on("open-changelog"', (l) => l.trim() === "});", ctx);
  vm.runInContext('let prevAction = "";', ctx);
  evalSnippet('ipcMain.handle("action"', "const did = await actions.run(text)", ctx);
  const act = (t) => handlers.action(null, t);
  ui.length = 0; assert.equal(await act("Verbessere dich: zeig die Uhrzeit"), DISABLED); assert.equal(ui.length, 0, "kein Ereignis bei improve");
  for (const t of ["Prüf dich auf Fehler", "Verbessere dich"]) { ui.length = 0; assert.equal(await act(t), DISABLED); assert.equal(ui.length, 0); }
  for (const t of ["Übernehmen", "Mach die letzte Verbesserung rückgängig"]) { ui.length = 0; assert.equal(await act(t), DISABLED); assert.deepEqual(ui, [["self-improve", { ok: false, text: DISABLED }]]); }
  ui.length = 0; assert.equal(await handlers["self-apply"](), DISABLED); assert.deepEqual(ui, [["self-improve", { ok: false, text: DISABLED }]]);
  assert.equal(await handlers["self-offer"](), null);
  // Verwerfen über IPC mit vorhandenem Arbeitsordner
  put(path.join(STAGE, "x.txt"), "X"); ui.length = 0; const txt = await handlers["self-discard"]();
  assert.equal(typeof txt, "string"); assert.match(txt, /^Verworfen/); assert.equal(ui.length, 1); assert.equal(ui[0][1].ok, true);
  const arch = fs.readdirSync(UD).find((n) => n.startsWith("selfimprove-verworfen-")); assert.equal(fs.readFileSync(path.join(UD, arch, "x.txt"), "utf8"), "X");
  // danach ist "Verwerfen" eine normale Eingabe
  ui.length = 0; actionsCalls.length = 0; await act("Verwerfen"); assert.equal(ui.length, 0); assert.deepEqual(actionsCalls, ["Verwerfen"]);
  // normale Befehle gehen an Gedächtnis bzw. Aktionen
  assert.equal(await act("Merk dir: Testeintrag"), "Gemerkt.");
  actionsCalls.length = 0; for (const t of ["Wie spät ist es", "Starte Elden Ring", "Schalte das Licht im Wohnzimmer an"]) assert.notEqual(await act(t), DISABLED); assert.equal(actionsCalls.length, 3);
  // B9 nach Wunsch: Bestätigung abgelehnt, anderer Befehl weitergeleitet
  await act("Verbessere dich: Uhr"); assert.equal(await act("Mach das"), DISABLED);
  await act("Verbessere dich: Uhr"); actionsCalls.length = 0; await act("Mach das Licht an"); assert.deepEqual(actionsCalls, ["Mach das Licht an"]);
  assert.equal(sys.relaunch, 0); assert.deepEqual(sys.exit, []);
  // Änderungsprotokoll: fehlt -> mit Abschalthinweis angelegt und geöffnet; vorhanden -> unverändert
  const log = SI.CHANGELOG(); fs.rmSync(log, { force: true }); handlers["open-changelog"](); assert.match(fs.readFileSync(log, "utf8"), /aus Sicherheitsgründen abgeschaltet/); assert.deepEqual(sys.opened, [log]);
  fs.writeFileSync(log, "EIGEN"); handlers["open-changelog"](); assert.equal(fs.readFileSync(log, "utf8"), "EIGEN");
});

test("Z Wächter: keine Verstöße (nur instrumentierte öffentliche fs-, Prozess- und Netzaufrufe)", () => {
  assert.deepEqual(violations, []);
  const SVC = /selfimprove-verworfen|selfimprove-pending|[\\/](argus-desktop|jarvis-desktop|jarvis)[\\/](selfimprove-stage|backups)([\\/]|$)/i, READS = new Set(["readdirSync", "opendirSync", "opendir", "readFileSync", "openSync", "createReadStream", "copyFileSync"]);
  const hot = access.filter((a) => a.phase === "HOT" && READS.has(a.op) && SVC.test(a.p)), ref = access.filter((a) => a.phase === "REF" && READS.has(a.op) && SVC.test(a.p));
  assert.deepEqual(hot.map((a) => a.op + " " + a.p), [], "Hotfixcode liest keine SV-Inhalte (soweit instrumentiert)");
  assert.ok(ref.length > 0, "Referenzcode 0.58.19 liest SV-Inhalte (Nachweis, dass die Instrumentierung greift)");
  process.stdout.write(`# Phasen: HOT ${access.filter((a) => a.phase === "HOT").length}, REF ${access.filter((a) => a.phase === "REF").length}, FIX ${access.filter((a) => a.phase === "FIX").length} Zugriffe; REF-Zugriffe auf SV-Inhalte: ${ref.length}\n`);
  process.stdout.write("# Grenze: erfasst sind nur öffentliche fs-Aufrufe aus JavaScript; Interna von fs.cpSync und native Zugriffe sind nicht vollständig sichtbar; keine unabhängige Dateiüberwachung\n");
  process.stdout.write(`# Testordner: ${T}\n# Protokollierte Dateizugriffe: ${access.length}\n`);
});
