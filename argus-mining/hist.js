// Feiner Verlauf je Miner für die letzten 24 Stunden: alle 5 Minuten Hashrate (TH/s) und höchste Temperatur.
// Im Speicher je IP, zusätzlich als Anhang-Datei je Tag (hist/JJJJ-MM-TT.txt), damit ein Neustart nichts verliert. Aufbewahrt 2 Tage.
const fs = require("fs"), path = require("path");
let dir = "", lastT = 0, curDay = "";
const ring = new Map(); // ip -> [[ts, th, temp, on]]
const KEEP = 24 * 3600e3 + 600e3;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function push(ip, p) { const a = ring.get(ip) || []; a.push(p); while (a.length && a[0][0] < p[0] - KEEP) a.shift(); ring.set(ip, a); }
function init(base) {
  dir = path.join(base, "hist"); fs.mkdirSync(dir, { recursive: true }); ring.clear(); lastT = 0;
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f)).sort();
  for (const f of files.slice(0, -2)) try { fs.unlinkSync(path.join(dir, f)); } catch {}
  const since = Date.now() - KEEP;
  for (const f of files.slice(-2)) {
    let txt = ""; try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch {}
    for (const line of txt.split("\n")) {
      const [ts, rest] = line.split("\t"); const t = Number(ts); if (!t || t < since || !rest) continue;
      for (const e of rest.split(";")) { const [ip, th, tp, on] = e.split(","); if (ip) push(ip, [t, th === "" ? null : Number(th), tp === "" ? null : Number(tp), on === "1" ? 1 : 0]); }
    }
  }
}
function record(miners, now = Date.now(), force = false) {
  if (!force && now - lastT < 295e3) return false; lastT = now;
  const parts = [];
  for (const m of miners) {
    const th = m.hr != null ? Math.round(m.hr / 1e10) / 100 : null, tp = m.temp != null ? Math.round(m.temp) : null, on = m.on !== false ? 1 : 0;
    push(m.ip, [now, th, tp, on]); parts.push(`${m.ip},${th ?? ""},${tp ?? ""},${on}`);
  }
  const k = dayKey(now);
  if (k !== curDay) { curDay = k; try { for (const f of fs.readdirSync(dir).filter((f2) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f2)).sort().slice(0, -2)) fs.unlinkSync(path.join(dir, f)); } catch {} }
  try { fs.appendFileSync(path.join(dir, k + ".txt"), now + "\t" + parts.join(";") + "\n"); } catch {}
  return true;
}
const get = (ip) => (ring.get(ip) || []).slice();
module.exports = { init, record, get };
