// Strata: große lokale KI (Qwen3.8-Flash-Next), eigener Server auf 127.0.0.1:8080 mit OpenAI-kompatibler Schnittstelle.
// Argus installiert Strata nicht selbst, es startet und beendet nur eine vorhandene Installation (Ein/Aus-Knopf).
// Läuft das Modell, belegt es viel Arbeitsspeicher (Low-RAM-Modus rund 30 GB), darum nur auf Knopfdruck oder bei Bedarf.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, execFile } = require("child_process");

let proc = null, state = "aus", model = "", text = "", onChange = () => {}, cfg = {}, waitTimer = null;
const C = () => (typeof cfg === "function" ? cfg() : cfg) || {};
const url = () => String(C().strataUrl || "http://127.0.0.1:8080").replace(/\/+$/, "");
const set = (s, t = "") => { state = s; text = t; onChange(snapshot()); };
const snapshot = () => ({ state, model, text, dir: findDir() || "" });

// Strata-Ordner: eingestellter Pfad, sonst übliche Orte (Ordner mit START-HERE.bat)
function findDir() {
  const home = os.homedir(), cands = [C().strataDir, path.join(home, "Strata"), path.join(home, "Documents", "Strata"), path.join(home, "Strata", "Strata-main"),
    path.join(home, "Documents", "Strata", "Strata-main"), "C:\\Strata", "D:\\Strata", "E:\\Strata"].filter(Boolean);
  for (const d of cands) { try { if (["START-HERE.bat", "Strata-Start.cmd"].some((f) => fs.existsSync(path.join(d, f)))) return d; } catch {} }
  return null;
}
async function get(p, ms = 2500) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url() + p, { signal: ctl.signal }); return r.ok ? await r.json().catch(() => ({})) : null; } catch { return null; } finally { clearTimeout(t); }
}
const up = async () => !!(await get("/health"));
async function readModel() { const j = await get("/v1/models"); model = j?.data?.[0]?.id || model || "Qwen3.8-Flash-Next"; }

// Läuft Strata schon (z. B. selbst gestartet)? Dann gilt der Knopf als an
let stoppedAt = 0;
async function check() {
  if (state === "lädt" || Date.now() - stoppedAt < 20e3) return; // kurz nach dem Ausschalten antwortet der Server evtl. noch
  if (await up()) { if (state !== "an") { await readModel(); set("an", "Strata bereit"); } }
  else if (state === "an") { proc = null; set("aus", "Strata beendet"); }
}

