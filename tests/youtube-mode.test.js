"use strict";
const assert = require("node:assert/strict");
const { app } = require("electron"), { setup } = require("./renderer-fixture");
async function run() {
  const { config, errors, evaluate, evaluateWithValue, screenshot, wait } = await setup();
  await evaluate(`$('settings').hidden=false;const search=$('setFind');search.value='YouTube';search.dispatchEvent(new Event('input'));true;`);
  assert.equal(await evaluate('$("setYtMode").value'), "brave");
  assert.equal(await evaluate('$("setYtNoAds").disabled && $("setYtAdblock").disabled'), true);
  const old = { noAds: config.ytNoAds, adblock: config.ytAdblock };
  for (const mode of ["panel", "fenster", "brave"]) {
    await evaluateWithValue(value => {
      const control=document.getElementById('setYtMode');control.value=value;control.dispatchEvent(new Event('change'));return true;
    }, mode);
    await wait(40); assert.equal(config.ytMode, mode);
    assert.equal(await evaluate('$("setYtNoAds").disabled'), mode === "brave");
    assert.equal(await evaluate('$("ytPlaybackHint").textContent.includes("Echtes Brave in einem separaten App-Fenster")'), mode === "brave");
  }
  assert.equal(config.ytNoAds, old.noAds); assert.equal(config.ytAdblock, old.adblock);
  await screenshot("settings-youtube"); assert.deepEqual(errors, []);
  console.log("PASS YouTube settings: real Brave and explicit experimental Electron modes, shared preference, correct control availability, no filter setting loss");app.exit(0);
}
run().catch(error=>{console.error(error.stack);app.exit(1);});
setTimeout(()=>app.exit(2),15000).unref();
