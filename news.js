// Lagebild: Bitcoin-Kurs (CoinMarketCap ohne Schlüssel, Ersatz CoinGecko), Tech- und Krypto-News per RSS,
// Auffälligkeiten aus Kurs, Fear & Greed und Bitcoin-Netz (mempool.space). Alles öffentlich, ohne Konto.
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Argus-Desktop", Accept: "application/json, application/rss+xml, application/atom+xml, text/xml, */*" };
const FEEDS = [
  { cat: "tech", source: "heise online", url: "https://www.heise.de/rss/heise-atom.xml" },
  { cat: "tech", source: "Golem", url: "https://rss.golem.de/rss.php?feed=RSS2.0" },
  { cat: "tech", source: "t3n", url: "https://t3n.de/rss.xml" },
  { cat: "krypto", source: "BTC-ECHO", url: "https://www.btc-echo.de/feed/" },
  { cat: "krypto", source: "Cointelegraph", url: "https://de.cointelegraph.com/rss" },
  { cat: "welt", source: "Tagesschau", url: "https://www.tagesschau.de/index~rss2.xml" },
  { cat: "welt", source: "Spiegel", url: "https://www.spiegel.de/schlagzeilen/index.rss" },
  { cat: "krypto", source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
];
const CMC_BTC = "https://coinmarketcap.com/currencies/bitcoin/";

async function get(url, type = "json", ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(url.split("/")[2] + " antwortet mit " + r.status);
    if (type === "json") return await r.json();
    // Zeichensatz aus Header oder XML-Kopf (Golem sendet z. B. ISO-8859-1, sonst werden Umlaute zu �)
    const buf = Buffer.from(await r.arrayBuffer());
    const head = buf.subarray(0, 300).toString("latin1");
    const cs = (/charset=["']?([\w-]+)/i.exec(r.headers.get("content-type") || "") || /encoding=["']([\w-]+)/i.exec(head) || [])[1] || "utf-8";
    try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return buf.toString("utf8"); }
  } finally { clearTimeout(t); }
}

// ---------- Kurs ----------
// Die Antwort der keyless-API ist nur als Schema dokumentiert, daher tolerant: BTC-Eintrag und Kurs je Währung suchen, egal wie verschachtelt
function pickQuotes(entry) {
  const out = {};
  const q = entry?.quotes || entry?.quote;
  const list = Array.isArray(q) ? q : q && typeof q === "object" ? Object.entries(q).map(([k, v]) => ({ symbol: k, ...v })) : [];
  for (const x of list) if (x && typeof x.price === "number") out[String(x.symbol || x.name || "").toUpperCase()] = { price: x.price, change: x.percent_change_24h ?? x.percentChange24h ?? null };
  return out;
}
async function btcCMC() {
  const j = await get("https://pro-api.coinmarketcap.com/public-api/v2/simple/price?symbol=BTC&convert=USD,EUR&include_24h_change=true");
  let d = j?.data; if (d && !Array.isArray(d)) d = d.BTC || d["1"] || Object.values(d)[0]; if (Array.isArray(d)) d = d.find((x) => x.symbol === "BTC" || x.id === 1) || d[0];
  const q = pickQuotes(d);
  if (!q.USD && !q.EUR) throw new Error("CoinMarketCap: unerwartetes Format");
  return { usd: q.USD, eur: q.EUR, source: "CoinMarketCap", url: CMC_BTC };
}
async function btcGecko() {
  const j = await get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur&include_24hr_change=true");
  const b = j?.bitcoin; if (!b?.usd) throw new Error("CoinGecko: kein Kurs");
  return { usd: { price: b.usd, change: b.usd_24h_change ?? null }, eur: { price: b.eur, change: b.eur_24h_change ?? null }, source: "CoinGecko", url: "https://www.coingecko.com/de/munze/bitcoin" };
}
// Weitere Coins (Einstellungen → Lagebild → Kurse): Symbol → CoinGecko-ID, CoinMarketCap-Seite, Binance-Paar
const COINS = {
  BTC: { id: "bitcoin", name: "Bitcoin", cmc: "bitcoin" }, ETH: { id: "ethereum", name: "Ethereum", cmc: "ethereum" }, SOL: { id: "solana", name: "Solana", cmc: "solana" },
  XRP: { id: "ripple", name: "XRP", cmc: "xrp" }, LTC: { id: "litecoin", name: "Litecoin", cmc: "litecoin" }, DOGE: { id: "dogecoin", name: "Dogecoin", cmc: "dogecoin" },
  KAS: { id: "kaspa", name: "Kaspa", cmc: "kaspa", noBinance: true }, BNB: { id: "binancecoin", name: "BNB", cmc: "bnb" }, ADA: { id: "cardano", name: "Cardano", cmc: "cardano" },
};
const cmcUrl = (sym) => "https://coinmarketcap.com/currencies/" + COINS[sym].cmc + "/";
async function coinsCMC(syms) {
  const j = await get("https://pro-api.coinmarketcap.com/public-api/v2/simple/price?symbol=" + syms.join(",") + "&convert=USD,EUR&include_24h_change=true");
  const d = j?.data, all = Array.isArray(d) ? d : d && typeof d === "object" ? Object.values(d).flat() : [], out = {};
  for (const e of all) {
    const sym = String(e?.symbol || "").toUpperCase(); if (!syms.includes(sym) || out[sym]) continue;
    const q = pickQuotes(e); if (q.USD || q.EUR) out[sym] = { usd: q.USD, eur: q.EUR, source: "CoinMarketCap", url: cmcUrl(sym) };
  }
  return out;
}
async function coinsGecko(syms) {
  const ids = syms.map((x) => COINS[x].id);
  const j = await get("https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd,eur&include_24hr_change=true"), out = {};
  for (const sym of syms) { const b = j?.[COINS[sym].id]; if (b?.usd) out[sym] = { usd: { price: b.usd, change: b.usd_24h_change ?? null }, eur: { price: b.eur, change: b.eur_24h_change ?? null }, source: "CoinGecko", url: "https://www.coingecko.com/de/munze/" + COINS[sym].id }; }
  return out;
}
// Kurse aller gewünschten Coins: erst CoinMarketCap, was fehlt von CoinGecko
async function coins(list) {
  const syms = [...new Set(["BTC", ...(list || [])].map((x) => String(x).toUpperCase()).filter((x) => COINS[x]))], ts = Date.now(), errs = [];
  let out = {};
  try { out = await coinsCMC(syms); } catch (e) { errs.push(e.message); }
  const miss = syms.filter((x) => !out[x]);
  if (miss.length) try { Object.assign(out, await coinsGecko(miss)); } catch (e) { errs.push(e.message); }
  for (const k of Object.keys(out)) out[k].ts = ts;
  return { coins: out, error: syms.some((x) => !out[x]) ? errs.join(" · ") || "kein Kurs" : "" };
}
// Verlauf der letzten 24 Stunden in USD (CoinGecko, sonst Binance-Kerzen), damit die Kurve gleich echt ist und nicht erst entsteht
async function history(sym) {
  const c = COINS[sym]; if (!c) return null;
  const thin = (a) => { const st = Math.max(1, Math.ceil(a.length / 96)); return a.filter((_, i) => i % st === 0 || i === a.length - 1); };
  try {
    const j = await get("https://api.coingecko.com/api/v3/coins/" + c.id + "/market_chart?vs_currency=usd&days=1");
    const a = (j?.prices || []).filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]));
    if (a.length > 10) return thin(a);
  } catch {}
  if (c.noBinance) return null;
  try {
    const j = await get("https://api.binance.com/api/v3/klines?symbol=" + sym + "USDT&interval=15m&limit=96");
    const a = (Array.isArray(j) ? j : []).map((k) => [Number(k[6]) || Number(k[0]), parseFloat(k[4])]).filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]));
    if (a.length > 10) return a;
  } catch {}
  return null;
}
async function btc() {
  try { return { ...(await btcCMC()), ts: Date.now() }; }
  catch (e1) { try { return { ...(await btcGecko()), ts: Date.now(), note: e1.message }; } catch (e2) { return { error: e1.message + " · " + e2.message, ts: Date.now() }; } }
}

// ---------- RSS/Atom ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const clean = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m).replace(/\s+/g, " ").trim();
function parseFeed(xml, feed) {
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const it = m[0], tag = (n) => (new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i").exec(it) || [])[1];
    const title = clean(tag("title"));
    let link = clean(tag("link")) || (/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i.exec(it) || /<link\b[^>]*href=["']([^"']+)/i.exec(it) || [])[1] || clean(tag("guid"));
    link = (link || "").replace(/&amp;/g, "&");
    const ts = Date.parse(clean(tag("pubDate") || tag("published") || tag("updated") || tag("dc:date"))) || 0;
    if (title && /^https?:\/\//i.test(link)) items.push({ title, link, ts, source: feed.source, cat: feed.cat });
    if (items.length >= 25) break;
  }
  return items;
}
async function feeds(cats) {
  const res = await Promise.allSettled(FEEDS.filter((f) => cats.includes(f.cat)).map(async (f) => parseFeed(await get(f.url, "text"), f)));
  const out = {}, errors = [];
  res.forEach((r, i) => { if (r.status === "rejected") errors.push(FEEDS.filter((f) => cats.includes(f.cat))[i].source); });
  for (const cat of cats) {
    const seen = new Set();
    out[cat] = res.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((x) => x.cat === cat)
      .sort((a, b) => b.ts - a.ts).filter((x) => { const k = x.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  }
  return { ...out, errors };
}

// ---------- Auffälligkeiten ----------
const pct = (v) => (v > 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + " %";
async function alerts(price) {
  const items = [];
  const add = (level, title, source, link) => items.push({ level, title, source, link, ts: Date.now() });
  const ch = price?.usd?.change;
  if (typeof ch === "number" && Math.abs(ch) >= 3) add(Math.abs(ch) >= 7 ? "hoch" : "mittel", `Bitcoin ${ch > 0 ? "steigt" : "fällt"} stark: ${pct(ch)} in 24 Stunden`, price.source, price.url);
  const [fg, adj, hr, fees] = await Promise.allSettled([
    get("https://pro-api.coinmarketcap.com/public-api/v3/fear-and-greed/latest"),
    get("https://mempool.space/api/v1/difficulty-adjustment"),
    get("https://mempool.space/api/v1/mining/hashrate/3d"),
    get("https://mempool.space/api/v1/fees/recommended"),
  ]);
  if (fg.status === "fulfilled") {
    const d = fg.value?.data || fg.value; const v = +(d?.value ?? d?.score);
    if (Number.isFinite(v)) {
      const word = v <= 25 ? "extreme Angst" : v <= 45 ? "Angst" : v < 55 ? "neutral" : v < 75 ? "Gier" : "extreme Gier";
      add(v <= 20 || v >= 80 ? "mittel" : "info", `Fear & Greed: ${Math.round(v)} (${word})`, "CoinMarketCap", "https://coinmarketcap.com/charts/fear-and-greed-index/");
    }
  }
  if (adj.status === "fulfilled" && typeof adj.value?.difficultyChange === "number") {
    const a = adj.value, when = a.estimatedRetargetDate ? new Date(a.estimatedRetargetDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "";
    add(Math.abs(a.difficultyChange) >= 4 ? "mittel" : "info", `Difficulty-Anpassung ${pct(a.difficultyChange)} erwartet, in ${a.remainingBlocks} Blöcken${when ? " (ca. " + when + ")" : ""}`, "mempool.space", "https://mempool.space/de/mining");
  }
  if (hr.status === "fulfilled" && typeof hr.value?.currentHashrate === "number")
    add("info", `Netz-Hashrate: ${(hr.value.currentHashrate / 1e18).toFixed(0)} EH/s`, "mempool.space", "https://mempool.space/de/graphs/mining/hashrate-difficulty");
  if (fees.status === "fulfilled" && typeof fees.value?.fastestFee === "number") {
    const f = fees.value.fastestFee;
    add(f >= 50 ? "mittel" : "info", `Gebühren: ${f} sat/vB schnell, ${fees.value.hourFee} sat/vB in einer Stunde` + (f >= 50 ? " (Netz stark ausgelastet)" : ""), "mempool.space", "https://mempool.space/de/");
  }
  const rank = { hoch: 0, mittel: 1, info: 2 };
  return items.sort((a, b) => rank[a.level] - rank[b.level]);
}

module.exports = { btc, coins, history, COINS, feeds, alerts, parseFeed, FEEDS, CMC_BTC };
