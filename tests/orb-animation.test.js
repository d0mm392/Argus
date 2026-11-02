"use strict";
// Bildrate und Drehtempo getrennt gemessen: echte Oberfläche, synthetische Daten, kein Hauptprozess, keine Nutzerdaten.
// ARGUS_ORB_BASELINE=1 misst einen Altstand ohne Prüfungen (Vorher-Vergleich).
const { setup } = require("./renderer-fixture");
const assert = require("assert/strict"), path = require("path"), { app } = require("electron");
const baseline = !!process.env.ARGUS_ORB_BASELINE;
async function measure(f, ms) {
  return f.evaluate(`new Promise((done) => {
    let frames = 0; const real = ctx.clearRect; ctx.clearRect = function (...a) { frames++; return real.apply(this, a); };
    const y0 = ay, s0 = performance.now(); lastAct = s0 - 70000;
    const hold = setInterval(() => { lastAct = performance.now() - 70000; }, 200);
    setTimeout(() => { clearInterval(hold); ctx.clearRect = real; const sec = (performance.now() - s0) / 1000; done({ fps: +(frames / sec).toFixed(1), rad: +((ay - y0) / sec).toFixed(4) }); }, ${ms});
  })`);
}
async function run() {
  const f = await setup(); let count = 0;
  const check = (name, ok, info = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (info ? " " + info : "")); if (!baseline) assert(ok, name); count++; };
  await f.evaluate(`fpsIdle = 60; fpsMax = 60; spinK = 1; shape = "kugel"; resize(); true`);
  const want = 0.05;
  const close = r => Math.abs(r.rad - want) / want < 0.12;
  const send = s => f.window.webContents.send("background-presentation", s);

  const active = await measure(f, 3000);
  check("focused, one minute idle", close(active), JSON.stringify(active));
  if (!baseline) send({ mode: "fluid", visible: true, focused: false, throttled: false });
  await f.wait(200);
  const fluid = await measure(f, 3000);
  check("fluid, visible, inactive: speed unchanged", close(fluid), JSON.stringify(fluid));
  check("fluid, visible, inactive: keeps chosen 60 FPS setting", fluid.fps > 25, JSON.stringify(fluid));

  send({ mode: "eco", visible: true, focused: false, throttled: true }); await f.wait(200);
  const eco = await measure(f, 3000);
  check("eco, inactive: same speed at lower rate", close(eco) && eco.fps < 16, JSON.stringify(eco));

  await f.evaluate(`fpsIdle = 15; true`);
  send({ mode: "fluid", visible: true, focused: false, throttled: false }); await f.wait(200);
  const saving = await measure(f, 3000);
  check("saving setting 15 stays at its old rate (no blanket load increase), same speed", close(saving) && saving.fps < 16, JSON.stringify(saving));

  await f.evaluate(`fpsIdle = 60; fpsMax = 15; true`);
  const lowCap = await f.evaluate(`new Promise((done) => { talking = true; const y0 = ay, s0 = performance.now(); setTimeout(() => { talking = false; fpsMax = 60; done(+((ay - y0) / ((performance.now() - s0) / 1000)).toFixed(4)); }, 2000); })`);
  check("speed independent of frame rate cap", Math.abs(lowCap - want) / want < 0.15, String(lowCap));

  // Echter Regler am echten Fenster: Minimieren spart, Wiederherstellen ohne Sprung
  const controller = require(path.join(f.root, "app/background-presentation")).attach(f.window, "fluid", s => f.window.webContents.send("background-presentation", s));
  f.window.hide(); await f.wait(600);
  const hidden = await measure(f, 2000);
  check("hidden window draws nothing", hidden.fps < 1.5 && Math.abs(hidden.rad) < 0.01, JSON.stringify(hidden));
  const before = await f.evaluate("ay"); await f.wait(4000);
  const paused = await f.evaluate("ay");
  f.window.showInactive(); await f.wait(600);
  const after = await f.evaluate("ay");
  check("no animation jump after restoring", Math.abs(paused - before) < 0.01 && after - paused < 0.05, JSON.stringify({ before, paused, after }));
  const back = await measure(f, 2000);
  check("animation runs again after restoring", close(back) && back.fps > 10, JSON.stringify(back));
  controller.setMode("fluid");

  check("renderer has no errors", !f.errors.filter(e => !/willReadFrequently/.test(String(e))).length, JSON.stringify(f.errors).slice(0, 300));
  console.log(`${count} Prüfungen`); app.exit(0);
}
run().catch(e => { console.error(e.stack); app.exit(1); });
