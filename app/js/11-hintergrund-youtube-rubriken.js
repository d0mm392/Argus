"use strict";
  // ---------- Bewegter Hintergrund im Panel: Partikel, Sterne oder das Wetter am Standort ----------
  // Sparsam: 30 Bilder/s, Leuchtpunkte als vorgerenderte Bildchen (kein shadowBlur), Pause bei zugeklapptem Panel, verstecktem Fenster und Spielmodus
  const dotSprite = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c; })();
  const blobSprite = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })();
  // Welche Szene: im Wetter-Modus aus dem WMO-Code (Regen, Schnee, Gewitter, Nebel, Wolken, klar Tag/Nacht)
  function bgKind() {
    if (bg.mode !== "wetter") return bg.mode;
    const c = wxData?.data?.cur?.code, day = wxData?.data?.cur?.day !== false;
    if (c == null) return "partikel";
    if (c >= 95) return "gewitter"; if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "schnee";
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "regen"; if (c === 45 || c === 48) return "nebel";
    if (c === 2 || c === 3) return "wolken"; return day ? "sonne" : "sterne";
  }
  // Farbe des Hintergrunds: Zustandsfarbe, fester Farbton oder wandernder Regenbogen
  function bgHue(t) { const m = bg.hueMode; if (m === "bunt") return Math.round((t * 14) % 360); if (m === "custom") return bg.hueN; if (m !== "auto") return +m; return Math.round(CORE_HUE); }
  function bgBuild() {
    const k = bgKind(), A = bg.w * bg.h / 1e6, n = (base) => Math.round(Math.min(400, base * A * bg.amt * (lite ? 0.5 : 1)));
    const rnd = Math.random; bg.kind = k; bg.parts = [];
    const P = (o) => bg.parts.push(o);
    if (k === "partikel" || k === "sonne") for (let i = 0; i < n(70); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, r: 2 + rnd() * 5, vx: (rnd() - 0.5) * 8, vy: -2 - rnd() * 8, ph: rnd() * 6.3, sp: 0.4 + rnd() });
    if (k === "sterne") for (let i = 0; i < n(110); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, r: 1 + rnd() * 3.2, ph: rnd() * 6.3, sp: 0.3 + rnd() * 1.5 });
    if (k === "regen" || k === "gewitter") for (let i = 0; i < n(k === "gewitter" ? 160 : 120); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, l: 8 + rnd() * 14, v: 380 + rnd() * 260 });
    if (k === "schnee") for (let i = 0; i < n(90); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, r: 2 + rnd() * 4, v: 18 + rnd() * 30, ph: rnd() * 6.3 });
    if (k === "nordlicht") for (let i = 0; i < 3 + Math.round(bg.amt); i++) P({ y: 0.12 + rnd() * 0.35, amp: 0.04 + rnd() * 0.07, f: 1.5 + rnd() * 2.5, sp: 0.08 + rnd() * 0.15, ph: rnd() * 6.3, hue: [140, 165, 190, 280][i % 4] + rnd() * 20, th: 0.18 + rnd() * 0.22 });
    if (k === "netz") for (let i = 0; i < Math.min(90, n(55)); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, vx: (rnd() - 0.5) * 22, vy: (rnd() - 0.5) * 22, r: 2 + rnd() * 2.5 });
    if (k === "hash") { const cw = 17; for (let x = cw / 2; x < bg.w; x += cw / Math.min(1.5, bg.amt)) if (rnd() < 0.55 * Math.min(1, bg.amt)) P({ x, y: rnd() * bg.h, v: 40 + rnd() * 90, len: 6 + Math.floor(rnd() * 12), ch: Array.from({ length: 18 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]), sw: 0 }); }
    if (k === "gluehw") for (let i = 0; i < n(40); i++) P({ x: rnd() * bg.w, y: (0.3 + rnd() * 0.7) * bg.h, a: rnd() * 6.3, v: 8 + rnd() * 16, ph: rnd() * 6.3, sp: 0.5 + rnd() * 1.2, r: 3 + rnd() * 4 });
    if (k === "funken") for (let i = 0; i < n(60); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, r: 1.5 + rnd() * 3, vy: -14 - rnd() * 34, ph: rnd() * 6.3, sp: 0.8 + rnd() * 2 });
    if (k === "blasen") for (let i = 0; i < n(36); i++) P({ x: rnd() * bg.w, y: rnd() * bg.h, r: 4 + rnd() * 14, vy: -8 - rnd() * 22, ph: rnd() * 6.3 });
    if (k === "wellen") for (let i = 0; i < 4 + Math.round(bg.amt * 2); i++) P({ y: 0.25 + i * 0.12, amp: 0.025 + rnd() * 0.03, f: 1 + rnd() * 2, sp: 0.1 + rnd() * 0.15, ph: rnd() * 6.3 });
    if (k === "nebel" || k === "wolken") for (let i = 0; i < Math.max(4, n(k === "nebel" ? 9 : 6)); i++) P({ x: rnd() * bg.w, y: (k === "wolken" ? 0.05 + rnd() * 0.45 : rnd()) * bg.h, r: 120 + rnd() * 220, vx: 4 + rnd() * 8, a: 0.05 + rnd() * 0.07 });
  }
  function bgFrame(now) {
    bg.raf = 0;
    const live = bg.mode !== "aus" && expanded && !setOpen && !document.hidden && !(gameMode && sys?.fullscreen);
    bg.cv.classList.toggle("on", live);
    if (!live) return;
    bg.raf = requestAnimationFrame(bgFrame);
    if (now - bg.last < (window.videoBusy?.() ? 66 : lite ? 66 : performance.now() - lastAct > 8000 ? Math.max(33, 1000 / Math.min(fpsIdle, performance.now() - lastAct > 60000 ? 10 : 24)) : 33)) return; // 30 Bilder pro Sekunde reichen für so ruhige Bewegung, in Ruhe weniger
    const dt = Math.min(0.1, (now - (bg.last || now)) / 1000); bg.last = now;
    const w = bg.cv.clientWidth, h = bg.cv.clientHeight; if (!w || !h) return;
    if (w !== bg.w || h !== bg.h) { bg.w = bg.cv.width = w; bg.h = bg.cv.height = h; bgBuild(); } // Pixelzahl 1:1, nicht ×DPI: weicher Hintergrund braucht keine Schärfe
    if (bgKind() !== bg.kind) bgBuild();
    const g = bg.ctx, t = now / 1000, k = bg.kind, hue = bgHue(t), fx = bg.hueMode !== "auto", wind = Math.min(1, (wxData?.data?.cur?.wind || 8) / 40);
    g.clearRect(0, 0, w, h);
    if (k === "partikel" || k === "sonne") {
      g.globalCompositeOperation = "lighter";
      const col = k === "sonne" ? "hsl(42 95% 70%)" : `hsl(${hue} 85% 68%)`;
      for (const p of bg.parts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; } if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        g.globalAlpha = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph)); g.drawImage(tint(col), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    } else if (k === "sterne") {
      g.globalCompositeOperation = "lighter";
      for (const p of bg.parts) { g.globalAlpha = 0.08 + 0.32 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph)) ** 3; g.drawImage(tint(fx ? `hsl(${hue} 60% 90%)` : "hsl(210 60% 92%)"), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
      bg.shoots ||= []; // Sternschnuppen: Menge einstellbar (0 = keine)
      if (bg.mode === "sterne" && bgShoot > 0 && bg.shoots.length < 8 && Math.random() < dt * bgShoot / 25) bg.shoots.push({ x: Math.random() * w * 0.7, y: Math.random() * h * 0.4, l: 0 });
      for (let i = bg.shoots.length - 1; i >= 0; i--) { const s2 = bg.shoots[i]; s2.l += dt * 2.2; g.globalAlpha = Math.max(0, 0.5 * (1 - s2.l)); g.strokeStyle = "rgb(220,235,255)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s2.x + s2.l * 260, s2.y + s2.l * 90); g.lineTo(s2.x + s2.l * 260 - 60, s2.y + s2.l * 90 - 21); g.stroke(); if (s2.l >= 1) bg.shoots.splice(i, 1); }
    } else if (k === "regen" || k === "gewitter") {
      g.globalCompositeOperation = "source-over"; g.strokeStyle = "rgba(170,200,235,0.28)"; g.lineWidth = 1; g.beginPath();
      const sl = 0.15 + wind * 0.35;
      for (const p of bg.parts) { p.y += p.v * dt; p.x += p.v * sl * dt; if (p.y > h + 20) { p.y = -20; p.x = Math.random() * (w + 100) - 100; } if (p.x > w + 20) p.x -= w + 40; g.moveTo(p.x, p.y); g.lineTo(p.x - p.l * sl, p.y - p.l); }
      g.globalAlpha = 1; g.stroke();
      if (k === "gewitter") { if (bg.flash <= 0 && Math.random() < dt / 9) bg.flash = 1; if (bg.flash > 0) { g.globalAlpha = 0.16 * bg.flash * (Math.random() < 0.7 ? 1 : 0.3); g.fillStyle = "rgb(210,225,255)"; g.fillRect(0, 0, w, h); bg.flash -= dt * 2.5; } }
    } else if (k === "schnee") {
      g.globalCompositeOperation = "lighter";
      for (const p of bg.parts) { p.y += p.v * dt; p.x += (Math.sin(t * 0.8 + p.ph) * 14 + wind * 30) * dt; if (p.y > h + 8) { p.y = -8; p.x = Math.random() * w; } if (p.x > w + 8) p.x = -8; g.globalAlpha = 0.45; g.drawImage(tint(fx ? `hsl(${hue} 45% 94%)` : "hsl(210 40% 96%)"), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    } else if (k === "nordlicht") {
      // Lichtbänder: oben Kante, darunter weich ausblendender Vorhang, Wellen wandern langsam seitwärts
      g.globalCompositeOperation = "lighter";
      for (const b of bg.parts) {
        const y0 = b.y * h, ys = [], bh = fx ? hue + (b.hue % 60) - 30 : b.hue; for (let x = 0; x <= w + 24; x += 24) ys.push(y0 + h * b.amp * (Math.sin(x / w * b.f * 6.28 + t * b.sp * 6.28 + b.ph) + 0.5 * Math.sin(x / w * b.f * 13 - t * b.sp * 4 + b.ph * 2)));
        const gr = g.createLinearGradient(0, y0 - h * b.amp, 0, y0 + h * b.th); gr.addColorStop(0, `hsla(${bh},90%,65%,0)`); gr.addColorStop(0.15, `hsla(${bh},90%,62%,0.16)`); gr.addColorStop(1, `hsla(${bh + 30},80%,50%,0)`);
        g.fillStyle = gr; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.3 + b.ph); g.beginPath(); g.moveTo(0, ys[0]); ys.forEach((y, i) => g.lineTo(i * 24, y)); g.lineTo(w + 24, y0 + h * b.th + h * 0.1); g.lineTo(0, y0 + h * b.th + h * 0.1); g.closePath(); g.fill();
      }
    } else if (k === "netz") {
      // Knoten treiben und verbinden sich, wenn sie nah sind; Linien blenden mit dem Abstand aus
      g.globalCompositeOperation = "lighter"; const ps = bg.parts, R = 130, col = `hsl(${hue} 80% 65%)`;
      for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 0 || p.x > w) p.vx = -p.vx; if (p.y < 0 || p.y > h) p.vy = -p.vy; }
      g.strokeStyle = col; g.lineWidth = 0.8;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y, d2 = dx * dx + dy * dy; if (d2 < R * R) { g.globalAlpha = 0.22 * (1 - Math.sqrt(d2) / R); g.beginPath(); g.moveTo(ps[i].x, ps[i].y); g.lineTo(ps[j].x, ps[j].y); g.stroke(); } }
      g.globalAlpha = 0.5; for (const p of ps) g.drawImage(tint(col), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
    } else if (k === "hash") {
      // fallende Hex-Zeichen, Spitze hell, Schweif blasst aus; Zeichen wechseln ab und zu
      g.globalCompositeOperation = "source-over"; g.font = "600 13px Consolas, monospace"; g.textAlign = "center";
      for (const c of bg.parts) {
        c.y += c.v * dt; if (c.y - c.len * 15 > h) { c.y = -Math.random() * 80; c.v = 40 + Math.random() * 90; }
        if ((c.sw -= dt) <= 0) { c.sw = 0.08 + Math.random() * 0.3; c.ch[Math.floor(Math.random() * c.ch.length)] = "0123456789abcdef"[Math.floor(Math.random() * 16)]; }
        for (let i = 0; i < c.len; i++) { const y = c.y - i * 15; if (y < -15 || y > h + 15) continue; g.globalAlpha = i === 0 ? 0.55 : 0.32 * (1 - i / c.len); g.fillStyle = i === 0 ? `hsl(${hue} 60% 85%)` : `hsl(${hue} 85% 60%)`; g.fillText(c.ch[i % c.ch.length], c.x, y); }
      }
    } else if (k === "gluehw") {
      // Glühwürmchen: schwirren in Bögen, leuchten kurz auf und verlöschen wieder
      g.globalCompositeOperation = "lighter";
      for (const p of bg.parts) {
        p.a += (Math.sin(t * 0.7 + p.ph) * 1.2) * dt; p.x += Math.cos(p.a) * p.v * dt; p.y += Math.sin(p.a) * p.v * dt * 0.6;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10; if (p.y < h * 0.15) p.a = 0.6 + Math.random() * 1.9; else if (p.y > h + 10) p.a = -Math.abs(p.a);
        const bl = Math.max(0, Math.sin(t * p.sp + p.ph)) ** 4; if (bl < 0.02) continue;
        g.globalAlpha = 0.75 * bl; g.drawImage(tint(`hsl(${fx ? hue : 68} 95% 62%)`), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
      }
    } else if (k === "funken") {
      g.globalCompositeOperation = "lighter"; const fc = fx ? hue : 28;
      for (const p of bg.parts) { p.y += p.vy * dt; p.x += Math.sin(t * p.sp + p.ph) * 12 * dt; if (p.y < -8) { p.y = h + 8; p.x = Math.random() * w; } g.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * p.sp * 2 + p.ph)) * Math.min(1, p.y / (h * 0.5)); g.drawImage(tint(`hsl(${fc} 95% 58%)`), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4); }
    } else if (k === "blasen") {
      g.globalCompositeOperation = "lighter"; g.lineWidth = 1; g.strokeStyle = `hsl(${hue} 70% 75%)`;
      for (const p of bg.parts) { p.y += p.vy * dt; p.x += Math.sin(t * 0.9 + p.ph) * 9 * dt; if (p.y < -p.r) { p.y = h + p.r; p.x = Math.random() * w; } g.globalAlpha = 0.28; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.stroke(); g.globalAlpha = 0.5; g.drawImage(tint("hsl(0 0% 100%)"), p.x - p.r * 0.55, p.y - p.r * 0.6, p.r * 0.5, p.r * 0.5); }
    } else if (k === "wellen") {
      g.globalCompositeOperation = "lighter"; g.lineWidth = 1.6;
      for (let i = 0; i < bg.parts.length; i++) { const b = bg.parts[i]; g.strokeStyle = `hsl(${(hue + i * (fx ? 12 : 8)) % 360} 80% 62%)`; g.globalAlpha = 0.22; g.beginPath(); for (let x = 0; x <= w + 10; x += 10) { const y = b.y * h + h * b.amp * Math.sin(x / w * b.f * 6.28 + t * b.sp * 6.28 + b.ph) + h * b.amp * 0.5 * Math.sin(x / w * b.f * 15 - t * b.sp * 5); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    } else if (k === "nebel" || k === "wolken") {
      g.globalCompositeOperation = "source-over";
      for (const p of bg.parts) { p.x += p.vx * (0.5 + wind) * dt; if (p.x - p.r > w) p.x = -p.r; g.globalAlpha = p.a; g.drawImage(blobSprite, p.x - p.r, p.y - p.r * 0.55, p.r * 2, p.r * 1.1); }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }
  // eingefärbte Leuchtpunkte zwischenspeichern
  const tintCache = new Map();
  function tint(col) {
    let c = tintCache.get(col); if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
    g.drawImage(dotSprite, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, 32, 32);
    if (tintCache.size > 40) tintCache.clear(); tintCache.set(col, c); return c;
  }
  // Nach Absturz oder Neustart des Grafikprozesses (Treiber-Reset) sind die Zeichenflächen leer: neu aufsetzen
  window.jarvis.onGpuReset?.(() => { try { cancelAnimationFrame(bg.raf); } catch {} bg.raf = 0; bg.ctx = bg.cv.getContext("2d"); bg.w = bg.h = 0; bg.parts = []; bgKick(); window.dispatchEvent(new Event("resize")); });
  const bgKick = () => { if (!bg.raf) { bg.last = 0; bg.raf = requestAnimationFrame(bgFrame); } };
  setInterval(bgKick, 1000); document.addEventListener("visibilitychange", bgKick);
  // Zeilen mit data-bgfor erscheinen nur beim passenden Hintergrund (Regel: Optionen eines Hintergrunds nie bei anderen zeigen)
  const bgRows = () => { for (const r of document.querySelectorAll("[data-bgfor]")) { const f = r.dataset.bgfor; r.hidden = f.startsWith("not:") ? bg.mode === f.slice(4) : f === "custom" ? bg.hueMode !== "custom" || bg.mode === "aus" : f !== bg.mode; } };
  const bgSave = () => window.jarvis.setConfig({ bgFx: { mode: bg.mode, amount: bg.amt, hue: bg.hueMode, hueN: bg.hueN, alpha: bg.op } });
  const applyBg = () => { $("setBgFx").value = bg.mode; $("setBgAmt").value = bg.amt; $("setBgHue").value = bg.hueMode; $("setBgHueN").value = bg.hueN; $("setBgOp").value = bg.op; bg.cv.style.opacity = bg.op; bgRows(); bg.w = 0; bgKick(); };
  $("setBgFx").addEventListener("change", (e) => { bg.mode = e.target.value; applyBg(); bgSave(); });
  $("setBgHue").addEventListener("change", (e) => { bg.hueMode = e.target.value; applyBg(); bgSave(); });
  $("setBgOp").addEventListener("input", (e) => { bg.op = +e.target.value; bg.cv.style.opacity = bg.op; clearTimeout(bg.save); bg.save = setTimeout(bgSave, 400); });
  $("setBgHueN").addEventListener("input", (e) => { bg.hueN = +e.target.value; clearTimeout(bg.save); bg.save = setTimeout(bgSave, 400); });
  $("setBgAmt").addEventListener("input", (e) => { bg.amt = +e.target.value; bg.w = 0; clearTimeout(bg.save); bg.save = setTimeout(bgSave, 400); });
  window.jarvis.getConfig?.().then((c) => { bg.mode = c.bgFx?.mode || "partikel"; bg.amt = Math.max(0.3, Math.min(2, c.bgFx?.amount || 1)); bg.hueMode = c.bgFx?.hue || "auto"; bg.hueN = c.bgFx?.hueN ?? 210; bg.op = Math.max(0.1, Math.min(1, c.bgFx?.alpha ?? 1)); applyBg(); });

  // ---------- YouTube im Panel ----------
  let ytOn = false, ytSize = "m", ytLast = "", ytOffN = 0;
  const YT_W = { s: 0.5, m: 0.75, l: 1 };
  function ytSendPosition(element, visualSize = false) {
    const bounds=element.getBoundingClientRect(),width=visualSize?bounds.width:element.offsetWidth,height=visualSize?bounds.height:element.offsetHeight;
    const rect={x:bounds.x+bounds.width/2-width/2,y:bounds.y+bounds.height/2-height/2,width,height};
    const previous=ytLast&&ytLast!=="off"?ytLast.split(",").map(Number):null;
    if(!previous||previous.length!==4||Math.abs(previous[0]-rect.x)>3||Math.abs(previous[1]-rect.y)>3||Math.abs(previous[2]-rect.width)>3||Math.abs(previous[3]-rect.height)>3){ytLast=[rect.x,rect.y,rect.width,rect.height].map(Math.round).join();window.jarvis.ytRect(rect);}
  }
  function ytLayout() {
    if (!$("settings").hidden) {
      const preview=$("ytPreviewBody");
      if(ytOn&&expanded&&preview.offsetWidth>40&&preview.offsetHeight>40){ytOffN=0;ytSendPosition(preview,true);}
      else if(ytLast!=="off"){ytLast="off";window.jarvis.ytRect(null);}
      return;
    }
    // ausgeblendet oder (noch) ohne Größe: Video weg statt mit Nullmaßen irgendwo aufzuspringen
    if (!ytOn || !expanded || !$("settings").hidden || $("yt").classList.contains("gone") || $("yt").hidden || !$("yt").offsetWidth) { if (ytLast !== "off" && (!$("settings").hidden || ++ytOffN >= 3)) { ytLast = "off"; window.jarvis.ytRect(null); } return; } // Einstellungen offen: sofort weg (die Ansicht läge sonst über den Einstellungen); sonst erst nach 3 Takten // erst nach 3 Takten (~0,75 s) ausblenden: kurze Layoutsprünge sollen kein Flackern auslösen
    ytOffN = 0;
    const box = $("yt"), pw = document.querySelector(".panel").clientWidth - 28;
    // Teil des Panels: Breite nach Stufe, Höhe 16:9, darüber die Kopfzeile wie bei der Systemwache
    // höchstens ein Drittel der Fensterhöhe, damit Kugel und Chat sichtbar bleiben (auch im Vollbild)
    // nie so hoch, dass unten Antworten und Eingabe aus dem Fenster rutschen
    const maxH = Math.max(110, Math.min(window.innerHeight * { s: 0.2, m: 0.28, l: 0.38 }[ytSize], window.innerHeight - 470));
    let w = Math.round(Math.min(Math.max(200, Math.min(pw, pw * YT_W[ytSize])) - 20, maxH * 16 / 9)), bh = Math.round(w * 9 / 16);
    if (freeLayout?.yt) { const cs = getComputedStyle(box), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); w = Math.max(160, Math.floor(box.clientWidth - padX)); bh = Math.round(w * 9 / 16);
      // Rahmen niedriger gezogen als 16:9? Dann das Video verkleinern, statt unten aus dem Rahmen zu ragen
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), headH = $("ytBody").previousElementSibling?.offsetHeight || 18, gap = parseFloat(cs.rowGap) || 6;
      const availH = Math.floor(box.clientHeight - padY - headH - gap);
      if (availH >= 90 && bh > availH) { bh = availH; w = Math.round(bh * 16 / 9); } }
    $("ytBody").style.width = w + "px"; $("ytBody").style.height = bh + "px";
    // Gekippte Fenster (Tiefe/Neigung) verändern das gemessene Rechteck laufend: Größe aus der ungekippten Maßen, Mitte aus der Messung, und nur bei Änderung über 3 px neu melden (sonst flackert das Video)
    ytSendPosition($("ytBody"));
  }
  setInterval(ytLayout, 250); window.addEventListener("resize", ytLayout);
  window.jarvis.onYtEmbed?.((d) => { ytOn = !!d.on; window.videoEmbed = { ...window.videoEmbed, yt: ytOn }; $("yt").classList.toggle("on", ytOn); ytLast = ""; ytLayout(); });
  window.jarvis.onYtTitle?.((t) => { $("ytTitle").textContent = t || "YouTube"; });
  $("ytClose").addEventListener("click", () => window.jarvis.ytEmbed("close"));
  let ytVo = false;
  const applyYtVo = () => { $("yt").classList.toggle("vo", ytVo); $("ytVo").setAttribute("aria-pressed", String(ytVo)); ytLast = ""; ytLayout(); };
  $("ytVo").addEventListener("click", () => { ytVo = !ytVo; applyYtVo(); window.jarvis.setConfig({ ytVideoOnly: ytVo }); });
  window.jarvis.getConfig?.().then((c) => { ytVo = !!c.ytVideoOnly; applyYtVo(); });
  const ytResize = (d) => { const o = ["s", "m", "l"], i = Math.max(0, Math.min(2, o.indexOf(ytSize) + d)); ytSize = o[i]; ytLast = ""; ytLayout(); window.jarvis.setConfig({ ytEmbedSize: ytSize }); };
  $("ytSmaller").addEventListener("click", () => ytResize(-1)); $("ytBigger").addEventListener("click", () => ytResize(1));

  // ---------- Twitch im Panel (wie YouTube) ----------
  let twOn = false, twSize = "m", twLastKey = "", twOffN = 0;
  function twLayout() {
    const box = $("tw");
    if (!twOn || !expanded || !$("settings").hidden || box.classList.contains("gone") || box.hidden || !box.offsetWidth) { if (twLastKey !== "off" && (!$("settings").hidden || ++twOffN >= 3)) { twLastKey = "off"; window.jarvis.twRect(null); } return; }
    twOffN = 0;
    const pw = document.querySelector(".panel").clientWidth - 28;
    const maxH = Math.max(110, Math.min(window.innerHeight * { s: 0.2, m: 0.28, l: 0.38 }[twSize], window.innerHeight - 470));
    let w = Math.round(Math.min(Math.max(200, Math.min(pw, pw * YT_W[twSize])) - 20, maxH * 16 / 9)), bh = Math.round(w * 9 / 16);
    if (freeLayout?.tw) { const cs = getComputedStyle(box), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); w = Math.max(160, Math.floor(box.clientWidth - padX)); bh = Math.round(w * 9 / 16);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), headH = $("twBody").previousElementSibling?.offsetHeight || 18, gap = parseFloat(cs.rowGap) || 6;
      const availH = Math.floor(box.clientHeight - padY - headH - gap);
      if (availH >= 90 && bh > availH) { bh = availH; w = Math.round(bh * 16 / 9); } }
    $("twBody").style.width = w + "px"; $("twBody").style.height = bh + "px";
    // Gekippte Fenster (Tiefe/Neigung) verändern das gemessene Rechteck laufend: Größe aus der ungekippten Maßen, Mitte aus der Messung, und nur bei Änderung über 3 px neu melden (sonst flackert das Video)
    const b0 = $("twBody"), r0 = b0.getBoundingClientRect(), W0 = b0.offsetWidth, H0 = b0.offsetHeight, r = { x: r0.x + r0.width / 2 - W0 / 2, y: r0.y + r0.height / 2 - H0 / 2, width: W0, height: H0 };
    const pl = twLastKey && twLastKey !== "off" ? twLastKey.split(",").map(Number) : null;
    if (!pl || pl.length !== 4 || Math.abs(pl[0] - r.x) > 3 || Math.abs(pl[1] - r.y) > 3 || Math.abs(pl[2] - r.width) > 3 || Math.abs(pl[3] - r.height) > 3) { twLastKey = [r.x, r.y, r.width, r.height].map(Math.round).join(); window.jarvis.twRect({ x: r.x, y: r.y, width: r.width, height: r.height }); }
  }
  setInterval(twLayout, 250); window.addEventListener("resize", twLayout);
  window.jarvis.onTwEmbed?.((d) => { twOn = !!d.on; window.videoEmbed = { ...window.videoEmbed, tw: twOn }; $("tw").classList.toggle("on", twOn); twLastKey = ""; twLayout(); });
  window.jarvis.onTwTitle?.((t) => { $("twTitle").textContent = t || "Twitch"; });
  $("twClose").addEventListener("click", () => window.jarvis.twEmbed("close"));
  let twVo = false;
  const applyTwVo = () => { $("tw").classList.toggle("vo", twVo); $("twVo").setAttribute("aria-pressed", String(twVo)); twLastKey = ""; twLayout(); };
  $("twVo").addEventListener("click", () => { twVo = !twVo; applyTwVo(); window.jarvis.setConfig({ twVideoOnly: twVo }); });
  window.jarvis.getConfig?.().then((c) => { twVo = !!c.twVideoOnly; twSize = c.twEmbedSize || "m"; applyTwVo(); });
  $("twPop").addEventListener("click", () => window.jarvis.twEmbed("popout"));
  const twResize = (d) => { const o = ["s", "m", "l"], i = Math.max(0, Math.min(2, o.indexOf(twSize) + d)); twSize = o[i]; twLastKey = ""; twLayout(); window.jarvis.setConfig({ twEmbedSize: twSize }); };
  $("twSmaller").addEventListener("click", () => twResize(-1)); $("twBigger").addEventListener("click", () => twResize(1));
  $("twBtn").addEventListener("click", () => { if (twOn) window.jarvis.twEmbed("close"); else window.jarvis.openTwitch(""); });
  $("setFriendsOn").addEventListener("change", (e) => setFriendsOn(e.target.checked));
  window.jarvis.getConfig?.().then((c) => { $("setFriendsOn").checked = c.widgets?.friends?.on !== false; });
  $("setFriendsReset").addEventListener("click", () => { friendsBox = { w: 180, h: 0, scale: 1 }; applyFriendsBox(); window.jarvis.setConfig({ friendsBox }); });
  // ---------- Fensterfarbe ----------
  const WIN_PRESETS = [["Nachtblau", 219, 54, 5], ["Schwarz", 0, 0, 3], ["Graphit", 220, 8, 11], ["Lila", 270, 45, 8], ["Petrol", 190, 50, 7], ["Dunkelgrün", 150, 40, 6], ["Bordeaux", 350, 45, 8], ["Braun", 28, 35, 8]];
  function applyWinColor() {
    const h = winColor.follow ? CORE_HUE : winColor.h, st = document.documentElement.style;
    st.setProperty("--win-h", String(Math.round(h))); st.setProperty("--win-s", winColor.s + "%"); st.setProperty("--win-l", winColor.l + "%");
    document.querySelectorAll("#winSwatches button").forEach((b) => b.setAttribute("aria-pressed", String(!winColor.follow && +b.dataset.h === winColor.h && +b.dataset.s === winColor.s && +b.dataset.l === winColor.l)));
  }
  function syncWinInputs() { $("setWinFollow").checked = !!winColor.follow; $("setWinH").value = winColor.h; $("setWinS").value = winColor.s; $("setWinL").value = winColor.l; $("setWinH").disabled = !!winColor.follow; applyWinColor(); }
  const saveWin = () => window.jarvis.setConfig({ winColor });
  $("winSwatches").replaceChildren(...WIN_PRESETS.map(([name, h, sat, l]) => {
    const b = document.createElement("button"); b.type = "button"; b.title = name; Object.assign(b.dataset, { h, s: sat, l });
    b.style.background = `hsl(${h} ${sat}% ${Math.max(l + 10, 14)}%)`; b.style.boxShadow = "none"; b.style.outline = "1px solid rgba(255,255,255,0.25)";
    b.addEventListener("click", () => { winColor = { h, s: sat, l, follow: false }; syncWinInputs(); saveWin(); });
    return b;
  }));
  $("setWinFollow").addEventListener("change", (e) => { winColor.follow = e.target.checked; syncWinInputs(); saveWin(); });
  for (const [id, k] of [["setWinH", "h"], ["setWinS", "s"], ["setWinL", "l"]]) {
    $(id).addEventListener("input", (e) => { winColor[k] = +e.target.value; applyWinColor(); });
    $(id).addEventListener("change", saveWin);
  }
  // ---------- Einstellungen in Rubriken ----------
  // Rubriken oben, darin Abschnitte zum Auf- und Zuklappen (Stand wird gemerkt, anfangs ist nur der erste Abschnitt offen),
  // lange Erklärungen nur einzeilig (Klick zeigt alles), Suchfeld durchsucht alle Rubriken
  (function buildTabs() {
    const body = document.querySelector(".set-body"), names = [], secs = [];
    let cur = null, sec = null;
    for (const el of [...body.children]) {
      if (el.tagName === "H4") { cur = window.argusSettingsCategories.section(el.textContent, el.dataset.tab || cur); sec = { h: el, key: el.textContent, items: [], tab: cur || "Kugel und Farbe" }; secs.push(sec); }
      else if (sec) sec.items.push(el);
      el.dataset.in = cur || "Kugel und Farbe";
      if (!names.includes(el.dataset.in)) names.push(el.dataset.in);
      if (el.classList.contains("set-note") && !el.id) { el.classList.add("clamp"); el.title = "Klick: ganzen Hinweis zeigen"; el.addEventListener("click", () => el.classList.toggle("open")); }
    }
    let open = {}; try { open = JSON.parse(localStorage.getItem("jarvisSetOpen") || "{}"); } catch {}
    const firstOf = {}; for (const x of secs) firstOf[x.tab] ??= x.key;
    const isOpen = (x) => open[x.key] ?? firstOf[x.tab] === x.key;
    const ORDER = window.argusSettingsCategories.order;
    names.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    let sel = ORDER[0], q = ""; try { sel = localStorage.getItem("jarvisSetTab") || sel; } catch {}
    if (!names.includes(sel)) sel = names[0];
    const render = () => {
      const s2 = q.trim().toLowerCase();
      for (const x of secs) {
        const hHit = !!s2 && x.h.textContent.toLowerCase().includes(s2), hits = x.items.map((el) => !s2 || hHit || (el.textContent + " " + (el.dataset.tip || "") + " " + (el.title || "")).toLowerCase().includes(s2));
        const anyHit = hHit || hits.some(Boolean), inTab = s2 ? anyHit : x.tab === sel, op = s2 ? true : isOpen(x);
        x.h.classList.toggle("tab-hidden", !inTab); x.h.classList.toggle("closed", !op); x.h.setAttribute("aria-expanded", String(op));
        x.items.forEach((el, k) => el.classList.toggle("tab-hidden", !inTab || !op || !hits[k]));
      }
      for (const b of $("setTabs").children) b.setAttribute("aria-selected", String(!s2 && b.dataset.tab === sel));
    };
    const show = (n) => { sel = n; q = ""; $("setFind").value = ""; try { localStorage.setItem("jarvisSetTab", n); } catch {} render(); body.scrollTop = 0; };
    for (const x of secs) x.h.addEventListener("click", () => { if (q) return; open[x.key] = !isOpen(x); try { localStorage.setItem("jarvisSetOpen", JSON.stringify(open)); } catch {} render(); });
    for (const x of secs) { x.h.tabIndex = 0; x.h.setAttribute("role", "button"); x.h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); x.h.click(); } }); }
    $("setTabs").addEventListener("keydown", e => {
      const buttons = [...$("setTabs").querySelectorAll("button")], i = buttons.indexOf(document.activeElement);
      const j = e.key === "ArrowRight" ? (i + 1) % buttons.length : e.key === "ArrowLeft" ? (i + buttons.length - 1) % buttons.length : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -1;
      if (j >= 0) { e.preventDefault(); buttons[j].focus(); buttons[j].click(); }
    });
    $("setFind").addEventListener("input", (e) => { q = e.target.value; render(); body.scrollTop = 0; });
    $("setTabs").replaceChildren(...names.map((n) => { const b = document.createElement("button"); b.type = "button"; b.role = "tab"; b.textContent = n; b.dataset.tab = n; b.addEventListener("click", () => show(n)); return b; }));
    // Schalter „Mining in Argus anzeigen“: alles Mining in den Einstellungen verschwindet, nur der Schalter selbst bleibt
    const master = $("setMiningOn").parentElement, firstMine = secs.find((x) => x.tab === "Mining");
    for (const x of secs) {
      if (x.key === "Täglicher Miner-Report" || x.key === "Mining-Seite" || (x.tab === "Mining" && x !== firstMine)) { x.h.classList.add("mn-off"); x.items.forEach((el) => el.classList.add("mn-off")); }
      else if (x === firstMine) x.items.forEach((el) => { if (el !== master) el.classList.add("mn-off"); });
    }
    for (const b of $("setTabs").children) if (b.dataset.tab === "Report") b.classList.add("mn-off"); // ohne Mining kein Report-Reiter
    for (const x of secs) if (x.key === "Temperaturmessung") { x.h.classList.add("win-only"); x.items.forEach((el) => el.classList.add("win-only")); }
    show(sel);
  })();
  // Texte nennen die gewählte Form statt immer „Kugel“ (Reiter, Überschriften, Hinweise)
  const SHAPE_WORDS = { trapez: ["Trapez", "des Trapezes", "dem Trapez"], parallelogramm: ["Parallelogramm", "des Parallelogramms", "dem Parallelogramm"], oktagon: ["Oktagon", "des Oktagons", "dem Oktagon"], diamant: ["Diamant", "des Diamanten", "dem Diamanten"], tornado: ["Tornado", "des Tornados", "dem Tornado"], oktaeder: ["Oktaeder", "des Oktaeders", "dem Oktaeder"], dodekaeder: ["Dodekaeder", "des Dodekaeders", "dem Dodekaeder"], zylinder: ["Zylinder", "des Zylinders", "dem Zylinder"], kegel: ["Kegel", "des Kegels", "dem Kegel"], prisma: ["Prisma", "des Prismas", "dem Prisma"], spirale: ["Wirbel", "des Wirbels", "dem Wirbel"], kugel: ["Kugel", "der Kugel", "der Kugel"], hexagon: ["Hexagon", "des Hexagons", "dem Hexagon"], wuerfel: ["Würfel", "des Würfels", "dem Würfel"],
    kristall: ["Kristall", "des Kristalls", "dem Kristall"], gehirn: ["Gehirn", "des Gehirns", "dem Gehirn"], ring: ["Ring", "des Rings", "dem Ring"],
    helix: ["DNA-Helix", "der DNA-Helix", "der DNA-Helix"], galaxie: ["Galaxie", "der Galaxie", "der Galaxie"], symbiont: ["Symbiont", "des Symbionten", "dem Symbionten"],
    muenze: ["Münze", "der Münze", "der Münze"], pyramide: ["Pyramide", "der Pyramide", "der Pyramide"], stern: ["Stern", "des Sterns", "dem Stern"], herz: ["Herz", "des Herzens", "dem Herzen"], atom: ["Atom", "des Atoms", "dem Atom"], ikosaeder: ["Ikosaeder", "des Ikosaeders", "dem Ikosaeder"], stella: ["Stern-Tetraeder", "des Stern-Tetraeders", "dem Stern-Tetraeder"], knoten: ["Torusknoten", "des Torusknotens", "dem Torusknoten"], tropfen: ["Tropfen", "des Tropfens", "dem Tropfen"] };
  const shapeOrig = new WeakMap();
  function applyShapeWords() {
    const [nom, gen, dat] = SHAPE_WORDS[shape] || SHAPE_WORDS.kugel;
    const conv = (t) => t.replace(/Farbe der Kugel/g, "Farbe " + gen).replace(/\b(an|neben|in|unter|über) der Kugel/g, "$1 " + dat)
      .replace(/kleinen Kugel/g, "kleinen Ansicht").replace(/kleine Kugel/g, "kleine Ansicht").replace(/^Kugel$/, nom);
    const walk = document.createTreeWalker($("settings"), NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      if (n.parentElement?.closest("select, #shapePick")) continue; // Auswahlliste der Formen bleibt wie sie ist
      if (!shapeOrig.has(n)) { if (!/Kugel/.test(n.nodeValue)) continue; shapeOrig.set(n, n.nodeValue); }
      n.nodeValue = conv(shapeOrig.get(n));
    }
    $("collapseBtn").title = "Klein machen (Esc)"; $("collapseBtn").setAttribute("aria-label", "Klein machen");
  }
  $("setSteamKey").addEventListener("change", (e) => { const v = e.target.value.trim(); if (v) { window.jarvis.setConfig({ steamKey: v }); e.target.value = ""; e.target.placeholder = "gespeichert (leer lassen = unverändert)"; } });
  $("setSteamId").addEventListener("change", (e) => window.jarvis.setConfig({ steamId: e.target.value.trim() }));
  $("setDiscord").addEventListener("change", (e) => window.jarvis.setConfig({ discordServers: e.target.value.trim() }));
  $("setMemory").addEventListener("change", (e) => window.jarvis.setConfig({ memoryOn: e.target.checked }));
  $("setDesktopLink").addEventListener("change", (e) => window.jarvis.setConfig({ claudeDesktopLink: e.target.checked }));
  $("setMemOpen").addEventListener("click", () => window.jarvis.openMemory());

  // ---------- Selbstverbesserung: Änderung zeigen und auf des Nutzers Okay warten ----------
  function showOffer(o) {
    if (!o) { $("offer").hidden = true; return; }
    $("offerWish").textContent = "Wunsch: " + o.wish;
    $("offerSummary").textContent = o.summary;
    $("offerFiles").replaceChildren(...o.files.map((f) => { const li = document.createElement("li"); li.textContent = `${f.file}: ${f.status}, +${f.added} / −${f.removed} Zeilen`; return li; }));
    $("offer").hidden = false;
    autoExpanded = false; window.jarvis.setExpanded(true, true);
  }
  const selfSay = (text) => { showTurn("ai", text).dataset.done = "1"; log(text); if (tts.on) speak(text, () => {}); };
  window.jarvis.onSelfStep?.((t) => { notice(t); log(t); REGIONS[R.ausgabe].bump = 0.5; });
  window.jarvis.onSelfImprove?.((r) => { notice(""); if (r.offer) showOffer(r.offer); else showOffer(null); selfSay(r.text); });
  $("offerApply").addEventListener("click", () => window.jarvis.selfApply());
  $("offerDiscard").addEventListener("click", () => window.jarvis.selfDiscard());
  window.jarvis.selfOffer?.().then((o) => o && showOffer(o));
  $("setQuit").addEventListener("click", () => window.jarvis.quit());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("settings").hidden) { $("settings").hidden = true; return; }
    if (e.key === "Escape" && document.body.classList.contains("maxed")) { window.jarvis.winMode("normal"); return; }
    });
  // Ein Klick auf das Fenster nimmt die automatische Verkleinerung zurück
  document.addEventListener("pointerdown", () => { autoExpanded = false; clearTimeout(collapseTimer); });

