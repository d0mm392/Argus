// Tages- und Monatsreport je Miner, wie bei Foreman: alle 5 Minuten eine Stichprobe.
// Uptime = Anteil der Stichproben, in denen der Miner gehasht hat. Verbrauch = Watt × Zeit bis zur nächsten Stichprobe
// (höchstens 10 Minuten, sonst war das Programm aus). Watt gemessen, wenn der Miner sie meldet, sonst geschätzt (J/TH × Hashrate).
// Je Tag eine Datei (report/JJJJ-MM-TT.json), damit auch bei vielen Minern nur der laufende Tag geschrieben wird. Aufbewahrung Standard 90 Tage.
const fs = require("fs"), path = require("path");

let dir = "", cur = null, curKey = "", saveT = null, lastT = 0, keepDays = 90;
const cache = new Map(); // abgeschlossene Tage, nur lesend
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const okKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ""));
const fileOf = (k) => path.join(dir, k + ".json");
function init(base, keep) {
  dir = path.join(base, "report"); fs.mkdirSync(dir, { recursive: true }); if (keep) keepDays = keep; cur = null; curKey = ""; lastT = 0; cache.clear();
  // Umzug aus 1.0/1.1: alles lag in einer Datei report.json
  const old = path.join(base, "report.json");
  try { const d = JSON.parse(fs.readFileSync(old, "utf8")); for (const [k, v] of Object.entries(d || {})) if (okKey(k) && !fs.existsSync(fileOf(k))) fs.writeFileSync(fileOf(k), JSON.stringify(v)); fs.renameSync(old, old + ".alt"); } catch {}
  prune();
}
function prune() { for (const k of days().slice(0, -Math.max(2, keepDays))) { try { fs.unlinkSync(fileOf(k)); } catch {} cache.delete(k); } }
function load(k) {
  if (!okKey(k)) return null;
  if (k === curKey && cur) return cur;
  if (cache.has(k)) return cache.get(k);
  let d = null; try { d = JSON.parse(fs.readFileSync(fileOf(k), "utf8")); } catch {}
  if (d && k !== dayKey()) { cache.set(k, d); if (cache.size > 40) cache.delete(cache.keys().next().value); }
  return d;
}
function save(now) { clearTimeout(saveT); if (!cur) return; if (now) { try { fs.writeFileSync(fileOf(curKey), JSON.stringify(cur)); } catch {} return; } saveT = setTimeout(() => save(true), 5000); }

// miners: [{ name, ip, type, on, hr, watt, wattEst, up, hup, serial, mac, pools }] ; noNet: PC hat keine Verbindung zu den Minern (zählt als „keine Daten“, nicht als offline)
// Rückgabe: Ereignisse dieser Stichprobe (Neustarts), damit das Log sie mitschreibt
function record(miners, noNet = false, now = Date.now(), force = false) {
  if (!Array.isArray(miners) || !miners.length) return null;
  if (!force && now - lastT < 295e3) return null;
  const dt = lastT ? Math.min(now - lastT, 600e3) : 300e3; lastT = now;
  const k = dayKey(now);
  if (k !== curKey) { save(true); if (cur && curKey) cache.set(curKey, cur); cur = null; curKey = ""; let d = null; try { d = JSON.parse(fs.readFileSync(fileOf(k), "utf8")); } catch {} cur = d || { n: 0, nonet: 0, hist: {}, m: {} }; curKey = k; prune(); }
  const day = cur, ev = [];
  if (noNet) { day.nonet++; save(); return ev; }
  day.n++; let on = 0;
  for (const m of miners) {
    const id = m.ip || m.name, x = (day.m[id] ||= { name: m.name, type: m.type || "", n: 0, on: 0, wh: 0, est: 0, meas: 0, rb: 0, hr: 0 });
    x.name = m.name; if (m.type) x.type = m.type; if (m.serial) x.sn = m.serial; if (m.mac) x.mac = m.mac; if (m.pools?.length) x.pl = m.pools.map((p) => [p.url, p.user]); x.n++;
    if (m.on !== false) { x.on++; on++; x.hr += m.hr || 0; }
    // stündlicher Verlauf für die 7-Tage-Ansicht: Summe TH/s, Anzahl Stichproben, höchste Temperatur
    const h = new Date(now).getHours(); x.hh ||= Array(24).fill(0); x.hc ||= Array(24).fill(0); x.ht ||= Array(24).fill(0);
    x.hh[h] += m.on !== false ? Math.round((m.hr || 0) / 1e10) / 100 : 0; x.hc[h]++; if (m.temp != null) x.ht[h] = Math.max(x.ht[h], Math.round(m.temp));
    if (m.watt != null) { const wh = (m.on === false ? 0 : m.watt) * dt / 36e5; x.wh += wh; if (m.wattEst) x.est += wh; else x.meas += wh; }
    // Neustart erkennen: Laufzeit des Geräts oder des Mining-Programms ist kleiner geworden
    const reb = m.up != null && x.lu != null && m.up + 120 < x.lu;
    if (reb) { x.rb++; ev.push([m, "Gerät neu gestartet"]); }
    else if (m.hup != null && x.lh != null && m.hup + 120 < x.lh) { x.rs = (x.rs || 0) + 1; ev.push([m, "Mining neu gestartet"]); }
    if (m.up != null) x.lu = m.up; if (m.hup != null) x.lh = m.hup;
  }
  day.hist[on] = (day.hist[on] || 0) + 1;
  save(); return ev;
}

