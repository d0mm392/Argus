// Tagesbriefing: baut aus den schon geladenen Daten einen kurzen Text (Karte und Sprache). Keine eigenen Abfragen, keine Konten.
const WX = [[0, "klar"], [3, "wolkig"], [48, "neblig"], [57, "Nieselregen"], [67, "Regen"], [77, "Schnee"], [82, "Regenschauer"], [86, "Schneeschauer"], [99, "Gewitter"]];
const wxWord = (c) => (WX.find((x) => c <= x[0]) || [0, ""])[1];
const r0 = (n) => Math.round(n);
const money = (n, cur) => (cur === "eur" ? "" : "") + r0(n).toLocaleString("de-DE") + (cur === "eur" ? " Euro" : " Dollar");
const PARTS = ["weather", "btc", "mining", "update", "headlines"];
// Wichtigste Meldungen: Weltgeschehen und Branchen-Einschnitte vor Kursbewegungen. Reine Stichwort-Wertung, kein KI-Aufruf.
const HIGH = /anschlag|terror|attentat|krieg|angriff|explosion|tote\b|getötet|erdbeben|überschwemmung|flut|katastrophe|evakuier|notstand|rücktritt|geisel|cyberangriff|hackerangriff|sanktion|invasion|raketen|amok|unglück|absturz|stromausfall|pandemie/i;
const BRANCH = /\bsec\b|etf|verbot|regulier|zulassung|halving|insolvenz|pleite|festgenommen|beschlagnahm|miner|mining|hashrate|difficulty|steuer|gesetz|börsenaufsicht|hack\b/i;
const NOISE = /\bpreis\b|kurs|prozent|%|kursziel|prognose|analyst|steigt|fällt|sinkt|rally|marke|chart|dollar|euro\b/i;
function topNews(items, n = 3, now = Date.now()) {
  const seen = [], scored = [];
  for (const it of items || []) {
    const t = typeof it === "string" ? { title: it, ts: 0 } : it; if (!t.title) continue;
    const age = t.ts ? (now - t.ts) / 36e5 : 0; if (age > 36) continue;
    let s = 0; if (HIGH.test(t.title)) s += 6; if (BRANCH.test(t.title)) s += 3; if (NOISE.test(t.title) && !HIGH.test(t.title)) s -= 4;
    if (t.cat === "welt") s += 1; s += Math.max(0, 2 - age / 12);
    const w = new Set(t.title.toLowerCase().split(/\W+/).filter((x) => x.length > 4));
    if (seen.some((o) => [...w].filter((x) => o.has(x)).length >= 3)) continue; // dieselbe Meldung von zwei Quellen
    seen.push(w); scored.push([s, t.title]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
}

// d: { name, hour, wx, btc, cur, port, farm, events, mineDay, pc, update, news }
function build(d, opts = {}) {
  const long = opts.len === "long", on = new Set(opts.parts || PARTS), cards = [], say = [];
  const h = d.hour;
  const hello = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
  say.push(hello + (d.name ? ", " + d.name : "") + ".");
  if (on.has("weather") && d.wx?.cur && d.wx.cur.temp != null) {
    const t = d.wx.days?.[0], c = d.wx.cur;
    let s = `${r0(c.temp)} Grad, ${wxWord(c.code ?? 0)}`;
    if (t && t.max != null) s += `, heute bis ${r0(t.max)} Grad` + (t.rain >= 40 ? `, Regenrisiko ${r0(t.rain)} Prozent` : "");
    cards.push(["Wetter", s]); say.push("Wetter: " + s + ".");
    if (long && d.wx.days?.[1]) { const m = d.wx.days[1]; if (m.max != null) { const s2 = `morgen ${r0(m.min ?? m.max)} bis ${r0(m.max)} Grad, ${wxWord(m.code ?? 0)}`; cards.push(["Morgen", s2]); say.push("Morgen: " + s2 + "."); } }
  }
  if (on.has("btc") && d.btc?.[d.cur]?.price) {
    const q = d.btc[d.cur], ch = q.change;
    let s = `Bitcoin ${money(q.price, d.cur)}` + (ch != null ? `, ${ch >= 0 ? "plus" : "minus"} ${Math.abs(ch).toFixed(1).replace(".", ",")} Prozent in 24 Stunden` : "");
    cards.push(["Bitcoin", s]); say.push(s + ".");
    if (long && d.port) { const p = `Portfolio ${money(d.port.value, d.cur)}` + (d.port.pl != null ? `, ${d.port.pl >= 0 ? "im Plus" : "im Minus"} mit ${money(Math.abs(d.port.pl), d.cur)}` : ""); cards.push(["Portfolio", p]); say.push(p + "."); }
  }
  if (on.has("mining") && (d.farm || d.mineDay != null)) {
    const bits = [];
    if (d.farm) {
      const night = (d.events || []).filter((e) => e[2]);
      bits.push(d.farm.total ? `${d.farm.on} von ${d.farm.total} Minern online` : "keine Miner gemeldet");
      bits.push(night.length ? `${night.length} Ausfall${night.length > 1 ? "meldungen" : "meldung"} in den letzten 24 Stunden` : "keine Ausfälle in den letzten 24 Stunden");
      if (long && night.length) bits.push("zuletzt: " + String(night[0][1]).replace(/[()]/g, ""));
    }
    if (d.mineDay != null) bits.push(`Ertrag 24 Stunden: ${Math.round(d.mineDay).toLocaleString("de-DE")} Sats`);
    const s = bits.join(", "); cards.push(["Mining", s]); say.push("Mining: " + s + ".");
  }
  if (on.has("update") && d.update) { cards.push(["Argus", d.update]); say.push(d.update + "."); }
  if (on.has("headlines") && d.news?.length) {
    const list = topNews(d.news, long ? 5 : 3); cards.push(["Nachrichten", list.join(" · ")]);
    say.push("Schlagzeilen: " + list.map((x) => x.replace(/[.!?]+$/, "")).join(". ") + ".");
  }
  if (cards.length === 0) say.push("Keine Daten ausgewählt.");
  return { title: hello + (d.name ? ", " + d.name : ""), cards, speech: say.join(" ") };
}
module.exports = { build, PARTS, topNews };
