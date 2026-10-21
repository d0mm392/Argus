"use strict";
  // ---------- Statuszeile im kleinen Modus ----------
  let lastCap = null;
  function updateCaption() {
    let top = null;
    for (const r of REGIONS) if (r.act > 0.22 && (!top || r.act > top.act)) top = r;
    const txt = top ? top.name + " · " + top.task : "";
    if (txt !== lastCap) { lastCap = txt; $("capRegion").textContent = txt; }
  }

  // ---------- Gesprächsanzeige ----------
  let aiName = "Claude";
  function showTurn(who, text) {
    $("hint")?.remove();
    const el = $("transcript");
    let row = el.lastElementChild;
    if (!row || !row.classList.contains(who) || row.dataset.done) {
      row = document.createElement("div"); row.className = "turn " + who;
      const b = document.createElement("b"), s = document.createElement("span");
      b.textContent = who === "user" ? "Du" : aiName; row.append(b, s); el.append(row);
      while (el.children.length > 12) el.firstChild.remove();
    }
    row.querySelector("span").textContent = text;
    el.scrollTop = el.scrollHeight;
    return row;
  }

  // ---------- KI (läuft im Hauptprozess: Claude API, Ollama oder Demo) ----------
  let backend = { kind: "wait" };
  async function refreshBackend() {
    backend = await window.jarvis.backendInfo();
    const el = $("backend"); el.dataset.kind = backend.kind; el.querySelector("span").textContent = backend.label;
    aiName = backend.kind === "ollama" || backend.kind === "strata" ? "Lokal" : backend.kind === "demo" ? "Argus" : backend.kind === "openai" ? String(backend.label).split(" · ")[0] : "Claude";
  }

  // ---------- Lokale KI (Ollama): Einrichtung und Fortschritt ----------
  let localPhase = "";
  function onLocalAI(st) {
    const changed = st.phase !== localPhase; localPhase = st.phase;
    if (st.phase === "ready") { notice(""); if (changed) { log(st.text); refreshBackend(); } return; }
    if (st.phase === "off") { notice(""); if (changed) refreshBackend(); return; }
    if (st.phase === "missing" || st.phase === "error") {
      const el = $("notice"); el.textContent = st.text + " ";
      const a = document.createElement("a"); a.href = "#"; a.textContent = "Erneut versuchen";
      a.addEventListener("click", (e) => { e.preventDefault(); window.jarvis.setupLocal(); });
      el.append(a);
    } else notice(st.text);
    if (changed) { log(st.text); refreshBackend(); }
    if (st.phase === "pull" || st.phase === "install") $("capRegion").textContent = st.text;
  }
  window.jarvis.onLocalAI(onLocalAI);
  $("setOllamaOn").addEventListener("change", (e) => { window.jarvis.setConfig({ ollamaOff: !e.target.checked }); ollamaRows(!e.target.checked, false); });
  // Ollama-Felder nur zeigen, wenn Ollama genutzt wird (ohne Strata-Ordner bleibt der Schalter sichtbar, sonst käme man nicht zurück)
  const ollamaRows = (off, hasStrata) => document.querySelectorAll(".ollama-only").forEach((e) => { e.hidden = off && (hasStrata || !e.querySelector("#setOllamaOn")); });
  $("setStrataWake").addEventListener("change", (e) => window.jarvis.setConfig({ strataWake: e.target.checked }));
  window.jarvis.getConfig?.().then((c) => { $("setOllamaOn").checked = !c.ollamaOff; $("setStrataWake").checked = c.strataWake !== false; ollamaRows(c.ollamaOff, !!c.strata?.dir); });
  window.jarvis.localAI().then(onLocalAI);

  // ---------- Groß / Klein ----------
  let autoExpanded = false, collapseTimer = null;
  const onExp = (on) => {
    expanded = on; document.body.classList.toggle("expanded", on); resize(); applyPill();
    if (!on && !$("settings").hidden) { $("settings").hidden = true; setThrough(false); } // Einstellungen gehören zum großen Fenster
    if (on) setTimeout(() => $("askInput").focus({ preventScroll: true }), 50);
  };
  window.jarvis.onExpanded(onExp);
  // nach Neustart/Update kann das Panel schon offen sein, bevor dieses Skript lief (Meldung verpasst): Stand einmal abfragen
  window.jarvis.getConfig?.().then((c) => { if (c.expandedNow && !expanded) onExp(true); });
  // Angesprochen: kurz nach vorn holen (falls eingestellt) und das Panel nur aufklappen, wenn das gewünscht ist
  let autoOpen = true;
  function autoExpand() { window.jarvis.attention?.(true); if (autoOpen && !expanded) { autoExpanded = true; window.jarvis.setExpanded(true, false); } clearTimeout(collapseTimer); }
  setInterval(() => { if (!busy && !voice.awake) window.jarvis.attention?.(false); }, 4000); // nach der Antwort wieder in die normale Ebene
  function scheduleAutoCollapse() {
    if (!autoExpanded) return;
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      if (!busy && !voice.awake && !document.body.matches(":hover")) { autoExpanded = false; window.jarvis.setExpanded(false, false); }
      else scheduleAutoCollapse();
    }, 12000);
  }
  $("expandBtn").addEventListener("click", () => { autoExpanded = false; window.jarvis.setExpanded(true, true); });
  $("collapseBtn").addEventListener("click", () => { autoExpanded = false; window.jarvis.setExpanded(false, false); });
  // ---------- Fensterknöpfe ----------
  $("closeBtn").addEventListener("click", () => window.jarvis.quit());
  // Wie bei normalen Programmen nur Minimieren, Maximieren, Schließen. Minimieren macht Argus zur Kugel, die sichtbar bleibt
  $("minBtn").addEventListener("click", () => { autoExpanded = false; window.jarvis.setExpanded(false, false); });
  $("maxBtn").addEventListener("click", () => window.jarvis.winMode("max"));
  $("fullBtn").addEventListener("click", () => window.jarvis.winMode("full"));
  window.jarvis.onLayout((l) => document.body.classList.toggle("maxed", !!l.mode && l.mode !== "normal"));

  // ---------- Farben ----------
  const BASE_HUES = REGIONS.map((r) => r.hue);
  const PRESETS = [["Eisblau", 205], ["Cyan", 188], ["Smaragd", 160], ["Grün", 135], ["Gold", 45], ["Orange", 26], ["Rot", 2], ["Pink", 325], ["Lila", 275], ["Indigo", 240]];
  let theme = { hue: 205, regions: "bunt" };
  function applyTheme() {
    const h = ((theme.hue % 360) + 360) % 360;
    STATES.idle.hue = h; STATES.listening.hue = (h + 343) % 360;
    STATES.idle.color = `hsl(${h} 100% 69%)`; STATES.listening.color = `hsl(${(h + 343) % 360} 100% 69%)`;
    document.documentElement.style.setProperty("--accent", `hsl(${(h + 343) % 360} 100% 69%)`);
    CORE_HUE = h;
    const offs = [-15, 25, -35, 40, -25, 15, 0];
    REGIONS.forEach((r, i) => { r.hue = theme.regions === "thema" ? (h + offs[i % offs.length] + 360) % 360 : BASE_HUES[i]; r.el?.style.setProperty("--h", r.hue); });
    for (const p of pulses) p.hue = hueOf(nodes[p.a]);
    if (state === "idle" || state === "listening") $("pill").style.setProperty("--dot", STATES[state].color);
    document.querySelectorAll("#swatches button").forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.h - h) < 2)));
    if (winColor.follow) applyWinColor();
  }
  $("swatches").replaceChildren(...PRESETS.map(([name, h]) => {
    const b = document.createElement("button"); b.type = "button"; b.title = name; b.dataset.h = h; b.style.setProperty("--h", h);
    b.addEventListener("click", () => { theme.hue = h; $("setHue").value = h; applyTheme(); window.jarvis.setConfig({ themeHue: h }); });
    return b;
  }));
  $("setHue").addEventListener("input", (e) => { theme.hue = +e.target.value; applyTheme(); });
  $("setHue").addEventListener("change", (e) => window.jarvis.setConfig({ themeHue: +e.target.value }));
  $("setShape").replaceChildren(...SHAPES.map(([v, l]) => Object.assign(document.createElement("option"), { value: v, textContent: l })));
  $("setShape").addEventListener("change", (e) => { shape = e.target.value; resize(); applyShapeWords(); window.jarvis.setConfig({ shape }); });
  // Formen als Kacheln: Drüberfahren zeigt die Form sofort als Vorschau, Klick übernimmt sie, Wegfahren stellt die gewählte wieder her
  const SHAPE_ICONS = { kugel: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>', hexagon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>',
    wuerfel: '<path d="M12 3l8 4v10l-8 4-8-4V7z M4 7l8 4 8-4M12 11v10"/>', kristall: '<path d="M12 2l6 7-6 13-6-13z M6 9h12M12 2v20"/>', gehirn: '<path d="M12 5c-2-2-6-1-6 2-3 0-3 5 0 5-1 3 2 5 4 4 1 2 2 2 2 0zM12 5c2-2 6-1 6 2 3 0 3 5 0 5 1 3-2 5-4 4-1 2-2 2-2 0z M12 5v15"/>',
    ring: '<ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="5" ry="2"/>', helix: '<path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9M9 7h6M9 17h6"/>', galaxie: '<path d="M12 12c0-3 4-3 4 0s-5 6-8 2-1-10 5-10 9 5 7 9M12 12c0 3-4 3-4 0"/>',
    muenze: '<circle cx="12" cy="12" r="9"/><path d="M10 7v10M10 7h3a2.5 2.5 0 0 1 0 5h-3h3.5a2.5 2.5 0 0 1 0 5H10M11 5v2M11 17v2M13 5v2M13 17v2"/>', pyramide: '<path d="M12 3l9 15H3z M12 3l-3 15M12 3l5 15"/>',
    stern: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>', herz: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    atom: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/>',
    ikosaeder: '<path d="M12 2l8 5v10l-8 5-8-5V7z"/><path d="M12 2v20M4 7l16 10M20 7L4 17"/>',
    trapez: '<path d="M3 18l4-12h10l4 12z"/>', parallelogramm: '<path d="M3 18l4-12h14l-4 12z"/>', oktagon: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/>', diamant: '<path d="M7 4h10l5 5-10 12L2 9z M2 9h20M9 4l3 5 3-5M12 9l-3-5"/>', tornado: '<path d="M3 5h18M5 9h14M8 13h8M10 17h4M12 21v0"/>',
    oktaeder: '<path d="M12 2l8 10-8 10-8-10z M4 12h16M12 2v20"/>', dodekaeder: '<path d="M12 2l7 5-2.5 8h-9L5 7z M12 2v5M19 7l-2.5 8M5 7l2.5 8M7.5 15L12 22l4.5-7"/>',
    zylinder: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>', kegel: '<path d="M12 3l8 15c0 1.7-3.6 3-8 3s-8-1.3-8-3z"/><path d="M4 18c0 1.7 3.6 3 8 3"/>',
    prisma: '<path d="M12 3l8 5v9l-8 5-8-5V8z M12 12v10M4 8l8 4 8-4"/>', spirale: '<path d="M12 21c-5 0-8-2-8-4s3-3 8-3 8-1 8-3-3-3-8-3-7 0-7-2 3-3 7-3"/>',
    stella: '<path d="M12 3l8 14H4z"/><path d="M12 21L4 7h16z"/>',
    knoten: '<path d="M12 4c4 0 8 3 7 7s-6 6-9 9-7 0-6-5 6-5 9-9 2-2-1-2"/><circle cx="12" cy="12" r="2.5"/>',
    tropfen: '<path d="M12 2c2 4 7 8 7 13a7 7 0 0 1-14 0c0-5 5-9 7-13z"/>',
    symbiont: '<path d="M12 4c3 0 4 2 6 1-1 2 1 3 0 5 2 1 3 3 1 4 0 2-2 3-3 2-1 2-3 3-5 2-2 1-4 0-4-2-2 0-3-2-2-4-2-1-2-3 0-4 0-2 2-3 4-3 1-1 2-1 3-1z"/><path d="M18 5l3-2M4 14l-2 3"/>' };
  let shapePreview = null;
  $("shapePick").replaceChildren(...SHAPES.map(([v, l]) => {
    const b = document.createElement("button"); b.type = "button"; b.role = "radio"; b.dataset.v = v;
    b.innerHTML = `<svg viewBox="0 0 24 24">${SHAPE_ICONS[v] || ""}</svg><span></span>`; b.lastChild.textContent = l;
    b.addEventListener("mouseenter", () => { if (shapePreview === null) shapePreview = shape; shape = v; resize(); });
    b.addEventListener("click", () => { shapePreview = null; shape = v; $("setShape").value = v; markShape(); resize(); applyShapeWords(); window.jarvis.setConfig({ shape }); });
    return b;
  }));
  $("shapePick").addEventListener("mouseleave", () => { if (shapePreview !== null) { shape = shapePreview; shapePreview = null; resize(); } });
  const RING_ICONS = { form: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 1l10 5.5" stroke-width="2.5"/>', kreis: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8" stroke-width="2.5"/>',
    balken: '<path d="M6 20V10M12 20V5M18 20v-7" stroke-width="3" stroke-linecap="round"/>', tacho: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
    verlauf: '<path d="M3 18l4-6 4 3 4-8 6 6"/><path d="M3 21h18" opacity=".5"/>', puls: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    orbit: '<ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-20 12 12)"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="9" r="1.6" fill="currentColor"/>',
    saeulen: '<path d="M3 17l3-1.5 3 1.5-3 1.5zM6 17V10l3 1.5V17M3 17V10l3-1.5 3 1.5"/><path d="M10 19l3-1.5 3 1.5-3 1.5zM13 19V6l3 1.5V19M10 19V6l3-1.5L16 6"/><path d="M17 17l2.5-1.2 2.5 1.2-2.5 1.2zM19.5 17v-5l2.5 1.2V17M17 17v-5l2.5-1.2L22 12"/>',
    kugeln: '<circle cx="7" cy="15" r="3.5"/><circle cx="16" cy="9" r="4.5"/><circle cx="17" cy="19" r="2.5"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/>',
    segmente: '<path d="M4 14h3M9 14h3M14 14h3M19 14h2M4 9h3M9 9h3M14 9h3M4 19h3M9 19h3" stroke-width="3" stroke-linecap="butt"/>',
    radar: '<path d="M12 3l8 6-3 10H7L4 9z"/><path d="M12 8l4 3-1.5 5h-5L8 11z"/><path d="M12 3v18M4 9l16 10M20 9L4 19" opacity=".4"/>',
    zahlen: '<path d="M5 8l2-2v12M11 8a3 3 0 0 1 6 0c0 3-6 6-6 10h6" stroke-linecap="round" stroke-linejoin="round"/>' };
  const RING_FALLBACK = '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>';
  $("ringPick").replaceChildren(...RING_STYLES.map(([v, l]) => {
    const b = document.createElement("button"); b.type = "button"; b.role = "radio"; b.dataset.v = v;
    b.innerHTML = `<svg viewBox="0 0 24 24">${RING_ICONS[v] || RING_FALLBACK}</svg><span></span>`; b.lastChild.textContent = l;
    b.addEventListener("mouseenter", () => { ringPreview = v; });
    b.addEventListener("click", () => { ringPreview = null; viz = { ...viz, ringStyle: v, rings: true }; markRing(); window.jarvis.setConfig({ viz }); const cb = document.querySelector('[data-viz="rings"]'); if (cb) cb.checked = true; });
    return b;
  }));
  $("ringPick").addEventListener("mouseleave", () => { ringPreview = null; });
  function markRing() { for (const b of $("ringPick").children) b.setAttribute("aria-checked", String(b.dataset.v === (viz.ringStyle || "form"))); }
  $("setRingSize").addEventListener("input", (e) => { scales.rings = +e.target.value; if (Math.abs(scales.rings - 1) < 0.03) delete scales.rings; });
  $("setMedia").addEventListener("change", (e) => { mediaOn = e.target.checked; renderMedia(); window.jarvis.setConfig({ mediaOn }); });
  $("setRingSize").addEventListener("change", () => window.jarvis.setConfig({ scales }));
  $("setZoom").addEventListener("input", (e) => document.documentElement.style.setProperty("--set-zoom", e.target.value));
  $("setZoom").addEventListener("change", (e) => window.jarvis.setConfig({ setZoom: +e.target.value }));
  // Skins: fertige Kombinationen aus Form, Grundfarbe, Fensterfarbe, Glühen und Drehtempo
  const SKINS = [
    ["Bitcoin", "muenze", 38, ["Braun", 28, 35, 8], 1.5, 0.8], ["Atom", "atom", 188, ["Petrol", 190, 50, 7], 1.3, 1.6], ["Sternenstaub", "stern", 275, ["Lila", 270, 45, 8], 1.4, 0.7],
    ["Herzschlag", "kugel", 350, ["Bordeaux", 350, 45, 8], 1.2, 0.6], ["Pharao", "pyramide", 45, ["Schwarz", 0, 0, 3], 1.1, 0.5], ["Matrix", "wuerfel", 135, ["Schwarz", 0, 0, 3], 1.2, 1.2],
    ["Venom", "symbiont", 205, ["Schwarz", 0, 0, 3], 1, 1], ["Nebula", "galaxie", 300, ["Nachtblau", 219, 54, 5], 1.6, 1.4], ["Eis", "kristall", 195, ["Graphit", 220, 8, 11], 1, 1], ["Klassik", "kugel", 205, ["Nachtblau", 219, 54, 5], 1, 1]];
  function applySkin([name, sh, hue, win, glow, spin]) {
    shape = sh; $("setShape").value = sh; theme.hue = hue; $("setHue").value = hue; glowK = glow; $("setGlow").value = glow; spinK = spin; $("setSpin").value = spin;
    winColor = { follow: false, h: win[1], s: win[2], l: win[3] }; applyWinColor(); syncWinInputs?.(); applyTheme(); markShape(); resize(); applyShapeWords?.();
    window.jarvis.setConfig({ shape, themeHue: hue, glow, spin, winColor, skin: name }); markSkin(name);
  }
  function markSkin(n) { for (const b of $("skinPick").children) b.setAttribute("aria-pressed", String(b.dataset.n === n)); }
  $("skinPick").replaceChildren(...SKINS.map((k) => { const b = document.createElement("button"); b.type = "button"; b.dataset.n = k[0];
    b.style.setProperty("--h", k[2]); b.style.setProperty("--sw-h", k[3][1]); b.style.setProperty("--sw-s", k[3][2] + "%"); b.style.setProperty("--sw-l", Math.max(8, k[3][3] + 6) + "%");
    b.innerHTML = `<svg viewBox="0 0 24 24">${SHAPE_ICONS[k[1]] || ""}</svg><span></span>`; b.lastChild.textContent = k[0];
    b.addEventListener("mouseenter", () => { if (shapePreview === null) shapePreview = shape; shape = k[1]; resize(); });
    b.addEventListener("mouseleave", () => { if (shapePreview !== null) { shape = shapePreview; shapePreview = null; resize(); } });
    b.addEventListener("click", () => { shapePreview = null; applySkin(k); }); return b; }));
  $("setSpin").addEventListener("input", (e) => { spinK = +e.target.value; });
  $("setSpin").addEventListener("change", (e) => window.jarvis.setConfig({ spin: +e.target.value }));
  $("setDens").addEventListener("change", (e) => { densK = +e.target.value; resize(); window.jarvis.setConfig({ density: densK }); });
  window.jarvis.getConfig?.().then((c) => { spinK = typeof c.spin === "number" ? c.spin : 1; densK = typeof c.density === "number" ? c.density : 1; $("setSpin").value = spinK; $("setDens").value = String(densK); venomRoam = !!c.venomRoam; $("setVenomRoam").checked = venomRoam; if (c.skin) markSkin(c.skin); resize(); });
  function markShape() { for (const b of $("shapePick").children) b.setAttribute("aria-checked", String(b.dataset.v === (shapePreview ?? shape))); }
  // 2D: Punkte, Linien und Umriss wie zuvor, ohne gefüllten Körper; Stern und Herz gibt es nur hier
  function sync2dPick() {
    for (const b of $("shapePick").children) b.hidden = SHAPES2D.has(b.dataset.v) && !flat2d;
    if (!flat2d && SHAPES2D.has(shape)) { shape = "kugel"; $("setShape").value = shape; markShape(); window.jarvis.setConfig({ shape }); }
    resize();
  }
  $("setShape2d").addEventListener("change", (e) => { flat2d = e.target.checked; window.jarvis.setConfig({ shape2d: flat2d }); sync2dPick(); });
  $("setShapeRim").addEventListener("change", (e) => { shapeRim = e.target.checked; window.jarvis.setConfig({ shapeRim }); });
  // 3D-Optik: berührtes Fenster kippt höchstens 3° zur Maus, beim Verlassen zurück
  let look3d = false, tiltEl = null;
  const applyLook3d = () => { document.body.classList.toggle("look3d", look3d); if (!look3d && tiltEl) { tiltEl.classList.remove("tilt"); tiltEl.style.removeProperty("--rx"); tiltEl.style.removeProperty("--ry"); tiltEl = null; } };
  document.addEventListener("pointermove", (e) => {
    if (!look3d) return;
    let b = look3dK > 0.01 && document.body.classList.contains("free") && !document.body.classList.contains("arrange") && !e.buttons && !e.target.closest?.("button, input, select, textarea, a, label, .mgrip, .fgrip") ? e.target.closest?.(".panel > .blk:not(.yt)") : null;
    // am Rand (Größe ändern, Ziehen) nicht kippen: sonst wandert die Kante unter der Maus weg und man bekommt sie nicht zu fassen
    if (b) { const r0 = b.getBoundingClientRect(), E = 34; if (e.clientX - r0.left < E || r0.right - e.clientX < E || e.clientY - r0.top < E || r0.bottom - e.clientY < E) b = null; }
    if (tiltEl && tiltEl !== b) { tiltEl.classList.remove("tilt"); tiltEl.style.removeProperty("--rx"); tiltEl.style.removeProperty("--ry"); }
    tiltEl = b; if (!b) return;
    b.classList.add("tilt");
    const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    b.style.setProperty("--ry", (x * 6 * look3dK / 0.35 * 0.35).toFixed(2) + "deg"); b.style.setProperty("--rx", (-y * 6 * look3dK / 0.35 * 0.35).toFixed(2) + "deg");
  }, { passive: true });
  // ---- Anzeige: Kugel, Status, Mini-Widget, Schrift, Struktur, Tiefe
  let uiFont = "", uiScale = 100;
  const applyUi = () => { const b = document.body.classList; b.toggle("noball", !ballOn); b.toggle("nostatus", !statusOn); b.toggle("mini-more", miniMore); };
  const applyFont = () => { const st = document.documentElement.style; if (uiFont) { const f = `"${uiFont}", system-ui, sans-serif`; st.setProperty("--f-body", f); st.setProperty("--f-display", f); } else { st.removeProperty("--f-body"); st.removeProperty("--f-display"); } st.fontSize = uiScale === 100 ? "" : uiScale + "%"; };
  const sv = (patch) => window.jarvis.setConfig(patch);
  const bind = (id, key, get, set) => $(id).addEventListener(get === "check" ? "change" : "input", (e) => { const v = get === "check" ? e.target.checked : +e.target.value; set(v); sv({ [key]: key === "look3dK" ? Math.round(v * 100) : key === "structK" || key === "nodeK" ? Math.round(v * 100) : v }); });
  $("setBallOn").addEventListener("change", (e) => { ballOn = e.target.checked; applyUi(); sv({ ballOn }); });
  $("setStatusOn").addEventListener("change", (e) => { statusOn = e.target.checked; applyUi(); sv({ statusOn }); });
  $("setMiniMore").addEventListener("change", (e) => { miniMore = e.target.checked; applyUi(); sv({ miniMore }); });
  $("setUiFont").addEventListener("change", (e) => { uiFont = e.target.value; applyFont(); sv({ uiFont }); });
  $("setUiScale").addEventListener("input", (e) => { uiScale = +e.target.value; applyFont(); clearTimeout(applyFont.t); applyFont.t = setTimeout(() => { sv({ uiScale }); fitPanel?.(); }, 300); });
  let menuAlpha = 96;
  $("setMenuAlpha").addEventListener("input", (e) => { menuAlpha = +e.target.value; clearTimeout(bind.t2); bind.t2 = setTimeout(() => sv({ menuAlpha }), 300); });
  $("setStruct").addEventListener("input", (e) => { structK = +e.target.value / 100; clearTimeout(bind.t1); bind.t1 = setTimeout(() => sv({ structK: +e.target.value }), 300); });
  $("setNodeK").addEventListener("input", (e) => { nodeK = +e.target.value / 100; clearTimeout(bind.t2); bind.t2 = setTimeout(() => sv({ nodeK: +e.target.value }), 300); });
  $("setEdgeK").addEventListener("input", (e) => { edgeK = +e.target.value; shapeBuilt = ""; clearTimeout(bind.t3); bind.t3 = setTimeout(() => sv({ edgeK }), 300); });
  $("setLook3dK").addEventListener("input", (e) => { look3dK = +e.target.value / 100; clearTimeout(bind.t4); bind.t4 = setTimeout(() => sv({ look3dK: +e.target.value }), 300); });
  window.jarvis.getConfig?.().then((c) => {
    ballOn = c.ballOn !== false; statusOn = c.statusOn !== false; miniMore = !!c.miniMore; uiFont = c.uiFont || ""; uiScale = c.uiScale || 100;
    structK = (c.structK ?? 100) / 100; nodeK = (c.nodeK ?? 100) / 100; edgeK = c.edgeK || 3; look3dK = (c.look3dK ?? 35) / 100; shapeBuilt = "";
    $("setBallOn").checked = ballOn; $("setStatusOn").checked = statusOn; $("setMiniMore").checked = miniMore; $("setUiFont").value = uiFont; $("setUiScale").value = uiScale;
    menuAlpha = c.menuAlpha || 96; $("setMenuAlpha").value = menuAlpha; $("setMenuAlpha").dispatchEvent(new Event("input"));
    $("setStruct").value = Math.round(structK * 100); $("setNodeK").value = Math.round(nodeK * 100); $("setEdgeK").value = edgeK; $("setLook3dK").value = Math.round(look3dK * 100);
    for (const i of ["setUiScale", "setStruct", "setNodeK", "setLook3dK"]) $(i).dispatchEvent(new Event("input"));
    applyUi(); applyFont();
  });
  $("setLook3d").addEventListener("change", (e) => { look3d = e.target.checked; applyLook3d(); window.jarvis.setConfig({ look3d }); });
  window.jarvis.getConfig?.().then((c) => { look3d = !!c.look3d; $("setLook3d").checked = look3d; applyLook3d(); });
  $("setMediaBrowser").addEventListener("change", (e) => window.jarvis.setConfig({ mediaBrowser: e.target.checked }));
  $("setCpuHot").addEventListener("change", (e) => window.jarvis.setConfig({ cpuHotC: +e.target.value }));
  $("setGpuHot").addEventListener("change", (e) => window.jarvis.setConfig({ gpuHotC: +e.target.value }));
  window.jarvis.getConfig?.().then((c) => { $("setMediaBrowser").checked = !!c.mediaBrowser; $("setCpuHot").value = c.cpuHotC || 100; $("setGpuHot").value = c.gpuHotC || 88; showRangeValues(); });
  // Regler zeigen ihren Wert (Prozent, Grad), damit man die richtige Stelle wiederfindet
  function rangeText(r) { const v = +r.value, mx = +r.max; return r.dataset.unit ? Math.round(v) + r.dataset.unit : /Hue|WinH/.test(r.id) ? Math.round(v) + "°" : mx <= 5 ? Math.round(v * 100) + " %" : Math.round(v) + " %"; }
  function showRangeValues() {
    for (const r of document.querySelectorAll("#settings input[type=range]")) {
      let o = r.nextElementSibling; if (!o || !o.classList.contains("rv")) { o = document.createElement("output"); o.className = "rv"; r.after(o); r.addEventListener("input", () => { o.textContent = rangeText(r); }); }
      o.textContent = rangeText(r);
    }
  }
  new MutationObserver(() => { if (!$("settings").hidden) { showRangeValues(); setTimeout(showRangeValues, 300); } }).observe($("settings"), { attributes: true, attributeFilter: ["hidden"] });
  // Sparmodus: halbe Bildrate, ruhigerer Hintergrund, keine teuren Unschärfe- und Schatteneffekte. „automatisch“ greift bei ≤ 4 Kernen oder ≤ 4 GB RAM
  const weakPc = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  function applyLite(v) { lite = v === "an" || (v !== "aus" && weakPc); document.body.classList.toggle("lite", lite); bg.w = 0; }
  $("setLite").addEventListener("change", (e) => { applyLite(e.target.value); window.jarvis.setConfig({ liteMode: e.target.value }); });
  window.jarvis.getConfig?.().then((c) => { $("setLite").value = c.liteMode || "auto"; applyLite(c.liteMode || "auto"); });
  $("setGfxSafe").addEventListener("change", (e) => { window.jarvis.setConfig({ gfxSafe: e.target.checked }); });
  window.jarvis.getConfig?.().then((c) => { $("setGfxSafe").checked = !!c.gfxSafe; });
  $("setVenomRoam").addEventListener("change", (e) => { venomRoam = e.target.checked; window.jarvis.setConfig({ venomRoam }); });
  $("setFlash").addEventListener("input", (e) => { flashK = +e.target.value; });
  $("setFlash").addEventListener("change", (e) => window.jarvis.setConfig({ flashK: +e.target.value }));
  $("setFansReset").addEventListener("click", () => { hiddenFans = []; window.jarvis.setConfig({ hiddenFans }); });
  $("setFlashT").addEventListener("input", (e) => { flashT = +e.target.value; });
  $("setFlashT").addEventListener("change", (e) => window.jarvis.setConfig({ flashT: +e.target.value }));
  $("setGlow").addEventListener("input", (e) => { glowK = +e.target.value; });
  $("setGlow").addEventListener("change", (e) => window.jarvis.setConfig({ glow: +e.target.value }));
  $("setRegions").addEventListener("change", (e) => { theme.regions = e.target.value; applyTheme(); window.jarvis.setConfig({ themeRegions: theme.regions }); });

  // ---------- Anzeigen an/aus und Farbe ----------
  const WIDGET_ROWS = [["ai", "Wer antwortet (alle Anzeigen)", null], ["aiClaude", "… davon „Claude“", null], ["aiLocal", "… davon „Lokal“", null], ["strata", "Strata-Knopf", null], ["cpuTemp", "CPU-Temperatur", "nach Temperatur"], ["gpuTemp", "GPU-Temperatur", "nach Temperatur"], ["cpuClock", "CPU-Takt (GHz)", "Grundfarbe"],
    ["gpuClock", "GPU-Takt (GHz)", "Grundfarbe"], ["fans", "Lüfter-Drehzahl", "Grundfarbe"], ["btc", "Bitcoin-Kurs", "grün/rot nach 24 h"], ["weather", "Wetter am Standort", "Grundfarbe"], ["steam", "Steam-Freunde online", "Grundfarbe"], ["discord", "Discord online", "Grundfarbe"], ["mOnline", "Mining-Seite: Miner online", "nach Zustand"], ["mHash", "Mining-Seite: Hashrate", "nach Zustand"], ["mOffline", "Mining-Seite: Offline", "nach Zustand"], ["mHot", "Mining-Seite: Heißester Miner", "nach Temperatur"], ["mRevenue", "Mining-Seite: Ertrag 24 h", "Grundfarbe"], ["mPool", "Mining-Seite: Pool-Hashrate", "Grundfarbe"], ["mHashprice", "Mining-Seite: Hashprice", "Grundfarbe"], ["friends", "Freundesliste neben der Kugel (im Panel)", null], ["apps", "Laufende Programme", null]];
  function buildWidgetRows() {
    $("widgetRows").replaceChildren(...WIDGET_ROWS.map(([k, label, autoName]) => {
      const row = document.createElement("div"); row.className = "wrow";
      const name = document.createElement("span"); name.textContent = label;
      const color = document.createElement("select"); color.title = "Farbe";
      if (autoName) {
        color.innerHTML = `<option value="-1">Auto (${autoName})</option>` + PRESETS.map(([n, h]) => `<option value="${h}">${n}</option>`).join("");
        color.value = String(widgets[k]?.hue ?? -1);
        if (color.value === "") color.value = "-1";
      } else color.style.visibility = "hidden";
      const on = document.createElement("input"); on.type = "checkbox"; on.checked = widgets[k]?.on !== false; on.title = "an/aus";
      const save = () => {
        widgets[k] = { ...widgets[k], on: on.checked, ...(autoName ? { hue: +color.value } : {}) };
        window.jarvis.setConfig({ widgets: { [k]: widgets[k] } });
        temps.forEach((t) => { t.val = undefined; });
      };
      on.addEventListener("change", save); color.addEventListener("change", save);
      row.append(name, color, on);
      return row;
    }));
  }

  // ---------- Programm-Symbole einzeln an/aus ----------
  function buildAppRows() {
    const all = new Map(seenApps); for (const k of hiddenApps) if (!all.has(k)) all.set(k, k);
    const rows = [...all].sort((a, b) => a[1].localeCompare(b[1])).map(([key, name]) => {
      const row = document.createElement("label"); row.className = "row";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !hiddenApps.has(key);
      cb.addEventListener("change", () => { if (cb.checked) hiddenApps.delete(key); else hiddenApps.add(key); window.jarvis.setConfig({ hiddenApps: [...hiddenApps] }); });
      row.append(document.createTextNode(name), cb); return row;
    });
    $("appRows").replaceChildren(...(rows.length ? rows : [Object.assign(document.createElement("div"), { className: "set-note", textContent: "Gerade läuft kein erkanntes Programm." })]));
  }

  // ---------- Transparenz je Bereich ----------
  const OP_ROWS = [["ball", "Kugel"], ["labels", "Beschriftungen"], ["badges", "Anzeigen (Temperatur, Takt, Lüfter, BTC)"], ["apps", "Programm-Symbole"], ["ai", "KI-Anzeige"], ["panel", "Panel-Hintergrund"], ["friends", "Freundesliste"], ["news", "News & Uhren-Fenster"]];
  let opacity = { ball: 1, labels: 1, badges: 1, apps: 1, ai: 1, panel: 1, friends: 1, news: 1 };
  function applyOpacity() { for (const [k] of OP_ROWS) document.documentElement.style.setProperty("--op-" + k, String(opacity[k] ?? 1)); }
  $("setPanelOp").addEventListener("input", (e) => { opacity.panel = +e.target.value; applyOpacity(); });
  $("setPanelOp").addEventListener("change", () => window.jarvis.setConfig({ opacity: { ...opacity } }));
  function buildOpRows() {
    $("setPanelOp").value = String(opacity.panel ?? 1);
    $("opRows").replaceChildren(...OP_ROWS.filter(([k]) => k !== "panel").map(([k, label]) => {
      const row = document.createElement("label"); row.className = "row";
      const r = document.createElement("input"); r.type = "range"; r.min = k === "panel" ? "0" : "0.1"; r.max = "1"; r.step = "0.05"; r.value = String(opacity[k] ?? 1);
      r.addEventListener("input", () => { opacity[k] = +r.value; applyOpacity(); });
      r.addEventListener("change", () => window.jarvis.setConfig({ opacity: { ...opacity } }));
      row.append(document.createTextNode(label), r); return row;
    }));
  }

