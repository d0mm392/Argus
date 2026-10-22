// Zifferblätter für die Weltuhren (Design-Varianten analog, zifferblatt, 3d, mechanisch, futuristisch). Zeichnet reines SVG, keine Bilder.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  window.CLOCK_FACE_LOOKS = ["analog", "zifferblatt", "3d", "mechanisch", "futuristisch"];
  window.CLOCK_SECONDS = ["3d", "mechanisch", "futuristisch"]; // diese Varianten zeigen Sekunden und aktualisieren jede Sekunde
  let uid = 0;
  window.clockFace = function (look, t) {
    const id = "cf" + (++uid), svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "-50 -50 100 100"); svg.setAttribute("class", "clk-face clk-" + look);
    const add = (n, at, par, txt) => { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, at[k]); if (txt != null) e.textContent = txt; (par || svg).append(e); return e; };
    const h = t.getHours() % 12, m = t.getMinutes(), s = t.getSeconds();
    const hA = (h + m / 60) * 30, mA = (m + s / 60) * 6, sA = s * 6;
    const hand = (len, w, ang, col, tail = 6, extra = {}) => add("line", { x1: 0, y1: tail, x2: 0, y2: -len, stroke: col, "stroke-width": w, "stroke-linecap": "round", transform: `rotate(${ang})`, ...extra });
    if (look === "futuristisch") {
      const arc = (r, frac, w, col, op) => { const c = 2 * Math.PI * r; add("circle", { r, fill: "none", stroke: col, "stroke-width": w, opacity: op, "stroke-dasharray": `${c * frac} ${c}`, transform: "rotate(-90)", "stroke-linecap": "round" }); };
      add("circle", { r: 46, fill: "none", stroke: "currentColor", "stroke-width": 0.6, opacity: 0.35 });
      add("circle", { r: 40, fill: "none", stroke: "currentColor", "stroke-width": 0.4, opacity: 0.25, "stroke-dasharray": "0.6 3.1" });
      arc(43, ((h * 60 + m) / 720), 2.2, "var(--accent)", 1); arc(36, (m + s / 60) / 60, 1.8, "var(--accent)", 0.75); arc(30, s / 60, 1.2, "currentColor", 0.7);
      add("text", { x: 0, y: 5, "text-anchor": "middle", "font-size": 16, "font-weight": 300, fill: "currentColor", style: "font-family:var(--f-mono)" }, null, String(t.getHours()).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
      return svg;
    }
    if (look === "mechanisch") {
      const brass = "#c9a24b", dark = "#3a2c10";
      add("circle", { r: 47, fill: "none", stroke: brass, "stroke-width": 3 });
      add("circle", { r: 44.5, fill: "none", stroke: brass, "stroke-width": 3, "stroke-dasharray": "2.4 2.4", opacity: 0.85 }); // Zahnkranz
      add("circle", { r: 40, fill: "rgba(250,244,225,0.08)", stroke: brass, "stroke-width": 0.8 });
      [["XII", 0, -31], ["III", 31, 3], ["VI", 0, 35], ["IX", -31, 3]].forEach(([n, x, y]) => add("text", { x, y, "text-anchor": "middle", "font-size": 7.5, fill: brass, style: "font-family:Georgia,serif;font-weight:700" }, null, n));
      for (let i = 0; i < 12; i++) if (i % 3) add("line", { x1: 0, y1: -38, x2: 0, y2: -35, stroke: brass, "stroke-width": 1.2, transform: `rotate(${i * 30})` });
      hand(21, 3.2, hA, brass, 4); hand(32, 2, mA, brass, 6); hand(36, 0.8, sA, "#d9594c", 8);
      add("circle", { r: 2.6, fill: brass, stroke: dark, "stroke-width": 0.6 });
      return svg;
    }
    if (look === "3d") {
      const defs = add("defs", {});
      const g = add("radialGradient", { id: id + "f", cx: "35%", cy: "30%", r: "80%" }, defs); add("stop", { offset: "0%", "stop-color": "#6d7a90" }, g); add("stop", { offset: "100%", "stop-color": "#10151f" }, g);
      const r = add("linearGradient", { id: id + "r", x1: "0", y1: "0", x2: "1", y2: "1" }, defs); add("stop", { offset: "0%", "stop-color": "#f2f6fb" }, r); add("stop", { offset: "100%", "stop-color": "#4b5668" }, r);
      add("circle", { r: 47, fill: `url(#${id}r)` }); add("circle", { r: 42, fill: `url(#${id}f)` });
      for (let i = 0; i < 12; i++) add("line", { x1: 0, y1: -37, x2: 0, y2: i % 3 ? -34 : -30, stroke: "#e9eef6", "stroke-width": i % 3 ? 1.4 : 2.6, "stroke-linecap": "round", transform: `rotate(${i * 30})` });
      const sh = { filter: "drop-shadow(1.2px 1.8px 1.2px rgba(0,0,0,.6))" };
      hand(21, 4, hA, "#f4f7fb", 4, sh); hand(32, 2.6, mA, "#f4f7fb", 6, sh); hand(35, 1, sA, "var(--accent)", 8, sh);
      add("circle", { r: 3, fill: "var(--accent)" }); add("path", { d: "M-34,-14 A38,38 0 0 1 14,-35", fill: "none", stroke: "#fff", "stroke-width": 1.4, opacity: 0.35, "stroke-linecap": "round" });
      return svg;
    }
    // analog / zifferblatt
    add("circle", { r: 46, fill: "none", stroke: "currentColor", "stroke-width": 2, opacity: 0.5 });
    if (look === "zifferblatt") for (let n = 1; n <= 12; n++) { const a = n * Math.PI / 6; add("text", { x: Math.sin(a) * 35, y: -Math.cos(a) * 35 + 3.4, "text-anchor": "middle", "font-size": 9, fill: "currentColor", style: "font-family:var(--f-mono);font-weight:600" }, null, String(n)); }
    else for (let i = 0; i < 12; i++) add("line", { x1: 0, y1: -40, x2: 0, y2: i % 3 ? -37 : -33, stroke: "currentColor", "stroke-width": i % 3 ? 1.5 : 3, transform: `rotate(${i * 30})`, opacity: 0.7 });
    hand(look === "zifferblatt" ? 19 : 22, 4, hA, "currentColor", 4); hand(look === "zifferblatt" ? 27 : 34, 2.5, mA, "var(--accent)", 6);
    add("circle", { r: 3, fill: "var(--accent)" });
    return svg;
  };
})();
