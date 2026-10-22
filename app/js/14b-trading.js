// ---------- Trading-Seite: Markt-Kennzahlen, Watchlist, Portfolio (nur lesend, keine Orders) ----------
tradeCfg = { on: true, cur: "usd", every: 60, watch: [], port: [], stock: "yahoo" }; let tradeEditKey = ""; let tradeData = null, tradeAt = 0, tradeBusy = false, tradeAddMode = "c";
const TRADE_DEFAULT_WATCH = [{ s: "BTC", t: "c" }, { s: "ETH", t: "c" }, { s: "SOL", t: "c" }, { s: "AAPL", t: "s" }, { s: "NVDA", t: "s" }];
const tEl = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
const tFmt = (v, cur) => { if (v == null) return "–"; const d = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 5; try { return v.toLocaleString("de-DE", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }) + (cur ? " " + ({ USD: "$", EUR: "€" }[cur] || cur) : ""); } catch { return String(v); } };
const tPct = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + " %");
const tCls = (v) => (v == null ? "" : v > 0 ? "up" : v < 0 ? "dn" : "");
const tKey = (x) => x.t + ":" + String(x.s).toUpperCase();
function tradeUrl(x) { const s = String(x.s); return x.t === "c" ? "https://www.coingecko.com/de/munze/" + encodeURIComponent(({ BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", DOGE: "dogecoin", LTC: "litecoin", ADA: "cardano" })[s.toUpperCase()] || s.toLowerCase()) : "https://finance.yahoo.com/quote/" + encodeURIComponent(s); }
function tSpark(h, up) {
  if (!h || h.length < 3) return null; const NS = "http://www.w3.org/2000/svg", sv = document.createElementNS(NS, "svg"), pl = document.createElementNS(NS, "polyline"), lo = Math.min(...h), hi = Math.max(...h);
  sv.setAttribute("viewBox", "0 0 60 18"); sv.setAttribute("class", "t-spark " + (up ? "up" : "dn")); pl.setAttribute("points", h.map((v, i) => (i * 60 / (h.length - 1)).toFixed(1) + "," + (16 - (v - lo) / ((hi - lo) || 1) * 14).toFixed(1)).join(" ")); sv.append(pl); return sv;
}
function tradeRenderMarket() {
  const b = $("tMktBody"), m = tradeData?.m || {}, out = [];
  const tile = (k, v, sub, cls) => { const d = tEl("div", null, "t-kpi"); d.append(tEl("small", k), tEl("b", v, cls || ""), ...(sub ? [tEl("span", sub)] : [])); return d; };
  if (m.fng) { const t = tile("Angst und Gier", String(m.fng.v), (m.fng.label || "") + (m.fng.prev != null ? " · gestern " + m.fng.prev : ""), m.fng.v < 25 ? "dn" : m.fng.v > 75 ? "up" : ""); const bar = tEl("div", null, "t-fng"), i = tEl("i"); i.style.left = Math.max(0, Math.min(100, m.fng.v)) + "%"; bar.append(i); t.append(bar); out.push(t); }
  if (m.glob) { if (m.glob.dom != null) out.push(tile("Bitcoin-Dominanz", m.glob.dom.toFixed(1).replace(".", ",") + " %", m.glob.ethDom != null ? "Ethereum " + m.glob.ethDom.toFixed(1).replace(".", ",") + " %" : "")); if (m.glob.mcap != null) out.push(tile("Marktkapitalisierung", (m.glob.mcap / 1e12).toFixed(2).replace(".", ",") + " Bio. " + (m.glob.cur === "EUR" ? "€" : "$"), tPct(m.glob.mcapCh) + " (24 h)", tCls(m.glob.mcapCh))); }
  if (m.halving) { const d = Math.max(0, Math.round((m.halving.eta - Date.now()) / 864e5)); out.push(tile("Halving", m.halving.blocksLeft.toLocaleString("de-DE") + " Blöcke", "in etwa " + d.toLocaleString("de-DE") + " Tagen · " + new Date(m.halving.eta).toLocaleDateString("de-DE", { month: "short", year: "numeric" }) + " · Belohnung " + String(m.halving.reward).replace(".", ",") + " BTC")); }
  const btc = tradeData?.q?.["c:BTC"]; if (btc && !btc.err) out.push(tile("Bitcoin", tFmt(btc.p, btc.cur), tPct(btc.ch) + " (24 h)", tCls(btc.ch)));
  if (!out.length) out.push(tEl("div", tradeData ? (tradeData.err || "Keine Marktdaten (offline oder in den Einstellungen abgeschaltet).") : "Lade Marktdaten …", "t-dim"));
  b.replaceChildren(...out); $("tMktState").textContent = tradeData ? "Stand " + new Date(tradeData.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
}
function tradeRow(x, extra, onClick) {
  const q = tradeData?.q?.[tKey(x)], r = tEl("div", null, "t-row"); r.title = onClick ? "Klick: Position bearbeiten" : "Klick öffnet die Kursseite";
  r.addEventListener("click", onClick || (() => window.jarvis.openUrl(tradeUrl(x))));
  const nm = tEl("div", null, "t-name"); nm.append(tEl("b", String(x.s).toUpperCase()), tEl("small", x.t === "c" ? "Krypto" : (q?.name || "Aktie")));
  const pr = tEl("div", null, "t-price"); if (q?.err) pr.append(tEl("b", "–", "t-dim"), tEl("small", q.err)); else if (q) pr.append(tEl("b", tFmt(q.p, q.cur)), tEl("small", tPct(q.ch), tCls(q.ch))); else pr.append(tEl("b", tradeData ? "–" : "…", "t-dim"));
  r.append(nm, tSpark(q?.hist, (q?.ch ?? 0) >= 0) || tEl("span", null, "t-spark"), pr, ...(extra ? [extra] : []));
  return r;
}
function tradeRemove(listKey, x) { tradeCfg[listKey] = tradeCfg[listKey].filter((y) => tKey(y) !== tKey(x)); window.jarvis.setConfig(listKey === "watch" ? { tradeWatch: tradeCfg.watch } : { tradePort: tradeCfg.port }); tradeRender(); tradeTick(true); }
function tradeRenderWatch() {
  const b = $("tWatchBody"); if (!tradeCfg.watch.length) { b.replaceChildren(tEl("div", "Noch nichts auf der Watchlist. Mit „+ Krypto“ oder „+ Aktie“ hinzufügen.", "t-dim")); return; }
  b.replaceChildren(...tradeCfg.watch.map((x) => { const rm = tEl("button", "×", "t-x"); rm.title = "Von der Watchlist entfernen"; rm.addEventListener("click", (e) => { e.stopPropagation(); tradeRemove("watch", x); }); return tradeRow(x, rm); }));
}
function tradeRenderPort() {
  const b = $("tPortBody"); if (!tradeCfg.port.length) { b.replaceChildren(tEl("div", "Noch keine Positionen. Mit „+ Position“ Menge und Einstandskurs eintragen.", "t-dim")); return; }
  const sums = {}, rows = tradeCfg.port.map((x) => {
    const q = tradeData?.q?.[tKey(x)], val = q && !q.err ? q.p * (x.q || 0) : null, cost = (x.c || 0) * (x.q || 0), pl = val != null && cost > 0 ? (val - cost) / cost * 100 : null;
    if (val != null) { const c = q.cur || "?"; sums[c] = sums[c] || { v: 0, c: 0 }; sums[c].v += val; sums[c].c += cost; }
    const rm = tEl("button", "×", "t-x"); rm.title = "Position entfernen"; rm.addEventListener("click", (e) => { e.stopPropagation(); tradeRemove("port", x); });
    const ed = tEl("button", "✎", "t-x"); ed.title = "Position bearbeiten"; ed.addEventListener("click", (e) => { e.stopPropagation(); tradeAdd("pos", x); });
    const bx = tEl("span", null, "t-btns"); bx.append(ed, rm);
    const r = tradeRow(x, bx, () => tradeAdd("pos", x)), pr = r.querySelector(".t-price"); pr.replaceChildren(tEl("b", val != null ? tFmt(val, q.cur) : "–"), tEl("small", (x.q ?? 0).toLocaleString("de-DE") + " Stk." + (pl != null ? " · " + tPct(pl) : ""), tCls(pl))); return r;
  });
  const tot = tEl("div", null, "t-total");
  for (const [c, s] of Object.entries(sums)) { const pl = s.c > 0 ? (s.v - s.c) / s.c * 100 : null, d = tEl("div"); d.append(tEl("small", "Gesamt " + c), tEl("b", tFmt(s.v, c)), tEl("span", s.c > 0 ? tFmt(s.v - s.c, c) + " · " + tPct(pl) : "", tCls(pl))); tot.append(d); }
  // Verteilung (nur gleiche Währung ergibt einen Sinn; je Währung eigener Balken)
  const bars = Object.keys(sums).map((c) => { const items = tradeCfg.port.map((x) => { const q = tradeData?.q?.[tKey(x)]; return q && !q.err && (q.cur || "?") === c ? [String(x.s).toUpperCase(), q.p * (x.q || 0)] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]), t = items.reduce((a, [, v]) => a + v, 0) || 1, bar = tEl("div", null, "t-alloc");
    items.forEach(([n, v], i) => { const s = tEl("i"); s.style.width = (v / t * 100) + "%"; s.style.background = `hsl(${(205 + i * 47) % 360} 55% ${58 - Math.min(i, 3) * 4}%)`; s.title = n + " " + (v / t * 100).toFixed(1).replace(".", ",") + " %"; bar.append(s); }); return bar; });
  b.replaceChildren(...(Object.keys(sums).length ? [tot, ...bars] : []), ...rows);
}
function tradeRender() { tradeRenderMarket(); tradeRenderWatch(); tradeRenderPort(); try { fitPanel?.(); } catch {} }
async function tradeTick(force) {
  if (tradeBusy || !(page === "Trading" || (isCustom(page) && TRADE_IDS.some((id) => !hiddenSet.has(id)))) || !tradeCfg.on) return;
  if (!force && Date.now() - tradeAt < tradeCfg.every * 1000) return;
  tradeBusy = true; tradeAt = Date.now();
  try { tradeData = await window.jarvis.tradeData(); } catch { tradeData = { ts: Date.now(), q: {}, m: {}, err: "Kurse konnten nicht geladen werden." }; }
  tradeBusy = false; tradeRender();
}
setInterval(() => tradeTick(false), 5000);
function tradeLoadCfg(c) {
  tradeCfg = { on: c.tradeOn !== false, cur: c.tradeCur === "eur" ? "eur" : "usd", every: [30, 60, 300].includes(c.tradeEvery) ? c.tradeEvery : 60, watch: Array.isArray(c.tradeWatch) ? c.tradeWatch : TRADE_DEFAULT_WATCH.slice(), port: Array.isArray(c.tradePort) ? c.tradePort : [], stock: c.tradeStock === "finnhub" ? "finnhub" : "yahoo" };
  if (!Array.isArray(c.tradeWatch)) window.jarvis.setConfig({ tradeWatch: tradeCfg.watch });
  const set = (id, v) => { const e = $(id); if (e) { if (e.type === "checkbox") e.checked = !!v; else e.value = v; } };
  set("setTradeOn", tradeCfg.on); set("setTradeCur", tradeCfg.cur); set("setTradeEvery", String(tradeCfg.every)); set("setTradeStock", tradeCfg.stock);
  set("setTradeFng", c.tradeFng !== false); set("setTradeDom", c.tradeDom !== false); set("setTradeHalv", c.tradeHalv !== false);
  set("setTradeWatch", tradeCfg.watch.map((x) => x.s + " " + (x.t === "c" ? "krypto" : "aktie")).join("\n"));
  set("setTradePort", tradeCfg.port.map((x) => `${x.s} ${x.t === "c" ? "krypto" : "aktie"} ${String(x.q ?? 0).replace(".", ",")} ${String(x.c ?? 0).replace(".", ",")}`).join("\n"));
}
function tradeParse(txt, pos) {
  const out = [], seen = new Set();
  for (const line of String(txt || "").split(/\r?\n/)) {
    const p = line.trim().split(/\s+/); if (!p[0]) continue; const s = p[0].toUpperCase(); if (!/^[A-Z0-9.^=\-]{1,20}$/.test(s)) continue;
    const t = /^(a|aktie|s|stock|etf|index)/i.test(p[1] || "") ? "s" : "c", n = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) && x >= 0 ? x : 0; };
    const e = pos ? { s, t, q: n(p[2]), c: n(p[3]) } : { s, t }; if (!seen.has(tKey(e)) && out.length < 60) { seen.add(tKey(e)); out.push(e); }
  }
  return out;
}
document.body.append($("tAdd")); // ganz nach oben im Dokument: sonst liegt der Dialog im Panel (durchklickbar, unter Kugel und Leiste)
function tradeAdd(mode, edit) {
  tradeAddMode = mode; tradeEditKey = edit ? tKey(edit) : ""; $("tAdd").hidden = false; $("tAddErr").textContent = ""; $("tAddForm").reset();
  const pos = mode === "pos"; for (const l of $("tAdd").querySelectorAll(".t-pos")) l.hidden = !pos;
  $("tAddDel").hidden = !edit; $("tAddOk").textContent = edit ? "Speichern" : "Hinzufügen"; $("tAddTitle").textContent = edit ? "Position bearbeiten" : pos ? "Position hinzufügen" : mode === "s" ? "Aktie zur Watchlist" : "Krypto zur Watchlist"; $("tAddType").value = edit ? edit.t : mode === "s" ? "s" : "c"; if (edit) { $("tAddSym").value = edit.s; $("tAddQty").value = edit.q ?? ""; $("tAddCost").value = edit.c || ""; } $("tAddSym").focus();
}
$("tWatchAddC").addEventListener("click", () => tradeAdd("c")); $("tWatchAddS").addEventListener("click", () => tradeAdd("s")); $("tPortAdd").addEventListener("click", () => tradeAdd("pos"));
$("tAddCancel").addEventListener("click", () => { $("tAdd").hidden = true; }); $("tAddX").addEventListener("click", () => { $("tAdd").hidden = true; });
$("tAddDel").addEventListener("click", () => { if (tradeEditKey) { tradeCfg.port = tradeCfg.port.filter((x) => tKey(x) !== tradeEditKey); window.jarvis.setConfig({ tradePort: tradeCfg.port }); } $("tAdd").hidden = true; tradeRender(); tradeTick(true); });
$("tAddForm").addEventListener("submit", (e) => {
  e.preventDefault(); const s = $("tAddSym").value.trim().toUpperCase(), t = $("tAddType").value;
  if (!/^[A-Z0-9.^=\-]{1,20}$/.test(s)) { $("tAddErr").textContent = "Kürzel ungültig (Buchstaben, Ziffern, . ^ = -)."; return; }
  if (tradeAddMode === "pos") {
    const q = parseFloat($("tAddQty").value), c = parseFloat($("tAddCost").value); if (!(q > 0)) { $("tAddErr").textContent = "Bitte eine Menge größer 0 eintragen."; return; }
    tradeCfg.port = [...tradeCfg.port.filter((x) => tKey(x) !== t + ":" + s && tKey(x) !== tradeEditKey), { s, t, q, c: c > 0 ? c : 0 }].slice(0, 60); window.jarvis.setConfig({ tradePort: tradeCfg.port });
  } else { if (!tradeCfg.watch.some((x) => tKey(x) === t + ":" + s)) tradeCfg.watch = [...tradeCfg.watch, { s, t }].slice(0, 60); window.jarvis.setConfig({ tradeWatch: tradeCfg.watch }); }
  $("tAdd").hidden = true; tradeRender(); tradeTick(true);
});
$("tAdd").addEventListener("pointerdown", (e) => { if (e.target === $("tAdd")) $("tAdd").hidden = true; });
$("tAdd").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") $("tAdd").hidden = true; });
// Einstellungen
for (const [id, key, conv] of [["setTradeOn", "tradeOn", (e) => e.checked], ["setTradeCur", "tradeCur", (e) => e.value], ["setTradeEvery", "tradeEvery", (e) => +e.value], ["setTradeStock", "tradeStock", (e) => e.value], ["setTradeFng", "tradeFng", (e) => e.checked], ["setTradeDom", "tradeDom", (e) => e.checked], ["setTradeHalv", "tradeHalv", (e) => e.checked]])
  $(id).addEventListener("change", (e) => { window.jarvis.setConfig({ [key]: conv(e.target) }); tradeCfg.on = $("setTradeOn").checked; tradeCfg.every = +$("setTradeEvery").value; tradeCfg.cur = $("setTradeCur").value; tradeCfg.stock = $("setTradeStock").value; if (key === "tradeOn") { try { applyMiningOn(); } catch {} } tradeAt = 0; tradeData = null; tradeRender(); tradeTick(true); });
$("setFinnhub").addEventListener("change", (e) => { window.jarvis.setConfig({ finnhubKey: e.target.value.trim() }); e.target.value = ""; try { notice("Finnhub-Schlüssel gespeichert."); } catch {} tradeData = null; tradeTick(true); });
$("setTradeSave").addEventListener("click", () => { tradeCfg.watch = tradeParse($("setTradeWatch").value, false); tradeCfg.port = tradeParse($("setTradePort").value, true); window.jarvis.setConfig({ tradeWatch: tradeCfg.watch, tradePort: tradeCfg.port }); tradeData = null; tradeRender(); tradeTick(true); try { notice("Listen gespeichert."); } catch {} });
$("setTradeBots").addEventListener("click", () => window.jarvis.openUrl("https://github.com/topics/trading-bot"));
window.jarvis.getConfig().then(tradeLoadCfg).catch(() => {});
