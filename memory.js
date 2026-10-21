// Gedächtnis: jedes Gespräch und jede "Merk dir"-Notiz landet als Datei in einem Ordner, den Domi selbst öffnen kann.
// Reines Node (kein Electron), damit es auch argus-mcp.js nutzen kann, wenn Claude Desktop es ohne laufenden Argus startet.
const fs = require("fs");
const path = require("path");
const os = require("os");

// Ordner heißt seit 0.30 „Argus-Gedaechtnis“; ließ sich der alte nicht umbenennen, wird er weiter benutzt
const DIR = () => {
  if (process.env.JARVIS_MEMORY) return process.env.JARVIS_MEMORY;
  const n = path.join(os.homedir(), "Argus-Gedaechtnis"), o = path.join(os.homedir(), "Jarvis-Gedaechtnis");
  return !fs.existsSync(n) && fs.existsSync(o) ? o : n;
};
const TALKS = () => path.join(DIR(), "gespraeche");
const FACTS = () => path.join(DIR(), "gemerkt.md");
const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (ts) => { const d = new Date(ts); return `${day(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Kleinschreibung, Umlaute vereinheitlicht, Satzzeichen weg
const norm = (s) => String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(("der die das und oder aber ich du er sie es wir ihr mir mich dir dich ein eine einen einem einer ist sind war hat habe haben " +
  "was wie wo wer wann warum noch schon auch nicht nur mal bitte kannst kann soll sollte will wollen mit von fuer auf aus bei nach zum zur den dem des " +
  "dass ob wenn als zu im in an am um so ja nein gut doch sich mein meine dein deine uns euch hier jetzt dann darueber ueber gesprochen besprochen haben " +
  "erinnerst erinnere weisst weiss letzte letzten letztes gestern heute").split(" "));
const words = (s) => norm(s).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));

function ensure() { fs.mkdirSync(TALKS(), { recursive: true }); }

// ---------- Schreiben ----------
function logTurn(user, answer, who) {
  if (!String(user || "").trim() || !String(answer || "").trim()) return;
  ensure();
  const d = new Date();
  fs.appendFileSync(path.join(TALKS(), `${d.getFullYear()}-${pad(d.getMonth() + 1)}.jsonl`),
    JSON.stringify({ ts: d.toISOString(), domi: String(user).slice(0, 4000), antwort: String(answer).slice(0, 6000), von: who || "Argus" }) + "\n");
}
function remember(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!t) return false;
  ensure();
  if (!fs.existsSync(FACTS())) fs.writeFileSync(FACTS(), "# Was Argus sich gemerkt hat\n\n");
  fs.appendFileSync(FACTS(), `- [${day(new Date())}] ${t}\n`);
  return true;
}
function forget(query) {
  const q = norm(query); if (!q || !fs.existsSync(FACTS())) return 0;
  const lines = fs.readFileSync(FACTS(), "utf8").split("\n");
  const keep = lines.filter((l) => !(l.startsWith("- ") && norm(l).includes(q)));
  fs.writeFileSync(FACTS(), keep.join("\n"));
  return lines.length - keep.length;
}

// ---------- Lesen ----------
function facts() {
  try { return fs.readFileSync(FACTS(), "utf8").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)); } catch { return []; }
}
// Gespräche, neueste zuerst; months begrenzt, wie weit zurück gelesen wird
function turns(months = 24) {
  let files = []; try { files = fs.readdirSync(TALKS()).filter((f) => f.endsWith(".jsonl")).sort().slice(-months); } catch {}
  const out = [];
  for (const f of files) for (const line of fs.readFileSync(path.join(TALKS(), f), "utf8").split("\n")) { try { if (line) out.push(JSON.parse(line)); } catch {} }
  return out.reverse();
}
const short = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
let USER = "Nutzer"; // Anrede aus der Einrichtung (setUser)
const fmt = (t, n = 400) => `[${stamp(t.ts)}] ${USER}: ${short(t.domi, n)}\n  ${t.von}: ${short(t.antwort, n)}`;

// Wortsuche mit Wortanfängen (Antminer findet auch Antminers), neuere Treffer leicht bevorzugt
function search(query, n = 6, withFacts = true) {
  const q = words(query); if (!q.length) return [];
  const stems = q.map((w) => w.slice(0, Math.max(4, Math.min(w.length, 6))));
  const now = Date.now(), hits = [];
  const score = (text) => { const ws = new Set(words(text)); let s = 0; for (const st of stems) for (const w of ws) if (w.startsWith(st)) { s++; break; } return s; };
  if (withFacts) for (const f of facts()) { const s = score(f); if (s) hits.push({ s: s + 1, text: "Gemerkt: " + f }); }
  for (const t of turns()) {
    const s = score(t.domi + " " + t.antwort); if (!s) continue;
    const ageDays = (now - Date.parse(t.ts)) / 864e5;
    hits.push({ s: s + Math.max(0, 0.5 - ageDays / 60), text: fmt(t) });
  }
  return hits.filter((h) => h.s >= (stems.length >= 3 ? 2 : 1)).sort((a, b) => b.s - a.s).slice(0, n).map((h) => h.text);
}
// Verlauf nach Zeitraum: "heute", "gestern", ein Datum JJJJ-MM-TT oder die letzten n Gespräche
function history(when = "", n = 12) {
  const all = turns(3); let list = all;
  const w = String(when || "").toLowerCase();
  const d = new Date();
  if (/gestern/.test(w)) { d.setDate(d.getDate() - 1); list = all.filter((t) => t.ts && day(new Date(t.ts)) === day(d)); }
  else if (/heute/.test(w)) list = all.filter((t) => day(new Date(t.ts)) === day(d));
  else if (/^\d{4}-\d{2}-\d{2}$/.test(w)) list = all.filter((t) => day(new Date(t.ts)) === w);
  return list.slice(0, n).reverse().map((t) => fmt(t, 250));
}

// Was die KI vor jeder Antwort zusätzlich bekommt: gemerkte Fakten und passende frühere Gespräche
const RECALL = /(wor(ue|ü)ber|was)\s+(haben|hatten)\s+wir|erinnerst du|weisst du noch|weißt du noch|letzte[ns]?\s+(mal|gespr(ae|ä)ch)|vorhin|gestern|zuletzt besprochen/i;
function contextFor(question) {
  const parts = [];
  const f = facts();
  if (f.length) parts.push("Darum hat " + USER + " dich gebeten, dir zu merken:\n- " + f.slice(-40).join("\n- "));
  if (RECALL.test(question || "")) {
    const h = history(/gestern/i.test(question) ? "gestern" : "", 10);
    if (h.length) parts.push("Eure letzten Gespräche (älteste zuerst):\n" + h.join("\n"));
  } else {
    const s = search(question, 4, false);
    if (s.length) parts.push("Frühere Gespräche, die dazu passen könnten (nur nutzen, wenn sie wirklich helfen):\n" + s.join("\n"));
  }
  return parts.length ? "\n\nGedächtnis (aus dem Argus-Gedächtnisordner, echt gespeichert):\n" + parts.join("\n\n") : "";
}

// Befehle, die ohne KI laufen: "Merk dir: …", "Vergiss …", "Was hast du dir gemerkt?"
function parse(text) {
  const t = String(text || "").trim().replace(/^(jarvis|claude)[\s,]+/i, "");
  let m;
  if ((m = /^(?:bitte\s+)?(?:merk|merke|notier|notiere)\s+(?:dir|das)\b\s*(?:bitte\s*)?[,:]?\s*(?:dass\s+)?([\s\S]+)$/i.exec(t)) && m[1].trim().length > 2)
    return { kind: "remember", text: m[1].trim().replace(/[.!]+$/, "") };
  if ((m = /^(?:bitte\s+)?vergiss\s+(?:bitte\s+)?(?:das\s+mit\s+|dass\s+)?(.+?)[.!]*$/i.exec(t))) return { kind: "forget", text: m[1] };
  if (/^was\s+(?:hast\s+du\s+dir\s+gemerkt|wei(ss|ß)t\s+du\s+(?:alles\s+)?(?:über|ueber)\s+mich)\??$/i.test(t)) return { kind: "list" };
  return null;
}
function run(cmd) {
  if (cmd.kind === "remember") { remember(cmd.text); return "Gemerkt: " + cmd.text + "."; }
  if (cmd.kind === "forget") { const n = forget(cmd.text); return n ? `Vergessen, ${n} ${n === 1 ? "Notiz" : "Notizen"} gelöscht.` : "Dazu habe ich mir nichts gemerkt."; }
  if (cmd.kind === "list") { const f = facts(); return f.length ? "Ich habe mir gemerkt: " + f.slice(-12).map((x) => x.replace(/^\[[\d-]+\]\s*/, "")).join("; ") + "." : "Ich habe mir noch nichts gemerkt. Sag zum Beispiel: Merk dir, dass mein S21 im Container 3 steht."; }
  return null;
}

const setUser = (n) => { USER = String(n || "").trim() || "Nutzer"; };
module.exports = { setUser, DIR, logTurn, remember, forget, facts, turns, search, history, contextFor, parse, run };
