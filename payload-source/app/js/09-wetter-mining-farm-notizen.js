"use strict";
  // ---------- Wetter am Standort (Open-Meteo) ----------
  // Seitenwechsel für Blöcke mit mehreren Quellen: alle 20 s weiter, Maus darauf hält an, Punkte wählen direkt
  function makePager(boxId, pgId, render) {
    const pg = { i: 0, n: 1, t: Date.now(), hold: false };
    $(boxId).addEventListener("mouseenter", () => { pg.hold = true; }); $(boxId).addEventListener("mouseleave", () => { pg.hold = false; pg.t = Date.now(); });
    // Mausrad über den Punkten blättert
    $(pgId).addEventListener("wheel", (e) => { if (pg.n < 2) return; e.preventDefault(); e.stopPropagation(); pg.i = (pg.i + (e.deltaY > 0 ? 1 : pg.n - 1)) % pg.n; pg.t = Date.now(); render(); }, { passive: false });
    pg.dots = (bad = [], names = []) => { $(pgId).replaceChildren(...(pg.n > 1 ? Array.from({ length: pg.n }, (_, k) => { const d = document.createElement("i"); d.className = k === pg.i ? "on" : bad[k] ? "bad" : ""; if (names[k]) d.title = names[k];
      d.addEventListener("click", (e) => { e.stopPropagation(); pg.i = k; pg.t = Date.now(); render(); }); return d; }) : [])); };
    pg.fit = (n) => { pg.n = Math.max(1, n); if (pg.i >= pg.n) pg.i = 0; };
    setInterval(() => { if (pg.n > 1 && !pg.hold && Date.now() - pg.t >= 20e3 && !document.body.classList.contains("arrange")) { pg.i = (pg.i + 1) % pg.n; pg.t = Date.now(); render(); } }, 1000);
    return pg;
  }
  let wxData = null, wxOn = true;
  // WMO-Wettercode → Symbol und Text
  function wmo(c, day = true) {
    if (c == null) return ["·", "unbekannt"];
    if (c === 0) return [day ? "☀️" : "🌙", "klar"];
    if (c === 1) return [day ? "🌤️" : "🌙", "überwiegend klar"];
    if (c === 2) return ["⛅", "teils bewölkt"];
    if (c === 3) return ["☁️", "bedeckt"];
    if (c === 45 || c === 48) return ["🌫️", "Nebel"];
    if (c >= 51 && c <= 57) return ["🌦️", "Nieselregen"];
    if (c >= 61 && c <= 67) return ["🌧️", c >= 66 ? "gefrierender Regen" : c >= 65 ? "starker Regen" : "Regen"];
    if (c >= 71 && c <= 77) return ["🌨️", "Schnee"];
    if (c >= 80 && c <= 82) return ["🌦️", c === 82 ? "heftige Schauer" : "Schauer"];
    if (c === 85 || c === 86) return ["🌨️", "Schneeschauer"];
    if (c >= 95) return ["⛈️", "Gewitter"];
    return ["☁️", "bewölkt"];
  }
  const DOW = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  function renderWx() {
    $("wx").hidden = !wxOn; if (!wxOn) return fitPanel?.();
    const places = wxData?.places || []; wxPg.fit(1 + places.length); wxPg.dots();
    const pl = wxPg.i > 0 ? places[wxPg.i - 1] : null;
    const w = pl ? { data: pl.data, error: pl.error, loc: { city: pl.name, src: "ort" } } : wxData, c = w?.data?.cur, loc = w?.loc;
    $("wxPlace").textContent = "Wetter" + (loc?.city ? " · " + loc.city : "");
    const src = $("wxSrc"); src.textContent = !loc || loc.src === "ort" ? "" : loc.src === "windows" ? "Ortung" : "über Internet"; src.title = loc?.src === "windows" ? `Windows-Ortung, ± ${loc.acc} m` : "Grob über deinen Internet-Anschluss (mit VPN der VPN-Ort)";
    if (c) {
      const [ic, txt] = wmo(c.code, c.day), el = document.createElement("div"), i = document.createElement("span"), b = document.createElement("b");
      i.className = "ic"; i.textContent = ic; b.textContent = Math.round(c.temp) + " °C";
      el.innerHTML = "<span></span><span></span><span></span>";
      el.children[0].textContent = txt; el.children[1].textContent = `gefühlt ${Math.round(c.feels)} °C · ${c.hum} % Feuchte`; el.children[2].textContent = `Wind ${Math.round(c.wind)} km/h` + (c.gust > c.wind + 15 ? `, Böen ${Math.round(c.gust)}` : "");
      $("wxNow").replaceChildren(i, b, el);
      $("wxHours").replaceChildren(...(w.data.hours || []).filter((_, k) => k % 2 === 0).slice(0, 6).map((h) => { const d = document.createElement("div"); d.innerHTML = "<span></span><i></i><b></b><em></em>";
        d.children[0].textContent = h.t; d.children[1].textContent = wmo(h.code, h.day)[0]; d.children[2].textContent = Math.round(h.temp) + "°"; d.children[3].textContent = h.rain >= 20 ? h.rain + " %" : ""; return d; }));
      $("wxDays").replaceChildren(...(w.data.days || []).slice(0, 4).map((x, k) => { const d = document.createElement("div"); d.innerHTML = "<span></span><i></i><b></b><em></em>";
        d.children[0].textContent = k === 0 ? "Heute" : DOW[new Date(x.date + "T12:00").getDay()]; d.children[1].textContent = wmo(x.code)[0]; d.children[2].textContent = `${Math.round(x.min)}° / ${Math.round(x.max)}°`; d.children[3].textContent = x.rain >= 20 ? x.rain + " %" : ""; d.title = `Sonne ${x.sunrise}–${x.sunset}`; return d; }));
    } else { $("wxNow").replaceChildren(); $("wxHours").replaceChildren(); $("wxDays").replaceChildren(); }
    $("wxHint").textContent = !w ? "Suche Standort…" : w.error ? w.error + (w.error.startsWith("Standort") ? ". Windows-Einstellungen → Datenschutz → Standort: Ortung und „Desktop-Apps Zugriff erlauben“ einschalten." : "")
      : "";
    fitPanel?.();
  }
  const wxPg = makePager("wx", "wxPg", () => renderWx());
  $("setWxPlaces").addEventListener("change", (e) => { window.jarvis.setConfig({ wxPlaces: e.target.value.trim() }); });
  window.jarvis.onWeather?.((m) => { wxData = m; for (const t of temps) if (t.key === "wx") t.val = undefined; renderWx(); });
  $("setWxOn").addEventListener("change", (e) => { wxOn = e.target.checked; renderWx(); window.jarvis.setConfig({ weatherOn: wxOn }); });
  window.jarvis.getConfig?.().then((c) => { wxOn = c.weatherOn !== false; $("setWxOn").checked = wxOn; $("setWxPlaces").value = c.wxPlaces || ""; if (c.weather?.ts || c.weather?.error) wxData = c.weather; renderWx(); });

  // ---------- Mining (eigener OCEAN-Pool, Bitcoin-Netz) und Weltuhren ----------
  let mineAll = false; try { mineAll = localStorage.getItem("jarvisMineAll") === "1"; } catch {}
  let mineOn = true, mineAddr = "", mineData = null, clocksOn = true, clocks = [];
  const fmtHash = (h) => { if (h == null) return "–"; const u = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"]; let i = 0; while (h >= 1000 && i < u.length - 1) { h /= 1000; i++; } return h.toFixed(h >= 100 ? 0 : h >= 10 ? 1 : 2).replace(".", ",") + " " + u[i]; };
  const sats = (btc) => btc == null ? "–" : Math.round(btc * 1e8).toLocaleString("de-DE") + " sats";
  const money = (v, cur) => v == null ? "" : cur === "EUR" ? v.toLocaleString("de-DE", { maximumFractionDigits: v < 100 ? 2 : 0 }) + " €" : "$" + v.toLocaleString("de-DE", { maximumFractionDigits: v < 100 ? 2 : 0 });
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "gerade eben" : m < 60 ? `vor ${m} min` : m < 1440 ? `vor ${Math.round(m / 60)} h` : `vor ${Math.round(m / 1440)} T`; };
  const until = (ms) => { const m = Math.max(0, Math.round((ms - Date.now()) / 60000)); return m >= 1440 ? `${Math.floor(m / 1440)} T ${Math.round((m % 1440) / 60)} h` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const cell = (k, v, cls = "") => { const d = document.createElement("div"), a = document.createElement("small"), b = document.createElement("span"); a.textContent = k; b.textContent = v; if (cls) b.className = cls; d.append(a, b); return d; };
  function renderMine() {
    const box = $("mine"); box.hidden = !mineOn;
    if (!mineOn) return fitPanel?.();
    const pools = mineData?.pools || (mineData?.pool ? [mineData.pool] : []), pages = pools.length > 1 ? [...pools, mineTotal(pools)] : pools;
    const isBad = (x) => !!x && ((x.workers || []).some((w) => w.on === false) || (x.hr?.h3 > 0 && x.hr.m10 != null && x.hr.m10 < x.hr.h3 * 0.6));
    minePg.fit(pages.length); minePg.dots(pages.map(isBad));
    const p = pages[minePg.i] || null, n = mineData?.net, cur = btcCur === "EUR" ? "eur" : "usd", CUR = btcCur === "EUR" ? "EUR" : "USD";
    const st = $("mineState"), hint = $("mineHint");
    $("mineTitle").textContent = "Mining · OCEAN" + (pools.length > 1 && p ? " · " + p.label : "");
    // Kopf: Zustand des eigenen Minings
    if (!mineAddr) { st.textContent = "Netz"; st.dataset.health = "ok"; }
    else if (!p) { st.textContent = "Lade…"; st.dataset.health = "ok"; }
    else {
      const off = (p.workers || []).filter((w) => w.on === false).length, low = p.hr?.h3 > 0 && p.hr.m10 != null && p.hr.m10 < p.hr.h3 * 0.6;
      st.textContent = p.error ? "OCEAN nicht erreichbar" : off ? `${off} Worker offline` : low ? "Hashrate niedrig" : "Alles läuft";
      st.dataset.health = p.error ? "warn" : off || low ? "crit" : "ok";
    }
    // Hashrate groß
    const hr = $("mineHr");
    if (p?.hr) {
      hr.replaceChildren(...[["10 min", p.hr.m10], ["3 h", p.hr.h3], ["24 h", p.hr.h24]].map(([k, v]) => {
        const d = document.createElement("div"), a = document.createElement("small"), b = document.createElement("b"); a.textContent = k; b.textContent = fmtHash(v);
        if (k === "10 min" && p.hr.h3 > 0 && v != null && v < p.hr.h3 * 0.6) b.className = "low"; d.append(a, b); return d; }));
    } else hr.replaceChildren();
    // Werte: eigene Einnahmen und Netz
    const g = [];
    if (p) {
      const on = (p.workers || []).filter((w) => w.on === true).length, unk = (p.workers || []).every((w) => w.on == null), all = p.workers?.length ?? p.active;
      if (all != null) g.push(cell("Worker", p.workers && !unk ? `${on} / ${all} online` : `${p.active ?? all} aktiv`));
      if (p.unpaid != null) g.push(cell("Unbezahlt", sats(p.unpaid) + (n?.price?.[cur] ? " · " + money(p.unpaid * n.price[cur], CUR) : "")));
      if (p.nextBlock != null) g.push(cell("Nächster Block", sats(p.nextBlock)));
      if (p.day != null && p.dayH > 0.2) g.push(cell(p.dayH >= 23.5 ? "Ertrag 24 h" : `Ertrag seit ${Math.max(1, Math.round(p.dayH))} h`, sats(p.day / 1e8) + (n?.price?.[cur] ? " · " + money(p.day / 1e8 * n.price[cur], CUR) : "")));
      if (p.lastShare) g.push(cell("Letzter Share", ago(p.lastShare)));
    }
    if (n) {
      if (n.hashprice?.[cur] != null) g.push(cell("Hashprice", money(n.hashprice[cur], CUR) + " /PH/Tag"));
      if (n.adj?.change != null) g.push(cell("Difficulty", `${n.adj.change > 0 ? "+" : ""}${n.adj.change.toFixed(2).replace(".", ",")} %` + (n.adj.eta ? ` in ${until(n.adj.eta)}` : ""), n.adj.change > 0 ? "up" : "down"));
      if (n.fees) g.push(cell("Gebühren", `${n.fees.fast} / ${n.fees.hour} sat/vB`));
      if (n.netHash) g.push(cell("Netz", fmtHash(n.netHash) + (n.height ? " · #" + n.height.toLocaleString("de-DE") : "")));
    }
    $("mineGrid").replaceChildren(...g);
    // 24-Stunden-Verlauf der Hashrate (alle 5 Minuten ein Punkt)
    const hv = p?.hist || [], sp = $("mineSpark"); sp.classList.toggle("empty", hv.length < 3);
    if (hv.length >= 3) { const mx = Math.max(...hv) * 1.05 || 1, mn = Math.min(...hv) * 0.9, k = 300 / (hv.length - 1), Y = (v) => (32 - (v - mn) / (mx - mn || 1) * 30).toFixed(1);
      const pts = hv.map((v, i) => (i * k).toFixed(1) + "," + Y(v)).join(" "); sp.children[0].setAttribute("points", pts); sp.children[1].setAttribute("points", "0,34 " + pts + " 300,34");
      sp.setAttribute("title", "Hashrate der letzten " + Math.round(hv.length * 5 / 60) + " h"); }
    // Worker einzeln, Ausfälle zuerst
    // Kompakt: Ausfälle und Ausreißer (unter 80 % vom Median) immer, der Rest erst nach Klick auf die Zusammenfassung
    const ws = [...(p?.workers || [])].sort((a, b) => (a.on === false) - (b.on === false) ? (b.on === false) - (a.on === false) : b.h3 - a.h3);
    const hs = ws.filter((w) => w.on !== false && w.h3 > 0).map((w) => w.h3).sort((a, b) => a - b), med = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
    const odd = (w) => w.on === false || (med > 0 && w.h3 > 0 && w.h3 < med * 0.8);
    const many = ws.length > 8, shown = !many || mineAll ? ws : ws.filter(odd), rest = ws.length - shown.length;
    const items = shown.slice(0, 80).map((w) => { const li = document.createElement("li"), i = document.createElement("i"), v = document.createElement("span");
      li.className = w.on === false ? "off" : odd(w) ? "weak" : ""; i.textContent = w.name; v.textContent = w.on === false ? "offline" : w.h3 || w.m1 ? fmtHash(w.h3 || w.m1) : "–"; li.title = w.name + (odd(w) && w.on !== false ? " · unter 80 % vom Durchschnitt" : ""); li.append(i, v); return li; });
    if (many) { const li = document.createElement("li"); li.className = "more"; li.textContent = mineAll ? "Weniger zeigen ▴" : rest === ws.length ? `Alle ${ws.length} Worker laufen normal · zeigen ▾` : `${rest} weitere laufen normal · zeigen ▾`;
      li.addEventListener("click", (e) => { e.stopPropagation(); mineAll = !mineAll; try { localStorage.setItem("jarvisMineAll", mineAll ? "1" : ""); } catch {} renderMine(); }); items.push(li); }
    $("mineW").replaceChildren(...items);
    hint.textContent = p?.workersUnknown ? "Worker-Status konnte nicht gelesen werden, OCEAN liefert ein unbekanntes Format. Ein Beispiel liegt im Argus-Datenordner als ocean-worker-beispiel.json" : !mineAddr ? "OCEAN-Pool-Adresse unter Einstellungen → Mining eintragen, dann zeigt Argus hier deine Hashrate und Worker." : p?.error ? p.error : !n && !p ? "Hole Daten…" : "";
    fitPanel?.();
  }
  // Seite „Gesamt“ über alle Wallets
  function mineTotal(pools) {
    const sum = (f) => { const v = pools.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    return { label: "Gesamt", hr: { m10: sum((x) => x.hr?.m10), h3: sum((x) => x.hr?.h3), h24: sum((x) => x.hr?.h24) }, workers: pools.flatMap((x) => x.workers || []), active: sum((x) => x.active),
      unpaid: sum((x) => x.unpaid), nextBlock: sum((x) => x.nextBlock), day: sum((x) => x.day), dayH: Math.min(...pools.map((x) => x.dayH || 0)),
      hist: (() => { const n2 = Math.min(...pools.map((x) => (x.hist || []).length)); return n2 >= 3 ? Array.from({ length: n2 }, (_, i) => pools.reduce((a, x) => a + x.hist[x.hist.length - n2 + i], 0)) : []; })(), lastShare: Math.max(0, ...pools.map((x) => x.lastShare || 0)) || null,
      error: pools.every((x) => x.error) ? pools[0].error : "", workersUnknown: pools.some((x) => x.workersUnknown) };
  }
  const minePg = makePager("mine", "minePg", () => renderMine());
  window.jarvis.onMining?.((m) => { mineData = m; renderMine(); renderMOver?.(); renderMineFx?.(); try { renderFarm(); } catch {} });
  // ---------- Farm aus Foreman: Überblick, Auffällige zuerst (offline, heiß ab 85 °C, Fehler, Hashrate unter 80 % vom Median) ----------
  let farmData = null, farmOn = false, farmAll = false; try { farmAll = localStorage.getItem("jarvisFarmAll") === "1"; } catch {}
  // Ansicht: „blaettern“ = ein Fenster, Seiten wechseln; „standort“ = je Standort ein eigenes Fenster;
  // „konto“ = je Foreman-Konto ein Fenster (mehrere Standorte eines Kontos zusammen, aufgeschlüsselt). Fenster entstehen nach dem, was gerade da ist (bis 4)
  let fmView = "blaettern";
  const FARM_N = 4, FARM_IDS = ["farm", "farm2", "farm3", "farm4"];
  for (let k = 1; k < FARM_N; k++) { // weitere Farm-Fenster als Kopie des ersten, Kennungen mit eigener Nummer
    const c = $("farm").cloneNode(true); c.id = FARM_IDS[k]; c.setAttribute("aria-label", "Farm " + (k + 1)); c.hidden = true;
    for (const e of c.querySelectorAll("[id]")) e.id = e.id.replace(/^farm/, FARM_IDS[k]);
    FARM_IDS.slice(0, k).reduce((a, id) => $(id), null).after(c);
  }
  function farmGroups(accs) {
    if (fmView === "standort") return accs;
    const by = new Map(); for (const a of accs) (by.get(a.client) || by.set(a.client, []).get(a.client)).push(a);
    return [...by.values()].map((l) => {
      if (l.length === 1) return l[0];
      const hs = l.map((a) => a.hist || []), n = Math.min(...hs.map((h) => h.length)), hist = n ? Array.from({ length: n }, (_, k) => hs.reduce((t, h) => { const x = h[h.length - n + k]; return [t[0] + x[0], t[1] + x[1], t[2] + x[2]]; }, [0, 0, 0])) : [];
      return { name: (l[0].name || "").split(" · ")[0] || l[0].client, total: true, parts: l, hist, miners: l.filter((a) => !a.pxOff).flatMap((a) => (a.miners || []).map((m) => ({ ...m, name: `${a.pxName || a.name} · ${m.name}` }))), error: l.every((a) => a.error && !a.miners?.length) ? l[0].error : "" };
    });
  }
  let fmTotC = null, fmTotK = null, fmTotM = null, oceanInTotal = true;
  const oceanPools = () => mineOn ? mineData?.pools || (mineData?.pool ? [mineData.pool] : []) : [];
  // OCEAN-Pool-Adressen (Anlagen ohne Foreman) als eigene Anlage in den Farm-Fenstern: Worker statt Miner, Pool-Hashrate
  const oceanAccs = () => oceanInTotal ? oceanPools().map((p) => { const ws = (p.workers || []).map((w) => ({ name: w.name, on: w.on, hr: w.h3 || w.m1 || 0, algo: "sha" })), on = ws.filter((w) => w.on !== false).length;
    return { name: (p.label || "OCEAN") + " · OCEAN", client: "ocean:" + p.addr, ocean: true, miners: ws, hist: (p.hist || []).map((v) => [v, on, ws.length]), error: !ws.length ? p.error || "OCEAN lädt…" : "" }; }) : [];
  function renderFarm() {
    const accs = [...(farmData?.accounts || []).filter((a) => !a.hidden), ...(farmData ? oceanAccs() : [])];
    fmPxRows();
    const wins = farmOn && fmView !== "blaettern" && accs.length > 1 ? farmGroups(accs) : null;
    FARM_IDS.forEach((id, k) => { $(id).hidden = !farmOn || (k > 0 && !(wins && k < Math.min(FARM_N, wins.length))); });
    if (!farmOn) return fitPanel?.();
    if (!wins) renderFarmBox("farm", accs, null, farmPg);
    else wins.slice(0, FARM_N).forEach((w, k) => renderFarmBox(FARM_IDS[k], accs, k === FARM_N - 1 && wins.length > FARM_N ? wins.slice(FARM_N - 1) : [w], k === FARM_N - 1 ? farm4Pg : null));
    if (wins) for (const id of FARM_IDS.slice(1)) if (!$(id).hidden && freeLayout && !freeLayout[id]) applyLayout(); // neues Fenster bekommt einen freien Platz
    fitPanel?.();
  }
  // ein Farm-Fenster zeichnen: pages = die Seiten dieses Fensters (null = wie bisher alle plus „Gesamt“), pg = Blätterer oder keiner
  function renderFarmBox(P, accs, own, pg) {
    const pages = own || (accs.length > 1 ? [...accs, { name: "Gesamt", total: true, miners: accs.filter((a) => !a.pxOff).flatMap((a) => (a.miners || []).map((m) => ({ ...m, name: `${a.name} · ${m.name}` }))), error: accs.every((a) => a.error && !a.miners?.length) ? accs[0].error : "" }] : accs);
    const isBad = (a) => !!a.pxOff || !!(a.error && !a.miners?.length) || (a.miners || []).some((m) => m.on === false);
    let f;
    if (pg) { pg.fit(pages.length); pg.dots(pages.map(isBad), pages.map((p) => p.name)); f = farmData ? pages[pg.i] || null : null; }
    else { $(P + "Pg").replaceChildren(); f = farmData ? pages[0] || null : null; }
    const ms = f?.miners || [], st = $(P + "State");
    const ttl = (accs.length > 1 || P !== "farm") && f ? f.name : accs[0]?.name && accs.length === 1 && accs[0].name !== "Farm 1" ? accs[0].name : "Foreman";
    $(P + "Title").textContent = "Farm · " + ttl; $(P + "Title").title = ttl;
    // schwach = unter 80 % vom Nennwert des Modells (aus dem Namen, z. B. „(234T)“), sonst vom Median gleicher Modelle
    const meds = new Map(); for (const m of ms) if (m.on !== false && m.hr > 0) { const k = m.type || m.algo || ""; (meds.get(k) || meds.set(k, []).get(k)).push(m.hr); }
    for (const [k, v] of meds) { v.sort((a, b) => a - b); meds.set(k, v.length >= 3 ? v[Math.floor(v.length / 2)] : 0); }
    // Vergleichswert: die Mitte der gleichen Modelle (ab 3 laufenden), sonst der Nennwert aus dem Namen.
    // So gilt ein Miner nur als schwach, wenn er hinter seinen Artgenossen zurückliegt (Farm im Sparmodus: alle laufen normal bei 60-70 % vom Nennwert)
    const ref = (m) => meds.get(m.type || m.algo || "") || m.nom || 0;
    const pct = (m) => ref(m) && m.hr > 0 ? Math.round((m.hr / ref(m)) * 100) : null;
    const why = (m) => m.on === false ? "offline" : m.err ? m.err : m.temp >= 85 ? Math.round(m.temp) + " °C" : pct(m) != null && pct(m) < 80 ? `${fmtHash(m.hr)} · ${pct(m)} %` : "";
    const off = ms.filter((m) => m.on === false).length, hot = ms.filter((m) => m.temp >= 85).length;
    st.textContent = !f ? "Lade…" : f.pxOff ? "Pickaxe offline" : f.error && !ms.length ? "Foreman nicht erreichbar" : off ? `${off} offline` : hot ? `${hot} heiß` : "Alles läuft";
    st.dataset.health = f?.pxOff ? "crit" : !f || (f.error && !ms.length) ? "warn" : off || hot ? "crit" : "ok";
    const g = [];
    if (f?.pxOff) { g.push(cell("Miner", `0 / ${ms.length} · keine Verbindung`, "up")); if (f.pxVer) g.push(cell("Pickaxe", String(f.pxVer))); }
    else if (ms.length) {
      const on = ms.filter((m) => m.on === true).length, ts = ms.map((m) => m.temp).filter((v) => v != null), fs2 = ms.map((m) => m.fan).filter((v) => v != null);
      const sumHr = (l) => l.reduce((a, m) => a + (m.on !== false && m.hr ? m.hr : 0), 0), scr = ms.filter((m) => m.algo === "scrypt"), tot = sumHr(ms.filter((m) => m.algo !== "scrypt"));
      // Prozent nur über Miner mit bekanntem Nennwert (sonst stand z. B. 253 % da: Hashrate aller, Nennwert nur einiger).
      // Offline-Miner zählen beim Nennwert mit (sonst zeigte eine Farm mit 25 Ausfällen trotzdem 99 %)
      const withNom = ms.filter((m) => m.algo !== "scrypt" && m.nom), nomTot = withNom.reduce((a, m) => a + m.nom, 0), hrNom = withNom.reduce((a, m) => a + (m.on !== false && m.hr > 0 ? m.hr : 0), 0);
      g.push(cell("Miner", `${on} / ${ms.length} online`, on < ms.length ? "up" : ""));
      if (tot) g.push(cell("Hashrate", fmtHash(tot) + (nomTot && hrNom >= tot * 0.5 ? ` · ${Math.round((hrNom / nomTot) * 100)} %` : "")));
      if (scr.length) g.push(cell(`Scrypt (${scr.length})`, fmtHash(sumHr(scr))));
      if (ts.length) { const mx = Math.max(...ts); g.push(cell("Temperatur Ø", Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) + " °C")); g.push(cell("Heißester", `${Math.round(mx)} °C · ${ms.find((m) => m.temp === mx).name}`, mx >= 85 ? "up" : "")); }
      if (fs2.length) g.push(cell("Lüfter max", Math.round(Math.max(...fs2)).toLocaleString("de-DE") + " rpm"));
    }
    $(P + "Grid").replaceChildren(...g);
    // 24-h-Kurve der Hashrate (SHA-256) dieser Anlage bzw. aller zusammen
    const hv = (f?.total && !f.parts ? farmData?.hist : f?.hist) || [], sp = $(P + "Spark"), hs2 = hv.map((x) => x[0]); sp.classList.toggle("empty", hs2.length < 3);
    if (hs2.length >= 3) { const mx = Math.max(...hs2) * 1.05 || 1, mn = Math.min(...hs2) * 0.9, k = 300 / (hs2.length - 1), Y = (v) => (32 - (v - mn) / (mx - mn || 1) * 30).toFixed(1);
      const pts = hs2.map((v, i) => (i * k).toFixed(1) + "," + Y(v)).join(" "); sp.children[0].setAttribute("points", pts); sp.children[1].setAttribute("points", "0,34 " + pts + " 300,34");
      const lo = hv.reduce((a, x) => Math.min(a, x[1]), Infinity); sp.setAttribute("title", `Hashrate der letzten ${Math.max(1, Math.round(hv.length * 5 / 60))} h · online zwischen ${lo} und ${Math.max(...hv.map((x) => x[1]))} Minern`); }
    // Aufschlüsselung: auf „Gesamt“ je Anlage, sonst je Modell dieser Anlage
    const sub = (label, l) => { const on = l.filter((m) => m.on === true).length, sha = l.some((m) => m.algo !== "scrypt"), h = l.reduce((a, m) => a + (m.on !== false && m.hr && (m.algo !== "scrypt" || !sha) ? m.hr : 0), 0), li = document.createElement("li"), i = document.createElement("i"), v = document.createElement("span");
      i.textContent = label; v.textContent = `${on} / ${l.length}` + (h ? ` · ${fmtHash(h)}` : ""); li.className = on < l.length ? (on === 0 ? "off" : "weak") : ""; li.append(i, v); return li; };
    let subs = [];
    if (f?.total) subs = (f.parts || accs).map((a) => { if (!a.pxOff) return sub(a.name, a.miners || []); const li = sub(a.name, []); li.className = "off"; li.lastChild.textContent = `Pickaxe offline · ${(a.miners || []).length} Miner`; return li; });
    else if (f?.pxOff) subs = [];
    else if (ms.length) { const by = new Map(); for (const m of ms) { const k = (m.type || "Unbekannt").replace(/^(Bitmain\s+)?Antminer\s+/i, "").replace(/\s*\((marafw|braiins|vnish|luxos)\)/ig, ""); (by.get(k) || by.set(k, []).get(k)).push(m); }
      if (by.size > 1) subs = [...by].sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([k, l]) => sub(k, l)); }
    $(P + "Sub").replaceChildren(...subs);
    // Auffällige zuerst: schwache und heiße vor offline, höchstens 10, Rest per Klick
    const rank = (m) => m.on === false ? 2 : 1, odd = (f?.pxOff ? [] : ms.filter((m) => why(m))).sort((a, b) => rank(a) - rank(b) || (pct(a) ?? 999) - (pct(b) ?? 999));
    const list = farmAll ? [...odd, ...ms.filter((m) => !why(m))] : odd.slice(0, 10), rest = ms.length - list.length, oddMore = odd.length - Math.min(odd.length, 10);
    const items = list.slice(0, 120).map((m) => { const li = document.createElement("li"), i = document.createElement("i"), v = document.createElement("span"), w = why(m);
      li.className = m.on === false || m.err || m.temp >= 90 ? "off" : w ? "weak" : ""; i.textContent = m.name; v.textContent = w || (m.hr ? fmtHash(m.hr) + (pct(m) != null ? ` · ${pct(m)} %` : "") : m.temp != null ? Math.round(m.temp) + " °C" : "–");
      if (m.id != null) { li.classList.add("link"); li.addEventListener("click", (e) => { e.stopPropagation(); openMiner(m); }); }
      li.title = [m.name, m.type, m.hr ? fmtHash(m.hr) + (m.nom ? ` von ${fmtHash(m.nom)} Nennwert` : "") : "", m.temp != null ? Math.round(m.temp) + " °C" : "", m.fan ? m.fan + " rpm" : "", m.err].filter(Boolean).join(" · "); li.append(i, v); return li; });
    if (!f?.pxOff && (ms.length > 8 || farmAll)) { const li = document.createElement("li"); li.className = "more"; li.textContent = farmAll ? "Weniger zeigen ▴" : rest === ms.length ? `Alle ${ms.length} Miner laufen normal · zeigen ▾` : oddMore ? `${oddMore} weitere auffällig, ${rest - oddMore} normal · alle zeigen ▾` : `${rest} weitere laufen normal · zeigen ▾`;
      li.addEventListener("click", (e) => { e.stopPropagation(); farmAll = !farmAll; try { localStorage.setItem("jarvisFarmAll", farmAll ? "1" : ""); } catch {} renderFarm(); }); items.push(li); }
    $(P + "W").replaceChildren(...items);
    // die letzten 5 Ereignisse (neueste oben), mit Uhrzeit, ältere als gestern mit Datum
    const today = new Date().toDateString();
    $(P + "Ev").replaceChildren(...(fmEvOn && P === "farm" ? farmData?.events || [] : []).map(([ts, t, bad, names]) => { const li = document.createElement("li"), tm = document.createElement("time"), d = new Date(ts);
      if (names?.length) { li.classList.add("link"); li.addEventListener("click", (e) => { e.stopPropagation(); openMiner(names[0]); }); }
      tm.textContent = (d.toDateString() === today ? "" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " ") + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      li.classList.add(bad ? "bad" : "ok"); li.title = tm.textContent + " · " + t + (names?.length ? " · Klick: in Foreman öffnen" : ""); li.append(tm, document.createTextNode(t)); return li; }));
    const errs = f?.pxOff ? `Die Pickaxe ${f.pxName || ""} meldet sich nicht bei Foreman, darum fehlen alle ${ms.length} Miner. Ob die Geräte selbst laufen, sieht Foreman so nicht. In den Einstellungen unter Farm kannst du diesen Standort ausblenden.` : f?.total ? (f.parts || accs).filter((a) => a.error).map((a) => `${a.name}: ${a.error}`).join(" · ") : f?.error;
    $(P + "Hint").textContent = !farmData ? (fmList.length ? "Hole Daten von Foreman…" : "Trag in den Einstellungen unter Mining ein Foreman-Konto ein.") : !f ? "" : errs ? errs : f.note && !f.total ? f.note : !ms.length ? "Foreman meldet keine Miner. Ein Beispiel der Antwort liegt im Argus-Datenordner als foreman-beispiel.json." : "";
  }
  const farmPg = makePager("farm", "farmPg", () => renderFarm()), farm4Pg = makePager("farm4", "farm4Pg", () => renderFarm());
  window.jarvis.onFarm?.((f) => { farmData = f; renderFarm(); renderMOver(); renderMineFx(); });
  let fmEvOn = true, fmUrl = "https://dashboard.foreman.mn/dashboard/miners/{id}/details/";
  // Summen über alle sichtbaren Farmen für Anzeigen, Überblick und Mining-Kugel (je Datenstand einmal gerechnet)
  // OCEAN-Pool-Adressen ohne Foreman (z. B. Farm A) zählen mit: Worker als Miner, Pool-Hashrate (10 min) zur Hashrate
  // Leistung in kW, ab 1000 kW in MW; Energie in kWh, ab 1000 in MWh
  const nf = (v, d) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  window.fmtPower = (w) => { const kw = w / 1000; return kw >= 1000 ? nf(kw / 1000, 2) + " MW" : nf(kw, 2) + " kW"; };
  window.fmtEnergy = (kwh) => kwh >= 1000 ? nf(kwh / 1000, 2) + " MWh" : nf(kwh, kwh >= 100 ? 0 : 1) + " kWh";
  var energyD = null; const energyTick = () => window.jarvis.energyGet?.().then((e) => { energyD = e; try { renderMOver(); } catch {} }).catch(() => {}); setTimeout(energyTick, 4000); setInterval(energyTick, 5 * 60e3);
  function fmTot() {
    if (fmTotK === farmData && fmTotM === mineData && fmTotC) return fmTotC;
    fmTotK = farmData; fmTotM = mineData; const accs = (farmData?.accounts || []).filter((a) => !a.hidden), ms = accs.flatMap((a) => a.pxOff ? (a.miners || []).map((m) => ({ ...m, on: false, hr: 0, temp: null, watt: m.watt != null ? 0 : null })) : a.miners || []); // Standort ohne Verbindung (Pickaxe offline): alle Miner zählen als offline mit
    // Zähler aus dem Foreman-Dashboard (wie auf den Pickaxe-Kacheln) gehen vor der Einzel-Liste: fehlen in der Liste Miner, zählen sie mit
    let dN = 0, dOn = 0; for (const a of accs) if (a.dashN != null) { const l = a.miners || []; dN += Math.max(0, a.dashN - l.length); dOn += a.pxOff ? 0 : Math.max(0, a.dashOn - l.filter((m) => m.on !== false).length); }
    if (oceanInTotal) for (const p of oceanPools()) for (const w of p.workers || []) ms.push({ name: (p.label ? p.label + " · " : "") + w.name, on: w.on, hr: (w.h3 || w.m1 || 0), algo: "sha", ocean: true });
    if (!ms.length) return (fmTotC = null);
    const sha = ms.filter((m) => m.algo !== "scrypt" && m.on !== false && m.hr > 0), nom = ms.filter((m) => m.algo !== "scrypt" && m.nom), hot = ms.reduce((a, m) => m.temp != null && (!a || m.temp > a.temp) ? m : a, null);
    const pm = ms.filter((m) => m.watt != null), pw = pm.reduce((a, m) => a + m.watt, 0), hr = sha.reduce((a, m) => a + m.hr, 0), hrN = nom.reduce((a, m) => a + (m.on !== false && m.hr > 0 ? m.hr : 0), 0), nomT = nom.reduce((a, m) => a + m.nom, 0);
    return (fmTotC = { n: ms.length + dN, w: pw, wn: pm.length, on: ms.filter((m) => m.on !== false).length + dOn, off: ms.filter((m) => m.on === false).length + dN - dOn, offNames: ms.filter((m) => m.on === false).map((m) => m.name),
      hotN: ms.filter((m) => m.temp >= 85).length, hr, pct: nomT && hrN >= hr * 0.5 ? Math.round(hrN / nomT * 100) : 0, hot: hot?.temp, hotName: hot ? hot.name + " · " + Math.round(hot.temp) + " °C" : "", hotM: hot });
  }
  function minePool() { const ps = mineData?.pools || (mineData?.pool ? [mineData.pool] : []); return ps.length > 1 ? mineTotal(ps) : ps[0] || null; }
  // Mining-Überblick: große Zahlen oben, darunter je Farm eine Karte (Anteil online, Hashrate, Heißester, 24-h-Verlauf); Klick öffnet Foreman
  const UP_ST = /work|mining|online|active|running|alive|^on$/i, DOWN_ST = /offline|off|broken|error|fail|stop|down|dead|disabled|defekt/i;
  function renderMOver() {
    const el = $("mOver"); el.hidden = !farmOn; if (!farmOn || el.classList.contains("gone")) return;
    const f = fmTot(), p = minePool(), cur = btcCur === "EUR" ? "eur" : "usd", CUR = btcCur === "EUR" ? "EUR" : "USD", hp = mineData?.net?.hashprice?.[cur];
    const tile = (k, v, cls = "") => { const d = document.createElement("div"), a = document.createElement("small"), b = document.createElement("b"); d.className = cls; a.textContent = k; b.textContent = v; d.append(a, b); return d; };
    const t = [];
    // Foreman, OCEAN und Hosting-Portal werden zusammengerechnet (Portal: Zustand je Miner von der Seite)
    const pl = portalOn && portalLast?.total ? portalLast : null, pSt = pl?.states || [];
    // Nur Miner mit eindeutigem Zustand zählen mit; „unbekannt“ (z. B. ein Wort wie „off“) wird nicht als offline gewertet
    const pUp = pl ? pl.up || 0 : 0, pDown = pl ? pl.down || 0 : 0, pTot = pUp + pDown, nAll = (f ? f.n : 0) + pTot, onAll = (f ? f.on : 0) + pUp, offAll = (f ? f.off : 0) + pDown;
    if (pl && !pTot) { const ut = tile("Hosting-Portal", String(pl.total) + " Miner", "warn"); t.push(ut); ut.title = "Zustand der Miner ist unklar (" + pSt.map((s) => s.k + " " + s.n).join(", ") + "), deshalb nicht in „Miner online“ eingerechnet"; }
    if (f || pTot) {
      const r = nAll ? onAll / nAll : 1, mt = tile("Miner online", `${onAll} / ${nAll}`, r >= 0.97 ? "ok" : r >= 0.9 ? "warn" : "crit");
      mt.title = (f ? `Foreman und OCEAN: ${f.on} von ${f.n}` : "") + (pl ? `${f ? " · " : ""}Hosting-Portal: ${pUp} von ${pl.total} (${pSt.map((s) => s.k + " " + s.n).join(", ")})${pl.total - pTot ? `, ${pl.total - pTot} mit unklarem Zustand nicht mitgezählt` : ""}` : ""); t.push(mt);
    }
    if (f) {
      t.push(tile("Hashrate", fmtHash(f.hr), !f.pct || f.pct >= 95 ? "ok" : f.pct >= 85 ? "warn" : "crit")); if (f.pct) t.push(tile("vom Nennwert (alle Miner)", f.pct + " %", f.pct >= 95 ? "ok" : f.pct >= 85 ? "warn" : "crit"));
    }
    if (f || pTot) t.push(tile("Offline", String(offAll), offAll ? "crit" : "ok"));
    if (f?.hot != null) t.push(tile("Heißester", Math.round(f.hot) + " °C", f.hot >= 90 ? "crit" : f.hot >= 80 ? "warn" : "ok"));
    const pPow = pl?.power ? pl.power.w : 0;
    if (f?.wn || pPow) { const pt = tile("Leistung jetzt", fmtPower((f?.wn ? f.w : 0) + pPow)); pt.title = (f?.wn ? `Foreman: ${fmtPower(f.w)} (${f.wn} Miner gemessen, offline zählt 0)` : "") + (pPow ? `${f?.wn ? " · " : ""}Portal: ${fmtPower(pPow)} geschätzt (Modell-Watt × laufende Miner, ${pl.power.known} von ${pl.power.of} bekannt)` : ""); t.push(pt); }
    if (f?.wn && energyD?.today != null) t.push(tile("Verbrauch heute", fmtEnergy(energyD.today)));
    if (f?.wn && energyD?.yesterday != null) t.push(tile("Verbrauch gestern", fmtEnergy(energyD.yesterday)));
    if (p?.day != null) t.push(tile("Ertrag 24 h", sats(p.day / 1e8))); if (p?.hr?.m10) t.push(tile("Pool 10 min", fmtHash(p.hr.m10)));
    if (hp != null) t.push(tile("Hashprice", money(hp, CUR) + " /PH/Tag")); if (hp != null && f?.hr) t.push(tile("Wert pro Tag", money(hp * f.hr / 1e15, CUR)));
    $("mOverKpi").replaceChildren(...t);
    const st = $("mOverState"); st.textContent = !f && !pl ? "Warte auf Foreman" : offAll ? `${offAll} offline` : f?.hotN ? `${f.hotN} heiß` : "Alles läuft"; st.dataset.health = !f && !pl ? "warn" : offAll || f?.hotN ? "crit" : "ok";
    const accs = (farmData?.accounts || []).filter((a) => !a.hidden);
    const oc = oceanPools().map((p) => ({ name: (p.label || "OCEAN") + " · OCEAN", ocean: true, err: !p.workers?.length && !p.hr ? p.error || "lädt…" : "", url: p.addr ? "https://ocean.xyz/stats/" + encodeURIComponent(p.addr) : "",
      miners: (p.workers || []).map((w) => ({ name: w.name, on: w.on, hr: w.h3 || w.m1 || 0, algo: "sha" })), poolHr: p.hr?.m10 || p.hr?.h3 || 0, stale: p.workersStale || 0, hist: (p.hist || []).map((v) => [v]) }));
    $("mOverFarms").replaceChildren(...[...accs, ...oc].map((a) => {
      const ms = a.miners || [], lOn = ms.filter((m) => m.on !== false).length, on = a.pxOff ? 0 : a.dashN != null ? Math.max(a.dashOn, lOn) : lOn, tot = a.dashN != null && !a.ocean ? Math.max(a.dashN, ms.length) : ms.length, hr = a.poolHr || (a.pxOff ? 0 : ms.reduce((x, m) => x + (m.algo !== "scrypt" && m.on !== false && m.hr ? m.hr : 0), 0));
      const mx = ms.reduce((x, m) => m.temp != null && m.temp > x ? m.temp : x, -1), noW = !!a.ocean && !ms.length && hr > 0, r = noW ? 1 : tot ? on / tot : 0, d = document.createElement("div"); // OCEAN sieht Hashrate, liefert aber (kurz) keine Worker-Liste: nicht als „0 / 0 offline“ melden
      d.className = "link " + (noW ? "warn" : a.pxOff || r < 0.9 ? "crit" : r < 0.97 || mx >= 85 ? "warn" : "ok"); d.title = a.ocean ? "Daten vom OCEAN-Pool (Worker statt Miner)" + (a.url ? " · Klick öffnet OCEAN" : "") : "Klick öffnet die Minerliste in Foreman";
      d.addEventListener("click", () => window.jarvis.openUrl(a.ocean ? a.url || "https://ocean.xyz/" : "https://dashboard.foreman.mn/dashboard/miners/"));
      const h = document.createElement("h5"), nm = document.createElement("b"), sv = document.createElement("span"); nm.textContent = a.name; sv.textContent = a.err || (a.pxOff ? "Pickaxe offline" : noW ? "Worker-Liste fehlt kurz" : `${on} / ${tot}` + (a.stale ? ` · Stand vor ${agoTxt(a.stale)}` : "")); h.append(nm, sv);
      const bar = document.createElement("div"); bar.className = "mo-bar"; const bi = document.createElement("i"); bi.style.width = Math.round(r * 100) + "%"; bar.append(bi);
      const ps = document.createElement("div"); ps.className = "mo-ps";
      const row = (k, v) => { const q = document.createElement("p"), b = document.createElement("b"); q.append(k + " "); b.textContent = v; q.append(b); return q; };
      ps.append(row(a.ocean ? "Pool 10 min" : "Hashrate", hr ? fmtHash(hr) : "–"), row("Offline", noW ? "–" : String(tot - on))); if (mx >= 0) ps.append(row("Heißester", Math.round(mx) + " °C"));
      if (mineFx.since && !a.ocean) { const evs = farmData?.eventsAll || farmData?.events || [], last = evs.find((e) => e[2] && String(e[1]).startsWith(a.name + ":")), oldest = evs[evs.length - 1]?.[0];
        const q = row("Letzter Ausfall", last ? "vor " + agoTxt(Date.now() - last[0]) : oldest ? "keiner seit " + agoTxt(Date.now() - oldest) : "keiner bekannt"); q.className = "since" + (last && Date.now() - last[0] < 36e5 ? " recent" : ""); ps.append(q); }
      d.append(h, bar, ps);
      const hs = (a.hist || []).map((x) => x[0]);
      if (hs.length >= 3) { const sv2 = document.createElementNS("http://www.w3.org/2000/svg", "svg"), pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline"), top = Math.max(...hs) * 1.05 || 1, lo = Math.min(...hs) * 0.9;
        sv2.setAttribute("viewBox", "0 0 300 26"); sv2.setAttribute("preserveAspectRatio", "none"); pl.setAttribute("points", hs.map((v, i) => (i * 300 / (hs.length - 1)).toFixed(1) + "," + (25 - (v - lo) / (top - lo || 1) * 23).toFixed(1)).join(" ")); sv2.append(pl); d.append(sv2); }
      return d; }), ...portalCards());
    fitPanel?.();
  }
  // Karte des Hosting-Portals im Überblick: Zustände als Zeilen (Namen kommen von der Seite), Anteil laufend als Balken
  function portalCards() {
    if (portalOn && !portalLast?.total) { // Portal an, aber keine Zahlen (nicht angemeldet, Seite offline): Karte bleibt sichtbar, Klick öffnet die Anmeldung
      const ps = window.portalSnap, d = document.createElement("div"); d.className = "link warn"; d.title = "Klick: Portal-Fenster öffnen und anmelden";
      const h = document.createElement("h5"), nm = document.createElement("b"), sv = document.createElement("span"); nm.textContent = "Hosting-Portal"; sv.textContent = ps?.state === "nohost" ? "Adresse fehlt" : ps?.err && ps.state !== "login" ? "keine Daten" : "bitte anmelden"; h.append(nm, sv);
      const m = document.createElement("div"); m.className = "mo-ps"; const q = document.createElement("p"); q.textContent = ps?.err || "Nicht angemeldet oder Portal nicht erreichbar. Klick zum Anmelden."; m.append(q);
      d.addEventListener("click", () => window.jarvis.portalLogin()); d.append(h, m); return [d];
    }
    if (!portalOn || !portalLast?.total) return [];
    const L = { working: "laufen", broken: "defekt", stopped: "gestoppt", offline: "offline", off: "aus", online: "online" };
    const st = portalLast.states || [], run = (portalLast.up || 0) + (portalLast.down || 0) ? portalLast.up || 0 : st.filter((x) => /work|mining|online|active|running/i.test(x.k)).reduce((x, y) => x + y.n, 0), bad = st.filter((x) => /broken|error|fail|defekt/i.test(x.k)).reduce((x, y) => x + y.n, 0), r = run / portalLast.total;
    const d = document.createElement("div"); const unk = !((portalLast.up || 0) + (portalLast.down || 0)) && !run; d.className = "link " + (unk ? "warn" : r >= 0.97 ? "ok" : r >= 0.9 ? "warn" : "crit"); d.title = "Daten vom Hosting-Portal (nur Zähler)" + (unk ? ": Zustand der Miner ist unklar, deshalb keine Online-Zahl" : "");
    const h = document.createElement("h5"), nm = document.createElement("b"), sv = document.createElement("span"); nm.textContent = "Hosting-Portal"; sv.textContent = unk ? `${portalLast.total} Miner` : `${run} / ${portalLast.total}`; h.append(nm, sv);
    const bar = document.createElement("div"); bar.className = "mo-bar"; const bi = document.createElement("i"); bi.style.width = unk ? "100%" : Math.round(r * 100) + "%"; bar.append(bi);
    const ps = document.createElement("div"); ps.className = "mo-ps"; const row = (k, v) => { const q = document.createElement("p"), b = document.createElement("b"); q.append(k + " "); b.textContent = v; q.append(b); return q; };
    for (const x of st.slice(0, 4)) ps.append(row(L[String(x.k).toLowerCase()] || x.k, String(x.n)));
    if (portalLast.power) ps.append(row("Leistung (geschätzt)", fmtPower(portalLast.power.w)));
    if (portalLast.locations) ps.append(row("Standorte", String(portalLast.locations)));
    d.append(h, bar, ps); void bad; return [d];
  }
  // Mining-Seite lebendig: Ticker, Heatmap, Hashrate live, „seit letztem Ausfall“ (Einstellungen in mineFx)
  let mineFx = { tick: 100, tickFont: 1, heat: 9, live: 6, liveH: 120, since: true }, tickSig = "", tickSeen = 0;
  const agoTxt = (ms) => { const m = Math.max(0, Math.round(ms / 6e4)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} T ${Math.floor((m % 1440) / 60)} h`; };
  function renderMTick() {
    const el = $("mTick"); el.hidden = !farmOn; if (!farmOn || el.classList.contains("gone")) return;
    const evs = (farmData?.eventsAll || farmData?.events || []).slice(0, 20), sig = evs.map((e) => e[0]).join();
    el.style.setProperty("--mtf", String(mineFx.tickFont || 1));
    if (sig === tickSig) return; tickSig = sig;
    const run = $("mTickRun"), newest = evs[0]?.[0] || 0;
    const items = evs.length ? evs.map(([ts, t, bad, names]) => { const sp = document.createElement("span"), tm = document.createElement("time"), d = new Date(ts);
      tm.textContent = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); sp.className = (bad ? "bad" : "") + (tickSeen && ts > tickSeen ? " new" : ""); sp.append(tm, (bad ? "▼ " : "▲ ") + t);
      sp.title = d.toLocaleString("de-DE") + (names?.length ? " · Klick öffnet in Foreman" : ""); sp.addEventListener("click", () => names?.length ? openMiner(names[0]) : window.jarvis.openUrl("https://dashboard.foreman.mn/dashboard/miners/")); return sp; })
      : [Object.assign(document.createElement("span"), { textContent: "Noch keine Meldungen von Foreman – alles ruhig." })];
    run.replaceChildren(...items); tickSeen = newest;
    // Tempo: Länge der Zeile / Geschwindigkeit, 100 % ≈ 70 px pro Sekunde
    requestAnimationFrame(() => { const px = run.scrollWidth + el.clientWidth; run.style.setProperty("--mts", Math.max(8, px / (70 * (mineFx.tick || 100) / 100)) + "s"); });
  }
  function renderMHeat() {
    const el = $("mHeat"); el.hidden = !farmOn; if (!farmOn || el.classList.contains("gone")) return;
    const accs = (farmData?.accounts || []).filter((a) => !a.hidden), groups = accs.map((a) => ({ name: a.name, px: a.pxOff, ms: a.miners || [] }));
    if (oceanInTotal) for (const p of oceanPools()) groups.push({ name: (p.label || "OCEAN") + " · OCEAN", ms: (p.workers || []).map((w) => ({ name: w.name, on: w.on, hr: w.h3 || w.m1 })) });
    let off = 0, hot = 0, weak = 0, n = 0;
    const rows = groups.filter((g) => g.ms.length).map((g) => {
      const box = document.createElement("div"), lab = document.createElement("small"), grid = document.createElement("div"); box.className = "mh-farm"; grid.className = "mh-grid"; grid.style.setProperty("--hs", (mineFx.heat || 9) + "px");
      const st = g.ms.map((m) => { const pct = m.nom && m.hr ? m.hr / m.nom : null, c = g.px ? "na" : m.on === false ? "off" : m.temp >= 85 ? "hot" : pct != null && pct < 0.8 ? "weak" : ""; return [m, c]; });
      const ord = { off: 0, hot: 1, weak: 2, na: 3, "": 4 }; st.sort((a, b) => ord[a[1]] - ord[b[1]] || String(a[0].name).localeCompare(String(b[0].name), "de", { numeric: true }));
      const o2 = st.filter((x) => x[1] === "off").length;
      // einklappbar per Klick auf die Zeile; Anlagen mit Pickaxe offline starten eingeklappt (sonst eine Fläche grauer Kästen)
      const fold = mineFx.heatFold?.[g.name] ?? !!g.px;
      lab.textContent = `${fold ? "▸" : "▾"} ${g.name} · ${g.px ? `Pickaxe offline · ${g.ms.length} Miner` : `${g.ms.length - o2} / ${g.ms.length}`}`; lab.className = "mh-lab"; lab.title = fold ? "Aufklappen" : "Einklappen";
      lab.addEventListener("click", () => saveFx({ heatFold: { ...(mineFx.heatFold || {}), [g.name]: !fold } }));
      for (const [, c] of st) { n++; if (c === "off") off++; else if (c === "hot") hot++; else if (c === "weak") weak++; }
      if (fold) { box.classList.add("fold"); box.append(lab); return box; }
      grid.append(...st.slice(0, 4000).map(([m, c]) => { const i = document.createElement("i"); if (c) i.className = c;
        i.title = [m.name, m.type, m.on === false ? "offline" : m.hr ? fmtHash(m.hr) + (m.nom ? ` (${Math.round(m.hr / m.nom * 100)} %)` : "") : "", m.temp != null ? Math.round(m.temp) + " °C" : ""].filter(Boolean).join(" · ");
        if (m.id != null) i.addEventListener("click", () => openMiner(m)); return i; }));
      box.append(lab, grid); return box; });
    const lg = document.createElement("div"); lg.className = "mh-legend"; lg.innerHTML = '<span><b style="background:#2fbf7d"></b>läuft</span><span><b style="background:#e9b949"></b>schwach (&lt; 80 %)</span><span><b style="background:#ff9a3d"></b>heiß (≥ 85 °C)</span><span><b style="background:#ff4f3d"></b>offline</span><span><b style="background:#44506a"></b>unbekannt</span>';
    $("mHeatBody").replaceChildren(...rows, lg);
    const s2 = $("mHeatState"); s2.textContent = n ? (off ? `${off} offline` : "") + (hot ? `${off ? " · " : ""}${hot} heiß` : "") + (weak ? `${off || hot ? " · " : ""}${weak} schwach` : "") || "Alles läuft" : "Warte auf Foreman"; s2.dataset.health = off || hot ? "crit" : weak ? "warn" : "ok";
  }
  function renderMLive() {
    const el = $("mLive"); el.hidden = !farmOn; if (!farmOn || el.classList.contains("gone")) return;
    const accs = (farmData?.accounts || []).filter((a) => !a.hidden), all = farmData?.hist || accs[0]?.hist || [], hrs = mineFx.live || 6, now = Date.now();
    const pts = all.filter((x) => x[3] ? now - x[3] <= hrs * 36e5 : true).slice(-hrs * 12), svg = $("mLiveSvg"), NS = "http://www.w3.org/2000/svg";
    svg.style.setProperty("--mlh", (mineFx.liveH || 120) + "px"); $("mLiveTitle").textContent = `Mining · Hashrate live · ${hrs} h`;
    if (pts.length < 2) { svg.replaceChildren(); $("mLiveFoot").textContent = "Sammle Werte (alle 5 Minuten ein Punkt) …"; $("mLiveState").textContent = ""; return; }
    const hs = pts.map((x) => x[0]), mx = Math.max(...hs) * 1.04 || 1, mn = Math.min(...hs) * 0.96, X = (i) => (i / (pts.length - 1)) * 600, Y = (v) => 116 - ((v - mn) / (mx - mn || 1)) * 110;
    const line = pts.map((x, i) => X(i).toFixed(1) + "," + Y(x[0]).toFixed(1)).join(" "), kids = [];
    for (const g of [0.25, 0.5, 0.75]) { const l = document.createElementNS(NS, "line"); l.setAttribute("class", "gl"); l.setAttribute("x1", 0); l.setAttribute("x2", 600); l.setAttribute("y1", 120 * g); l.setAttribute("y2", 120 * g); kids.push(l); }
    const ar = document.createElementNS(NS, "polygon"); ar.setAttribute("class", "ar"); ar.setAttribute("points", "0,120 " + line + " 600,120");
    const ln = document.createElementNS(NS, "polyline"); ln.setAttribute("class", "ln"); ln.setAttribute("points", line); kids.push(ar, ln);
    // Ausfälle: weniger Miner online als im Punkt davor → roter Punkt an der Stelle
    let drops = 0; pts.forEach((x, i) => { if (i && x[1] < pts[i - 1][1]) { drops++; const c = document.createElementNS(NS, "line"); c.setAttribute("class", "dr"); c.setAttribute("x1", X(i)); c.setAttribute("x2", X(i)); c.setAttribute("y1", Y(x[0])); c.setAttribute("y2", Y(x[0]));
      const t = document.createElementNS(NS, "title"); t.textContent = `${pts[i - 1][1] - x[1]} Miner weniger online` + (x[3] ? " · " + new Date(x[3]).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""); c.append(t); kids.push(c); } });
    svg.replaceChildren(...kids);
    const last = pts[pts.length - 1], first = pts[0], d = first[0] ? (last[0] / first[0] - 1) * 100 : 0;
    $("mLiveFoot").textContent = `jetzt ${fmtHash(last[0])} · min ${fmtHash(Math.min(...hs))} · max ${fmtHash(Math.max(...hs))} · ${drops} Ausfall-Stellen`;
    const st = $("mLiveState"); st.textContent = (d >= 0 ? "+" : "") + d.toFixed(1).replace(".", ",") + " %"; st.dataset.health = d < -5 ? "crit" : d < -1 ? "warn" : "ok";
  }
  function renderMineFx() { renderMTick(); renderMHeat(); renderMLive(); }
  setInterval(() => { if (onMining?.() && farmOn) renderMOver(); }, 60e3); // „seit letztem Ausfall“ weiterzählen
  // Mining-Kugel: jeder Punkt steht für einen Anteil der Miner (grün läuft, gelb heiß, rot offline); Verteilung zufällig, aber fest
  let orbMix = null, orbEvT = 0;
  function minerHue(i) {
    const f = fmTot(); if (!f) return null;
    if (orbMix?.k !== fmTotC) orbMix = { k: fmTotC, off: f.off / f.n, hot: f.hotN / f.n };
    const r = ((i * 2654435761) >>> 0) / 4294967296;
    return r < orbMix.off ? 4 : r < orbMix.off + orbMix.hot ? 38 : 145;
  }
  // Miner in Foreman öffnen: per Objekt oder Name (Ereignisse speichern Namen); ohne Nummer die Minerliste
  function openMiner(m) {
    if (typeof m === "string") { const n = m.replace(/^.* · /, ""); m = (farmData?.accounts || []).flatMap((a) => a.miners || []).find((x) => x.name === n || x.name === m) || { name: m }; }
    const u = m.id != null ? fmUrl.replace("{id}", encodeURIComponent(m.id)) : "https://dashboard.foreman.mn/dashboard/miners/";
    window.jarvis.openUrl(u);
  }
  $("setFmNotify").addEventListener("change", (e) => window.jarvis.setConfig({ fmNotify: e.target.checked }));
  $("setFmUrl").addEventListener("change", (e) => { const v = e.target.value.trim(); if (/^https:\/\//i.test(v)) { fmUrl = v; window.jarvis.setConfig({ fmMinerUrl: v }); } else e.target.value = fmUrl; });
  $("setFmView").addEventListener("change", (e) => { fmView = e.target.value; renderFarm(); window.jarvis.setConfig({ fmView }); });
  $("setFmEv").addEventListener("change", (e) => { fmEvOn = e.target.checked; renderFarm(); window.jarvis.setConfig({ fmEvOn }); });
  $("setFmOn").addEventListener("change", (e) => { farmOn = e.target.checked; farmData = null; renderFarm(); window.jarvis.setConfig({ foremanOn: farmOn }); });
  // Konten-Liste in den Einstellungen: je Zeile Name, Client-ID, Schlüssel (leer = gespeicherten behalten), × entfernt
  let fmList = [];
  function fmRows() {
    $("fmRows").replaceChildren(...fmList.map((a, k) => {
      const row = document.createElement("div"), n = document.createElement("input"), c = document.createElement("input"), key = document.createElement("input"), x = document.createElement("button");
      row.className = "fm-row"; n.type = c.type = "text"; key.type = "password"; n.spellcheck = c.spellcheck = false;
      n.placeholder = "Name, z. B. Farm 1"; n.value = a.name || ""; c.placeholder = "Client-ID"; c.value = a.client || ""; c.inputMode = "numeric";
      key.placeholder = a.hasKey ? "Schlüssel gespeichert" : "API-Schlüssel"; key.autocomplete = "off";
      x.type = "button"; x.textContent = "×"; x.title = "Konto entfernen";
      const t = document.createElement("button"); t.type = "button"; t.className = "fm-t"; t.textContent = "Testen"; t.title = "Verbindung zu Foreman mit diesen Angaben prüfen";
      t.addEventListener("click", async () => { const nt = $("fmNote"); nt.className = "fm-note"; nt.textContent = `${n.value.trim() || "Konto"}: prüfe…`; t.disabled = true;
        try { const r = await window.jarvis.foremanTest?.({ client: c.value.trim(), key: key.value.trim() }); nt.textContent = `${n.value.trim() || "Konto"}: ${r?.text || "keine Antwort"}`; nt.className = "fm-note " + (r?.ok ? "ok" : "bad"); }
        finally { t.disabled = false; } });
      const save = () => { fmList[k] = { name: n.value.trim(), client: c.value.trim(), key: key.value.trim(), hasKey: a.hasKey }; fmSave(); };
      n.addEventListener("change", save); c.addEventListener("change", save); key.addEventListener("change", save);
      x.addEventListener("click", () => { fmList.splice(k, 1); fmSave(); fmRows(); });
      row.append(n, c, key, t, x); return row; }));
    $("fmAdd").disabled = fmList.length >= 8;
  }
  // Standorte (Pickaxes) je Konto: sichtbar ja/nein und eigener Name; erscheint, sobald ein Konto mehr als eine Pickaxe hat
  let fmPxCfg = {}, fmPxSig = "";
  function fmPxRows() {
    const all = farmData?.accounts || [], sites = all.filter((a) => a.px && all.filter((b) => b.client === a.client).length > 1), multi = all.filter((a) => a.pxCount > 1 && all.findIndex((b) => b.client === a.client) === all.indexOf(a));
    const sig = multi.map((a) => a.client + a.pxMode + a.merged).join(",") + "|" + sites.map((a) => a.key + a.hidden + a.pxName + (a.miners || []).length + a.pxOff).join("|");
    if (sig === fmPxSig || document.activeElement?.closest?.("#fmPx")) return; fmPxSig = sig;
    const items = [];
    if (multi.length) { const h = document.createElement("b"); h.textContent = "Standorte (Pickaxes)"; items.push(h); }
    // je Konto mit mehreren Pickaxes: zusammenfassen (ein Standort) oder getrennt zeigen; „automatisch“ fasst gleich benannte Miner zusammen
    for (const a of multi) {
      const l = document.createElement("label"), sel = document.createElement("select"), k = `${a.client}:*`, acc = (a.name || "").split(" · ")[0] || a.client;
      for (const [v, t] of [["auto", "automatisch"], ["merge", "zusammenfassen"], ["split", "getrennt"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.append(o); }
      sel.value = a.pxMode || "auto"; l.className = "row"; l.append(`${acc}: ${a.pxCount} Pickaxes ${a.merged ? "(ein Standort)" : "(getrennt)"}`, sel);
      sel.addEventListener("change", () => { fmPxCfg = { ...fmPxCfg, [k]: { mode: sel.value } }; window.jarvis.setConfig({ foremanPx: fmPxCfg }); });
      items.push(l);
    }
    for (const a of sites) {
      const l = document.createElement("label"), cb = document.createElement("input"), nm = document.createElement("input"), sm = document.createElement("small"), k = `${a.client}:${a.px}`;
      cb.type = "checkbox"; cb.checked = !a.hidden; cb.title = "Im Farm-Block zeigen"; nm.type = "text"; nm.value = fmPxCfg[k]?.name || ""; nm.placeholder = a.pxName || "Name"; nm.spellcheck = false;
      const on = (a.miners || []).filter((m) => m.on === true).length; sm.textContent = a.pxOff ? `offline · ${(a.miners || []).length} Miner` : `${on} / ${(a.miners || []).length} online`; if (a.pxOff) l.className = "off";
      const save = () => { fmPxCfg = { ...fmPxCfg, [k]: { name: nm.value.trim().slice(0, 30), hidden: !cb.checked } }; window.jarvis.setConfig({ foremanPx: fmPxCfg }); };
      cb.addEventListener("change", save); nm.addEventListener("change", save);
      l.append(cb, nm, sm); items.push(l);
    }
    $("fmPx").replaceChildren(...items);
  }
  async function fmSave() {
    const r = await window.jarvis.foremanAccounts?.(fmList.filter((a) => a.client).map((a) => ({ name: a.name, client: a.client, key: a.key || "" })));
    if (!Array.isArray(r)) return; // Zeilen nicht neu bauen (Fokus bleibt), nur Schlüssel-Hinweise auffrischen
    const has = new Map(r.map((a) => [a.client, a.hasKey])), rows = $("fmRows").children;
    fmList.forEach((a, k) => { const c = a.client.replace(/\D/g, ""), kk = rows[k]?.children[2]; a.hasKey = !!has.get(c); a.key = ""; if (kk) { if (a.hasKey) kk.value = ""; kk.placeholder = a.hasKey ? "Schlüssel gespeichert" : "API-Schlüssel"; } });
  }
  $("fmAdd").addEventListener("click", () => { fmList.push({ name: "", client: "", key: "" }); fmRows(); $("fmRows").lastElementChild?.querySelector("input")?.focus(); });
  window.jarvis.getConfig?.().then((c) => { farmOn = !!c.foremanOn; farmData = c.farm || null; $("setFmOn").checked = farmOn; fmEvOn = c.fmEvOn !== false; $("setFmEv").checked = fmEvOn; $("setFmNotify").checked = c.fmNotify !== false; if (c.fmMinerUrl) fmUrl = c.fmMinerUrl; $("setFmUrl").value = fmUrl; fmView = ["standort", "konto"].includes(c.fmView) ? c.fmView : "blaettern"; $("setFmView").value = fmView; fmPxCfg = c.foremanPx || {}; fmList = c.foremanAccts || []; if (!fmList.length) fmList = [{ name: "", client: "", key: "" }]; fmRows(); renderFarm(); });
  // ---------- Notizblock (optional): Text wird kurz nach dem Tippen gespeichert ----------
  // KI-Verlauf (optional): neueste oben, bis 40 Zeilen
  let aiLogOn = false;
  function aiLogLine([ts, t, kind]) { const li = document.createElement("li"), tm = document.createElement("time"); tm.textContent = new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); li.className = { err: "bad", done: "ok" }[kind] || kind; li.title = t; li.append(tm, document.createTextNode(t)); return li; }
  function aiLogAdd(e) { const l = $("aiLogList"); l.prepend(aiLogLine(e)); while (l.children.length > 40) l.lastChild.remove(); $("aiLogState").textContent = e[2] === "start" || e[2] === "tool" ? "arbeitet" : e[2] === "err" ? "Fehler" : "bereit"; $("aiLogState").dataset.health = e[2] === "err" ? "warn" : "ok"; }
  window.jarvis.onAiLog?.((e) => aiLogAdd(e));
  const renderAiLog = () => { $("aiLog").hidden = !aiLogOn; fitPanel?.(); };
  $("setAiLog").addEventListener("change", (e) => { aiLogOn = e.target.checked; renderAiLog(); window.jarvis.setConfig({ aiLogOn }); });
  window.jarvis.getConfig?.().then(async (c) => { aiLogOn = !!c.aiLogOn; $("setAiLog").checked = aiLogOn; renderAiLog(); for (const e of (await window.jarvis.aiHist?.()) || []) aiLogAdd(e); });
  let notesOn = false, notesT = null;
  function renderNotes() { $("notes").hidden = !notesOn; fitPanel?.(); }
  $("setNotesOn").addEventListener("change", (e) => { notesOn = e.target.checked; renderNotes(); window.jarvis.setConfig({ notesOn }); if (notesOn) setTimeout(() => $("notesText").focus({ preventScroll: true }), 50); });
  // Mehrere Seiten, optional in Ordnern. Rechtsklick auf einen Reiter: umbenennen, Ordner, löschen
  let nPages = [], nCur = "", nFolder = "", nOwner = "start", nByPage = {}, nIds = {}, nReady = false;
  const nPage = () => nPages.find((p) => p.id === nCur) || nPages[0];
  const nSave = (synchronous = false) => {
    if (!nReady) return;
    nByPage[nOwner] = { ...(nByPage[nOwner] || {}), pages: window.argusNotesStore.clone(nPages), current: nCur, folder: nFolder,
      ...(window.notesGeometryRead ? { geometry: window.notesGeometryRead() } : {}) };
    const snapshot = { notesByPage: window.argusNotesStore.clone(nByPage), pageIds: { ...nIds } };
    return synchronous === true && window.jarvis.saveNotesNow ? window.jarvis.saveNotesNow(snapshot) : window.jarvis.setConfig(snapshot);
  };
  window.notesPageId = (name) => {
    if (!Object.hasOwn(nIds, name)) Object.defineProperty(nIds, name, { value: "page-" + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""), enumerable: true, configurable: true, writable: true });
    return nIds[name];
  };
  window.notesRenamePage = (old, name) => { const id = window.notesPageId(old); Object.defineProperty(nIds, name, { value: id, enumerable: true, configurable: true, writable: true }); delete nIds[old]; nSave(); };
  window.notesArchivePage = name => { delete nIds[name]; nSave(); };
  window.notesPageGeometry = name => window.argusNotesStore.clone(nByPage[window.notesPageId(name)]?.geometry || null);
  window.notesSwitchPage = (name) => {
    if (!nReady) return;
    nFlush(); nOwner = window.notesPageId(name);
    const state = window.argusNotesStore.clone(nByPage[nOwner] || window.argusNotesStore.empty());
    nPages = state.pages; nCur = state.current; nFolder = state.folder || "";
    $("notesText").value = nPage()?.text || ""; nRender(); $("notesState").textContent = "";
  };
  function nRender() {
    const folders = [...new Set(nPages.map((p) => p.folder).filter(Boolean))];
    if (nFolder && !folders.includes(nFolder)) nFolder = "";
    const sel = $("notesFolder"); sel.replaceChildren(new Option("Alle", ""), ...folders.map((f) => new Option("📁 " + f, f))); sel.value = nFolder; sel.hidden = !folders.length;
    const shown = nPages.filter((p) => !nFolder || p.folder === nFolder);
    if (!shown.includes(nPage())) { nCur = shown[0]?.id || nCur; }
    $("notesTabs").replaceChildren(...shown.map((p) => { const b = document.createElement("button"); b.type = "button"; b.append(document.createTextNode(p.name)); b.title = (p.folder ? "📁 " + p.folder + " · " : "") + "Doppelklick: umbenennen · Rechtsklick: Optionen · ×: löschen"; b.classList.toggle("on", p.id === nCur);
      const x = document.createElement("span"); x.className = "nt-x"; x.textContent = "×"; x.title = "Notiz löschen (zweimal klicken)"; b.append(x);
      x.addEventListener("click", (e) => { // × am Reiter: erster Klick fragt nach, zweiter löscht; die letzte Seite wird nur geleert
        e.stopPropagation();
        if (!x.classList.contains("ask")) { x.classList.add("ask"); x.textContent = "Löschen?"; setTimeout(() => { if (x.isConnected) { x.classList.remove("ask"); x.textContent = "×"; } }, 3000); return; }
        if (nPages.length > 1) { nPages = nPages.filter((q) => q !== p); if (nCur === p.id) nCur = nPages[0].id; } else { p.text = ""; p.name = "Notizen"; nCur = p.id; }
        $("notesText").value = nPage().text; nRender(); nSave();
      });
      b.addEventListener("dblclick", () => nAsk("Name der Seite", p.name, (v) => { p.name = v; nRender(); nSave(); }));
      b.addEventListener("click", () => { nCommit(); nCur = p.id; $("notesText").value = p.text; nRender(); nSave(); });
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); ctxMenu(e.clientX, e.clientY, p.name, [
        ["Umbenennen", () => nAsk("Neuer Name", p.name, (v) => { p.name = v; nRender(); nSave(); })],
        ["In Ordner legen …", () => nAsk("Ordnername (leer = kein Ordner)", p.folder || "", (v) => { p.folder = v; nRender(); nSave(); }, true)],
        [nPages.length > 1 ? `„${p.name}“ löschen` : "Notiz leeren", () => { if (nPages.length > 1) { nPages = nPages.filter((q) => q !== p); if (nCur === p.id) nCur = nPages[0].id; } else { p.text = ""; } $("notesText").value = nPage().text; nRender(); nSave(); }, true]]); });
      return b; }));
  }
  function nAsk(title, val, done, allowEmpty) {
    const i = $("notesAsk"); i.placeholder = title; i.value = val; i.hidden = false; i.focus(); i.select();
    const fin = (ok) => { i.removeEventListener("keydown", kd); i.removeEventListener("blur", bl); i.hidden = true; const v = i.value.trim(); if (ok && (v || allowEmpty)) done(v.slice(0, 40)); };
    const kd = (e) => { e.stopPropagation(); if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); }, bl = () => fin(false);
    i.addEventListener("keydown", kd); i.addEventListener("blur", bl);
  }
  function nCommit() { const p = nPage(); if (p) p.text = $("notesText").value; }
  $("notesAdd").addEventListener("click", () => { if (nPages.length >= 50) return notice("Mehr als 50 Seiten gehen nicht"); nCommit();
    const p = { id: "n" + Date.now().toString(36), name: "Seite " + (nPages.length + 1), folder: nFolder, text: "" }; nPages.push(p); nCur = p.id; $("notesText").value = ""; nRender(); nSave(); nAsk("Name der neuen Seite", p.name, (v) => { p.name = v; nRender(); nSave(); }); });
  const nFlush = (synchronous = false) => { clearTimeout(notesT); if (!nPages.length) return; nCommit(); nSave(synchronous === true); };
  window.addEventListener("beforeunload", () => nFlush(true)); window.addEventListener("pagehide", () => nFlush(true)); document.addEventListener("visibilitychange", () => { if (document.hidden) nFlush(); });
  $("notesText").addEventListener("blur", nFlush);
  $("notesFolder").addEventListener("change", (e) => { nCommit(); nFolder = e.target.value; nRender(); $("notesText").value = nPage()?.text || ""; nSave(); });
  $("notesText").addEventListener("input", () => { $("notesState").textContent = "…"; clearTimeout(notesT); notesT = setTimeout(() => { nCommit(); nSave(); $("notesState").textContent = "gespeichert"; setTimeout(() => { $("notesState").textContent = ""; }, 1500); }, 600); });
  $("notesText").addEventListener("keydown", (e) => e.stopPropagation()); // Tippen löst keine Tastenkürzel aus
  window.jarvis.getConfig?.().then((c) => {
    notesOn = !!c.notesOn; $("setNotesOn").checked = notesOn;
    const scoped = window.argusNotesStore.migrate(c, () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""));
    nIds = scoped.pageIds; nByPage = scoped.notesByPage;
    nOwner = window.notesPageId(c.page || "Start"); nReady = true;
    const state = window.argusNotesStore.clone(nByPage[nOwner] || window.argusNotesStore.empty());
    nPages = state.pages; nCur = state.current; nFolder = state.folder || "";
    $("notesText").value = nPage()?.text || ""; nRender(); renderNotes();
  });
  // ---------- Schnellstart: eigene Programme per Klick starten ----------
  let quickOn = false, quickSize = 44, quickLabels = true;
  function ctxMenu(x, y, title, items) {
    const t = document.createElement("div"); t.className = "cm-t"; t.textContent = title;
    procMenu.replaceChildren(t, ...items.map(([label, fn, danger]) => { const b = document.createElement("button"); b.type = "button"; if (danger) b.className = "danger"; b.textContent = label; b.addEventListener("click", () => { closeProcMenu(); fn?.(); }); return b; }));
    procMenu.hidden = false; procMenu.style.left = Math.min(x, innerWidth - procMenu.offsetWidth - 8) + "px"; procMenu.style.top = Math.min(y, innerHeight - procMenu.offsetHeight - 8) + "px";
  }
  async function renderQuick() {
    $("quick").hidden = !quickOn; if (!quickOn) return;
    const list = (await window.jarvis.quickList().catch(() => [])) || [];
    $("qsGrid").style.setProperty("--qs", quickSize + "px");
    const tiles = list.map((it) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "qs" + (it.missing ? " missing" : ""); b.title = it.name + (it.missing ? " (Datei nicht gefunden)" : " · Klick: starten · Rechtsklick: entfernen");
      if (it.icon) { const im = document.createElement("img"); im.src = it.icon; im.alt = ""; b.append(im); } else { const ph = document.createElement("div"); ph.className = "ph"; ph.textContent = (it.name || "?").slice(0, 1).toUpperCase(); b.append(ph); }
      if (quickLabels) { const sp = document.createElement("span"); sp.textContent = it.name; b.append(sp); }
      b.addEventListener("click", async () => { const r = await window.jarvis.quickLaunch(it.i).catch((e) => ({ ok: false, text: String(e.message || e) })); if (!r.ok) notice(r.text); else $("quickState").textContent = it.name; setTimeout(() => { $("quickState").textContent = ""; }, 2500); });
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); ctxMenu(e.clientX, e.clientY, it.name, [[`„${it.name}“ aus dem Schnellstart entfernen`, async () => { await window.jarvis.quickRemove(it.i); renderQuick(); }, true], ["Abbrechen"]]); });
      return b;
    });
    const add = document.createElement("button"); add.type = "button"; add.className = "qs add"; add.title = "Programm hinzufügen"; add.innerHTML = '<div class="ph">+</div>' + (quickLabels ? "<span>Hinzufügen</span>" : "");
    add.addEventListener("click", async () => { await window.jarvis.quickAdd(); renderQuick(); });
    $("qsGrid").replaceChildren(...tiles, add);
    $("quickRows").replaceChildren(...list.map((it) => { const r = document.createElement("div"); r.className = "wrow"; const n = document.createElement("span"); n.textContent = it.name; const x = document.createElement("button"); x.type = "button"; x.className = "btn"; x.textContent = "Entfernen"; x.addEventListener("click", async () => { await window.jarvis.quickRemove(it.i); renderQuick(); }); r.append(n, x); return r; }));
  }
  $("setQuickOn").addEventListener("change", (e) => { quickOn = e.target.checked; window.jarvis.setConfig({ quickOn }); renderQuick(); fitPanel?.(); });
  $("setQuickSize").addEventListener("input", (e) => { quickSize = +e.target.value; $("qsGrid").style.setProperty("--qs", quickSize + "px"); clearTimeout(quickSave); quickSave = setTimeout(() => window.jarvis.setConfig({ quickSize }), 300); });
  let quickSave = null;
  $("setQuickLabels").addEventListener("change", (e) => { quickLabels = e.target.checked; window.jarvis.setConfig({ quickLabels }); renderQuick(); });
  $("setQuickAdd").addEventListener("click", async () => { await window.jarvis.quickAdd(); renderQuick(); });
  window.jarvis.onQuickUpdate?.(() => renderQuick());
  // Programme auf den Block ziehen
  $("quick").addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); $("quick").classList.add("drop"); } });
  $("quick").addEventListener("dragleave", () => $("quick").classList.remove("drop"));
  $("quick").addEventListener("drop", async (e) => { e.preventDefault(); $("quick").classList.remove("drop"); const paths = [...(e.dataTransfer?.files || [])].map((f) => window.jarvis.pathOf(f)).filter(Boolean); if (paths.length) { await window.jarvis.quickAddPaths(paths); renderQuick(); } });
  window.jarvis.getConfig?.().then((c) => { quickOn = !!c.quickOn; quickSize = c.quickSize || 44; quickLabels = c.quickLabels !== false; $("setQuickOn").checked = quickOn; $("setQuickSize").value = quickSize; $("setQuickLabels").checked = quickLabels; renderQuick(); });

  // ---------- Fenster-Spiegel: ein offenes Fenster (zum Beispiel das Discord-Popup mit den Kameras) live im Panel zeigen ----------
  let mirrorSig = "", mirrorQ = 1280, mirrorOn = false, mirrorStream = null, mirrorMatch = "discord", mirrorFps = 15, mirrorPoll = null, mirrorBusy = false;
  const mirrorWanted = () => mirrorOn && !hiddenSet.has("mirror");
  function mirrorStop() { try { mirrorStream?.getTracks().forEach((t) => t.stop()); } catch {} mirrorStream = null; $("mirrorVid").srcObject = null; }
  function mirrorSet(txt, health) { $("mirrorState").textContent = txt; $("mirrorState").dataset.health = health || "ok"; }
  async function mirrorFind(auto) {
    if (mirrorBusy) return; mirrorBusy = true;
    try {
      const list = (await window.jarvis.mirrorSources().catch(() => [])) || [], sel = $("mirrorSel");
      const cur = sel.value && list.some((x) => x.id === sel.value) ? sel.value : "";
      const sig = list.map((x) => x.id + x.name).join("|");
      if (sig !== mirrorSig) { mirrorSig = sig; sel.replaceChildren(new Option("Fenster oder Bildschirm wählen …", ""), ...list.map((x) => new Option((x.screen ? "🖥 " : "") + x.name.slice(0, 70), x.id))); }
      const m = mirrorMatch.toLowerCase();
      const pick = cur || (m && (list.find((x) => x.name.toLowerCase() === m) || list.find((x) => x.name.toLowerCase().includes(m)))?.id) || "";
      sel.value = pick;
      if (pick && !mirrorStream) await mirrorStart(pick);
      else if (!pick && !mirrorStream) mirrorSet(m ? "wartet auf Fenster" : "kein Fenster gewählt", "warn");
    } finally { mirrorBusy = false; }
  }
  async function mirrorStart(id) {
    mirrorStop();
    try {
      const fps = mirrorFps;
      mirrorStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: id, maxFrameRate: fps, ...(mirrorQ ? { maxWidth: mirrorQ, maxHeight: Math.round(mirrorQ * 9 / 16) * 2 } : {}) } } });
      mirrorStream.getVideoTracks()[0].addEventListener("ended", () => { mirrorStop(); mirrorSet("Fenster geschlossen", "warn"); });
      $("mirrorVid").srcObject = mirrorStream; mirrorSet("läuft");
    } catch (e) { mirrorStop(); mirrorSet("kein Zugriff aufs Fenster", "crit"); }
  }
  function mirrorSync() {
    const on = mirrorWanted(); $("mirror").hidden = !mirrorOn;
    clearInterval(mirrorPoll); mirrorPoll = null;
    if (!on) { mirrorStop(); return; }
    mirrorFind(true); mirrorPoll = setInterval(() => { if (!expanded || document.hidden) { if (mirrorStream) mirrorStop(); return; } if (!mirrorStream) mirrorFind(true); }, 4000); // zugeklappt: Aufnahme anhalten (spart GPU und CPU), // taucht das Fenster später auf, wird es gespiegelt
  }
  $("mirrorSel").addEventListener("change", async (e) => {
    const o = e.target.selectedOptions[0]; mirrorStop();
    if (!e.target.value) { mirrorMatch = ""; window.jarvis.setConfig({ mirrorMatch }); mirrorSet("kein Fenster gewählt", "warn"); return; }
    mirrorMatch = o.textContent; window.jarvis.setConfig({ mirrorMatch }); await mirrorStart(e.target.value);
  });
  $("setMirrorOn").addEventListener("change", (e) => { mirrorOn = e.target.checked; window.jarvis.setConfig({ mirrorOn }); mirrorSync(); fitPanel?.(); });
  $("setMirrorQ").addEventListener("change", (e) => { mirrorQ = +e.target.value; window.jarvis.setConfig({ mirrorQ }); if (mirrorStream) { const id = $("mirrorSel").value; if (id) mirrorStart(id); } });
  $("mirrorSel").addEventListener("mousedown", () => mirrorFind(true)); // Liste beim Aufklappen neu holen (Fenster, die erst jetzt offen sind)
  $("setMirrorFps").addEventListener("change", (e) => { mirrorFps = +e.target.value; window.jarvis.setConfig({ mirrorFps }); if (mirrorStream) { const id = $("mirrorSel").value; if (id) mirrorStart(id); } });
  window.jarvis.getConfig?.().then((c) => { mirrorOn = !!c.mirrorOn; mirrorMatch = c.mirrorMatch ?? "discord"; mirrorFps = c.mirrorFps || 15; mirrorQ = c.mirrorQ ?? 1280; $("setMirrorQ").value = String(mirrorQ); $("setMirrorOn").checked = mirrorOn; $("setMirrorFps").value = String(mirrorFps); setTimeout(mirrorSync, 1500); });

  // Weltuhren: eigene Ortszeit vorn, dann die eingestellten Zonen mit Abstand in Stunden
  const tzOk = (tz) => { try { new Intl.DateTimeFormat("de-DE", { timeZone: tz }); return true; } catch { return false; } };
  const tzOff = (tz, d) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(d).reduce((o, x) => (o[x.type] = +x.value, o), {});
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())) / 36e5; };
  let clkLast = "";
  function renderClocks(force) {
    const box = $("clocks"); box.hidden = !clocksOn;
    if (!clocksOn) return;
    // Uhren mit derselben Zeit wie hier (z. B. „Deutschland“, wenn du in Deutschland bist) weglassen
    const d = new Date(), list = [{ n: "Hier", tz: null }, ...clocks.filter((c) => tzOk(c.tz) && Math.abs(tzOff(c.tz, d)) >= 0.25)];
    box.style.setProperty("--cn", String(list.length)); const look = box.dataset.look || "", face = (window.CLOCK_FACE_LOOKS || []).includes(look), key = d.getHours() + ":" + d.getMinutes() + JSON.stringify(list) + look + ((window.CLOCK_SECONDS || []).includes(look) ? ":" + d.getSeconds() : "");
    if (!force && key === clkLast) return; clkLast = key;
    $("clkRow").replaceChildren(...list.map((c) => {
      const el = document.createElement("div"), a = document.createElement("small"), b = document.createElement("b");
      a.textContent = c.n; b.textContent = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", ...(c.tz ? { timeZone: c.tz } : {}) });
      if (c.tz) { const o = tzOff(c.tz, d); if (Math.abs(o) >= 0.25) { const e = document.createElement("em"); e.textContent = (o > 0 ? "+" : "−") + String(Math.abs(o)).replace(".", ",") + " h"; b.append(e); } }
      if (face) { b.hidden = true; if (c.tz) { const o = tzOff(c.tz, d); if (Math.abs(o) >= 0.25) a.textContent += " " + (o > 0 ? "+" : "−") + String(Math.abs(o)).replace(".", ",") + " h"; } } // Zifferblatt statt Digitalzeit: nicht doppelt
      if (face) { const t = c.tz ? new Date(d.toLocaleString("en-US", { timeZone: c.tz })) : d; el.prepend(window.clockFace(look, t)); }
      el.append(a, b); return el; }));
  }
  (function clkTick() { renderClocks(); setTimeout(clkTick, (window.CLOCK_SECONDS || []).includes($("clocks").dataset.look) ? 1000 : 5000); })(); window.renderClocksNow = () => renderClocks(true);
  // Zeitzone aus „Europe/Berlin“, einer Stadt („Asuncion“, „New York“) oder einem bekannten Land
  const TZ_LAND = { deutschland: "Europe/Berlin", germany: "Europe/Berlin", paraguay: "America/Asuncion", kasachstan: "Asia/Almaty", kazakhstan: "Asia/Almaty", usa: "America/New_York", amerika: "America/New_York",
    texas: "America/Chicago", kanada: "America/Toronto", dubai: "Asia/Dubai", emirate: "Asia/Dubai", vae: "Asia/Dubai", russland: "Europe/Moscow", china: "Asia/Shanghai", japan: "Asia/Tokyo", indien: "Asia/Kolkata",
    england: "Europe/London", uk: "Europe/London", spanien: "Europe/Madrid", schweiz: "Europe/Zurich", österreich: "Europe/Vienna", thailand: "Asia/Bangkok", brasilien: "America/Sao_Paulo", argentinien: "America/Argentina/Buenos_Aires",
    äthiopien: "Africa/Addis_Ababa", norwegen: "Europe/Oslo", island: "Atlantic/Reykjavik", australien: "Australia/Sydney", türkei: "Europe/Istanbul", oman: "Asia/Muscat", katar: "Asia/Qatar", bhutan: "Asia/Thimphu", el_salvador: "America/El_Salvador" };
  const ALL_TZ = (() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return []; } })();
  function findTz(v) {
    v = String(v || "").trim(); if (!v) return null;
    if (/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+)+$|^UTC$/.test(v) && tzOk(v)) return v;
    const k = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), kk = k.replace(/\s+/g, "_");
    const land = TZ_LAND[v.toLowerCase().replace(/\s+/g, "_")] || TZ_LAND[kk]; if (land) return land;
    return ALL_TZ.find((z) => z.split("/").pop().toLowerCase() === kk) || null;
  }
  const clocksText = () => clocks.map((c) => `${c.n} = ${c.tz}`).join("\n");
  $("setMineOn").addEventListener("change", (e) => { mineOn = e.target.checked; if (mineOn && pagesOn) { for (const [n, pf] of Object.entries(pages)) if (n !== page && pf) pf.hiddenBlocks = [...new Set([...(pf.hiddenBlocks || []), "mine"])]; if (hiddenSet.delete("mine")) applyHidden(); window.jarvis.setConfig({ pages, hiddenBlocks: [...hiddenSet] }); } renderMine(); window.jarvis.setConfig({ mineOn }); });
  $("setMineAddr").addEventListener("change", (e) => { mineAddr = e.target.value.trim(); mineData = mineData ? { ...mineData, pool: null } : null; renderMine(); window.jarvis.setConfig({ mineAddr }); });
  $("setClocksOn").addEventListener("change", (e) => { clocksOn = e.target.checked; renderClocks(true); fitPanel?.(); window.jarvis.setConfig({ clocksOn }); });
  $("setClocks").addEventListener("change", (e) => {
    const out = [], bad = [];
    for (const line of e.target.value.split(/\n/)) {
      if (!line.trim()) continue;
      const m = /^\s*(.+?)\s*[=:]\s*(.+?)\s*$/.exec(line), name = (m ? m[1] : line).trim(), tz = findTz(m ? m[2] : line);
      if (tz) out.push({ n: name.slice(0, 24), tz }); else bad.push(line.trim());
    }
    clocks = out.slice(0, 10); renderClocks(true); fitPanel?.(); window.jarvis.setConfig({ clocks });
    $("clocksNote").textContent = bad.length ? `Nicht erkannt: ${bad.join(", ")}. Format: Name = Stadt oder Land, z. B. Farm = Asuncion.` : "Gespeichert. Deine Ortszeit steht vorn, Uhren mit derselben Zeit werden ausgeblendet.";
  });
  window.jarvis.getConfig?.().then((c) => {
    mineOn = c.mineOn !== false; mineAddr = c.mineAddr || ""; mineData = c.mining || null; clocksOn = c.clocksOn !== false; clocks = Array.isArray(c.clocks) ? c.clocks : [];
    $("setMineOn").checked = mineOn; $("setMineAddr").value = mineAddr; $("setClocksOn").checked = clocksOn; $("setClocks").value = clocksText();
    $("setGameMode").checked = !!c.gameMode; gameMode = !!c.gameMode; $("setSnap").checked = c.snapGuides !== false; snapOn = c.snapGuides !== false;
    renderMine(); renderClocks(true);
  });
  $("setGameMode").addEventListener("change", (e) => { gameMode = e.target.checked; window.jarvis.setConfig({ gameMode }); });
  $("setSnap").addEventListener("change", (e) => { snapOn = e.target.checked; window.jarvis.setConfig({ snapGuides: snapOn }); });

