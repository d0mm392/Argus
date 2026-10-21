"use strict";
  // ---------- Hirnregionen ----------
  const REGIONS = [
    { key: "hoer",    name: "Hörzentrum",        hue: 190, dir: [-0.85, 0.2, 0.48],  idle: "Lauscht auf Wake-Word" },
    { key: "verst",   name: "Sprachverständnis", hue: 168, dir: [0.1, 0.9, 0.42],    idle: "Leerlauf" },
    { key: "gedae",   name: "Gedächtnis",        hue: 38,  dir: [0.85, 0.25, -0.45], idle: "Konsolidiert Gespräche" },
    { key: "logik",   name: "Logik & Planung",   hue: 268, dir: [-0.3, 0.55, -0.78], idle: "Prüft offene Aufgaben" },
    { key: "wissen",  name: "Wissensabruf",      hue: 318, dir: [0.55, -0.6, 0.58],  idle: "Indexiert Wissen" },
    { key: "ausgabe", name: "Sprachausgabe",     hue: 142, dir: [-0.45, -0.85, -0.2], idle: "Bereit" },
    { key: "system",  name: "Systemwache",       hue: 200, dir: [0.15, -0.3, -0.95], idle: "Überwacht den PC" },
  ];
  const R = Object.fromEntries(REGIONS.map((r, i) => [r.key, i]));
  for (const r of REGIONS) {
    const l = Math.hypot(...r.dir); r.dir = r.dir.map((v) => v / l);
    r.act = 0; r.target = 0; r.task = r.idle; r.bump = 0;
  }
  let CORE_HUE = 210;

  // ---------- Neuronen ----------
  let nodes = [], edges = [], adj = [], regionNodes = [];
  // ---------- Formen: Kugel, Hexagon, Würfel, Kristall, Gehirn, Ring, DNA-Helix, Galaxie ----------
  let structK = 1, edgeK = 3, nodeK = 1, ballOn = true, statusOn = true, miniMore = false, look3dK = 0.35, structRings = [], structSkel = [];
  let flashK = 1, flat2d = false, shape = "kugel", shapeBuilt = "", shapeRim = true, glowK = 1, spinK = 1, densK = 1;
  const SHAPES = [["kugel", "Kugel"], ["hexagon", "Hexagon"], ["wuerfel", "Würfel"], ["kristall", "Kristall"], ["helix", "DNA-Helix"], ["galaxie", "Galaxie"], ["symbiont", "Symbiont"], ["muenze", "Bitcoin"], ["pyramide", "Pyramide"], ["atom", "Atom"], ["ikosaeder", "Ikosaeder"], ["stella", "Stern-Tetraeder"], ["knoten", "Torusknoten"], ["trapez", "Trapez"], ["parallelogramm", "Parallelogramm"], ["oktagon", "Oktagon"], ["diamant", "Diamant"], ["tornado", "Tornado"], ["stern", "Stern"], ["herz", "Herz"]];
  // Herz- und Sternumriss als Radius je Winkel (Tabelle), für Punkte und Umriss
  const HEART_R = (() => { const pts = []; for (let k = 0; k < 720; k++) { const t = (k / 720) * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); pts.push([x / 17, (y + 2.5) / 17]); }
    const tab = new Array(360).fill(0); for (const [x, y] of pts) { const a = Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360) % 360; tab[a] = Math.max(tab[a], Math.hypot(x, y)); }
    for (let i = 0; i < 360; i++) if (!tab[i]) tab[i] = tab[(i + 359) % 360] || tab[(i + 1) % 360]; return tab; })();
  const heartR = (th) => HEART_R[Math.round(((th * 180 / Math.PI) + 360) % 360) % 360] * 0.95;
  const STAR_V = Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.4 : 0.98; return [Math.cos(a) * r, Math.sin(a) * r]; });
  function starR(th) { // Abstand vom Mittelpunkt bis zum Sternrand in Richtung th
    const dx = Math.cos(th), dy = Math.sin(th); let best = 1;
    for (let k = 0; k < 10; k++) { const [ax, ay2] = STAR_V[k], [bx, by] = STAR_V[(k + 1) % 10], ex = bx - ax, ey = by - ay2, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ey - ay2 * ex) / den, u = (ax * dy - ay2 * dx) / den; if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t); }
    return best;
  }
  // Pyramide: Grundfläche unten, Spitze oben (Halbräume)
  const PYR = [[0, -1, 0, 0.62], ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, c]) => { const n = [a * 1.6, 0.85, c * 1.6], l = Math.hypot(...n); return [n[0] / l, n[1] / l, n[2] / l, 0.85 * 0.95 / l]; })];
  // Symbiont (wie Venom): schwarze, glänzende Masse, die ständig ihre Form ändert und Ranken ausstreckt.
  // Je mehr los ist (CPU-Last, Argus hört zu/denkt/spricht), desto unruhiger wird sie und desto mehr Ranken bildet sie.
  let symAg = 0.3; // geglättete Unruhe 0..1.5
  let symPh = 0; // Phase des Waberns (aufsummiert)
  // Ranken: je laufendem Prozess eine (Richtung fest je Name, Länge nach CPU-Last, Spitze in der Programmfarbe),
  // dazu zwei „eigenwillige“, die sich von selbst irgendwohin strecken, und eine, die nach dem Mauszeiger greift
  const symTen = new Map(); // key -> { a, len, want, w, hue, own }
  const symLobe = [0.07, 0.05, 0.035, 0.02].map((v) => ({ v, base: v, want: v })); // Grundform wandert langsam (Laune)
  let symWillT = 0, symStrikeT = 1, symStrikeN = 0;
  const nameAngle = (n) => { let h = 2166136261; for (const c of n) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 3600) / 3600 * Math.PI * 2; };
  function symUpdate(dt) {
    // Prozesse: die fünf mit der meisten CPU-Last formen die Masse
    const live = new Set();
    for (const p of (sys.top || []).filter((x) => x.cpu >= 1).slice(0, 5)) {
      const k = "p:" + p.name.toLowerCase(); live.add(k);
      let t = symTen.get(k); if (!t) symTen.set(k, (t = { a: nameAngle(p.name), len: 0, w: 0.06, hue: appHue(p.name.replace(/\.exe$/i, "")) }));
      t.want = Math.min(0.6, 0.05 + Math.sqrt(p.cpu / 100) * 0.65);
    }
    // Eigener Wille: alle paar Sekunden neue Laune, zwei Ranken suchen sich eine neue Richtung
    symWillT -= dt;
    if (symWillT <= 0) {
      symWillT = 3 + Math.random() * 6 / (0.6 + symAg);
      // immer von der Grundgröße aus, sonst schaukelt sich die Laune über Stunden auf (Blütenblätter quer durch die Mitte)
      for (const L of symLobe) L.want = L.base * (0.4 + Math.random() * 1.4);
      for (const j of [0, 1]) { const k = "w:" + j; let t = symTen.get(k); if (!t) symTen.set(k, (t = { a: Math.random() * 6.283, len: 0, w: 0.07, own: true }));
        t.target = t.a + (Math.random() - 0.5) * 2.4; t.want = Math.random() < 0.35 ? 0 : (0.1 + Math.random() * 0.3) * (0.6 + symAg); }
    }
    live.add("w:0"); live.add("w:1");
    // Angriff: dünne Peitschen schnellen blitzartig heraus, halten kurz und ziehen sich zurück, je unruhiger desto öfter
    symStrikeT -= dt;
    if (symStrikeT <= 0) {
      symStrikeT = (0.5 + Math.random() * 2.2) / (0.5 + symAg);
      const k = "s:" + (symStrikeN++ % 4); let t = symTen.get(k); if (!t) symTen.set(k, (t = { a: 0, len: 0, w: 0.04 }));
      if (t.len < 0.05) t.a = Math.random() * 6.283; // erst neu zielen, wenn sie eingezogen ist
      t.target = t.a + (Math.random() - 0.5) * 0.5; t.w = 0.03 + Math.random() * 0.03; t.want = (0.25 + Math.random() * 0.45) * (0.7 + symAg * 0.5); t.hold = 0.12 + Math.random() * 0.35; t.strike = true;
    }
    for (const [key, t] of symTen) if (t.strike) { live.add(key); if (t.len > t.want * 0.85 && (t.hold -= dt) <= 0) { t.want = 0; t.strike = false; } }
    // Greift nach dem Mauszeiger, wenn er in der Nähe außerhalb der Masse ist
    if (cursor && shape === "symbiont") {
      const r = canvas.getBoundingClientRect(), dx = cursor.x - r.left - CX, dy = cursor.y - r.top - CY, d = Math.hypot(dx, dy) / S;
      if (d > 0.95 && d < 2.4) { let t = symTen.get("m"); if (!t) symTen.set("m", (t = { a: Math.atan2(dy, dx), len: 0, w: 0.09 })); t.target = Math.atan2(dy, dx); t.want = Math.min(0.7, d - 0.85); live.add("m"); }
    }
    const k = 1 - Math.exp(-dt * 1.6), kOut = 1 - Math.exp(-dt * 11), kIn = 1 - Math.exp(-dt * 3.2);
    for (const [key, t] of symTen) {
      if (!live.has(key)) t.want = 0;
      if (t.target != null) t.a += Math.atan2(Math.sin(t.target - t.a), Math.cos(t.target - t.a)) * (1 - Math.exp(-dt * (key === "m" ? 4 : 0.7)));
      t.a += Math.sin(time * 0.4 + t.a * 3) * dt * 0.05; // leichtes Schlängeln
      t.len += (t.want - t.len) * (key[0] === "s" ? (t.want > t.len ? kOut : kIn) : k);
      if (t.len < 0.004 && !live.has(key)) symTen.delete(key);
    }
    for (const L of symLobe) L.v += (L.want - L.v) * (1 - Math.exp(-dt * 1.1));
  }
  function symR(th, t) { // Radius des Umrisses in Richtung th (Bildebene), in Vielfachen von S
    const ag = 0.7 + symAg * 0.6, [l2, l3, l5, l8] = symLobe.map((L) => L.v);
    let r = 0.84 + ag * (l2 * Math.sin(2 * th + t * 0.7) + l3 * Math.sin(3 * th - t * 1.1 + 1.3) + l5 * Math.sin(5 * th + t * 1.7 + 2.1) + l8 * Math.sin(8 * th - t * 2.3)
      + 0.011 * Math.sin(13 * th + t * 3.1) + 0.006 * Math.sin(21 * th - t * 4.7 + 0.8)); // feine, schnell wandernde Zacken auf der Oberfläche
    for (const k of symTen.values()) {
      if (k.len < 0.004) continue;
      const d = Math.atan2(Math.sin(th - k.a), Math.cos(th - k.a)), pulse = 1 + 0.12 * Math.sin(t * 2.3 + k.a * 5);
      r += k.len * pulse * Math.exp(-((d / k.w) ** 2)) + k.len * 0.35 * Math.exp(-((d / (k.w * 2.8)) ** 2)); // spitze Ranke mit breiterem Ansatz
    }
    return Math.max(0.6, Math.min(1.9, r));
  }
  // Großhirn: zwei Hälften mit Spalt, gefurcht (Windungen), Schläfenlappen reicht tiefer
  function brainPoint([x, y, z], sh) {
    const th = Math.atan2(z, x), ph = Math.acos(Math.max(-1, Math.min(1, y)));
    const g = 1 + 0.11 * Math.sin(th * 9 + ph * 5) * Math.sin(ph * 7 - th * 3);
    const floor = z > -0.35 && z < 0.55 ? -0.6 : -0.38;
    let px = x * 0.68 * g, py = Math.max(floor, y * 0.6 * g), pz = z * 0.98 * g;
    if (py > -0.25) px += Math.sign(px || 1) * 0.08; // Längsspalt zwischen den Hälften
    return [px * sh, py * sh + 0.12, pz * sh];
  }
  const SHAPES2D = new Set(["stern", "herz"]); // gibt es nur im 2D-Modus
  // Bildet eine Richtung (Einheitsvektor) und Tiefe (0..1) auf einen Punkt in der gewählten Form ab
  function shapePoint(d, rad, i, n) {
    const [x, y, z] = d, R = Math.random;
    switch (shape) {
      case "hexagon": { // sechseckiges Prisma, Stirnseite zum Betrachter
        const th = Math.atan2(y, x), seg = Math.PI / 3, a = 0.9 * Math.cos(Math.PI / 6);
        const rh = a / Math.cos(((th % seg) + seg) % seg - seg / 2), rho = Math.hypot(x, y) || 1e-6;
        const t = Math.min(rh / rho, 0.42 / (Math.abs(z) || 1e-6));
        return [x * t * rad, y * t * rad, z * t * rad];
      }
      case "wuerfel": { const t = 0.78 / Math.max(Math.abs(x), Math.abs(y), Math.abs(z)); return [x * t * rad, y * t * rad, z * t * rad]; }
      case "kristall": { const t = 1 / (Math.abs(x) + Math.abs(y) / 1.25 + Math.abs(z)); return [x * t * rad, y * t * rad, z * t * rad]; }
      case "gehirn": {
        const k = i / n;
        if (k < 0.1) { // Kleinhirn hinten unten
          return [x * 0.42 * rad, -0.5 + y * 0.2 * rad, -0.55 + z * 0.28 * rad];
        }
        if (k < 0.14) { // Hirnstamm
          const t = R(); return [(R() - 0.5) * 0.12, -0.45 - t * 0.5, -0.3 - t * 0.1 + (R() - 0.5) * 0.1];
        }
        return brainPoint(d, 0.72 + 0.28 * Math.pow(rad, 0.4)); // Neuronen eher an der Rinde
      }
      case "ring": {
        const th = Math.atan2(z, x), ph = R() * Math.PI * 2, rr = 0.24 * Math.sqrt(R());
        return [(0.66 + rr * Math.cos(ph)) * Math.cos(th), rr * Math.sin(ph), (0.66 + rr * Math.cos(ph)) * Math.sin(th)];
      }
      case "helix": {
        const t = (i / n) * 2 - 1, strand = i % 3, ang = t * Math.PI * 3.2;
        if (strand === 2) { const u = R(); const a1 = [Math.cos(ang) * 0.45, Math.sin(ang) * 0.45], a2 = [Math.cos(ang + Math.PI) * 0.45, Math.sin(ang + Math.PI) * 0.45]; return [a1[0] + (a2[0] - a1[0]) * u, t * 0.98, a1[1] + (a2[1] - a1[1]) * u]; }
        const o = strand * Math.PI; return [Math.cos(ang + o) * 0.45 + (R() - 0.5) * 0.05, t * 0.98, Math.sin(ang + o) * 0.45 + (R() - 0.5) * 0.05];
      }
      case "galaxie": {
        const r = Math.pow(R(), 0.7) * 0.95, arm = (i % 3) * (Math.PI * 2 / 3), th = arm + r * 4.2 + (R() - 0.5) * 0.5;
        if (i % 7 === 0) { const b = 0.18 * Math.cbrt(R()); return [x * b, y * b * 0.7, z * b]; } // Kern
        { const gx = Math.cos(th) * r, gy = (R() - 0.5) * 0.14 * (1 - r), gz = Math.sin(th) * r, ca = 0.82, sa = 0.57; return [gx, gy * ca - gz * sa, gy * sa + gz * ca]; } // Scheibe leicht zum Betrachter gekippt
      }
      case "muenze": { // Münze: flache Scheibe zum Betrachter, das ₿ zeichnet drawCoin darauf
        const rho = Math.hypot(x, y) || 1e-6, t = Math.min(0.92 / rho, 0.1 / (Math.abs(z) || 1e-6)); return [x * t * rad, y * t * rad, z * t * rad];
      }
      case "pyramide": { let t = 9; for (const [a, b, c, dd] of PYR) { const dot = a * x + b * y + c * z; if (dot > 1e-6) t = Math.min(t, dd / dot); } return [x * t * rad, y * t * rad, z * t * rad]; }
      case "stern": { const th = Math.atan2(y, x), rho = Math.hypot(x, y) || 1e-6, t = Math.min(starR(th) / rho, 0.26 / (Math.abs(z) || 1e-6)); return [x * t * rad, y * t * rad, z * t * rad]; }
      case "herz": { const th = Math.atan2(y, x), rho = Math.hypot(x, y) || 1e-6, t = Math.min(heartR(th) / rho, 0.32 / (Math.abs(z) || 1e-6)); return [x * t * rad, y * t * rad, z * t * rad]; }
      case "atom": { // Kern plus drei gekippte Elektronenbahnen
        if (i % 4 === 0) { const b = 0.26 * Math.cbrt(R()); return [x * b, y * b, z * b]; }
        const k = i % 3, a = R() * Math.PI * 2, rr = 0.9 + (R() - 0.5) * 0.05, px = Math.cos(a) * rr, pz = Math.sin(a) * rr * 0.32, tilt = k * Math.PI / 3;
        return [px * Math.cos(tilt) - pz * Math.sin(tilt) * 0, (R() - 0.5) * 0.03 + px * Math.sin(tilt), pz + (R() - 0.5) * 0.03];
      }
      case "ikosaeder": case "trapez": case "parallelogramm": case "oktagon": case "diamant": { const t = solidR(shape, x, y, z) * 0.97, rr = Math.pow(rad, 0.6); return [x * t * rr, y * t * rr, z * t * rr]; }
      case "tornado": { // offener Wirbel: Spiralarme um eine Achse, oben weit, unten spitz
        if (i % 9 === 0) { const t = R(); return [(R() - 0.5) * 0.08, -0.95 + t * 1.9, (R() - 0.5) * 0.08]; }
        const t = Math.pow(R(), 0.85), arm = i % 3, ang = t * 13 + arm * 2.094 + (R() - 0.5) * 0.35, rr = (0.05 + 0.86 * Math.pow(t, 1.35)) * (0.45 + 0.5 * R()); // innerhalb des sichtbaren Trichters
        return [Math.cos(ang) * rr, -0.95 + t * 1.9, Math.sin(ang) * rr]; }
      case "stella": { const t = solidR("stella", x, y, z) * 0.97, rr = Math.pow(rad, 0.6); return [x * t * rr, y * t * rr, z * t * rr]; }
      case "knoten": { const t = R() * Math.PI * 2, k0 = 0.3, c = [(2 + Math.cos(3 * t)) * Math.cos(2 * t) * k0, Math.sin(3 * t) * k0 * 1.15, (2 + Math.cos(3 * t)) * Math.sin(2 * t) * k0], rr = 0.12 * Math.sqrt(R()), a = R() * Math.PI * 2;
        return [c[0] + rr * Math.cos(a) * 0.9, c[1] + rr * Math.sin(a), c[2] + rr * Math.sin(a * 1.7) * 0.9]; }
      case "tropfen": { const sN = Math.pow(R(), 0.8), y = -0.72 + sN * 1.7, rp = Math.sin(Math.PI * Math.pow(sN, 0.72)) * 0.56 * (1 - 0.15 * sN) * 0.85, a = R() * Math.PI * 2, q = Math.sqrt(R()); return [rp * q * Math.cos(a), y, rp * q * Math.sin(a)]; }
      default: return [x * rad, y * rad, z * rad];
    }
  }
  // Bitcoin-Münze: ₿ auf der Vorderseite, schrumpft beim Drehen mit (wirkt wie eine echte Münze)
  function drawCoin() {
    const c = Math.cos(ay), w = Math.abs(c); if (w < 0.08) return;
    ctx.save(); ctx.translate(CX, CY); ctx.scale(c, 1); ctx.font = `700 ${Math.round(S * 1.05)}px Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = `hsla(${stateHue},90%,62%,${0.16 + 0.14 * w})`; ctx.shadowColor = `hsla(${stateHue},90%,60%,0.7)`; ctx.shadowBlur = S * 0.08; ctx.fillText("₿", 0, S * 0.04);
    ctx.lineWidth = Math.max(1, S * 0.012); ctx.strokeStyle = `hsla(${stateHue},90%,70%,${0.25 + 0.2 * w})`; ctx.beginPath(); ctx.arc(0, 0, S * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // Umriss der Form als konvexe Hülle der projizierten Neuronen (für den dunklen Untergrund)
  let hull = null, sharp = false;
  // Eckpunkte der kantigen Formen, damit der Umriss wirklich sechseckig, würfelig usw. ist
  const CORNERS = (() => {
    const hex = [], cube = [], m = 0.94;
    for (let k = 0; k < 6; k++) for (const z of [-0.42, 0.42]) hex.push([0.9 * Math.cos(k * Math.PI / 3) * m, 0.9 * Math.sin(k * Math.PI / 3) * m, z * m]);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cube.push([x * 0.78 * m, y * 0.78 * m, z * 0.78 * m]);
    const cry = [[m, 0, 0], [-m, 0, 0], [0, 1.25 * m, 0], [0, -1.25 * m, 0], [0, 0, m], [0, 0, -m]];
    const pyr = [[0, 0.85 * m, 0], ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [a * 0.62 * m, -0.62 * m, c * 0.62 * m])];
    return { hexagon: hex, wuerfel: cube, kristall: cry, pyramide: pyr };
  })();
  // Gehirnwindungen als feine Linien auf der Oberfläche
  let folds = [];
  // Struktur der Form: Kanten (Hexagon, Würfel, Kristall, Pyramide) oder Längen-/Breitenkreise auf der Oberfläche (alle anderen)
  function buildStructure() {
    structRings = []; structSkel = [];
    if (shape === "symbiont" || shape === "muenze" || shape === "atom" || shape === "ring" || SOLID_SHAPES.has(shape) && !CORNERS[shape] && !flat2d) return;
    const cv = CORNERS[shape];
    if (cv) {
      let md = Infinity; for (let i = 0; i < cv.length; i++) for (let j = i + 1; j < cv.length; j++) md = Math.min(md, Math.hypot(cv[i][0] - cv[j][0], cv[i][1] - cv[j][1], cv[i][2] - cv[j][2]));
      for (let i = 0; i < cv.length; i++) for (let j = i + 1; j < cv.length; j++) if (Math.hypot(cv[i][0] - cv[j][0], cv[i][1] - cv[j][1], cv[i][2] - cv[j][2]) <= md * 1.06) structSkel.push([cv[i], cv[j]]);
      return;
    }
    const pt = (d) => { try { const p = shapePoint(d, 0.93, 0, 1); return p.every(Number.isFinite) ? p : null; } catch { return null; } };
    for (const lat of [-0.6, -0.2, 0.2, 0.6]) { const line = []; const cl = Math.sqrt(1 - lat * lat); for (let u = 0; u <= 48; u++) { const a = u / 48 * Math.PI * 2, p = pt([Math.cos(a) * cl, lat, Math.sin(a) * cl]); if (p) line.push(p); } if (line.length > 8) structRings.push(line); }
    for (let k = 0; k < 6; k++) { const line = [], lon = k / 6 * Math.PI; for (let u = 0; u <= 48; u++) { const a = u / 48 * Math.PI * 2 - Math.PI / 2 + Math.PI, p = pt([Math.cos(a) * Math.cos(lon), Math.sin(a), Math.cos(a) * Math.sin(lon)]); if (p) line.push(p); } if (line.length > 8) structRings.push(line); }
  }
  function drawStructure() {
    if (structK <= 0.01 || (!structRings.length && !structSkel.length)) return;
    ctx.save(); ctx.lineWidth = Math.max(0.6, S / 230 * (0.6 + structK * 0.5)); ctx.strokeStyle = `hsla(${stateHue},75%,72%,${Math.min(0.75, 0.14 * structK)})`;
    for (const line of structRings) { ctx.beginPath(); for (let i = 0; i < line.length; i++) { const q = proj(rot(...line[i])); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
    if (structSkel.length) { ctx.lineWidth *= 1.6; ctx.strokeStyle = `hsla(${stateHue},80%,75%,${Math.min(0.85, 0.28 * structK)})`; ctx.beginPath(); for (const [a, b] of structSkel) { const p = proj(rot(...a)), q = proj(rot(...b)); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke(); }
    ctx.restore();
  }
  function buildFolds() {
    folds = []; buildStructure();
    if (shape !== "gehirn") return;
    for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
      const line = [];
      for (let u = 0; u <= 1.0001; u += 0.025) {
        const a = -0.15 * Math.PI + u * 1.2 * Math.PI, lat = side * (0.12 + k * 0.13 + 0.05 * Math.sin(u * 23 + k * 2.1));
        let d = [lat, Math.sin(a) * (1 - Math.abs(lat) * 0.6), Math.cos(a)]; const l = Math.hypot(...d); d = d.map((v) => v / l);
        line.push(brainPoint(d, 1.02));
      }
      folds.push(line);
    }
    // seitliche Furche (Sylvische Furche)
    for (const side of [-1, 1]) {
      const line = [];
      for (let u = 0; u <= 1.0001; u += 0.05) { let d = [side * 0.9, -0.15 + u * 0.35, 0.55 - u * 0.9]; const l = Math.hypot(...d); line.push(brainPoint(d.map((v) => v / l), 1.02)); }
      folds.push(line);
    }
  }
  function drawFolds() {
    if (!folds.length) return;
    ctx.lineWidth = 1; ctx.strokeStyle = `hsla(${stateHue},70%,75%,0.26)`;
    for (const line of folds) {
      ctx.beginPath();
      line.forEach((v, i) => { const q = proj(rot(...v)); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
    }
  }
  function computeHull() {
    if (shape === "symbiont") { symMeshUpdate(); return; } // Umriss aus dem 3D-Netz (02b-koerper.js)
    if (OPEN_SHAPES.has(shape)) { hull = null; sharp = false; return; } // offene Formen: kein dunkler Untergrund
    if (shape === "stern" || shape === "herz") { // nicht konvex: Umriss direkt aus der Vorderseite der Form
      sharp = shape === "stern"; hull = [];
      const pts = shape === "stern" ? STAR_V.map(([x, y]) => [x * 1.08, y * 1.08]) : Array.from({ length: 72 }, (_, k) => { const th = (k / 72) * Math.PI * 2, r = heartR(th) * 1.08; return [Math.cos(th) * r, Math.sin(th) * r]; });
      for (const [x, y] of pts) { const q = proj(rot(x, y, 0)); hull.push([q[0], q[1]]); }
      return;
    }
    if (SOLID_SHAPES.has(shape) && !flat2d) { solidHull(); return; } // Umriss aus dem 3D-Körper selbst, nicht aus der Punktwolke (sonst bleibt eine runde Scheibe darin)
    if (shape === "kugel" || shape === "atom" || !nodes.length) { hull = null; return; }
    const cv = CORNERS[shape];
    sharp = !!cv;
    const src = cv ? cv.map((v) => { const q = proj(rot(...v)); return [q[0], q[1]]; }) : nodes.filter((n) => !n.stem).map((n) => [n.sx, n.sy]);
    const pts = src.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const h = lo.slice(0, -1).concat(up.slice(0, -1));
    const cx = h.reduce((a, p) => a + p[0], 0) / h.length, cy = h.reduce((a, p) => a + p[1], 0) / h.length, pad = cv ? S * 0.06 : Math.max(8, S * 0.08);
    hull = h.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * pad, y + dy / l * pad]; });
  }
  function outlinePath() {
    ctx.beginPath();
    if (!hull) { ctx.arc(CX, CY, S * 1.08, 0, Math.PI * 2); return; }
    // weich gerundete Ecken
    const n = hull.length;
    if (sharp) { hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); return; }
    for (let i = 0; i < n; i++) {
      const a = hull[i], b = hull[(i + 1) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a[0], a[1], mx, my);
    }
    const a = hull[0], b = hull[1 % n]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    ctx.closePath();
  }
  function buildNetwork(n) {
    nodes = []; edges = []; adj = []; shapeBuilt = shape; buildFolds();
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - ((i + 0.5) / n) * 2, rr = Math.sqrt(1 - y * y), phi = i * golden;
      let d = [Math.cos(phi) * rr + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.15, Math.sin(phi) * rr + (Math.random() - 0.5) * 0.15];
      const l = Math.hypot(...d); d = d.map((v) => v / l);
      const rad = 0.28 + 0.66 * Math.pow(Math.random(), 0.55);
      let best = -1, bestDot = 0.62;
      REGIONS.forEach((r, ri) => { const dt = d[0] * r.dir[0] + d[1] * r.dir[1] + d[2] * r.dir[2]; if (dt > bestDot) { bestDot = dt; best = ri; } });
      const sp = shapePoint(d, rad, i, n);
      nodes.push({ i: nodes.length, x: sp[0], y: sp[1], z: sp[2], region: best, flash: 0, near: 0, sx: 0, sy: 0, sz: 0, f: 1, stem: shape === "gehirn" && i / n >= 0.1 && i / n < 0.14, d, rad: rad * 0.86 });
      adj.push([]);
    }
    regionNodes = REGIONS.map((_, ri) => nodes.map((nd, i) => (nd.region === ri ? i : -1)).filter((i) => i >= 0));
    // Mittelpunkt jeder Region in der Form, damit die Beschriftungslinie dort ansetzt
    REGIONS.forEach((r, ri) => { const l = regionNodes[ri]; r.cen = l.length ? [0, 1, 2].map((k) => l.reduce((a, i) => a + [nodes[i].x, nodes[i].y, nodes[i].z][k], 0) / l.length) : r.dir.map((v) => v * 0.72); });
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const a = nodes[i], dists = [];
      for (let j = 0; j < n; j++) if (j !== i) {
        const b = nodes[j]; dists.push([(a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2, j]);
      }
      dists.sort((p, q) => p[0] - q[0]);
      for (let k = 0; k < edgeK && k < dists.length; k++) {
        const j = dists[k][1], key = i < j ? i + "-" + j : j + "-" + i;
        if (seen.has(key)) continue;
        seen.add(key); edges.push([i, j]); adj[i].push(j); adj[j].push(i);
      }
    }
  }

  const pulses = [];
  function hueOf(node) { if (orbMine) { const h = minerHue(node.i ?? 0); if (h != null) return h; } return node.region >= 0 ? REGIONS[node.region].hue : CORE_HUE; }
  function actOf(node) { if (orbMine && fmTotC) { const h = minerHue(node.i ?? 0); return h === 4 ? 0.75 + 0.25 * Math.sin(time * 4 + (node.i ?? 0)) : h === 38 ? 0.5 : 0.22; } return node.region >= 0 ? REGIONS[node.region].act : coreAct; }
  function spawnFrom(i, hue) {
    if (pulses.length > 650) return;
    const nb = adj[i]; if (!nb.length) return;
    const j = nb[(Math.random() * nb.length) | 0];
    pulses.push({ a: i, b: j, t: 0, speed: 0.45 + Math.random() * 0.5, hue: hue ?? hueOf(nodes[i]) });
  }

