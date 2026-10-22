// Selbstverbesserung mit Freigabe: der Nutzer sagt "Verbessere dich: ...", Claude Code (über sein Abo) ändert eine Kopie
// von Argus' Quellcode. der Nutzer sieht, was sich ändert, und erst nach seinem Okay wird übernommen und neu gestartet.
// Vorher wird gesichert; startet Argus danach nicht sauber, holt boot.js die Sicherung automatisch zurück.
const { app } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const APP_DIR = __dirname;
const SKIP = new Set(["node_modules", "dist", "pack", ".git"]);
const NEVER = new Set(["boot.js", "package.json", "package-lock.json"]); // der Rückweg bleibt immer unverändert
const data = (...p) => path.join(app.getPath("userData"), ...p);
const STAGE = () => data("selfimprove-stage");
const BACKUPS = () => data("backups");
const MARKER = () => data("selfimprove-pending.json");
const CHANGELOG = () => data("selbst-verbesserungen.md");

// "Verbessere dich: ...", "Bau dir ... ein", "Arbeite an dir: ...", "Übernehmen", "Verwerfen", "Mach die letzte Verbesserung rückgängig"
function parse(text, prev = "") {
  const t = text.trim().replace(/[.!]+$/, "").replace(/^(jarvis|claude)[\s,]+/i, "");
  if (/^(mach|nimm)\w*\s+(die\s+)?letzte\s+(verbesserung|änderung)\s+(rückgängig|zurück)/i.test(t)) return { kind: "undo" };
  if (offer && /^(ja[\s,]+)?(übernehm|übernimm|annehm|einspiel)\w*(\s+(es|das|die änderung))?$/i.test(t)) return { kind: "apply" };
  if (offer && /^(nein[\s,]+)?(verwirf|verwerf|abbrech|lösch)\w*(\s+(es|das|die änderung))?$/i.test(t)) return { kind: "discard" };
  let m;
  // "Prüf dich auf Fehler", "Checkt euch gegenseitig ab": Claude prüft den eigenen Code und schlägt Korrekturen vor
  if (/^(?:prüf|pruef|check|test|kontrollier)\w*\s+(?:dich|euch)\b/i.test(t) || /\b(?:checkt|prüft|testet)\s+euch\b/i.test(t))
    return { kind: "improve", wish: "Prüfe deinen eigenen Code gründlich auf Fehler, Absturzrisiken und Ungereimtheiten und behebe, was du findest. Nichts umbauen, was funktioniert." };
  // Frage nach der Selbstverbesserung ohne konkreten Wunsch: erklären, wie es geht
  if (/selbst ?verbesser|an dir (selbst )?arbeiten|dich selbst (verbessern|ändern)/i.test(t) && !/:/.test(t)) return { kind: "improve", wish: "" };
  // Der Auftrag darf auch mitten im Text stehen ("Gut. Zudem verbessere dich: ..."), auch über mehrere Absätze
  if ((m = /(?:^|[\s.!?,;])(?:verbesser|optimier|änder|erweiter|überarbeit)\w*\s+dich(?:\s+selbst)?[\s:,]*([\s\S]*)$/i.exec(t)) && m[1].trim()) return { kind: "improve", wish: m[1].trim() };
  if ((m = /(?:^|[\s.!?,;])arbeite?\s+an\s+dir(?:\s+selbst)?[\s:,]*([\s\S]*)$/i.exec(t)) && m[1].trim()) return { kind: "improve", wish: m[1].trim() };
  if ((m = /^(?:verbesser|optimier|änder|erweiter|überarbeit)\w*\s+dich(?:\s+selbst)?$|^arbeite?\s+an\s+dir(?:\s+selbst)?$/i.exec(t))) return { kind: "improve", wish: "" };
  // "Führ es durch", "Mach das", "Leg los": der Wunsch aus der vorherigen Nachricht
  if (prev && /(?:^|[\s.!?,;])(?:führ|fuehr|mach|start|leg|setz|bau)\w*\s+(?:es|das|den auftrag|die verbesserung|los|um)\b/i.test(t)) {
    const p = parse(prev);
    if (p && p.kind === "improve" && p.wish) return p;
  }
  if ((m = /^bau\w*\s+(?:dir|bei dir|in dich)\s+(.+?)(?:\s+ein)?$/i.exec(t))) return { kind: "improve", wish: m[1] + " einbauen" };
  return null;
}

function copyTree(src, dst, skipNever = false) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name) || (skipNever && NEVER.has(e.name))) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d, false); else fs.copyFileSync(s, d);
  }
}
function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out); else out.push(path.relative(base, p));
  }
  return out;
}
function backup() {
  const dir = path.join(BACKUPS(), new Date().toISOString().replace(/[:.]/g, "-"));
  copyTree(APP_DIR, dir);
  const all = fs.readdirSync(BACKUPS()).sort(); // nur die letzten 10 Sicherungen behalten
  for (const old of all.slice(0, -10)) fs.rmSync(path.join(BACKUPS(), old), { recursive: true, force: true });
  return dir;
}
function latestBackup() {
  try { const all = fs.readdirSync(BACKUPS()).sort(); return all.length ? path.join(BACKUPS(), all[all.length - 1]) : null; } catch { return null; }
}

