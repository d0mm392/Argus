"use strict";
  // ---------- Auslastung in der Kugel ----------
  // Jeder CPU-Kern bekommt einen Längen-Sektor der Kugel; seine Neuronen feuern umso dichter (und wärmer), je mehr er arbeitet
  let viz = { cores: true, heat: true, rings: true, apps: true, ringStyle: "form" }, coreSectors = null, ringPreview = null;
  const loadHue = (l) => 195 - Math.min(1, l / 100) * 175; // 0 % kühl blau, 100 % orange-rot
  function sectorsFor(n) {
    if (coreSectors && coreSectors.n === n && coreSectors.len === nodes.length) return coreSectors.list;
    const list = Array.from({ length: n }, () => []);
    nodes.forEach((nd, i) => { const a = (Math.atan2(nd.z, nd.x) + Math.PI) / (Math.PI * 2); list[Math.min(n - 1, (a * n) | 0)].push(i); });
    coreSectors = { n, len: nodes.length, list };
    return list;
  }
  const gauge = { cpu: 0, gpu: 0, ram: 0, heat: 0 };
  // Jedes Programm und jeder Prozess bekommt eine eigene, feste Farbe; seine Last feuert in dieser Farbe durch die Kugel
  const appHueCache = new Map();
  function appHue(name) {
    const k = String(name || "").toLowerCase().replace(/\.exe$/, "");
    if (!appHueCache.has(k)) { let h = 2166136261; for (const ch of k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); appHueCache.set(k, ((h >>> 0) * 0.618033988749895 * 360) % 360); }
    return appHueCache.get(k);
  }
  function loadSources() {
    const out = new Map();
    for (const a of sys.apps || []) if (a.cpu != null) out.set(String(a.key || a.name).toLowerCase(), { name: a.name, key: a.key, cpu: a.cpu });
    for (const p of sys.top || []) { const k = String(p.name).toLowerCase().replace(/\.exe$/, ""); if (!out.has(k) && !/^(argus|jarvis|electron|system|idle|registry|memory compression)$/i.test(k)) out.set(k, { name: p.name, key: k, cpu: p.cpu }); }
    return [...out.values()].filter((x) => x.cpu > 0.5);
  }
  function vizSpawnApps(dt, speedK) {
    if (viz.apps === false || !nodes.length) return;
    const list = loadSources(); if (!list.length) return;
    const secs = sectorsFor(12);
    for (const a of list) {
      const hue = appHue(a.key || a.name), cand = secs[Math.floor(hue / 30) % 12];
      if (!cand.length) continue;
      let n = Math.min(1, a.cpu / 30) * 7 * dt * speedK;
      while (n > 0) { if (Math.random() < n) spawnFrom(cand[(Math.random() * cand.length) | 0], hue); n -= 1; }
    }
  }
  function vizSpawn(dt, speedK) {
    vizSpawnApps(dt, speedK);
    if (!viz.cores || !sys.cores?.length) return;
    const secs = sectorsFor(sys.cores.length);
    sys.cores.forEach((l, c) => {
      const cand = secs[c]; if (!cand.length) return;
      let n = Math.pow(Math.min(1, l / 100), 1.5) * 9 * dt * speedK;
      while (n > 0) { if (Math.random() < n) spawnFrom(cand[(Math.random() * cand.length) | 0], loadHue(l)); n -= 1; }
    });
  }
  // Systemlast CPU, GPU, RAM in mehreren Darstellungen (viz.ringStyle):
  //  form   = Linien folgen der Umrisslinie der gewählten Form, von oben im Uhrzeigersinn gefüllt
  //  kreis  = klassische Kreisbögen   balken = drei Säulen neben der Form   tacho = drei Rundinstrumente unter der Form
  //  verlauf = Liniendiagramm der letzten Minute unter der Form   puls = Strahlen rund um die Form, die mit der Last ausschlagen
  const RING_STYLES = [["form", "An der Form"], ["kreis", "Kreis"], ["balken", "Balken"], ["tacho", "Tacho"], ["verlauf", "Verlauf"], ["puls", "Strahlen"], ["orbit", "Orbit 3D"], ["saeulen", "Säulen 3D"], ["kugeln", "Kugeln 3D"], ["segmente", "Segmente"], ["radar", "Radar"], ["zahlen", "Zahlen"]];
  const gHist = { cpu: [], gpu: [], ram: [] }; let gHistT = 0;
  const GROWS = [["cpu", 205, "CPU"], ["gpu", 130, "GPU"], ["ram", 285, "RAM"]];
  const gaugeHue = (v, hue) => (v > 0.9 ? 8 : v > 0.75 ? 30 : viz.ringMono ? theme.hue : hue);
  const hasG = (k) => (k === "cpu" ? sys.cpu != null : k === "gpu" ? sys.gpuLoad != null : sys.ram != null);
  // Umriss als Punktliste, nach außen versetzt; Startpunkt oben, im Uhrzeigersinn
  function ringPoly(off) {
    const pts = [];
    if (!hull) { const r = S * 1.08 + off; for (let i = 0; i <= 96; i++) { const a = -Math.PI / 2 + i / 96 * Math.PI * 2; pts.push([CX + Math.cos(a) * r, CY + Math.sin(a) * r]); } return pts; }
    let h = hull.map((p) => p.slice());
    if (!sharp) for (let it = 0; it < 2; it++) { const q = []; for (let i = 0; i < h.length; i++) { const a = h[i], c = h[(i + 1) % h.length]; q.push([a[0] * 0.75 + c[0] * 0.25, a[1] * 0.75 + c[1] * 0.25], [a[0] * 0.25 + c[0] * 0.75, a[1] * 0.25 + c[1] * 0.75]); } h = q; }
    const cx = h.reduce((a, p) => a + p[0], 0) / h.length, cy = h.reduce((a, p) => a + p[1], 0) / h.length;
    h = h.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * off, y + dy / l * off]; });
    // Uhrzeigersinn erzwingen (Bildschirm: y nach unten)
    let area = 0; for (let i = 0; i < h.length; i++) { const a = h[i], c = h[(i + 1) % h.length]; area += a[0] * c[1] - c[0] * a[1]; }
    if (area < 0) h.reverse();
    // oben anfangen: Punkt mit Winkel am nächsten zu -90°
    let best = 0, bd = 9; h.forEach(([x, y], i) => { const d = Math.abs(Math.atan2(y - cy, x - cx) + Math.PI / 2); if (d < bd) { bd = d; best = i; } });
    h = h.slice(best).concat(h.slice(0, best)); h.push(h[0]);
    return h;
  }
  function strokePart(pts, v) {
    let total = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let left = total * v; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const l = seg[i - 1], f = Math.min(1, left / l); ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); left -= l;
    }
    ctx.stroke();
  }
  function gText(t, x, y, size, color, align = "center") { ctx.font = `600 ${size}px ${getComputedStyle(document.body).getPropertyValue("--f-mono") || "monospace"}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(t, x, y); }
  // Balken, Tacho und Verlauf richten ihre Größe nach SB (Grundmaß ohne Kugel-Zoom), nicht nach der Kugel
  // Balken, Tacho und Verlauf sind ein eigenes Teil: ziehbar (Lage wie die Anzeigen relativ zur Form), Mausrad = Größe
  const ringHandle = document.createElement("div"); ringHandle.className = "ringh"; ringHandle.dataset.pk = "rings"; ringHandle.title = "Ziehen: verschieben · Mausrad: Größe · Doppelklick: zurück";
  // × zum Ausblenden und Griff unten rechts zum Größe-Ändern (wie bei den anderen Fenstern)
  { const x = document.createElement("button"); x.type = "button"; x.className = "ringh-x"; x.textContent = "×"; x.title = "Last-Anzeige ausblenden (zurück: Rechtsklick › Anzeigen oder Einstellungen)";
    x.addEventListener("pointerdown", (e) => e.stopPropagation());
    x.addEventListener("click", (e) => { e.stopPropagation(); const cb = document.querySelector('[data-viz="rings"]'); if (cb) { cb.checked = false; cb.dispatchEvent(new Event("change")); } else { viz = { ...viz, rings: false }; window.argus.setConfig({ viz }); } });
    const g = document.createElement("div"); g.className = "ringh-g"; g.title = "Ziehen: Größe ändern";
    let gs = null;
    g.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); g.setPointerCapture(e.pointerId); gs = { x: e.clientX, y: e.clientY, s: scales.rings || 1, w: ringHandle.offsetWidth || 100 }; });
    g.addEventListener("pointermove", (e) => { if (!gs) return; const k = 1 + ((e.clientX - gs.x) + (e.clientY - gs.y)) / (2 * gs.w); scales.rings = Math.max(0.5, Math.min(3, gs.s * k)); if (Math.abs(scales.rings - 1) < 0.03) delete scales.rings; });
    const end = () => { if (gs) { gs = null; window.argus.setConfig({ scales }); } };
    g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
    ringHandle.append(x, g); }
  let ringHandleOn = false;
  function ringAnchor(w, h, defA, defR) {
    const p = anchor("rings", defA, defR, 3.3, w, h, 0.2);
    if (gTiltX || gTiltY) { const rx = gTiltX * Math.PI / 180, ry = gTiltY * Math.PI / 180, cx = p.x + w / 2, cy = p.y + h / 2; ctx.translate(cx, cy); ctx.transform(Math.cos(ry), Math.sin(ry) * Math.sin(rx), 0, Math.cos(rx), 0, 0); ctx.translate(-cx, -cy); }
    ringHandleOn = true; Object.assign(ringHandle.style, { width: w + 12 + "px", height: h + 12 + "px", transform: `translate(${Math.round((p.x - 6))}px, ${Math.round((p.y - 6))}px)` });
    return p;
  }
  function drawGauges(dt) {
    ringHandleOn = false;
    const k = 1 - Math.exp(-dt * 3);
    gauge.cpu += ((sys.cpu ?? 0) - gauge.cpu) * k; gauge.gpu += ((sys.gpuLoad ?? 0) - gauge.gpu) * k; gauge.ram += ((sys.ram?.pct ?? 0) - gauge.ram) * k;
    gHistT += dt; if (gHistT > 1) { gHistT = 0; for (const [key] of GROWS) { gHist[key].push(gauge[key]); if (gHist[key].length > 60) gHist[key].shift(); } }
    if (!viz.rings) return;
    const style = ringPreview || viz.ringStyle || "form", rs = scales.rings || 1;
    const rows = GROWS.filter(([key]) => hasG(key)), w = Math.max(1.5, S * 0.018) * rs;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (style === "form" || style === "kreis") {
      rows.forEach(([key, hue], i) => {
        const v = Math.min(100, gauge[key]) / 100, off = S * (0.05 + i * 0.055) * rs, h = gaugeHue(v, hue);
        ctx.lineWidth = w;
        if (style === "kreis") {
          const r = S * 1.08 + off, a0 = -Math.PI / 2;
          ctx.strokeStyle = `hsla(${hue},40%,60%,0.10)`; ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke();
          if (v > 0.005) { ctx.strokeStyle = `hsla(${h},85%,62%,${0.55 + v * 0.35})`; ctx.beginPath(); ctx.arc(CX, CY, r, a0, a0 + v * Math.PI * 2); ctx.stroke(); }
        } else {
          const pts = ringPoly(off);
          ctx.strokeStyle = `hsla(${hue},40%,60%,0.10)`; strokePart(pts, 1);
          if (v > 0.005) { ctx.strokeStyle = `hsla(${h},85%,62%,${0.55 + v * 0.35})`; ctx.shadowColor = `hsla(${h},90%,60%,0.6)`; ctx.shadowBlur = 6 * v; strokePart(pts, v); ctx.shadowBlur = 0; }
        }
      });
    } else if (style === "balken") {
      // drei Säulen rechts neben der Form, gefüllt von unten, Wert darüber
      // Abstand nach Schriftbreite, damit sich CPU/GPU/RAM und die Werte nicht überschneiden
      const fs = Math.max(9, SB * 0.07) * rs, bh = SB * 1.5 * rs, bw = Math.max(5, SB * 0.06) * rs, gap = Math.max(bw * 1.9, fs * 2.6);
      const bwid = gap * (rows.length - 1) + bw, bhei = bh + fs * 3.4, P = ringAnchor(bwid, bhei, 0.05, 1.45);
      const x0 = P.x, y1 = P.y + fs * 1.6 + bh;
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, x = x0 + i * gap, h = gaugeHue(v, hue);
        ctx.fillStyle = `hsla(${hue},40%,60%,0.12)`; ctx.beginPath(); ctx.roundRect(x, y1 - bh, bw, bh, bw / 2); ctx.fill();
        const grd = ctx.createLinearGradient(0, y1, 0, y1 - bh); grd.addColorStop(0, `hsla(${hue},80%,55%,0.9)`); grd.addColorStop(1, `hsla(${h},90%,65%,0.95)`);
        ctx.fillStyle = grd; ctx.beginPath(); ctx.roundRect(x, y1 - bh * v, bw, Math.max(bw, bh * v), bw / 2); ctx.fill();
        gText(lab, x + bw / 2, y1 + fs * 0.95, fs * 0.85, `hsla(${hue},50%,75%,0.85)`);
        gText(Math.round(gauge[key]) + "", x + bw / 2, y1 - bh - fs * 0.8, fs, `hsla(${h},90%,72%,0.95)`);
      });
    } else if (style === "tacho") {
      // drei Rundinstrumente untereinander rechts neben der Form, mit Zeiger
      const r = SB * 0.22 * rs, span = r * 2.5, P = ringAnchor(r * 2.4, span * rows.length, 0.05, 1.45), x = P.x + r * 1.2;
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, y = P.y + span * (i + 0.5), h = gaugeHue(v, hue), a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
        ctx.lineWidth = Math.max(2, r * 0.16);
        ctx.strokeStyle = `hsla(${hue},40%,60%,0.14)`; ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
        ctx.strokeStyle = `hsla(${h},85%,62%,0.9)`; ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + (a1 - a0) * v); ctx.stroke();
        const na = a0 + (a1 - a0) * v; ctx.lineWidth = Math.max(1.2, r * 0.07); ctx.strokeStyle = `hsla(${h},90%,80%,0.95)`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(na) * r * 0.78, y + Math.sin(na) * r * 0.78); ctx.stroke();
        gText(Math.round(gauge[key]) + "%", x, y + r * 0.55, Math.max(8, r * 0.42), `hsla(${h},90%,75%,0.95)`);
        gText(lab, x, y - r * 0.35, Math.max(7, r * 0.3), `hsla(${hue},50%,75%,0.7)`);
      });
    } else if (style === "verlauf") {
      // Liniendiagramm der letzten 60 Sekunden unter der Form, Fläche weich gefüllt
      const gw = Math.min(W - 16, SB * 2.4 * rs), gh = SB * 0.5 * rs, lf = Math.max(8, SB * 0.06) * rs, P = ringAnchor(gw, gh + lf * 2, 1.5708, 1.55), x0 = P.x, y0 = P.y + lf * 2;
      ctx.strokeStyle = "rgba(140,180,220,0.12)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x0, y0, gw, gh, 6); ctx.stroke();
      rows.forEach(([key, hue, lab], i) => {
        const hs = gHist[key].concat([gauge[key]]); if (hs.length < 2) return;
        const px = (j) => x0 + gw - (hs.length - 1 - j) * gw / 60, py = (v) => y0 + gh - Math.min(100, v) / 100 * (gh - 4) - 2;
        ctx.beginPath(); hs.forEach((v, j) => (j ? ctx.lineTo(px(j), py(v)) : ctx.moveTo(px(j), py(v))));
        ctx.strokeStyle = `hsla(${hue},85%,62%,0.9)`; ctx.lineWidth = Math.max(1.2, SB * 0.012) * rs; ctx.stroke();
        ctx.lineTo(px(hs.length - 1), y0 + gh); ctx.lineTo(px(0), y0 + gh); ctx.closePath(); ctx.fillStyle = `hsla(${hue},85%,62%,0.07)`; ctx.fill();
        gText(lab + " " + Math.round(gauge[key]) + "%", x0 + 6 + i * gw / 3, y0 - lf, lf, `hsla(${hue},70%,72%,0.9)`, "left");
      });
    } else if (style === "puls") {
      // Strahlen rund um die Form: je Last ein Drittel des Umfangs, Strahlen schlagen mit der Last und leicht im Takt aus
      const pts = ringPoly(S * 0.06 * rs), n = pts.length - 1, cx = CX, cy = CY;
      rows.forEach(([key, hue], i) => {
        const v = Math.min(100, gauge[key]) / 100, h = gaugeHue(v, hue), from = Math.floor(n * i / 3), to = Math.floor(n * (i + 1) / 3);
        ctx.strokeStyle = `hsla(${h},85%,62%,${0.35 + v * 0.55})`; ctx.lineWidth = Math.max(1.2, S * 0.012) * rs;
        for (let j = from; j < to; j += Math.max(1, Math.round(n / 72))) {
          const [x, y] = pts[j], dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
          const len = S * (0.03 + v * 0.22 * (0.75 + 0.25 * Math.sin(time * 6 + j * 0.9))) * rs;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx / l * len, y + dy / l * len); ctx.stroke();
        }
      });
    } else if (style === "orbit") {
      // Drei geneigte Ringe um die Form, drehen mit ihr mit; der gefüllte Teil zeigt die Last, ein Punkt läuft an der Spitze
      const tilts = [[0.5, 0.2], [1.15, -0.9], [-0.7, 1.9]].map(([a, b]) => [a + gTiltX * Math.PI / 180, b + gTiltY * Math.PI / 180]);
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, h = gaugeHue(v, hue), R = 0.98 + i * 0.09, [ta, tb] = tilts[i % 3], N = 72;
        const ca = Math.cos(ta), sa = Math.sin(ta), cb = Math.cos(tb), sb = Math.sin(tb), pt = (t) => {
          let x = Math.cos(t) * R, y = Math.sin(t) * R, z = 0; const y2 = y * ca - z * sa, z2 = y * sa + z * ca; y = y2; z = z2;
          const x3 = x * cb - y * sb, y3 = x * sb + y * cb; return rot(x3, y3, z);
        };
        ctx.lineWidth = w * 1.2;
        let prev = null;
        for (let j = 0; j <= N; j++) {
          const t = -Math.PI / 2 + j / N * Math.PI * 2, c = pt(t), q = proj(c), front = c[2] > -0.1 ? 1 : 0.4;
          if (prev) {
            const on = j / N <= v;
            ctx.strokeStyle = on ? `hsla(${h},85%,62%,${(0.5 + v * 0.4) * front})` : `hsla(${hue},40%,60%,${0.12 * front})`;
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          }
          prev = q;
        }
        const tc = -Math.PI / 2 + v * Math.PI * 2, cc = pt(tc), qq = proj(cc);
        ctx.fillStyle = `hsla(${h},90%,75%,${cc[2] > -0.1 ? 0.95 : 0.5})`; ctx.shadowColor = `hsla(${h},90%,60%,0.8)`; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(qq[0], qq[1], Math.max(2.5, S * 0.03) * rs, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        if (cc[2] > -0.1) gText(lab + " " + Math.round(gauge[key]), qq[0], qq[1] - Math.max(9, S * 0.07) * rs, Math.max(8, S * 0.06) * rs, `hsla(${h},90%,78%,0.95)`);
      });
    } else if (style === "saeulen") {
      // Drei Quader in Schrägansicht rechts neben der Form, von unten gefüllt: Vorderseite, Seite und Deckel verschieden hell
      const fs = Math.max(9, SB * 0.07) * rs, bh = SB * 1.4 * rs, bw = Math.max(8, SB * 0.1) * rs, d = bw * 0.55, gap = Math.max(bw * 2.2, fs * 2.8);
      const P = ringAnchor(gap * (rows.length - 1) + bw + d, bh + fs * 3.6 + d, 0.05, 1.45), x0 = P.x, y1 = P.y + fs * 1.6 + d + bh;
      const box = (x, y, bwid, hgt, col, a) => { // y = Unterkante der Vorderseite
        ctx.fillStyle = `hsla(${col[0]},${col[1]}%,${col[2]}%,${a})`; ctx.fillRect(x, y - hgt, bwid, hgt);
        ctx.fillStyle = `hsla(${col[0]},${col[1]}%,${col[2] - 14}%,${a})`; ctx.beginPath(); ctx.moveTo(x + bwid, y); ctx.lineTo(x + bwid + d, y - d); ctx.lineTo(x + bwid + d, y - d - hgt); ctx.lineTo(x + bwid, y - hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `hsla(${col[0]},${col[1]}%,${col[2] + 12}%,${a})`; ctx.beginPath(); ctx.moveTo(x, y - hgt); ctx.lineTo(x + d, y - hgt - d); ctx.lineTo(x + bwid + d, y - hgt - d); ctx.lineTo(x + bwid, y - hgt); ctx.closePath(); ctx.fill();
      };
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, x = x0 + i * gap, h = gaugeHue(v, hue);
        box(x, y1, bw, bh, [hue, 40, 45], 0.14);
        if (v > 0.01) box(x, y1, bw, Math.max(2, bh * v), [h, 80, 55], 0.92);
        gText(lab, x + bw / 2 + d / 2, y1 + fs * 0.95, fs * 0.85, `hsla(${hue},50%,75%,0.85)`);
        gText(Math.round(gauge[key]) + "", x + bw / 2 + d / 2, y1 - bh * v - d - fs * 0.9, fs, `hsla(${h},90%,72%,0.95)`);
      });
    } else if (style === "kugeln") {
      // Drei Glaskugeln untereinander, gefüllt wie ein Tank, mit Glanz und Schatten
      const r = SB * 0.2 * rs, span = r * 2.5, P = ringAnchor(r * 2.4, span * rows.length, 0.05, 1.45), x = P.x + r * 1.2;
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, y = P.y + span * (i + 0.5), h = gaugeHue(v, hue);
        const g0 = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g0.addColorStop(0, `hsla(${hue},40%,70%,0.22)`); g0.addColorStop(1, `hsla(${hue},50%,25%,0.35)`);
        ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, Math.PI * 2); ctx.clip();
        const ly = y + r - 2 * r * v; ctx.beginPath(); ctx.moveTo(x - r, y + r);
        for (let px = -r; px <= r; px += r / 8) ctx.lineTo(x + px, ly + Math.sin(time * 2 + px / r * 3 + i) * r * 0.04 * (v > 0.02 && v < 0.98 ? 1 : 0));
        ctx.lineTo(x + r, y + r); ctx.closePath();
        const g1 = ctx.createLinearGradient(0, ly, 0, y + r); g1.addColorStop(0, `hsla(${h},90%,62%,0.85)`); g1.addColorStop(1, `hsla(${hue},80%,38%,0.9)`); ctx.fillStyle = g1; ctx.fill();
        ctx.restore();
        const g2 = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x - r * 0.4, y - r * 0.5, r * 0.55); g2.addColorStop(0, "rgba(255,255,255,0.45)"); g2.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.05); ctx.strokeStyle = `hsla(${hue},60%,75%,0.45)`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        gText(Math.round(gauge[key]) + "%", x, y + r * 0.1, Math.max(8, r * 0.4), `hsla(${h},40%,96%,0.95)`);
        gText(lab, x, y - r * 0.4, Math.max(7, r * 0.28), `hsla(${hue},30%,92%,0.8)`);
      });
    } else if (style === "segmente") {
      // LED-Leisten: drei Zeilen aus kleinen Segmenten, die von grün über gelb nach rot aufleuchten
      const fs = Math.max(9, SB * 0.06) * rs, n = 20, sw = Math.max(4, SB * 0.05) * rs, sh = Math.max(6, SB * 0.065) * rs, gp = sw * 0.35, rowH = sh + fs * 1.5;
      const P = ringAnchor(n * (sw + gp) + fs * 3, rowH * rows.length, 0.05, 1.6), x0 = P.x + fs * 3;
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, y = P.y + i * rowH + fs * 0.8;
        gText(lab, P.x, y + sh / 2, fs, `hsla(${hue},50%,75%,0.85)`, "left");
        for (let j = 0; j < n; j++) {
          const on = (j + 0.5) / n <= v, f = j / (n - 1), hh = 140 - f * 140;
          ctx.fillStyle = on ? `hsla(${hh},85%,58%,0.95)` : `hsla(${hue},30%,60%,0.1)`;
          if (on) { ctx.shadowColor = `hsla(${hh},90%,55%,0.7)`; ctx.shadowBlur = 5; }
          ctx.beginPath(); ctx.roundRect(x0 + j * (sw + gp), y, sw, sh, 1.5); ctx.fill(); ctx.shadowBlur = 0;
        }
      });
    } else if (style === "radar") {
      // Netzdiagramm: eine Achse je Last, Fläche spannt sich mit den Werten auf
      const R = SB * 0.45 * rs, P = ringAnchor(R * 2.6, R * 2.6, 0.05, 1.45), cx = P.x + R * 1.3, cy = P.y + R * 1.3, m = Math.max(3, rows.length);
      const ang = (i) => -Math.PI / 2 + i / m * Math.PI * 2;
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(140,180,220,0.16)";
      for (const g of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); for (let i = 0; i < m; i++) { const a = ang(i); i ? ctx.lineTo(cx + Math.cos(a) * R * g, cy + Math.sin(a) * R * g) : ctx.moveTo(cx + Math.cos(a) * R * g, cy + Math.sin(a) * R * g); } ctx.closePath(); ctx.stroke(); }
      for (let i = 0; i < m; i++) { const a = ang(i); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
      const vals = rows.map(([key]) => Math.min(100, gauge[key]) / 100), mx = Math.max(0, ...vals), hh = gaugeHue(mx, 190);
      ctx.beginPath(); for (let i = 0; i < m; i++) { const a = ang(i), v = vals[i] ?? 0; i ? ctx.lineTo(cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v) : ctx.moveTo(cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v); } ctx.closePath();
      ctx.fillStyle = `hsla(${hh},85%,60%,0.22)`; ctx.fill(); ctx.strokeStyle = `hsla(${hh},90%,68%,0.9)`; ctx.lineWidth = Math.max(1.5, SB * 0.012) * rs; ctx.stroke();
      rows.forEach(([key, hue, lab], i) => { const a = ang(i), v = vals[i]; gText(lab + " " + Math.round(gauge[key]), cx + Math.cos(a) * (R + Math.max(10, R * 0.2)), cy + Math.sin(a) * (R + Math.max(10, R * 0.2)), Math.max(8, R * 0.2), `hsla(${gaugeHue(v, hue)},80%,76%,0.95)`); });
    } else if (style === "zahlen") {
      // Große Zahlen ohne Grafik, jede in der Farbe ihrer Last
      const fs = Math.max(14, SB * 0.16) * rs, P = ringAnchor(fs * 4.2, fs * 1.5 * rows.length, 0.05, 1.5);
      rows.forEach(([key, hue, lab], i) => {
        const v = Math.min(100, gauge[key]) / 100, y = P.y + fs * 1.5 * (i + 0.5), h = gaugeHue(v, hue);
        gText(lab, P.x, y - fs * 0.55, Math.max(8, fs * 0.38), `hsla(${hue},50%,75%,0.75)`, "left");
        ctx.shadowColor = `hsla(${h},90%,60%,0.5)`; ctx.shadowBlur = 8; gText(Math.round(gauge[key]) + "%", P.x, y + fs * 0.1, fs, `hsla(${h},90%,72%,0.95)`, "left"); ctx.shadowBlur = 0;
      });
    }
    ctx.restore();
    ringHandle.style.display = ringHandleOn ? "" : "none";
  }

  // ---------- Zustände ----------
  const STATES = {
    idle:      { label: "Leerlauf",   hue: 205, color: "#5fa8ff" },
    listening: { label: "Hört zu",    hue: 188, color: "#5fd4ff" },
    thinking:  { label: "Denkt nach", hue: 268, color: "#b48cff" },
    speaking:  { label: "Antwortet",  hue: 272, color: "#b98cff" },
    error:     { label: "Störung",    hue: 10,  color: "#ff7a5c" },
  };
  let state = "idle", stateHue = 205, coreAct = 0.15;
  function setState(s, proc) {
    state = s;
    $("stateLabel").textContent = STATES[s].label;
    healthPill();
    $("pill").style.setProperty("--dot", STATES[s].color);
    if (proc) $("proc").textContent = proc;
    for (const r of REGIONS) { r.target = 0; r.task = r.idle; }
    if (s === "idle") $("proc").textContent = voice.on ? "Wartet auf „Hallo Claude“" : "Wartet auf Eingabe";
    if (s === "listening") { focus("hoer", 1, "Erkennt Sprache"); focus("verst", 0.45, "Wörter → Bedeutung"); }
    if (s === "speaking") { focus("ausgabe", 1, "Formuliert Antwort"); focus("logik", 0.35, "Hält roten Faden"); focus("gedae", 0.25, "Speichert Gespräch"); }
    if (s === "error") focus("logik", 0.6, "Fehler behandeln");
  }
  function focus(key, level, task) { const r = REGIONS[R[key]]; r.target = Math.max(r.target, level); if (task) r.task = task; }

  const THINK_PHASES = [
    ["verst", "Analysiert Anfrage", "Zerlegt die Frage"],
    ["gedae", "Lädt Gesprächskontext", "Ruft Kontext ab"],
    ["logik", "Plant Antwort", "Plant die Antwort"],
    ["wissen", "Durchsucht Wissen", "Sucht passendes Wissen"],
  ];
  let phaseTimer = null, phaseIdx = 0;
  function startThinking() {
    setState("thinking", "Denkt nach…");
    phaseIdx = 0; runPhase();
    phaseTimer = setInterval(runPhase, 1700);
  }
  function runPhase() {
    for (const r of REGIONS) { r.target = 0.12; r.task = r.idle; }
    const [key, task, proc] = THINK_PHASES[phaseIdx % THINK_PHASES.length];
    const [pkey] = THINK_PHASES[(phaseIdx + THINK_PHASES.length - 1) % THINK_PHASES.length];
    focus(pkey, 0.4); focus(key, 1, task);
    $("proc").textContent = proc + "…";
    log(REGIONS[R[key]].name + ": " + task);
    phaseIdx++;
  }
  function stopThinking() { clearInterval(phaseTimer); phaseTimer = null; }

  // Im Leerlauf arbeitet die KI sichtbar im Hintergrund weiter.
  let daydream = { key: null, until: 0 }, nextDream = 2.5;
  const DREAMS = { gedae: "Konsolidiert Gespräche", logik: "Prüft offene Aufgaben", wissen: "Indexiert Wissen", verst: "Ordnet Begriffe" };

  // ---------- Protokoll ----------
  function log(msg) {
    const li = document.createElement("li"), t = document.createElement("time");
    t.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.append(t, document.createTextNode(msg));
    const el = $("log"); el.append(li);
    while (el.children.length > 4) el.firstChild.remove();
  }
  function notice(msg) { $("notice").textContent = msg || ""; }

  // ---------- Darstellung ----------
  // offen/zu der Einstellungen beobachten statt an jeder Stelle nachzutragen
  let setOpen = false;
  new MutationObserver(() => { setOpen = !$("settings").hidden; if (!setOpen) bgKick?.(); }).observe($("settings"), { attributes: true, attributeFilter: ["hidden"] });
  let W = 0, H = 0, dpr = 1, S = 100, SB = 100, CX = 0, CY = 0, ballScale = 1, ballOff = { x: 0, y: 0 }, freeLayout = null; // SB: Grundmaß ohne Kugel-Zoom, daran hängen alle Anzeigen
  const stage = $("stage");
  // Symbiont mit eigenem Kopf (Option): streift im Panel umher, ruht, schießt plötzlich los, greift mal nach Zeiger oder Knöpfen, mal nicht
  let venomRoam = false, homeX = 0, homeY = 0;
  const roam = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, mode: "rest", t: 2 };
  function roamApply() { CX = Math.max(S * 0.9, Math.min(W - S * 0.9, homeX + roam.x)); CY = Math.max(S * 0.7, Math.min(H - S * 0.7, homeY + roam.y)); }
  function roamStep(dt) {
    const on = venomRoam && expanded && shape === "symbiont" && !gesture && !document.body.classList.contains("arrange");
    if (!on) { if (!roam.x && !roam.y) return; roam.mode = "home"; roam.tx = 0; roam.ty = 0; }
    else if ((roam.t -= dt) <= 0 || roam.mode === "home") {
      const r = Math.random(), sr = stage.getBoundingClientRect(), blks = [...document.querySelectorAll(".panel > .blk:not(.gone)")].map((b) => b.getBoundingClientRect()).filter((b) => b.width);
      const covered = (q) => { const x = sr.left + homeX + q[0], y = sr.top + homeY + q[1]; return blks.reduce((a, b) => a + Math.max(0, Math.min(x + S, b.right) - Math.max(x - S, b.left)) * Math.max(0, Math.min(y + S, b.bottom) - Math.max(y - S, b.top)), 0); };
      const rnd1 = () => [(Math.random() - 0.5) * (W - S * 2), (Math.random() - 0.5) * (H - S * 1.4)];
      const pick = () => { let best = rnd1(), bc = covered(best); for (let i = 0; i < 7 && bc > 0; i++) { const q = rnd1(), c = covered(q); if (c < bc) { best = q; bc = c; } } return best; }; // lieber freie Stellen, aber ab und zu verkriecht er sich
      let p = Math.random() < 0.15 ? rnd1() : pick();
      if (r < 0.3) { roam.mode = "rest"; roam.t = 1.5 + Math.random() * 6; p = [roam.x, roam.y]; } // einfach mal sitzen bleiben
      else if (r < 0.7) { roam.mode = "drift"; roam.t = 3 + Math.random() * 6; }
      else { roam.mode = "dash"; roam.t = 0.6 + Math.random() * 1.4; // losschnellen: irgendwohin, zum Zeiger oder zu einem Knopf
        if (r > 0.85 && cursor) p = [cursor.x - sr.left - homeX, cursor.y - sr.top - homeY];
        else if (r > 0.78) { const bs = [...document.querySelectorAll(".bar button, .panel button")].filter((b) => b.offsetParent); const b = bs[Math.floor(Math.random() * bs.length)]?.getBoundingClientRect();
          if (b && b.width) p = [b.left + b.width / 2 - sr.left - homeX, b.top + b.height / 2 - sr.top - homeY]; } }
      roam.tx = p[0]; roam.ty = p[1];
    }
    // gedämpfte Feder zum Ziel; beim Losschnellen steif und schnell, beim Treiben weich
    const [k, damp, vmax] = roam.mode === "dash" ? [28, 7, S * 9] : roam.mode === "drift" ? [1.6, 2.2, S * 1.2] : roam.mode === "home" ? [6, 5, S * 4] : [3, 4, S];
    const h = Math.min(dt, 0.05);
    roam.vx += ((roam.tx - roam.x) * k - roam.vx * damp) * h; roam.vy += ((roam.ty - roam.y) * k - roam.vy * damp) * h;
    const v = Math.hypot(roam.vx, roam.vy); if (v > vmax) { roam.vx *= vmax / v; roam.vy *= vmax / v; }
    if (roam.mode === "drift") { roam.vx += Math.sin(time * 1.3) * S * 0.3 * h; roam.vy += Math.cos(time * 0.9) * S * 0.3 * h; } // nicht schnurgerade
    roam.x += roam.vx * h; roam.y += roam.vy * h;
    if (roam.mode === "home" && Math.hypot(roam.x, roam.y) < 0.5 && v < 2) { roam.x = roam.y = roam.vx = roam.vy = 0; roam.mode = "rest"; roam.t = 1; }
    roamApply();
    if (roam.mode === "dash" && v > S * 2) symAg = Math.min(1.5, symAg + h * 2); // beim Losschnellen wird die Masse unruhiger
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    SB = Math.max(60, expanded ? Math.min(W * 0.47, H * (freeLayout ? 0.14 : 0.3)) : Math.min(W, H) * 0.29);
    // Im Panel macht das Mausrad nur die Kugel größer; Fläche und Anzeigen bleiben, wo sie sind
    S = expanded ? Math.max(40, Math.min(SB * ballScale, W * 0.47, H * 0.44)) : SB;
    CX = W / 2; CY = expanded ? H / 2 + 6 : H / 2 - 16;
    // Im Panel lässt sich die Form verschieben (Linksziehen), gemerkt als Anteil der Fläche
    if (expanded) { CX = Math.max(S, Math.min(W - S, W / 2 + ballOff.x * W)); CY = Math.max(S * 0.6, Math.min(H - S * 0.6, H / 2 + 6 + ballOff.y * H)); }
    homeX = CX; homeY = CY; if (roam.x || roam.y) roamApply();
    const want = Math.round(300 * densK);
    if (nodes.length !== want || shapeBuilt !== shape) { buildNetwork(want); pulses.length = 0; coreSectors = null; }
    if (started) try { frame(performance.now(), true); } catch (e) {}
  }
  let started = false;
  new ResizeObserver(resize).observe(stage);
  // Panel: Passt unten nicht mehr alles hin (flaches oder maximiertes Fenster, YouTube offen), gibt die Kugel-Fläche Höhe ab,
  // bis Antworten und Eingabe wieder ganz sichtbar sind; ist wieder Platz, wächst sie zurück
  let fitRaf = 0;
  function fitPanel() {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
      if (!expanded || freeLayout) { stage.style.flexBasis = ""; return; }
      const panel = document.querySelector(".panel"), tr = $("transcript");
      const natural = stage.parentElement.clientHeight * 0.42, cur = stage.offsetHeight;
      const over = panel.scrollHeight - panel.clientHeight, slack = over > 0 ? 0 : Math.max(0, tr.offsetHeight - 120);
      const target = Math.round(Math.max(140, Math.min(natural, cur - over + slack)));
      if (Math.abs(target - cur) > 2 && (over > 0 || stage.style.flexBasis)) stage.style.flexBasis = target >= natural - 1 ? "" : target + "px";
    });
  }
  new ResizeObserver(fitPanel).observe(document.querySelector(".panel"));
  for (const id of ["sys", "yt", "tw", "log"]) new ResizeObserver(fitPanel).observe($(id));
  window.addEventListener("resize", fitPanel);

  let ay = 0, ax = 0.32, vy = 0, vx = 0, dragging = false, swing = 0;
  // Schauseite: Hexagon von vorn, Gehirn von der Seite
  const FACING = { hexagon: { y: 0, a: 0.4, x: 0.1 }, gehirn: { y: Math.PI / 2, a: 0.55, x: 0.12 }, muenze: { y: 0, a: 0.75, x: 0.05 }, stern: { y: 0, a: 0.45, x: 0.05 }, herz: { y: 0, a: 0.45, x: 0.05 } };
  function rot(x, y, z) {
    if (flat2d) return [x, y, z * 0.02]; // 2D: Form flach von vorn, ohne Drehung
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    return [x1, y2, z2];
  }
  function proj(p) { const f = 3 / (3 - p[2]); return [CX + p[0] * S * f, CY - p[1] * S * f, f]; }

  function drawRing(axis) {
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const p = axis === 0 ? rot(Math.cos(a) * 1.04, 0, Math.sin(a) * 1.04) : rot(0, Math.cos(a) * 1.04, Math.sin(a) * 1.04);
      const s = proj(p);
      if (prev && (p[2] > -0.2)) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(s[0], s[1]); }
      prev = s;
    }
    ctx.stroke();
  }

