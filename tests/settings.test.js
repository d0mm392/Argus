"use strict";
const assert = require("node:assert/strict"), fs = require("fs"), path = require("path");
const { app } = require("electron"), { setup } = require("./renderer-fixture");
async function run() {
  const { window, errors, evaluate, evaluateWithValue, screenshot, profile, wait } = await setup();
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#setTabs button")].map(b=>b.textContent)'),
    ["Allgemein", "Aussehen", "KI", "Gaming und Discord", "Mining", "Integrationen", "Datenschutz", "Erweitert"]);
  await evaluate('document.getElementById("settings").hidden=false;true');
  const inventory = await evaluate(`(() => {
    let section = '', category = ''; const controls = [];
    for (const child of document.querySelector('.set-body').children) {
      if (child.tagName === 'H4') { section = child.textContent; category = child.dataset.in; }
      for (const element of [child,...child.querySelectorAll('input,select,textarea,button')]) {
        if (!element.matches('input,select,textarea,button')) continue;
        controls.push({id:element.id,type:element.type,section,category,label:element.closest('label')?.textContent.trim()||element.textContent.trim()});
      }
    } return controls;
  })()`);
  assert(inventory.length > 200);
  assert(inventory.every(control => control.section && control.category));
  const ids = inventory.map(c => c.id).filter(Boolean); assert.equal(ids.length, new Set(ids).size);
  fs.writeFileSync(path.join(process.env.ARGUS_TEST_ARTIFACTS || profile, "settings-inventory.json"), JSON.stringify(inventory, null, 2));
  await evaluateWithValue(value => {
    const search = document.getElementById('setFind'); search.value = value; search.dispatchEvent(new Event('input')); return true;
  }, "Online-Freunde");
  assert.equal(await evaluate('document.getElementById("setDcOnline").closest("label").classList.contains("tab-hidden")'), false);
  await screenshot("settings-search");
  await evaluate(`document.querySelector('#setTabs button').focus();document.getElementById('setTabs').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));true`);
  assert.equal(await evaluate('document.activeElement.dataset.tab'), "Aussehen");
  await evaluate(`const heading=[...document.querySelectorAll('.set-body h4')].find(h=>h.textContent==='Oberfläche und Skins');heading.focus();if(heading.getAttribute('aria-expanded')!=='true')heading.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true`);
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-expanded')`), "true");
  await screenshot("settings-keyboard");
  window.setSize(800, 700); await wait(80); await screenshot("settings-800");
  window.webContents.setZoomFactor(1.25); await wait(80); await screenshot("settings-zoom125");
  assert.equal(await evaluate('document.querySelector(".settings").scrollWidth <= document.querySelector(".settings").clientWidth + 1'), true);
  assert.deepEqual(errors, []);
  console.log("PASS settings: eight categories, full control inventory, unique IDs, search, keyboard tabs/sections, 800px and 125% zoom, no renderer errors");
  app.exit(0);
}
run().catch(error => { console.error(error.stack); app.exit(1); });
setTimeout(() => app.exit(2), 20000).unref();
