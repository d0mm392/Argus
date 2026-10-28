"use strict";
const assert = require("node:assert/strict");
const { app } = require("electron");
const { setup } = require("./renderer-fixture");
function contrast(first, second) {
  const luminance = hex => {
    const channels = hex.trim().slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const a = luminance(first), b = luminance(second); return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
}
async function run() {
  const { window, config, errors, evaluate, evaluateWithValue, wait, screenshot } = await setup();
  await evaluate(`document.getElementById('settings').hidden=false;
    const search=document.getElementById('setFind');search.value='Skins';search.dispatchEvent(new Event('input'));true;`);
  for (const skin of ["classic", "light", "dark", "classic", "dark"]) {
    await evaluateWithValue(value => {
      const radio = [...document.querySelectorAll('[name="uiSkin"]')].find(element => element.value === value);
      if (!radio) throw Error("Skin control missing"); radio.click(); return true;
    }, skin);
    await wait(50);
    assert.equal(config.uiSkin || "classic", skin);
    assert.equal(await evaluate("document.body.dataset.uiSkin"), skin);
    if (skin !== "classic") {
      const palette = await evaluate(`Object.fromEntries(['surface','ink','muted','accent','success','warning','danger','info'].map(key=>[key,getComputedStyle(document.body).getPropertyValue('--ui-'+key).trim()]))`);
      for (const key of ["ink", "muted", "accent", "success", "warning", "danger", "info"]) assert(contrast(palette[key], palette.surface) >= 4.5, skin + " readable " + key);
    }
    await screenshot("skin-" + skin);
  }
  const loaded = new Promise(resolve => window.webContents.once("did-finish-load", resolve));
  window.reload(); await loaded; await wait(300);
  assert.equal(await evaluate("document.body.dataset.uiSkin"), "dark");
  assert.equal(config.notesText, "Synthetic Start note");
  assert.deepEqual(errors, []);
  console.log("PASS skins: all three skins, return to classic, persistence, renderer reload, unrelated data retained, no renderer errors");
  app.exit(0);
}
run().catch(error => { console.error(error.stack); app.exit(1); });
setTimeout(() => app.exit(2), 20000).unref();