async function start() {
  if (state === "an" || state === "lädt") return snapshot();
  if (await up()) { await readModel(); set("an", "Strata bereit"); return snapshot(); }
  const dir = findDir();
  if (!dir) { set("fehlt", "Strata nicht gefunden. Ordner unter Einstellungen → KI eintragen."); return snapshot(); }
  // kalibrierter Start (z. B. run-iq3_xxs.bat mit den für diesen PC gemessenen Werten) geht vor START-HERE.bat
  let bat = "START-HERE.bat", args = String(C().strataArgs || "--no-browser").split(/\s+/).filter(Boolean);
  try { const runs = fs.readdirSync(dir).filter((f) => /^run-.*\.bat$/i.test(f)).map((f) => [f, fs.statSync(path.join(dir, f)).mtimeMs]).sort((x, y) => y[1] - x[1]); if (runs.length) { bat = runs[0][0]; args = C().strataArgs && C().strataArgs.trim() !== "--no-browser" ? args : []; } } catch {}
  // eigenes Start-Skript (Strata-Start.cmd startet den Server selbst unsichtbar) geht vor
  if (fs.existsSync(path.join(dir, "Strata-Start.cmd"))) { bat = "Strata-Start.cmd"; args = []; }
  // unsichtbar starten: öffnet die .bat selbst ein Fenster („start …“), läuft eine Kopie mit „start /B“ in der versteckten Konsole (kein Fenster in der Taskleiste)
  let run = bat;
  try {
    const txt = fs.readFileSync(path.join(dir, bat), "utf8");
    if (/^\s*start\b/im.test(txt)) {
      const tmp = path.join(os.tmpdir(), "argus-strata-start.bat");
      fs.writeFileSync(tmp, `@cd /d "${dir}"\r\n` + txt.replace(/^(\s*)start\s+("[^"]*"\s+)?((\/min|\/max|\/normal)\s+)*/gim, '$1start "" /B '));
      run = tmp;
    }
  } catch {}
  try {
    proc = spawn("cmd.exe", ["/c", run, ...args], { cwd: dir, windowsHide: true, stdio: "ignore" });
    // mit „start /B“ endet die Konsole evtl. gleich wieder, der Server läuft weiter: beim Laden entscheidet der Warte-Timer, nicht das Ende der Konsole
    proc.on("exit", () => { proc = null; if (state !== "lädt") check(); });
  } catch (e) { set("fehler", "Strata startet nicht: " + (e.message || e)); return snapshot(); }
  set("lädt", "Strata lädt das Modell (bis zu 3 Minuten)…");
  const t0 = Date.now();
  clearInterval(waitTimer);
  waitTimer = setInterval(async () => {
    if (state !== "lädt") return clearInterval(waitTimer);
    if (await up()) { clearInterval(waitTimer); await readModel(); set("an", "Strata bereit"); }
    else if (Date.now() - t0 > 6 * 60e3) { clearInterval(waitTimer); set("fehler", "Strata antwortet nach 6 Minuten noch nicht."); }
  }, 3000);
  return snapshot();
}

// Beenden: eigenen Prozessbaum, sonst den Prozess, der Port 8080 belegt (Windows)
function killTree(pid) { return new Promise((r) => execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => r())); }
function portOwner() {
  const port = (url().match(/:(\d+)$/) || [])[1] || "8080";
  return new Promise((r) => execFile("powershell.exe", ["-NoProfile", "-Command", `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`],
    { windowsHide: true, timeout: 8000 }, (_e, out) => r(parseInt(String(out).trim(), 10) || 0)));
}
async function stop() {
  clearInterval(waitTimer);
  if (process.platform === "win32") {
    if (proc?.pid) await killTree(proc.pid);
    const dir = findDir(), stopCmd = dir && path.join(dir, "Strata-Stop.cmd");
    if (stopCmd && fs.existsSync(stopCmd)) await new Promise((r) => execFile("cmd.exe", ["/c", stopCmd], { cwd: dir, windowsHide: true, timeout: 30e3 }, () => r()));
    const pid = await portOwner(); if (pid) await killTree(pid);
  } else proc?.kill();
  proc = null; stoppedAt = Date.now(); set("aus", "Strata beendet, Speicher frei");
  return snapshot();
}

// Antwort streamen (OpenAI-kompatibel). Denkt das Modell laut (<think>…</think> oder reasoning_content), wird das nicht vorgelesen
async function ask(system, messages, onText) {
  const res = await fetch(url() + "/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || undefined, stream: true, max_tokens: 700, temperature: 0.6, reasoning_effort: "none", messages: [{ role: "system", content: system }, ...messages] }),
  });
  if (!res.ok) throw { code: "strata", message: "Strata antwortet mit " + res.status };
  const dec = new TextDecoder(); let buf = "", raw = "";
  const clean = (s) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      const l = line.trim(); if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim(); if (d === "[DONE]") continue;
      try { const c = JSON.parse(d).choices?.[0]?.delta?.content; if (c) { raw += c; const out = clean(raw); if (out) onText(out); } } catch {}
    }
  }
  return clean(raw);
}

module.exports = {
  init(c, cb) { cfg = c; onChange = cb; },
  setConfig(c) { cfg = c; },
  snapshot, start, stop, check, ask, findDir,
  running: () => state === "an",
  ownProcess: () => !!proc,
};
