"use strict";
const mode = value => value === "eco" ? "eco" : "fluid";
function policy(value, visible, minimized, focused) {
  const shown = !!visible && !minimized;
  return { mode: mode(value), visible: shown, focused: !!focused,
    throttled: !shown || mode(value) === "eco" };
}
function attach(window, value, notify) {
  let selected = mode(value);
  const update = () => {
    if (window.isDestroyed()) return;
    const state = policy(selected, window.isVisible(), window.isMinimized(), window.isFocused());
    window.webContents.setBackgroundThrottling(state.throttled);
    notify(state);
  };
  for (const event of ["show", "hide", "minimize", "restore", "focus", "blur"]) window.on(event, update);
  window.webContents.on("did-finish-load", update);
  update();
  return { setMode(value) { selected = mode(value); update(); } };
}
module.exports = { policy, attach };
