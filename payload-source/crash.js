// Fehlerberichte: Abstürze und unerwartete Fehler werden nur lokal gesammelt. Beim nächsten Start fragt Argus,
// ob der Nutzer einen Bericht als GitHub-Issue senden will, zeigt ihn vorher vollständig und entfernt
// Benutzernamen, Pfade, Schlüssel, Tokens und Wallet-Adressen. Ohne Klick des Nutzers geht nichts raus.
const fs = require("fs"), path = require("path"), os = require("os");
const REPO = "https://github.com/d0mm392/Argus/issues/new";
let dir = "", file = "", marker = "", errLog = "", hist = "", secrets = () => [];
const KEEP_MS = 14 * 864e5; // eigene Berichte bleiben 14 Tage auf diesem PC, danach werden sie gelöscht
const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { items: [], ignored: [] }; } };
const write = (d) => { try { fs.writeFileSync(file, JSON.stringify(d)); } catch {} };
const sig = (msg) => String(msg || "").replace(/\d+/g, "#").slice(0, 120);

function init(userData, logFile, getSecrets) {
  dir = userData; file = path.join(dir, "crash-pending.json"); marker = path.join(dir, "running.flag"); hist = path.join(dir, "crash-history.json"); errLog = logFile; secrets = getSecrets || secrets;
  // Lag die Markierung noch da, endete der letzte Lauf nicht sauber (harter Absturz, abgeschossen)
  let since = 0; try { since = Number(fs.readFileSync(marker, "utf8")) || 1; } catch {}
  // Ohne Eintrag im Fehlerprotokoll war es meist ein Update, Neustart oder das Beenden von außen: dann nicht melden
  if (since) { const log = lastLog(since); if (log) add("Unerwartet beendet", "Argus wurde beim letzten Mal nicht normal beendet.", log); }
  try { fs.writeFileSync(marker, String(Date.now())); } catch {}
  try { fs.writeFileSync(hist, JSON.stringify(histRead())); } catch {} // Abgelaufenes löschen
}
// Eigene Berichte zum Nachlesen: nur lokal, mit dem, was der Nutzer gesehen hat (schon bereinigt), 14 Tage lang
function histRead() {
  let a = []; try { a = JSON.parse(fs.readFileSync(hist, "utf8")); } catch {}
  a = (Array.isArray(a) ? a : []).filter((x) => x && typeof x.id === "string" && Date.now() - Date.parse(x.t) < KEEP_MS);
  return a;
}
function archive(title, text, state) {
  if (!hist || !String(text || "").trim()) return null;
  const a = histRead(), it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), title: redact(String(title || "Fehlerbericht")).slice(0, 160), text: redact(String(text)).slice(0, 20000), state: ["gesendet", "kopiert", "nicht gesendet"].includes(state) ? state : "nicht gesendet" };
  a.push(it); try { fs.writeFileSync(hist, JSON.stringify(a.slice(-60))); } catch {}
  return it.id;
}
const history = () => histRead().map((x) => ({ id: x.id, t: x.t, title: x.title, state: x.state })).reverse();
const view = (id) => histRead().find((x) => x.id === id) || null;
function remove(id) { const a = histRead().filter((x) => x.id !== id); try { fs.writeFileSync(hist, JSON.stringify(a)); } catch {} return true; }
function clean() { try { fs.unlinkSync(marker); } catch {} }
// letzte Zeilen des Fehlerprotokolls, mit since nur die aus dem letzten Lauf
function lastLog(since = 0) {
  try {
    let lines = fs.readFileSync(errLog, "utf8").split("\n").filter(Boolean);
    if (since) { const i = lines.findIndex((l) => { const t = Date.parse(l.replace(/^\[/, "").slice(0, 24)); return t && t >= since; }); lines = i < 0 ? [] : lines.slice(i); }
    return lines.slice(-25).join("\n");
  } catch { return ""; }
}

// harmlose Browser-Meldungen, die nichts kaputt machen (ResizeObserver beim Größenändern, abgebrochene Medien/Netz)
const NOISE = /ResizeObserver loop|Script error\.?$|AbortError|The play\(\) request was interrupted|Failed to fetch|NetworkError|net::ERR_/i;
function add(kind, msg, stack = "") {
  if (!file || NOISE.test(String(msg || ""))) return;
  const d = read(), s = sig(kind + msg);
  if ((d.ignored || []).includes(s) || d.items.some((x) => x.sig === s)) return;
  d.items.push({ t: new Date().toISOString(), kind, msg: String(msg || "").slice(0, 500), stack: String(stack || "").slice(0, 3000), sig: s });
  d.items = d.items.slice(-6); write(d);
}

// alles Persönliche entfernen, bevor der Nutzer den Bericht sieht
function redact(t) {
  let s = String(t || "");
  for (const v of secrets()) if (v && String(v).length >= 6) s = s.split(String(v)).join("<entfernt>");
  const home = os.homedir(), user = os.userInfo().username, host = os.hostname();
  if (home) s = s.split(home).join("~").split(home.replace(/\\/g, "/")).join("~");
  if (user && user.length > 2) s = s.replace(new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<user>");
  if (host && host.length > 2) s = s.replace(new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<pc>");
  return s
    .replace(/\b(bc1|tb1)[0-9a-z]{20,}\b/gi, "<wallet>").replace(/\b[13][1-9A-HJ-NP-Za-km-z]{25,34}\b/g, "<wallet>")
    .replace(/sk-ant-[\w-]+/g, "<entfernt>").replace(/\b[\w-]{24,}\.[\w-]{6,}\.[\w-]{20,}\b/g, "<entfernt>") // Discord-Token-Form
    .replace(/([?&](key|token|apikey|access_token)=)[^&\s]+/gi, "$1<entfernt>")
    .replace(/\b[A-F0-9]{32}\b/gi, "<entfernt>").replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, "<entfernt>");
}

function pending() { return read().items.filter((x) => !NOISE.test(x.msg)); }
function build(info) {
  const items = pending(); if (!items.length) return null;
  const head = [`Argus ${info.version} · ${{ win32: "Windows", darwin: "macOS", linux: "Linux" }[process.platform] || process.platform} ${os.release()} · ${os.arch()} · ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM`, info.gpu ? "Grafik: " + info.gpu : "", "KI: " + (info.backend || "?")].filter(Boolean).join("\n");
  const body = items.map((x) => `### ${x.kind} (${x.t})\n${x.msg}\n${x.stack ? "```\n" + x.stack + "\n```" : ""}`).join("\n\n");
  return { title: "Fehlerbericht: " + items[items.length - 1].kind + " · " + redact(items[items.length - 1].msg).slice(0, 70), text: redact(head + "\n\n" + body) };
}
// GitHub-Issue im Browser öffnen, vorausgefüllt; der Nutzer sieht es dort noch einmal und klickt selbst auf Senden
function issueUrl(title, text) {
  let t = redact(text); const max = 6500;
  if (encodeURIComponent(t).length > max) { while (encodeURIComponent(t).length > max) t = t.slice(0, Math.floor(t.length * 0.9)); t += "\n…(gekürzt)"; }
  return `${REPO}?labels=bug&title=${encodeURIComponent(redact(title))}&body=${encodeURIComponent(t + "\n\n_Gesendet aus Argus, Fehlerbericht vom Nutzer geprüft._")}`;
}
function clear(ignore = false) { const d = read(); if (ignore) d.ignored = [...new Set([...(d.ignored || []), ...d.items.map((x) => x.sig)])].slice(-50); d.items = []; write(d); }

module.exports = { archive, history, view, remove, init, clean, add, pending, build, issueUrl, clear, redact, lastLog };
