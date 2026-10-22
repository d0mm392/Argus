// Trading-Seite: Kurse für Watchlist und Portfolio, Markt-Kennzahlen. Nur lesend, öffentliche Quellen ohne Konto:
// Krypto über CoinGecko, Aktien über Yahoo Finance (oder Finnhub mit eigenem Schlüssel), Angst-und-Gier-Index von alternative.me,
// Halving aus der Blockhöhe (mempool.space). Argus handelt nie selbst, es gibt keine Order-Funktion.
const UA = { "User-Agent": "Mozilla/5.0 Argus-Desktop", Accept: "application/json" };
async function get(url, ms = 10000, headers = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); }
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// Kürzel → CoinGecko-Kennung (alles andere wird als Kennung wie "bitcoin-cash" genommen)
const CG = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", DOGE: "dogecoin", LTC: "litecoin", ADA: "cardano", BNB: "binancecoin", DOT: "polkadot", AVAX: "avalanche-2", LINK: "chainlink", TON: "the-open-network", TRX: "tron", MATIC: "matic-network", SHIB: "shiba-inu", BCH: "bitcoin-cash", XLM: "stellar", ATOM: "cosmos", UNI: "uniswap", ETC: "ethereum-classic", XMR: "monero", NEAR: "near", APT: "aptos", ARB: "arbitrum", OP: "optimism", PEPE: "pepe", KAS: "kaspa" };
const cgId = (s) => CG[String(s).toUpperCase()] || String(s).toLowerCase();
const okSym = (s) => /^[A-Za-z0-9.^=\-]{1,20}$/.test(String(s || ""));

async function crypto(items, cur) {
  const out = {}, ids = [...new Set(items.map((i) => cgId(i.s)))];
  if (!ids.length) return out;
  const c = cur === "eur" ? "eur" : "usd";
  const j = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=${c}&include_24hr_change=true`);
  for (const i of items) { const d = j?.[cgId(i.s)]; if (d && num(d[c]) != null) out["c:" + i.s.toUpperCase()] = { p: num(d[c]), ch: num(d[c + "_24h_change"]), cur: c.toUpperCase() }; }
  return out;
}
async function yahoo(sym) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`);
  const r = j?.chart?.result?.[0], m = r?.meta; if (!m || num(m.regularMarketPrice) == null) throw new Error("kein Kurs");
  const hist = (r.indicators?.quote?.[0]?.close || []).filter((v) => v != null).map((v) => +v.toFixed(4)), prev = num(m.chartPreviousClose ?? m.previousClose) ?? hist[hist.length - 2];
  return { p: num(m.regularMarketPrice), ch: prev ? (m.regularMarketPrice - prev) / prev * 100 : null, cur: m.currency || "", hist: hist.slice(-30), name: m.shortName || m.longName || "" };
}
async function finnhub(sym, key) {
  const j = await get(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}`, 10000, { "X-Finnhub-Token": key });
  if (!num(j?.c)) throw new Error("kein Kurs");
  return { p: num(j.c), ch: num(j.dp), cur: "USD" };
}
async function stocks(items, cfg) {
  const out = {};
  await Promise.all(items.map(async (i) => {
    try { out["s:" + i.s.toUpperCase()] = cfg.tradeStock === "finnhub" && cfg.finnhubKey ? await finnhub(i.s, cfg.finnhubKey) : await yahoo(i.s); }
    catch (e) { out["s:" + i.s.toUpperCase()] = { err: String(e.message || e).slice(0, 60) }; }
  }));
  return out;
}
async function market(cfg) {
  const m = {}, tasks = [];
  if (cfg.tradeFng !== false) tasks.push(get("https://api.alternative.me/fng/?limit=2").then((j) => { const d = j?.data?.[0]; if (d) m.fng = { v: num(d.value), label: String(d.value_classification || ""), prev: num(j.data[1]?.value) }; }).catch(() => {}));
  if (cfg.tradeDom !== false) tasks.push(get("https://api.coingecko.com/api/v3/global").then((j) => { const d = j?.data; if (d) m.glob = { dom: num(d.market_cap_percentage?.btc), ethDom: num(d.market_cap_percentage?.eth), mcap: num(d.total_market_cap?.[cfg.tradeCur === "eur" ? "eur" : "usd"]), mcapCh: num(d.market_cap_change_percentage_24h_usd), cur: cfg.tradeCur === "eur" ? "EUR" : "USD" }; }).catch(() => {}));
  if (cfg.tradeHalv !== false) tasks.push(get("https://mempool.space/api/blocks/tip/height").then((h) => { h = num(h); if (h) { const next = Math.ceil((h + 1) / 210000) * 210000, left = next - h; m.halving = { height: h, next, blocksLeft: left, eta: Date.now() + left * 600e3, reward: 50 / Math.pow(2, Math.floor(next / 210000)) }; } }).catch(() => {}));
  await Promise.all(tasks);
  return m;
}
let cache = { t: 0, key: "", v: null };
async function fetchAll(cfg) {
  const clean = (a) => (Array.isArray(a) ? a : []).filter((x) => x && okSym(x.s) && (x.t === "c" || x.t === "s")).slice(0, 60).map((x) => ({ s: String(x.s), t: x.t }));
  const watch = clean(cfg.tradeWatch), port = clean(cfg.tradePort);
  const all = [...new Map([...watch, ...port].map((x) => [x.t + x.s.toUpperCase(), x])).values()];
  const key = JSON.stringify([all, cfg.tradeCur, cfg.tradeStock, !!cfg.finnhubKey, cfg.tradeFng, cfg.tradeDom, cfg.tradeHalv]);
  if (cache.v && cache.key === key && Date.now() - cache.t < 25e3) return cache.v;
  const out = { ts: Date.now(), q: {}, m: {}, err: "" };
  const [c, s, m] = await Promise.allSettled([crypto(all.filter((x) => x.t === "c"), cfg.tradeCur), stocks(all.filter((x) => x.t === "s"), cfg), market(cfg)]);
  if (c.status === "fulfilled") Object.assign(out.q, c.value); else if (all.some((x) => x.t === "c")) out.err = "Krypto-Kurse nicht erreichbar (" + String(c.reason?.message || "").slice(0, 40) + ")";
  if (s.status === "fulfilled") Object.assign(out.q, s.value);
  if (m.status === "fulfilled") out.m = m.value;
  cache = { t: Date.now(), key, v: out };
  return out;
}
module.exports = { fetchAll, okSym };
