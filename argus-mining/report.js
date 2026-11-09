// Tagesreport je Miner, wie bei Foreman: alle 5 Minuten eine Stichprobe.
// Uptime = Anteil der Stichproben, in denen der Miner gehasht hat. Verbrauch = Watt × Zeit bis zur nächsten Stichprobe
// (höchstens 10 Minuten, sonst war das Programm aus). Watt gemessen, wenn der Miner sie meldet, sonst geschätzt (J/TH × Hashrate).
const fs = require("fs"), path = require("path");

let file = "", data = null, saveT = null, lastT = 0, keepDays = 30;
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function init(dir, keep) { file = path.join(dir, "report.json"); if (keep) keepDays = keep; data = null; lastT = 0; }
function load() { if (!data) { try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { data = {}; } } return data; }
function save(now) { clearTimeout(saveT); if (now) { try { fs.writeFileSync(file, JSON.stringify(data)); } catch {} return; } saveT = setTimeout(() => save(true), 5000); }

// miners: [{ name, ip, type, on, hr, watt, wattEst, up, hup }] ; noNet: PC hat keine Verbindung zu den Minern (zählt als „keine Daten“, nicht als offline)
function record(miners, noNet = false, now = Date.now(), force = false) {
  if (!Array.isArray(miners) || !miners.length) return false;
  if (!force && now - lastT < 295e3) return false;
  const dt = lastT ? Math.min(now - lastT, 600e3) : 300e3; lastT = now;
  const d = load(), k = dayKey(now), day = (d[k] ||= { n: 0, nonet: 0, hist: {}, m: {} });
  for (const key of Object.keys(d).sort().slice(0, -Math.max(2, keepDays))) delete d[key];
  if (noNet) { day.nonet++; save(); return true; }
  day.n++; let on = 0;
  for (const m of miners) {
    const id = m.ip || m.name, x = (day.m[id] ||= { name: m.name, type: m.type || "", n: 0, on: 0, wh: 0, est: 0, meas: 0, rb: 0, hr: 0 });
    x.name = m.name; if (m.type) x.type = m.type; if (m.serial) x.sn = m.serial; if (m.mac) x.mac = m.mac; if (m.pools?.length) x.pl = m.pools.map((p) => [p.url, p.user]); x.n++;
    if (m.on !== false) { x.on++; on++; x.hr += m.hr || 0; }
    if (m.watt != null) { const wh = (m.on === false ? 0 : m.watt) * dt / 36e5; x.wh += wh; if (m.wattEst) x.est += wh; else x.meas += wh; }
    // Neustart erkennen: Laufzeit des Geräts oder des Mining-Programms ist kleiner geworden
    if (m.up != null && x.lu != null && m.up + 120 < x.lu) x.rb++;
    if (m.hup != null && x.lh != null && m.hup + 120 < x.lh && !(m.up != null && x.lu != null && m.up + 120 < x.lu)) x.rs = (x.rs || 0) + 1;
    if (m.up != null) x.lu = m.up; if (m.hup != null) x.lh = m.hup;
  }
  day.hist[on] = (day.hist[on] || 0) + 1;
  save(); return true;
}

function build(k = dayKey()) {
  const day = load()[k]; if (!day) return null;
  const ms = Object.entries(day.m).map(([id, x]) => ({ id, name: x.name, type: x.type, samples: x.n, uptime: x.n ? x.on / x.n : null, kwh: x.wh / 1000, kwhEst: x.est / 1000, avgTh: x.on ? x.hr / x.on / 1e12 : 0, reboots: x.rb || 0, restarts: x.rs || 0, devUp: x.lu ?? null, hashUp: x.lh ?? null, serial: x.sn || "", mac: x.mac || "", pools: (x.pl || []).map(([url, user]) => ({ url, user })) }))
    .sort((a, b) => (a.uptime ?? 2) - (b.uptime ?? 2) || a.name.localeCompare(b.name, "de", { numeric: true }));
  const vals = Object.entries(day.hist).map(([v, c]) => [Number(v), c]).sort((a, b) => a[0] - b[0]);
  let acc = 0, median = null; for (const [v, c] of vals) { acc += c; if (median == null && acc >= day.n / 2) median = v; }
  const tot = ms.reduce((a, m) => a + m.samples, 0), up = ms.reduce((a, m) => a + (m.uptime ?? 0) * m.samples, 0);
  const kwh = ms.reduce((a, m) => a + m.kwh, 0), kwhEst = ms.reduce((a, m) => a + m.kwhEst, 0);
  return { day: k, samples: day.n, noNet: day.nonet, hours: Math.round(day.n * 5 / 6) / 10, total: ms.length, median, min: vals.length ? vals[0][0] : null, max: vals.length ? vals[vals.length - 1][0] : null,
    uptime: tot ? up / tot : null, kwh, kwhEst, miners: ms,
    down: ms.filter((m) => m.uptime != null && m.uptime < 0.2).length, partly: ms.filter((m) => m.uptime != null && m.uptime >= 0.2 && m.uptime < 0.98).length };
}
const fmtDur = (s) => { if (s == null) return ""; s = Math.round(s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const de = (v, n = 1) => (v == null ? "" : Number(v).toFixed(n).replace(".", ","));
// CSV für Excel (Semikolon, Komma als Dezimaltrenner)
function csv(k) {
  const r = build(k); if (!r) return "";
  const rows = [["Miner", "IP", "Seriennummer", "MAC", "Modell", "Pool 1", "Worker 1", "Pool 2", "Worker 2", "Pool 3", "Worker 3", "Uptime %", "Verbrauch kWh", "davon geschätzt kWh", "Ø TH/s", "Neustarts Gerät", "Neustarts Mining", "Geräte-Laufzeit", "Mining-Laufzeit", "Stichproben"]];
  const pc = (m) => [0, 1, 2].flatMap((i) => [m.pools[i]?.url || "", m.pools[i]?.user || ""]);
  for (const m of r.miners) rows.push([m.name, m.id, m.serial, m.mac, m.type, ...pc(m), de(m.uptime * 100, 2), de(m.kwh, 2), de(m.kwhEst, 2), de(m.avgTh, 1), m.reboots, m.restarts, fmtDur(m.devUp), fmtDur(m.hashUp), m.samples]);
  rows.push([]); rows.push(["Gesamt", "", "", "", `${r.total} Miner`, "", "", "", "", "", "", de((r.uptime ?? 0) * 100, 2), de(r.kwh, 2), de(r.kwhEst, 2), "", "", "", "", "", r.samples]);
  return "﻿" + rows.map((l) => l.map((c) => { const s = String(c ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n");
}
const days = () => Object.keys(load()).sort();
module.exports = { init, record, build, csv, days, dayKey, fmtDur, flush: () => data && save(true) };
