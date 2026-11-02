// Fehlerberichte: Abstürze und unerwartete Fehler werden nur lokal gesammelt. Beim nächsten Start fragt Argus,
// ob der Nutzer einen Bericht als GitHub-Issue senden will, zeigt ihn vorher vollständig und entfernt
// Benutzernamen, Pfade, Schlüssel, Tokens und Wallet-Adressen. Ohne Klick des Nutzers geht nichts raus.
const fs = require("fs"), path = require("path"), os = require("os");
const REPO = "https://github.com/d0mm392/Argus/issues/new";
let dir = "", file = "", marker = "", errLog = "", hist = "", secrets = () => [];
let pulse = null, run = null, appVersion = "", shown = null;
const UNCLEAN = "Unerwartet beendet", LEGACY_UNCLEAN = "Argus wurde beim letzten Mal nicht normal beendet.";
// Abgefangene Netzfehler (Wetter, Kurse, Feeds) beenden Argus nicht und gehören nicht in einen Bericht über ein unsauberes Ende
const NET_ERROR = /antwortet mit \d{3}|fetch failed|ETIMEDOUT|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|UND_ERR|socket hang up/i;
const STATE_RANK = { "nicht gesendet": 0, kopiert: 1, gesendet: 2 };
const eventKey = (x) => `### ${x.kind} (${x.t})`; // so steht ein Ereignis auch in älteren gespeicherten Berichten
const KEEP_MS = 14 * 864e5; // eigene Berichte bleiben 14 Tage auf diesem PC, danach werden sie gelöscht
const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { items: [], ignored: [] }; } };
const write = (d) => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(d)); fs.renameSync(file + ".tmp", file); } catch {} };
const sig = (msg) => String(msg || "").replace(/\d+/g, "#").slice(0, 120);

