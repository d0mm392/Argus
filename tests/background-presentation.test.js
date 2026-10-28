"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { policy, attach } = require("../app/background-presentation");
const { EventEmitter } = require("node:events");
test("fluid and eco policies preserve hidden/minimized resource saving", () => {
  for (const selected of [undefined, "fluid", "eco"]) for (const focus of [false, true]) {
    assert.equal(policy(selected, false, false, focus).throttled, true);
    assert.equal(policy(selected, true, true, focus).throttled, true);
    assert.equal(policy(selected, true, false, focus).throttled, selected === "eco");
  }
  assert.equal(policy(undefined, true, false, false).mode, "fluid");
});
test("focus, visibility and shared setting changes update the same controller", () => {
  const window = new EventEmitter(), wc = new EventEmitter(), values = [], states = [];
  let visible = true, minimized = false, focused = true;
  Object.assign(window, { webContents: wc, isDestroyed: () => false, isVisible: () => visible, isMinimized: () => minimized, isFocused: () => focused });
  wc.setBackgroundThrottling = v => values.push(v);
  const controller = attach(window, undefined, s => states.push(s));
  focused = false; window.emit("blur"); assert.equal(states.at(-1).focused, false); assert.equal(values.at(-1), false);
  minimized = true; window.emit("minimize"); assert.equal(values.at(-1), true);
  minimized = false; window.emit("restore"); assert.equal(values.at(-1), false);
  visible = false; window.emit("hide"); assert.equal(values.at(-1), true);
  visible = true; window.emit("show"); controller.setMode("eco"); assert.equal(values.at(-1), true);
  controller.setMode("fluid"); assert.equal(values.at(-1), false);
});
