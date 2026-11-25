"use strict";
// 0.59.4: Ein Video, bei dem Argus abstürzt, darf beim nächsten Start nicht wieder automatisch geladen werden (Absturzschleife)
const test = require("node:test"), assert = require("node:assert/strict");
const guard = require("../app/youtube-guard");
const yt = require("../app/youtube-settings");
const V = "https://www.youtube.com/watch?v=abcDEF12345";
test("video ids are recognised for watch, shorts, live and youtu.be", () => {
  assert.equal(guard.key(V + "&t=40s&list=x"), "abcDEF12345");
  assert.equal(guard.key("https://www.youtube.com/shorts/abcDEF12345"), "abcDEF12345");
  assert.equal(guard.key("https://youtu.be/abcDEF12345?t=3"), "abcDEF12345");
  assert.equal(guard.key("https://www.youtube.com/"), null);
  assert.equal(guard.key("https://evil.invalid/watch?v=abcDEF12345"), null);
});
test("a video still marked as loading at start is blocked and not reopened", () => {
  const cfg = { ytLoading: { url: V, at: 1 }, ytLast: { url: V, t: 120 }, ytOpen: "panel" };
  const g = guard.startup(cfg, true);
  assert.equal(g.reason, "video");
  assert.deepEqual(g.patch.ytBad, ["abcDEF12345"]);
  assert.equal(g.patch.ytLoading, null); assert.equal(g.patch.ytLast, null); assert.equal(g.patch.ytOpen, "");
  const next = { ...cfg, ...g.patch, ytLast: { url: V, t: 0 } };
  assert.equal(guard.resume(next, V), guard.HOME);
  assert.equal(yt.target("", guard.resume(next, V)), "https://www.youtube.com/");
});
test("an unclean end while a video was resumed starts YouTube on the home page", () => {
  const g = guard.startup({ ytLast: { url: V, t: 5 }, ytOpen: "panel" }, true);
  assert.equal(g.reason, "unclean"); assert.equal(g.patch.ytLast, null); assert.equal(g.patch.ytOpen, "");
});
test("a clean start changes nothing", () => {
  const g = guard.startup({ ytLast: { url: V, t: 5 }, ytOpen: "panel", ytLoading: null }, false);
  assert.equal(g.reason, ""); assert.deepEqual(g.patch, {});
});
test("explicitly reopened video that ran stable is released; list stays bounded", () => {
  const many = Array.from({ length: 30 }, (_, i) => "id" + String(i).padStart(9, "0"));
  const g = guard.startup({ ytBad: many, ytLoading: { url: V } }, true);
  assert.equal(g.patch.ytBad.length, 20); assert.equal(g.patch.ytBad[0], "abcDEF12345");
  assert.deepEqual(guard.release({ ytBad: ["abcDEF12345", "x"] }, V), ["x"]);
});
test("ad filter never answers with a redirect (Electron 33 crashed on it), blocks instead", () => {
  const calls = [], b = { onBeforeRequest(d, cb) { calls.push(this === b); cb(d.r); } };
  guard.noRedirects(b); guard.noRedirects(b);
  const out = []; for (const r of [{ redirectURL: "data:text/javascript,;" }, { cancel: true }, {}, undefined]) b.onBeforeRequest({ r }, (x) => out.push(x));
  assert.deepEqual(out, [{ cancel: true }, { cancel: true }, {}, {}]); assert.deepEqual(calls, [true, true, true, true]);
});
test("wrapper works with the real Ghostery blocker and its session context", () => {
  const { ElectronBlocker } = require("@ghostery/adblocker-electron");
  const b = ElectronBlocker.parse("||ads.example^$script,redirect=noopjs\n||track.example^");
  guard.noRedirects(b);
  const ask = (url) => new Promise((r) => b.onBeforeRequest({ id: 1, url, resourceType: "script", referrer: "https://www.youtube.com/", webContentsId: 1 }, r));
  return Promise.all([ask("https://ads.example/x.js"), ask("https://track.example/t.js"), ask("https://ok.example/a.js")]).then(([a, t, ok]) => {
    assert.deepEqual(a, { cancel: true }); assert.deepEqual(t, { cancel: true }); assert.deepEqual(ok, {});
  });
});
