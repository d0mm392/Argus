// Bildschirm übertragen: reine Hilfsfunktionen (Code, Signatur, SDP, Qualitätsstufen, Verbindungsart).
// Läuft im Übertragungsfenster und unter Node (Tests). Keine Netzwerkzugriffe hier.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m; else root.ShareCore = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // Ohne leicht verwechselbare Zeichen (0/O, 1/I/L)
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const CODE_LEN = 9;
  const cryptoObj = () => (typeof crypto !== "undefined" ? crypto : require("crypto").webcrypto);

  function newCode() {
    const out = [], buf = new Uint8Array(32);
    while (out.length < CODE_LEN) {
      cryptoObj().getRandomValues(buf);
      for (const b of buf) { if (b < 248 && out.length < CODE_LEN) out.push(ALPHA[b % 31]); } // 248 = 8 * 31, gleichverteilt
    }
    return fmtCode(out.join(""));
  }
  const fmtCode = (c) => c.slice(0, 3) + "-" + c.slice(3, 6) + "-" + c.slice(6, 9);
  // Eingabe säubern: Leerzeichen, Striche, Kleinbuchstaben sind egal
  function normCode(s) {
    const c = String(s || "").toUpperCase().replace(/[\s\-_.]/g, "");
    if (c.length !== CODE_LEN || [...c].some((ch) => !ALPHA.includes(ch))) return null;
    return fmtCode(c);
  }
  const enc = (s) => new TextEncoder().encode(s);
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  // Aus dem Code entstehen zwei Dinge: die Adresse am Vermittlungsserver (nur ein Hash, der Code selbst geht nie raus)
  // und ein Schlüssel, mit dem jede Nachricht verschlüsselt wird (AES-GCM). Der Server sieht weder Namen noch
  // Verbindungsdaten und kann nichts fälschen oder umleiten.
  async function derive(code) {
    const c = normCode(code); if (!c) throw new Error("Code ungültig");
    const sub = cryptoObj().subtle;
    const id = hex(await sub.digest("SHA-256", enc("argus-share-id:" + c))).slice(0, 24);
    const raw = await sub.digest("SHA-256", enc("argus-share-key:" + c));
    const key = await sub.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    return { code: c, hostId: "argus-" + id, key };
  }
  const b64 = (u8) => { let s = ""; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  async function seal(key, data) {
    const iv = new Uint8Array(12); cryptoObj().getRandomValues(iv);
    const ct = await cryptoObj().subtle.encrypt({ name: "AES-GCM", iv }, key, enc(JSON.stringify(data)));
    return { v: 1, iv: b64(iv), c: b64(new Uint8Array(ct)) };
  }
  async function open(key, payload) {
    try {
      if (!payload || payload.v !== 1 || typeof payload.iv !== "string" || typeof payload.c !== "string" || payload.c.length > 200000) return null;
      const iv = unb64(payload.iv); if (iv.length !== 12) return null;
      const pt = await cryptoObj().subtle.decrypt({ name: "AES-GCM", iv }, key, unb64(payload.c));
      const v = JSON.parse(new TextDecoder().decode(pt));
      return v && typeof v === "object" ? v : null;
    } catch { return null; }
  }
  const randId = (n = 16) => { const b = new Uint8Array(n); cryptoObj().getRandomValues(b); return hex(b); };

  // Opus: Stereo, hohe Bitrate, Fehlerkorrektur. Musik und Filmton klingen sonst dünn (Standard ist Mono, ca. 32 kbit/s).
  function tuneOpus(sdp, kbps = 192) {
    const m = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp); if (!m) return sdp;
    const pt = m[1], want = { stereo: "1", "sprop-stereo": "1", maxaveragebitrate: String(kbps * 1000), useinbandfec: "1", usedtx: "0" };
    const re = new RegExp("a=fmtp:" + pt + " ([^\\r\\n]*)");
    if (re.test(sdp)) {
      return sdp.replace(re, (_x, params) => {
        const kv = {}; params.split(";").map((p) => p.trim()).filter(Boolean).forEach((p) => { const i = p.indexOf("="); kv[i < 0 ? p : p.slice(0, i)] = i < 0 ? "" : p.slice(i + 1); });
        Object.assign(kv, want);
        return "a=fmtp:" + pt + " " + Object.entries(kv).map(([k, v]) => (v === "" ? k : k + "=" + v)).join(";");
      });
    }
    return sdp.replace(m[0], m[0] + "\r\na=fmtp:" + pt + " " + Object.entries(want).map(([k, v]) => k + "=" + v).join(";"));
  }

  // Qualitätsstufen. hint: „motion“ hält die Bildrate (Filme, Spiele), „detail“ hält die Schärfe (Text, Hilfe am PC).
  const PRESETS = {
    film: { label: "Film und Stream (1080p, 30 Bilder)", w: 1920, h: 1080, fps: 30, kbps: 8000, hint: "motion", degr: "maintain-framerate" },
    smooth: { label: "Flüssig (1080p, 60 Bilder)", w: 1920, h: 1080, fps: 60, kbps: 12000, hint: "motion", degr: "maintain-framerate" },
    help: { label: "Hilfe am PC (scharfer Text, 15 Bilder)", w: 2560, h: 1440, fps: 15, kbps: 5000, hint: "detail", degr: "maintain-resolution" },
    saver: { label: "Sparsam (720p, 30 Bilder, schwache Leitung)", w: 1280, h: 720, fps: 30, kbps: 2500, hint: "motion", degr: "balanced" },
    max: { label: "Maximal (1440p, 60 Bilder, schnelle Leitung)", w: 2560, h: 1440, fps: 60, kbps: 20000, hint: "motion", degr: "maintain-framerate" },
  };
  // Puffer beim Zuschauer: klein = weniger Verzögerung, groß = ruckelfreier bei wackeliger Leitung. Gilt für Bild und Ton gleich, damit beide synchron bleiben.
  const BUFFERS = { low: { label: "Gering (Hilfe, Gespräch)", ms: 0 }, normal: { label: "Normal", ms: 150 }, stable: { label: "Stabil (Filme, wackelige Leitung)", ms: 400 } };

  // Welche Verbindung tatsächlich läuft: direkt (host/srflx/prflx) oder über einen TURN-Server (relay)
  function pathInfo(stats) {
    const all = Array.isArray(stats) ? stats : [...stats.values()];
    const byId = (id) => all.find((s) => s.id === id);
    const tr = all.find((s) => s.type === "transport" && s.selectedCandidatePairId);
    const pair = (tr && byId(tr.selectedCandidatePairId)) || all.find((s) => s.type === "candidate-pair" && s.nominated && s.state === "succeeded");
    if (!pair) return null;
    const l = byId(pair.localCandidateId) || {}, r = byId(pair.remoteCandidateId) || {};
    const relay = l.candidateType === "relay" || r.candidateType === "relay";
    const lan = !relay && l.candidateType === "host" && r.candidateType === "host";
    return { kind: relay ? "relay" : lan ? "lan" : "direct", local: l.candidateType || "?", remote: r.candidateType || "?", proto: l.protocol || "", rtt: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null };
  }
  const PATH_LABEL = { direct: "Direktverbindung", lan: "Direkt im Heimnetz", relay: "Über TURN-Server (Umweg)" };
  const fmtRate = (bps) => (bps == null ? "–" : bps >= 1e6 ? (bps / 1e6).toFixed(1).replace(".", ",") + " Mbit/s" : Math.round(bps / 1e3) + " kbit/s");

  // STUN-Liste aus dem Einstellungsfeld (eine Adresse pro Zeile oder durch Komma getrennt)
  function iceServers(cfg) {
    const out = [];
    const stun = String(cfg.stun || "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^stuns?:[\w.\-]+(:\d+)?$/i.test(s));
    if (stun.length) out.push({ urls: stun });
    const turn = String(cfg.turnUrl || "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^turns?:[\w.\-]+(:\d+)?(\?transport=(udp|tcp))?$/i.test(s));
    if (turn.length) out.push({ urls: turn, username: String(cfg.turnUser || ""), credential: String(cfg.turnPass || "") });
    return out;
  }
  const DEFAULT_STUN = "stun:stun.l.google.com:19302, stun:stun.cloudflare.com:3478";
  // Mehrere öffentliche Vermittlungen zugleich: fällt eine aus oder ist sie gesperrt, läuft es über die anderen
  const DEFAULT_SIGNALS = ["wss://0.peerjs.com/peerjs", "mqtt+wss://broker.emqx.io:8084/mqtt", "mqtt+wss://broker.hivemq.com:8884/mqtt"];
  const DEFAULT_SIGNAL = DEFAULT_SIGNALS.join(", ");
  function signalList(s) {
    const l = String(s || "").split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^(mqtt\+)?wss?:\/\/[^\s/]+/i.test(x));
    return l.length ? l.slice(0, 6) : DEFAULT_SIGNALS.slice();
  }

  return { ALPHA, newCode, normCode, derive, seal, open, randId, tuneOpus, PRESETS, BUFFERS, pathInfo, PATH_LABEL, fmtRate, iceServers, DEFAULT_STUN, DEFAULT_SIGNAL, DEFAULT_SIGNALS, signalList };
});
