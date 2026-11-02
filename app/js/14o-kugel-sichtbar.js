// ---------- Kugel hinter einem Fenster: erkennen und wieder sichtbar machen ----------
// Das Panel liegt über der Kugel. Ein undurchsichtiges Fenster kann sie ganz verdecken, obwohl sie eingeschaltet ist.
// Wiederherstellen verschiebt nur die Kugel der aktuellen Seite (und verkleinert sie, falls nötig). Fenster, Anzeigen und andere Seiten bleiben unverändert; Strg+Z nimmt es zurück.
(() => {
  const COVERED = 0.6; // ab diesem Anteil gilt die Kugel als verdeckt
  const canvasBox = () => $("brain").getBoundingClientRect();
  // Berechnete Farben kommen als rgb(), rgba() oder (bei color-mix) als color(srgb r g b / a)
  function colorAlpha(c) {
    const v = String(c || "").trim(); if (!v || v === "transparent") return 0;
    let m = /\/\s*([\d.]+)(%?)\s*\)$/.exec(v); if (m) return +m[1] / (m[2] ? 100 : 1);
    m = /^rgba\(.*,\s*([\d.]+)\s*\)$/.exec(v); return m ? +m[1] : 1;
  }
  function panelBlocks() {
    const c = canvasBox(), list = [];
    for (const el of document.querySelectorAll(".panel > *")) {
      if (el.hidden || el.classList.contains("blk-x")) continue;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.display === "none" || cs.visibility === "hidden" || r.width < 2 || r.height < 2) continue;
      const alpha = colorAlpha(cs.backgroundColor);
      list.push({ id: el.id, x: r.left - c.left, y: r.top - c.top, right: r.right - c.left, bottom: r.bottom - c.top, opaque: +cs.opacity >= 0.5 && (alpha >= 0.5 || cs.backgroundImage !== "none") });
    }
    return list;
  }
  // Anteil einer Kreisfläche, der unter den Rechtecken liegt
  function shareCovered(cx, cy, r, rects) {
    let inside = 0, hit = 0;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      if (i * i + j * j > 36) continue; inside++;
      const x = cx + (i / 6) * r, y = cy + (j / 6) * r;
      if (rects.some((b) => x >= b.x && x <= b.right && y >= b.y && y <= b.bottom)) hit++;
    }
    return hit / inside;
  }
  const orbShown = () => expanded && ballOn && !document.body.classList.contains("noorb") && W > 0 && H > 0;
  window.orbCoverage = () => orbShown() ? shareCovered(CX, CY, S, panelBlocks().filter((b) => b.opaque)) : 0;
  window.orbCovered = () => window.orbCoverage() >= COVERED;
  // Nächste freie Stelle; passt die Kugel nirgends, schrittweise kleiner. Ohne jeden freien Platz die am wenigsten verdeckte Stelle
  function findSpot() {
    const all = panelBlocks(), solid = all.filter((b) => b.opaque), gap = 6;
    const near = (a, b) => Math.hypot(a.x - CX, a.y - CY) - Math.hypot(b.x - CX, b.y - CY);
    let fallback = null;
    for (const k of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
      const r = S * k; if (r < 40 && k < 1) break;
      const free = [];
      for (let x = r; x <= W - r; x += 16) for (let y = r; y <= H - r; y += 16) {
        if (!all.some((b) => x + r + gap > b.x && x - r - gap < b.right && y + r + gap > b.y && y - r - gap < b.bottom)) free.push({ x, y });
        else { const share = shareCovered(x, y, r, solid); if (!fallback || share < fallback.share) fallback = { x, y, r, share }; }
      }
      if (free.length) { free.sort(near); return { ...free[0], r, share: 0 }; }
    }
    return fallback;
  }
  // Rückgabe: true, wenn die Kugel danach überwiegend frei liegt
  window.orbMakeVisible = () => {
    if (!orbShown()) return false;
    if (!window.orbCovered()) { try { notice("Die Kugel ist auf dieser Seite schon sichtbar."); } catch {} return true; }
    const spot = findSpot(); if (!spot) return false;
    ballScale = Math.max(0.2, Math.min(ballScale, spot.r / SB));
    ballOff = { x: Math.max(-0.5, Math.min(0.5, (spot.x - W / 2) / W)), y: Math.max(-0.5, Math.min(0.5, (spot.y - H / 2 - 6) / H)) };
    roam.x = roam.y = roam.vx = roam.vy = 0;
    applyBallScale(); window.argus.setScale("ballScale", ballScale);
    window.argus.setConfig({ ballOff }); saveCurrentPage();
    syncHint();
    const free = !window.orbCovered();
    try { notice(free ? "Die Kugel ist wieder sichtbar. Strg+Z nimmt es zurück." : "Kein freier Platz: Die Kugel bleibt teilweise verdeckt. Verschiebe oder verkleinere ein Fenster."); } catch {}
    return free;
  };
  function saveCurrentPage() { pages[page] = snapPage(); window.argus.setConfig({ pages }); }

  const hint = $("orbHint");
  let dismissedOn = null;
  function syncHint() {
    const busy = setOpen || document.body.classList.contains("arrange") || document.hidden;
    hint.hidden = busy || dismissedOn === page || !window.orbCovered();
  }
  window.orbHintSync = syncHint;
  $("orbHintShow").addEventListener("click", () => { window.orbMakeVisible(); syncHint(); });
  $("orbHintX").addEventListener("click", () => { dismissedOn = page; syncHint(); }); // gilt bis zum nächsten Start
  $("setOrbShow").addEventListener("click", () => { dismissedOn = null; window.orbMakeVisible(); syncHint(); });
  // Wer die Kugel einschaltet, will sie sehen
  for (const id of ["setMineOrb", "setBallOn"]) $(id).addEventListener("change", (e) => { if (e.target.checked) setTimeout(() => window.orbMakeVisible(), 50); });
  setInterval(syncHint, 4000); // Fenster erscheinen oft erst mit ihren Daten
  setTimeout(syncHint, 2500);
})();
