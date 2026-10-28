"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { app } = require("electron"), { setup } = require("./renderer-fixture");
async function run() {
  const { window, evaluate, wait, config, errors, screenshot, profile } = await setup();
  const result = await evaluate(`(() => {
    const input = text => { $('notesText').value=text;$('notesText').dispatchEvent(new Event('input')); };
    freeLayout={notes:{x:.05,y:.08,w:.30,h:.25}};scales.notes=1.1;pins.notes={a:.2,r:1};input('Start rapid');
    switchPage('Gaming');const empty=$('notesText').value;
    freeLayout={notes:{x:.45,y:.4,w:.4,h:.35}};scales.notes=.9;pins.notes={a:1,r:2};input('Game rapid');
    switchPage('Start');const start={text:$('notesText').value,geometry:notesGeometryRead()};
    switchPage('Gaming');const gaming={text:$('notesText').value,geometry:notesGeometryRead()};
    return {empty,start,gaming};
  })()`);
  assert.equal(result.empty, ""); assert.equal(result.start.text, "Start rapid"); assert.equal(result.gaming.text, "Game rapid");
  assert.equal(result.start.geometry.layout.x, .05); assert.equal(result.gaming.geometry.layout.x, .45);
  assert.equal(result.start.geometry.scale, 1.1); assert.equal(result.gaming.geometry.scale, .9);
  await wait(650);
  assert.equal(config.notesByPage.start.geometry.layout.x, .05);
  assert.equal(config.notesByPage.gaming.geometry.layout.x, .45);
  await screenshot("notes-gaming");
  config.panelLayout.notes.x = .9; // Simulate a stale general layout save at shutdown.
  const loaded = new Promise(resolve => window.webContents.once("did-finish-load", resolve)); window.reload(); await loaded; await wait(400);
  assert.equal(await evaluate('document.getElementById("notesText").value'), "Game rapid");
  assert.equal(await evaluate('freeLayout.notes.x'), .45);
  await evaluate('switchPage("Start");true');
  assert.equal(await evaluate('document.getElementById("notesText").value'), "Start rapid");
  assert.equal(await evaluate('freeLayout.notes.x'), .05);
  await screenshot("notes-start");
  await evaluate('$("notesText").value="Last keystroke before shutdown";$("notesText").dispatchEvent(new Event("input"));true');
  const immediate = new Promise(resolve => window.webContents.once("did-finish-load", resolve)); window.reload(); await immediate; await wait(150);
  assert.equal(await evaluate('$("notesText").value'), "Last keystroke before shutdown");
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "notes-backup.json"))).start.pages[0].text, "Last keystroke before shutdown");
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "synthetic-config.json"))).notesByPage.start.pages[0].text, "Last keystroke before shutdown");
  assert.deepEqual(errors, []);
  console.log("PASS notes layout: text/position/size/pin/scale isolated by page ID, rapid switch + debounce, renderer reload, independent restore");app.exit(0);
}
run().catch(error=>{console.error(error.stack);app.exit(1);});
setTimeout(()=>app.exit(2),15000).unref();
