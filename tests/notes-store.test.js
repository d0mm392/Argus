"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { migrate } = require("../app/notes-store");
test("legacy notes migrate only to Start, with a lossless backup and stable IDs", () => {
  const old = { notesText: "legacy", notesPages: [{ id: "old", name: "Notebook", text: "text", extra: { keep: true } }], notesCur: "old", customPages: ["Office"] };
  const original = JSON.stringify(old), result = migrate(old, () => "fixture");
  assert.equal(JSON.stringify(old), original);
  assert.deepEqual(result.notesLegacyBackup, { notesText: old.notesText, notesPages: old.notesPages, notesCur: old.notesCur });
  assert.deepEqual(result.notesByPage.start.pages, old.notesPages);
  assert.deepEqual(Object.keys(result.notesByPage), ["start"]);
  assert.equal(result.pageIds.Office, "page-fixture");
  assert.deepEqual(migrate({ ...old, ...result }, () => { throw Error("must not allocate again"); }), result);
});
test("existing scoped notebooks and their metadata survive migration", () => {
  const existing = { start: { pages: [{ id: "scoped", text: "newer" }], width: 333 }, gaming: { pages: [{ id: "game", text: "game" }] } };
  const result = migrate({ notesText: "older", notesByPage: existing }, () => "id");
  assert.deepEqual(result.notesByPage, existing);
  assert.equal(result.notesLegacyBackup.notesText, "older");
});
test("legacy text-only config and special custom names preserve content", () => {
  const result = migrate({ notesText: "\u00e4\n\ud83d\ude80", customPages: ["__proto__"] }, () => "safe");
  assert.equal(result.notesByPage.start.pages[0].text, "\u00e4\n\ud83d\ude80");
  assert.equal(Object.getOwnPropertyDescriptor(result.pageIds, "__proto__").value, "page-safe");
});
test("confirmed shutdown persistence writes a detached snapshot and backup before config", () => {
  const config = {}, snapshot = { pageIds: { Start: "start" }, notesByPage: { start: { pages: [{ id: "n1", text: "last" }] } } }, writes = [];
  require("../app/notes-persistence").flush(config, snapshot, () => writes.push("backup"), () => writes.push("config"));
  assert.deepEqual(writes, ["backup", "config"]);
  snapshot.notesByPage.start.pages[0].text = "later";
  assert.equal(config.notesByPage.start.pages[0].text, "last");
  assert.throws(() => require("../app/notes-persistence").flush(config, { pageIds: [], notesByPage: {} }, () => { throw Error("must not write"); }, () => {}), /Invalid notes/);
});
