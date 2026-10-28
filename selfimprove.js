// Selbstverbesserung: seit 0.58.20 aus Sicherheitsgründen abgeschaltet. Claude Code durfte mit den bisherigen Freigaben
// auch Dateien außerhalb der Arbeitskopie lesen. Erhalten bleiben nur die Erkennung der Befehle (damit sie nicht an die KI
// gehen), das Verwerfen eines alten Arbeitsordners (nur Umbenennen, nie Löschen) und der Pfad des Änderungsprotokolls.
// Wieder einschalten nur mit einer neuen Version, nie über Einstellungen.
const { app } = require("electron");
const path = require("path");
const nodeFs = require("fs");
const crypto = require("crypto");

const data = (...p) => path.join(app.getPath("userData"), ...p);
const STAGE = () => data("selfimprove-stage");
const CHANGELOG = () => data("selbst-verbesserungen.md");
const ARCHIVE = "selfimprove-verworfen-"; // Präfix archivierter Arbeitsordner; Indexierung, Suche und Umzug schließen ihn aus

const DISABLED = "Die Selbstverbesserung ist aus Sicherheitsgründen abgeschaltet.";
const NOTHING = "Es wartet keine Änderung.";

// Wie 0.58.19: einmal trimmen, Schlusspunkte/-ausrufezeichen weg, ein Anredepräfix weg
function prep(text) {
  if (typeof text !== "string") return "";
  return text.trim().replace(/[.!]+$/, "").replace(/^(jarvis|claude)[\s,]+/i, "");
}

const B1 = /^(mach|nimm)\w*\s+(die\s+)?letzte\s+(verbesserung|änderung)\s+(rückgängig|zurück)/i;
const B2 = /^(ja[\s,]+)?(übernehm|übernimm|annehm|einspiel)\w*(\s+(es|das|die änderung))?$/i;
// Endliche Liste statt "\w*" nach dem Verbstamm, damit bei unbekanntem Zustand des Arbeitsordners keine normalen Sätze abgefangen werden
const B3 = /^(nein[\s,]+)?(verwirf|verwerf|verwerfe|verwerfen|abbrech|abbreche|abbrechen|lösch|lösche|löschen)(\s+(es|das|die änderung))?$/i;
const B4 = [/^(?:prüf|pruef|check|test|kontrollier)\w*\s+(?:dich|euch)\b/i, /\b(?:checkt|prüft|testet)\s+euch\b/i];
const B5 = /selbst ?verbesser|an dir (selbst )?arbeiten|dich selbst (verbessern|ändern)/i;
const B6 = /(?:^|[\s.!?,;])(?:verbesser|optimier|änder|erweiter|überarbeit)\w*\s+dich(?:\s+selbst)?[\s:,]*([\s\S]*)$/i;
const B7 = /(?:^|[\s.!?,;])arbeite?\s+an\s+dir(?:\s+selbst)?[\s:,]*([\s\S]*)$/i;
const B8 = /^(?:verbesser|optimier|änder|erweiter|überarbeit)\w*\s+dich(?:\s+selbst)?$|^arbeite?\s+an\s+dir(?:\s+selbst)?$/i;
// Bestätigungen nur als ganze Eingabe, damit "Mach das Licht an" nach einem Wunsch nicht abgefangen wird
const B9 = [
  /^(?:ja[\s,]+)?(?:bitte\s+)?(?:führ|fuehr)\w*\s+(?:es|das|den auftrag|die verbesserung)\s+(?:bitte\s+)?(?:aus|durch)$/i,
  /^(?:ja[\s,]+)?(?:bitte\s+)?mach\w*\s+(?:es|das)(?:\s+bitte)?$/i,
  /^(?:ja[\s,]+)?(?:bitte\s+)?lege?\s+los$/i,
  /^(?:ja[\s,]+)?(?:bitte\s+)?setz\w*\s+(?:es|das|die verbesserung)\s+um$/i,
  /^(?:ja[\s,]+)?(?:bitte\s+)?bau\w*\s+(?:es|das)\s+ein$/i,
  /^(?:ja[\s,]+)?(?:bitte\s+)?start\w*\s+(?:die verbesserung|den auftrag)$/i,
];
const B10 = /^bau\w*\s+(?:dir|bei dir|in dich)\s+(.+?)(?:\s+ein)?$/i;

