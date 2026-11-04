// Bildschirm übertragen: Code, Unterschrift, Opus-Einstellungen, Verbindungsart (reine Funktionen)
const test = require("node:test"), assert = require("node:assert");
const C = require("../app/share-core.js");

test("R-SHARE-1 Code: 9 Zeichen ohne verwechselbare Zeichen, Eingabe tolerant", () => {
  for (let i = 0; i < 200; i++) { const c = C.newCode(); assert.match(c, /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/); }
  assert.equal(C.normCode(" abc def ghj "), "ABC-DEF-GHJ");
  assert.equal(C.normCode("abc-def-ghj"), "ABC-DEF-GHJ");
  assert.equal(C.normCode("ABC-DEF-GH"), null);
  assert.equal(C.normCode("ABC-DEF-GH0"), null); // 0 kommt nicht vor
  assert.notEqual(C.newCode(), C.newCode());
});
test("R-SHARE-2 Adresse am Server ist ein Hash, nie der Code; gleicher Code = gleiche Adresse", async () => {
  const a = await C.derive("ABC-DEF-GHJ"), b = await C.derive("abcdefghj"), c = await C.derive("ABC-DEF-GHK");
  assert.equal(a.hostId, b.hostId); assert.notEqual(a.hostId, c.hostId);
  assert.match(a.hostId, /^argus-[0-9a-f]{24}$/); assert.ok(!a.hostId.toUpperCase().includes("ABCDEFGHJ"));
});
test("R-SHARE-3 Nachrichten: verschlüsselt, nur mit dem richtigen Code lesbar, Fälschung wird verworfen", async () => {
  const k = (await C.derive("ABC-DEF-GHJ")).key, other = (await C.derive("ABC-DEF-GHK")).key;
  const p = await C.seal(k, { k: "hello", name: "Test", sid: "1" });
  assert.ok(!JSON.stringify(p).includes("Test") && !JSON.stringify(p).includes("hello"));
  assert.deepEqual(await C.open(k, p), { k: "hello", name: "Test", sid: "1" });
  assert.equal(await C.open(other, p), null);
  const bytes = Buffer.from(p.c, "base64"); bytes[3] ^= 1;
  assert.equal(await C.open(k, { ...p, c: bytes.toString("base64") }), null);
  assert.notEqual((await C.seal(k, { a: 1 })).iv, (await C.seal(k, { a: 1 })).iv);
  assert.equal(await C.open(k, null), null); assert.equal(await C.open(k, { v: 1, iv: 1, c: 2 }), null);
});
test("R-SHARE-4 Opus: Stereo und hohe Bitrate, bestehende Parameter bleiben", () => {
  const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 63\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:63 red/48000/2\r\n";
  const out = C.tuneOpus(sdp, 192);
  assert.match(out, /a=fmtp:111 [^\r\n]*minptime=10/); assert.match(out, /stereo=1/); assert.match(out, /sprop-stereo=1/); assert.match(out, /maxaveragebitrate=192000/);
  assert.equal((out.match(/a=fmtp:111/g) || []).length, 1);
  const noFmtp = "m=audio 9 x 111\r\na=rtpmap:111 opus/48000/2\r\n";
  assert.match(C.tuneOpus(noFmtp), /a=rtpmap:111 opus\/48000\/2\r\na=fmtp:111 stereo=1/);
  assert.equal(C.tuneOpus("m=video 9 x 96\r\n"), "m=video 9 x 96\r\n");
});
test("R-SHARE-5 Verbindungsart aus den Statistiken: direkt, Heimnetz, TURN", () => {
  const mk = (l, r) => [{ id: "T", type: "transport", selectedCandidatePairId: "P" }, { id: "P", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R", currentRoundTripTime: 0.042 },
    { id: "L", type: "local-candidate", candidateType: l, protocol: "udp" }, { id: "R", type: "remote-candidate", candidateType: r }];
  assert.equal(C.pathInfo(mk("srflx", "srflx")).kind, "direct");
  assert.equal(C.pathInfo(mk("host", "host")).kind, "lan");
  assert.equal(C.pathInfo(mk("relay", "srflx")).kind, "relay");
  assert.equal(C.pathInfo(mk("srflx", "prflx")).rtt, 42);
  assert.equal(C.pathInfo([]), null);
});
test("R-SHARE-6 ICE-Server: nur gültige STUN/TURN-Adressen, TURN mit Zugangsdaten", () => {
  const s = C.iceServers({ stun: C.DEFAULT_STUN + ", http://evil, stun:x.example:3478", turnUrl: "turn:turn.example.org:3478?transport=udp turns:turn.example.org:5349", turnUser: "u", turnPass: "p" });
  assert.deepEqual(s[0].urls, ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478", "stun:x.example:3478"]);
  assert.deepEqual(s[1], { urls: ["turn:turn.example.org:3478?transport=udp", "turns:turn.example.org:5349"], username: "u", credential: "p" });
  assert.deepEqual(C.iceServers({}), []);
  for (const p of Object.values(C.PRESETS)) assert.ok(p.kbps > 0 && p.fps > 0 && ["motion", "detail"].includes(p.hint));
});
