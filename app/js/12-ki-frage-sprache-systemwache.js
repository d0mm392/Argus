"use strict";
  // ---------- Ablauf einer Frage ----------
  let busy = false, turns = [];
  // Während Argus spricht: Enter (oder neue Sprachfrage) unterbricht die Ausgabe und nimmt die neue Frage. Während er noch nachdenkt: Frage kommt direkt danach dran
  let curFinish = null, queued = "";
  const once = (f) => { let done = false; return () => { if (!done) { done = true; f(); } }; };
  function runQueued() { if (queued && !busy) { const q = queued; queued = ""; ask(q); } }
  function interruptWith(v) {
    if (curFinish) { stopSpeaking(); const f = curFinish; queued = v; f(); return true; }
    queued = v; notice("Nehme ich gleich dran: " + (v.length > 40 ? v.slice(0, 40) + "…" : v)); return true;
  }
  let WAKE = /\b(hallo|hey)\s+claude\b/i;
  const CLAUDE_VARIANTS = "(?:claude?|claud|klaud|klaut|klaude|kloud|cloud|clout|klod|klot|clod)";
  function buildWake(words) {
    const parts = (words || []).map((w) => w.trim().toLowerCase().split(/\s+/)
      .map((t) => (t === "claude" ? CLAUDE_VARIANTS : t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("[\\s,]+"));
    return new RegExp("\\b(?:" + (parts.join("|") || "hallo[\\s,]+" + CLAUDE_VARIANTS) + ")\\b[\\s,.!?:]*", "i");
  }

  async function ask(raw) {
    const text = raw.replace(WAKE, "").trim();
    if (busy || !text) return;
    busy = true; notice(""); autoExpand();
    showTurn("user", text).dataset.done = "1";
    turns.push({ role: "user", content: text });
    log("Anfrage: " + (text.length > 34 ? text.slice(0, 34) + "…" : text));
    // Befehle wie "öffne Brave" führt Argus direkt aus, ohne die KI zu fragen
    const did = await window.jarvis.action?.(text).catch(() => null);
    if (did) {
      showTurn("ai", did).dataset.done = "1"; turns.push({ role: "assistant", content: did }); log("Aktion: " + did);
      setState("speaking", "Führt aus…"); REGIONS[R.ausgabe].bump = 0.6;
      const fin = once(() => { curFinish = null; busy = false; setState("idle"); scheduleAutoCollapse(); runQueued(); }); curFinish = fin;
      if (tts.on) speak(did, fin); else setTimeout(fin, 1200);
      return;
    }
    startThinking();
    let started = false, answer = "";
    try {
      answer = await window.jarvis.ask(turns, (t) => {
        if (!started) { started = true; stopThinking(); setState("speaking", "Formuliert Antwort…"); log("Sprachausgabe aktiv"); }
        REGIONS[R.ausgabe].bump = 0.3;
        showTurn("ai", t);
      });
    } catch (e) {
      stopThinking(); turns.pop();
      setState("error", "Keine Antwort"); notice(e.message || "Die KI hat nicht geantwortet."); log("Fehler: " + (e.code || "unbekannt"));
      setTimeout(() => { busy = false; setState("idle"); scheduleAutoCollapse(); runQueued(); }, 2500);
      return;
    }
    if (!started) { stopThinking(); setState("speaking", "Formuliert Antwort…"); showTurn("ai", answer); }
    const row = $("transcript").lastElementChild; if (row) row.dataset.done = "1";
    turns.push({ role: "assistant", content: answer });
    if (turns.length > 12) turns = turns.slice(-12);
    $("proc").textContent = tts.on ? "Spricht…" : "Antwort fertig";
    const finish = once(() => { curFinish = null; busy = false; log("Zurück im Leerlauf"); setState("idle"); scheduleAutoCollapse(); runQueued(); }); curFinish = finish;
    if (tts.on) speak(answer, finish);
    else setTimeout(finish, Math.max(1400, Math.min(5000, answer.length * 30)));
  }

  // ---------- Sprachausgabe ----------
  const tts = { on: true };
  // Argus spricht: lokale Piper-Stimme (Thorsten) mit Klangformung für einen runden, satten Klang.
  // Fallback ist die Windows-Stimme, dann bevorzugt männlich und etwas tiefer.
  let ttsCtx = null, ttsSrc = null, ttsAnalyser = null, ttsData = null;
  let talking = false, voiceLevel = 0;
  function voiceChain() {
    if (ttsCtx) return ttsCtx;
    ttsCtx = new AudioContext();
    const c = ttsCtx; applySink();
    const low = c.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 170; low.gain.value = 5;      // Fülle
    const body = c.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 320; body.Q.value = 0.9; body.gain.value = 1.5; // Wärme
    const box = c.createBiquadFilter(); box.type = "peaking"; box.frequency.value = 2800; box.Q.value = 1.2; box.gain.value = -2; // weniger schneidend
    const air = c.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = 6500; air.gain.value = -3;    // runder
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    const out = c.createGain(); out.gain.value = 1.15;
    // Kurzer, dezenter Raumklang
    const len = Math.floor(c.sampleRate * 0.35), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const verb = c.createConvolver(); verb.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.1;
    ttsAnalyser = c.createAnalyser(); ttsAnalyser.fftSize = 512; ttsData = new Uint8Array(ttsAnalyser.fftSize);
    low.connect(body).connect(box).connect(air).connect(comp).connect(out);
    out.connect(c.destination); out.connect(verb).connect(wet).connect(c.destination); out.connect(ttsAnalyser);
    c.input = low;
    return c;
  }
  function applySink() { try { if (ttsCtx?.setSinkId) ttsCtx.setSinkId(spkId || "").catch(() => {}); } catch {} }
  function stopSpeaking() { try { ttsSrc?.stop(); } catch (e) {} ttsSrc = null; try { speechSynthesis.cancel(); } catch (e) {} talking = false; }
  async function speak(text, done) {
    const clean = text.replace(/[*#_`>]/g, "");
    stopSpeaking();
    let wav = null;
    try { wav = await window.jarvis?.tts?.(clean); } catch (e) {}
    if (wav) {
      try {
        const c = voiceChain(); if (c.state === "suspended") await c.resume();
        const buf = await c.decodeAudioData(new Uint8Array(wav).buffer);
        const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.97; // etwas tiefer
        src.connect(c.input); ttsSrc = src; talking = true;
        src.onended = () => { if (ttsSrc === src) { ttsSrc = null; talking = false; done(); } };
        src.start();
        return;
      } catch (e) { /* weiter mit Windows-Stimme */ }
    }
    speakSystem(clean, done);
  }
  function speakSystem(text, done) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE"; u.rate = 0.98; u.pitch = 0.82;
      const de = speechSynthesis.getVoices().filter((x) => /^de/i.test(x.lang));
      const v = de.find((x) => /stefan|conrad|killian|florian|ralf|male|mann/i.test(x.name)) || de[0];
      if (v) u.voice = v;
      let ended = false; const end = () => { if (!ended) { ended = true; talking = false; done(); } };
      u.onboundary = () => { REGIONS[R.ausgabe].bump = Math.max(REGIONS[R.ausgabe].bump, 0.2); };
      u.onend = end; u.onerror = end;
      setTimeout(end, 4000 + text.length * 90);
      talking = true; speechSynthesis.speak(u);
    } catch (e) { talking = false; done(); }
  }
  function setTts(on) { tts.on = on; $("ttsBtn").setAttribute("aria-pressed", String(on)); if (!on) stopSpeaking(); }
  $("ttsBtn").addEventListener("click", () => setTts(!tts.on));

  // ---------- Spracheingabe: Vosk offline, Wake-Word ----------
  const voice = { on: false, ready: false, status: "", model: null, rec: null, ctx: null, stream: null, analyser: null, buf: null, level: 0, awake: false, silence: null, userOff: false };
  function setMicButtons() { document.querySelectorAll(".mic-btn").forEach((b) => b.setAttribute("aria-pressed", String(voice.on))); }

  async function startVoice() {
    if (voice.on) return;
    if (!voice.ready) { notice(voice.status || "Spracherkennung ist noch nicht bereit."); return; }
    try {
      if (!voice.model) { $("proc").textContent = "Lade Spracherkennung…"; log("Lade Spracherkennung"); voice.model = await Vosk.createModel("/model.tar.gz"); }
      const aud = { echoCancellation: true, noiseSuppression: true, channelCount: 1 };
      try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: micId ? { ...aud, deviceId: { exact: micId } } : aud }); }
      catch (e) { if (!micId) throw e; notice("Das gewählte Mikrofon ist nicht erreichbar, Argus nimmt das Windows-Standardmikrofon."); voice.stream = await navigator.mediaDevices.getUserMedia({ audio: aud }); }
      voice.ctx = new AudioContext();
      voice.rec = new voice.model.KaldiRecognizer(voice.ctx.sampleRate);
      voice.rec.on("partialresult", (m) => onHeard(m.result.partial, false));
      voice.rec.on("result", (m) => onHeard(m.result.text, true));
      const src = voice.ctx.createMediaStreamSource(voice.stream);
      const proc = voice.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => { if (!busy) { try { voice.rec.acceptWaveform(e.inputBuffer); } catch (err) {} } };
      voice.analyser = voice.ctx.createAnalyser(); voice.analyser.fftSize = 512; voice.buf = new Float32Array(512);
      const mute = voice.ctx.createGain(); mute.gain.value = 0;
      src.connect(voice.analyser); src.connect(proc); proc.connect(mute); mute.connect(voice.ctx.destination);
      voice.on = true; setMicButtons(); notice("");
      log("Mikrofon an, lauscht auf „Hallo Claude“");
      if (state === "idle") setState("idle");
    } catch (e) {
      notice("Mikrofon nicht verfügbar: " + (e.message || e));
      log("Mikrofon-Fehler");
    }
  }
  function stopVoice() {
    voice.on = false; voice.awake = false; setMicButtons();
    try { voice.stream?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { voice.rec?.remove(); } catch (e) {}
    try { voice.ctx?.close(); } catch (e) {}
    voice.stream = voice.ctx = voice.rec = voice.analyser = null;
    log("Mikrofon aus");
    if (state === "idle" || state === "listening") setState("idle");
  }
  document.querySelectorAll(".mic-btn").forEach((b) => b.addEventListener("click", () => {
    if (voice.on) { voice.userOff = true; stopVoice(); } else { voice.userOff = false; startVoice(); }
  }));

  // Echte Lautstärke treibt das Hörzentrum an
  setInterval(() => {
    if (!voice.analyser) return;
    voice.analyser.getFloatTimeDomainData(voice.buf);
    let sum = 0; for (const v of voice.buf) sum += v * v;
    voice.level = Math.min(1, Math.sqrt(sum / voice.buf.length) * 6);
    if (state === "listening") REGIONS[R.hoer].bump = Math.max(REGIONS[R.hoer].bump, voice.level * 0.8);
    else if (state === "idle") REGIONS[R.hoer].bump = Math.max(REGIONS[R.hoer].bump, voice.level * 0.3);
  }, 60);

  function wake() {
    voice.awake = true; setState("listening", "Ich höre…"); log("Wake-Word erkannt");
    REGIONS[R.hoer].bump = 0.5; autoExpand(); armSilence();
  }
  function armSilence() {
    clearTimeout(voice.silence);
    voice.silence = setTimeout(() => {
      if (voice.awake && !busy) { voice.awake = false; setState("idle"); log("Nichts gehört, Leerlauf"); scheduleAutoCollapse(); }
    }, 7000);
  }
  function onHeard(text, final) {
    text = (text || "").trim();
    if (!text || busy) return;
    if (!voice.awake) {
      if (!WAKE.test(text)) { if (final) log("Gehört: " + text); return; }
      wake();
    }
    REGIONS[R.hoer].bump = 0.35; REGIONS[R.verst].bump = 0.25;
    armSilence();
    const cmd = text.replace(WAKE, "").trim();
    if (cmd) showTurn("user", cmd);
    if (final && cmd) { voice.awake = false; clearTimeout(voice.silence); if (busy) interruptWith(cmd); else ask(cmd); }
  }

  // ---------- Texteingabe ----------
  $("askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("askInput").value.trim(); if (!v) return;
    $("askInput").value = ""; growAsk();
    if (busy) return interruptWith(v);
    ask(v);
  });
  // Enter schickt ab, Umschalt+Enter macht eine neue Zeile; das Feld wächst bis etwa sieben Zeilen mit
  function growAsk() { const a = $("askInput"); a.style.height = "auto"; a.style.height = a.scrollHeight + 2 + "px"; }
  $("askInput").addEventListener("input", growAsk);
  $("askInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("askForm").requestSubmit(); }
  });

  // ---------- Systemwache: Größe an den vier Ecken ziehen, Doppelklick auf die Überschrift = automatisch ----------
  let sysBox = { w: 0, h: 0, align: "l" }, sysRes = null;
  function applySysBox() {
    const el = $("sys"); el.classList.toggle("sized", !!sysBox.h);
    el.style.height = sysBox.h ? sysBox.h + "px" : ""; el.style.width = sysBox.w ? sysBox.w + "px" : "";
    el.style.alignSelf = sysBox.w ? (sysBox.align === "r" ? "flex-end" : "flex-start") : "";
    if (lastSys) renderSystem();
  }
  for (const c of ["tl", "tr", "bl", "br"]) {
    const g = document.createElement("div"); g.className = "fgrip " + c; g.title = "Ziehen: Größe ändern"; $("sys").append(g);
    g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); g.classList.add("on");
      const el = $("sys"); sysRes = { c, g, sx: e.clientX, sy: e.clientY, w0: el.offsetWidth, h0: el.offsetHeight, max: el.parentElement.clientWidth - 28 };
    });
  }
  window.addEventListener("pointermove", (e) => {
    if (!sysRes) return;
    const r = sysRes, dx = e.clientX - r.sx, dy = e.clientY - r.sy, L = r.c.includes("l"), T = r.c.includes("t");
    const w = Math.max(220, Math.min(r.max, r.w0 + (L ? -dx : dx))), h = Math.max(90, Math.min(innerHeight * 0.8, r.h0 + (T ? -dy : dy)));
    sysBox = { w: w >= r.max - 2 ? 0 : Math.round(w), h: Math.round(h), align: L ? "r" : "l" }; applySysBox();
  }, true);
  const sysEnd = () => { if (!sysRes) return; sysRes.g.classList.remove("on"); sysRes = null; window.jarvis.setConfig({ sysBox }); };
  window.addEventListener("pointerup", sysEnd, true); window.addEventListener("pointercancel", sysEnd, true);
  $("sys").querySelector(".sys-head").addEventListener("dblclick", () => { sysBox = { w: 0, h: 0, align: "l" }; applySysBox(); window.jarvis.setConfig({ sysBox }); });

  // ---------- Systemwache ----------
  let sys = { health: "ok", checks: [], top: [] };
  let scanIdx = 0, scanT = 0, knownIssues = new Map(), alertsVoice = false;
  const HEALTH_LABEL = { ok: "Alles in Ordnung", warn: "Warnung", crit: "Kritisch" };
  const issues = () => sys.checks.filter((c) => c.status !== "ok");

  // Im Leerlauf geht die Systemwache Messpunkt für Messpunkt durch, sichtbar in der Kugel
  function systemScan(dt) {
    const reg = REGIONS[R.system];
    reg.hue = sys.health === "crit" ? 6 : sys.health === "warn" ? 30 : 200;
    const bad = issues();
    if (bad.length) { focus("system", 0.95, "⚠ " + bad[0].text); return; }
    if (!sys.checks.length) { focus("system", 0.4, "Starte Messung…"); return; }
    scanT -= dt;
    if (scanT <= 0) {
      scanT = 2.6; scanIdx = (scanIdx + 1) % sys.checks.length;
      if (scanIdx === 0) log("Systemscan: alles in Ordnung");
    }
    const c = sys.checks[scanIdx % sys.checks.length];
    focus("system", 0.55, "Prüft " + c.text);
  }

  function healthPill() {
    const h = state === "idle" ? sys.health : "ok";
    $("pill").dataset.health = h;
    $("pill").style.setProperty("--dot", h === "crit" ? "#ff5c4d" : h === "warn" ? "#f3a54b" : STATES[state].color);
    if (state === "idle" && h !== "ok") $("stateLabel").textContent = HEALTH_LABEL[h];
    $("capRegion").dataset.health = h;
  }

  function fmtPct(v) { return v == null ? "–" : Math.round(v) + " %"; }
  function meterColor(p) { return p > 95 ? "#ff5c4d" : p > 88 ? "#f3a54b" : "var(--accent)"; }
  function renderSystem() {
    $("sysHealth").dataset.health = sys.health;
    $("sysHealth").textContent = HEALTH_LABEL[sys.health];
    const disk = (sys.disks || []).slice().sort((a, b) => b.pct - a.pct)[0];
    const rows = [
      ["CPU" + (sys.temp ? " · " + sys.temp + " °C" : "") + (sys.gpuTemp ? " · GPU " + sys.gpuTemp + " °C" : ""), fmtPct(sys.cpu), sys.cpu],
      ["Arbeitsspeicher", fmtPct(sys.ram?.pct), sys.ram?.pct],
      ["Laufwerk " + (disk?.mount || ""), disk ? disk.freeGB + " GB frei" : "–", disk?.pct],
      ["Netz" + (sys.internet === false ? " · offline" : sys.internet ? " · " + sys.internet + " ms" : ""),
        sys.net ? "↓" + rate(sys.net.rxKBs) : "–", sys.net ? Math.min(100, (sys.net.rxKBs || 0) / 50) : 0],
    ];
    $("meters").replaceChildren(...rows.map(([label, val, pct]) => {
      const m = document.createElement("div"); m.className = "meter";
      const a = document.createElement("span"), b = document.createElement("b"), i = document.createElement("i");
      a.textContent = label; b.textContent = val;
      i.style.setProperty("--v", Math.max(0, Math.min(100, pct || 0)) + "%");
      i.style.setProperty("--c", label.startsWith("Netz") ? "var(--accent)" : meterColor(pct || 0));
      m.append(a, b, i); return m;
    }));
    lastSys = sys; renderSysHint(sys);
    const all = sys.top || [], lim = procsAll ? (sysBox.h ? 30 : 15) : sysBox.h ? 8 : 5;
    $("procs").replaceChildren(...all.slice(0, lim).map((p) => {
      const li = document.createElement("li"), n = document.createElement("span"), c = document.createElement("b"), mem = document.createElement("b");
      n.textContent = p.name; c.textContent = p.cpu + " %"; mem.textContent = p.memMB + " MB";
      if (viz.apps !== false) { const dot = document.createElement("i"); dot.className = "dot"; dot.style.setProperty("--ah", appHue(p.name).toFixed(0)); n.prepend(dot); }
      li.dataset.proc = p.name; li.dataset.mem = p.memMB; li.title = procKill ? "Rechtsklick: Programm beenden" : "";
      li.append(n, c, mem); return li;
    }), ...(all.length > (sysBox.h ? 8 : 5) ? [(() => { const li = document.createElement("li"); li.className = "more"; li.textContent = procsAll ? "Weniger zeigen ▴" : `${Math.min(all.length, sysBox.h ? 30 : 15) - lim} weitere Programme · zeigen ▾`;
      li.addEventListener("click", (e) => { e.stopPropagation(); procsAll = !procsAll; try { localStorage.setItem("jarvisProcsAll", procsAll ? "1" : ""); } catch {} renderSystem(); }); return li; })()] : []));
  }
  // Rechtsklick auf ein Programm in der Systemwache: beenden (alle Prozesse dieses Namens, wie „Prozessgruppe beenden“ im Task-Manager)
  let procKill = true;
  const procMenu = $("procMenu");
  const closeProcMenu = () => { procMenu.hidden = true; };
  $("procs").addEventListener("contextmenu", (e) => {
    const li = e.target.closest("li[data-proc]"); if (!li || !procKill) return;
    e.preventDefault(); e.stopPropagation();
    const name = li.dataset.proc, t = document.createElement("div"), kill = document.createElement("button"), no = document.createElement("button");
    t.className = "cm-t"; t.textContent = `${name} · ${li.dataset.mem} MB`;
    kill.type = no.type = "button"; kill.className = "danger"; kill.textContent = `„${name}“ beenden`; no.textContent = "Abbrechen";
    kill.addEventListener("click", async () => { closeProcMenu(); const r = await window.jarvis.killProcess(name).catch((err) => ({ ok: false, text: String(err.message || err) })); notice(r.text); log(r.text); });
    no.addEventListener("click", closeProcMenu);
    procMenu.replaceChildren(t, kill, no); procMenu.hidden = false;
    procMenu.style.left = Math.min(e.clientX, innerWidth - procMenu.offsetWidth - 8) + "px"; procMenu.style.top = Math.min(e.clientY, innerHeight - procMenu.offsetHeight - 8) + "px";
  });
  document.addEventListener("pointerdown", (e) => { if (!procMenu.hidden && !procMenu.contains(e.target)) closeProcMenu(); }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeProcMenu(); });
  window.addEventListener("blur", closeProcMenu);
  $("setProcKill").addEventListener("change", (e) => { procKill = e.target.checked; window.jarvis.setConfig({ procKill }); });
  window.jarvis.getConfig?.().then((c) => { procKill = c.procKill !== false; $("setProcKill").checked = procKill; });
  function rate(kbs) { return kbs >= 1024 ? (kbs / 1024).toFixed(1) + " MB/s" : Math.round(kbs || 0) + " KB/s"; }

  function onSystem(d) {
    if (!d) return;
    sys = d; gameSeen(d.game);
    // Neue und behobene Probleme melden
    const now = new Map(issues().map((c) => [c.key, c]));
    for (const [k, c] of now) if (!knownIssues.has(k)) {
      log("⚠ " + c.text); notice("⚠ " + c.text);
      if (alertsVoice && !busy && tts.on && state === "idle") speak("Achtung. " + c.text, () => {});
    }
    for (const [k, c] of knownIssues) if (!now.has(k)) log("Behoben: " + c.label);
    if (!now.size && knownIssues.size) notice("");
    knownIssues = now;
    healthPill();
    renderSystem();
  }

  // Strg + Mausrad skaliert die ganze App
  let wheelLock = 0;
  window.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const t = performance.now(); if (t - wheelLock < 25) return; wheelLock = t;
    window.jarvis.resizeBy(e.deltaY < 0 ? 1.035 : 1 / 1.035);
  }, { passive: false });