// Alle Skripte kompilieren, ohne sie auszuführen: findet Syntaxfehler, bevor etwas übernommen wird
function syntaxCheck(dir) {
  const errors = [];
  for (const rel of listFiles(dir)) {
    const p = path.join(dir, rel);
    try {
      if (p.endsWith(".js")) new vm.Script("(function (exports, require, module, __filename, __dirname) {" + fs.readFileSync(p, "utf8") + "\n})", { filename: rel });
      else if (p.endsWith(".html")) {
        const html = fs.readFileSync(p, "utf8"), re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m;
        while ((m = re.exec(html))) new vm.Script("(async function () {" + m[1] + "\n})", { filename: rel });
      }
    } catch (err) { errors.push(rel + ": " + err.message); }
  }
  return errors;
}
// Welche Dateien hat Claude geändert, und grob wie viele Zeilen dazu/weg
function changes() {
  const out = [];
  const files = new Set([...listFiles(APP_DIR), ...listFiles(STAGE())]);
  for (const rel of files) {
    if (NEVER.has(rel)) continue;
    const a = path.join(APP_DIR, rel), b = path.join(STAGE(), rel);
    const ta = fs.existsSync(a) ? fs.readFileSync(a, "utf8") : null, tb = fs.existsSync(b) ? fs.readFileSync(b, "utf8") : null;
    if (ta === tb) continue;
    const count = new Map();
    for (const l of (ta || "").split("\n")) count.set(l, (count.get(l) || 0) + 1);
    let added = 0;
    for (const l of (tb || "").split("\n")) { const n = count.get(l) || 0; if (n) count.set(l, n - 1); else added++; }
    const removed = [...count.values()].reduce((s, n) => s + n, 0);
    out.push({ file: rel.replace(/\\/g, "/"), added: tb == null ? 0 : added, removed: ta == null ? 0 : removed, status: ta == null ? "neu" : tb == null ? "gelöscht" : "geändert" });
  }
  return out;
}
function writable() {
  try { const t = path.join(APP_DIR, ".write-test"); fs.writeFileSync(t, "x"); fs.unlinkSync(t); return true; } catch { return false; }
}

const PROMPT = (wish) => `Du arbeitest am Quellcode von Argus, einem Desktop-Assistenten (Electron 33, Windows). Dieser Ordner ist der komplette Quellcode:
main.js (Hauptprozess: Fenster, KI, Einstellungen), preload.js (Brücke zur Oberfläche), system.js (Systemwerte), actions.js (Programme/Webseiten öffnen),
selfimprove.js (diese Selbstverbesserung), app/index.html (Gerüst), app/style.css und app/js/01…13 (Oberfläche: Neuronen-Kugel, Panel, Einstellungen, nach Abschnitten getrennt; ARCHITEKTUR.md beschreibt sie).

Wunsch des Nutzers: ${wish}

Regeln:
- Setze den Wunsch vollständig um, mit möglichst kleinen, gezielten Änderungen. Alle bestehenden Funktionen müssen erhalten bleiben.
- Ändere nur Dateien in diesem Ordner. boot.js und package.json nicht anfassen. Keine neuen npm-Pakete, keine Downloads.
- Halte dich an den Stil des vorhandenen Codes: deutsche Kommentare und Texte, gleiche Benennung.
- Lies die betroffenen Stellen, bevor du sie änderst. Ein Syntaxfehler verhindert den Start.
- Du kannst das Werkzeug lokale_ki (die lokale KI auf diesem PC) für eine zweite Meinung zu deiner Änderung nutzen. Verlass dich aber nicht blind darauf, sie ist schwächer als du.
- Antworte am Ende in zwei bis drei kurzen deutschen Sätzen ohne Markdown, was du geändert hast. Das wird dem Nutzer vorgelesen.`;

let running = false, offer = null; // offer: fertige Änderung, die auf des Nutzers Okay wartet

