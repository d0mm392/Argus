"use strict";
const assert = require("node:assert/strict");
const { app } = require("electron"), { setup } = require("./renderer-fixture");
async function run() {
  const { config, window, evaluate, wait, errors, screenshot } = await setup();
  Object.assign(config, { discordAlsoOnline: true, dcOnlyMarked: true, discordVoiceOnly: false });
  const loaded=new Promise(resolve=>window.webContents.once('did-finish-load',resolve));window.reload();await loaded;await wait(200);
  await evaluate(`market={discord:{servers:[{id:'300000000000000001',server:'Test server',online:[{id:'100000000000000001',name:'Voice nonfriend',voice:'Room'},{id:'100000000000000002',name:'Server only',state:'online'}]}]}};friendsSig='';buildFriends();true;`);
  assert.deepEqual(await evaluate('[...friendsEl.querySelectorAll(".f b")].map(e=>e.textContent)'), ["Voice nonfriend"]);
  await wait(100); await screenshot("friends-voice");
  await evaluate(`$('settings').hidden=false;document.querySelector('#setTabs [data-tab="Gaming und Discord"]').click();const h=[...document.querySelectorAll('.set-body h4')].find(h=>h.textContent==='Discord');if(h.getAttribute('aria-expanded')!=='true')h.click();true;`);
  assert.equal(await evaluate('$("setDcOnline").disabled && $("setDcMarked").disabled && $("setDcVoice").checked'), true);
  assert.equal(await evaluate('$("dcFriendsUnavailable").textContent.includes("persönliche Freundesliste")'), true);
  assert.equal(config.discordAlsoOnline, true); assert.equal(config.dcOnlyMarked, true); assert.equal(config.discordVoiceOnly, false);
  await screenshot("settings-discord"); assert.deepEqual(errors, []);
  console.log("PASS friends settings: old saved requests retained on reload, voice nonfriend visible, server-only excluded, unavailable official source clear");app.exit(0);
}
run().catch(error=>{console.error(error.stack);app.exit(1);});
setTimeout(()=>app.exit(2),15000).unref();