const kind = (k) => Object.freeze({ kind: k });

// Erkennt Befehle der Selbstverbesserung. Rein: kein Zustand, kein Dateizugriff. prev wird roh übergeben und nur im
// inneren Aufruf einmal normalisiert (wie parse(prev) in 0.58.19).
function classify(text, prev, opts) {
  if (typeof text !== "string") return null;
  const t = prep(text);
  const stage = opts && (opts.stage === "present" || opts.stage === "absent") ? opts.stage : "unknown";
  let m;
  if (B1.test(t)) return kind("undo");
  if (B2.test(t)) return kind("apply");
  if (stage !== "absent" && B3.test(t)) return kind("discard");
  if (B4.some((r) => r.test(t))) return kind("check");
  if (B5.test(t) && !/:/.test(t)) return kind("explain");
  if ((m = B6.exec(t)) && m[1].trim()) return kind("improve");
  if ((m = B7.exec(t)) && m[1].trim()) return kind("improve");
  if (B8.test(t)) return kind("explain");
  if (B9.some((r) => r.test(t)) && isSelfWish(prev)) return kind("improve");
  if (B10.test(t)) return kind("improve");
  return null;
}
// Vorherige Eingabe war ein Wunsch mit Inhalt (in 0.58.19: improve mit nicht leerem wish)
function isSelfWish(prev) {
  if (typeof prev !== "string" || !prev) return false;
  const k = classify(prev, "", { stage: "absent" });
  return !!k && (k.kind === "improve" || k.kind === "check");
}

function respond(cmd) {
  if (cmd && cmd.kind === "discard") { const { ok, text } = discard(); return { ok, text }; }
  return { ok: false, text: DISABLED };
}

// Zustand des Arbeitsordners ohne Verknüpfungen zu folgen
function stageState({ fs = nodeFs } = {}) {
  try { fs.lstatSync(STAGE()); return "present"; } catch (e) { return e && (e.code === "ENOENT" || e.code === "ENOTDIR") ? "absent" : "unknown"; }
}

// Verwerfen: der alte Arbeitsordner wird nur umbenannt. Kein Löschen, kein Kopieren, keine Rückabwicklung.
function discard({ fs = nodeFs, now = () => new Date(), rand = () => crypto.randomBytes(4).toString("hex") } = {}) {
  const out = (outcome, ok, text) => ({ ok, text, outcome });
  let s;
  try { s = fs.lstatSync(STAGE()); } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return out("none", true, NOTHING);
    return out("failed", false, `Verwerfen ging nicht (${(e && e.code) || "Fehler"}). Es wurde nichts verschoben.`);
  }
  if (!s.isDirectory() || s.isSymbolicLink()) return out("refused", false, "Der Arbeitsordner ist kein normaler Ordner. Es wurde nichts verschoben.");
  let target = null, code = "EEXIST";
  for (let i = 0; i < 5 && !target; i++) {
    let name;
    try { name = ARCHIVE + now().toISOString().replace(/[:.]/g, "-") + "-" + rand(); } catch { code = "Fehler"; break; }
    const p = data(name);
    try { fs.lstatSync(p); } catch (e) {
      if (e && e.code === "ENOENT") { target = p; break; }
      code = (e && e.code) || "Fehler"; break;
    }
  }
  if (!target) return out("failed", false, `Verwerfen ging nicht (${code}). Es wurde nichts verschoben.`);
  try { fs.renameSync(STAGE(), target); } catch (e) {
    return out("failed", false, `Verwerfen ging nicht (${(e && e.code) || "Fehler"}). Es wurde nichts verschoben.`);
  }
  const name = path.basename(target);
  let t;
  try { t = fs.lstatSync(target); } catch (e) {
    return out("moved_unverified", false, `Verschoben nach ${name}, das Ergebnis ließ sich nicht prüfen (${(e && e.code) || "Fehler"}). Bitte den Profilordner prüfen.`);
  }
  if (t.isDirectory() && !t.isSymbolicLink()) return out("moved_dir", true, `Verworfen. Die Änderung liegt archiviert unter ${name}.`);
  return out("moved_other", false, `Verschoben nach ${name}, aber dort liegt kein normaler Ordner. Bitte den Profilordner prüfen.`);
}

module.exports = { classify, respond, stageState, discard, CHANGELOG };
