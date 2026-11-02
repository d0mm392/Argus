"use strict";
// Kugel hinter einem undurchsichtigen Mining-Fenster: echte Oberfläche, synthetisches Layout, keine Nutzerdaten.
const { setup } = require("./renderer-fixture");
const assert = require("assert/strict"), { app } = require("electron");
const OTHER = { Start: { ballOff: { x: 0.01, y: -0.18 }, ballScale: 1.3, ballOn: true, panelLayout: { sys: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } }, hiddenBlocks: ["mOver"], pins: { btc: { a: 1, r: 2 } }, scales: {} },
  Gaming: { ballOff: { x: 0.3, y: -0.2 }, ballScale: 1.1, ballOn: false, panelLayout: {}, hiddenBlocks: [], pins: {}, scales: {} } };
const MINING = { ballOff: { x: -0.3, y: 0 }, ballScale: 1.3, ballOn: true, statusOn: true, hiddenBlocks: ["sys", "yt", "notes", "wx"], pins: { "t:mHr": { a: -1.9, r: 2.5 } }, scales: { "t:mHr": 1.5 },
  panelLayout: { mOver: { x: 0.006, y: 0.2, w: 0.32, h: 0.75 }, mHeat: { x: 0.75, y: 0.25, w: 0.23, h: 0.7 } } };
// Der Überblick zeigt sich sonst erst mit Farm-Daten; hier fest und undurchsichtig wie in der Einstellung „Deckkraft 100“
const force = `(() => { const el = $("mOver"); el.hidden = false; el.style.display = "block"; el.style.backgroundColor = "rgb(10, 20, 30)"; const m = freeLayout?.mOver; if (m) { const c = $("brain").getBoundingClientRect(); el.style.position = "absolute"; el.style.left = m.x * c.width + "px"; el.style.top = m.y * c.height + "px"; el.style.width = m.w * c.width + "px"; el.style.height = m.h * c.height + "px"; } return true; })()`;
async function run() {
  const f = await setup(); let count = 0;
  const check = (name, ok, info = "") => { assert(ok, name + " " + info); count++; console.log("PASS " + name); };
  f.window.setSize(1600, 950); await f.wait(400);
  await f.evaluateWithValue(s => { pages = s; switchPage("Mining"); return true; }, { ...OTHER, Mining: MINING });
  await f.wait(800); await f.evaluate(force); await f.wait(200);
  const snap = `JSON.stringify({ layout: freeLayout, hidden: [...hiddenSet].sort(), pins, scales })`;
  const before = await f.evaluate(snap), otherBefore = await f.evaluate(`JSON.stringify({ Start: pages.Start, Gaming: pages.Gaming })`);

  check("covered orb is detected although it is switched on", await f.evaluate("ballOn && mineOrb && window.orbCovered()"));
  await f.evaluate("window.orbHintSync(); true");
  check("hint appears", await f.evaluate(`!$("orbHint").hidden`));
  check("settings button exists", await f.evaluate(`!!$("setOrbShow")`));

  const offBefore = await f.evaluate("JSON.stringify(ballOff)");
  await f.evaluate(`$("orbHintShow").click(); true`); await f.wait(300); await f.evaluate(force);
  check("orb is free after restoring", await f.evaluate("window.orbCoverage()") === 0, String(await f.evaluate("window.orbCoverage()")));
  check("hint disappears", await f.evaluate(`window.orbHintSync(); $("orbHint").hidden`));
  check("orb stays inside the page", await f.evaluate("CX - S >= -1 && CX + S <= W + 1 && CY - S >= -1 && CY + S <= H + 1"));
  check("windows, pins and scales of the page unchanged", await f.evaluate(snap) === before);
  check("other pages unchanged", await f.evaluate(`JSON.stringify({ Start: pages.Start, Gaming: pages.Gaming })`) === otherBefore);
  check("only the Mining page got the new orb position", f.config.pages.Mining.ballOff.x !== MINING.ballOff.x && JSON.stringify(f.config.pages.Start) === JSON.stringify(JSON.parse(otherBefore).Start));
  const off = await f.evaluate("JSON.stringify(ballOff)");
  check("orb really moved", off !== offBefore);

  await f.evaluate(`switchPage("Start"); true`); await f.wait(500);
  check("page change: Start keeps its own orb", await f.evaluate(`Math.abs(ballOff.x - (${JSON.parse(otherBefore).Start.ballOff.x})) < 1e-9`));
  await f.evaluate(`switchPage("Mining"); true`); await f.wait(500);
  check("page change: Mining keeps the restored orb", await f.evaluate("JSON.stringify(ballOff)") === off);

  await f.window.webContents.executeJavaScript("location.reload(); true").catch(() => {});
  await f.wait(2500); f.window.webContents.send("expanded", true); await f.wait(600); // das Fenster klappt beim echten Start der Hauptprozess auf
  check("restart: restored position comes back", await f.evaluate(`page === "Mining" && JSON.stringify(ballOff)`) === off);

  await f.evaluate(force); await f.evaluate(`$("setMineOrb").checked = false; $("setMineOrb").dispatchEvent(new Event("change")); true`); await f.wait(200);
  check("orb deliberately off on Mining: no hint, stays off", await f.evaluate(`window.orbHintSync(); document.body.classList.contains("noorb") && $("orbHint").hidden && !window.orbCovered()`));
  check("orb deliberately off: setting is stored", f.config.mineOrb === false);
  await f.evaluate(`$("setMineOrb").checked = true; $("setMineOrb").dispatchEvent(new Event("change")); true`); await f.wait(300);
  check("orb switched on again: visible again", await f.evaluate(`!document.body.classList.contains("noorb") && !window.orbCovered()`));

  await f.evaluate(`ballOff = { x: -0.3, y: 0 }; resize(); true`); await f.evaluate(force); await f.wait(100);
  check("covered again for the choice test", await f.evaluate("window.orbCovered()"));
  await f.evaluate(`$("orbHintX").click(); window.orbHintSync(); true`);
  check("dismissed hint stays away, position untouched", await f.evaluate(`$("orbHint").hidden && ballOff.x === -0.3`));

  await f.evaluate(`$("setOrbShow").click(); true`); await f.wait(800);
  check("settings button restores too", await f.evaluate("!window.orbCovered()"));
  const moved = await f.evaluate("ballOff.x"); await f.evaluate("undoMove(); true"); await f.wait(200);
  check("Ctrl+Z undo returns the orb", await f.evaluate("ballOff.x") !== moved);

  check("renderer has no errors", !f.errors.filter(e => !/willReadFrequently/.test(String(e))).length, JSON.stringify(f.errors).slice(0, 300));
  console.log(`${count}/${count} bestanden`); app.exit(0);
}
run().catch(e => { console.error(e.stack); app.exit(1); });
