// Pool-Report: merkt sich je Miner die eingestellten Pools 1–3 und den gerade aktiven Pool und schreibt jede Änderung als Ereignis.
// Arten: "geändert" (Adresse oder Worker eines Pools anders, auch neu eingetragen oder entfernt) und "Wechsel" (anderer Pool aktiv, z. B. Ausweichen auf Pool 2).
// Ein Miner wird über die Seriennummer erkannt, sonst über die IP. Zustand in pools/state.json, Ereignisse je Tag in pools/JJJJ-MM-TT.jsonl, aufbewahrt wie der Report (90 Tage).
const fs = require("fs"), path = require("path");
let dir = "", keep = 90, state = {}, dirty = false;
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const keyOf = (m) => (m.serial ? "sn:" + m.serial : "ip:" + m.ip);
const norm = (p) => ({ url: String(p?.url || "").trim(), user: String(p?.user || "").trim() });
const fmt = (p) => (p && (p.url || p.user) ? `${p.url || "?"} / ${p.user || "?"}` : "leer");
// aktiver Pool: zuerst "Stratum Active", sonst der erste mit Status Alive
const activeOf = (pl) => { let i = pl.findIndex((p) => p.act); if (i < 0) i = pl.findIndex((p) => /alive/i.test(p.st || "")); return i < 0 ? null : i + 1; };
const days = () => { try { return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map((f) => f.slice(0, 10)).sort(); } catch { return []; } };
function init(base, keepDays = 90) {
  dir = path.join(base, "pools"); keep = Math.max(2, keepDays); fs.mkdirSync(dir, { recursive: true });
  try { state = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")) || {}; } catch { state = {}; }
  for (const k of days().slice(0, -keep)) try { fs.unlinkSync(path.join(dir, k + ".jsonl")); } catch {}
}
function save() { if (!dirty) return; dirty = false; try { fs.writeFileSync(path.join(dir, "state.json.tmp"), JSON.stringify(state)); fs.renameSync(path.join(dir, "state.json.tmp"), path.join(dir, "state.json")); } catch {} }
let lastDay = "";
function write(evs, now) {
  if (!evs.length) return;
  const k = dayKey(now);
  if (k !== lastDay) { lastDay = k; for (const d of days().slice(0, -keep)) try { fs.unlinkSync(path.join(dir, d + ".jsonl")); } catch {} }
  try { fs.appendFileSync(path.join(dir, k + ".jsonl"), evs.map((e) => JSON.stringify(e)).join("\n") + "\n"); } catch {}
}
// Nur Miner, die gerade geantwortet und Pools gemeldet haben, werden verglichen (sonst wären alte Daten im Spiel).
function record(miners, now = Date.now()) {
  const evs = [];
  for (const m of miners) {
    if (m.err || !Array.isArray(m.pools) || !m.pools.length) continue;
    const pl = [0, 1, 2].map((i) => norm(m.pools[i])), act = activeOf(m.pools), k = keyOf(m);
    let s = state[k];
    // Miner mit Seriennummer, der vorher nur über die IP bekannt war: Stand übernehmen statt neu anfangen
    if (!s && m.serial && state["ip:" + m.ip]) { s = state[k] = state["ip:" + m.ip]; delete state["ip:" + m.ip]; dirty = true; }
    const base = { t: now, ip: m.ip, name: m.name || m.ip, serial: m.serial || "", type: m.type || "" };
    if (!s) { state[k] = { pools: pl, act, ip: m.ip, since: now, actSince: now }; dirty = true; continue; }
    // alle geänderten Pools eines Miners in einer Abfrage = ein Ereignis (bei Umstellung ganzer Reihen sonst dreifach)
    const ch = [];
    for (let i = 0; i < 3; i++) {
      const a = s.pools[i] || norm(null), b = pl[i];
      if (a.url !== b.url || a.user !== b.user) ch.push({ pool: i + 1, what: a.url !== b.url && a.user !== b.user ? "Adresse und Worker" : a.url !== b.url ? "Adresse" : "Worker", from: a, to: b });
    }
    if (ch.length) evs.push({ ...base, kind: "geändert", pool: ch.map((c) => c.pool).join(", "), what: [...new Set(ch.map((c) => c.what))].join(" / "), changes: ch, from: ch[0].from, to: ch[0].to, text: ch.map((c) => `Pool ${c.pool} geändert (${c.what}): ${fmt(c.from)} → ${fmt(c.to)}`).join("; ") });
    if (pl.some((p, i) => p.url !== (s.pools[i]?.url || "") || p.user !== (s.pools[i]?.user || ""))) { s.pools = pl; s.since = now; dirty = true; }
    if (act && !s.act) { s.act = act; s.actSince = now; dirty = true; }
    // Wechsel erst zählen, wenn er zwei Abfragen hintereinander besteht (kurzes Flackern ignorieren)
    if (act && act !== s.act && (s.pend !== act ? ((s.pend = act), false) : true)) {
      const to = pl[act - 1];
      evs.push({ ...base, kind: "Wechsel", pool: act, fromPool: s.act || null, to, text: `Aktiver Pool gewechselt: ${s.act ? "Pool " + s.act : "keiner"} → Pool ${act} (${fmt(to)})` + (s.act && act > s.act ? ", vermutlich Ausfall des vorherigen Pools" : "") });
      s.act = act; s.actSince = now; s.pend = null; dirty = true;
    } else if (act === s.act) s.pend = null;
    if (s.ip !== m.ip) { s.ip = m.ip; dirty = true; }
  }
  write(evs, now); save();
  return evs;
}
function events(from, to) {
  const out = [];
  for (const k of days()) if (k >= from && k <= to) {
    let txt = ""; try { txt = fs.readFileSync(path.join(dir, k + ".jsonl"), "utf8"); } catch {}
    for (const l of txt.split("\n")) if (l) try { out.push(JSON.parse(l)); } catch {}
  }
  return out.sort((a, b) => b.t - a.t);
}
// Aktueller Stand je Pool-Adresse: auf wie vielen Minern als Pool 1/2/3 eingetragen, wie viele gerade darauf minen, mit welchen Workern
function current(miners) {
  const map = new Map();
  for (const m of miners) {
    const pl = m.pools || [], act = activeOf(pl);
    pl.slice(0, 3).forEach((p, i) => {
      const n = norm(p); if (!n.url && !n.user) return;
      let e = map.get(n.url);
      if (!e) map.set(n.url, (e = { url: n.url, users: new Map(), slots: [0, 0, 0], active: 0, miners: 0 }));
      e.slots[i]++; e.miners++; e.users.set(n.user, (e.users.get(n.user) || 0) + 1); if (act === i + 1 && !m.err && m.on !== false) e.active++;
    });
  }
  return [...map.values()].map((e) => { const us = [...e.users.entries()].sort((a, b) => b[1] - a[1]); return { ...e, users: us.length, user: us.length === 1 ? us[0][0] : "", topUsers: us.slice(0, 3).map(([u, n]) => ({ u, n })) }; }).sort((a, b) => b.active - a.active || b.miners - a.miners);
}
function since(m) { const s = state[keyOf(m)]; return s ? { since: s.since, actSince: s.actSince } : null; }
const esc = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function csv(from, to) {
  const rows = [["Zeit", "Art", "Miner", "IP", "Seriennummer", "Modell", "Pool", "Vorher", "Nachher", "Beschreibung"]];
  for (const e of events(from, to).reverse()) rows.push([new Date(e.t).toLocaleString("de-DE"), e.kind, e.name, e.ip, e.serial, e.type, e.pool, e.kind === "Wechsel" ? (e.fromPool ? "Pool " + e.fromPool : "") : (e.changes || [e]).map((c) => fmt(c.from)).join(" | "), e.kind === "Wechsel" ? fmt(e.to) : (e.changes || [e]).map((c) => fmt(c.to)).join(" | "), e.text]);
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}
module.exports = { init, record, events, current, since, csv, days, dayKey, activeOf };
