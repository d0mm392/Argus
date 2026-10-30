// Foreman (foreman.mn): Farm-Verwaltung mit Daten je Miner (Hashrate, Temperatur, Lüfter, Status).
// Nur lesend über die Foreman-API mit Client-ID und API-Schlüssel des Nutzers (Schlüssel bleibt in der lokalen Config).
// Das Antwortformat ist nicht überall gleich dokumentiert, darum tolerant gelesen wie bei OCEAN.
const BASE = process.env.JARVIS_FOREMAN || "https://api.foreman.mn/api"; // Umgebungsvariable nur für Tests
const num = (v) => { if (typeof v === "boolean" || v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

async function get(url, key, ms = 20000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Authorization: "Token " + key, Accept: "application/json", "User-Agent": "Argus-Desktop" }, signal: ctl.signal });
    if (r.status === 401 || r.status === 403) throw new Error("Foreman lehnt den Schlüssel ab (" + r.status + ")");
    if (!r.ok) { const e = new Error("Foreman antwortet mit " + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
function flat(o, pre = "", out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    if (Array.isArray(v)) { if (v.every((x) => typeof x !== "object")) out[pre + k] = v; else v.forEach((x, i) => flat(x, pre + k + "." + i + ".", out)); }
    else if (v && typeof v === "object") flat(v, pre + k + ".", out); else out[pre + k] = v;
  }
  return out;
}
// Ein Miner: Name, online, Hashrate (H/s), höchste Temperatur, schnellster Lüfter
// Grenzwerte (alerting.*.warnAt/failAt), Pool-Zähler und Kennungen sind keine Messwerte und fliegen raus
const NOT_MEASURED = /(^|\.)(alerting|pools|firmware|network|type|tags)\.|warnat|failat|enabled|limit|threshold|target|ideal|expected|nominal/;
// Leistung in Watt: Feld „power/watt/consumption“ (Grenzwerte, Ziele und Wirkungsgrad sind schon raus); kW-Felder werden umgerechnet
function wattOf(keys, f) {
  const BAD = /eff|cost|price|limit|rate|per|mode|type|profile|state|status|target|max|min|ideal|factor|unit|supply|name|id$|tariff|budget|threshold|^alert/;
  const cands = keys.filter((k2) => { const last = k2.toLowerCase().split(".").pop(); return /power|watt|consum/.test(k2.toLowerCase()) && !BAD.test(last) && num(f[k2]) != null && num(f[k2]) >= 0; });
  // genau passende Namen zuerst, danach alles andere mit power/watt/consum im letzten Teil
  const exact = cands.find((k2) => /(^|\.)(power|powerw|power_w|watts?|wattage|consumption|power_?draw|power_?usage)(_w|_kw|kw)?$/i.test(k2));
  const k = exact || cands.find((k2) => /current|actual|real|now|consum/.test(k2.toLowerCase())) || cands[0];
  if (!k) return null; let v = num(f[k]); if (/kw$|_kw|\.kw|kilowatt/i.test(k)) v *= 1000;
  return v >= 0 && v < 20000 ? Math.round(v) : null;
}
function miner(x) {
  const f0 = flat(x), f = {}; for (const [k, v] of Object.entries(f0)) if (!NOT_MEASURED.test(k.toLowerCase())) f[k] = v;
  const keys = Object.keys(f), low = (k) => k.toLowerCase();
  const pick = (re) => { const k = keys.find((k2) => re.test(low(k2)) && f[k2] != null && f[k2] !== ""); return k ? f[k] : null; };
  const name = String(x.name || pick(/(^|\.)(name|minername|worker|hostname)$/) || x.ip || pick(/(^|\.)ip$/) || x.id || "?");
  const nums = (re, skip) => keys.filter((k) => re.test(low(k)) && !(skip && skip.test(low(k)))).flatMap((k) => (Array.isArray(f[k]) ? f[k] : [f[k]]).map(num)).filter((v) => v != null);
  const temps = nums(/temp/, /limit|max_?temp|target|threshold|alarm/).filter((v) => v > 0 && v < 150);
  const fans = nums(/fan|rpm/, /percent|pct|count|num/).filter((v) => v > 0 && v < 30000);
  // Hashrate: Feld mit „hash“, Einheit grob erkennen (Foreman liefert meist GH/s oder H/s)
  let hr = null; const hk = keys.find((k) => /hash/.test(low(k)) && !/board|chain|ideal|expected|nominal|\.\d+\./.test(low(k)) && num(f[k]) != null);
  if (hk) { const v = num(f[hk]); hr = v >= 1e12 ? v : v >= 1e6 ? v * 1e6 : v >= 1e3 ? v * 1e9 : v * 1e12; if (/mh/.test(low(hk))) hr = v * 1e6; else if (/th/.test(low(hk))) hr = v * 1e12; else if (/gh/.test(low(hk))) hr = v * 1e9; }
  const st = pick(/(^|\.)(status|state)$/), act = pick(/(^|\.)(active|online|alive|up)$/);
  let on = null;
  if (typeof act === "boolean") on = act; else if (act != null && /^(true|1|online|up|yes)$/i.test(String(act))) on = true; else if (act != null && /^(false|0|offline|down|no)$/i.test(String(act))) on = false;
  if (on == null && st != null) on = /online|running|mining|ok|active|up/i.test(String(st)) ? true : /offline|down|dead|error|stopped/i.test(String(st)) ? false : null;
  if (on == null && hr != null) on = hr > 0;
  const err = pick(/error|alert|problem/);
  return { id: x.id ?? null, name: name.slice(0, 40), on, hr, temp: temps.length ? Math.max(...temps) : null, fan: fans.length ? Math.max(...fans) : null, watt: wattOf(keys, f), err: err && typeof err !== "number" && !/^(none|ok|false|0|)$/i.test(String(err)) ? String(err).slice(0, 80) : "" };
}
// Messwerte (Temperatur, Lüfter, Hashrate) stehen nicht in der Miner-Liste, nur im Status je Miner.
// Erst die Sammelabfrage versuchen, sonst den Status einzeln holen (höchstens 4 gleichzeitig, bis 150 Miner).
// Scrypt-Geräte (LTC/DOGE, z. B. Antminer L7/L9) rechnen in GH/s und gehören nicht in die SHA-256-Summe
const isScrypt = (t) => /\b(L[3-9]|L1[0-9])\b|scrypt|ltc|doge|elphapex|dg1|mini ?doge/i.test(String(t || ""));
// Nennwert aus dem Modellnamen, z. B. „Antminer S21 Pro (234T)“ → 234 TH/s, „L9 (17G)“ → 17 GH/s
// Nennwert aus dem Modellnamen („S21+ Hydro (358T)“), sonst aus der Tabelle der Werksangaben (Standardvariante, TH/s)
const NOMINAL_T = [["m63s+", 424], ["m63s", 390], ["s21 xp hydro", 473], ["s21 xp", 270], ["s21+ hydro", 358], ["s21 hydro", 335], ["s21 pro", 234], ["s21+", 216], ["s21 imm", 302], ["s21", 200], ["t21", 190],
  ["s19 xp hydro", 255], ["s19 xp", 140], ["s19 pro+ hydro", 198], ["s19 pro hydro", 177], ["s19j pro+", 120], ["s19j pro", 104], ["s19k pro", 120], ["s19 pro", 110], ["s19j", 90], ["s19", 95]];
function nominal(t) {
  const s = String(t || ""), m = s.match(/\((\d+(?:\.\d+)?)\s*([TGM])\)/i);
  if (m) return +m[1] * { T: 1e12, G: 1e9, M: 1e6 }[m[2].toUpperCase()];
  const n = s.toLowerCase().replace(/^(bitmain\s+antminer|bitmain|antminer|microbt\s+whatsminer|whatsminer)\s+/, "").replace(/\s*\(.*?\)/g, "").trim();
  const hit = NOMINAL_T.find(([k]) => n === k || n.startsWith(k + " "));
  return hit ? hit[1] * 1e12 : null;
}
// Messwerte: /miners/summary liefert die Hashrate je Miner in H/s (bestätigt mit des Nutzers Daten).
// Temperatur und Lüfter stehen dort nicht; die Detailabfrage je Miner wird vorsichtig probiert (wenige je Minute, Ergebnis zwischengespeichert).
const detailCache = new Map(); let detailOff = false, detailSample = null, detailErr = null;
async function details(clientId, key, ids) {
  if (detailOff) return;
  const now = Date.now(), todo = ids.filter((id) => !(detailCache.get(String(id))?.ts > now - 10 * 60e3)).slice(0, 20);
  for (const id of todo) {
    try { const j = await get(`${BASE}/v2/clients/${clientId}/miners/${id}`, key, 10000); if (!detailSample) detailSample = j; detailCache.set(String(id), { ts: now, d: j }); }
    catch (e) { detailErr = e.message; if (e.status === 404 || e.status === 405 || e.status === 401 || e.status === 403) { detailOff = true; } return; }
  }
}
const rows = (r) => { const l = Array.isArray(r) ? r : r?.results || r?.miners || r?.data || []; return (Array.isArray(l) ? l : []).filter((x) => x && typeof x === "object"); };
// Volle Miner-Liste (Namen, Modelle, Zustand) ändert sich selten: nur alle 5 Minuten holen; die Hashrate (Summary) jede Minute
const LIST_TTL = 5 * 60e3, listCache = new Map();
async function fullList(clientId, key) {
  let j = null, lastErr = null;
  for (const p of [`/v2/clients/${clientId}/miners`, `/v1/clients/${clientId}/miners`]) {
    try { j = await get(BASE + p, key); break; } catch (e) { lastErr = e; if (e.status !== 404) break; }
  }
  if (!j) return { error: lastErr?.message || "Foreman nicht erreichbar" };
  let list = rows(j); const path = BASE + `/v2/clients/${clientId}/miners`;
  // Foreman liefert höchstens eine Seite (z. B. 500); weitere Seiten mit offset holen, bis eine Seite kürzer ist oder nichts Neues kommt
  const page = list.length, seen = new Set(list.map((x) => String(x.id)));
  // Laut Foreman-Doku blättert man mit page/per_page; manche Antworten nehmen limit/offset. Beides probieren, Abbruch wenn nichts Neues kommt.
  for (const style of ["offset", "page"]) {
    let got = false;
    for (let n = 1; page >= 25 && n < 400; n++) {
      const q = style === "offset" ? `limit=${page}&offset=${n * page}` : `page=${n + 1}&per_page=${page}`;
      let more; try { more = rows(await get(`${path}?${q}`, key)); } catch { break; }
      const fresh = more.filter((x) => !seen.has(String(x.id))); fresh.forEach((x) => seen.add(String(x.id))); list.push(...fresh);
      if (!fresh.length) break; got = true; if (more.length < page) break;
    }
    if (got) break;
  }
  // Nur aufgestellte Geräte zählen (state „deployed“); eingelagerte oder ausgemusterte nicht
  const counts = { listed: list.length, states: {} }; for (const x of list) { const k = String(x.state ?? "-") + "/" + (x.seen === false ? "unseen" : "seen"); counts.states[k] = (counts.states[k] || 0) + 1; }
  list = list.filter((x) => !x.state || /deployed|active|online/i.test(String(x.state)));
  return { list, counts, pickaxes: await pickaxes(clientId, key) };
}
// Pickaxe-Agenten (je Standort einer) mit Namen und Verbindungsstatus; Pfad nicht dokumentiert, darum mehrere probieren
let pxSample = null;
async function pickaxes(clientId, key) {
  for (const p of [`/v2/clients/${clientId}/pickaxes`, `/v2/pickaxes?client=${clientId}`, `/v2/pickaxes`]) {
    try {
      const l = rows(await get(BASE + p, key, 10000)); if (!l.length) continue; if (!pxSample) pxSample = l.slice(0, 3);
      const out = {};
      for (const x of l) { const f = flat(x), ids = [x.id, x.internalId, x.pickaxeId, x.pickaxe].filter((v) => v != null).map(String);
        const st = String(x.status ?? x.state ?? x.online ?? x.connected ?? ""), on = typeof x.online === "boolean" ? x.online : typeof x.connected === "boolean" ? x.connected : /online|connected|ok|true|up/i.test(st) ? true : /offline|disconnected|down|false/i.test(st) ? false : null;
        for (const id of ids) out[id] = { name: String(x.name || x.label || x.hostname || "").slice(0, 30), on, version: x.version || f["version"] || "" }; }
      return out;
    } catch {}
  }
  return {};
}
async function farm(clientId, key, fresh = false) {
  clientId = String(clientId).trim(); key = String(key).trim();
  if (!/^\d{1,12}$/.test(clientId) || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return { ts: Date.now(), error: "Client-ID oder Schlüssel fehlt oder hat ein falsches Format" };
  const ck = clientId + "|" + key, lc = listCache.get(ck);
  let list, counts;
  let pxs = {};
  if (!fresh && lc && Date.now() - lc.ts < LIST_TTL) ({ list, counts, pickaxes: pxs } = lc);
  else {
    const r = await fullList(clientId, key);
    if (r.error) { if (!lc || fresh) return { ts: Date.now(), error: r.error }; ({ list, counts, pickaxes: pxs } = lc); }
    else { ({ list, counts, pickaxes: pxs } = r); listCache.set(ck, { ts: Date.now(), list, counts, pickaxes: pxs }); }
  }
  const sum = new Map(); let sumRaw = null, sumErr = null;
  try { sumRaw = await get(`${BASE}/v2/clients/${clientId}/miners/summary`, key); const arr = rows(sumRaw); for (const m of arr) if (m.id != null) sum.set(String(m.id), m); }
  catch (e) { sumErr = e.message; }
  await details(clientId, key, list.map((x) => x.id).filter((v) => v != null));
  const miners = list.map((x) => {
    const sm = sum.get(String(x.id)), dc = detailCache.get(String(x.id))?.d, type = x.type?.name || sm?.type?.name || "";
    const m = miner(dc && typeof dc === "object" ? { ...dc, ...x, stats: dc } : x);
    const hrS = num(sm?.hashrate ?? sm?.hashRate);
    if (m.watt == null && sm) { const w2 = miner(sm).watt; if (w2 != null) m.watt = w2; } // Leistung steht evtl. nur in der Summary
    if (hrS != null) m.hr = hrS; else if (sum.size) m.hr = null; // Summary ist maßgeblich (H/s)
    // online wie bei Foreman: liefert Hashrate; ohne Summary zählen seen/active/status
    if (sum.size) m.on = hrS > 0; else if (x.seen === false) m.on = false;
    if (m.on === false && m.watt != null) m.watt = 0; // offline zählt wie bei Foreman als 0 W
    m.px = x.pickaxe != null ? String(x.pickaxe) : "";
    m.type = type.slice(0, 60); m.algo = isScrypt(type) ? "scrypt" : "sha256"; m.nom = nominal(type);
    return m;
  });
  const sample = JSON.stringify({ counts, pickaxes: pxSample, miners: list.slice(0, 2), summary: sumRaw ? rows(sumRaw).slice(0, 3) : sumErr, detail: detailSample || detailErr || null }, null, 1).slice(0, 20000);
  const haveTemp = miners.some((m) => m.temp != null);
  return { ts: Date.now(), miners, pickaxes: pxs || {}, sample, ...(!sum.size && !haveTemp ? { note: "Foreman liefert hier keine Messwerte je Miner. Beispiel der Antwort liegt im Argus-Datenordner als foreman-beispiel.json." } : {}) };
}
module.exports = { farm, miner, nominal, isScrypt };
