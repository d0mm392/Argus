"use strict";
  // ---------- Bedienung direkt an der Kugel ----------
  // Kugel ziehen = verschieben, Rand ziehen = Größe ändern, kurz anklicken = Panel auf/zu.
  // Leere Fensterfläche lässt Klicks zum Desktop durch.
  let labelScale = 1, tempScale = 1, appScale = 1;
  // Im Panel bestimmt ballScale, wie viel Höhe die Kugel bekommt
  const applyBallScale = () => { if (started) resize(); };
  window.jarvis.getConfig().then((c) => { labelScale = c.labelScale || 1; tempScale = c.tempScale || 1; appScale = c.appScale || 1; ballScale = c.ballScale || 1; applyBallScale(); });
  let overBall = false;
  let layout = { corner: "bottom-right", size: 320 }, gesture = null, rimHot = false, rimGlow = 0, throughOn = false;
  window.jarvis.onLayout((l) => { layout = l; });
  const micFloat = document.querySelector(".controls .mic-btn");
  micFloat.classList.add("mic-float"); stage.append(micFloat);
  makeDraggable(micFloat, () => "mic");
  let micFloatOn = true;
  const rimHint = document.createElement("div"); rimHint.className = "rim-hint"; rimHint.textContent = "Ziehen ändert die Größe"; stage.append(rimHint);
  const rimR = () => S * 1.08, rimTol = () => Math.max(10, S * 0.09);
  function hit(e, raw) {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left - CX, y = e.clientY - r.top - CY, d = Math.hypot(x, y);
    if (!ballOn && !raw) return { d, ang: Math.atan2(y, x), rim: false, inside: false }; // Kugel entfernt: sie fängt keine Klicks, kein Ziehen, keine Größe mehr ab
    return { d, ang: Math.atan2(y, x), rim: Math.abs(d - rimR()) < rimTol(), inside: d <= rimR() - rimTol() };
  }
  const resizeCursor = (ang) => { const a = ((ang * 180 / Math.PI) + 360) % 180; return a < 22.5 || a >= 157.5 ? "ew-resize" : a < 67.5 ? "nwse-resize" : a < 112.5 ? "ns-resize" : "nesw-resize"; };
  // Bildschirmposition aus Fensterposition + Fensterkoordinate (zuverlässiger als e.screenX)
  const scr = (e) => ({ x: e.clientX + window.screenX, y: e.clientY + window.screenY });
  function setThrough(on) { if (on !== throughOn) { throughOn = on; window.jarvis.clickThrough(on); } }
  document.addEventListener("pointermove", (e) => {
    if (gesture) return;
    const h = hit(e);
    rimHot = h.rim; overBall = h.inside;
    canvas.style.cursor = h.rim ? resizeCursor(h.ang) : h.inside ? "pointer" : "default";
    // Durchklicken nur im kleinen Modus und nur, wenn nichts Bedienbares unter der Maus ist
    const overUi = e.target.closest?.(".lbl, .temp, .appf, .who, .mic-float, .pill, .friends, .settings, .arr-bar, .setup"); // offene Einstellungen nie durchklicken, sonst kommt man nicht mehr raus
    setThrough(!expanded && !h.rim && !h.inside && !overUi && !drag); // beim Ziehen nie durchklicken, sonst fällt das Teil unterwegs runter
  });
  document.documentElement.addEventListener("pointerleave", () => { if (!gesture) { rimHot = false; overBall = false; } });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener("auxclick", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button > 2) return;
    const h = hit(e);
    if (!h.rim && !h.inside) return;
    if (e.button === 2 || e.button === 1) { // rechte Maustaste oder Mausrad gedrückt: Form drehen
      e.preventDefault(); // kein Auto-Scrollen beim Mausrad-Klick
      canvas.setPointerCapture(e.pointerId);
      const p = scr(e); gesture = { type: "rotate", lx: p.x, ly: p.y }; dragging = true; canvas.style.cursor = "grabbing";
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    autoExpanded = false; clearTimeout(collapseTimer);
    const p = scr(e);
    gesture = h.rim
      ? { type: "size", d0: h.d, size0: layout.size, ball0: ballScale, sx: p.x - h.d * Math.cos(h.ang), sy: p.y - h.d * Math.sin(h.ang), raf: 0 }
      : { type: "press", x: p.x, y: p.y };
  });
  // Auf dem Dokument lauschen, damit Ziehen auch außerhalb der Kugel weiterläuft
  document.addEventListener("pointermove", (e) => {
    if (!gesture) return;
    const p = scr(e);
    if (gesture.type === "press" && Math.hypot(p.x - gesture.x, p.y - gesture.y) > 5) {
      // Im Panel dreht Ziehen die Kugel (das Panel verschiebt man an der Kopfleiste), klein verschiebt es das Fenster
      // Im Panel verschiebt Linksziehen die Form, Rechtsziehen dreht sie
      if (expanded) { if (roam.x || roam.y) { ballOff = { x: ballOff.x + (CX - homeX) / W, y: ballOff.y + (CY - homeY) / H }; roam.x = roam.y = roam.vx = roam.vy = 0; roam.mode = "rest"; roam.t = 4; } gesture = { type: "ballmove", sx: p.x, sy: p.y, ox: ballOff.x, oy: ballOff.y }; }
      else { gesture.type = "move"; window.jarvis.moveStart(); }
      canvas.style.cursor = "grabbing";
    }
    if (gesture.type === "ballmove") {
      ballOff = { x: Math.max(-0.5, Math.min(0.5, gesture.ox + (p.x - gesture.sx) / W)), y: Math.max(-0.5, Math.min(0.5, gesture.oy + (p.y - gesture.sy) / H)) };
      resize();
    }
    if (gesture.type === "rotate") {
      const dx = p.x - gesture.lx, dy = p.y - gesture.ly; gesture.lx = p.x; gesture.ly = p.y;
      ay += dx * 0.009; ax = Math.max(-1.3, Math.min(1.3, ax + dy * 0.009));
      vy = dx * 0.009 * 0.35; // Schwung beim Loslassen
    }
    if (gesture.type === "size") {
      // Abstand zum Kugelmittelpunkt beim Start: weiter raus = größer, rein = kleiner
      const g = gesture, d = Math.hypot(p.x - g.sx, p.y - g.sy);
      if (!g.live && Math.abs(d - g.d0) < 4) return; // nur Halten, noch kein Ziehen
      g.live = true;
      const k = Math.max(0.3, d / Math.max(20, g.d0));
      if (expanded) { setBallScale(g.ball0 * k); return; } // im Panel ändert der Rand nur die Kugel, nicht das Fenster
      const want = g.size0 * k;
      cancelAnimationFrame(g.raf); g.raf = requestAnimationFrame(() => window.jarvis.setSize(want));
    }
  });
  let held = null, heldEl = null; // was gerade mit gedrückter linker Taste gehalten wird
  lblLayer.addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".lbl, .temp, .appf");
    if (e.button === 0 && t) { held = t.classList.contains("lbl") ? "label" : "temp"; heldEl = t; t.setPointerCapture(e.pointerId); }
  });
  document.addEventListener("pointerup", () => { held = null; heldEl = null; });
  function setBallScale(v) { ballScale = Math.max(0.6, Math.min(1.8, v)); applyBallScale(); window.jarvis.setScale("ballScale", ballScale); }
  // kleine Prozentanzeige neben dem Mauszeiger, solange per Mausrad die Größe geändert wird
  const pctTip = document.createElement("div"); pctTip.className = "pct-tip"; document.body.append(pctTip); let pctT = null;
  function showPct(e, v) {
    pctTip.textContent = Math.round(v * 100) + " %"; pctTip.style.transform = `translate(${Math.round(e.clientX + 14)}px, ${Math.round(e.clientY - 26)}px)`; pctTip.classList.add("on");
    clearTimeout(pctT); pctT = setTimeout(() => pctTip.classList.remove("on"), 900);
  }
  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return;
    // Mausrad über einer Anzeige, Beschriftung oder einem Programm-Symbol: dessen Größe, wie bei der Kugel
    // Status-Anzeige (Leerlauf …): eigene Größe je Ansicht
    const pl = e.target.closest?.("#pill");
    if (pl && !held) { e.preventDefault(); const o = pillOff[pillKey()]; o.s = Math.max(0.5, Math.min(3, (o.s || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); applyPill(); showPct(e, o.s); clearTimeout(scaleSave); scaleSave = setTimeout(() => window.jarvis.setConfig({ pillOff }), 400); return; }
    const over = e.target.closest?.(".lbl, .temp, .appf, .who, .media, .ringh, .strata-float");
    if (over && !held && over.dataset.pk) {
      // Nur das Teil unter der Maus wird größer oder kleiner
      e.preventDefault();
      const k = over.dataset.pk, f2 = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      scales[k] = Math.max(0.5, Math.min(3, (scales[k] || 1) * f2)); showPct(e, scales[k]);
      if (Math.abs(scales[k] - 1) < 0.03) delete scales[k];
      clearTimeout(scaleSave); scaleSave = setTimeout(() => window.jarvis.setConfig({ scales }), 400);
      return;
    }
    // Im Panel reicht das Mausrad über der Kugel, ohne Taste; klein: Taste halten + Mausrad
    const h = expanded && !held && e.target === canvas ? hit(e) : null;
    const overBall = !!h && (h.inside || h.rim);
    if (!(e.buttons & 1) && !overBall) return;
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.035 : 1 / 1.035;
    // Festhalten + Mausrad: nur das gehaltene Teil wird größer/kleiner (mit Umschalt: alle dieser Art zusammen)
    if (held && heldEl?.dataset.pk && !e.shiftKey) {
      const k = heldEl.dataset.pk, f2 = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      scales[k] = Math.max(0.5, Math.min(3, (scales[k] || 1) * f2)); showPct(e, scales[k]);
      if (Math.abs(scales[k] - 1) < 0.03) delete scales[k];
      clearTimeout(scaleSave); scaleSave = setTimeout(() => window.jarvis.setConfig({ scales }), 400);
    }
    else if (held === "label") { labelScale = Math.max(0.6, Math.min(2.5, labelScale * f)); window.jarvis.setScale("labelScale", labelScale); showPct(e, labelScale); }
    else if (held === "temp") { tempScale = Math.max(0.6, Math.min(2.5, tempScale * f)); window.jarvis.setScale("tempScale", tempScale); showPct(e, tempScale); }
    else if (expanded && (overBall || gesture)) {
      if (gesture && gesture.type === "press") gesture.type = "wheel"; // Loslassen klappt dann nicht zu
      setBallScale(ballScale * f); showPct(e, ballScale);
    }
    else if (gesture && gesture.type !== "size" && gesture.type !== "rotate") {
      if (gesture.type === "move") window.jarvis.moveEnd();
      gesture.type = "wheel"; // Loslassen öffnet dann nicht das Panel
      window.jarvis.resizeBy(f);
    }
  }, { passive: false });
  // Panel wie ein normales Fenster an jeder Kante und Ecke größer/kleiner ziehen; Doppelklick = Standardgröße
  const panelEdges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((k) => {
    const el = document.createElement("div"); el.className = "edge edge-" + k; el.dataset.k = k; document.body.append(el);
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); el.classList.add("active");
      // Freundesliste nicht festhalten: sonst landet der Klick auf der Liste statt auf Person oder „Beitreten“
      if (!el.classList.contains("friends")) try { el.setPointerCapture(e.pointerId); } catch {} // Loslassen auch außerhalb des Fensters mitbekommen
      st = { el, k };
      window.jarvis.panelResizeStart(k);
    });
    el.addEventListener("lostpointercapture", () => endEdge());
    el.addEventListener("dblclick", () => window.jarvis.setPanelSize(0, 0));
    return el;
  });
  let st = null;
  const endEdge = () => { if (st) { st.el.classList.remove("active"); window.jarvis.panelResizeEnd(); } st = null; };
  window.addEventListener("blur", endEdge);
  document.addEventListener("pointerup", endEdge); document.addEventListener("pointercancel", endEdge);

  const endGesture = () => {
    if (!gesture) return;
    if (gesture.type === "press") window.jarvis.toggleExpanded();
    if (gesture.type === "move") window.jarvis.moveEnd();
    if (gesture.type === "rotate") dragging = false;
    if (gesture.type === "ballmove") window.jarvis.setConfig({ ballOff });
    gesture = null; canvas.style.cursor = "";
  };
  document.addEventListener("pointerup", endGesture);
  canvas.addEventListener("pointercancel", () => { if (gesture?.type === "move") window.jarvis.moveEnd(); dragging = false; gesture = null; });
  window.addEventListener("blur", () => { if (gesture?.type === "move") window.jarvis.moveEnd(); dragging = false; gesture = null; });

  // Schwebende Anzeigen: Temperaturen, Takt und Lüfter; jede einzeln an/aus und in eigener Farbe
  const tempHue = (v) => Math.max(0, Math.min(140, 140 - (v - 45) * 3.5)); // 45 °C grün, 85 °C rot
  const fmtGHz = (v) => v == null ? null : v.toFixed(2).replace(".", ",") + " GHz";
  const fanOf = (i) => sys.fans?.[i];
  const ALT_COINS = ["ETH", "SOL", "XRP", "LTC", "DOGE", "KAS", "BNB", "ADA"];
  let coinSel = ["BTC"];
  // Preis mit Pfeil (▲ seit gestern gestiegen, ▼ gefallen); kleine Kurse mit Nachkommastellen
  const coinTxt = (v, ch) => { const n = v >= 100 ? Math.round(v).toLocaleString("de-DE") : v.toLocaleString("de-DE", { maximumFractionDigits: v >= 1 ? 2 : 4, minimumFractionDigits: v >= 1 ? 2 : 4 });
    return (ch == null ? "" : ch >= 0 ? "▲ " : "▼ ") + (btcCur === "EUR" ? n + " €" : "$" + n); };
  const BADGES = [
    { key: "cpuT", w: "cpuTemp", name: "CPU", ang: -2.2, ph: 0, keepNa: true, get: () => sys.temp, txt: (v) => v + " °C", auto: tempHue },
    { key: "gpuT", w: "gpuTemp", name: "GPU", ang: -0.94, ph: 2.1, keepNa: true, get: () => sys.gpuTemp, txt: (v) => v + " °C", auto: tempHue, tip: () => sys.gpuName || "" },
    { key: "cpuC", w: "cpuClock", name: "CPU", ang: -2.72, ph: 1.1, get: () => sys.cpuGHz, txt: fmtGHz },
    { key: "gpuC", w: "gpuClock", name: "GPU", ang: -0.42, ph: 3.3, get: () => sys.gpuGHz, txt: fmtGHz },
    // Bitcoin-Kurs (CoinMarketCap): grün bei Plus, rot bei Minus; Klick öffnet die Quelle
    { key: "btc", w: "btc", name: "BTC", ang: -1.57, ph: 5.2, get: () => market?.btc?.[btcCur.toLowerCase()]?.price, txt: (v) => coinTxt(v, market?.btc?.[btcCur.toLowerCase()]?.change),
      auto: () => { const c = market?.btc?.[btcCur.toLowerCase()]?.change; return c == null ? CORE_HUE : c >= 0 ? 145 : 4; },
      tip: () => { const q = market?.btc?.[btcCur.toLowerCase()]; return (q?.change != null ? (q.change > 0 ? "+" : "") + q.change.toFixed(2).replace(".", ",") + " % in 24 Stunden · " : "") + "Quelle: " + (market?.btc?.source || "") + " (Klick öffnet)"; },
      click: () => market?.btc?.url && window.jarvis.openUrl(market.btc.url), trend: true },
    // Weitere Coins (Einstellungen → Lagebild): eigene Anzeige je Coin, grün/rot nach 24 h, Pfeil zeigt die Richtung
    ...ALT_COINS.map((sym, i) => ({ key: "c_" + sym, w: "coin_" + sym, name: sym, ang: -1.57 + (i % 2 ? 1 : -1) * (0.36 + 0.3 * Math.floor(i / 2)), ph: 9 + i, trend: true,
      get: () => coinSel.includes(sym) ? market?.coins?.[sym]?.[btcCur.toLowerCase()]?.price : undefined, txt: (v) => coinTxt(v, market?.coins?.[sym]?.[btcCur.toLowerCase()]?.change),
      auto: () => { const c = market?.coins?.[sym]?.[btcCur.toLowerCase()]?.change; return c == null ? CORE_HUE : c >= 0 ? 145 : 4; },
      tip: () => { const q = market?.coins?.[sym]?.[btcCur.toLowerCase()]; return (q?.change != null ? (q.change > 0 ? "+" : "") + q.change.toFixed(2).replace(".", ",") + " % in 24 Stunden · " : "") + "Quelle: " + (market?.coins?.[sym]?.source || "") + " (Klick öffnet)"; },
      click: () => market?.coins?.[sym]?.url && window.jarvis.openUrl(market.coins[sym].url) })),
    // Mining-Seite: eigene Anzeigen aus Foreman und OCEAN, genauso frei verschiebbar wie die anderen
    { key: "mOn", w: "mOnline", name: "MINER ONLINE", page: "Mining", ang: -2.5, ph: 1.4, get: () => { const f = fmTot(); return f?.n ? f.on + " / " + f.n : undefined; }, txt: (v) => v, auto: () => { const f = fmTot(), r = f.on / f.n; return r >= 0.97 ? 145 : r >= 0.9 ? 38 : 4; }, tip: () => "Alle Farmen zusammen" },
    { key: "mHr", w: "mHash", name: "HASHRATE", page: "Mining", ang: -1.9, ph: 2.4, get: () => fmTot()?.hr || undefined, txt: (v) => fmtHash(v) + (fmTot().pct ? " · " + fmTot().pct + " %" : ""), auto: () => { const p = fmTot().pct; return !p || p >= 95 ? 145 : p >= 85 ? 38 : 4; }, tip: () => "Summe SHA-256, Prozent vom Nennwert" },
    { key: "mOff", w: "mOffline", name: "OFFLINE", page: "Mining", ang: -1.25, ph: 3.4, get: () => fmTot()?.off, txt: (v) => String(v), auto: (v) => v ? 4 : 145, tip: () => (fmTot()?.offNames || []).slice(0, 12).join(", ") + " · Klick öffnet Foreman", click: () => window.jarvis.openUrl("https://dashboard.foreman.mn/dashboard/miners/") },
    { key: "mHot", w: "mHot", name: "HEISSESTER", page: "Mining", ang: -0.6, ph: 4.4, get: () => fmTot()?.hot ?? undefined, txt: (v) => Math.round(v) + " °C", auto: (v) => v >= 90 ? 4 : v >= 80 ? 38 : 145, tip: () => fmTot()?.hotName || "", click: () => fmTot()?.hotM && openMiner(fmTot().hotM) },
    { key: "mRev", w: "mRevenue", name: "ERTRAG 24 H", page: "Mining", ang: 0.2, ph: 5.4, get: () => minePool()?.day ?? undefined, txt: (v) => sats(v / 1e8), tip: () => "OCEAN, letzte 24 Stunden" },
    { key: "mPool", w: "mPool", name: "POOL 10 MIN", page: "Mining", ang: 0.9, ph: 6.4, get: () => minePool()?.hr?.m10 ?? undefined, txt: (v) => fmtHash(v), tip: () => "Hashrate beim Pool (OCEAN)" },
    { key: "mHp", w: "mHashprice", name: "HASHPRICE", page: "Mining", ang: 1.6, ph: 7.4, get: () => mineData?.net?.hashprice?.[btcCur === "EUR" ? "eur" : "usd"] ?? undefined, txt: (v) => money(v, btcCur === "EUR" ? "EUR" : "USD") + " /PH/Tag" },
    // Wetter am Standort: Symbol und Temperatur, Ort als Name, Einzelheiten im Tooltip
    { key: "wx", w: "weather", name: "", ang: 1.3, ph: 8.4, get: () => wxData?.data?.cur?.temp, txt: (v) => wmo(wxData.data.cur.code, wxData.data.cur.day)[0] + " " + Math.round(v) + " °C",
      label: () => (wxData?.loc?.city || "Wetter").toUpperCase().slice(0, 14),
      tip: () => { const c = wxData?.data?.cur, d = wxData?.data?.days?.[0]; return c ? `${wmo(c.code, c.day)[1]}, gefühlt ${Math.round(c.feels)} °C, Wind ${Math.round(c.wind)} km/h` + (d ? `\nHeute ${Math.round(d.min)} bis ${Math.round(d.max)} °C, Regen ${d.rain ?? 0} %` : "") : ""; } },
    // Wer online ist: Steam-Freunde und Discord-Server; Klick öffnet das Lagebild
    { key: "steam", w: "steam", name: "STEAM", ang: 0.55, ph: 6.1, get: () => market?.steam?.online?.length, txt: (v) => v + " online",
      cycle: () => (market?.steam?.online || []).map((f) => f.name + (f.game ? " · " + f.game : "")),
      tip: () => (market?.steam?.online || []).slice(0, 12).map((f) => f.name + (f.game ? " – " + f.game : "")).join("\n") || "Kein Freund online", click: () => window.jarvis.setConfig({ newsOn: true }) },
    { key: "dc", w: "discord", name: "DISCORD", ang: 2.6, ph: 7.3,
      cycle: () => (market?.discord?.servers || []).filter((x) => !x.error).flatMap((x) => x.online.filter((m) => !dcVoiceOnly || m.voice).map((m) => m.name + (m.voice ? " · " + m.voice : m.game ? " · " + m.game : ""))).slice(0, 40), get: () => { const sv = (market?.discord?.servers || []).filter((x) => !x.error); return sv.length ? sv.reduce((n, x) => n + (x.count || 0), 0) : null; }, txt: (v) => v + " online",
      tip: () => (market?.discord?.servers || []).filter((x) => !x.error).map((x) => x.server + ": " + x.online.filter((m) => m.voice).map((m) => m.name + " (" + m.voice + ")").join(", ")).join("\n") || "", click: () => window.jarvis.setConfig({ newsOn: true }) },
    ...[2.95, 0.12, 2.15, 0.98].map((ang, i) => ({ key: "fan" + i, w: "fans", name: "", ang, ph: 4 + i, get: () => fanOf(i)?.val,
      txt: (v) => (v === 0 ? "steht" : v + " " + (fanOf(i)?.unit || "rpm")), label: () => (fanOf(i)?.name || "Lüfter").replace(/#/g, "").replace(/\s+/g, " ") })),
  ];
  let widgets = {}, market = null, btcCur = "USD";
  window.jarvis.onVoiceLive?.((v) => { live = v || { auth: false, ch: {} }; buildFriends(); });
  // Steam-Downloads in der Systemwache: Name, Fortschritt, Tempo, Restzeit
  const fmtB = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB");
  window.jarvis.onSteamDl?.((list) => {
    $("steamDl").replaceChildren(...(list || []).map((d) => {
      const el = document.createElement("div"); el.className = "dl" + (d.active ? "" : " paused");
      const n = document.createElement("span"), v = document.createElement("b"), bar = document.createElement("i");
      n.textContent = d.name + (d.phase === "installiert" ? " (installiert)" : "");
      const eta = d.rate > 0 ? Math.round((d.total - d.done) / d.rate) : 0;
      const etaT = eta ? (eta >= 3600 ? Math.floor(eta / 3600) + " h " + Math.round(eta % 3600 / 60) + " min" : Math.max(1, Math.round(eta / 60)) + " min") : "";
      v.textContent = `${d.pct} %` + (d.active && d.rate > 0 ? ` · ${(d.rate / 1e6).toFixed(1)} MB/s · ${etaT}` : d.active ? "" : " · pausiert");
      el.title = `${d.name}: ${fmtB(d.done)} von ${fmtB(d.total)}`;
      bar.style.setProperty("--v", d.pct + "%"); el.append(n, v, bar); return el;
    }));
  });
  window.jarvis.onVoiceBot?.((v) => { bot = v || { status: "aus", guilds: [] }; buildFriends(); setBotStatus(); });
  window.jarvis.onMarket?.((m) => { market = m; for (const t of temps) if (t.trend || ["steam", "dc"].includes(t.key)) t.val = undefined; buildFriends(); });
  const temps = BADGES.map((b) => {
    const el = document.createElement("div"); el.className = "temp na off" + (b.click ? " link" : "");
    el.innerHTML = `<small>${b.name}</small><span>–</span>`;
    if (b.click) el.addEventListener("click", (e) => { e.stopPropagation(); b.click(); });
    makeDraggable(el, () => "t:" + b.key); el.dataset.pk = "t:" + b.key;
    lblLayer.append(el);
    return { ...b, el, val: undefined, hueSet: undefined };
  });
  // Anzeige, welche KI erreichbar ist und welche gerade antwortet
  const who = document.createElement("div"); who.className = "who off";
  who.innerHTML = `<span data-k="claude" style="--h:22"><i></i>Claude</span><span data-k="local" style="--h:150"><i></i>Lokal</span>`;
  lblLayer.append(who); who.dataset.pk = "ai";
  // „Läuft gerade“ (Apple Music oder andere Musik-App über die Windows-Mediensteuerung): ziehbar, Mausrad = Größe
  const media = document.createElement("div"); media.className = "media"; media.dataset.pk = "media";
  const MI = { prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2.2v14H6zM19 5.5v13L9.5 12z"/></svg>', next: '<svg viewBox="0 0 24 24"><path d="M15.8 5H18v14h-2.2zM5 5.5v13l9.5-6.5z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13L18.5 12z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/></svg>' };
  media.innerHTML = `<div class="mh"><span class="mapp">Musik</span><b class="mst"></b></div><img class="art" alt=""><div class="mt"><span></span></div><div class="ma"></div><div class="mrow"><button type="button" data-c="prev" title="Zurück">${MI.prev}</button><button type="button" class="mplay" data-c="play" title="Abspielen/Pause">${MI.play}</button><button type="button" data-c="next" title="Weiter">${MI.next}</button><span class="mvi" title="Lautstärke">${MI.vol}</span><input class="mvol" type="range" min="0" max="100" step="1" title="Lautstärke der Musik-App"></div><div class="mtime"><span class="mcur">0:00</span><span class="mbar" title="Fortschritt"><i></i></span><span class="mlen"></span></div><span class="mgrip" title="Ziehen: Größe ändern"></span>`;
  lblLayer.append(media); makeDraggable(media, () => "media");
  const strataBtn = $("strataBtn"); strataBtn.classList.add("strata-float"); strataBtn.dataset.pk = "strata"; lblLayer.append(strataBtn); makeDraggable(strataBtn, () => "strata");
  let mediaSt = { on: false }, mediaOn = true, volBusy = 0;
  // Lautstärke: wirkt auf die Musik-App selbst (wie im Windows-Lautstärkemixer), sonst auf die Gesamtlautstärke
  const mvol = media.querySelector(".mvol");
  for (const ev of ["pointerdown", "wheel"]) mvol.addEventListener(ev, (e) => e.stopPropagation());
  mvol.addEventListener("input", () => { mvol.style.setProperty("--v", mvol.value + "%"); volBusy = Date.now(); window.jarvis.mediaCmd?.("vol:" + (mvol.value / 100).toFixed(2)); });
  // Größe an der Ecke unten rechts ziehen (wie Mausrad)
  { const g = media.querySelector(".mgrip"); let st = null;
    g.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); st = { x: e.clientX, w: media.offsetWidth, s: scales.media || 1 }; });
    window.addEventListener("pointermove", (e) => { if (!st) return; scales.media = Math.max(0.6, Math.min(3, st.s * (st.w + e.clientX - st.x) / st.w)); }, true);
    window.addEventListener("pointerup", () => { if (!st) return; st = null; noClick = media; setTimeout(() => { if (noClick === media) noClick = null; }, 50); window.jarvis.setConfig({ scales }); }, true); }
  { const x = document.createElement("button"); x.type = "button"; x.className = "blk-x"; x.textContent = "×"; x.title = "Musik-Player ausblenden (wieder an: Einstellungen › Musik)";
    x.addEventListener("pointerdown", (e) => e.stopPropagation()); // sonst fängt der Musik-Player den Zeiger ein und der Klick kommt nie an
    x.addEventListener("click", (e) => { e.stopPropagation(); mediaOn = false; renderMedia(); $("setMedia").checked = false; window.jarvis.setConfig({ mediaOn }); }); media.append(x); }
  for (const b of media.querySelectorAll("button:not(.blk-x)")) {
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.stopPropagation(); window.jarvis.mediaCmd?.(b.dataset.c); if (b.dataset.c === "play") { mediaSt.playing = !mediaSt.playing; renderMedia(); } });
  }
  function renderMedia() {
    const m = mediaSt, on = mediaOn && m.on && !!(m.title || m.artist);
    media.classList.toggle("on", on); if (!on) return;
    media.classList.toggle("paused", !m.playing);
    const mt = media.querySelector(".mt"); if (mt.firstChild.textContent !== (m.title || "")) { mt.firstChild.textContent = m.title || ""; media.mqAt = 0; }
    const app = /apple/i.test(m.app || "") ? "Apple Music" : /spotify/i.test(m.app || "") ? "Spotify" : /chrome|edge|firefox|brave|opera/i.test(m.app || "") ? "Browser" : "";
    media.querySelector(".mapp").textContent = "Musik" + (app ? " · " + app : ""); media.querySelector(".mst").textContent = m.playing ? "Spielt" : "Pausiert"; media.querySelector(".ma").textContent = [m.artist, m.album].filter(Boolean).join(" · ");
    const img = media.querySelector(".art"); if (m.art && img.src !== m.art) img.src = m.art; else if (!m.art) img.removeAttribute("src");
    media.title = (m.title || "") + (m.artist ? " – " + m.artist : "") + (/apple/i.test(m.app || "") ? " (Apple Music)" : "");
    media.querySelector("[data-c=play]").innerHTML = m.playing ? MI.pause : MI.play;
    if (m.vol != null && Date.now() - volBusy > 2500) { mvol.value = Math.round(Math.abs(m.vol < 0 ? -1 - m.vol : m.vol) * 100); mvol.style.setProperty("--v", mvol.value + "%"); mvol.title = m.vol < 0 ? "Gesamtlautstärke (die App hat keinen eigenen Regler)" : "Lautstärke der Musik-App"; }
  }
  window.jarvis.onMedia?.((m) => { mediaSt = { ...m, rx: Date.now() }; renderMedia(); });
  makeDraggable(who, () => "ai");
  let aiSt = null, aiBusy = null;
  function renderWho() {
    const [c, l] = who.children;
    const cUp = !!(aiSt?.claude || aiSt?.apiKey), lUp = !!aiSt?.local;
    c.classList.toggle("up", cUp); l.classList.toggle("up", lUp);
    c.classList.toggle("busy", aiBusy === "claude"); l.classList.toggle("busy", aiBusy === "local");
    c.title = aiBusy === "claude" ? "Claude antwortet gerade" : cUp ? "Claude erreichbar (" + (aiSt.apiKey ? "API-Key" : "über dein Abo") + ")"
      : aiSt?.claudeWhy || (aiSt?.claudeFound ? "Claude ist in den Einstellungen abgeschaltet" : "Claude Code nicht installiert oder nicht angemeldet");
    l.title = aiBusy === "local" ? "Lokale KI antwortet gerade" : lUp ? "Lokale KI bereit: " + aiSt.local : aiSt?.localText || "Lokale KI nicht bereit";
    // Eingabefeld nennt die KI, die gerade antworten würde
    const sName = aiSt?.localKind === "strata" || (!lUp && aiSt?.strataWake) ? "Strata" : "lokale KI", localFirst = aiSt?.share && aiSt.share !== "claude";
    const ph = aiBusy === "claude" ? "Claude antwortet …" : aiBusy === "local" ? sName + " antwortet …"
      : (lUp || aiSt?.strataWake) && (localFirst || !cUp) ? `Frag ${sName}${!lUp ? " (startet bei Bedarf)" : ""} …` : cUp ? "Frag Claude …" : aiSt?.mode === "none" ? "Befehl eingeben (ohne KI) …" : "Frag Argus …";
    $("askInput").placeholder = ph.replace(" (startet bei Bedarf)", ""); $("askInput").title = (ph.includes("startet bei Bedarf") ? "Strata ist gerade aus und startet bei der ersten Frage (ca. 20 s). " : "") + "Umschalt+Enter: neue Zeile";
    who.title = aiSt?.mode === "auto" && cUp && lUp ? "Team: kurze Fragen beantwortet die lokale KI, anspruchsvolle Claude" : "";
  }
  window.jarvis.onAiStatus?.((st) => { aiSt = st; renderWho(); });
  window.jarvis.onAiWho?.((w) => { aiBusy = w.who === "claude" || w.who === "local" ? w.who : null; if (w.who) aiName = w.who === "local" ? (/strata/i.test(w.label || "") ? "Strata" : "Lokal") : w.who === "claude" ? "Claude" : "Argus"; renderWho(); if (w.label) log("Antwortet: " + w.label); });
  window.jarvis.aiStatus?.().then((st) => { aiSt = st; renderWho(); });

  // Laufende Programme: jedes Symbol schwebt einzeln; welche erscheinen, steht in den Einstellungen
  let hiddenApps = new Set();
  const appEls = new Map(); // key → { el, ph, x, y }
  const seenApps = new Map(); // alle Programme dieser Sitzung, für die Einstellungen
  function syncApps() {
    const on = widgets.apps?.on !== false;
    const list = on ? (sys.apps || []).filter((a) => !hiddenApps.has(a.key)) : [];
    for (const a of sys.apps || []) seenApps.set(a.key, a.name);
    const keep = new Set(list.map((a) => a.key));
    // Verschwundene Programme ausblenden und einmalig entfernen; taucht das Programm vorher wieder auf, bleibt sein Symbol (sonst entstanden doppelte Symbole)
    for (const [k, o] of appEls) if (!keep.has(k) && !o.dying) {
      o.el.classList.add("gone");
      o.dying = setTimeout(() => { o.dying = 0; if (o.el.classList.contains("gone") && appEls.get(k) === o) { o.el.remove(); appEls.delete(k); } }, 600);
    }
    for (const a of list) {
      let o = appEls.get(a.key);
      if (!o) {
        const el = document.createElement("button"); el.type = "button"; el.className = "appf gone"; el.dataset.name = a.name; el.setAttribute("aria-label", a.name + " öffnen");
        el.addEventListener("click", (e) => { e.stopPropagation(); window.jarvis.action("öffne " + a.name); });
        makeDraggable(el, () => "app:" + a.key); el.dataset.pk = "app:" + a.key;
        lblLayer.append(el);
        o = { el, ph: Math.random() * 6.28, icon: null, x: null, y: null };
        appEls.set(a.key, o);
        requestAnimationFrame(() => el.classList.remove("gone"));
      }
      if (o.dying) { clearTimeout(o.dying); o.dying = 0; }
      // Name mit Last: was gerade wie viel zieht
      const tip = a.name + (a.cpu != null ? ` · CPU ${a.cpu.toFixed(a.cpu < 10 ? 1 : 0).replace(".", ",")} %` : "") + (a.memGB != null ? ` · RAM ${a.memGB.toFixed(1).replace(".", ",")} GB` : "");
      if (o.el.dataset.name !== tip) o.el.dataset.name = tip;
      if (viz.apps !== false) { o.el.style.setProperty("--ah", appHue(a.key || a.name).toFixed(0)); o.el.style.setProperty("--al", Math.min(1, (a.cpu || 0) / 30).toFixed(2)); }
      else o.el.style.removeProperty("--ah");
      o.load = a;
      o.el.classList.remove("gone");
      if (o.icon !== (a.icon || "")) {
        o.icon = a.icon || "";
        if (a.icon) { const img = new Image(); img.src = a.icon; img.alt = ""; o.el.replaceChildren(img); } else o.el.textContent = a.name.slice(0, 2);
      }
    }
    return list;
  }
  function placeApps(dt) {
    const list = syncApps(), n = list.length;
    if (!n) return;
    const size = Math.max(18, Math.min(32, S * 0.15)) * appScale;
    lblLayer.style.setProperty("--dk", size + "px");
    // Auf einem Bogen unter der Kugel verteilt, jedes Symbol schwebt mit eigenem Rhythmus
    const step = Math.min(0.42, 1.9 / n), a0 = Math.PI / 2 - (step * (n - 1)) / 2;
    list.forEach((a, i) => {
      const o = appEls.get(a.key); if (!o) return;
      // Größe nach Last, die das Programm verursacht: CPU zählt am meisten, viel RAM etwas
      const want = 0.95 + Math.min(1, (a.cpu || 0) / 20) * 0.8 + Math.min(0.35, ((a.memGB || 0) / 4) * 0.35);
      o.s = o.s == null ? want : o.s + (want - o.s) * (1 - Math.exp(-dt * 2));
      const is = scales["app:" + a.key] || 1;
      o.el.style.setProperty("--s", (o.s * is).toFixed(3));
      const sz = size * o.s * is, key = "app:" + a.key, live = drag?.key === key && drag.moved;
      const ang = a0 + i * step;
      const pos = anchor(key, ang, 1.16, o.ph, sz, sz, 0.7);
      const k = o.x == null || live ? 1 : 1 - Math.exp(-dt * 6); // neue Plätze weich anfahren, wenn Programme dazukommen oder gehen
      o.x = o.x == null ? pos.x : o.x + (pos.x - o.x) * k; o.y = o.y == null ? pos.y : o.y + (pos.y - o.y) * k;
      o.el.style.transform = `translate(${Math.round(o.x)}px, ${Math.round(o.y)}px)`;
    });
  }

  let vsize = null, talkGlow = 0, freqData = null;
  const wave = new Float32Array(26), waveTarget = new Float32Array(26);
  let lastT = performance.now(), time = 0, lite = false;
  let lastAct = performance.now(), fpsIdle = 30, fpsMax = 60;
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel"]) addEventListener(ev, () => { lastAct = performance.now(); }, { passive: true, capture: true });
  function frame(now, once) {
    if (gameMode && sys?.fullscreen && !once && !drag) { // Spielmodus: läuft ein Programm im Vollbild, nur noch ein Bild pro Sekunde
      if (now - gmLast < 1000) { setTimeout(() => requestAnimationFrame(frame), 1000 - (now - gmLast)); return; }
      gmLast = now;
    }
    // Höchstens ~60–72 Bilder pro Sekunde: auf 144/165/240-Hz-Bildschirmen sonst das 2–4-Fache an Rechenlast ohne sichtbaren Gewinn
    // Ruhe-Bildrate (fpsIdle): ohne Maus/Tastatur seit 8 s und ohne Sprechen/Denken/Ziehen reichen 30 (oder weniger) Bilder pro Sekunde.
    // Spart GPU-Last von Argus und von Windows (dwm muss das transparente Fenster seltener neu zusammensetzen)
    const calm = state === "idle" && !talking && !drag && now - lastAct > 8000, minMs = lite ? 33 : calm ? 1000 / fpsIdle - 1 : 1000 / fpsMax - 1;
    if (!once && now - lastT < minMs) { requestAnimationFrame(frame); return; }
    // Einstellungen offen: Kugel und Hintergrund liegen verdeckt darunter, nur selten neu zeichnen. Spart Leistung und verhindert,
    // dass Windows bei transparentem Fenster zwischen zwei Bildern kurz den Desktop durchscheinen lässt (Flackern)
    if (!once && setOpen && now - lastT < 500) { requestAnimationFrame(frame); return; }
    if (!once && !ballOn && !drag && now - lastT < 66) { requestAnimationFrame(frame); return; } // Kugel aus: nur noch Anzeigen nachführen
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; time += dt;
    const speedK = reduceMotion ? 0.3 : 1;
    if (!expanded && W > 0) {
      // Zielgröße kommt vom Hauptprozess; das Fenster springt, die Kugel gleitet
      const target = Math.min(layout.size || W, W, H / 1.08);
      vsize = vsize == null ? target : vsize + (target - vsize) * (1 - Math.exp(-dt * 13));
      const right = layout.corner.endsWith("right"), bottom = layout.corner.startsWith("bottom");
      S = Math.max(60, vsize * 0.29);
      CX = right ? W - vsize / 2 : vsize / 2;
      CY = bottom ? H - vsize * 0.54 - 16 : vsize * 0.54 - 16;
    } else vsize = null;

    if (!dragging) {
      const face = FACING[shape];
      if (face) { // Formen mit Schauseite drehen nicht ganz rum, sondern pendeln und kommen zurück
        swing += dt * speedK * spinK * (0.22 + (state === "thinking" ? 0.3 : 0));
        const TAU = Math.PI * 2, d = ((face.y + face.a * Math.sin(swing) - ay + Math.PI) % TAU + TAU) % TAU - Math.PI;
        ay += d * Math.min(1, dt * 1.5) + vy * 0.9;
        ax += (face.x - ax) * Math.min(1, dt * 1.2);
      } else ay += (0.05 + (state === "thinking" ? 0.08 : 0)) * dt * speedK * spinK + vy * 0.9;
      vy *= 0.92; vx *= 0.9;
    }

    // Leerlauf-Hintergrundaktivität
    if (state === "idle") {
      nextDream -= dt;
      if (nextDream <= 0) {
        const keys = Object.keys(DREAMS), key = keys[(Math.random() * keys.length) | 0];
        daydream = { key, until: time + 3.2 }; nextDream = 9 + Math.random() * 6;
        log("Hintergrund: " + DREAMS[key]);
      }
      for (const r of REGIONS) { r.target = 0; r.task = r.idle; }
      if (voice.on) focus("hoer", 0.32, "Lauscht auf „Hallo Claude“");
      systemScan(dt);
      if (daydream.key && time < daydream.until) focus(daydream.key, 0.42, DREAMS[daydream.key]);
    }

    const sh = STATES[state].hue; stateHue += (sh - stateHue) * Math.min(1, dt * 2.5);
    coreAct += ((state === "thinking" ? 0.7 : state === "idle" ? 0.15 : 0.4) - coreAct) * Math.min(1, dt * 2);
    REGIONS.forEach((r, i) => {
      const breathe = 0.06 + 0.05 * Math.sin(time * 0.7 + i * 1.7);
      const tgt = Math.max(r.target, breathe) + r.bump;
      r.act += (tgt - r.act) * Math.min(1, dt * 3.2);
      r.bump *= Math.pow(0.02, dt);
    });

    // Pulse erzeugen
    REGIONS.forEach((r, ri) => {
      let n = (0.12 + r.act * r.act * 13) * dt * speedK;
      while (n > 0) { if (Math.random() < n) { const cand = regionNodes[ri]; if (cand.length) spawnFrom(cand[(Math.random() * cand.length) | 0]); } n -= 1; }
    });
    if (Math.random() < (0.4 + coreAct * 3) * dt * speedK) spawnFrom((Math.random() * nodes.length) | 0);
    vizSpawn(dt, speedK);

    for (let k = pulses.length - 1; k >= 0; k--) {
      const p = pulses[k]; p.t += p.speed * dt;
      if (p.t >= 1) {
        const nb = nodes[p.b]; nb.flash = 1;
        if (Math.random() < 0.2 + actOf(nb) * 0.45) spawnFrom(p.b);
        pulses.splice(k, 1);
      }
    }

    // Maus über der Kugel: Aufhellen und Zeigernähe
    hov += ((cursor ? 1 : 0) - hov) * (1 - Math.exp(-dt * (cursor ? 5 : 2)));
    const lift = 1 + hov * 0.6;
    let mx = -1e4, my = -1e4;
    if (cursor) {
      // Zeigerposition weich nachführen, damit Glühen und Lichtfleck flüssig folgen
      if (!smooth) smooth = { x: cursor.x, y: cursor.y };
      const k = 1 - Math.exp(-dt * 16);
      smooth.x += (cursor.x - smooth.x) * k; smooth.y += (cursor.y - smooth.y) * k;
      const sr = canvas.getBoundingClientRect(); mx = smooth.x - sr.left; my = smooth.y - sr.top;
    } else smooth = null;
    roamStep(dt);
    const nearR = S * 0.42, inSphere = cursor && Math.hypot(mx - CX, my - CY) < S * 1.15;
    // Symbiont: Neuronen wabern mit der Masse mit
    if (shape === "symbiont") {
      const want = Math.min(1.5, (sys.cpu ?? 10) / 100 + (state === "idle" ? 0 : 0.5) + coreAct * 0.3);
      symAg += (want - symAg) * (1 - Math.exp(-dt * 0.8));
      symUpdate(dt);
      // Phase aufsummieren statt time * Tempo: sonst springt bei jeder kleinen Änderung der Unruhe die Phase um time·Δ (nach Stunden Laufzeit wild zitternde Neuronen)
      symPh += Math.min(dt, 0.1) * (0.6 + symAg * 0.8); const ph = symPh;
      for (const n of nodes) {
        const [x, y, z] = n.d, w = 1 + 0.13 * Math.sin(x * 3 + ph * 0.9) * Math.cos(y * 2.5 - ph * 0.7) + 0.08 * Math.sin(z * 4 + y * 2 + ph * 1.3);
        n.x = x * n.rad * w * 0.62; n.y = y * n.rad * w * 0.62; n.z = z * n.rad * w * 0.62;
      }
    }
    // Projektion
    for (const n of nodes) {
      const p = rot(n.x, n.y, n.z), s = proj(p);
      n.sx = s[0]; n.sy = s[1]; n.f = s[2]; n.sz = p[2];
      n.flash *= Math.pow(0.15, dt);
      let nr = 0;
      if (inSphere && p[2] > -0.3) { const d = Math.hypot(n.sx - mx, n.sy - my); if (d < nearR) nr = (1 - d / nearR) ** 2; }
      n.near += (nr - n.near) * (1 - Math.exp(-dt * 9));
    }
    if (inSphere && Math.random() < 2.5 * hov * dt * speedK) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (n.sz < -0.3) continue; const d = (n.sx - mx) ** 2 + (n.sy - my) ** 2; if (d < bd) { bd = d; best = i; } }
      if (best >= 0 && bd < nearR * nearR) { nodes[best].flash = 1; spawnFrom(best); }
    }

    // Mining-Kugel lebt: laufende Miner schicken ständig Impulse (mehr online = mehr Verkehr), neue Foreman-Meldung = Aufblitzen in Rot (Ausfall) oder Grün (zurück)
    if (orbMine && fmTotC && nodes.length) {
      if (Math.random() < (3 + 12 * fmTotC.on / fmTotC.n) * dt * speedK) { const i = (Math.random() * nodes.length) | 0; if (minerHue(i) === 145) { nodes[i].flash = Math.max(nodes[i].flash, 0.55); spawnFrom(i, 145); } }
      if (Math.random() < 2 * dt) { const i = (Math.random() * nodes.length) | 0; if (minerHue(i) === 4) { nodes[i].flash = 1; spawnFrom(i, 4); } }
      const ev = farmData?.events?.[0];
      if (ev && ev[0] !== orbEvT) {
        if (orbEvT) { const h = ev[2] ? 4 : 145; for (let k = 0; k < 24; k++) { const i = (Math.random() * nodes.length) | 0; nodes[i].flash = 1; spawnFrom(i, h); } coreAct = Math.max(coreAct, 0.9); }
        orbEvT = ev[0];
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    // Dunkle Kugel als Untergrund, damit sie auf jedem Desktop-Hintergrund lesbar bleibt
    computeHull();
    if (ballOn) { // Kugel entfernt: nur die Last-Anzeigen (CPU, GPU, RAM) bleiben, sie hängen nicht an der Kugel
    const openShape = OPEN_SHAPES.has(shape);
    if (!openShape) { ctx.fillStyle = "rgba(4,8,16,0.9)"; outlinePath(); ctx.fill(); }

    if (hull && !openShape) { // Formen: Leuchten folgt dem Umriss statt einem runden Hof
      ctx.save(); ctx.shadowColor = `hsla(${stateHue},80%,55%,${Math.min(1, 0.55 * glowK)})`; ctx.shadowBlur = S * 0.3;
      ctx.fillStyle = "rgba(4,8,16,0.9)"; outlinePath(); ctx.fill(); ctx.restore();
    } else if (!openShape) { // offene Formen: kein Hof (der Verlauf bändert sich dort zu einer blauen Scheibe)
      const halo = ctx.createRadialGradient(CX, CY, S * 0.2, CX, CY, S * 1.45);
      halo.addColorStop(0, `hsla(${stateHue},80%,55%,${0.16 * glowK})`);
      halo.addColorStop(1, `hsla(${stateHue},80%,55%,0)`);
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    }

    const glass = ctx.createRadialGradient(CX - S * 0.3, CY - S * 0.35, S * 0.1, CX, CY, S * 1.08);
    glass.addColorStop(0, "hsla(210,60%,80%,0.05)");
    glass.addColorStop(0.75, "hsla(210,60%,40%,0.02)");
    glass.addColorStop(1, `hsla(${stateHue},80%,60%,0.16)`);
    if (!openShape) { ctx.fillStyle = glass; outlinePath(); ctx.fill(); }
    if (shapeRim && !openShape) { ctx.strokeStyle = `hsla(${stateHue},70%,70%,0.28)`; ctx.lineWidth = 1; outlinePath(); ctx.stroke(); }
    if (shape === "symbiont") drawSymbiont();
    else if (SOLID_SHAPES.has(shape)) drawSolid();
    if (shape === "muenze") drawCoin();
    drawFolds(); drawStructure();
    }

    drawGauges(dt);
    if (ballOn) {
    ctx.globalCompositeOperation = "lighter";
    if (shape === "kugel" && shapeRim) { ctx.strokeStyle = `hsla(${stateHue},60%,65%,0.10)`; drawRing(0); drawRing(1); }

    // Glut: der Kern färbt sich mit der höchsten Temperatur (ab 50 °C) von der Zustandsfarbe über Orange nach Rot
    const hotT = Math.max(sys.temp ?? 0, sys.gpuTemp ?? 0);
    gauge.heat += ((viz.heat ? Math.max(0, Math.min(1, (hotT - 50) / 40)) : 0) - gauge.heat) * (1 - Math.exp(-dt * 1.5));
    const hw = gauge.heat * (state === "idle" ? 1 : 0.5), coreHue = stateHue + (((25 - gauge.heat * 25) - stateHue + 540) % 360 - 180) * hw;
    const core = ctx.createRadialGradient(CX, CY, 0, CX, CY, S * (0.35 + coreAct * 0.2 + gauge.heat * 0.12));
    const throb = 0.5 + 0.5 * Math.sin(time * (state === "thinking" ? 6 : 2 + gauge.heat * 2));
    core.addColorStop(0, `hsla(${coreHue},90%,${70 - gauge.heat * 12}%,${0.12 + gauge.heat * 0.18 + coreAct * 0.25 * (0.6 + 0.4 * throb)})`);
    core.addColorStop(1, `hsla(${coreHue},90%,50%,0)`);
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(CX, CY, S * 0.6, 0, Math.PI * 2); ctx.fill();

    // Maus über der Kugel: alles hellt leicht auf, Neuronen nahe am Zeiger glühen
    if (hov > 0.01) {
      ctx.fillStyle = `hsla(${stateHue},80%,60%,${0.07 * hov})`; outlinePath(); ctx.fill();
      if (inSphere) {
        const sg = ctx.createRadialGradient(mx, my, 0, mx, my, nearR * 1.3);
        sg.addColorStop(0, `hsla(${stateHue},90%,70%,${0.16 * hov})`); sg.addColorStop(1, `hsla(${stateHue},90%,60%,0)`);
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(mx, my, nearR * 1.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    const fine = shape === "symbiont" ? 0.55 : 1; // Symbiont: feinere Linien und Punkte
    const unit = S / 230 * fine;
    ctx.lineWidth = Math.max(0.4, unit * 0.8);
    for (const [i, j] of edges) {
      const a = nodes[i], b = nodes[j];
      const act = Math.max(actOf(a), actOf(b)), depth = 0.3 + 0.7 * ((a.sz + b.sz) / 2 + 1) / 2;
      ctx.strokeStyle = `hsla(${hueOf(a)},70%,60%,${Math.min(1, (0.035 + act * 0.22) * depth * lift * fine + (a.near + b.near) * 0.12)})`;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }

    for (const n of nodes) {
      const act = actOf(n), depth = 0.3 + 0.7 * (n.sz + 1) / 2, h = hueOf(n), mk = orbMine && fmTotC ? (h === 4 ? 2.4 : h === 38 ? 1.9 : 1.5) : 1; // Mining-Kugel: Punkte größer, Ausfälle am größten
      const r = (0.9 + n.flash * 2.2 + act * 1.3 + n.near * 1.6) * n.f * unit * mk * nodeK * (OPEN_SHAPES.has(shape) ? 1.7 : 1);
      if (n.near > 0.05) {
        ctx.fillStyle = `hsla(${h},95%,65%,${n.near * 0.22 * depth})`;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 3.5, 0, Math.PI * 2); ctx.fill();
      }
      if (n.flash > 0.25) {
        ctx.fillStyle = `hsla(${h},90%,60%,${n.flash * 0.18 * depth})`;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `hsla(${h},85%,${55 + n.flash * 35 + n.near * 20}%,${Math.min(1, (0.35 + act * 0.5 + n.flash * 0.3) * depth * lift * (OPEN_SHAPES.has(shape) ? 1.6 : 1) + n.near * 0.5)})`;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2); ctx.fill();
    }

    for (const p of pulses) {
      const a = nodes[p.a], b = nodes[p.b], t0 = Math.max(0, p.t - 0.45);
      const x = a.sx + (b.sx - a.sx) * p.t, y = a.sy + (b.sy - a.sy) * p.t;
      const depth = 0.35 + 0.65 * (a.sz + 1) / 2;
      ctx.strokeStyle = `hsla(${p.hue},95%,70%,${0.55 * depth})`;
      ctx.beginPath(); ctx.moveTo(a.sx + (b.sx - a.sx) * t0, a.sy + (b.sy - a.sy) * t0); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = `hsla(${p.hue},100%,80%,${0.9 * depth})`;
      ctx.beginPath(); ctx.arc(x, y, 1.6 * unit * a.f, 0, Math.PI * 2); ctx.fill();
    }
    }

    // Beschriftung aktiver Regionen: weich ein- und ausblenden, unter der Maus hell und stehen bleiben
    ctx.globalCompositeOperation = "source-over";
    const lblMode = ballOn ? ballLabels : "aus";
    const ranked = lblMode === "aus" ? [] : REGIONS.filter((r) => r.act >= (r.shown ? 0.15 : 0.22)).sort((p, q) => q.act - p.act).slice(0, lblMode === "eine" ? 1 : 3);
    const fs = 12.5 * labelScale; // feste Größe: Kugel größer/kleiner ändert die Beschriftung nicht
    lblLayer.style.setProperty("--fs", fs + "px"); lblLayer.style.setProperty("--fsb", fs + "px");
    const vis = [];
    for (const r of REGIONS) {
      r.shown = ranked.includes(r);
      const target = lblMode === "aus" ? 0 : r === hoverRegion || r.shown ? 1 : 0;
      r.lab += (target - r.lab) * (1 - Math.exp(-dt * (target > r.lab ? 2.2 : 0.8))); // rein ~0,5 s, raus ~1,5 s
      r.glow += ((r === hoverRegion ? 1 : 0) - r.glow) * (1 - Math.exp(-dt * 7));
      if (r.lab < 0.01) {
        if (r.placed) { r.el.style.opacity = "0"; r.el.style.pointerEvents = "none"; r.placed = false; }
        continue;
      }
      const c = rot(...(r.cen || r.dir.map((v) => v * 0.72))), sp = proj(c);
      let dx = sp[0] - CX, dy = sp[1] - CY; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      r.anchor = sp; r.depthK = c[2] > -0.25 ? 1 : 0.55; r.tdx = dx;
      r.tlx = Math.max(8, Math.min(W - 8, CX + dx * S * 1.3)); r.tly = Math.max(CY - S * 1.15, CY + dy * S * 1.15);
      const head = r.name.toUpperCase() + "  " + Math.round(Math.min(1, r.act) * 100) + "%";
      // Unter der Maus bleibt der Text stehen, damit man ihn in Ruhe lesen kann
      if (r !== hoverRegion) {
        if (head !== r.headTxt) r.el.firstChild.textContent = r.headTxt = head;
        if (r.task !== r.taskTxt) r.el.lastChild.textContent = r.taskTxt = r.task;
      }
      vis.push(r);
    }
    // Überlappung vermeiden: pro Seite von oben nach unten mit Mindestabstand stapeln
    for (const side of [true, false]) {
      const col = vis.filter((r) => (r.tdx >= 0) === side).sort((p, q) => p.tly - q.tly);
      for (let i = 1; i < col.length; i++) col[i].tly = Math.max(col[i].tly, col[i - 1].tly + 38 * labelScale);
    }
    const widths = vis.map((r) => r.el.offsetWidth);
    vis.forEach((r, i) => {
      // Position gleitet nach, unter der Maus bleibt sie stehen
      if (!r.placed) { r.lx = r.tlx; r.ly = r.tly; r.side = r.tdx >= 0; r.placed = true; }
      else if (r !== hoverRegion) { const k = 1 - Math.exp(-dt * 3); r.lx += (r.tlx - r.lx) * k; r.ly += (r.tly - r.ly) * k; r.side = r.tdx >= 0; }
      const pk = "lbl:" + r.name, ls = scales[pk] || 1;
      if (r.lsSet !== ls) { r.lsSet = ls; if (ls === 1) r.el.style.removeProperty("--fs"); else r.el.style.setProperty("--fs", "calc(var(--fsb) * " + ls + ")"); }
      const w = widths[i], hgt = r.el.offsetHeight, pp = pinPos(pk);
      let tx = Math.max(6, Math.min(W - 6 - w, r.side ? r.lx + 6 : r.lx - 6 - w)), ty = r.ly - fs - 6;
      let ex = r.lx, ey = r.ly; // Ende der Linie zur Region
      if (pp) {
        // Selbst abgelegt: dort bleiben (leicht schwebend), Linie zur nächsten Kante
        const live = drag?.key === pk && drag.moved, k = live ? 0 : swayMul;
        tx = Math.max(4, Math.min(W - 4 - w, pp.x - w / 2 + Math.sin(time * 0.4 + i) * S * 0.02 * k)); ty = Math.max(4, Math.min(H - 4 - hgt, pp.y - hgt / 2 + Math.sin(time * 0.55 + i * 2) * S * 0.015 * k));
        ex = r.anchor[0] < tx ? tx : r.anchor[0] > tx + w ? tx + w : r.anchor[0]; ey = ty + hgt / 2;
      } else {
        // Nicht über Anzeigen und Symbole legen: nach unten ausweichen, weich
        let off = 0;
        for (let it = 0; it < 4; it++) {
          const hit = obstacles.find((o) => tx < o.x + o.w + 4 && tx + w > o.x - 4 && ty + off < o.y + o.h + 4 && ty + off + hgt > o.y - 4);
          if (!hit) break;
          off = hit.y + hit.h + 6 - ty;
        }
        r.off = (r.off || 0) + (off - (r.off || 0)) * (1 - Math.exp(-dt * 5));
        ty = Math.min(H - 4 - hgt, ty + r.off); ey = r.ly + r.off;
      }
      const al = r.lab * Math.max(r.depthK, r.glow);
      r.el.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
      r.el.style.opacity = (al * opacity.labels).toFixed(3);
      r.el.style.pointerEvents = al > 0.15 ? "auto" : "none";
      const [ax0, ay0] = r.anchor, g = r.glow;
      if (g > 0.01) {
        ctx.globalCompositeOperation = "lighter";
        const sg = ctx.createRadialGradient(ax0, ay0, 0, ax0, ay0, S * 0.45);
        sg.addColorStop(0, `hsla(${r.hue},95%,65%,${0.32 * g})`); sg.addColorStop(1, `hsla(${r.hue},95%,50%,0)`);
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(ax0, ay0, S * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.strokeStyle = `hsla(${r.hue},90%,${70 + g * 15}%,${al * (0.6 + 0.4 * g)})`; ctx.lineWidth = 1 + g;
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = `hsla(${r.hue},90%,${70 + g * 15}%,${al})`; ctx.beginPath(); ctx.arc(ax0, ay0, 3 + g * 2, 0, Math.PI * 2); ctx.fill();
    });

    // Beim Sprechen: ruhiger lila Schein und eine feine Pixel-Soundwelle quer über die Kugel, kein Flackern
    const COLS = 26;
    if (talking && ttsSrc && ttsAnalyser) {
      if (!freqData) freqData = new Uint8Array(ttsAnalyser.frequencyBinCount);
      ttsAnalyser.getByteFrequencyData(freqData);
      // Sprachbereich (ca. 90 Hz bis 4 kHz) auf die Spalten verteilen, von der Mitte nach außen gespiegelt
      const half = COLS / 2, lo = 1, hi = Math.min(freqData.length - 1, 48);
      for (let c = 0; c < half; c++) {
        const b0 = lo + Math.floor((c / half) * (hi - lo)), b1 = lo + Math.floor(((c + 1) / half) * (hi - lo));
        let m = 0; for (let b = b0; b <= b1; b++) m = Math.max(m, freqData[b]);
        waveTarget[half - 1 - c] = waveTarget[half + c] = Math.min(1, m / 210);
      }
    } else if (talking) {
      // Windows-Stimme liefert kein Audiosignal: ruhige, gleichmäßige Welle statt Zufall
      for (let c = 0; c < COLS; c++) waveTarget[c] = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 5.2 + c * 0.55)) * (0.6 + 0.4 * Math.sin(time * 2.3 - c * 0.3));
    } else waveTarget.fill(0);
    for (let c = 0; c < COLS; c++) {
      const t = waveTarget[c] || 0, v = wave[c] || 0;
      wave[c] = v + (t - v) * (1 - Math.exp(-dt * (t > v ? 14 : 5))); // schnell hoch, langsam runter: weich statt zappelig
    }
    talkGlow += ((talking ? 1 : 0) - talkGlow) * (1 - Math.exp(-dt * 3));
    if (talkGlow > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      const pg = ctx.createRadialGradient(CX, CY, S * 0.2, CX, CY, S * 1.3);
      pg.addColorStop(0, `hsla(275,90%,62%,${talkGlow * 0.12})`); pg.addColorStop(0.8, `hsla(275,90%,60%,${talkGlow * 0.08})`); pg.addColorStop(1, "hsla(275,90%,55%,0)");
      ctx.fillStyle = pg; if (hull) outlinePath(); else { ctx.beginPath(); ctx.arc(CX, CY, S * 1.3, 0, Math.PI * 2); } ctx.fill();
      // Pixel-Spalten: kleine Quadrate, symmetrisch um die Mittellinie, außen leiser
      const px = Math.max(2, Math.round(S * 0.028)), gap = Math.max(1, Math.round(px * 0.6)), step = px + gap;
      const maxRows = Math.max(3, Math.round((S * 0.42) / step)), x0 = CX - (COLS * step - gap) / 2;
      for (let c = 0; c < COLS; c++) {
        const edge = Math.sin(Math.PI * (c + 0.5) / COLS); // zur Seite hin abklingen
        const rows = Math.max(1, Math.round(wave[c] * edge * maxRows));
        const x = Math.round(x0 + c * step);
        for (let r = 0; r < rows; r++) {
          const a = talkGlow * (0.6 - (r / maxRows) * 0.4);
          ctx.fillStyle = `hsla(${278 - r * 3},95%,${72 + r * 2}%,${a.toFixed(3)})`;
          ctx.fillRect(x, Math.round(CY - px / 2 - r * step), px, px);
          if (r) ctx.fillRect(x, Math.round(CY - px / 2 + r * step), px, px);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Kugelrand als Griff: leuchtet, wenn die Maus drauf ist oder gezogen wird
    const rimOn = rimHot || gesture?.type === "size";
    rimGlow += ((rimOn ? 1 : 0) - rimGlow) * (1 - Math.exp(-dt * 10));
    if (rimGlow > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `hsla(${stateHue},90%,70%,${0.55 * rimGlow})`; ctx.lineWidth = 2 + rimGlow * 2;
      ctx.shadowColor = `hsla(${stateHue},95%,60%,${0.8 * rimGlow})`; ctx.shadowBlur = 14 * rimGlow;
      outlinePath(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = "source-over";
    }
    const hintTxt = rimOn ? "Rand ziehen: Größe" : expanded ? "Mausrad: Kugelgröße · Klick: zu" : "Klick: Panel öffnen";
    if (rimHint.textContent !== hintTxt) rimHint.textContent = hintTxt;
    const showHint = !gesture && (rimOn || (overBall && hov > 0.6));
    rimHint.style.opacity = showHint ? "1" : "0";
    if (showHint) rimHint.style.transform = `translate(${(CX - rimHint.offsetWidth / 2).toFixed(0)}px, ${(CY + S * 0.6).toFixed(0)}px)`; // im unteren Teil der Kugel, damit nichts darunter verrutscht
    // Mikrofon-Knopf: standardmäßig rechts am Kugelrand, frei verschiebbar, abschaltbar
    const mpos = anchor("mic", -0.2, 1.18, 0, 30, 30, 0);
    micFloat.style.transform = `translate(${Math.round(mpos.x)}px, ${Math.round(mpos.y)}px)`;
    micFloat.classList.toggle("show", micFloatOn && (hov > 0.3 || drag?.el === micFloat) && !expanded);
    micFloat.style.visibility = !expanded && (micFloatOn || micFloat.getAttribute("aria-pressed") === "true") ? "" : "hidden"; // im Panel gibt es den Knopf an der Eingabe
    placeFriends();

    // Temperaturen schweben leicht beweglich über dem oberen Kugelrand
    // Anzeigen, Musik-Player und KI-Anzeige haben feste Größen: Kugel größer/kleiner ändert sie nicht (nur Mausrad über dem Teil)
    lblLayer.style.setProperty("--tfs", 13 * tempScale + "px");
    const obsNext = [];
    // selbst hingelegte Anzeigen zuerst: die übrigen weichen ihnen dann aus, statt sich darüberzulegen
    const db = drag?.moved ? tDragBox : null; tDragBox = null;
    for (const t of temps.filter((x) => pins["t:" + x.key]).concat(temps.filter((x) => !pins["t:" + x.key]))) {
      const cfg = widgets[t.w] || {};
      const v = t.get() ?? null;
      const show = cfg.on !== false && (v != null || t.keepNa) && (onMining() ? t.page === "Mining" || t.trend : t.page !== "Mining") && (expanded || miniMore || t.key === "cpuT" || t.key === "gpuT");
      if (t.trend && show && t.el.dataset.chg !== String(market?.btc?.ts)) { t.el.dataset.chg = String(market?.btc?.ts); t.val = undefined; } // neuer Kurs: Farbe und Hinweis auffrischen
      t.el.classList.toggle("off", !show);
      if (!show) continue;
      if (v !== t.val) {
        t.val = v;
        t.el.lastChild.textContent = v == null ? "–" : t.txt(v);
        if (t.label) t.el.firstChild.textContent = t.label();
        t.el.classList.toggle("na", v == null);
        t.el.title = v == null ? "Kein Messwert: Einstellungen → System → Temperaturmessung" : (t.tip ? t.tip() : "");
        t.hueSet = undefined;
      }
      const hue = v == null ? null : cfg.hue >= 0 && !t.trend ? cfg.hue : t.auto ? t.auto(v) : CORE_HUE;
      if (hue !== t.hueSet) { t.hueSet = hue; if (hue != null) t.el.style.setProperty("--h", Math.round(hue)); else t.el.style.removeProperty("--h"); }
      // Steam und Discord: Namen der Leute, die online sind, im Wechsel alle 3 Sekunden
      if (t.cycle) {
        const list = t.cycle(), txt = list.length ? list[Math.floor(time / 3) % list.length] : v == null ? "–" : t.txt(v);
        if (t.el.lastChild.textContent !== txt) t.el.lastChild.textContent = txt;
        const lab = t.name + (v != null ? " " + v : "");
        if (t.el.firstChild.textContent !== lab) t.el.firstChild.textContent = lab;
      }
      const tsc = scales["t:" + t.key] || 1;
      if (t.isSet !== tsc) { t.isSet = tsc; t.el.style.setProperty("--is", String(tsc)); }
      const w = t.el.offsetWidth, h = t.el.offsetHeight, pos = anchor("t:" + t.key, t.ang, 0.92, t.ph, w, h);
      // Liegt eine Anzeige unter „Claude · Lokal“, Strata oder der Status-Anzeige, kam man nicht mehr an sie heran: daneben ausweichen
      // Ebenso keine Anzeige auf einer anderen (z. B. BTC, ETH und SOL am selben Platz): nächsten freien Platz rundherum suchen
      // Beim Ziehen schubst die gezogene Anzeige andere beiseite: sie gleiten weich weg (Ziel merken, je Bild ein Stück, ausrollend) und bleiben dann dort liegen
      if (db && drag.el !== t.el) {
        const ex = pos.x + w / 2 - (db.x + db.w / 2), ey = pos.y + h / 2 - (db.y + db.h / 2), ox = (w + db.w) / 2 + 8 - Math.abs(ex), oy = (h + db.h) / 2 + 8 - Math.abs(ey);
        if (ox > 0 && oy > 0) t.drift = ox < oy ? { x: (ex >= 0 ? 1 : -1) * (ox + 4), y: 0 } : { x: 0, y: (ey >= 0 ? 1 : -1) * (oy + 4) };
      }
      if (t.drift) {
        const k = Math.min(1, dt * 5), sx = t.drift.x * k, sy = t.drift.y * k, key = "t:" + t.key, c = cOf(key), pp = pinPos(key) || { x: pos.x + w / 2, y: pos.y + h / 2 };
        const nx = Math.max(4 + w / 2, Math.min(W - 4 - w / 2, pp.x + sx)), ny = Math.max(4 + h / 2, Math.min(H - 4 - h / 2, pp.y + sy));
        pins[key] = { a: Math.atan2(ny - c.y, nx - c.x), r: Math.max(0.2, Math.hypot(nx - c.x, ny - c.y) / SB) }; pos.x += nx - pp.x; pos.y += ny - pp.y; t.av = null;
        t.drift.x -= sx; t.drift.y -= sy; if (Math.abs(t.drift.x) + Math.abs(t.drift.y) < 0.4) { t.drift = null; savePins(); }
      }
      // selbst hingelegte Anzeigen bleiben genau da, wo Domi sie abgelegt hat; nur nicht abgelegte weichen aus
      if (drag?.el === t.el && drag.moved) tDragBox = { x: pos.x, y: pos.y, w, h };
      else if (!pins["t:" + t.key]) {
        const occ = [...uiRects(), ...obsNext], free = (x, y) => x >= 4 && y >= 4 && x + w <= W - 4 && y + h <= H - 4 && occ.every((o) => x >= o.x + o.w + 4 || x + w + 4 <= o.x || y >= o.y + o.h + 4 || y + h + 4 <= o.y);
        // zuletzt gefundenen Ausweichplatz behalten, solange er frei ist: sonst springt die Anzeige beim leichten Schweben hin und her
        if (t.av && free(pos.x + t.av[0], pos.y + t.av[1])) { pos.x += t.av[0]; pos.y += t.av[1]; }
        else if (free(pos.x, pos.y)) t.av = null;
        else {
          const sy = h + 6, sx = Math.max(40, w * 0.5);
          search: for (let d = 1; d <= 10; d++) for (const [dx, dy] of [[0, -d * sy], [0, d * sy], [-d * sx, 0], [d * sx, 0], [-d * sx, -d * sy], [d * sx, -d * sy], [-d * sx, d * sy], [d * sx, d * sy]])
            if (free(pos.x + dx, pos.y + dy)) { pos.x += dx; pos.y += dy; t.av = [dx, dy]; break search; }
        }
      }
      t.el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
      obsNext.push({ x: pos.x, y: pos.y, w, h });
    }
    obstacles = obsNext;
    placeApps(dt);
    if (!expanded) {
      const cap = $("caption"), pfs = Math.max(11, Math.min(22, S * 0.15)), cfs = Math.max(10, Math.min(17, S * 0.115));
      cap.style.setProperty("--pfs", pfs.toFixed(1) + "px"); cap.style.setProperty("--cfs", cfs.toFixed(1) + "px"); cap.style.setProperty("--capw", Math.round(Math.min(W - 8, S * 3.4)) + "px");
      const below = appEls.size ? S * 1.16 + Math.max(18, Math.min(32, S * 0.15)) * appScale * 0.5 + 10 : S * 1.12 + 8;
      const cw = cap.offsetWidth, ch = cap.offsetHeight;
      cap.style.transform = `translate(${Math.round(Math.max(4, Math.min(W - cw - 4, CX - cw / 2)))}px, ${Math.round(Math.min(H - ch - 4, CY + below))}px)`;
    } else $("caption").style.transform = "";
    if (media.classList.contains("on")) {
      media.style.setProperty("--mfs", 12 * (scales.media || 1) + "px");
      const mw = media.offsetWidth, mh = media.offsetHeight, p = anchor("media", 2.45, 1.55, 2.6, mw, mh, 0.4);
      media.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      // Fortschritt zwischen den Meldungen selbst weiterrechnen
      const m = mediaSt, pos = m.len ? Math.min(m.len, (m.pos || 0) + (m.playing ? (Date.now() - m.rx) / 1000 : 0)) : 0;
      media.querySelector(".mbar i").style.width = (m.len ? pos / m.len * 100 : 0).toFixed(1) + "%";
      const mm = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0"), tm = media.querySelector(".mtime"), ct = m.len ? mm(pos) : "";
      tm.style.display = m.len ? "" : "none"; if (tm.firstChild.textContent !== ct) { tm.firstChild.textContent = ct; tm.lastChild.textContent = mm(m.len); }
      // Langer Titel läuft langsam durch (neu messen, wenn sich Titel oder Größe ändern)
      if (media.mqAt !== mw) { media.mqAt = mw; const box = media.querySelector(".mt"), over = box.firstChild.scrollWidth - box.clientWidth;
        box.classList.toggle("run", over > 4); box.style.setProperty("--mq", -over + "px"); box.style.setProperty("--mqd", Math.max(5, over / 14).toFixed(1) + "s"); }
    }
    const aOff = widgets.aiClaude?.on === false, lOff = widgets.aiLocal?.on === false;
    who.children[0].hidden = aOff; who.children[1].hidden = lOff; { const nm = aiSt?.extName || "Claude"; if (who.children[0].lastChild.textContent !== nm) who.children[0].lastChild.textContent = nm; }
    who.classList.toggle("off", widgets.ai?.on === false || !aiSt || (aOff && lOff));
    if (!who.classList.contains("off")) {
      who.style.setProperty("--wfs", 11.5 * tempScale * (scales.ai || 1) + "px");
      const ww = who.offsetWidth, wh = who.offsetHeight;
      if (pins.ai) { const p = anchor("ai", 0, 0, 1.7, ww, wh, 0.3); who.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; }
      else who.style.transform = `translate(${Math.round(Math.max(4, Math.min(W - 4 - ww, (expanded ? W / 2 : homeX || CX) - ww / 2)))}px, ${Math.round(Math.max(4, (expanded ? H / 2 + 6 : homeY || CY) - S * 1.12 - wh + Math.sin(time * 0.55) * S * 0.012))}px)`;
    }
    // Strata-Knopf: ohne eigene Stelle rechts neben „Claude · Lokal“, sonst wie gezogen
    const sOn = expanded && strataHas && !hiddenSet.has("strataBtn") && widgets.strata?.on !== false;
    strataBtn.classList.toggle("off", !sOn);
    if (sOn) {
      const ss = scales.strata || 1; if (strataBtn.ssSet !== ss) { strataBtn.ssSet = ss; strataBtn.style.setProperty("--ss", ss); }
      const sw = strataBtn.offsetWidth, sh = strataBtn.offsetHeight, wb = !pins.strata && !(drag?.key === "strata" && drag.moved) && !who.classList.contains("off") ? who.getBoundingClientRect() : null, cr = wb && canvas.getBoundingClientRect();
      const sp = wb ? { x: Math.min(W - 4 - sw, wb.right - cr.left + 10), y: wb.top - cr.top + (wb.height - sh) / 2 } : anchor("strata", -0.62, 1.42, 0, sw, sh, 0);
      strataBtn.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y)}px)`;
    }

    updateCaption();
    if (!once) requestAnimationFrame(frame);
  }


