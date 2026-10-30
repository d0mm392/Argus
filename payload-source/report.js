// Täglicher Miner-Report: je Anlage wird über den Tag mitgezählt, wie viele Miner online waren (Stichprobe alle 5 Minuten).
// Am nächsten Morgen zeigt Argus den Vortag: Bestand, typisch online (Median), Spanne, dauerhaft und zeitweise offline.
// Kurze Aussetzer (unter 20 % des Tages) gelten als Schwankung und werden nur gezählt, nicht einzeln genannt.
const fs = require("fs"), path = require("path");

let file = "", data = null, saveT = null, keepDays = () => 14;
const last = {};
function init(dir, keep) { if (keep) keepDays = keep; file = path.join(dir, "miner-report.json"); }
function load() { if (!data) { try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { data = {}; } } return data; }
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(data)); } catch {} }, 5000); }
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// miners: [{ name, on }] ; pxOff: Verbindung zur Anlage weg (dann zählt die Stichprobe als „keine Daten“, nicht als offline)
function record(farm, miners, pxOff = false) {
  if (!farm || !Array.isArray(miners) || !miners.length) return;
  const now = Date.now();
  if (now - (last[farm] || 0) < 295e3) return;
  last[farm] = now;
  const d = load(), k = dayKey(now), day = (d[k] ||= {});
  // ältere Tage löschen (Standard 14, mindestens 2: der Morgenbericht braucht den ganzen Vortag)
  const keep = Math.max(2, Math.min(60, Math.round(Number(keepDays()) || 14)));
  for (const key of Object.keys(d).sort().slice(0, -keep)) delete d[key];
  const f = (day[farm] ||= { n: 0, hist: {}, tot: 0, px: 0, off: {} });
  const prevT = f.lt; f.lt = now;
  if (pxOff) { f.px++; f.tot = Math.max(f.tot, miners.length); save(); return; }
  const on = miners.filter((m) => m.on !== false).length;
  f.n++; f.up = (f.up || 0) + on; f.ex = (f.ex || 0) + miners.length; // Uptime = online-Stichproben / erwartete (Foreman-Definition)
  if (miners.some((m) => m.watt != null)) { // Energie = Leistung × Zeit seit der letzten Stichprobe (höchstens 10 min, sonst war Argus aus)
    const W = miners.reduce((a, m) => a + (m.on !== false && m.watt != null ? m.watt : 0), 0), dt = prevT ? Math.min(now - prevT, 600e3) : 295e3;
    f.wh = (f.wh || 0) + W * dt / 36e5; f.wn = (f.wn || 0) + 1; f.pk = Math.max(f.pk || 0, W);
  }
  f.hist[on] = (f.hist[on] || 0) + 1; f.tot = Math.max(f.tot, miners.length);
  for (const m of miners) if (m.on === false) f.off[m.name] = (f.off[m.name] || 0) + 1;
  save();
}

function build(k) {
  const day = load()[k]; if (!day) return null;
  const farms = Object.entries(day).map(([name, f]) => {
    const vals = Object.entries(f.hist).map(([v, c]) => [Number(v), c]).sort((a, b) => a[0] - b[0]);
    const n = f.n; let acc = 0, median = null;
    for (const [v, c] of vals) { acc += c; if (median == null && acc >= n / 2) median = v; }
    const min = vals.length ? vals[0][0] : null, max = vals.length ? vals[vals.length - 1][0] : null;
    const share = (c) => (n ? c / n : 0);
    const offAll = Object.entries(f.off).map(([m, c]) => [m, share(c)]).sort((a, b) => b[1] - a[1]);
    return { name, kwh: f.wn ? f.wh / 1000 : null, peakKw: f.wn ? (f.pk || 0) / 1000 : null, uptime: f.ex ? f.up / f.ex : null, hours: Math.round(n * 5 / 6) / 10, total: f.tot, samples: n, pxShare: n + f.px ? f.px / (n + f.px) : 0, median, min, max,
      down: offAll.filter(([, s]) => s >= 0.8).map(([m]) => m),
      partly: offAll.filter(([, s]) => s >= 0.2 && s < 0.8).map(([m, s]) => [m, Math.round(s * 100)]),
      blips: offAll.filter(([, s]) => s < 0.2).length };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));
  return { day: k, farms };
}
const yesterday = () => dayKey(Date.now() - 864e5);
const days = () => Object.keys(load()).sort();

module.exports = { init, record, build, yesterday, dayKey, days };
