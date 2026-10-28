"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const brave = require("../app/youtube-brave");
test("Brave discovery and missing-browser path never substitute Electron", async () => {
  assert.equal(brave.findExecutable({ PROGRAMFILES: "fixture" }, () => false), null);
  assert.deepEqual(await brave.launch({ env: {}, spawn: () => { throw Error("must not launch"); } }), { ok: false, error: "missing" });
});
test("real Brave launch uses one app URL argument and no shell/security overrides", async () => {
  let observed;
  const result = await brave.launch({ env: { PROGRAMFILES: "fixture" }, exists: () => true,
    query: "https://www.youtube.com/watch?v=TLkA0RELQ1g", spawn: (exe, args, options) => {
      observed = { exe, args, options }; const child = new EventEmitter(); child.unref = () => {};
      queueMicrotask(() => child.emit("spawn")); return child;
    } });
  assert.deepEqual(result, { ok: true }); assert.match(observed.exe, /Brave-Browser/);
  assert.deepEqual(observed.args, ["--app=https://www.youtube.com/watch?v=TLkA0RELQ1g"]);
  assert.equal(observed.options.shell, false); assert.equal(observed.options.windowsHide, false);
});
test("launch errors are reported without a different engine or a URL in diagnostics", async () => {
  const result = await brave.launch({ env: { PROGRAMFILES: "fixture" }, exists: () => true, spawn: () => {
    const child = new EventEmitter(); queueMicrotask(() => child.emit("error", new Error("private details"))); return child;
  } });
  assert.deepEqual(result, { ok: false, error: "launch" });
});
test("target URLs stay on HTTPS YouTube; other input becomes a search", () => {
  for (const value of ["javascript:alert(1)", "https://youtube.com.evil.invalid/", "https://user:secret@youtube.com/", "http://youtube.com/", "https://youtube.com:8443/"]) assert.equal(brave.youtubeUrl(value), null);
  assert.equal(brave.target("", "https://evil.invalid/"), "https://www.youtube.com/");
  assert.equal(brave.target('test " & --flag', ""), 'https://www.youtube.com/results?search_query=test%20%22%20%26%20--flag');
  assert.equal(brave.youtubeUrl("https://www.youtube.com/watch?v=example&token=secret#fragment"), "https://www.youtube.com/watch?v=example");
});
test("intentional Brave migration backs up old mode and does not overwrite later choices", () => {
  const old = { ytMode: "panel", ytOpen: "panel" }, patch = brave.migrate(old);
  assert.equal(patch.ytMode, "brave"); assert.equal(patch.ytOpen, "");
  assert.deepEqual(patch.ytBeforeBrave, { mode: "panel", open: "panel" });
  assert.deepEqual(brave.migrate({ ...old, ...patch, ytMode: "fenster" }), {});
});
