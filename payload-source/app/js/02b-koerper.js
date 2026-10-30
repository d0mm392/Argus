"use strict";
// Körper: schattierte 3D-Flächen für Würfel, Hexagon, Kristall, Pyramide, Ring (Torus), Ikosaeder, Stern-Tetraeder, Torusknoten, Tropfen,
// dazu der Symbiont als echte 3D-Masse (Netz aus Flächen, das ständig wabert). Alles läuft auf Canvas 2D ohne WebGL.
  const SOLID_SHAPES = new Set(["wuerfel", "hexagon", "kristall", "pyramide", "ring", "ikosaeder", "stella", "knoten", "tropfen", "trapez", "parallelogramm", "oktagon", "diamant", "tornado"]);
  const OPEN_SHAPES = new Set(["ring", "helix", "galaxie", "atom", "knoten"]); // offene Formen: kein dunkler Untergrund, nur Hof
  const LIGHT = (() => { const l = Math.hypot(-0.45, 0.6, 0.66); return [-0.45 / l, 0.6 / l, 0.66 / l]; })();
  const HALF = (() => { const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], l = Math.hypot(...h); return [h[0] / l, h[1] / l, h[2] / l]; })(); // Halbvektor für den Glanz (Blick entlang z)
  const solidCache = {};
  // Netz bauen: v = Punkte, c = Bezugspunkt je Punkt (Innenseite), f = Flächen (Indexlisten); die Windung wird danach nach außen ausgerichtet
  function makeMesh(v, f, c, smooth) {
    const cc = c || v.map(() => [0, 0, 0]), sg = new Int8Array(f.length);
    f.forEach((face, k) => {
      let nx = 0, ny = 0, nz = 0, mx = 0, my = 0, mz = 0;
      for (let i = 0; i < face.length; i++) { const a = v[face[i]], b = v[face[(i + 1) % face.length]]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); const q = v[face[i]], r = cc[face[i]]; mx += q[0] - r[0]; my += q[1] - r[1]; mz += q[2] - r[2]; }
      sg[k] = nx * mx + ny * my + nz * mz >= 0 ? 1 : -1;
    });
    return { v, f, sg, smooth: !!smooth, vx: new Float32Array(v.length), vy: new Float32Array(v.length), vz: new Float32Array(v.length), sx: new Float32Array(v.length), sy: new Float32Array(v.length) };
  }
  const tri = (a, b, c) => [a, b, c];
  // Gerades Prisma über einem Vieleck (xy), Tiefe ±d in z, Stirnseite zum Betrachter
  function extrude(poly, d) {
    const n = poly.length, v = []; for (const [x, y] of poly) v.push([x, y, -d]); for (const [x, y] of poly) v.push([x, y, d]);
    const f = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n + i)];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, n + j, n + i]); }
    return makeMesh(v, f);
  }
  // Ebenen eines konvexen Körpers (nach außen), damit die Punktwolke seinen ganzen Raum füllt statt nur eine Kugel darin
  const planeCache = {};
  function solidPlanes(sh) {
    if (planeCache[sh]) return planeCache[sh];
    const m = solidCache[sh] || (solidCache[sh] = buildSolid(sh)); if (!m) return (planeCache[sh] = []);
    const out = [];
    for (const face of m.f) {
      let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < face.length; i++) { const a = m.v[face[i]], b = m.v[face[(i + 1) % face.length]]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); cx += a[0]; cy += a[1]; cz += a[2]; }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; const k = face.length; cx /= k; cy /= k; cz /= k;
      let h = nx * cx + ny * cy + nz * cz; if (h < 0) { nx = -nx; ny = -ny; nz = -nz; h = -h; }
      out.push([nx, ny, nz, h]);
    }
    return (planeCache[sh] = out);
  }
  // Abstand von der Mitte bis zur Oberfläche in Richtung (x, y, z)
  function stellaR(x, y, z) { // Vereinigung zweier Tetraeder um die Mitte: jeweils der größere Abstand
    let best = 0; const q = 1 / Math.sqrt(3), h = 0.82 * 1.7320508 / 3;
    for (const sg of [1, -1]) { let t = 9; for (const [a, b, c] of [[-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]]) { const dot = sg * (a * x + b * y + c * z) * q; if (dot > 1e-6) t = Math.min(t, h / dot); } best = Math.max(best, t); }
    return best;
  }
  function solidR(sh, x, y, z) { if (sh === "stella") return stellaR(x, y, z); let t = 9; for (const [a, b, c, h] of solidPlanes(sh)) { const dot = a * x + b * y + c * z; if (dot > 1e-6) t = Math.min(t, h / dot); } return t; }
  function buildSolid(sh) {
    switch (sh) {
      case "wuerfel": { const m = 0.78 * 0.94, v = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * m, y * m, z * m]);
        const id = (x, y, z) => (x > 0 ? 4 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 1 : 0), f = [];
        for (const s of [-1, 1]) { f.push([id(s, -1, -1), id(s, 1, -1), id(s, 1, 1), id(s, -1, 1)], [id(-1, s, -1), id(1, s, -1), id(1, s, 1), id(-1, s, 1)], [id(-1, -1, s), id(1, -1, s), id(1, 1, s), id(-1, 1, s)]); }
        return makeMesh(v, f); }
      case "hexagon": { const v = CORNERS.hexagon, f = [[0, 2, 4, 6, 8, 10], [1, 3, 5, 7, 9, 11]]; for (let k = 0; k < 6; k++) { const a = 2 * k, b = 2 * ((k + 1) % 6); f.push([a, b, b + 1, a + 1]); } return makeMesh(v, f); }
      case "kristall": { const v = CORNERS.kristall, f = []; for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) f.push(tri(x, y, z)); return makeMesh(v, f); }
      case "pyramide": { const v = CORNERS.pyramide, f = [[1, 2, 3, 4]]; for (let k = 1; k <= 4; k++) f.push(tri(0, k, k % 4 + 1)); return makeMesh(v, f); }
      case "ikosaeder": { const p = (1 + Math.sqrt(5)) / 2, raw = []; for (const a of [-1, 1]) for (const b of [-p, p]) raw.push([0, a, b], [a, b, 0], [b, 0, a]);
        const l = Math.hypot(1, p), v = raw.map((q) => q.map((x) => x / l * 0.95)), e = 2 / l * 0.95, f = [], d = (i, j) => Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]);
        for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (Math.abs(d(i, j) - e) < 1e-3 && Math.abs(d(j, k) - e) < 1e-3 && Math.abs(d(i, k) - e) < 1e-3) f.push([i, j, k]);
        return makeMesh(v, f); }
      case "trapez": return extrude([[-0.92, -0.62], [0.92, -0.62], [0.5, 0.62], [-0.5, 0.62]], 0.42);
      case "parallelogramm": return extrude([[-0.95, -0.58], [0.4, -0.58], [0.95, 0.58], [-0.4, 0.58]], 0.42);
      case "oktagon": return extrude(Array.from({ length: 8 }, (_, i) => { const a = (i + 0.5) / 8 * Math.PI * 2; return [Math.cos(a) * 0.9, Math.sin(a) * 0.9]; }), 0.4);
      case "diamant": { // Brillantschliff: Tafel oben, Krone, Rundiste, spitze Unterseite
        const v = [], N = 8; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; v.push([Math.cos(a) * 0.46, 0.62, Math.sin(a) * 0.46]); }
        for (let i = 0; i < N; i++) { const a = (i + 0.5) / N * Math.PI * 2; v.push([Math.cos(a) * 0.92, 0.2, Math.sin(a) * 0.92]); }
        v.push([0, -0.95, 0]); const f = [Array.from({ length: N }, (_, i) => i)];
        for (let i = 0; i < N; i++) { const b = (i + 1) % N, gi = N + i, gp = N + (i + N - 1) % N; f.push([i, b, gi], [i, gi, gp]); f.push([gi, N + (i + 1) % N, 2 * N]); }
        return makeMesh(v, f); }
      case "stella": { const m = 0.82, A = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((q) => q.map((x) => x * m)), B = A.map((q) => q.map((x) => -x)), v = A.concat(B), f = [];
        for (const o of [0, 4]) for (let k = 0; k < 4; k++) f.push([0, 1, 2, 3].filter((i) => i !== k).map((i) => i + o));
        return makeMesh(v, f); }
      case "ring": { const U = 40, V = 16, R = 0.66, r = 0.24, v = [], c = [], f = [];
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) { const a = i / U * Math.PI * 2, b = j / V * Math.PI * 2, q = R + r * Math.cos(b); v.push([q * Math.cos(a), r * Math.sin(b), q * Math.sin(a)]); c.push([R * Math.cos(a), 0, R * Math.sin(a)]); }
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) f.push([i * V + j, ((i + 1) % U) * V + j, ((i + 1) % U) * V + (j + 1) % V, i * V + (j + 1) % V]);
        return makeMesh(v, f, c, true); }
      case "knoten": { const U = 150, V = 10, k0 = 0.3, rr = 0.15, C = (t) => [(2 + Math.cos(3 * t)) * Math.cos(2 * t) * k0, Math.sin(3 * t) * k0 * 1.15, (2 + Math.cos(3 * t)) * Math.sin(2 * t) * k0];
        const v = [], c = [], f = [];
        for (let i = 0; i < U; i++) {
          const t = i / U * Math.PI * 2, p = C(t), q = C(t + 0.01), w = C(t - 0.01), T = [q[0] - w[0], q[1] - w[1], q[2] - w[2]], tl = Math.hypot(...T) || 1; T[0] /= tl; T[1] /= tl; T[2] /= tl;
          // Hilfsrichtung: Weg von der Mitte, davon den Tangentenanteil abziehen (stabile Rohrachse ohne Verdrehen)
          const up = [p[0], 0.0001, p[2]], ud = up[0] * T[0] + up[1] * T[1] + up[2] * T[2], N = [up[0] - ud * T[0], up[1] - ud * T[1], up[2] - ud * T[2]], nl = Math.hypot(...N) || 1; N[0] /= nl; N[1] /= nl; N[2] /= nl;
          const Bn = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
          for (let j = 0; j < V; j++) { const b = j / V * Math.PI * 2, cb = Math.cos(b) * rr, sb = Math.sin(b) * rr; v.push([p[0] + N[0] * cb + Bn[0] * sb, p[1] + N[1] * cb + Bn[1] * sb, p[2] + N[2] * cb + Bn[2] * sb]); c.push(p); }
        }
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) f.push([i * V + j, ((i + 1) % U) * V + j, ((i + 1) % U) * V + (j + 1) % V, i * V + (j + 1) % V]);
        return makeMesh(v, f, c, true); }
      case "tornado": { const U = 30, V = 40, v = [], c = [], f = [];
        for (let i = 0; i <= U; i++) { const s = i / U, y = -0.95 + s * 1.9, r = 0.05 + 0.86 * Math.pow(s, 1.35); for (let j = 0; j < V; j++) { const a = j / V * Math.PI * 2 + s * 5; v.push([r * Math.cos(a), y, r * Math.sin(a)]); c.push([0, y, 0]); } }
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) f.push([i * V + j, (i + 1) * V + j, (i + 1) * V + (j + 1) % V, i * V + (j + 1) % V]);
        return makeMesh(v, f, c, true); }
      case "tropfen": { const U = 28, V = 36, v = [], c = [], f = [], prof = (s) => { const y = -0.72 + s * 1.7, k = s; return [y, Math.sin(Math.PI * Math.pow(k, 0.72)) * 0.56 * (1 - 0.15 * k)]; };
        for (let i = 0; i <= U; i++) { const [y, r] = prof(i / U); for (let j = 0; j < V; j++) { const a = j / V * Math.PI * 2; v.push([r * Math.cos(a), y, r * Math.sin(a)]); c.push([0, y, 0]); } }
        for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) f.push([i * V + j, (i + 1) * V + j, (i + 1) * V + (j + 1) % V, i * V + (j + 1) % V]);
        return makeMesh(v, f, c, true); }
    }
    return null;
  }
  // Gemeinsamer Teil: Netz drehen, projizieren, Flächennormalen (Blickraum) und Tiefe bestimmen
  function meshView(m) {
    const n = m.v.length;
    for (let i = 0; i < n; i++) { const p = rot(m.v[i][0], m.v[i][1], m.v[i][2]), s = proj(p); m.vx[i] = p[0]; m.vy[i] = p[1]; m.vz[i] = p[2]; m.sx[i] = s[0]; m.sy[i] = s[1]; }
  }
  function faceNormal(m, face, out) {
    let nx = 0, ny = 0, nz = 0, z = 0;
    for (let i = 0; i < face.length; i++) { const a = face[i], b = face[(i + 1) % face.length]; nx += (m.vy[a] - m.vy[b]) * (m.vz[a] + m.vz[b]); ny += (m.vz[a] - m.vz[b]) * (m.vx[a] + m.vx[b]); nz += (m.vx[a] - m.vx[b]) * (m.vy[a] + m.vy[b]); z += m.vz[a]; }
    const l = Math.hypot(nx, ny, nz) || 1; out[0] = nx / l; out[1] = ny / l; out[2] = nz / l; return z / face.length;
  }
  // Umriss eines Glaskörpers: konvexe Hülle seiner projizierten Ecken
  function solidHull() {
    const m = solidCache[shape] || (solidCache[shape] = buildSolid(shape)); if (!m) { hull = null; return; }
    meshView(m);
    const pts = []; for (let i = 0; i < m.sx.length; i++) pts.push([m.sx[i], m.sy[i]]);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const h = lo.slice(0, -1).concat(up.slice(0, -1)), cx = h.reduce((a, p) => a + p[0], 0) / h.length, cy = h.reduce((a, p) => a + p[1], 0) / h.length, pad = S * 0.015;
    sharp = true; hull = h.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * pad, y + dy / l * pad]; });
  }
  // Glasartige Körper: alle Flächen von hinten nach vorn, tönen in der Zustandsfarbe, Kanten hell
  const _n = [0, 0, 0];
  function drawSolid() {
    const m = solidCache[shape] || (solidCache[shape] = buildSolid(shape)); if (!m) return;
    meshView(m);
    const nf = m.f.length, zs = new Float32Array(nf), order = new Array(nf), nrm = new Float32Array(nf * 3);
    for (let k = 0; k < nf; k++) { zs[k] = faceNormal(m, m.f[k], _n); const s = m.sg[k]; nrm[k * 3] = _n[0] * s; nrm[k * 3 + 1] = _n[1] * s; nrm[k * 3 + 2] = _n[2] * s; order[k] = k; }
    order.sort((a, b) => zs[a] - zs[b]);
    ctx.save(); ctx.lineJoin = "round"; ctx.lineWidth = Math.max(0.7, S / 160);
    for (const k of order) {
      const nx = nrm[k * 3], ny = nrm[k * 3 + 1], nz = nrm[k * 3 + 2], front = nz > 0, face = m.f[k];
      const diff = Math.abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]), sp = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), m.smooth ? 30 : 18);
      const l = 12 + 34 * diff + 34 * sp * (front ? 1 : 0.3), a = front ? 0.34 + 0.22 * sp : 0.1 + 0.05 * diff;
      ctx.beginPath(); for (let i = 0; i < face.length; i++) { const q = face[i]; if (i) ctx.lineTo(m.sx[q], m.sy[q]); else ctx.moveTo(m.sx[q], m.sy[q]); } ctx.closePath();
      ctx.fillStyle = `hsla(${stateHue},72%,${l.toFixed(1)}%,${a.toFixed(3)})`; ctx.fill();
      ctx.strokeStyle = m.smooth ? `hsla(${stateHue},72%,${l.toFixed(1)}%,${(a * 0.7).toFixed(3)})` : `hsla(${stateHue},85%,${front ? 78 : 62}%,${front ? 0.55 : 0.2})`; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Symbiont in 3D ----------
  let symMesh = null, symLiteBuilt = null;
  function symBuild() {
    const NL = lite ? 26 : 40, NM = lite ? 40 : 60, d = [], f = [];
    for (let i = 0; i <= NL; i++) { const ph = (i / NL) * Math.PI; for (let j = 0; j < NM; j++) { const th = (j / NM) * Math.PI * 2; d.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]); } }
    for (let i = 0; i < NL; i++) for (let j = 0; j < NM; j++) f.push([i * NM + j, (i + 1) * NM + j, (i + 1) * NM + (j + 1) % NM, i * NM + (j + 1) % NM]);
    const m = makeMesh(d.map((q) => q.slice()), f); m.d = d; m.nx = new Float32Array(d.length); m.ny = new Float32Array(d.length); m.nz = new Float32Array(d.length); m.bins = new Float32Array(120);
    m.NL = NL; m.NM = NM; m.rr = new Float32Array(d.length); m.smooth = true; symLiteBuilt = !!lite; return m;
  }
  const _tent = [];
  function symMeshUpdate() {
    if (!symMesh || symLiteBuilt !== !!lite) symMesh = symBuild();
    const m = symMesh, n = m.d.length, t = time, ag = 0.7 + symAg * 0.6, [l2, l3, l5, l8] = symLobe.map((L) => L.v);
    // Ranken im Blickraum (folgen dem Mauszeiger und bleiben beim Drehen am Bildschirm): Richtung aus dem Winkel, Höhe aus Name/Winkel
    _tent.length = 0;
    for (const k of symTen.values()) {
      if (k.len < 0.004) continue;
      const e = 0.75 * Math.sin(k.a * 3.1 + (k.hue || 0) * 0.05) + 0.2 * Math.sin(t * 0.3 + k.a), ce = Math.cos(e), pulse = 1 + 0.12 * Math.sin(t * 2.3 + k.a * 5);
      _tent.push({ dx: Math.cos(k.a) * ce, dy: -Math.sin(k.a) * ce, dz: Math.sin(e) * 0.8 + 0.2, len: k.len * pulse, w: Math.max(0.17, k.w * 2.6), hue: k.hue, k });
    }
    for (const q of _tent) { const l = Math.hypot(q.dx, q.dy, q.dz); q.dx /= l; q.dy /= l; q.dz /= l; }
    for (let i = 0; i < n; i++) {
      const [x, y, z] = m.d[i], pv = rot(x, y, z); // pv = Richtung im Blickraum (Einheitsvektor)
      let r = 0.84 + ag * 1.7 * (l2 * Math.sin(2.3 * x + 1.7 * y + t * 0.7) * Math.sin(2.1 * z - 1.3 * y - t * 0.5) + l3 * Math.sin(3.1 * y + 1.2 * z - t * 1.1 + 1.3) * Math.sin(2.7 * x + t * 0.9)
        + l5 * Math.sin(4.7 * x + 3.9 * z + t * 1.7 + 2.1) * Math.sin(4.1 * y - t * 1.3) + l8 * Math.sin(7.3 * (x + y + z) - t * 2.3)) + ag * 0.1 * Math.sin(2.4 * x + 1.5 * Math.sin(1.7 * y + t * 0.55) + t * 0.45) * Math.sin(2 * z + 1.3 * Math.sin(1.9 * x - t * 0.4)) + 0.006 * Math.sin(13 * x + 11 * z + t * 3.1) + 0.003 * Math.sin(21 * y - t * 4.7 + 0.8); // zähflüssiges Fließen statt feinem Zittern
      for (const q of _tent) {
        const dot = pv[0] * q.dx + pv[1] * q.dy + pv[2] * q.dz; if (dot < 0.6) continue;
        const ang = Math.acos(Math.min(1, dot)), w = q.w;
        r += q.len * Math.exp(-((ang / w) ** 2)) + q.len * 0.35 * Math.exp(-((ang / (w * 2.8)) ** 2));
      }
      r = Math.max(0.6, Math.min(1.9, r)); m.rr[i] = r;
      m.v[i][0] = x * r; m.v[i][1] = y * r; m.v[i][2] = z * r;
    }
    meshView(m);
    // Eckennormalen (Blickraum) für weiches Schattieren, Umriss aus der Silhouette (größter Abstand je Winkel)
    m.nx.fill(0); m.ny.fill(0); m.nz.fill(0);
    const nf = m.f.length, nrm = new Float32Array(nf * 3), zs = new Float32Array(nf);
    for (let k = 0; k < nf; k++) { zs[k] = faceNormal(m, m.f[k], _n); nrm[k * 3] = _n[0]; nrm[k * 3 + 1] = _n[1]; nrm[k * 3 + 2] = _n[2]; for (const q of m.f[k]) { m.nx[q] += _n[0]; m.ny[q] += _n[1]; m.nz[q] += _n[2]; } }
    if (m.flip == null) { // einmal bestimmen: zeigt die Windung nach außen?
      const k = Math.floor(nf / 2), c = m.f[k], p = c[0]; m.flip = (nrm[k * 3] * m.vx[p] + nrm[k * 3 + 1] * m.vy[p] + nrm[k * 3 + 2] * m.vz[p]) >= 0 ? 1 : -1;
    }
    m.nrm = nrm; m.zs = zs;
    const B = m.bins.length; m.bins.fill(0);
    for (let i = 0; i < n; i++) { const dx = m.sx[i] - CX, dy = m.sy[i] - CY, b = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * B) % B, r = Math.hypot(dx, dy); if (r > m.bins[b]) m.bins[b] = r; }
    const sm = new Float32Array(B); for (let b = 0; b < B; b++) sm[b] = Math.max(m.bins[b], m.bins[(b + 1) % B] * 0.97, m.bins[(b + B - 1) % B] * 0.97, S * 0.5);
    sharp = false; hull = [];
    for (let b = 0; b < B; b++) { const a = ((b + 0.5) / B) * Math.PI * 2 - Math.PI, r = sm[b] + S * 0.015; hull.push([CX + Math.cos(a) * r, CY + Math.sin(a) * r]); }
  }
  const hslRgb = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; };
  // Radius der Masse in Richtung (x,y,z) (Einheitsvektor): so füllen die Neuronen die Form aus und wandern mit ihr
  function symRadiusAt(x, y, z) {
    const m = symMesh; if (!m || !m.rr) return 0.84;
    const fi = Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI * m.NL, th = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2), fj = th / (Math.PI * 2) * m.NM;
    const i0 = Math.min(m.NL - 1, Math.floor(fi)), j0 = Math.floor(fj) % m.NM, j1 = (j0 + 1) % m.NM, a = fi - i0, b = fj - Math.floor(fj), R = m.rr, NM = m.NM;
    return (R[i0 * NM + j0] * (1 - b) + R[i0 * NM + j1] * b) * (1 - a) + (R[(i0 + 1) * NM + j0] * (1 - b) + R[(i0 + 1) * NM + j1] * b) * a;
  }
  // Tropfende Fäden: unten an der Masse wachsen dünne Fäden mit Tropfen, lösen sich, fallen und ziehen sich zurück (rein zeitgesteuert, ohne Zustand)
  const DRIP_A = [0.36, 0.43, 0.5, 0.57, 0.64, 0.71].map((v) => v * Math.PI);
  function drawDrips(m) {
    const B = m.bins.length, t = time, nd = lite ? 3 : DRIP_A.length, ag = 0.7 + symAg * 0.5;
    ctx.save(); ctx.lineCap = "round";
    for (let k = 0; k < nd; k++) {
      const a = DRIP_A[lite ? k * 2 : k] + 0.05 * Math.sin(t * 0.3 + k), bi = Math.floor(((a + Math.PI) / (Math.PI * 2)) * B) % B, r = m.bins[bi] * 0.95, ax = CX + Math.cos(a) * r, ay = CY + Math.sin(a) * r;
      const T = 5.5 + k * 0.9, u = ((t + k * 2.3) % T) / T, Lmax = S * (0.11 + 0.045 * ((k * 7) % 3)) * ag;
      let len = 0, dropY = null, al = 1;
      if (u < 0.6) len = Lmax * (1 - Math.pow(1 - u / 0.6, 2.2));
      else if (u < 0.75) len = Lmax * (1 + 0.02 * Math.sin(t * 9 + k));
      else { const v = (u - 0.75) / 0.25; len = Lmax * Math.max(0, 1 - v * 5); dropY = ay + Lmax + S * 2.2 * v * v; al = 1 - v; }
      if (len > 1) {
        const w0 = S * 0.024, w1 = S * 0.0065;
        ctx.fillStyle = "rgb(7,9,16)"; ctx.beginPath(); ctx.moveTo(ax - w0, ay - 3); ctx.quadraticCurveTo(ax - w1 * 1.2, ay + len * 0.45, ax - w1, ay + len); ctx.lineTo(ax + w1, ay + len); ctx.quadraticCurveTo(ax + w1 * 1.2, ay + len * 0.45, ax + w0, ay - 3); ctx.closePath(); ctx.fill();
        if (u < 0.75) { ctx.beginPath(); ctx.arc(ax, ay + len, S * 0.0135 * (0.8 + 0.5 * Math.min(1, u / 0.6)), 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = `rgba(190,215,255,${0.35 * Math.min(1, len / (S * 0.05))})`; ctx.lineWidth = Math.max(0.8, S * 0.0035); ctx.beginPath(); ctx.moveTo(ax - w1 * 0.9, ay + len * 0.15); ctx.lineTo(ax - w1 * 0.5, ay + len * 0.85); ctx.stroke();
      }
      if (dropY != null && al > 0.02) { ctx.globalAlpha = al; ctx.fillStyle = "rgb(7,9,16)"; ctx.beginPath(); ctx.ellipse(ax, dropY, S * 0.011, S * 0.016, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(200,220,255,0.55)"; ctx.beginPath(); ctx.arc(ax - S * 0.004, dropY - S * 0.005, S * 0.0035, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
    ctx.restore();
  }
  function drawSymbiont() {
    const m = symMesh; if (!m || !m.nrm) return;
    const nf = m.f.length, order = []; const flip = m.flip;
    for (let k = 0; k < nf; k++) if (m.nrm[k * 3 + 2] * flip > -0.02) order.push(k);
    order.sort((a, b) => m.zs[a] - m.zs[b]);
    const rim = hslRgb(stateHue, 85, 58), rimK = 0.38 + 0.35 * symAg;
    if (hull && hull.length) { ctx.save(); ctx.filter = `blur(${Math.max(1, S * 0.022).toFixed(1)}px)`; ctx.fillStyle = "rgba(4,6,12,0.55)"; outlinePath(); ctx.fill(); ctx.restore(); } // weicher Rand wie zähe Masse
    drawDrips(m);
    ctx.save(); ctx.lineJoin = "round"; ctx.lineWidth = Math.max(0.8, S / 140);
    for (const k of order) {
      const face = m.f[k]; let nx = 0, ny = 0, nz = 0; for (const q of face) { nx += m.nx[q]; ny += m.ny[q]; nz += m.nz[q]; }
      const l = (Math.hypot(nx, ny, nz) || 1) * flip; nx /= l; ny /= l; nz /= l;
      const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]), sp = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 9), sp2 = Math.pow(Math.max(0, nx * 0.7 - ny * 0.2 - nz * 0.3), 10) * 0.25,
        rm = Math.pow(1 - Math.max(0, nz), 2.1) * rimK, sh = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 3) * 0.12, base = 3 + diff * 12 + sh * 30; // weiche, nasse Glanzflächen
      const sp3 = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 28), r = Math.min(255, base + sp * 58 + sp3 * 150 + sp2 * 30 + rim[0] * rm * 0.55), g = Math.min(255, base + 1 + sp * 66 + sp3 * 160 + sp2 * 40 + rim[1] * rm * 0.55), b = Math.min(255, base + 3 + sp * 84 + sp3 * 190 + sp2 * 60 + rim[2] * rm * 0.55); // nasser Glanzpunkt
      const col = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.beginPath(); for (let i = 0; i < face.length; i++) { const q = face[i]; if (i) ctx.lineTo(m.sx[q], m.sy[q]); else ctx.moveTo(m.sx[q], m.sy[q]); } ctx.closePath();
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // Spitzen der Prozess-Ranken leuchten in der Farbe ihres Programms
    for (const q of _tent) {
      if (q.hue == null || q.len < 0.05) continue;
      const P = proj([q.dx * (0.84 + q.len * 0.95), q.dy * (0.84 + q.len * 0.95), q.dz * (0.84 + q.len * 0.95)]), x = P[0], y = P[1], g = ctx.createRadialGradient(x, y, 0, x, y, S * 0.07);
      g.addColorStop(0, `hsla(${q.hue},90%,65%,${Math.min(0.8, q.len * 1.6)})`); g.addColorStop(1, `hsla(${q.hue},90%,55%,0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, S * 0.07, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.lineWidth = Math.max(1, S * 0.012); ctx.strokeStyle = `hsla(${stateHue},70%,70%,${0.18 + symAg * 0.2})`;
    ctx.shadowColor = `hsla(${stateHue},90%,60%,0.7)`; ctx.shadowBlur = S * 0.07 * (0.5 + symAg); outlinePath(); ctx.stroke(); ctx.restore();
  }
