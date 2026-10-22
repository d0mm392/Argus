"use strict";
  // ---------- Anordnen: Teile des Panels frei verschieben und in der Größe ändern ----------
  // Lage als Anteil der Fläche unter der Kopfleiste (x, y, w; h = 0 heißt Höhe nach Inhalt), damit es bei jeder Fenstergröße passt
  const BLOCKS = [["yt", "YouTube", true], ["tw", "Twitch", true], ["mOver", "Mining-Überblick", true], ["mTick", "Mining-Ticker", false], ["mHeat", "Miner-Heatmap", true], ["mLive", "Hashrate live", true], ["proc", "Statuszeile", false], ["sys", "Systemwache", true], ["mine", "Mining", true], ["farm", "Farm", true], ["farm2", "Farm 2", true], ["farm3", "Farm 3", true], ["farm4", "Farm 4", true], ["wx", "Wetter", true], ["clocks", "Weltuhren", false], ["notes", "Notizblock", true], ["quick", "Schnellstart", true], ["mirror", "Fenster-Spiegel", true], ["game", "Gaming", true], ["aiLog", "KI-Verlauf", true], ["log", "Protokoll", true], ["transcript", "Antworten", true], ["notice", "Hinweise", false], ["askForm", "Eingabe", false]];
  const panelEl = document.querySelector(".panel");
  function applyLayout() {
    document.body.classList.toggle("free", !!freeLayout);
    document.documentElement.style.setProperty("--barH", (document.querySelector(".bar").offsetHeight || 52) + "px");
    for (const [id, , hRes] of BLOCKS) {
      const el = $(id); el.classList.toggle("blk", !!freeLayout);
      let r = freeLayout?.[id];
      if (!r && freeLayout && (id === "mine" || id === "mOver" || id === "mTick" || id === "mHeat" || id === "mLive" || id === "clocks" || id === "wx" || id.startsWith("farm") || id === "notes" || id === "quick" || id === "mirror" || id === "game" || id === "aiLog")) { r = freeLayout[id] = newBlockSpot(id); clearTimeout(nudgeSave); nudgeSave = setTimeout(() => window.jarvis.setConfig({ panelLayout: freeLayout }), 600); }
      if (!r) { el.style.left = el.style.top = el.style.width = ""; if (!(id === "sys" && sysBox.h)) el.style.height = ""; continue; }
      el.style.left = r.x * 100 + "%"; el.style.top = r.y * 100 + "%"; el.style.width = r.w * 100 + "%";
      el.style.height = hRes && r.h ? r.h * 100 + "%" : "";
    }
    applyZ(); fitBlocks(); resize(); ytLast = ""; ytLayout?.(); twLastKey = ""; twLayout?.(); placeOverlays();
  }
  // Stapelreihenfolge: zuletzt angefasstes Fenster liegt oben und bleibt dort (Fenster dürfen sich überlappen)
  function applyZ() {
    const ids = BLOCKS.map(([id]) => id).filter((id) => freeLayout?.[id]).sort((a, b) => (freeLayout[a].z || 0) - (freeLayout[b].z || 0));
    for (const [id] of BLOCKS) $(id).style.zIndex = freeLayout?.[id] ? String(ids.indexOf(id) + 1) : "";
  }
  function bringFront(id, r) {
    if (!freeLayout?.[id]) return;
    const top = Math.max(0, ...Object.values(freeLayout).map((x) => x?.z || 0));
    if ((freeLayout[id].z || 0) === top && top) return;
    freeLayout[id].z = top + 1; if (r) r.z = top + 1; applyZ();
  }
  // Kein Teil darf aus dem Panel ragen: was unten oder rechts hinausgeht (kleineres Fenster, alte Anordnung), wird zur Anzeige
  // hineingeschoben. Die gespeicherte Lage bleibt, damit sie im größeren Fenster wieder stimmt
  function fitBlocks() {
    if (!freeLayout || !expanded) return;
    const ph = panelEl.clientHeight, pw = panelEl.clientWidth; if (!ph || !pw) return;
    for (const [id] of BLOCKS) {
      const el = $(id), r = freeLayout[id]; if (!r || el.hidden) continue;
      const h = el.offsetHeight, w = el.offsetWidth; if (!h) continue;
      el.style.top = Math.max(0, Math.min(r.y, (ph - h) / ph)) * 100 + "%";
      el.style.left = Math.max(0, Math.min(r.x, (pw - w) / pw)) * 100 + "%";
    }
  }
  let fitBlkRaf = 0;
  const fitBlocksSoon = () => { cancelAnimationFrame(fitBlkRaf); fitBlkRaf = requestAnimationFrame(() => { fitBlocks(); placeOverlays(); }); };
  { const ro = new ResizeObserver(fitBlocksSoon); ro.observe(panelEl); for (const [id] of BLOCKS) ro.observe($(id)); }
  // Mining, Wetter und Weltuhren gab es früher nicht: bei schon angeordnetem Panel in eine freie Lücke setzen
  // (Raster absuchen, nichts überdecken), sonst unter die Systemwache
  function newBlockSpot(id) {
    const ph = panelEl.clientHeight || 600, pw = panelEl.clientWidth || 900, s = freeLayout.sys || { x: 0.02, y: 0.4, w: 0.45 };
    const EST = { mine: 200, wx: 300, clocks: 72, farm: 160, farm2: 160, farm3: 160, farm4: 160, notes: 160, quick: 90, mirror: 220, game: 300 }; // Höhe, bevor Daten da sind, ist noch klein: geschätzt
    const w = Math.min(0.96, Math.max(0.28, id === "mine" ? s.w : 380 / pw)), h = (EST[id] || 120) / ph;
    const taken = Object.entries(freeLayout).filter(([k]) => k !== id && $(k) && !$(k).hidden && (!["yt", "tw"].includes(k) || $(k).classList.contains("on")))
      .map(([k, r]) => ({ x: r.x, y: r.y, w: r.w, h: r.h || Math.max($(k).offsetHeight || 60, EST[k] || 0) / ph }));
    const free = (x, y) => taken.every((r) => x + w + 0.008 <= r.x || r.x + r.w + 0.008 <= x || y + h + 0.008 <= r.y || r.y + r.h + 0.008 <= y);
    for (let y = 0.02; y + h <= 0.98; y += 0.02) for (let x = 0.01; x + w <= 0.99; x += 0.02) if (free(x, y)) return { x, y, w, h: 0 };
    // weitere Farm-Fenster: neben das vorige (links, sonst rechts, sonst darunter), statt irgendwo unter andere Fenster
    if (/^farm\d$/.test(id)) { const pv = freeLayout[FARM_IDS[FARM_IDS.indexOf(id) - 1]]; if (pv) { const pw2 = pv.w, ph2 = ($(FARM_IDS[FARM_IDS.indexOf(id) - 1]).offsetHeight || 200) / ph;
      return pv.x - pw2 - 0.01 >= 0 ? { x: pv.x - pw2 - 0.01, y: pv.y, w: pw2, h: 0 } : pv.x + 2 * pw2 + 0.01 <= 1 ? { x: pv.x + pw2 + 0.01, y: pv.y, w: pw2, h: 0 } : { x: pv.x, y: Math.min(0.9, pv.y + ph2 + 0.012), w: pw2, h: 0 }; } }
    const sh = s.h || ($("sys").offsetHeight || 160) / ph;
    return { x: s.x, y: Math.min(0.9, s.y + sh + 0.012), w: s.w, h: 0 };
  }
  function placeOverlays() {
    if (!document.body.classList.contains("arrange")) return;
    const pr = panelEl.getBoundingClientRect();
    for (const ov of panelEl.querySelectorAll(".arr-ov")) {
      const b = $(ov.dataset.for).getBoundingClientRect(), show = b.width > 0 && b.height > 0;
      ov.style.visibility = show ? "" : "hidden";
      Object.assign(ov.style, { left: b.left - pr.left - 3 + "px", top: b.top - pr.top - 3 + "px", width: b.width + 6 + "px", height: b.height + 6 + "px" });
    }
  }
  // aktuelle Lage aus dem normalen Panel übernehmen, damit Anordnen dort startet, wo alles gerade ist
  function captureLayout() {
    const pr = panelEl.getBoundingClientRect(), top = document.querySelector(".bar").getBoundingClientRect().bottom, ah = pr.bottom - top, aw = pr.width, out = {};
    for (const [id, , hRes] of BLOCKS) {
      const b = $(id).getBoundingClientRect();
      const ok = b.width > 0 && b.height > 0;
      out[id] = ok ? { x: Math.max(0, (b.left - pr.left) / aw), y: Math.max(0, Math.min((b.top - top) / ah, 1 - Math.min(1, b.height / ah))), w: Math.min(1, b.width / aw), h: hRes ? Math.min(1, b.height / ah) : 0 }
        : { x: 0.02, y: id === "yt" ? 0.05 : id === "tw" ? 0.3 : 0.5, w: id === "yt" || id === "tw" ? 0.45 : 0.5, h: hRes ? 0.25 : 0 };
    }
    return out;
  }
  for (const [id, name, hRes] of BLOCKS) {
    // Rahmen liegt über dem Teil (eigene Ebene im Panel), nicht darin: so stört weder Scrollen noch Inhalt
    const ov = document.createElement("div"); ov.className = "arr-ov"; ov.dataset.for = id; ov.innerHTML = "<span></span>"; ov.firstChild.textContent = name; panelEl.append(ov);
    const x = document.createElement("button"); x.type = "button"; x.className = "arr-x"; x.textContent = "×"; x.title = name + " ausblenden";
    x.addEventListener("pointerdown", (e) => e.stopPropagation()); x.addEventListener("click", (e) => { e.stopPropagation(); setHidden(id, true); }); ov.append(x);
    const corners = hRes ? ["tl", "tr", "bl", "br"] : ["tl", "tr"];
    for (const c of corners) { const g = document.createElement("div"); g.className = "fgrip " + c; g.dataset.c = c; g.style.position = "absolute"; Object.assign(g.style, { left: c.includes("l") ? "-2px" : "auto", right: c.includes("r") ? "-2px" : "auto", top: c.includes("t") ? "-2px" : "auto", bottom: c.includes("b") ? "-2px" : "auto" }); ov.append(g); }
    for (const c of hRes ? ["l", "r", "t", "b"] : ["l", "r", "t"]) { const g = document.createElement("div"); g.className = "fgrip edge " + c; g.dataset.c = c; ov.append(g); }
    ov.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
      selectNudge({ kind: "blk", id, el: ov });
      const pr = panelEl.getBoundingClientRect(), r = { ...freeLayout[id] };
      r.x = $(id).offsetLeft / pr.width; r.y = $(id).offsetTop / pr.height;
      if (!r.h && hRes) r.h = $(id).offsetHeight / pr.height;
      bringFront(id, r);
      arrSt = { id, hRes, c: e.target.dataset?.c || "", sx: e.clientX, sy: e.clientY, r, aw: pr.width, ah: pr.height, h0: $(id).offsetHeight / pr.height };
    });
  }
  // ein schwebendes × für das Fenster unter der Maus (nicht in den Blöcken selbst: Protokoll/Antworten zählen ihre Kinder, Inhalt scrollt)
  { const bx = document.createElement("button"), NO_X = ["askForm", "notice", "proc", "yt", "tw"]; let cur = null;
    bx.type = "button"; bx.className = "blk-x float"; bx.textContent = "×"; panelEl.append(bx);
    const hide = () => { cur = null; bx.classList.remove("show"); };
    panelEl.addEventListener("pointermove", (e) => {
      if (e.target === bx) return;
      const b = !document.body.classList.contains("arrange") ? e.target.closest?.(".panel > .blk, .panel > .sys, .panel > .yt") : null;
      if (!b || NO_X.includes(b.id) || !BLOCK_NAMES[b.id]) return hide();
      if (cur !== b) { cur = b; bx.title = BLOCK_NAMES[b.id] + " ausblenden (zurückholen: Rechtsklick › Ausgeblendete Fenster)"; }
      bx.style.left = (b.offsetLeft + b.offsetWidth - 10) + "px"; bx.style.top = (b.offsetTop - 7) + "px"; bx.classList.add("show");
    });
    panelEl.addEventListener("pointerleave", hide);
    bx.addEventListener("pointerdown", (e) => e.stopPropagation());
    bx.addEventListener("click", (e) => { e.stopPropagation(); if (cur) setHidden(cur.id, true); hide(); });
  }
  // Ziehen am ganzen Fenster verfolgen (wie bei den anderen Teilen), sonst geht es bei schnellen Bewegungen verloren
  let arrSt = null;
  const GRID = 8, GAP = 12, SNAP = 7;
  // Fangpunkte aus den anderen sichtbaren Fenstern (Kanten, Mitten, Kante ± Abstand, Breiten, Höhen) und dem Panelrand mit Abstand
  function blkLines(el) {
    const pr = panelEl.getBoundingClientRect(), xs = [pr.left + GAP, pr.right - GAP, pr.left + pr.width / 2], ys = [pr.top + GAP, pr.bottom - GAP], ws = [], hs = [];
    for (const o of panelEl.querySelectorAll(":scope > .blk")) {
      if (o === el || o.classList.contains("gone")) continue;
      const b = o.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      xs.push(b.left, b.right, b.left + b.width / 2, b.right + GAP, b.left - GAP); ys.push(b.top, b.bottom, b.bottom + GAP, b.top - GAP); ws.push(b.width); hs.push(b.height);
    }
    return { xs, ys, ws, hs };
  }
  const near = (v, list) => { let best = null; for (const l of list) if (Math.abs(l - v) <= SNAP && (best == null || Math.abs(l - v) < Math.abs(best - v))) best = l; return best; };
  const grid = (v, o) => o + Math.round((v - o) / GRID) * GRID;
  // Linke/obere Kante, Mitte oder rechte/untere Kante an die nächste Linie
  function snapEdge(start, size, lines) {
    let best = null;
    for (const off of [0, size / 2, size]) { const l = near(start + off, lines); if (l != null && (!best || Math.abs(l - start - off) < best.d)) best = { v: l - off, g: l, d: Math.abs(l - start - off) }; }
    return best;
  }
  window.addEventListener("pointermove", (e) => {
    const st = arrSt; if (!st) return;
    const { id, hRes } = st;
    const dx = (e.clientX - st.sx) / st.aw, dy = (e.clientY - st.sy) / st.ah, r = { ...st.r }, c = st.c;
    // Raster und gleiche Abstände: Kanten rasten an Kanten der anderen Fenster, an „Kante + 12 px Abstand“ und an gleiche Breiten/Höhen ein,
    // sonst an ein 8-px-Raster. Alt gedrückt oder Ausrichtlinien aus = frei
    const pr = panelEl.getBoundingClientRect(), el = $(id), free = !snapOn || e.altKey;
    if (!st.lines) st.lines = blkLines(el);
    const L = st.lines, x0 = pr.left + st.r.x * st.aw, y0 = pr.top + st.r.y * st.ah, w0 = st.r.w * st.aw, h0 = (st.r.h || st.h0) * st.ah;
    let gx = null, gy = null;
    if (!c) {
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = x0 + (e.clientX - st.sx), y = y0 + (e.clientY - st.sy);
      if (!free) { const sx = snapEdge(x, w, L.xs), sy = snapEdge(y, h, L.ys); if (sx) { x = sx.v; gx = sx.g; } else x = grid(x, pr.left); if (sy) { y = sy.v; gy = sy.g; } else y = grid(y, pr.top); }
      r.x = (x - pr.left) / st.aw; r.y = (y - pr.top) / st.ah;
    }
    else {
      let x = x0, w = w0, y = y0, h = h0;
      if (c.includes("l")) { x = x0 + (e.clientX - st.sx); if (!free) { const v = near(x, L.xs); if (v != null) { x = v; gx = v; } else x = grid(x, pr.left); } w = x0 + w0 - x; }
      else if (c.includes("r")) { w = w0 + (e.clientX - st.sx); if (!free) { const v = near(x0 + w, L.xs), ww = near(w, L.ws); if (v != null) { w = v - x0; gx = v; } else if (ww != null) w = ww; else w = grid(x0 + w, pr.left) - x0; } }
      if ((c.includes("t") || c.includes("b")) && (hRes || c.includes("t"))) {
        if (c.includes("t")) { y = y0 + (e.clientY - st.sy); if (!free) { const v = near(y, L.ys); if (v != null) { y = v; gy = v; } else y = grid(y, pr.top); } h = y0 + h0 - y; }
        else { h = h0 + (e.clientY - st.sy); if (!free) { const v = near(y0 + h, L.ys), hh = near(h, L.hs); if (v != null) { h = v - y0; gy = v; } else if (hh != null) h = hh; else h = grid(y0 + h, pr.top) - y0; } }
      }
      r.x = (x - pr.left) / st.aw; r.w = w / st.aw; r.y = (y - pr.top) / st.ah; if (hRes) r.h = h / st.ah;
    }
    showGuides(gx, gy); document.body.classList.add("gridshow");
    r.w = Math.max(0.12, Math.min(1, r.w)); if (r.h) r.h = Math.max(0.06, Math.min(1, r.h));
    const hh = r.h || st.h0;
    r.x = Math.max(0, Math.min(1 - r.w, r.x)); r.y = Math.max(0, Math.min(1 - Math.min(hh, 1), r.y));
    freeLayout[id] = r; applyLayout();
  }, true);
  const arrEnd = () => { if (!arrSt) return; arrSt = null; showGuides(); document.body.classList.remove("gridshow"); window.jarvis.setConfig({ panelLayout: freeLayout }); };
  window.addEventListener("pointerup", arrEnd, true); window.addEventListener("pointercancel", arrEnd, true);
  // Direkt anfassen, ohne Anordnen-Modus: am Kopf (obere Kante) ziehen = verschieben, Ecke unten rechts = Größe,
  // sonst irgendwo kurz festhalten (0,35 s) und dann ziehen. Tasten, Felder und Bildlaufleiste bleiben normal bedienbar
  const NO_GRAB = "button, input, textarea, select, a, webview, iframe, .pg i, .mgrip, [contenteditable]";
  function grabZone(el, e, hRes) {
    // Wie bei normalen Fenstern: alle vier Kanten (8 px) und alle Ecken (16 px) ändern die Größe; oben nur bei Fenstern mit freier Höhe
    const b = el.getBoundingClientRect(), x = e.clientX, y = e.clientY, sb = el.scrollHeight > el.clientHeight + 2; // Bildlaufleiste rechts
    const E = 8, C = 16, L = x < b.left + E, R = x > b.right - (sb ? 4 : E), B = y > b.bottom - E, T = hRes && y < b.top + E;
    const cl = x < b.left + C, cr = x > b.right - C, ct = hRes && y < b.top + C, cb = y > b.bottom - C;
    if (cb && cr) return "br"; if (cb && cl) return "bl"; if (ct && cr && !sb) return "tr"; if (ct && cl) return "tl";
    if (sb && x > b.right - 14 && !R) return null; // Bildlaufleiste bleibt bedienbar
    if (L) return "l"; if (R) return "r"; if (B) return "b"; if (T) return "t";
    return y - b.top < 26 ? "head" : "body";
  }
  for (const [id, , hRes] of BLOCKS) {
    const el = $(id); let hold = null;
    const begin = (e, c) => {
      if (!freeLayout) { freeLayout = captureLayout(); applyLayout(); }
      const pr = panelEl.getBoundingClientRect(), r = { ...freeLayout[id] };
      r.x = el.offsetLeft / pr.width; r.y = el.offsetTop / pr.height; // dort, wo es gerade zu sehen ist
      if (!r.h && hRes) r.h = el.offsetHeight / pr.height;
      selectNudge({ kind: "blk", id, el });
      bringFront(id, r);
      arrSt = { id, hRes, c, sx: e.clientX, sy: e.clientY, r, aw: pr.width, ah: pr.height, h0: el.offsetHeight / pr.height, direct: el };
      el.classList.add("grabbed");
    };
    el.addEventListener("pointerdown", (e) => {
      // Notizblock besteht fast nur aus Textfeld: dort reicht kurzes Festhalten zum Verschieben (Tippen und Markieren gehen weiter)
      const inNote = e.target.id === "notesText";
      if (e.button !== 0 || !expanded || document.body.classList.contains("arrange") || (!inNote && e.target.closest(NO_GRAB))) return;
      const z = inNote ? "body" : grabZone(el, e, hRes); if (!z) return;
      if (z !== "body") { e.preventDefault(); begin(e, ["br", "bl", "tr", "tl", "l", "r", "b", "t"].includes(z) ? z : ""); return; }
      const sx = e.clientX, sy = e.clientY;
      const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) stop(); };
      const stop = () => { clearTimeout(hold); hold = null; window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", stop, true); };
      stop(); window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", stop, true);
      hold = setTimeout(() => { stop(); if (inNote) { e.target.blur(); getSelection()?.removeAllRanges(); } begin({ clientX: sx, clientY: sy }, ""); }, inNote ? 450 : 350);
    });
    el.addEventListener("pointermove", (e) => {
      if (arrSt || !expanded || document.body.classList.contains("arrange")) return;
      const z = e.target.closest(NO_GRAB) ? null : grabZone(el, e, hRes);
      el.style.cursor = z === "br" || z === "tl" ? "nwse-resize" : z === "bl" || z === "tr" ? "nesw-resize" : z === "l" || z === "r" ? "ew-resize" : z === "b" || z === "t" ? "ns-resize" : z === "head" ? "grab" : "";
    });
  }
  // nach direktem Ziehen keinen Klick auslösen (z. B. Hinweis in der Systemwache)
  window.addEventListener("pointerup", () => { for (const g of document.querySelectorAll(".panel > .grabbed")) { g.classList.remove("grabbed"); noClick = g; setTimeout(() => { if (noClick === g) noClick = null; }, 50); } }, true);
  function setArrange(on) {
    if (on && !expanded) return;
    if (on && !freeLayout) { freeLayout = captureLayout(); applyLayout(); window.jarvis.setConfig({ panelLayout: freeLayout }); }
    document.body.classList.toggle("arrange", on); $("arrangeBtn").setAttribute("aria-pressed", String(on)); placeOverlays();
    ytLast = ""; ytLayout?.(); twLastKey = ""; twLayout?.();
  }
  $("arrangeBtn").addEventListener("click", () => setArrange(!document.body.classList.contains("arrange")));
  // Fenster aus- und wieder einblenden (× im Anordnen-Modus, Liste in der Leiste, Einstellungen → Panel und Medien)
  const MINE_IDS = ["mOver", "mTick", "mHeat", "mLive", "mine", "farm", "farm2", "farm3", "farm4"];
  let miningOn = true;
  const BLOCK_NAMES = { ...Object.fromEntries(BLOCKS.map(([id, n]) => [id, n])), strataBtn: "Strata-Knopf" };
  function applyHidden() {
    for (const [id] of BLOCKS) $(id).classList.toggle("gone", hiddenSet.has(id) || (!miningOn && MINE_IDS.includes(id)));
    const shown = (id) => BLOCK_NAMES[id] && (miningOn || !MINE_IDS.includes(id));
    const hid = [...hiddenSet].filter(shown), sel = $("arrAdd");
    sel.replaceChildren(new Option(hid.length ? `Einblenden (${hid.length})…` : "Alle Fenster sichtbar", ""), ...hid.map((id) => new Option(BLOCK_NAMES[id], id))); sel.disabled = !hid.length;
    $("blockRows").replaceChildren(...Object.entries(BLOCK_NAMES).filter(([id]) => shown(id)).map(([id, n]) => { const l = document.createElement("label"), c = document.createElement("input");
      l.className = "row"; l.append(n + " "); c.type = "checkbox"; c.checked = !hiddenSet.has(id); c.addEventListener("change", () => setHidden(id, !c.checked)); l.append(c); return l; }));
    // „Claude“, „Lokal“ an der Kugel: gleiche Schalter wie unter Einstellungen, Anzeigen
    $("blockRows").append(...[["aiClaude", "Claude-Anzeige"], ["aiLocal", "Lokal-Anzeige"]].map(([k, n]) => { const l = document.createElement("label"), c = document.createElement("input");
      l.className = "row"; l.append(n + " "); c.type = "checkbox"; c.checked = widgets[k]?.on !== false;
      c.addEventListener("change", () => { widgets[k] = { ...widgets[k], on: c.checked }; window.jarvis.setConfig({ widgets: { [k]: widgets[k] } }); try { buildWidgetRows(); } catch {} });
      l.append(c); return l; }));
    try { renderMineFx(); renderMOver(); } catch {} // gerade eingeblendet: gleich füllen
    try { mirrorSync(); } catch {}
    fitPanel?.(); placeOverlays();
  }
  function setHidden(id, hide) { if (hide) hiddenSet.add(id); else hiddenSet.delete(id); applyHidden(); window.jarvis.setConfig({ hiddenBlocks: [...hiddenSet] }); }
  $("arrAdd").addEventListener("change", (e) => { if (e.target.value) setHidden(e.target.value, false); });
  window.jarvis.getConfig?.().then((c) => { hiddenSet = new Set(Array.isArray(c.hiddenBlocks) ? c.hiddenBlocks : []); applyHidden(); });
  $("arrDone").addEventListener("click", () => setArrange(false));
  // Schrift je Block größer/kleiner: Strg + Mausrad über Protokoll, Chat, Systemwache oder Statuszeile; gemerkt als blockFont
  let blockFont = {};
  const FONT_BLOCKS = ["log", "transcript", "sys", "proc", "mine", "farm", "farm2", "farm3", "farm4", "wx", "clocks", "notes"];
  const applyBlockFont = () => { for (const id of FONT_BLOCKS) { const el = $(id); if (blockFont[id]) el.style.setProperty("--bf", blockFont[id]); else el.style.removeProperty("--bf"); } };
  let bfSave = null;
  for (const id of FONT_BLOCKS) $(id).addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault(); e.stopPropagation();
    const v = Math.max(0.7, Math.min(2.5, (blockFont[id] || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    showPct(e, v); if (Math.abs(v - 1) < 0.03) delete blockFont[id]; else blockFont[id] = Math.round(v * 100) / 100;
    applyBlockFont(); clearTimeout(bfSave); bfSave = setTimeout(() => window.jarvis.setConfig({ blockFont }), 300);
  }, { passive: false });
  window.jarvis.getConfig?.().then((c) => { blockFont = c.blockFont || {}; applyBlockFont(); });
  // Chat-Höhe direkt an der Linie über dem Chat ziehen (ohne Anordnen-Modus), gemerkt als chatH
  let chatH = 0;
  const applyChat = () => { document.body.classList.toggle("chatfix", chatH > 0); if (chatH > 0) document.documentElement.style.setProperty("--chatH", chatH + "px"); fitPanel?.(); };
  { const g = $("chatGrip"); let st = null;
    g.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); st = { y: e.clientY, h: $("transcript").offsetHeight }; g.classList.add("on"); });
    window.addEventListener("pointermove", (e) => { if (!st) return; chatH = Math.round(Math.max(64, Math.min(innerHeight * 0.75, st.h - (e.clientY - st.y)))); applyChat(); }, true);
    window.addEventListener("pointerup", () => { if (!st) return; st = null; g.classList.remove("on"); window.jarvis.setConfig({ chatH }); }, true);
    g.addEventListener("dblclick", () => { chatH = 0; applyChat(); window.jarvis.setConfig({ chatH: 0 }); }); }
  window.jarvis.getConfig?.().then((c) => { chatH = c.chatH || 0; applyChat(); });
  // Seiten wie ein Homescreen: jede Seite hat ihre eigene Anordnung und eigene sichtbare Fenster
  // Gaming-Seite: laufendes Spiel (aus den Systemdaten), Infos von Steam, Tipps. Nichts wird im Spiel gelesen.
  let gameCur = null, gameInfoFor = "", gameInfo = null, gameDraw = "";
  const gel = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
  const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min" : m + " min"; };
  function gameSeen(g) { gameCur = g || null; if (page === "Gaming") gameTick(); }
  async function gameTick(force) {
    if (page !== "Gaming") return;
    const g = gameCur, key = g ? g.name + "|" + (g.appid || "") : "";
    if (key !== gameInfoFor) { gameInfoFor = key; gameInfo = null; gameDraw = ""; if (g) window.jarvis.gameInfo(g.name, g.appid).then((i) => { if (gameInfoFor === key) { gameInfo = i; gameDraw = ""; gameRender(); } }).catch(() => {}); }
    gameRender(force);
  }
  function gameRender() {
    const g = gameCur, i = gameInfo, body = $("gameBody"), minute = Math.floor(Date.now() / 60000);
    const sig = (g ? g.name + minute : "-") + "|" + (i ? "i" : "") + "|" + (g ? "" : "");
    if (sig === gameDraw) return; gameDraw = sig;
    $("gameTitle").textContent = g ? (i?.title || g.name) : "Gaming"; $("gameState").textContent = g ? "läuft · " + fmtDur(Date.now() - g.since) : "";
    const out = [];
    if (!g) {
      out.push(gel("div", "Kein Spiel erkannt.", "g-dim"), gel("div", "Starte ein Spiel (Steam, Epic, GOG, EA, Ubisoft, Battle.net, Riot, Xbox). Argus erkennt es am Programmpfad und zeigt hier Infos und Tipps. Es wird nichts im Spiel gelesen oder eingeklinkt, Anti-Cheat bleibt unberührt.", "g-dim"));
      const dg = sys?.gameDiag; if (dg) out.push(gel("div", `Diagnose: ${dg.withPath} von ${dg.n} Prozessen mit Programmpfad. Steam meldet ${dg.steam?.id ? "AppID " + dg.steam.id : "kein laufendes Spiel"}${dg.steam?.err ? " (Fehler " + dg.steam.err + ")" : ""}.${dg.ship?.length ? " Gefunden: " + dg.ship.join(", ") + "." : ""}`, "g-dim"));
    } else {
      const f = gel("div", null, "g-facts"); f.append(gel("span", g.launcher));
      if (i?.genres?.length) f.append(gel("span", i.genres.join(", ")));
      if (i?.players != null) f.append(gel("span", i.players.toLocaleString("de-DE") + " spielen gerade (Steam)"));
      if (i?.meta) f.append(gel("span", "Metacritic " + i.meta)); if (i?.price) f.append(gel("span", i.price)); if (i?.release) f.append(gel("span", i.release));
      out.push(f);
      if (i?.desc) out.push(gel("div", i.desc));
      else if (!i) out.push(gel("div", "Lade Infos …", "g-dim"));
      else if (i.error && !i.appid) out.push(gel("div", "Keine Steam-Infos gefunden.", "g-dim"));
      if (i?.tips?.length) { out.push(gel("h5", "Tipps")); const ul = gel("ul"); for (const t of i.tips) ul.append(gel("li", t)); out.push(ul, gel("div", "Von Hand gesammelt, ohne Gewähr.", "g-dim")); }
      else if (i) out.push(gel("div", "Für dieses Spiel habe ich noch keine eigenen Tipps. Unten sind Suchlinks.", "g-dim"));
      if (i?.news?.length) { out.push(gel("h5", "Neuigkeiten")); for (const n of i.news) { const d = gel("div", n.title, "g-news"); if (n.url) d.addEventListener("click", () => window.jarvis.openUrl(n.url)); out.push(d); } }
      out.push(gel("h5", "Nachschlagen")); const L = gel("div", null, "g-links"), q = encodeURIComponent(i?.title || g.name);
      for (const [lbl, url] of [["PCGamingWiki", "https://www.pcgamingwiki.com/w/index.php?search=" + q], ["Tipps auf YouTube", "https://www.youtube.com/results?search_query=" + q + "+tipps"], ["Steam-Guides", i?.appid || g.appid ? "https://steamcommunity.com/app/" + (i?.appid || g.appid) + "/guides/" : "https://steamcommunity.com/search/SearchResultsAjax?text=" + q], ["Reddit", "https://www.reddit.com/search/?q=" + q]]) { const b = gel("button", lbl, "btn"); b.type = "button"; b.addEventListener("click", () => window.jarvis.openUrl(url)); L.append(b); }
      out.push(L);
    }
    body.replaceChildren(...out);
  }
  setInterval(() => { if (page === "Gaming" && gameCur) gameRender(); }, 20000);
  const PAGE_DEF = { Gaming: ["game", "sys", "proc", "notes", "mirror", "notice"], Mining: ["proc", "mTick", "mOver", "mHeat", "mLive", "mine", "farm", "farm2", "farm3", "farm4", "clocks", "notice"] };
  let pages = {}, page = "Start", gamingOn = true, pagesOn = true, mineOrb = true, pageFriends = false, orbMine = false;
  function onMining() { return miningOn && pagesOn && page === "Mining"; }
  function pageClasses() {
    const m = onMining(); orbMine = m && mineOrb;
    document.body.classList.toggle("pg-gaming", page === "Gaming"); $("game").hidden = page !== "Gaming"; if (page === "Gaming") gameTick(true);
    document.body.classList.toggle("pg-mining", m); document.body.classList.toggle("noorb", m && !mineOrb);
    $("pageTabs").hidden = !gamingOn && !(miningOn && pagesOn);
    for (const b of $("pageTabs").children) b.hidden = (b.dataset.pg === "Mining" && (!miningOn || !pagesOn)) || (b.dataset.pg === "Gaming" && !gamingOn); for (const t of temps) t.val = undefined;
    for (const p of pulses) p.hue = hueOf(nodes[p.a]);
  }
  // Kugel (Größe, Lage, an/aus) und die Knöpfe (Claude · Lokal, Strata, Leerlauf) gehören mit zur Seite: auf Start vergrößern oder ausblenden ändert Mining nicht
  function snapPage() { return { panelLayout: JSON.parse(JSON.stringify(freeLayout || {})), hiddenBlocks: [...hiddenSet], pins: { ...pins }, scales: { ...scales }, ballScale, ballOff: { ...ballOff }, ballOn, statusOn, aiOn: widgets.ai?.on !== false, strataOn: widgets.strata?.on !== false, friendsOn: widgets.friends?.on !== false, friendsBox: { ...friendsBox } }; }
  function renderPages() { for (const b of $("pageTabs").children) b.classList.toggle("on", b.dataset.pg === page); }
  function switchPage(n) {
    if (n === page) return;
    pages[page] = snapPage(); page = n;
    const pf = pages[n] || (PAGE_DEF[n] ? { panelLayout: {}, hiddenBlocks: BLOCKS.map(([id]) => id).filter((id) => !PAGE_DEF[n].includes(id)), pins: {}, scales: {} } : null);
    if (pf) { const L = pf.panelLayout || {}; freeLayout = Object.keys(L).length ? JSON.parse(JSON.stringify(L)) : null; hiddenSet = new Set(pf.hiddenBlocks || []); if (n === "Mining") hiddenSet.add("yt"); if (n !== "Gaming") hiddenSet.add("game"); pins = { ...(pf.pins || {}) }; scales = { ...(pf.scales || {}) }; if (pf.ballScale) { ballScale = pf.ballScale; applyBallScale(); window.jarvis.setScale("ballScale", ballScale); } if (pf.ballOff) ballOff = { ...pf.ballOff };
      ballOn = pf.ballOn !== false; statusOn = pf.statusOn !== false; $("setBallOn").checked = ballOn; $("setStatusOn").checked = statusOn; applyUi();
      widgets.ai = { ...widgets.ai, on: pf.aiOn !== false }; widgets.strata = { ...widgets.strata, on: pf.strataOn !== false }; widgets.friends = { ...widgets.friends, on: pf.friendsOn !== false }; $("setFriendsOn").checked = widgets.friends.on; try { buildWidgetRows(); } catch {}
      friendsBox = { w: 180, h: 0, scale: 1, ...(pf.friendsBox || {}) }; fgRes = null; f2Res = null; applyFriendsBox(); // Größe der Freundeslisten gehört zur Seite
      window.jarvis.setConfig({ ballOn, statusOn, friendsBox, widgets: { ai: widgets.ai, strata: widgets.strata, friends: widgets.friends } });
      applyHidden(); applyLayout(); } // erst ausblenden, dann anordnen: sonst springt YouTube kurz in voller Breite auf
    renderPages(); pageClasses(); renderMOver(); renderMineFx(); window.jarvis.setConfig({ pages, page, panelLayout: freeLayout || {}, hiddenBlocks: [...hiddenSet], pins, scales, ballOff });
  }
  function applyMiningOn() {
    document.body.classList.toggle("nomining", !miningOn);
    if ((!miningOn && page === "Mining") || (!gamingOn && page === "Gaming")) { const p = pagesOn; pagesOn = true; switchPage("Start"); pagesOn = p; }
    pageClasses(); applyHidden();
  }
  $("setGamingOn").addEventListener("change", (e) => { gamingOn = e.target.checked; applyMiningOn(); window.jarvis.setConfig({ gamingOn }); if (gamingOn) { switchPage("Gaming"); try { notice?.("Gaming-Seite oben links neben ARGUS (Strg+3)"); } catch {} } });
  $("setMiningOn").addEventListener("change", (e) => { miningOn = e.target.checked; applyMiningOn(); window.jarvis.setConfig({ miningOn }); });
  $("setPagesOn").addEventListener("change", (e) => { pagesOn = e.target.checked; if (!pagesOn && page === "Mining") { pagesOn = true; switchPage("Start"); pagesOn = false; } pageClasses(); window.jarvis.setConfig({ pagesOn }); });
  $("setMineOrb").addEventListener("change", (e) => { mineOrb = e.target.checked; pageClasses(); window.jarvis.setConfig({ mineOrb }); });
  $("setOceanTotal").addEventListener("change", (e) => { oceanInTotal = e.target.checked; fmTotC = null; renderMOver(); renderFarm(); window.jarvis.setConfig({ oceanInTotal }); });
  $("setPageFriends").addEventListener("change", (e) => { pageFriends = e.target.checked; window.jarvis.setConfig({ pageFriends }); });
  const applyMineView = (v) => { document.body.classList.toggle("mview-balken", v === "balken"); fitPanel?.(); };
  $("setMineView").addEventListener("change", (e) => { applyMineView(e.target.value); window.jarvis.setConfig({ mineView: e.target.value }); });
  for (const b of $("pageTabs").children) b.addEventListener("click", () => switchPage(b.dataset.pg));
  addEventListener("keydown", (e) => { if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "1" || e.key === "2" || e.key === "3")) { e.preventDefault(); const t = e.key === "1" ? "Start" : e.key === "2" ? "Mining" : "Gaming"; if ((t === "Mining" && !miningOn) || (t === "Gaming" && !gamingOn)) return; switchPage(t); } });
  window.jarvis.getConfig?.().then((c) => {
    pages = c.pages || {}; gamingOn = c.gamingOn !== false; $("setGamingOn").checked = gamingOn; page = c.page === "Mining" ? "Mining" : c.page === "Gaming" && c.gamingOn !== false ? "Gaming" : "Start"; if (page !== "Gaming") hiddenSet.add("game"); miningOn = c.miningOn !== false; $("setMiningOn").checked = miningOn; pagesOn = c.pagesOn !== false; mineOrb = c.mineOrb !== false; pageFriends = !!c.pageFriends; oceanInTotal = c.oceanInTotal !== false; $("setOceanTotal").checked = oceanInTotal; fmTotC = null;
    $("setPagesOn").checked = pagesOn; $("setMineOrb").checked = mineOrb; $("setPageFriends").checked = pageFriends; $("setMineView").value = c.mineView || "kacheln"; applyMineView(c.mineView);
    // neuer Überblick (0.31.1): nur auf der Mining-Seite einblenden, auf Start nicht ungefragt dazwischenschieben
    // 0.31.3: Ticker, Heatmap, Hashrate live genauso nur auf der Mining-Seite einblenden
    if (!c.mFxInit) {
      const nw = ["mTick", "mHeat", "mLive"];
      if (page !== "Mining") { nw.forEach((id) => hiddenSet.add(id)); applyHidden(); } else if (pages.Start) pages.Start.hiddenBlocks = [...new Set([...(pages.Start.hiddenBlocks || []), ...nw])];
      if (pages.Mining && page !== "Mining") pages.Mining.hiddenBlocks = (pages.Mining.hiddenBlocks || []).filter((id) => !nw.includes(id));
      window.jarvis.setConfig({ mFxInit: true, pages, hiddenBlocks: [...hiddenSet] });
    }
    mineFx = { ...mineFx, ...(c.mineFx || {}) }; $("setTickSpeed").value = mineFx.tick; $("setTickFont").value = mineFx.tickFont; $("setHeatSize").value = mineFx.heat; $("setLiveRange").value = String(mineFx.live); $("setLiveH").value = mineFx.liveH; $("setSinceOn").checked = mineFx.since !== false;
    if (!c.mOverInit) {
      if (page !== "Mining") { hiddenSet.add("mOver"); applyHidden(); } else if (pages.Start) pages.Start.hiddenBlocks = [...new Set([...(pages.Start.hiddenBlocks || []), "mOver"])];
      if (pages.Mining && page !== "Mining") pages.Mining.hiddenBlocks = (pages.Mining.hiddenBlocks || []).filter((id) => id !== "mOver");
      window.jarvis.setConfig({ mOverInit: true, pages, hiddenBlocks: [...hiddenSet] });
    }
    // 0.31.9: YouTube nur auf der Start-Seite (0.31.8 hatte es auf Mining mitgenommen)
    if (pages.Mining) pages.Mining.hiddenBlocks = [...new Set([...(pages.Mining.hiddenBlocks || []), "yt", "tw"])];
    if (page === "Mining" && (!hiddenSet.has("yt") || !hiddenSet.has("tw"))) { hiddenSet.add("yt"); hiddenSet.add("tw"); applyHidden(); window.jarvis.setConfig({ pages, hiddenBlocks: [...hiddenSet] }); }
    if (!pagesOn && page === "Mining") { pagesOn = true; switchPage("Start"); pagesOn = false; }
    renderPages(); pageClasses(); renderMOver(); renderMineFx(); applyMiningOn();
  });
  const saveFx = (patch) => { mineFx = { ...mineFx, ...patch }; tickSig = ""; renderMineFx(); renderMOver(); clearTimeout(saveFx.t); saveFx.t = setTimeout(() => window.jarvis.setConfig({ mineFx }), 300); };
  $("setTickSpeed").addEventListener("input", (e) => saveFx({ tick: +e.target.value }));
  $("setTickFont").addEventListener("input", (e) => saveFx({ tickFont: +e.target.value }));
  $("setHeatSize").addEventListener("input", (e) => saveFx({ heat: +e.target.value }));
  $("setLiveRange").addEventListener("change", (e) => saveFx({ live: +e.target.value }));
  $("setLiveH").addEventListener("input", (e) => saveFx({ liveH: +e.target.value }));
  $("setSinceOn").addEventListener("change", (e) => saveFx({ since: e.target.checked }));
  // Layout-Profile: Anordnung, ausgeblendete Fenster, Lage und Größe der Anzeigen
  // „Speichern“ legt immer ein neues Profil an (Name mit Seite und Uhrzeit), kein Auswählen vorher nötig; das zuletzt gespeicherte ist vorgewählt
  let profs = {}, prof = "";
  const profNames = () => Object.keys(profs).filter((n) => profs[n]).sort((a, b) => (profs[b].t || 0) - (profs[a].t || 0));
  function renderProfs() { $("arrProf").replaceChildren(new Option(profNames().length ? "Profil laden …" : "Noch keine Profile", ""), ...profNames().map((n) => new Option(n, n))); $("arrProf").value = profs[prof] ? prof : ""; $("arrProfDel").hidden = !profs[prof]; }
  $("arrProf").addEventListener("change", (e) => {
    prof = e.target.value; const pf = profs[prof]; if (!pf) return renderProfs();
    freeLayout = JSON.parse(JSON.stringify(pf.panelLayout || {})); hiddenSet = new Set(pf.hiddenBlocks || []); pins = { ...(pf.pins || {}) }; scales = { ...(pf.scales || {}) };
    applyLayout(); applyHidden(); renderProfs(); window.jarvis.setConfig({ panelLayout: freeLayout, hiddenBlocks: [...hiddenSet], pins, scales, profLast: prof });
  });
  $("arrProfSave").addEventListener("click", () => {
    const d = new Date(), base = (onMining() ? "Mining" : "Start") + " · " + d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    let n = base, k = 2; while (profs[n]) n = base + " (" + k++ + ")";
    profs[n] = { panelLayout: JSON.parse(JSON.stringify(freeLayout || {})), hiddenBlocks: [...hiddenSet], pins: { ...pins }, scales: { ...scales }, t: Date.now() }; prof = n;
    const all = profNames(); for (const old of all.slice(20)) delete profs[old]; // höchstens 20 behalten
    window.jarvis.setConfig({ layoutProfiles: profs, profLast: prof }); renderProfs(); $("arrProfSave").textContent = "Gespeichert ✓"; setTimeout(() => { $("arrProfSave").textContent = "Speichern"; }, 1500);
  });
  $("arrProfDel").addEventListener("click", () => { if (!profs[prof]) return; delete profs[prof]; prof = ""; window.jarvis.setConfig({ layoutProfiles: profs, profLast: "" }); renderProfs(); });
  window.jarvis.getConfig?.().then((c) => { profs = c.layoutProfiles || {}; prof = c.profLast || ""; renderProfs(); });
  $("arrHole").addEventListener("click", () => holePlace());
  $("arrTidy").addEventListener("click", () => {
    if (!freeLayout) return;
    const pr = panelEl.getBoundingClientRect(), g = (f, n) => Math.round(f * n / GRID) * GRID / n;
    for (const [id, , hRes] of BLOCKS) { const r = freeLayout[id]; if (!r) continue; r.x = g(r.x, pr.width); r.y = g(r.y, pr.height); r.w = g(r.w, pr.width); if (hRes && r.h) r.h = g(r.h, pr.height); }
    applyLayout(); window.jarvis.setConfig({ panelLayout: freeLayout });
  });
  // Rahmen dürfen nie mitscrollen: sonst rutschen Kopfleiste (Einstellungen, Minimieren, Schließen) und Panel aus dem Bild
  // (Domi: nach „Zurücksetzen“/Profil kam man an nichts mehr heran). Listen, Chat und Textfelder scrollen weiter normal.
  const NO_SCROLL = ".shell, #stage, body.free .panel";
  const unscroll = (el) => { if (el && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } };
  document.addEventListener("scroll", (e) => { const t = e.target; if (t === document || t === document.documentElement || t === document.body) { unscroll(document.documentElement); unscroll(document.body); } else if (t.matches?.(NO_SCROLL)) unscroll(t); }, true);
  setInterval(() => { unscroll(document.documentElement); unscroll(document.body); document.querySelectorAll(NO_SCROLL).forEach(unscroll); }, 1000);
  // Anzeigen „Claude · Lokal“, Strata und Leerlauf: × zum Ausblenden (zurück: Rechtsklick → Anzeigen)
  function hideWidget(k, on) { widgets[k] = { ...widgets[k], on }; window.jarvis.setConfig({ widgets: { [k]: widgets[k] } }); try { buildWidgetRows(); } catch {} }
  for (const [el, fn] of [[$("pill"), () => { statusOn = false; $("setStatusOn").checked = false; applyUi(); sv({ statusOn }); }], [who, () => hideWidget("ai", false)], [$("strataBtn"), () => hideWidget("strata", false)]]) {
    const x = document.createElement("button"); x.type = "button"; x.className = "hx"; x.textContent = "×"; x.title = "Ausblenden (zurück: Rechtsklick → Anzeigen)"; x.setAttribute("aria-label", "Ausblenden");
    for (const ev of ["pointerdown", "mousedown", "dblclick"]) x.addEventListener(ev, (e) => e.stopPropagation());
    x.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); fn(); }); el.append(x);
  }
  // Das Rechtsklick-Menü zeigt nur, was auf der geöffneten Seite vorkommt (Mining-Dinge nicht auf Start usw.)
  const MINE_BLK = ["mTick", "mOver", "mHeat", "mLive", "mine", "farm", "farm2", "farm3", "farm4"];
  function pageHas(id) {
    if (MINE_BLK.includes(id)) return miningOn && page === "Mining";
    if (page === "Mining") return PAGE_DEF.Mining.includes(id);
    if (page === "Gaming") return PAGE_DEF.Gaming.includes(id);
    return id !== "game";
  }
  function pageBtn(k) {
    const ts = temps.filter((t) => t.w === k); if (!ts.length) return true; // Knöpfe ohne Messwert-Anzeige (Claude · Lokal, Strata, Freundesliste …) gelten überall
    return ts.some((t) => (miningOn && page === "Mining" ? t.page === "Mining" || t.trend : t.page !== "Mining"));
  }
  // Rechtsklick: Menü aus main (Einstellungen, Anordnen, Profile, Skins …). Rechts ziehen dreht die Form, das öffnet kein Menü.
  let rDown = null;
  window.addEventListener("mousedown", (e) => { if (e.button === 2) rDown = [e.screenX, e.screenY]; }, true);
  window.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    const moved = rDown && Math.hypot(e.screenX - rDown[0], e.screenY - rDown[1]) > 6; rDown = null;
    if (moved) return;
    // Was liegt unter der Maus? Danach richten sich die ersten Einträge im Menü
    let target = null; const tEl = e.target.closest?.(".temp");
    if (tEl) { const t = temps.find((x) => x.el === tEl); if (t) target = { kind: "temp", key: t.key, w: t.w, name: t.name + (t.key.endsWith("C") ? " Takt" : t.key.endsWith("T") ? " Temperatur" : "") }; }
    else if (e.target.closest?.("#pill")) target = { kind: "pill" };
    else if (e.target.closest?.(".who")) target = { kind: "who" };
    else if (e.target.closest?.("#strataBtn")) target = { kind: "strata" };
    else { const bk = expanded ? e.target.closest?.(".panel > .blk, .panel > .sys, .panel > .yt") : null; if (bk && BLOCK_NAMES[bk.id]) target = { kind: "blk", id: bk.id, name: BLOCK_NAMES[bk.id] }; else { const h = hit(e, true); if (h.inside || h.rim) target = { kind: "ball" }; } }
    const cs = getComputedStyle(document.documentElement), vars = {};
    for (const k of ["--win-h", "--win-s", "--win-l", "--accent", "--ink", "--ink-dim", "--line", "--f-body", "--f-mono", "--f-display"]) vars[k] = cs.getPropertyValue(k).trim();
    vars["--menu-a"] = String(Math.max(0.3, Math.min(1, menuAlpha / 100)));
    const cfg = await window.jarvis.getConfig().catch(() => ({}));
    const ed = e.target.closest?.("textarea, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color])");
    const opts = { shapes: SHAPES, shape, hue: theme.hue, regions: theme.regions, rim: shapeRim, flat: flat2d, glow: glowK, spin: spinK, flash: flashK, labels: $("setBallLabels").value, bshape: $("setBtnShape").value, blook: $("setBtnLook").value, bshapes: B_SHAPES, blooks: B_LOOKS };
    window.jarvis.ctxMenu?.({ target, opts, vars, buttons: WIDGET_ROWS.filter(([k]) => pageBtn(k)).map(([k, l]) => [k, l, widgets[k]?.on !== false, btnAvail(k)]), hfans: (widgets.fans?.on === false ? (sys.fans || []) : (sys.fans || []).filter((f) => !visFans().slice(0, 12).includes(f))).map((f) => f.name), flags: { ball: ballOn, status: statusOn, ai: widgets.ai?.on !== false, strata: widgets.strata?.on !== false, steam: !!cfg.steamOn, discord: !!cfg.discordOn, friends: widgets.friends?.on !== false, mini: miniMore, hole: !!cfg.holeOn }, edit: !!ed, sel: !!String(getSelection() || "").trim(), arrange: document.body.classList.contains("arrange"), profs: profNames().slice(0, 10), hidden: [...hiddenSet].filter((id) => BLOCK_NAMES[id] && pageHas(id)).map((id) => [id, BLOCK_NAMES[id]]), media: !mediaOn });
  });
  // Gibt es für diese Anzeige gerade Messwerte? Argus erkennt das selbst aus den Live-Daten (Sensor fehlt = nicht anbieten)
  function btnAvail(k) {
    const on = widgets[k]?.on !== false; // was gerade an ist, bleibt immer wählbar (zum Ausschalten)
    if (k === "fans") return on || (sys.fans || []).length > 0;
    // nur Messwerte der Hardware werden nach vorhandenen Daten beurteilt; Bitcoin, Wetter, Steam, Discord, Mining liefern erst Daten, wenn sie an sind (sonst nie einschaltbar)
    if (on || !["cpuTemp", "gpuTemp", "cpuClock", "gpuClock"].includes(k)) return true;
    const ts = temps.filter((t) => t.w === k);
    if (!ts.length) return true;
    return ts.some((t) => { try { const v = t.get(); return v != null && !Number.isNaN(v); } catch { return false; } });
  }
  window.jarvis.onCtxAction?.(({ a, v }) => {
    if (a === "showfan" && typeof v === "string") { // genau diesen Lüfter einblenden; war die ganze Lüfter-Anzeige aus, erscheint nur er allein
      if (widgets.fans?.on === false) { hiddenFans = (sys.fans || []).map((f) => f.name).filter((n) => n !== v); hideWidget("fans", true); } else hiddenFans = hiddenFans.filter((n) => n !== v);
      window.jarvis.setConfig({ hiddenFans }); return; }
    if (a === "settings") { if ($("settings").hidden) $("settingsBtn").click(); }
    else if (a === "arrange") $("arrangeBtn").click();
    else if (a === "holeplace") holePlace();
    else if (a === "tog") {
      if (v === "ball") { ballOn = !ballOn; $("setBallOn").checked = ballOn; applyUi(); sv({ ballOn }); }
      else if (v === "status") { statusOn = !statusOn; $("setStatusOn").checked = statusOn; applyUi(); sv({ statusOn }); }
      else if (v === "ai" || v === "strata") hideWidget(v, widgets[v]?.on === false);
      else if (v === "mini") { miniMore = !miniMore; $("setMiniMore").checked = miniMore; applyUi(); sv({ miniMore }); }
      else if (v === "steam" || v === "discord") { // aus der gespeicherten Einstellung umschalten (das Häkchen in den Einstellungen kann veraltet sein); Einschalten holt auch die Freundesliste zurück
        const k = v === "steam" ? "steamOn" : "discordOn", box = $(v === "steam" ? "setSteamOn" : "setDiscordOn");
        window.jarvis.getConfig().then((c) => { const nv = c[k] === false; box.checked = nv; window.jarvis.setConfig({ [k]: nv }); if (nv && widgets.friends?.on === false) setFriendsOn(true); });
      }
      else if (v === "friends") setFriendsOn(widgets.friends?.on === false);
    }
    else if (a === "setw" && v && typeof v.k === "string") hideWidget(v.k, v.flip ? widgets[v.k]?.on === false : !!v.on); // flip: vom aktuellen Stand umschalten (das Menü bleibt offen, sein Häkchen kann veraltet sein)
    else if (a === "hidetemp") { const t = temps.find((x) => x.key === v); if (t && /^fan\d$/.test(t.key)) { const nm = fanOf(+t.key.slice(3))?.name; if (nm) { hiddenFans = [...hiddenFans, nm]; window.jarvis.setConfig({ hiddenFans }); } } else if (t) { widgets[t.w] = { ...widgets[t.w], on: false }; window.jarvis.setConfig({ widgets: { [t.w]: widgets[t.w] } }); try { buildWidgetRows(); } catch {} } }
    else if (a === "hideblk" && BLOCK_NAMES[v]) setHidden(v, true);
    else if ((a === "blkfront" || a === "blkback") && BLOCK_NAMES[v]) {
      if (!freeLayout) { freeLayout = captureLayout(); applyLayout(); }
      if (freeLayout[v]) { if (a === "blkfront") bringFront(v); else { for (const k of Object.keys(freeLayout)) if (freeLayout[k]) freeLayout[k].z = (freeLayout[k].z || 0) + 1; freeLayout[v].z = 0; applyZ(); } window.jarvis.setConfig({ panelLayout: freeLayout }); }
    }
    else if (a === "holetoggle") window.jarvis.getConfig().then((c) => { window.jarvis.setConfig({ holeOn: !c.holeOn, holeEdit: false }); $("setHoleOn").checked = !c.holeOn; });
    else if (a === "ctxset" && v && typeof v.k === "string") { // Rechtsklick-Menü am Element: stellt über die Einstellungs-Steuerung ein, damit alles den gleichen Weg nimmt
      const ids = { shape: "setShape", hue: "setHue", regions: "setRegions", glow: "setGlow", spin: "setSpin", flash: "setFlash", labels: "setBallLabels", bshape: "setBtnShape", blook: "setBtnLook", rim: "setShapeRim", flat: "setShape2d" }, el = ids[v.k] && $(ids[v.k]);
      if (el) { if (el.type === "checkbox") el.checked = !!v.v; else el.value = v.v; if (el.type === "range") el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); }
    }
    else if (a === "reset") $("arrReset").click();
    else if (a === "profile" && profs[v]) { $("arrProf").value = v; $("arrProf").dispatchEvent(new Event("change")); }
    else if (a === "skin") [...document.querySelectorAll("#skinPick button")].find((b) => b.dataset.n === v)?.click();
    else if (a === "notes") { $("setNotesOn").checked = !$("setNotesOn").checked; $("setNotesOn").dispatchEvent(new Event("change")); }
    else if (a === "yt") $("ytBtn").click();
    else if (a === "tw") $("twBtn").click();
    else if (a === "unhide") { if (v === "*") { for (const id of [...hiddenSet]) setHidden(id, false); } else if (BLOCK_NAMES[v]) setHidden(v, false); }
    else if (a === "media") { mediaOn = true; $("setMedia").checked = true; renderMedia(); window.jarvis.setConfig({ mediaOn }); }
  });
  $("arrReset").addEventListener("click", () => { freeLayout = null; ballOff = { x: 0, y: 0 }; applyLayout(); setArrange(false); window.jarvis.setConfig({ panelLayout: {}, ballOff }); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("arrange")) { e.stopPropagation(); setArrange(false); } }, true);