function init(userData, logFile, getSecrets, version) {
  appVersion = String(version || ""); shown = null; dir = userData; file = path.join(dir, "crash-pending.json"); marker = path.join(dir, "running.flag"); hist = path.join(dir, "crash-history.json"); errLog = logFile; secrets = getSecrets || secrets;
  // Lag die Markierung noch da, endete der letzte Lauf nicht sauber (harter Absturz, abgeschossen)
  clearInterval(pulse);
  settleAcknowledged();
  let previous = null; try { previous = JSON.parse(fs.readFileSync(marker, "utf8")) || {}; } catch { if (fs.existsSync(marker)) previous = {}; }
  if (previous && !previous.ended) {
    const end = previous.heartbeat || 0;
    const log = end ? lastLog(Math.max(previous.started || 0, end - 15000), end + 15000, true) : "";
    add(UNCLEAN, "Der vorherige Argus-Lauf wurde ohne bestätigtes reguläres Ende unterbrochen. Die Ursache ist unbekannt.", log ? "Zeitnah protokolliert (kein Nachweis der Ursache):\n" + log : "Keine zeitlich zugehörigen Fehler protokolliert.", previous.version || null);
  }
  run = { started: Date.now(), heartbeat: Date.now(), pid: process.pid, version: appVersion };
  const beat = () => { run.heartbeat = Date.now(); try { fs.writeFileSync(marker + ".tmp", JSON.stringify(run)); fs.renameSync(marker + ".tmp", marker); } catch {} };
  beat(); pulse = setInterval(beat, 5000); pulse.unref();
  try { fs.writeFileSync(hist, JSON.stringify(histRead())); } catch {} // Abgelaufenes löschen
}
// Vor 0.58.31 blieb ein nur kopierter Bericht offen und erschien bei jedem Start neu. Was schon in der Historie steht, gilt als bestätigt:
// Es wird nicht mehr gemeldet, die Historie bleibt, und der alte Stand wird einmal gesichert.
function settleAcknowledged() {
  if (!fs.existsSync(file)) return;
  const d = read(), texts = histRead().map((e) => String(e.text || ""));
  const open = (d.items || []).filter((x) => !texts.some((t) => t.includes(eventKey(x))));
  if (open.length === (d.items || []).length) return;
  try { const backup = file.replace(/\.json$/, ".before-0.58.31.json"); if (!fs.existsSync(backup)) fs.copyFileSync(file, backup); } catch { return; }
  d.items = open; write(d);
}
// Eigene Berichte zum Nachlesen: nur lokal, mit dem, was der Nutzer gesehen hat (schon bereinigt), 14 Tage lang
function histRead() {
  let a = []; try { a = JSON.parse(fs.readFileSync(hist, "utf8")); } catch {}
  a = (Array.isArray(a) ? a : []).filter((x) => x && typeof x.id === "string" && Date.now() - Date.parse(x.t) < KEEP_MS);
  return a;
}
function archive(title, text, state) {
  if (!hist || !String(text || "").trim()) return null;
  const a = histRead(), clean = redact(String(text));
  // Derselbe Bericht zweimal (erst kopiert, dann gesendet): ein Eintrag mit dem weitesten Stand statt zwei
  const keys = clean.match(/^### .+ \(\d{4}-\d\d-\d\dT[^)\n]+\)$/gm) || [];
  const same = keys.length ? a.find((e) => keys.every((k) => String(e.text || "").includes(k))) : null;
  if (same) {
    if ((STATE_RANK[state] ?? 0) > (STATE_RANK[same.state] ?? 0)) { same.state = state; try { fs.writeFileSync(hist, JSON.stringify(a)); } catch {} }
    return same.id;
  }
  const it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), title: redact(String(title || "Fehlerbericht")).slice(0, 160), text: clean.slice(0, 20000), state: ["gesendet", "kopiert", "nicht gesendet"].includes(state) ? state : "nicht gesendet" };
  a.push(it); try { fs.writeFileSync(hist, JSON.stringify(a.slice(-60))); } catch {}
  return it.id;
}
const history = () => histRead().map((x) => ({ id: x.id, t: x.t, title: x.title, state: x.state })).reverse();
const LEGACY_NOTE = "Hinweis: Dieser Bericht stammt aus einer Version vor 0.58.31. Die Versionsangabe nennt die Version beim Anzeigen, nicht beim Ereignis. Enthaltene Protokollzeilen belegen keine Ursache.\n\n";
const view = (id) => { const x = histRead().find((e) => e.id === id); return !x ? null : /^### /m.test(x.text) && !/Ereigniszeitpunkt/.test(x.text) ? { ...x, text: LEGACY_NOTE + x.text } : x; };
function remove(id) { const a = histRead().filter((x) => x.id !== id); try { fs.writeFileSync(hist, JSON.stringify(a)); } catch {} return true; }
function clean() {
  clearInterval(pulse); pulse = null;
  try { fs.writeFileSync(marker, JSON.stringify({ ...run, ended: Date.now() })); fs.unlinkSync(marker); } catch {}
}
// letzte Zeilen des Fehlerprotokolls, mit since nur die aus dem letzten Lauf
function lastLog(since = 0, until = Infinity, skipNet = false) {
  try {
    let lines = fs.readFileSync(errLog, "utf8").split("\n").filter(Boolean);
    if (since) {
      let keep = false;
      lines = lines.filter((l) => {
        const stamp = /^\[?(\d{4}-\d{2}-\d{2}T[^\s\]]+)/.exec(l);
        if (stamp) { const t = Date.parse(stamp[1]); keep = Number.isFinite(t) && t >= since && t <= until && !(skipNet && NET_ERROR.test(l)); }
        return keep;
      });
    }
    return lines.slice(-25).join("\n");
  } catch { return ""; }
}

// harmlose Browser-Meldungen, die nichts kaputt machen (ResizeObserver beim Größenändern, abgebrochene Medien/Netz)
const NOISE = /ResizeObserver loop|Script error\.?$|AbortError|The play\(\) request was interrupted|Failed to fetch|NetworkError|net::ERR_/i;
function add(kind, msg, stack = "", version = appVersion) {
  if (!file || NOISE.test(String(msg || ""))) return;
  const d = read(), s = sig(kind + msg);
  // Jedes unsaubere Ende ist ein eigenes Ereignis: nie durch einen gleichlautenden offenen Bericht oder „nicht mehr melden“ verschlucken
  if (kind !== UNCLEAN && ((d.ignored || []).includes(s) || d.items.some((x) => x.sig === s))) return;
  d.items.push({ t: new Date().toISOString(), kind, msg: String(msg || "").slice(0, 500), stack: String(stack || "").slice(0, 3000), sig: s, version: version || null });
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
  shown = new Set(items.map(eventKey));
  const head = [`Bericht erstellt mit Argus ${info.version} · ${{ win32: "Windows", darwin: "macOS", linux: "Linux" }[process.platform] || process.platform} ${os.release()} · ${os.arch()} · ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM`, info.gpu ? "Grafik: " + info.gpu : "", "KI: " + (info.backend || "?")].filter(Boolean).join("\n");
  const body = items.map((x) => {
    const old = x.kind === UNCLEAN && x.msg === LEGACY_UNCLEAN; // ältere Versionen hängten hier die letzten Protokollzeilen an, auch Stunden alte
    const msg = old ? "Der vorherige Argus-Lauf endete ohne bestätigtes reguläres Ende. Die Ursache ist unbekannt. Ältere Protokollzeilen sind ausgeblendet, weil sie keinen Zusammenhang belegen." : x.msg;
    const stack = old ? "" : x.stack;
    return `${eventKey(x)}\nArgus-Version zum Ereigniszeitpunkt: ${x.version || "nicht erfasst"}\n${msg}\n${stack ? "```\n" + stack + "\n```" : ""}`;
  }).join("\n\n");
  return { title: "Fehlerbericht: " + items[items.length - 1].kind + " · " + redact(items[items.length - 1].msg).slice(0, 70), text: redact(head + "\n\n" + body) };
}
// GitHub-Issue im Browser öffnen, vorausgefüllt; der Nutzer sieht es dort noch einmal und klickt selbst auf Senden
function issueUrl(title, text) {
  let t = redact(text); const max = 6500;
  if (encodeURIComponent(t).length > max) { while (encodeURIComponent(t).length > max) t = t.slice(0, Math.floor(t.length * 0.9)); t += "\n…(gekürzt)"; }
  return `${REPO}?labels=bug&title=${encodeURIComponent(redact(title))}&body=${encodeURIComponent(t + "\n\n_Gesendet aus Argus, Fehlerbericht vom Nutzer geprüft._")}`;
}
// Bestätigt nur, was der Nutzer gesehen hat: Ein währenddessen neu erfasster Fehler bleibt offen
function clear(ignore = false) {
  const d = read(), done = shown ? d.items.filter((x) => shown.has(eventKey(x))) : d.items; shown = null;
  if (ignore) d.ignored = [...new Set([...(d.ignored || []), ...done.filter((x) => x.kind !== UNCLEAN).map((x) => x.sig)])].slice(-50);
  d.items = d.items.filter((x) => !done.includes(x)); write(d);
}

module.exports = { archive, history, view, remove, init, clean, add, pending, build, issueUrl, clear, redact, lastLog };
