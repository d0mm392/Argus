"use strict";
// Optik und Interaktion: Farbwelten, eigene Farben, Button-Form und -Material, Verlauf-Fenster bei Messwerten, einklappbare Blöcke.
// Alles hier nutzt nur, was frühere Dateien bereitstellen (temps, theme, winColor, applyTheme, applyWinColor …).
  // ---------- Farbwelten (Grundfarbe, Fensterfarbe, Farbverteilung der Regionen) ----------
  // [Name, Farbton, [Fensterfarbton, Sättigung %, Helligkeit %], Regionen: "bunt" oder "thema"]
  const PALETTES = [
    ["Cyber", 188, [222, 60, 5], "bunt"], ["Lava", 8, [10, 30, 5], "thema"], ["Eisberg", 200, [215, 15, 10], "thema"], ["Matrix", 130, [0, 0, 3], "thema"],
    ["Sonnenuntergang", 22, [345, 45, 7], "bunt"], ["Wald", 150, [150, 35, 5], "thema"], ["Ozean", 215, [222, 70, 6], "thema"], ["Blutmond", 355, [350, 50, 6], "thema"],
    ["Neon-Pink", 320, [280, 40, 5], "bunt"], ["Gold", 45, [28, 35, 7], "thema"], ["Aurora", 165, [190, 45, 6], "bunt"], ["Lavendel", 262, [262, 35, 8], "thema"],
    ["Silber", 210, [215, 6, 12], "thema"], ["Wüste", 35, [32, 30, 8], "thema"], ["Toxic", 82, [0, 0, 3], "bunt"], ["Sakura", 340, [330, 30, 8], "thema"]];
  const hexToHsl = (hex) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round(((h * 60) + 360) % 360), Math.round(d ? d / (1 - Math.abs(2 * l - 1)) * 100 : 0), Math.round(l * 100)];
  };
  const hslToHex = (h, s, l) => {
    s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
    return "#" + f(0) + f(8) + f(4);
  };
  function applyPalette([name, hue, win, regions]) {
    theme.hue = hue; theme.regions = regions; $("setHue").value = hue; if ($("setRegions")) $("setRegions").value = regions;
    winColor = { follow: false, h: win[0], s: win[1], l: win[2] }; applyWinColor(); syncWinInputs?.(); applyTheme(); syncCustomColors();
    window.jarvis.setConfig({ themeHue: hue, themeRegions: regions, winColor, palette: name }); markPalette(name);
  }
  const markPalette = (n) => { for (const b of $("palPick").children) b.setAttribute("aria-pressed", String(b.dataset.n === n)); };
  $("palPick").replaceChildren(...PALETTES.map((p) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.n = p[0]; b.title = p[0];
    b.style.background = `linear-gradient(135deg, hsl(${p[1]} 95% 62%) 0 50%, hsl(${p[2][0]} ${Math.max(p[2][1], 20)}% ${Math.min(p[2][2] + 12, 40)}%) 50% 100%)`;
    b.innerHTML = `<span></span>`; b.lastChild.textContent = p[0];
    b.addEventListener("click", () => applyPalette(p)); return b;
  }));
  // Eigene Farben: Grundfarbe (nur der Farbton zählt) und Fensterfarbe (wird dunkel genug gehalten, damit Text lesbar bleibt)
  function syncCustomColors() { $("setAccentHex").value = hslToHex(theme.hue, 100, 62); $("setWinHex").value = hslToHex(winColor.h, Math.max(winColor.s, 10), Math.max(winColor.l + 14, 22)); }
  $("setAccentHex").addEventListener("input", (e) => { theme.hue = hexToHsl(e.target.value)[0]; $("setHue").value = theme.hue; applyTheme(); markPalette(""); });
  $("setAccentHex").addEventListener("change", () => window.jarvis.setConfig({ themeHue: theme.hue, palette: "" }));
  $("setWinHex").addEventListener("input", (e) => { const [h, s, l] = hexToHsl(e.target.value); winColor = { follow: false, h, s, l: Math.max(2, Math.min(l - 14, 30)) }; applyWinColor(); syncWinInputs?.(); markPalette(""); });
  $("setWinHex").addEventListener("change", () => window.jarvis.setConfig({ winColor, palette: "" }));

  // ---------- Buttons: Form und Material, unabhängig voneinander ----------
  const B_SHAPES = [["kapsel", "Kapsel"], ["abgerundet", "Abgerundet"], ["eckig", "Eckig"], ["abgeschnitten", "Abgeschnittene Ecken"]];
  const B_LOOKS = [["standard", "Standard"], ["glas", "Glas"], ["neon", "Neon"], ["relief", "Relief (3D)"], ["flach", "Flach"], ["umriss", "Nur Umriss"], ["verlauf", "Farbverlauf"]];
  const fillSel = (id, list) => $(id).replaceChildren(...list.map(([v, l]) => Object.assign(document.createElement("option"), { value: v, textContent: l })));
  fillSel("setBtnShape", B_SHAPES); fillSel("setBtnLook", B_LOOKS);
  const applyBtn = (shape, look) => { document.body.dataset.bshape = shape || "kapsel"; document.body.dataset.blook = look || "standard"; $("setBtnShape").value = document.body.dataset.bshape; $("setBtnLook").value = document.body.dataset.blook; };
  $("setBtnShape").addEventListener("change", (e) => { applyBtn(e.target.value, document.body.dataset.blook); window.jarvis.setConfig({ btnShape: e.target.value }); });
  $("setBtnLook").addEventListener("change", (e) => { applyBtn(document.body.dataset.bshape, e.target.value); window.jarvis.setConfig({ btnLook: e.target.value }); });
  applyBtn();
  const applyShimmer = (on) => { document.body.classList.toggle("no-shimmer", on === false); $("setShimmer").checked = on !== false; };
  $("setShimmer").addEventListener("change", (e) => { applyShimmer(e.target.checked); window.jarvis.setConfig({ loadShimmer: e.target.checked }); });
  window.jarvis.getConfig().then((c) => { applyBtn(c.btnShape, c.btnLook); applyShimmer(c.loadShimmer); markPalette(c.palette || ""); syncCustomColors(); });

  // ---------- Messwerte anklicken: Verlauf der letzten 30 Minuten ----------
  const SPARK_N = 360;
  setInterval(() => {
    if (document.hidden || !expanded) return;
    const now = Date.now();
    for (const t of temps) { let v; try { v = t.get(); } catch { v = null; } if (typeof v !== "number" || !isFinite(v)) continue; (t.hist ||= []).push([now, v]); if (t.hist.length > SPARK_N) t.hist.shift(); }
  }, 5000);
  const spark = document.createElement("div"); spark.className = "spark-pop"; spark.hidden = true;
  spark.innerHTML = `<div class="sp-h"><b></b><button type="button" aria-label="Schließen">×</button></div><canvas width="260" height="90"></canvas><div class="sp-f"></div>`;
  document.body.append(spark);
  const closeSpark = () => { spark.hidden = true; spark.dataset.k = ""; };
  spark.querySelector("button").addEventListener("click", closeSpark);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !spark.hidden) closeSpark(); });
  addEventListener("pointerdown", (e) => { if (!spark.hidden && !spark.contains(e.target) && !e.target.closest?.(".temp")) closeSpark(); }, true);
  function drawSpark(t) {
    const cv = spark.querySelector("canvas"), g = cv.getContext("2d"), h = t.hist || [];
    g.clearRect(0, 0, cv.width, cv.height);
    const hue = getComputedStyle(t.el).getPropertyValue("--h").trim() || String(CORE_HUE);
    if (h.length < 2) { g.fillStyle = "rgba(200,220,255,0.7)"; g.font = "12px sans-serif"; g.fillText("Noch zu wenig Messwerte, kurz warten …", 10, 48); spark.querySelector(".sp-f").textContent = ""; return; }
    const vs = h.map((p) => p[1]), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1, x = (i) => 6 + i / (h.length - 1) * (cv.width - 12), y = (v) => cv.height - 8 - (v - mn) / rg * (cv.height - 18);
    g.beginPath(); h.forEach((p, i) => (i ? g.lineTo(x(i), y(p[1])) : g.moveTo(x(i), y(p[1])))); g.strokeStyle = `hsl(${hue} 95% 65%)`; g.lineWidth = 2; g.stroke();
    g.lineTo(x(h.length - 1), cv.height); g.lineTo(x(0), cv.height); g.closePath(); g.fillStyle = `hsl(${hue} 90% 55% / 0.18)`; g.fill();
    const min = Math.round((h[h.length - 1][0] - h[0][0]) / 60000);
    spark.querySelector(".sp-f").textContent = `Tief ${mn.toLocaleString("de-DE", { maximumFractionDigits: 1 })} · Hoch ${mx.toLocaleString("de-DE", { maximumFractionDigits: 1 })} · jetzt ${vs[vs.length - 1].toLocaleString("de-DE", { maximumFractionDigits: 1 })} (${min} Min.)`;
  }
  for (const t of temps) {
    if (t.click) continue; // Anzeigen mit eigener Aktion (z. B. BTC öffnet die Seite) behalten sie
    let down = null;
    t.el.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    t.el.addEventListener("click", (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // war ein Ziehen
      e.stopPropagation();
      if (!spark.hidden && spark.dataset.k === t.key) return closeSpark();
      spark.dataset.k = t.key; spark.querySelector("b").textContent = t.w ? (document.querySelector(`[data-k="${t.key}"]`)?.textContent || t.name) : t.name;
      spark.querySelector("b").textContent = t.el.firstChild.textContent + " · Verlauf";
      spark.hidden = false; const r = t.el.getBoundingClientRect(); spark.style.left = Math.max(8, Math.min(innerWidth - 290, r.left)) + "px"; spark.style.top = Math.min(innerHeight - 160, r.bottom + 8) + "px";
      drawSpark(t);
    });
  }
  setInterval(() => { if (!spark.hidden) { const t = temps.find((x) => x.key === spark.dataset.k); if (t) drawSpark(t); } }, 5000);

  // ---------- Blöcke einklappen: Klick auf den Titel ----------
  const foldKey = () => "argus.fold." + (typeof page === "string" ? page : "Start");
  const foldRead = () => { try { return JSON.parse(localStorage.getItem(foldKey()) || "{}"); } catch { return {}; } };
  const foldApply = () => { const f = foldRead(); document.querySelectorAll("section.sys[id]").forEach((s) => s.classList.toggle("folded", !!f[s.id])); };
  document.addEventListener("click", (e) => {
    const title = e.target.closest?.(".sys-head > span:first-child"); if (!title || document.body.classList.contains("arrange")) return;
    const s = title.closest("section.sys[id]"); if (!s) return;
    const f = foldRead(); if (f[s.id]) delete f[s.id]; else f[s.id] = 1;
    try { localStorage.setItem(foldKey(), JSON.stringify(f)); } catch {}
    foldApply();
  });
  document.querySelectorAll(".sys-head > span:first-child").forEach((el) => { el.style.cursor = "pointer"; el.title = "Klicken zum Ein- und Ausklappen"; });
  foldApply(); document.addEventListener("click", (e) => { if (e.target.closest?.("#pageTabs")) setTimeout(foldApply, 60); });
