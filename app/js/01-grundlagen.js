document.body.dataset.os = /Win/i.test(navigator.platform || navigator.userAgent) ? "win" : "other";
  // Unerwartete Fehler der Oberfläche für den Fehlerbericht merken (bleibt lokal, siehe crash.js)
  addEventListener("error", (e) => { if (!e.error && /ResizeObserver/.test(e.message || "")) return; try { window.jarvis?.uiError?.(e.message, e.error?.stack || `${e.filename}:${e.lineno}`); } catch {} });
  addEventListener("unhandledrejection", (e) => { try { const r = e.reason; window.jarvis?.uiError?.(r?.message || String(r), r?.stack || ""); } catch {} });
"use strict";
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("brain"), ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let expanded = false;
// Hintergrund-Zustand steht hier, weil frühe Konfig-Antworten ihn schon vor dem Laden von 11-hintergrund-youtube.js brauchen
  const bg = { mode: "partikel", amt: 1, cv: $("bgfx"), parts: [], kind: "", w: 0, h: 0, last: 0, flash: 0, raf: 0 };
  bg.ctx = bg.cv.getContext("2d");