function improve(wish, { exe, model, onStep, mcpConfig }) {
  if (running) return Promise.resolve({ ok: false, text: "Ich arbeite schon an mir. Warte, bis das fertig ist." });
  if (offer) return Promise.resolve({ ok: false, text: "Es wartet noch eine Änderung auf dein Okay. Sag übernehmen oder verwerfen." });
  if (!exe) return Promise.resolve({ ok: false, text: "Dafür brauche ich Claude Code mit deinem Abo. Installier es und melde dich einmal an, dann geht das." });
  if (!writable()) return Promise.resolve({ ok: false, text: "Mein Ordner ist schreibgeschützt. Entpack Argus in einen eigenen Ordner in deinem Benutzerverzeichnis." });
  running = true;
  fs.rmSync(STAGE(), { recursive: true, force: true });
  copyTree(APP_DIR, STAGE());
  onStep("Claude arbeitet an einer Kopie von mir …");
  return new Promise((resolve) => {
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; // über das Abo abrechnen, nicht über einen API-Key
    const viaShell = /\.cmd$/i.test(exe);
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--model", model || "sonnet",
      "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,MultiEdit,Write,Glob,Grep" + (mcpConfig ? ",mcp__argus__lokale_ki" : "")];
    if (mcpConfig) args.push("--mcp-config", mcpConfig); // die lokale KI als Werkzeug, z. B. für eine zweite Meinung
    const p = spawn(viaShell ? `"${exe}"` : exe, args, { cwd: STAGE(), env, windowsHide: true, shell: viaShell });
    p.stdin.end(PROMPT(wish));
    let buf = "", result = "", failed = null, err = "";
    const timer = setTimeout(() => { failed = "Zeitlimit von 15 Minuten überschritten"; p.kill(); }, 15 * 60e3);
    p.stdout.on("data", (chunk) => {
      buf += chunk; const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.type === "assistant") for (const c of j.message?.content || []) {
          if (c.type === "tool_use" && c.input?.file_path) onStep((/^(Edit|MultiEdit|Write)$/.test(c.name) ? "Ändere " : "Lese ") + path.basename(c.input.file_path));
        }
        if (j.type === "result") { if (j.is_error) failed = j.result || j.subtype; else result = j.result || ""; }
      }
    });
    p.stderr.on("data", (c) => { err += c; });
    p.on("error", (e) => { failed = e.message; });
    p.on("close", (code) => {
      clearTimeout(timer); running = false;
      if (!failed && code) failed = (err || "Claude Code beendet mit Code " + code).trim().slice(0, 200);
      if (failed) { fs.rmSync(STAGE(), { recursive: true, force: true }); return resolve({ ok: false, text: "Das hat nicht geklappt, an mir hat sich nichts geändert. Grund: " + failed }); }
      const errors = syntaxCheck(STAGE());
      if (errors.length) { fs.rmSync(STAGE(), { recursive: true, force: true }); return resolve({ ok: false, text: "Die Änderung hatte einen Fehler, ich habe sie verworfen. " + errors[0] }); }
      const files = changes();
      if (!files.length) { fs.rmSync(STAGE(), { recursive: true, force: true }); return resolve({ ok: false, text: "Claude hat nichts geändert. " + result.trim() }); }
      offer = { wish, summary: result.trim() || "Änderung fertig.", files };
      resolve({ ok: true, offer, text: offer.summary + " Soll ich das übernehmen? Sag übernehmen oder verwerfen." });
    });
  });
}

// Freigegebene Änderung einspielen: sichern, kopieren, Neustart überwachen
function apply() {
  if (!offer) return { ok: false, text: "Es wartet keine Änderung." };
  const dir = backup();
  copyTree(STAGE(), APP_DIR, true);
  for (const f of offer.files) if (f.status === "gelöscht") fs.rmSync(path.join(APP_DIR, f.file), { force: true });
  fs.appendFileSync(CHANGELOG(), `\n## ${new Date().toLocaleString("de-DE")}\nWunsch: ${offer.wish}\n\n${offer.summary}\n\nDateien: ${offer.files.map((f) => `${f.file} (+${f.added}/−${f.removed})`).join(", ")}\nSicherung davor: ${dir}\n`);
  fs.writeFileSync(MARKER(), JSON.stringify({ backup: dir, started: false }));
  fs.rmSync(STAGE(), { recursive: true, force: true });
  offer = null;
  return { ok: true, restart: true, text: "Übernommen. Ich starte jetzt neu." };
}
function discard() {
  if (!offer) return { ok: false, text: "Es wartet keine Änderung." };
  offer = null; fs.rmSync(STAGE(), { recursive: true, force: true });
  return { ok: true, text: "Verworfen, an mir bleibt alles, wie es war." };
}
function undo() {
  const dir = latestBackup();
  if (!dir) return { ok: false, text: "Ich habe keine Sicherung gefunden." };
  copyTree(dir, APP_DIR, true);
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true, restart: true, text: "Ich habe die letzte Verbesserung rückgängig gemacht und starte neu." };
}

// Nach dem Neustart: läuft Argus stabil, ist die Änderung angenommen. Sonst sofort zurück.
const pending = () => fs.existsSync(MARKER());
function confirmHealthy() { try { fs.unlinkSync(MARKER()); } catch {} }
function rollbackPending() {
  try { const m = JSON.parse(fs.readFileSync(MARKER(), "utf8")); fs.unlinkSync(MARKER()); copyTree(m.backup, APP_DIR, true); return true; } catch { return false; }
}
const currentOffer = () => offer;

module.exports = { parse, improve, apply, discard, undo, pending, confirmHealthy, rollbackPending, currentOffer, syntaxCheck, CHANGELOG };
