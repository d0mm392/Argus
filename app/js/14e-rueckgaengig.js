// ---------- „Vorherige Position“: Verschieben und Größenänderungen von Fenstern, Anzeigen, Kugel zurücknehmen (Rechtsklick oder Strg+Z) ----------
const undoStack = []; let undoBase = null, undoPage = null, undoDown = false;
const undoState = () => JSON.stringify({ l: freeLayout, p: pins, s: scales, o: ballOff, b: ballScale });
const UNDO_NAMES = { l: "Fenster", p: "Anzeige", s: "Größe", o: "Kugel", b: "Kugel" };
function undoLabel(a, b) { try { const x = JSON.parse(a), y = JSON.parse(b), k = Object.keys(UNDO_NAMES).find((q) => JSON.stringify(x[q]) !== JSON.stringify(y[q])); return k ? UNDO_NAMES[k] : "Position"; } catch { return "Position"; } }
document.addEventListener("pointerdown", () => { undoDown = true; }, true);
document.addEventListener("pointerup", () => { setTimeout(() => { undoDown = false; }, 400); }, true);
setInterval(() => {
  if (undoDown || typeof freeLayout === "undefined") return;
  const s = undoState();
  if (undoPage !== page || undoBase === null) { undoPage = page; undoBase = s; undoStack.length = 0; return; } // Seitenwechsel: neuer Anfang
  if (s !== undoBase) { undoStack.push({ s: undoBase, n: undoLabel(undoBase, s) }); if (undoStack.length > 15) undoStack.shift(); undoBase = s; }
}, 600);
function undoMove() {
  const e = undoStack.pop(); if (!e) { try { notice("Nichts zum Zurücksetzen."); } catch {} return; }
  const st = JSON.parse(e.s);
  freeLayout = st.l; pins = st.p || {}; scales = st.s || {}; ballOff = st.o || { x: 0, y: 0 }; ballScale = st.b || 1;
  try { applyBallScale(); window.jarvis.setScale("ballScale", ballScale); } catch {}
  try { applyLayout(); } catch {}
  undoBase = undoState();
  window.jarvis.setConfig({ panelLayout: freeLayout || {}, pins, scales, ballOff });
  try { notice("Zurückgesetzt: " + e.n + " auf die vorherige Position."); } catch {}
}
addEventListener("keydown", (e) => { if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); undoMove(); } });

// ---------- Feenstaub: nur auf „Jetzt aktualisieren“ ----------
$("setUpdInstall").addEventListener("pointerdown", (e) => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = e.currentTarget.getBoundingClientRect(), cx = e.clientX || r.left + r.width / 2, cy = e.clientY || r.top + r.height / 2;
  for (let i = 0; i < 34; i++) {
    const s = document.createElement("span"), a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 70;
    s.className = "fairy"; s.textContent = Math.random() < 0.5 ? "✦" : "·";
    s.style.cssText = `left:${cx}px;top:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;--h:${Math.round(Math.random() * 80 + 270)};--s:${(0.6 + Math.random() * 0.9).toFixed(2)};animation-delay:${Math.round(Math.random() * 120)}ms`;
    document.body.append(s); setTimeout(() => s.remove(), 1300);
  }
});
