// Bildschirm übertragen: Vermittlung. Mehrere Server gleichzeitig (PeerJS und MQTT über WebSocket), damit ein
// ausgefallener oder gesperrter Server die Verbindung nicht verhindert. Über die Server laufen nur verschlüsselte
// Nachrichten an Hash-Adressen (siehe share-core.js), nie Bild oder Ton.
// Adressen: „wss://…“ = PeerJS-Server, „mqtt+wss://…“ = MQTT-Broker (WebSocket).
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m; else root.ShareSignal = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const WS = () => (typeof WebSocket !== "undefined" ? WebSocket : require("ws"));
  // WebSocket-Ersatz über den Hauptprozess (preload-share.js: wsOpen/wsSend/wsClose/onWs)
  const viaMain = new Map(); let hooked = false;
  class MainWS {
    constructor(url, proto) {
      const api = (typeof window !== "undefined" && window.share) || null;
      this.readyState = 0; this.binaryType = "arraybuffer"; this.api = api; this.id = 0; this.err = "";
      if (!api?.wsOpen) { setTimeout(() => this._close({ code: 0, reason: "nicht verfügbar" }), 0); return; }
      if (!hooked) { hooked = true; api.onWs((id, k, v) => viaMain.get(id)?._ev(k, v)); }
      api.wsOpen(url, proto || "").then((id) => { if (!id) return this._close({ code: 0, reason: "abgelehnt" }); this.id = id; viaMain.set(id, this); if (this.readyState === 3) api.wsClose(id); });
    }
    _ev(k, v) {
      if (k === "open") { this.readyState = 1; this.onopen?.(); }
      else if (k === "message") this.onmessage?.({ data: typeof v === "string" ? v : v instanceof Uint8Array ? v : new Uint8Array(v) });
      else if (k === "error") this.err = v;
      else if (k === "close") this._close(v);
    }
    _close(v) { if (this.readyState === 3) return; this.readyState = 3; viaMain.delete(this.id); this.onclose?.({ code: v?.code ?? 0, reason: v?.reason || this.err }); }
    send(d) { if (this.readyState === 1) this.api.wsSend(this.id, d); }
    close() { if (this.id && this.readyState !== 3) this.api.wsClose(this.id); this._close({ code: 1000 }); }
  }
  const rnd = (n) => { const b = new Uint8Array(n); (typeof crypto !== "undefined" ? crypto : require("crypto").webcrypto).getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };
  const host = (u) => { try { return new URL(u.replace(/^mqtt\+/, "")).host; } catch { return u; } };
  const TIMEOUT = 9000;
  // Grund aus dem WebSocket-Ende lesbar machen (1006 = Verbindung kam gar nicht zustande, meist Firewall, Virenschutz oder Proxy)
  const closeText = (ev) => { const c = ev?.code; const r = ev?.reason ? ", " + String(ev.reason).slice(0, 80) : ""; return c === 1006 ? "Verbindung abgewiesen (1006" + r + ")" : c === 0 ? "nicht erreichbar" + r : "getrennt (Code " + (c ?? "?") + r + ")"; };

  // ---------- PeerJS (Protokoll des PeerJS-Servers: OPEN, HEARTBEAT, Weiterleitung mit dst/src) ----------
  class Peerjs {
    constructor(url, id, Sock) { this.Sock = Sock || null; this.url = url; this.id = id; this.ws = null; this.hb = null; this.closed = false; this.onmsg = null; this.onclose = null; this.name = host(url); }
    connect() {
      return new Promise((resolve, reject) => {
        const q = (this.url.includes("?") ? "&" : "?") + (/[?&]key=/.test(this.url) ? "" : "key=peerjs&") + "id=" + encodeURIComponent(this.id) + "&token=" + rnd(6) + "&version=1.5.4";
        let done = false; const fin = (e) => { if (done) return; done = true; clearTimeout(t); if (e) { try { this.ws.close(); } catch {} reject(e); } else resolve(); };
        const t = setTimeout(() => fin(new Error("keine Antwort")), TIMEOUT);
        try { this.ws = new (this.Sock || WS())(this.url + q); } catch { return fin(new Error("Adresse ungültig")); }
        this.ws.onmessage = (ev) => {
          let m; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
          if (!m || typeof m.type !== "string") return;
          if (!done) {
            if (m.type === "OPEN") { this.hb = setInterval(() => this.raw({ type: "HEARTBEAT" }), 5000); return fin(); }
            if (m.type === "ID-TAKEN") return fin(new Error("Adresse belegt"));
            if (m.type === "ERROR") return fin(new Error("Fehler: " + (m.payload?.msg || "unbekannt")));
          }
          if (["OFFER", "ANSWER", "CANDIDATE"].includes(m.type) && m.src && m.payload) this.onmsg?.({ type: m.type, src: m.src, payload: m.payload });
        };
        this.ws.onclose = (ev) => { clearInterval(this.hb); if (!done) fin(new Error(closeText(ev))); else if (!this.closed) this.onclose?.(); };
        this.ws.onerror = () => {};
      });
    }
    raw(o) { try { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); } catch {} }
    send(type, dst, payload) { this.raw({ type, dst, payload }); }
    close() { this.closed = true; clearInterval(this.hb); try { this.ws?.close(); } catch {} }
  }

  // ---------- MQTT 3.1.1 über WebSocket, nur QoS 0 (CONNECT, SUBSCRIBE, PUBLISH, PING) ----------
  const te = new TextEncoder(), td = new TextDecoder();
  const str = (s) => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  function packet(type, body) {
    const len = []; let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    return new Uint8Array([type, ...len, ...body]);
  }
  const TOPIC = (id) => "argus-share/v1/" + id;
  class Mqtt {
    constructor(url, id, Sock) { this.Sock = Sock || null; this.url = url.replace(/^mqtt\+/, ""); this.id = id; this.ws = null; this.ping = null; this.closed = false; this.buf = new Uint8Array(0); this.onmsg = null; this.onclose = null; this.name = host(url); }
    connect() {
      return new Promise((resolve, reject) => {
        let done = false, stage = 0; const fin = (e) => { if (done) return; done = true; clearTimeout(t); if (e) { try { this.ws.close(); } catch {} reject(e); } else resolve(); };
        const t = setTimeout(() => fin(new Error("keine Antwort")), TIMEOUT);
        try { this.ws = new (this.Sock || WS())(this.url, "mqtt"); } catch { return fin(new Error("Adresse ungültig")); }
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
          // Client-ID höchstens 23 Zeichen (strenge Broker), Clean Session, Keepalive 60 s
          this.out(packet(0x10, [...str("MQTT"), 4, 0x02, 0, 60, ...str("ar" + rnd(10))]));
        };
        this.ws.onmessage = (ev) => {
          const d = new Uint8Array(ev.data instanceof ArrayBuffer ? ev.data : ev.data.buffer ? ev.data.buffer.slice(ev.data.byteOffset, ev.data.byteOffset + ev.data.byteLength) : new ArrayBuffer(0));
          const all = new Uint8Array(this.buf.length + d.length); all.set(this.buf); all.set(d, this.buf.length); this.buf = all;
          for (;;) {
            if (this.buf.length < 2) break;
            let mult = 1, len = 0, i = 1, b;
            do { if (i >= this.buf.length) return; b = this.buf[i++]; len += (b & 127) * mult; mult *= 128; } while (b & 128 && i < 5);
            if (this.buf.length < i + len) break;
            const type = this.buf[0], body = this.buf.slice(i, i + len); this.buf = this.buf.slice(i + len);
            if ((type & 0xf0) === 0x20) { // CONNACK
              if (body[1] !== 0) return fin(new Error("abgelehnt (" + body[1] + ")"));
              stage = 1; this.out(packet(0x82, [0, 1, ...str(TOPIC(this.id)), 0]));
            } else if ((type & 0xf0) === 0x90) { // SUBACK
              if (body[2] === 0x80) return fin(new Error("Abo abgelehnt"));
              if (stage === 1) { stage = 2; this.ping = setInterval(() => this.out(packet(0xc0, [])), 30000); fin(); }
            } else if ((type & 0xf0) === 0x30) { // PUBLISH (QoS 0)
              const tl = (body[0] << 8) | body[1], qos = (type >> 1) & 3, off = 2 + tl + (qos ? 2 : 0);
              let m; try { m = JSON.parse(td.decode(body.slice(off))); } catch { continue; }
              if (m && typeof m.type === "string" && m.src && m.payload) this.onmsg?.({ type: m.type, src: String(m.src), payload: m.payload });
            }
          }
        };
        this.ws.onclose = (ev) => { clearInterval(this.ping); if (!done) fin(new Error(closeText(ev))); else if (!this.closed) this.onclose?.(); };
        this.ws.onerror = () => {};
      });
    }
    out(u8) { try { if (this.ws?.readyState === 1) this.ws.send(u8); } catch {} }
    send(type, dst, payload) { this.out(packet(0x30, [...str(TOPIC(dst)), ...te.encode(JSON.stringify({ type, src: this.id, payload }))])); }
    close() { this.closed = true; clearInterval(this.ping); try { this.out(packet(0xe0, [])); this.ws?.close(); } catch {} }
  }

  // ---------- Mehrere Server zugleich ----------
  // Verbindet alle, wartet bis jeder geantwortet hat oder abgelaufen ist. Antworten gehen über den Server,
  // über den die Gegenseite zuletzt geschrieben hat; solange das unbekannt ist, über alle. Doppelte Nachrichten (gleiche iv) fallen weg.
  class Multi {
    constructor(urls, id, onMsg, onClose) {
      this.id = id; this.onMsg = onMsg; this.onClose = onClose; this.route = new Map(); this.seen = new Set(); this.chain = Promise.resolve(); this.closed = false;
      this.mk = (u, Sock) => (/^mqtt\+wss?:\/\//i.test(u) ? new Mqtt(u, id, Sock) : new Peerjs(u, id, Sock));
      this.urls = [...new Set(urls)].slice(0, 6); this.list = this.urls.map((u) => this.mk(u));
      this.status = this.list.map((t) => ({ name: t.name, ok: false, err: "" }));
    }
    async connect() {
      const res = await Promise.allSettled(this.list.map((t) => t.connect()));
      res.forEach((r, i) => { this.status[i].ok = r.status === "fulfilled"; this.status[i].err = r.status === "rejected" ? r.reason?.message || "Fehler" : ""; });
      // Was direkt nicht ging, noch einmal über den Hauptprozess versuchen (anderer Netzwerkweg, ohne Browser-Filter)
      const failed = this.status.map((s, i) => (s.ok ? -1 : i)).filter((i) => i >= 0);
      if (failed.length && typeof window !== "undefined" && window.share?.wsOpen && !this.closed) {
        const again = await Promise.allSettled(failed.map((i) => { const t = this.mk(this.urls[i], MainWS); this.list[i] = t; return t.connect(); }));
        again.forEach((r, j) => { const st = this.status[failed[j]]; if (r.status === "fulfilled") { st.ok = true; st.via = "Hauptprozess"; st.err = ""; } else st.err += "; über Hauptprozess: " + (r.reason?.message || "Fehler"); });
      }
      this.open = this.list.filter((_t, i) => this.status[i].ok);
      for (const t of this.open) {
        t.onmsg = (m) => {
          const key = m.payload && (m.payload.iv || JSON.stringify(m.payload).slice(0, 80)); if (this.seen.has(key)) return;
          this.seen.add(key); if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-500));
          this.route.set(m.src, t);
          this.chain = this.chain.then(() => (this.closed ? null : this.onMsg(m))).catch(() => {}); // strikt nacheinander
        };
        t.onclose = () => { this.open = this.open.filter((x) => x !== t); for (const [k, v] of this.route) if (v === t) this.route.delete(k); if (!this.open.length && !this.closed) this.onClose?.(); };
      }
      if (!this.open.length) throw Object.assign(new Error("Kein Vermittlungsserver erreichbar: " + this.status.map((s) => s.name + " (" + s.err + ")").join(", ") + ". Firewall, Virenschutz oder Netzwerk sperren vermutlich WebSocket-Verbindungen."), { status: this.status });
      return this.status;
    }
    send(type, dst, payload) { const r = this.route.get(dst); for (const t of r && this.open.includes(r) ? [r] : this.open) t.send(type, dst, payload); }
    close() { this.closed = true; for (const t of this.list) t.close(); }
  }
  return { Multi, Peerjs, Mqtt, MainWS, TOPIC };
});
