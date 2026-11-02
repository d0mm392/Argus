"use strict";
// Bildrate und Tempo des bewegten Hintergrunds: echte Oberfläche, synthetische Daten, kein Hauptprozess, keine Nutzerdaten.
const { setup } = require("./renderer-fixture");
const assert = require("assert/strict"), { app } = require("electron");
async function measure(f, ms, idle = 70000) {
  return f.evaluate(`new Promise((done) => {
    const stamps = [], real = bg.ctx.clearRect; bg.ctx.clearRect = function (...a) { stamps.push(performance.now()); return real.apply(this, a); };
    const parts = bg.parts.map(p => ({ p, y: p.y })), s0 = performance.now(); lastAct = s0 - ${idle};
    const hold = setInterval(() => { lastAct = performance.now() - ${idle}; }, 4); // auch echte Mausbewegungen über dem Testfenster überschreiben
    setTimeout(() => {
      clearInterval(hold); bg.ctx.clearRect = real;
      const sec = (performance.now() - s0) / 1000, gaps = stamps.slice(1).map((v, i) => v - stamps[i]).sort((a, b) => a - b);
      const speeds = parts.filter(o => o.p.y < o.y).map(o => (o.y - o.p.y) / sec / -o.p.vy).sort((a, b) => a - b); // Anteil des Soll-Tempos, ohne umlaufende Funken
      done({ fps: +(stamps.length / sec).toFixed(1), median: +(gaps[gaps.length >> 1] || 0).toFixed(1), p95: +(gaps[Math.floor(gaps.length * 0.95)] || 0).toFixed(1), speed: +(speeds[speeds.length >> 1] || 0).toFixed(3) });
    }, ${ms});
  })`);
}
async function run() {
  const f = await setup(); let count = 0;
  const check = (name, ok, info = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (info ? " " + info : "")); assert(ok, name); count++; };
  const send = s => f.window.webContents.send("background-presentation", s);
  const rate = v => f.evaluate(`fpsIdle = ${v}; fpsMax = 60; true`);
  await f.evaluate(`bg.mode = "funken"; bg.hueMode = "bunt"; bg.amt = 1; bg.op = 1; applyBg(); true`);
  await f.wait(500);

  await rate(60); send({ mode: "fluid", visible: true, focused: false, throttled: false }); await f.wait(200);
  const fluid60 = await measure(f, 3000);
  check("fluid 60, inactive, one minute idle: follows the chosen rate", fluid60.fps > 40, JSON.stringify(fluid60));
  check("fluid 60: even frame spacing", fluid60.p95 < fluid60.median * 1.6, JSON.stringify(fluid60));
  check("fluid 60: particles keep their speed", Math.abs(fluid60.speed - 1) < 0.15, JSON.stringify(fluid60));

  await rate(30); await f.wait(200);
  const fluid30 = await measure(f, 3000);
  check("fluid 30: stays at 30, even after one idle minute", fluid30.fps > 24 && fluid30.fps < 34, JSON.stringify(fluid30));

  await rate(15); await f.wait(200);
  const saving = await measure(f, 3000);
  check("saving rate 15 keeps its old limit (no blanket load increase)", saving.fps < 12, JSON.stringify(saving));
  const savingActive = await measure(f, 2000, 0);
  check("saving rate 15, moving: stays at 30 at most", savingActive.fps > 20 && savingActive.fps < 34, JSON.stringify(savingActive));

  await rate(60); send({ mode: "eco", visible: true, focused: false, throttled: true }); await f.wait(200);
  const eco = await measure(f, 3000);
  check("eco keeps its old limit", eco.fps < 12, JSON.stringify(eco));
  check("eco: particles keep their speed", Math.abs(eco.speed - 1) < 0.15, JSON.stringify(eco));

  send({ mode: "fluid", visible: false, focused: false, throttled: true }); await f.wait(300);
  const hidden = await measure(f, 2000);
  check("hidden window draws no background", hidden.fps === 0, JSON.stringify(hidden));
  send({ mode: "fluid", visible: true, focused: true, throttled: false }); await f.wait(1300);
  const back = await measure(f, 2000);
  check("background resumes after restoring", back.fps > 40, JSON.stringify(back));

  await f.evaluate(`fpsIdle = 60; fpsMax = 30; true`); await f.wait(200);
  const capped = await measure(f, 2000);
  check("never above the chosen moving rate", capped.fps < 34, JSON.stringify(capped));

  check("renderer has no errors", !f.errors.filter(e => !/willReadFrequently/.test(String(e))).length, JSON.stringify(f.errors).slice(0, 300));
  console.log(`${count} Prüfungen`); app.exit(0);
}
run().catch(e => { console.error(e.stack); app.exit(1); });
