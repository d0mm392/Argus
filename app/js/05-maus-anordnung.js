"use strict";
  // ---------- Beschriftungen, Maus und Größen-Griff ----------
  const lblLayer = document.createElement("div"); lblLayer.className = "lbls"; canvas.after(lblLayer);
  lblLayer.append(ringHandle); makeDraggable(ringHandle, () => "rings");
  // ---------- Selbst angeordnete Teile ----------
  // Anzeigen, Symbole, Mikrofon und Freundesliste lassen sich ziehen. Die Stelle wird relativ zur Kugel gemerkt (Winkel und Abstand in Kugelradien),
  // dort schweben sie weiter leicht hin und her. Doppelklick schickt ein Teil an seinen Standardplatz zurück.
  let pins = {}, drag = null, noClick = null, pinSave = null, hiddenSet = new Set();
  let gameMode = false, gmLast = 0, snapOn = true; // Spielmodus (1 Bild pro Sekunde bei Vollbild-Programm), Ausrichtlinien
  // Ausrichtlinien: beim Ziehen rasten Kanten und Mitte an Kanten und Mitten der anderen Teile ein (6 px), Alt gedrückt = frei
  const guides = document.createElement("div"); guides.id = "guides"; guides.innerHTML = '<i class="v"></i><i class="h"></i>'; document.body.append(guides);
  function snapTo(cx, cy, w, h, xs, ys, e) {
    if (!snapOn || e?.altKey) return { cx, cy };
    const T = 6, best = (pos, half, lines) => { let d = T + 1, at = null; for (const v of lines) for (const o of [-half, 0, half]) { const dd = v - (pos + o); if (Math.abs(dd) < Math.abs(d)) { d = dd; at = v; } } return Math.abs(d) <= T ? { d, at } : null; };
    const bx = best(cx, w / 2, xs), by = best(cy, h / 2, ys);
    return { cx: cx + (bx?.d || 0), cy: cy + (by?.d || 0), gx: bx?.at, gy: by?.at };
  }
  function showGuides(gx, gy) { const [v, hz] = guides.children; v.style.display = gx == null ? "none" : "block"; if (gx != null) v.style.left = Math.round(gx) + "px"; hz.style.display = gy == null ? "none" : "block"; if (gy != null) hz.style.top = Math.round(gy) + "px"; }
  // Linien der anderen sichtbaren Teile (Bildschirmkoordinaten), ohne das gezogene
  function guideLines(except, sel) {
    const xs = [], ys = [];
    for (const o of document.querySelectorAll(sel)) {
      if (o === except || except?.contains(o) || o.contains(except)) continue;
      const b = o.getBoundingClientRect(); if (b.width < 2 || b.height < 2 || getComputedStyle(o).visibility === "hidden") continue;
      xs.push(b.left, b.left + b.width / 2, b.right); ys.push(b.top, b.top + b.height / 2, b.bottom);
    }
    return { xs, ys };
  }
  let scales = {}, scaleSave = null; // Größe einzelner Anzeigen, Beschriftungen und Symbole (Mausrad darüber)
  let tDragBox = null, obstacles = []; // Lage der Anzeigen und Symbole im letzten Bild, damit Beschriftungen ausweichen können
  let swayMul = 1; // Schweben: 1 = wie bisher, 0.4 = leicht, 0 = fest
  let winColor = { h: 219, s: 54, l: 5, follow: false }, friendsBox = { w: 180, h: 0, scale: 1 }, dcVoiceOnly = true;
  // Freundesliste, „Läuft gerade“, KI-Anzeige und Mikrofon hängen im Panel nicht an der Form, sondern an der Fenstermitte:
  // Verschiebt man die Kugel, wandern nur die Anzeigen um sie herum mit
  const FIXED = new Set(["friends", "friends2", "media", "ai", "mic", "strata"]);
  const cOf = (key) => (expanded ? { x: W / 2, y: H / 2 + 6 } : { x: homeX || CX, y: homeY || CY }); // Anzeigen bleiben, wo die Form zuhause ist, auch wenn der Symbiont umherstreift
  const pinPos = (key) => { const p = pins[key], c = cOf(key); return p ? { x: c.x + Math.cos(p.a) * p.r * SB, y: c.y + Math.sin(p.a) * p.r * SB } : null; };
  const savePins = () => { clearTimeout(pinSave); pinSave = setTimeout(() => window.jarvis.setConfig({ pins }), 300); };
  // Bewegungen am ganzen Fenster verfolgen, damit das Teil auch bei schnellem Ziehen nicht "verloren" geht
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    if (!drag.moved) { const b = drag.el.getBoundingClientRect(), cr = canvas.getBoundingClientRect(); drag.w = b.width; drag.h = b.height; drag.lines = guideLines(drag.el, "[data-pk]");
      drag.lines.xs.push(cr.left + CX); drag.lines.ys.push(cr.top + CY); } // auch an der Mitte der Form
    drag.moved = true; drag.el.classList.add("dragging");
    const r = canvas.getBoundingClientRect(), c = cOf(drag.key);
    const sn = snapTo(e.clientX - drag.ox, e.clientY - drag.oy, drag.w, drag.h, drag.lines.xs, drag.lines.ys, e); showGuides(sn.gx, sn.gy);
    const x = sn.cx - r.left - c.x, y = sn.cy - r.top - c.y;
    pins[drag.key] = { a: Math.atan2(y, x), r: Math.max(0.2, Math.hypot(x, y) / SB) };
  }, true);
  const endDrag = () => {
    if (!drag) return;
    const el = drag.el; el.classList.remove("dragging", "holding", "arming"); showGuides();
    if (drag.moved) { noClick = el; setTimeout(() => { if (noClick === el) noClick = null; }, 50); savePins(); }
    drag = null;
  };
  window.addEventListener("pointerup", endDrag, true); window.addEventListener("pointercancel", endDrag, true); window.addEventListener("blur", endDrag);
  // Status-Anzeige (Leerlauf, Hört zu …): verschieben und per Mausrad skalieren, getrennt für kleine Kugel und Panel. Doppelklick = zurück
  let pillOff = { small: { x: 0, y: 0, s: 1 }, big: { x: 0, y: 0, s: 1 } }, pillDrag = null;
  const pillKey = () => (expanded ? "big" : "small");
  function applyPill() {
    const o = pillOff[pillKey()], el = $("pill");
    el.style.setProperty("--px", (o.x || 0) + "px"); el.style.setProperty("--py", (o.y || 0) + "px"); el.style.setProperty("--ps", o.s || 1);
  }
  $("pill").addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    selectNudge({ kind: "pill", el: $("pill") });
    const o = pillOff[pillKey()]; pillDrag = { sx: e.clientX, sy: e.clientY, x0: o.x || 0, y0: o.y || 0 };
    try { $("pill").setPointerCapture(e.pointerId); } catch {} $("pill").classList.add("dragging");
  });
  $("pill").addEventListener("pointermove", (e) => {
    if (!pillDrag) return;
    const o = pillOff[pillKey()], b = $("pill").getBoundingClientRect();
    let x = pillDrag.x0 + e.clientX - pillDrag.sx, y = pillDrag.y0 + e.clientY - pillDrag.sy;
    // im Fenster halten
    const nx = b.left + (x - (o.x || 0)), ny = b.top + (y - (o.y || 0));
    if (nx < 2) x += 2 - nx; if (ny < 2) y += 2 - ny;
    if (nx + b.width > innerWidth - 2) x -= nx + b.width - innerWidth + 2; if (ny + b.height > innerHeight - 2) y -= ny + b.height - innerHeight + 2;
    o.x = Math.round(x); o.y = Math.round(y); applyPill();
  });
  const pillEnd = () => { if (!pillDrag) return; pillDrag = null; $("pill").classList.remove("dragging"); window.jarvis.setConfig({ pillOff }); };
  $("pill").addEventListener("pointerup", pillEnd); $("pill").addEventListener("pointercancel", pillEnd);
  $("pill").addEventListener("dblclick", (e) => { e.stopPropagation(); pillOff[pillKey()] = { x: 0, y: 0, s: 1 }; applyPill(); window.jarvis.setConfig({ pillOff }); });

  let ptr = { x: 0, y: 0 }, holdT = null;
  window.addEventListener("pointermove", (e) => { ptr = { x: e.clientX, y: e.clientY }; }, true);
  const cancelHold = () => { clearTimeout(holdT); holdT = null; document.querySelectorAll(".friends.arming").forEach((f) => f.classList.remove("arming")); };
  window.addEventListener("pointerup", cancelHold, true); window.addEventListener("pointercancel", cancelHold, true);
  function makeDraggable(el, keyOf) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rb = el.getBoundingClientRect();
      if (el.classList.contains("friends") && e.clientX > rb.right - 18 && e.clientY > rb.bottom - 18) return; // Ecke zum Größe-Ändern
      const isFr = el.classList.contains("friends");
      const begin = (x, y) => {
        // Abstand zwischen Mauszeiger und Mitte des Teils, damit es beim Anfassen nicht springt
        const b = el.getBoundingClientRect();
        selectNudge({ kind: "pin", key: keyOf(), el });
        drag = { key: keyOf(), el, sx: x, sy: y, ox: x - (b.left + b.width / 2), oy: y - (b.top + b.height / 2), moved: false };
      };
      // Freundesliste: erst nach dem Halten verschiebbar, so bleibt ein Klick auf eine Person ein Klick (Einstellung „Verschieben erst nach“)
      const onHandle = isFr && e.clientY < rb.top + 14 && Math.abs(e.clientX - (rb.left + rb.width / 2)) < 30; // Ziehgriff oben in der Mitte
      if (isFr && friendsHold > 0 && !e.shiftKey && !onHandle && !e.target.closest?.(".fr-x")) {
        cancelHold(); const x0 = e.clientX, y0 = e.clientY; ptr = { x: x0, y: y0 };
        el.style.setProperty("--arm", friendsHold + "s"); el.classList.add("arming");
        holdT = setTimeout(() => { holdT = null; el.classList.remove("arming"); el.classList.add("holding"); begin(ptr.x, ptr.y); }, friendsHold * 1000);
        const chk = (ev) => { if (!holdT) return window.removeEventListener("pointermove", chk, true);
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { cancelHold(); window.removeEventListener("pointermove", chk, true);
            if (!holdHinted) { holdHinted = true; notice(`Zum Verschieben das Fenster ${friendsHold} s gedrückt halten, oder am Griff oben in der Mitte ziehen, oder mit Umschalt ziehen (änderbar unter Einstellungen, Freunde).`); } } };
        window.addEventListener("pointermove", chk, true);
        return;
      }
      begin(e.clientX, e.clientY);
      // Freundesliste nicht festhalten: sonst landet der Klick auf der Liste statt auf Person oder „Beitreten“
      if (!isFr) try { el.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener("dblclick", (e) => { e.stopPropagation(); const k = keyOf(); delete pins[k]; savePins(); if (scales[k]) { delete scales[k]; window.jarvis.setConfig({ scales }); } });
  }
  // Feinjustierung: angeklicktes Teil (Anzeige, Symbol, Freundesliste, Leerlauf, im Anordnen-Modus auch Blöcke)
  // mit den Pfeiltasten um 1 Pixel verschieben, mit Umschalt um 10 Pixel. Esc oder Klick daneben hebt die Auswahl auf
  let nudgeSel = null, nudgeSave = null;
  function selectNudge(s) {
    if (nudgeSel?.el) nudgeSel.el.classList.remove("nsel");
    nudgeSel = s; if (s?.el) { s.el.classList.add("nsel"); document.activeElement?.blur?.(); } // Eingabefeld loslassen, sonst landen die Pfeiltasten dort
  }
  document.addEventListener("pointerdown", (e) => { if (nudgeSel && !nudgeSel.el?.contains(e.target)) selectNudge(null); }, true);
  window.addEventListener("keydown", (e) => {
    if (!nudgeSel) return;
    if (e.key === "Escape") { e.stopPropagation(); selectNudge(null); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    e.preventDefault(); e.stopPropagation();
    const step = e.shiftKey ? 10 : 1, dx = d[0] * step, dy = d[1] * step, s = nudgeSel;
    if (s.kind === "pin") {
      const pp = pinPos(s.key), cr = canvas.getBoundingClientRect(), b = s.el.getBoundingClientRect();
      const x = (pp ? pp.x : b.left + b.width / 2 - cr.left) + dx, y = (pp ? pp.y : b.top + b.height / 2 - cr.top) + dy, c = cOf(s.key);
      pins[s.key] = { a: Math.atan2(y - c.y, x - c.x), r: Math.max(0.2, Math.hypot(x - c.x, y - c.y) / SB) };
      clearTimeout(nudgeSave); nudgeSave = setTimeout(savePins, 400);
    } else if (s.kind === "pill") {
      const o = pillOff[pillKey()]; o.x = (o.x || 0) + dx; o.y = (o.y || 0) + dy; applyPill();
      clearTimeout(nudgeSave); nudgeSave = setTimeout(() => window.jarvis.setConfig({ pillOff }), 400);
    } else if (s.kind === "blk" && freeLayout?.[s.id]) {
      const pr = panelEl.getBoundingClientRect(), r = freeLayout[s.id];
      r.x = Math.max(0, Math.min(1 - r.w, r.x + dx / pr.width)); r.y = Math.max(0, r.y + dy / pr.height); applyLayout();
      clearTimeout(nudgeSave); nudgeSave = setTimeout(() => window.jarvis.setConfig({ panelLayout: freeLayout }), 400);
    }
  }, true);
  // Nach dem Ziehen kein Klick auslösen (sonst öffnet z. B. der BTC-Kurs die Webseite)
  document.addEventListener("click", (e) => { if (noClick && noClick.contains(e.target)) { e.stopPropagation(); e.preventDefault(); noClick = null; } }, true);
  // Ankerpunkt (Mitte) eines Teils: gezogene Stelle oder Standardplatz, dazu leichtes Schweben
  let uiR = [], uiRT = -1;
  // Lage und Größe eines Teils ohne Neigung (offsetWidth/-Height plus Verschiebung), damit gekippte Buttons die Ausweich-Berechnung nicht zappeln lassen
  function baseRect(e) {
    const m = /translate\((-?\d+)px, (-?\d+)px\)/.exec(e.style.transform), sr = stage.getBoundingClientRect();
    if (!m) { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; }
    const l = sr.left + +m[1], t = sr.top + +m[2]; return { left: l, top: t, right: l + e.offsetWidth, bottom: t + e.offsetHeight, width: e.offsetWidth, height: e.offsetHeight };
  }
  function uiRects() {
    if (time - uiRT < 0.25 && uiRT >= 0) return uiR;
    uiRT = time; const sr = stage.getBoundingClientRect();
    uiR = [who, strataBtn, $("pill")].filter((e) => e.offsetWidth && !e.classList.contains("off") && getComputedStyle(e).visibility !== "hidden")
      .map((e) => { const b = baseRect(e); return { x: b.left - sr.left, y: b.top - sr.top, w: b.width, h: b.height }; });
    return uiR;
  }
  // Panel-Fenster (auch das YouTube-Fenster, das als natives Fenster über allem liegt): Beschriftungen weichen aus, schieben aber nichts weg
  // Das YouTube-Bild liegt als eigenes Fenster über allem: Anzeigen (Pillen) suchen sich einen Platz daneben
  const ytBlock = () => winRects().filter((r) => r.id === "yt" || r.id === "tw");
  const WIN_IDS = ["yt", "tw", "mOver", "mTick", "mHeat", "mLive", "proc", "sys", "mine", "farm", "wx", "clocks", "notes", "quick", "mirror", "game", "aiLog", "log", "transcript", "notice", "askForm"];
  let winR = [], winRT = -1;
  function winRects() {
    if (time - winRT < 0.25 && winRT >= 0) return winR;
    winRT = time; const sr = stage.getBoundingClientRect(); winR = [];
    for (const id of WIN_IDS) { const e = document.getElementById(id); if (!e || !e.offsetWidth || e.hidden || e.classList.contains("gone") || e.classList.contains("off")) continue; const b = e.getBoundingClientRect(); if (b.width > 30 && b.height > 20) winR.push({ id, x: b.left - sr.left, y: b.top - sr.top, w: b.width, h: b.height }); }
    return winR;
  }
  function anchor(key, defA, defR, ph, w, h, sway = 1) {
    const pp = pinPos(key), live = drag?.key === key && drag.moved;
    const c = cOf(key), bx = pp ? pp.x : c.x + Math.cos(defA) * SB * defR, by = pp ? pp.y : c.y + Math.sin(defA) * SB * defR;
    const k = live ? 0 : sway * swayMul * (pp ? 0.3 : 1); // selbst hingelegte Anzeigen schweben nur noch leicht, bleiben sichtbar an ihrem Platz
    const fx = (Math.sin(time * 0.45 + ph) * SB * 0.05 + Math.sin(time * 0.23 + ph * 2) * SB * 0.02) * k, fy = Math.sin(time * 0.6 + ph * 1.3) * SB * 0.035 * k;
    return { x: Math.max(4, Math.min(W - 4 - w, bx + fx - w / 2)), y: Math.max(4, Math.min(H - 4 - h, by + fy - h / 2)) };
  }
  let hoverRegion = null, cursor = null, smooth = null, hov = 0;
  for (const n of nodes) n.near = 0;
  for (const r of REGIONS) {
    Object.assign(r, { lab: 0, glow: 0, lx: 0, ly: 0, placed: false, shown: false });
    r.el = document.createElement("div"); r.el.className = "lbl"; r.el.style.setProperty("--h", r.hue);
    r.el.append(document.createElement("b"), document.createElement("span"));
    r.el.addEventListener("mouseenter", () => { hoverRegion = r; r.el.classList.add("hot"); });
    r.el.addEventListener("mouseleave", () => { if (hoverRegion === r) hoverRegion = null; r.el.classList.remove("hot"); });
    makeDraggable(r.el, () => "lbl:" + r.name); r.el.dataset.pk = "lbl:" + r.name;
    lblLayer.append(r.el);
  }
  // Zeiger kommt im Desktop-Fenster vom Hauptprozess (Ziehbereich schluckt Mausbewegungen), sonst vom Browser
  window.jarvis?.onCursor?.((c) => { cursor = c; });
  document.addEventListener("pointermove", (e) => { cursor = { x: e.clientX, y: e.clientY }; });
  document.documentElement.addEventListener("pointerleave", () => { cursor = null; });

