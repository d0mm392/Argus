// Mining: eigener OCEAN-Pool (nur lesend über die öffentliche API mit der Auszahlungsadresse, kein Konto, kein Schlüssel)
// und Bitcoin-Netz von mempool.space (Difficulty-Anpassung, Gebühren, Netz-Hashrate, Hashprice).
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Argus-Desktop", Accept: "application/json" };
const OCEAN = process.env.JARVIS_OCEAN || "https://api.ocean.xyz/v1"; // Umgebungsvariablen nur für Tests
const MEMPOOL = process.env.JARVIS_MEMPOOL || "https://mempool.space/api";

async function get(url, ms = 15000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(url.split("/")[2] + " antwortet mit " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// OCEAN packt die Werte mal in result, mal direkt aus
const res = (j) => (j && typeof j === "object" && j.result && typeof j.result === "object" ? j.result : j) || {};

// Adresse grob prüfen (bc1…, 1…, 3…), damit nichts Fremdes in die URL gerät
const validAddr = (a) => /^(bc1[a-z0-9]{20,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(String(a || "").trim());

// Ein Worker aus user_hashrate_full. Die Feldnamen sind nicht dokumentiert (mal hashrate_60s, mal hashrate_60,
// mal eine Liste von Messpunkten), darum tolerant: alle Zahlenfelder mit „hash“ im Namen, 60 s und 3 h nach Kennung,
// Werte unter einer Million sind schon TH/s. Ohne Hashrate-Felder entscheidet der letzte Share, sonst „unbekannt“.
function worker(name, x) {
  if (Array.isArray(x)) x = x[0] || {};
  const flat = {};
  const walk = (o, pre) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === "object" && !Array.isArray(v)) walk(v, pre + k + "."); else flat[pre + k] = v; } };
  walk(x, "");
  const hs = Object.entries(flat).filter(([k, v]) => /hash/i.test(k) && num(v) != null).map(([k, v]) => [k.toLowerCase(), num(v)]);
  const toH = (v) => (v != null && v > 0 && v < 1e6 ? v * 1e12 : v);
  const pick = (re) => { const e = hs.find(([k]) => re.test(k)); return e ? toH(e[1]) : null; };
  const m1 = pick(/(^|[^0-9])60(s|sec)?$|_60s?\b|60s/), h3 = pick(/10800|3h|3hr|7200|3600/) ?? pick(/300|600/), any = hs.length ? Math.max(...hs.map(([, v]) => toH(v))) : null;
  const shareKey = Object.keys(flat).find((k) => /last.?share|share.?ts|lastshare/i.test(k)), sv = shareKey ? flat[shareKey] : null;
  const share = num(sv) ? (num(sv) < 1e12 ? num(sv) * 1000 : num(sv)) : sv ? Date.parse(String(sv).replace(" ", "T") + (/[zZ+]/.test(String(sv)) ? "" : "Z")) : null;
  const recent = share && Number.isFinite(share) ? Date.now() - share < 15 * 60e3 : null;
  const on = (m1 || h3 || any) > 0 ? true : recent != null ? recent : hs.length ? false : null;
  return { name: name.replace(/^.*\./, "") || name, m1: m1 || 0, h3: h3 || any || 0, on };
}

const lastGood = new Map(); // je Adresse: letzte brauchbare Worker-Liste (OCEAN antwortet gelegentlich kurz leer oder gar nicht)
async function pool(addr) {
  addr = String(addr).trim();
  const out = { ts: Date.now() };
  const [hr, snap, full] = await Promise.allSettled([
    get(`${OCEAN}/user_hashrate/${addr}`), get(`${OCEAN}/statsnap/${addr}`), get(`${OCEAN}/user_hashrate_full/${addr}`, 20000),
  ]);
  if (hr.status === "fulfilled") {
    const d = res(hr.value); // Werte in H/s
    out.hr = { m1: num(d.hashrate_60s), m10: num(d.hashrate_600s), h3: num(d.hashrate_10800s ?? d.hashrate_7200s ?? d.hashrate_3600s), h24: num(d.hashrate_86400s) };
    out.active = num(d.active_worker_count);
  } else out.error = hr.reason?.message || "OCEAN nicht erreichbar";
  if (snap.status === "fulfilled") {
    const s = res(snap.value); // Beträge in BTC
    out.unpaid = num(s.unpaid);
    out.nextBlock = num(s.estimated_earn_next_block);
    const ts = num(s.lastest_share_ts ?? s.latest_share_ts);
    out.lastShare = ts ? (ts < 1e12 ? ts * 1000 : ts) : null;
  }
  if (full.status === "fulfilled") {
    const j = full.value, w = j?.workers || res(j).workers || j?.user_hashrate?.workers;
    const list = Array.isArray(w) ? w.map((x) => [x?.workername || x?.name || x?.worker, x]) : w && typeof w === "object" ? Object.entries(w) : [];
    const ok = list.filter(([n, x]) => n && x && typeof x === "object" && !/^(online|offline|status|worker|total)$/i.test(n));
    out.workers = ok.map(([n, x]) => worker(String(n), x)).sort((a, b) => b.h3 - a.h3);
    // Passt nicht zusammen (Pool sieht Hashrate, aber jeder Worker „aus“): Format nicht verstanden, lieber „unbekannt“ als Fehlalarm
    if (out.hr?.m10 > 0 && out.workers.length && out.workers.every((x) => x.on === false)) {
      for (const x of out.workers) x.on = null;
      out.workersUnknown = true; out.sample = JSON.stringify(ok.slice(0, 2)).slice(0, 1500);
    }
  }
  // Leere oder fehlende Worker-Liste bei sichtbarer Pool-Hashrate = Aussetzer der API, nicht „0 Miner“: letzte gute Liste (bis 30 min) als veraltet zeigen
  const seesHash = (out.hr?.m1 > 0 || out.hr?.m10 > 0 || out.hr?.h3 > 0);
  if (out.workers && out.workers.length) lastGood.set(addr, { ts: Date.now(), workers: out.workers });
  else if (full.status !== "fulfilled" || seesHash || out.active > 0) {
    const g = lastGood.get(addr);
    if (g && Date.now() - g.ts < 30 * 60e3) { out.workers = g.workers; out.workersStale = Date.now() - g.ts; }
    else delete out.workers;
  }
  return out;
}

async function network() {
  const out = { ts: Date.now() };
  const [adj, fees, hr, rew, tip, px] = await Promise.allSettled([
    get(`${MEMPOOL}/v1/difficulty-adjustment`), get(`${MEMPOOL}/v1/fees/recommended`), get(`${MEMPOOL}/v1/mining/hashrate/3d`),
    get(`${MEMPOOL}/v1/mining/reward-stats/144`), get(`${MEMPOOL}/blocks/tip/height`), get(`${MEMPOOL}/v1/prices`),
  ]);
  if (adj.status === "fulfilled") {
    const a = adj.value;
    out.adj = { change: num(a.difficultyChange), progress: num(a.progressPercent), remainingBlocks: num(a.remainingBlocks), eta: num(a.estimatedRetargetDate) };
  }
  if (fees.status === "fulfilled") { const f = fees.value; out.fees = { fast: num(f.fastestFee), hour: num(f.hourFee), min: num(f.minimumFee) }; }
  if (hr.status === "fulfilled") { out.netHash = num(hr.value.currentHashrate); out.difficulty = num(hr.value.currentDifficulty); }
  if (tip.status === "fulfilled") out.height = num(tip.value);
  if (px.status === "fulfilled") out.price = { usd: num(px.value.USD), eur: num(px.value.EUR) };
  // Hashprice: was 1 PH/s am Tag verdient = Belohnung der letzten 144 Blöcke (≈ ein Tag) × Kurs / Netz-Hashrate in PH/s
  if (rew.status === "fulfilled" && out.netHash) {
    const r = rew.value, total = num(r.totalReward), fee = num(r.totalFee);
    if (total) {
      const btcPerPH = total / 1e8 / (out.netHash / 1e15);
      out.hashprice = { btc: btcPerPH, usd: out.price?.usd ? btcPerPH * out.price.usd : null, eur: out.price?.eur ? btcPerPH * out.price.eur : null, feeShare: fee && total ? fee / total : null };
    }
  }
  if (!Object.keys(out).some((k) => k !== "ts")) out.error = "mempool.space nicht erreichbar";
  return out;
}

module.exports = { pool, network, validAddr };
