// Stil je Fenster: Deckkraft des Hintergrunds, Textfarbe und Schrift (Rechtsklick auf das Fenster), gemerkt als winStyle.
// Gilt für alle Fenster im Panel, die Freundeslisten, Antworten und die Eingabeleiste. Die Aussehen-Varianten (Design) kommen aus 14i-designs.js.
(function () {
  let st = {};
  const target = (id) => id === "rings" ? document.querySelector(".ringh") : id === "friends" ? document.querySelector(".friends:not(.f2)") : id === "friends2" ? document.querySelector(".friends.f2") : document.getElementById(id);
  const IDS = ["yt", "tw", "mOver", "mTick", "mHeat", "mLive", "portal", "proc", "sys", "mine", "farm", "farm2", "farm3", "farm4", "wx", "clocks", "notes", "quick", "mirror", "game", "tMkt", "tWatch", "tPort", "aiLog", "log", "transcript", "notice", "askForm", "friends", "friends2", "rings"];
  const apply = () => {
    for (const id of IDS) {
      const el = target(id); if (!el) continue; const s = st[id] || {};
      if (s.a != null) { el.dataset.ws = "1"; el.style.setProperty("--wa", String(Math.max(0, s.a) / 100)); } else { delete el.dataset.ws; el.style.removeProperty("--wa"); }
      if (s.wt) el.dataset.wt = "1"; else delete el.dataset.wt;
      if (s.font) { el.dataset.wf = "1"; el.style.setProperty("--wf", `"${String(s.font).replace(/[^\w .-]/g, "")}", system-ui, sans-serif`); } else { delete el.dataset.wf; el.style.removeProperty("--wf"); }
      if (s.op != null && s.op < 100) el.style.opacity = String(Math.max(0.05, s.op / 100)); else if (id === "rings") el.style.removeProperty("opacity");
      if (s.dots) el.dataset.dots = s.dots; else delete el.dataset.dots;
      if (s.bars) el.dataset.bars = s.bars; else delete el.dataset.bars;
    }
  };
  window.setWinStyle = (id, k, v) => {
    if (!IDS.includes(id) || !["a", "op", "wt", "font", "dots", "bars"].includes(k)) return;
    // a: 100 = Standard (Stil entfernt), 101 = voll deckend (gespeichert als 100)
    const s = { ...(st[id] || {}) };
    if (k === "a" || k === "op") { s[k] = Math.max(0, Math.min(k === "a" ? 101 : 100, Math.round(+v))); if (k === "a" && s.a === 100) delete s.a; else if (k === "a" && s.a === 101) s.a = 100; } else if (k === "wt") s.wt = !!v; else s[k] = v ? String(v).slice(0, 40) : "";
    if (!s.font) delete s.font; if (!s.dots) delete s.dots; if (!s.bars) delete s.bars; if (!s.wt) delete s.wt; if (s.a == null) delete s.a; if (s.op == null || s.op >= 100) delete s.op;
    if (Object.keys(s).length) st = { ...st, [id]: s }; else { st = { ...st }; delete st[id]; }
    apply(); window.argus.setConfig({ winStyle: st }); window.onPageStyle?.();
  };
  // Stil gehört zur Seite (10-anordnen-modus.js, pageLooks)
  window.winStyleGet = () => st;
  window.winStyleSet = (m) => { st = m && typeof m === "object" ? JSON.parse(JSON.stringify(m)) : {}; apply(); window.argus.setConfig({ winStyle: st }); };
  window.argus.getConfig().then((c) => { st = c.winStyle && typeof c.winStyle === "object" ? c.winStyle : {}; apply(); }).catch(() => {});
  // Freundeslisten entstehen erst bei Bedarf
  const lay = document.querySelector(".lbls"); if (lay) new MutationObserver(() => apply()).observe(lay, { childList: true });
  // Namen der Schriftarten in ihrer eigenen Schrift anzeigen (Einstellungen)
  for (const o of document.querySelectorAll("#setUiFont option")) if (o.value) o.style.fontFamily = `"${o.value}"`;
})();
