// Bildschirm übertragen: Direktverbindung zwischen zwei Argus (WebRTC). Bild und Systemton laufen im selben Stream,
// damit WebRTC beide synchron hält. Ein Vermittlungsserver tauscht nur die verschlüsselten Verbindungsdaten aus.
// Ablauf: Wer zeigt, erzeugt einen Code und nimmt die Anfrage ausdrücklich an. Wer zusieht, gibt den Code ein. Ansehen, keine Fernsteuerung.
"use strict";
(() => {
  const C = window.ShareCore, api = window.share, $ = (id) => document.getElementById(id);
  const S = { role: "host", phase: "idle", cfg: {}, src: null, sources: [], stream: null, pc: null, dc: null, sig: null, key: null, myId: "", peer: null, sid: "",
    iceQ: [], restarted: false, timers: [], stats: { last: null }, connectedOnce: false, pointing: false, paused: false, muted: false, hasAudio: false, peerPointer: false };
  window.__share = S; // für Tests und Fehlersuche

  // ---------- Vermittlung: mehrere Server zugleich (share-signal.js), Nachrichten verschlüsselt ----------
  class Signal {
    constructor(urls, id, onMsg, onClose) { this.m = new window.ShareSignal.Multi(C.signalList(urls), id, onMsg, onClose); }
    async connect() { this.status = await this.m.connect(); return this.status; }
    async send(type, dst, data) { this.m.send(type, dst, await C.seal(S.key, data)); }
    close() { this.m.close(); }
  }
  const sigInfo = () => { const st = S.sig?.status || []; const ok = st.filter((x) => x.ok).map((x) => x.name); return ok.length + " von " + st.length + " Vermittlungsservern erreichbar" + (ok.length < st.length ? " (" + st.filter((x) => !x.ok).map((x) => x.name + ": " + x.err).join(", ") + ")" : ""); };

  // ---------- Oberfläche ----------
  const panes = ["pHostSetup", "pHostWait", "pHostAsk", "pViewSetup", "pLive"];
  function show(id) { for (const p of panes) $(p).hidden = p !== id; }
  function err(t) { $("err").hidden = !t; $("err").textContent = t || ""; }
  function setStage(t) { $("stageMsg").textContent = t || ""; $("stageMsg").hidden = !t; }
  function stateTxt(id, t, k) { $(id).textContent = t; $(id).dataset.k = k || ""; }
  const clean = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 32);
  function chat(who, text, cls) {
    const li = document.createElement("li"); if (cls) li.className = cls;
    if (who) { const b = document.createElement("b"); b.textContent = who + ": "; li.append(b); }
    li.append(document.createTextNode(text)); $("chatLog").append(li); $("chatLog").scrollTop = 1e9;
    while ($("chatLog").children.length > 200) $("chatLog").firstChild.remove();
  }
  function lockTabs(on) { for (const b of $("tabs").children) b.disabled = on && b.dataset.role !== S.role; }
  function setRole(r) {
    if (S.phase !== "idle") return;
    S.role = r; document.body.dataset.role = r;
    for (const b of $("tabs").children) b.setAttribute("aria-selected", String(b.dataset.role === r));
    err(""); show(r === "host" ? "pHostSetup" : "pViewSetup");
    $("stageCtl").hidden = true; $("stageTag").hidden = true;
    setStage(r === "host" ? "Wähle links, was dein Gegenüber sehen soll." : "Gib den Code ein, den dein Gegenüber dir gegeben hat.");
    if (r === "host") loadSources(); else $("inCode").focus();
  }
  function fillSelect(sel, obj, val) { sel.replaceChildren(...Object.entries(obj).map(([k, v]) => new Option(v.label, k))); sel.value = obj[val] ? val : Object.keys(obj)[0]; }
  const preset = () => C.PRESETS[S.cfg.sharePreset] || C.PRESETS.film;
  const buffer = () => C.BUFFERS[S.cfg.shareBuffer] || C.BUFFERS.normal;

  async function loadSources() {
    const list = (await api.sources().catch(() => [])) || [];
    S.sources = list;
    const grid = $("srcGrid");
    grid.replaceChildren(...list.map((s) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "src"; b.dataset.id = s.id; b.setAttribute("aria-pressed", String(S.src?.id === s.id));
      if (s.thumb) { const i = document.createElement("img"); i.src = s.thumb; i.alt = ""; b.append(i); } else { const d = document.createElement("div"); d.className = "noimg"; b.append(d); }
      const n = document.createElement("span"); n.textContent = (s.screen ? "Bildschirm: " : "") + s.name; n.title = s.name; b.append(n);
      b.onclick = () => pickSource(s);
      return b;
    }));
    if (!list.length) { const p = document.createElement("p"); p.className = "note"; p.textContent = "Keine Fenster gefunden. Minimierte Fenster liefert Windows nicht."; grid.append(p); }
    if (S.src && !list.some((s) => s.id === S.src.id)) S.src = null;
    if (!S.src && list[0]?.screen) pickSource(list[0]);
    $("btnPrepare").disabled = !S.src;
  }
  async function pickSource(s) {
    S.src = s;
    for (const b of $("srcGrid").children) if (b.dataset) b.setAttribute("aria-pressed", String(b.dataset.id === s.id));
    $("btnPrepare").disabled = false;
    $("optAudio").disabled = !s.screen; if (!s.screen) $("optAudio").checked = false; else $("optAudio").checked = S.cfg.shareAudio !== false;
    $("audioNote").textContent = s.screen ? "Übertragen wird alles, was dein PC abspielt, auch Stimmen aus Discord. Damit dein Gegenüber sich nicht selbst als Echo hört: Discord auf ein anderes Ausgabegerät stellen oder den Ton hier abschalten, solange ihr redet."
      : "Ton gibt es nur bei einem ganzen Bildschirm. Windows liefert den Ton eines einzelnen Fensters nicht getrennt.";
    // Live die Quelle wechseln (nur das Bild, Ton bleibt)
    if (S.phase === "live" && S.role === "host") await switchSource(s);
  }

  // ---------- Aufnahme ----------
  async function capture(src, wantAudio) {
    const p = preset();
    const video = { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: src.id, maxWidth: p.w, maxHeight: p.h, maxFrameRate: p.fps } };
    let stream = null, audio = false;
    if (wantAudio && src.screen) {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "desktop" } }, video }); audio = stream.getAudioTracks().length > 0; } catch { stream = null; }
    }
    if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    const v = stream.getVideoTracks()[0]; if (v) v.contentHint = p.hint;
    const a = stream.getAudioTracks()[0]; if (a) a.contentHint = "music";
    return { stream, audio };
  }
  async function switchSource(src) {
    try {
      const { stream } = await capture(src, false);
      const nv = stream.getVideoTracks()[0], sender = S.pc?.getSenders().find((x) => x.track?.kind === "video");
      if (!nv || !sender) return;
      await sender.replaceTrack(nv);
      const old = S.stream.getVideoTracks()[0]; S.stream.removeTrack(old); old.stop(); S.stream.addTrack(nv); watchEnded(nv);
      $("vid").srcObject = S.stream; S.peerPointer = !!src.screen; dcSend({ k: "info", pointer: S.peerPointer, audio: S.hasAudio });
      api.state({ active: true, role: "host", sending: true, peer: S.peer?.name, displayId: src.screen ? src.displayId : null, audio: S.hasAudio });
      chat("", "Quelle gewechselt: " + src.name, "sys");
    } catch { err("Diese Quelle lässt sich nicht aufnehmen."); }
  }
  function watchEnded(t) { t.addEventListener("ended", () => { if (S.phase !== "idle" && t.kind === "video" && S.stream?.getVideoTracks()[0] === t) end("Die Quelle wurde geschlossen."); }); }

  // ---------- Zeigen (Host) ----------
  async function hostPrepare() {
    if (!S.src) return;
    err(""); S.phase = "wait"; lockTabs(true); show("pHostWait");
    stateTxt("hostWaitState", "Verbinde mit dem Vermittlungsserver …");
    const ice = await api.ice(); S.cfg.signal = ice?.signal;
    for (let i = 0; i < 3; i++) {
      const d = await C.derive(C.newCode());
      S.key = d.key; S.myId = d.hostId; $("codeOut").textContent = d.code; S.code = d.code;
      S.sig = new Signal(ice?.signal, S.myId, onHostMsg, () => sigLost());
      try { await S.sig.connect(); break; } catch (e) { S.sig = null; fail(e.message); return; }
    }
    if (S.phase !== "wait") return;
    stateTxt("hostWaitState", "Bereit. Warte auf die Anfrage deines Gegenübers … " + sigInfo() + ".", "ok");
    setStage("Dein Bildschirm wird noch nicht übertragen.");
  }
  async function onHostMsg(m) {
    const data = await C.open(S.key, m.payload); if (!data || !m.src) return; // nicht mit diesem Code verschlüsselt: ignorieren
    if (data.k === "hello") {
      if (S.peer && S.peer.id !== m.src) return S.sig.send("OFFER", m.src, { k: "busy", sid: data.sid });
      if (S.phase !== "wait") return;
      await S.sig.send("OFFER", m.src, { k: "ring", sid: data.sid }); // sofort melden: Code stimmt, Anfrage liegt vor
      S.peer = { id: m.src, name: clean(data.name) || "Unbekannt", sid: String(data.sid || "").slice(0, 32) };
      S.phase = "ask"; show("pHostAsk"); $("askName").textContent = S.peer.name;
      $("askWhat").textContent = "Übertragen wird: " + (S.src.screen ? "Bildschirm " : "Fenster ") + S.src.name + ($("optAudio").checked ? ", mit Ton" : ", ohne Ton") + ".";
      api.attention(S.peer.name + " möchte deinen Bildschirm sehen. Annehmen oder ablehnen im Übertragungsfenster.");
      return;
    }
    if (!S.peer || m.src !== S.peer.id || data.sid !== S.peer.sid) return;
    if (data.k === "sdp" && S.pc && data.sdp?.type === "answer") { try { await S.pc.setRemoteDescription(data.sdp); flushIce(); } catch (e) { fail("Verbindungsdaten passen nicht: " + e.message); } }
    else if (data.k === "ice") addIce(data.c);
    else if (data.k === "bye") end((S.peer?.name || "Dein Gegenüber") + " hat die Verbindung beendet.");
  }
  async function hostAccept() {
    if (S.phase !== "ask") return;
    S.phase = "connecting"; err("");
    try {
      const { stream, audio } = await capture(S.src, $("optAudio").checked);
      S.stream = stream; S.hasAudio = audio; stream.getTracks().forEach(watchEnded);
      if ($("optAudio").checked && !audio) chat("", "Ton ließ sich auf diesem System nicht aufnehmen, es geht nur das Bild raus.", "sys");
    } catch (e) { await S.sig.send("OFFER", S.peer.id, { k: "reject", sid: S.peer.sid }); return fail("Die Quelle ließ sich nicht aufnehmen. Ist das Fenster minimiert?"); }
    $("vid").srcObject = S.stream; $("vid").muted = true; setStage(""); tag("Vorschau: so sieht es dein Gegenüber");
    if (S.phase !== "connecting") { S.stream.getTracks().forEach((t) => t.stop()); return; }
    await S.sig.send("OFFER", S.peer.id, { k: "accept", sid: S.peer.sid, audio: S.hasAudio });
    await makePc(true); if (!S.pc) return;
    S.stream.getTracks().forEach((t) => S.pc.addTrack(t, S.stream)); // ein Stream für Bild und Ton: WebRTC gleicht beide aus
    S.peerPointer = !!S.src.screen;
    api.state({ active: true, role: "host", sending: true, peer: S.peer.name, displayId: S.src.screen ? S.src.displayId : null, audio: S.hasAudio });
    goLive();
  }
  async function hostReject() { if (S.phase !== "ask") return; await S.sig.send("OFFER", S.peer.id, { k: "reject", sid: S.peer.sid }); S.peer = null; S.phase = "wait"; show("pHostWait"); }

  // ---------- Zusehen ----------
  async function viewJoin() {
    const code = C.normCode($("inCode").value); if (!code) return err("Der Code hat 9 Zeichen, zum Beispiel ABC-DEF-GHJ.");
    const name = clean($("inName").value) || clean(S.cfg.shareName); if (name !== S.cfg.shareName) { S.cfg.shareName = name; api.setConfig({ shareName: name }); }
    err(""); S.phase = "knock"; lockTabs(true); $("btnJoin").disabled = true; stateTxt("viewState", "Verbinde …");
    const d = await C.derive(code); S.key = d.key; S.myId = "argus-v-" + C.randId(10); S.sid = C.randId(8);
    S.peer = { id: d.hostId, name: "Gegenüber", sid: S.sid };
    const ice = await api.ice();
    S.sig = new Signal(ice?.signal, S.myId, onViewMsg, () => sigLost());
    try { await S.sig.connect(); } catch (e) { return fail(e.message); }
    if (S.phase !== "knock") return;
    await S.sig.send("OFFER", S.peer.id, { k: "hello", name: name || "Unbekannt", sid: S.sid, v: 1 });
    stateTxt("viewState", "Anfrage gesendet … " + sigInfo() + ".");
    timer(() => { if (S.phase === "knock" && !S.rung) fail("Code nicht gefunden. Entweder stimmt er nicht, oder dein Gegenüber hat die Übertragung noch nicht vorbereitet (" + sigInfo() + ")."); }, 15000);
    timer(() => { if (S.phase === "knock") fail("Keine Antwort. Stimmt der Code, und hat dein Gegenüber die Übertragung vorbereitet?"); }, 120000);
  }
  async function onViewMsg(m) {
    if (!S.peer || m.src !== S.peer.id) return;
    const data = await C.open(S.key, m.payload); if (!data || data.sid !== S.sid) return;
    if (data.k === "ring" && S.phase === "knock") { S.rung = true; stateTxt("viewState", "Code stimmt. Dein Gegenüber muss jetzt annehmen …", "ok"); }
    else if (data.k === "accept" && S.phase === "knock") { S.phase = "connecting"; S.hasAudio = !!data.audio; stateTxt("viewState", "Angenommen. Baue die Verbindung auf …", "ok"); await makePc(false); goLive(); }
    else if (data.k === "reject") fail("Dein Gegenüber hat abgelehnt.");
    else if (data.k === "busy") fail("Dort sieht gerade schon jemand zu.");
    else if (data.k === "sdp" && S.pc && data.sdp?.type === "offer") {
      try {
        await S.pc.setRemoteDescription(data.sdp); flushIce();
        const a = await S.pc.createAnswer(); a.sdp = C.tuneOpus(a.sdp);
        await S.pc.setLocalDescription(a);
        await S.sig.send("ANSWER", S.peer.id, { k: "sdp", sid: S.sid, sdp: { type: a.type, sdp: a.sdp } });
      } catch (e) { fail("Verbindungsdaten passen nicht: " + e.message); }
    }
    else if (data.k === "ice") addIce(data.c);
    else if (data.k === "bye") end("Dein Gegenüber hat die Übertragung beendet.");
  }

  // ---------- WebRTC (beide Seiten) ----------
  async function makePc(isHost) {
    const ice = (await api.ice()) || {};
    const servers = C.iceServers({ stun: ice.stun || C.DEFAULT_STUN, turnUrl: ice.turnUrl, turnUser: ice.turnUser, turnPass: ice.turnPass });
    if (ice.relayOnly && !servers.some((s) => s.username !== undefined)) { fail("„Nur über TURN“ ist an, aber kein TURN-Server eingetragen."); return; }
    const pc = S.pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: ice.relayOnly ? "relay" : "all", bundlePolicy: "max-bundle" });
    const sid = isHost ? S.peer.sid : S.sid;
    pc.onicecandidate = (e) => { if (e.candidate && S.sig) S.sig.send("CANDIDATE", S.peer.id, { k: "ice", sid, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => onConn(pc.connectionState);
    if (isHost) {
      setupDc(pc.createDataChannel("argus", { ordered: true }));
      pc.onnegotiationneeded = async () => {
        try {
          const o = await pc.createOffer(); o.sdp = C.tuneOpus(o.sdp); await pc.setLocalDescription(o);
          await S.sig.send("OFFER", S.peer.id, { k: "sdp", sid, sdp: { type: o.type, sdp: o.sdp } });
        } catch (e) { fail("Verbindung ließ sich nicht aufbauen: " + e.message); }
      };
    } else {
      pc.ondatachannel = (e) => setupDc(e.channel);
      pc.ontrack = (e) => {
        try { e.receiver.jitterBufferTarget = buffer().ms; } catch {}
        const st = e.streams[0]; if (st && $("vid").srcObject !== st) { $("vid").srcObject = st; $("vid").muted = false; $("vid").volume = vol(); $("vid").play().catch(() => {}); }
      };
    }
    timer(() => { if (!S.connectedOnce && S.pc === pc && S.phase !== "idle") fail(noDirect()); }, 30000);
  }
  const noDirect = () => "Keine Verbindung zustande gekommen. Häufige Ursache: Mobilfunk, Starlink oder ein Anbieter mit CGNAT auf einer Seite. Abhilfe: in den Einstellungen einen TURN-Server eintragen (bei beiden oder bei einem reicht).";
  function onConn(st) {
    if (st === "connected") {
      const first = !S.connectedOnce; S.connectedOnce = true; S.restarted = false;
      $("liveTitle").textContent = S.role === "host" ? "Du überträgst an " + (S.peer?.name || "dein Gegenüber") : "Verbunden";
      if (first) { chat("", "Verbindung steht.", "sys"); if (S.role === "host") applyQuality(); }
      if (S.role === "view") { setStage(""); tag(""); }
    } else if (st === "disconnected") { tag("Verbindung wackelt …"); }
    else if (st === "failed") {
      if (S.role === "host" && S.connectedOnce && !S.restarted) { S.restarted = true; tag("Verbindung neu aufbauen …"); try { S.pc.restartIce(); } catch {} }
      else if (!S.connectedOnce) fail(noDirect());
      else if (S.role === "host") end("Verbindung abgerissen.");
    }
  }
  function addIce(c) { if (!c || !S.pc) return; if (S.pc.remoteDescription) S.pc.addIceCandidate(c).catch(() => {}); else S.iceQ.push(c); }
  function flushIce() { const q = S.iceQ; S.iceQ = []; for (const c of q) S.pc.addIceCandidate(c).catch(() => {}); }
  async function applyQuality() {
    const p = preset();
    for (const s of S.pc?.getSenders() || []) {
      if (!s.track) continue;
      try {
        const prm = s.getParameters(); if (!prm.encodings?.length) prm.encodings = [{}];
        if (s.track.kind === "video") { prm.encodings[0].maxBitrate = p.kbps * 1000; prm.encodings[0].maxFramerate = p.fps; prm.degradationPreference = p.degr; s.track.contentHint = p.hint; }
        else { prm.encodings[0].maxBitrate = 192000; prm.encodings[0].priority = "high"; prm.encodings[0].networkPriority = "high"; }
        await s.setParameters(prm);
      } catch {}
    }
    const v = S.stream?.getVideoTracks()[0];
    if (v) v.applyConstraints({ width: { max: p.w }, height: { max: p.h }, frameRate: { max: p.fps } }).catch(() => {});
  }

  // ---------- Datenkanal: Chat, Zeiger, Hinweise ----------
  function setupDc(dc) {
    S.dc = dc;
    dc.onopen = () => { if (S.role === "host") dcSend({ k: "info", pointer: S.peerPointer, audio: S.hasAudio }); };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.k === "chat") chat(S.peer?.name || "Gegenüber", String(m.t || "").slice(0, 500));
      else if (m.k === "ptr" && S.role === "host") { api.pointer({ x: +m.x, y: +m.y, label: S.peer?.name }); showLocalRing(+m.x, +m.y); }
      else if (m.k === "info" && S.role === "view") { S.peerPointer = !!m.pointer; S.hasAudio = !!m.audio; $("btnPoint").disabled = !S.peerPointer; if (!S.peerPointer) setPointing(false); }
      else if (m.k === "pause" && S.role === "view") tag(m.on ? "Bild angehalten" : "");
      else if (m.k === "bye") end((S.role === "host" ? (S.peer?.name || "Dein Gegenüber") + " hat die Verbindung beendet." : "Dein Gegenüber hat die Übertragung beendet."));
    };
  }
  function dcSend(o) { try { if (S.dc?.readyState === "open") S.dc.send(JSON.stringify(o)); } catch {} }

  // ---------- Live ----------
  function goLive() {
    if (S.phase === "idle") return;
    S.phase = "live"; show("pLive"); $("chatLog").replaceChildren();
    $("liveTitle").textContent = "Verbinde …";
    $("stageCtl").hidden = false; $("btnPoint").hidden = S.role === "host"; $("vol").parentElement.hidden = S.role === "host"; $("btnPoint").disabled = true;
    if (S.role === "view") { setStage("Warte auf das Bild …"); api.state({ active: true, role: "view", sending: false, peer: "" }); }
    $("optPresetLive").value = $("optPreset").value; $("optBufferLive").value = $("optBuffer").value;
    S.paused = false; S.muted = false; $("btnPause").setAttribute("aria-pressed", "false"); $("btnMute").setAttribute("aria-pressed", "false"); $("btnMute").disabled = !S.hasAudio;
    S.statTimer = setInterval(pollStats, 1000);
  }
  function tag(t) { $("stageTag").hidden = !t; $("stageTag").textContent = t || ""; }
  async function pollStats() {
    if (!S.pc || document.hidden && S.role === "host") return;
    let rep; try { rep = await S.pc.getStats(); } catch { return; }
    const all = [...rep.values()], now = performance.now(), last = S.stats.last, rows = [];
    const path = C.pathInfo(all);
    if (path) rows.push(["Weg", C.PATH_LABEL[path.kind], path.kind === "relay" ? "warn" : "ok"], ["Laufzeit", path.rtt != null ? path.rtt + " ms" : "–", path.rtt > 250 ? "warn" : ""]);
    const vid = all.find((s) => s.type === (S.role === "host" ? "outbound-rtp" : "inbound-rtp") && s.kind === "video");
    const aud = all.find((s) => s.type === (S.role === "host" ? "outbound-rtp" : "inbound-rtp") && s.kind === "audio");
    const bytes = (vid ? (vid.bytesSent ?? vid.bytesReceived ?? 0) : 0) + (aud ? (aud.bytesSent ?? aud.bytesReceived ?? 0) : 0);
    if (last) rows.push(["Datenrate", C.fmtRate(((bytes - last.bytes) * 8) / ((now - last.t) / 1000))]);
    if (vid) {
      if (vid.frameWidth) rows.push(["Bild", vid.frameWidth + " × " + vid.frameHeight + (vid.framesPerSecond ? " · " + Math.round(vid.framesPerSecond) + " fps" : "")]);
      if (S.role === "host" && vid.qualityLimitationReason && vid.qualityLimitationReason !== "none") rows.push(["Gebremst durch", { bandwidth: "Leitung", cpu: "Prozessor", other: "anderes" }[vid.qualityLimitationReason] || vid.qualityLimitationReason, "warn"]);
      if (S.role === "view") {
        if (last && vid.packetsReceived != null) { const lost = (vid.packetsLost || 0) - (last.lost || 0), got = vid.packetsReceived - (last.got || 0); const pct = got + lost > 0 ? (lost * 100) / (got + lost) : 0; rows.push(["Verlust", pct.toFixed(1).replace(".", ",") + " %", pct > 2 ? "bad" : pct > 0.5 ? "warn" : ""]); }
        if (vid.jitterBufferEmittedCount) rows.push(["Puffer", Math.round((vid.jitterBufferDelay / vid.jitterBufferEmittedCount) * 1000) + " ms"]);
        if (vid.freezeCount) rows.push(["Hänger", String(vid.freezeCount), vid.freezeCount > 3 ? "warn" : ""]);
      }
    }
    if (S.role === "host") {
      const rr = all.find((s) => s.type === "remote-inbound-rtp" && s.kind === "video");
      if (rr && rr.fractionLost != null) { const pct = rr.fractionLost * 100; rows.push(["Verlust", pct.toFixed(1).replace(".", ",") + " %", pct > 2 ? "bad" : pct > 0.5 ? "warn" : ""]); }
    }
    rows.push(["Ton", S.hasAudio ? (S.muted ? "aus" : "an") : "ohne"]);
    S.stats.last = { t: now, bytes, lost: vid?.packetsLost, got: vid?.packetsReceived }; S.stats.path = path; S.stats.video = vid ? { w: vid.frameWidth, h: vid.frameHeight, fps: vid.framesPerSecond, frames: vid.framesDecoded ?? vid.framesEncoded } : null;
    $("stats").replaceChildren(...rows.flatMap(([k, v, cls]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; if (cls) dd.dataset.k = cls; return [dt, dd]; }));
  }

  // ---------- Ende ----------
  function timer(fn, ms) { S.timers.push(setTimeout(fn, ms)); }
  function fail(t) { end(t, true); }
  function sigLost() { if (S.phase === "wait" || S.phase === "ask" || S.phase === "knock") fail("Verbindung zum Vermittlungsserver verloren."); }
  async function end(reason, isErr) {
    if (S.phase === "idle" && !reason) return;
    const was = S.phase; S.phase = "idle";
    try { if (S.peer && S.sig && was !== "wait") await S.sig.send("OFFER", S.peer.id, { k: "bye", sid: S.role === "host" ? S.peer.sid : S.sid }); } catch {}
    dcSend({ k: "bye" });
    for (const t of S.timers) clearTimeout(t); S.timers = []; clearInterval(S.statTimer);
    try { S.dc?.close(); } catch {} try { S.pc?.close(); } catch {}
    S.stream?.getTracks().forEach((t) => t.stop());
    S.sig?.close();
    Object.assign(S, { rung: false, pc: null, dc: null, sig: null, stream: null, peer: null, key: null, iceQ: [], connectedOnce: false, restarted: false, hasAudio: false, stats: { last: null } });
    $("vid").srcObject = null; setPointing(false); api.state({ active: false });
    lockTabs(false); $("btnJoin").disabled = !C.normCode($("inCode").value);
    setRole(S.role);
    if (reason) { if (isErr) err(reason); else { err(""); setStage(reason); } }
    if (S.role === "view" && reason) stateTxt("viewState", isErr ? "" : reason);
  }

  // ---------- Bedienung ----------
  const vol = () => Math.max(0, Math.min(1, (S.cfg.shareVolume ?? 100) / 100));
  function setPointing(on) { S.pointing = !!on; $("btnPoint").setAttribute("aria-pressed", String(S.pointing)); $("stage").classList.toggle("pointing", S.pointing); }
  function showLocalRing(x, y) {
    const v = $("vid"), r = v.getBoundingClientRect(), vw = v.videoWidth || 16, vh = v.videoHeight || 9, sc = Math.min(r.width / vw, r.height / vh);
    const ox = (r.width - vw * sc) / 2, oy = (r.height - vh * sc) / 2, el = $("ringLocal");
    el.hidden = false; el.style.left = ox + x * vw * sc + "px"; el.style.top = oy + y * vh * sc + "px"; el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(S.ringT); S.ringT = setTimeout(() => { el.hidden = true; }, 1900);
  }
  $("vid").addEventListener("click", (e) => {
    if (!S.pointing || S.role !== "view" || S.phase !== "live") return;
    const v = $("vid"), r = v.getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight; if (!vw || !vh) return;
    const sc = Math.min(r.width / vw, r.height / vh), ox = (r.width - vw * sc) / 2, oy = (r.height - vh * sc) / 2;
    const x = (e.clientX - r.left - ox) / (vw * sc), y = (e.clientY - r.top - oy) / (vh * sc);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    dcSend({ k: "ptr", x: +x.toFixed(4), y: +y.toFixed(4) }); showLocalRing(x, y);
  });
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else $("stage").requestFullscreen().catch(() => {}); };
  $("vid").addEventListener("dblclick", () => { if (!S.pointing) toggleFull(); });
  $("btnFull").onclick = toggleFull;
  $("btnPoint").onclick = () => setPointing(!S.pointing);
  $("vol").oninput = (e) => { S.cfg.shareVolume = +e.target.value; $("vid").volume = vol(); };
  $("vol").onchange = (e) => api.setConfig({ shareVolume: +e.target.value });
  for (const b of $("tabs").children) b.onclick = () => setRole(b.dataset.role);
  $("btnRefresh").onclick = loadSources;
  $("btnPrepare").onclick = () => { api.setConfig({ shareAudio: $("optAudio").checked }); S.cfg.shareAudio = $("optAudio").checked; hostPrepare(); };
  $("btnCopy").onclick = () => { navigator.clipboard.writeText(S.code || "").then(() => { $("btnCopy").textContent = "Kopiert"; setTimeout(() => { $("btnCopy").textContent = "Code kopieren"; }, 1500); }).catch(() => {}); };
  $("btnCancelHost").onclick = () => end("");
  $("btnAccept").onclick = hostAccept;
  $("btnReject").onclick = hostReject;
  $("btnJoin").onclick = viewJoin;
  $("inCode").addEventListener("input", () => { $("btnJoin").disabled = S.phase !== "idle" || !C.normCode($("inCode").value); });
  $("inCode").addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("btnJoin").disabled) viewJoin(); });
  $("btnEnd").onclick = () => end(S.role === "host" ? "Übertragung beendet." : "Verbindung getrennt.");
  $("btnPause").onclick = () => { const v = S.stream?.getVideoTracks()[0]; if (!v) return; S.paused = !S.paused; v.enabled = !S.paused; $("btnPause").setAttribute("aria-pressed", String(S.paused)); $("btnPause").textContent = S.paused ? "Bild fortsetzen" : "Bild anhalten"; dcSend({ k: "pause", on: S.paused }); };
  $("btnMute").onclick = () => { const a = S.stream?.getAudioTracks()[0]; if (!a) return; S.muted = !S.muted; a.enabled = !S.muted; $("btnMute").setAttribute("aria-pressed", String(S.muted)); $("btnMute").textContent = S.muted ? "Ton an" : "Ton aus"; };
  const onPreset = (v) => { S.cfg.sharePreset = v; api.setConfig({ sharePreset: v }); $("optPreset").value = v; $("optPresetLive").value = v; if (S.phase === "live") applyQuality(); };
  $("optPreset").onchange = (e) => onPreset(e.target.value); $("optPresetLive").onchange = (e) => onPreset(e.target.value);
  const onBuffer = (v) => { S.cfg.shareBuffer = v; api.setConfig({ shareBuffer: v }); $("optBuffer").value = v; $("optBufferLive").value = v; for (const r of S.pc?.getReceivers() || []) try { r.jitterBufferTarget = buffer().ms; } catch {} };
  $("optBuffer").onchange = (e) => onBuffer(e.target.value); $("optBufferLive").onchange = (e) => onBuffer(e.target.value);
  $("chatForm").onsubmit = (e) => { e.preventDefault(); const t = $("chatIn").value.trim(); if (!t || S.dc?.readyState !== "open") return; dcSend({ k: "chat", t: t.slice(0, 500) }); chat("Du", t, "me"); $("chatIn").value = ""; };
  api.onStopRequest(() => end(S.role === "host" ? "Übertragung beendet." : "Verbindung getrennt."));
  window.addEventListener("beforeunload", () => { if (S.phase !== "idle") { dcSend({ k: "bye" }); S.stream?.getTracks().forEach((t) => t.stop()); api.state({ active: false }); } });

  // Einstellungen-Dialog: ×, Schließen, Esc und Klick daneben schließen ihn
  const dlgOpen = () => { $("dlg").hidden = false; $("cfgName").focus(); };
  const dlgClose = () => { $("dlg").hidden = true; };
  $("btnSigTest").onclick = async () => {
    const out = $("sigTest"); out.textContent = "Prüfe …"; $("btnSigTest").disabled = true;
    const ice = await api.ice().catch(() => null), t = new window.ShareSignal.Multi(C.signalList(ice?.signal), "argus-t-" + C.randId(8), () => {});
    try { await t.connect(); } catch {}
    out.replaceChildren(...t.status.map((x) => { const li = document.createElement("li"); li.textContent = x.name + ": " + (x.ok ? "erreichbar" : "nicht erreichbar (" + x.err + ")"); li.dataset.k = x.ok ? "ok" : "bad"; return li; }));
    t.close(); $("btnSigTest").disabled = false;
  };
  $("btnSettings").onclick = dlgOpen; $("dlgX").onclick = dlgClose; $("dlgOk").onclick = dlgClose;
  $("dlg").addEventListener("mousedown", (e) => { if (e.target === $("dlg")) dlgClose(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("dlg").hidden) { e.preventDefault(); dlgClose(); } });
  const bindCfg = (id, key, conv = (v) => v.trim()) => $(id).addEventListener("change", (e) => { const v = e.target.type === "checkbox" ? e.target.checked : conv(e.target.value); S.cfg[key] = v; api.setConfig({ [key]: v }); if (key === "shareName") $("inName").value = v; });
  bindCfg("cfgName", "shareName", clean); bindCfg("cfgSignal", "shareSignal"); bindCfg("cfgStun", "shareStun"); bindCfg("cfgTurnUrl", "shareTurnUrl"); bindCfg("cfgTurnUser", "shareTurnUser"); bindCfg("cfgRelayOnly", "shareRelayOnly");
  $("cfgTurnPass").addEventListener("change", (e) => { const v = e.target.value; api.setConfig({ shareTurnPass: v }); e.target.value = ""; e.target.placeholder = v ? "gespeichert" : ""; });

  (async () => {
    S.cfg = (await api.config().catch(() => ({}))) || {};
    fillSelect($("optPreset"), C.PRESETS, S.cfg.sharePreset); fillSelect($("optPresetLive"), C.PRESETS, S.cfg.sharePreset);
    fillSelect($("optBuffer"), C.BUFFERS, S.cfg.shareBuffer || "normal"); fillSelect($("optBufferLive"), C.BUFFERS, S.cfg.shareBuffer || "normal");
    $("optAudio").checked = S.cfg.shareAudio !== false;
    $("inName").value = S.cfg.shareName || ""; $("cfgName").value = S.cfg.shareName || "";
    $("cfgSignal").value = S.cfg.shareSignal || ""; $("cfgSignal").placeholder = "leer = Standard: " + C.DEFAULT_SIGNAL;
    $("cfgStun").value = S.cfg.shareStun ?? ""; $("cfgStun").placeholder = C.DEFAULT_STUN;
    $("cfgTurnUrl").value = S.cfg.shareTurnUrl || ""; $("cfgTurnUser").value = S.cfg.shareTurnUser || ""; $("cfgTurnPass").placeholder = S.cfg.hasTurnPass ? "gespeichert" : "";
    $("cfgRelayOnly").checked = !!S.cfg.shareRelayOnly; $("vol").value = String(S.cfg.shareVolume ?? 100);
    const start = new URLSearchParams(location.search).get("rolle");
    setRole(start === "view" ? "view" : "host");
  })();
})();