const minerRow = (id, x) => ({ id, name: x.name, type: x.type, samples: x.n, on: x.on, uptime: x.n ? x.on / x.n : null, kwh: x.wh / 1000, kwhEst: x.est / 1000, avgTh: x.on ? x.hr / x.on / 1e12 : 0, avgKw: x.n ? x.wh / 1000 / (x.n * 5 / 60) : 0, reboots: x.rb || 0, restarts: x.rs || 0, devUp: x.lu ?? null, hashUp: x.lh ?? null, serial: x.sn || "", mac: x.mac || "", pools: (x.pl || []).map(([url, user]) => ({ url, user })) });
const sortRows = (ms) => ms.sort((a, b) => (a.uptime ?? 2) - (b.uptime ?? 2) || String(a.name).localeCompare(String(b.name), "de", { numeric: true }));
function totals(ms) {
  const tot = ms.reduce((a, m) => a + m.samples, 0), up = ms.reduce((a, m) => a + (m.on || 0), 0);
  return { total: ms.length, uptime: tot ? up / tot : null, kwh: ms.reduce((a, m) => a + m.kwh, 0), kwhEst: ms.reduce((a, m) => a + m.kwhEst, 0),
    down: ms.filter((m) => m.uptime != null && m.uptime < 0.2).length, partly: ms.filter((m) => m.uptime != null && m.uptime >= 0.2 && m.uptime < 0.98).length };
}
function build(k = dayKey()) {
  const day = load(k); if (!day) return null;
  const ms = sortRows(Object.entries(day.m).map(([id, x]) => minerRow(id, x)));
  const vals = Object.entries(day.hist).map(([v, c]) => [Number(v), c]).sort((a, b) => a[0] - b[0]);
  let acc = 0, median = null; for (const [v, c] of vals) { acc += c; if (median == null && acc >= day.n / 2) median = v; }
  return { kind: "day", day: k, samples: day.n, noNet: day.nonet, hours: Math.round(day.n * 5 / 6) / 10, median, min: vals.length ? vals[0][0] : null, max: vals.length ? vals[vals.length - 1][0] : null, ...totals(ms), miners: ms };
}
// Zeitraum von–bis (je einschließlich, ganze Tage): je Miner über alle Tage summiert. Zugeordnet über die Seriennummer, sonst die IP (Miner, die umziehen, bleiben so ein Eintrag)
const spanDays = (a, b) => { const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5) + 1; };
function buildRange(from, to) {
  if (!okKey(from) || !okKey(to)) return null; if (from > to) [from, to] = [to, from];
  const ks = days().filter((k) => k >= from && k <= to); if (!ks.length) return null;
  const by = new Map(); let samples = 0, noNet = 0, medians = [];
  for (const k of ks) {
    const day = load(k); if (!day) continue; samples += day.n; noNet += day.nonet || 0;
    const r = build(k); if (r?.median != null) medians.push(r.median);
    for (const [ip, x] of Object.entries(day.m)) {
      const key = x.sn ? "sn:" + x.sn : "ip:" + ip, m = by.get(key) || { id: ip, ips: new Set(), name: x.name, type: x.type, n: 0, on: 0, wh: 0, est: 0, hr: 0, rb: 0, rs: 0, sn: x.sn || "", mac: "", pl: null, days: 0 };
      m.ips.add(ip); m.id = ip; m.name = x.name; if (x.type) m.type = x.type; if (x.mac) m.mac = x.mac; if (x.pl) m.pl = x.pl;
      m.n += x.n; m.on += x.on; m.wh += x.wh; m.est += x.est; m.hr += x.hr; m.rb += x.rb || 0; m.rs += x.rs || 0; m.days++; m.lu = x.lu; m.lh = x.lh;
      by.set(key, m);
    }
  }
  const ms = sortRows([...by.values()].map((m) => ({ ...minerRow([...m.ips].join(", "), m), days: m.days })));
  return { kind: "range", from, to, firstData: ks[0], lastData: ks[ks.length - 1], days: ks.length, daysInMonth: spanDays(from, to), samples, noNet, hours: Math.round(samples * 5 / 6) / 10, median: medians.length ? medians.sort((a, b) => a - b)[Math.floor(medians.length / 2)] : null, ...totals(ms), miners: ms };
}
// Monat (JJJJ-MM) = Zeitraum vom 1. bis zum letzten Tag des Monats
function buildMonth(mk) {
  if (!/^\d{4}-\d{2}$/.test(String(mk || ""))) return null;
  const [y, mo] = mk.split("-").map(Number), r = buildRange(mk + "-01", mk + "-" + String(new Date(y, mo, 0).getDate()).padStart(2, "0"));
  return r && { ...r, kind: "month", month: mk };
}
// Verlauf eines Miners (über die IP): „7d“ stündlich, „30d“/„90d“ täglich. Punkte [Zeit, Ø TH/s, Uptime 0–1, max. Temp]
function history(ip, range = "7d") {
  const n = range === "90d" ? 90 : range === "30d" ? 30 : 7, ks = days().slice(-n), out = [];
  for (const k of ks) {
    const x = load(k)?.m?.[ip]; const [y, mo, d] = k.split("-").map(Number);
    if (!x) continue;
    if (n === 7 && x.hc) { for (let h = 0; h < 24; h++) if (x.hc[h]) out.push([new Date(y, mo - 1, d, h, 30).getTime(), Math.round(x.hh[h] / x.hc[h] * 100) / 100, null, x.ht[h] || null]); }
    else out.push([new Date(y, mo - 1, d, 12).getTime(), x.n ? Math.round(x.hr / x.n / 1e10) / 100 : 0, x.n ? x.on / x.n : null, x.ht ? Math.max(...x.ht) || null : null]);
  }
  return out;
}
const fmtDur = (s) => { if (s == null) return ""; s = Math.round(s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
const de = (v, n = 1) => (v == null ? "" : Number(v).toFixed(n).replace(".", ","));
// CSV für Excel (Semikolon, Komma als Dezimaltrenner); k = Tag (JJJJ-MM-TT) oder Monat (JJJJ-MM)
function csv(k, to) {
  const month = !!to || /^\d{4}-\d{2}$/.test(String(k || "")), r = to ? buildRange(k, to) : month ? buildMonth(k) : build(k); if (!r) return "";
  const rows = [["Miner", "IP", "Seriennummer", "MAC", "Modell", "Pool 1", "Worker 1", "Pool 2", "Worker 2", "Pool 3", "Worker 3", "Uptime %", "Verbrauch kWh", "Ø Leistung kW", "davon geschätzt kWh", "Ø TH/s", "Neustarts Gerät", "Neustarts Mining", ...(month ? ["Tage mit Daten"] : ["Geräte-Laufzeit", "Mining-Laufzeit"]), "Stichproben"]];
  const pc = (m) => [0, 1, 2].flatMap((i) => [m.pools[i]?.url || "", m.pools[i]?.user || ""]);
  for (const m of r.miners) rows.push([m.name, m.id, m.serial, m.mac, m.type, ...pc(m), de(m.uptime * 100, 2), de(m.kwh, 2), de(m.avgKw, 2), de(m.kwhEst, 2), de(m.avgTh, 1), m.reboots, m.restarts, ...(month ? [m.days] : [fmtDur(m.devUp), fmtDur(m.hashUp)]), m.samples]);
  rows.push([]); rows.push(["Gesamt", "", "", "", `${r.total} Miner`, "", "", "", "", "", "", de((r.uptime ?? 0) * 100, 2), de(r.kwh, 2), "", de(r.kwhEst, 2), "", "", "", ...(month ? [`${r.days} von ${r.daysInMonth}`] : ["", ""]), r.samples]);
  return "﻿" + rows.map((l) => l.map((c) => { const s = String(c ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n");
}
const days = () => { try { return fs.readdirSync(dir).map((f) => f.replace(/\.json$/, "")).filter(okKey).concat(curKey && !fs.existsSync(fileOf(curKey)) ? [curKey] : []).sort(); } catch { return []; } };
const months = () => [...new Set(days().map((k) => k.slice(0, 7)))];
module.exports = { init, record, build, buildMonth, buildRange, history, csv, days, months, dayKey, fmtDur, flush: () => save(true) };
