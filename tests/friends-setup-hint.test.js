"use strict";
// Leere Freundesliste (Steam/Discord an, aber nichts eingetragen): Hinweis mit Knopf statt Stille; Knopf öffnet die passende Einstellung.
// Dazu: „Fenster im Panel“ hat keine doppelten Schalter mehr, und ein Haken dort schaltet das Fenster wirklich ein.
const assert = require("node:assert/strict");
const { app } = require("electron"), { setup } = require("./renderer-fixture");
async function run() {
  const { config, window, evaluate, wait, errors, screenshot } = await setup();
  Object.assign(config, { steamOn: true, steamKey: "", steamId: "", discordOn: true, discordServers: "", friendsSplit: false, notesOn: false });
  const loaded = new Promise(resolve => window.webContents.once("did-finish-load", resolve)); window.reload(); await loaded; await wait(300);
  await evaluate(`expanded=true;market={steam:null,discord:null};widgets.friends={...widgets.friends,on:true};friendsSig='';buildFriends();placeFriends();true;`);
  const hint = await evaluate(`[!friendsEl.classList.contains('off'), [...friendsEl.querySelectorAll('.fr-setup button')].map(b=>b.textContent), friendsEl.querySelector('.fr-setup p')?.textContent]`);
  assert.equal(hint[0], true, "Liste muss sichtbar sein");
  assert.deepEqual(hint[1], ["Steam einrichten", "Discord einrichten"]);
  await screenshot("friends-setup-hint");
  await evaluate(`friendsEl.querySelector('.fr-setup button').click();true`); await wait(400);
  const at = await evaluate(`[$('settings').hidden, document.querySelector('#setTabs [aria-selected="true"]')?.dataset.tab, [...document.querySelectorAll('.set-body h4')].find(h=>h.textContent==='Steam').getAttribute('aria-expanded'), $('setSteamKey').closest('label').classList.contains('tab-hidden')]`);
  assert.deepEqual(at, [false, "Freunde und Medien", "true", false]);
  await screenshot("friends-setup-settings");
  // Split: jede leere Liste sagt, was ihr fehlt
  await evaluate(`friendsSplit=true;friendsSig='';buildFriends();true`);
  assert.deepEqual(await evaluate(`[[...friendsEl.querySelectorAll('.fr-setup button')].map(b=>b.textContent), [...friendsEl2.querySelectorAll('.fr-setup button')].map(b=>b.textContent)]`), [["Steam einrichten"], ["Discord einrichten"]]);
  // Eingerichtet, aber niemand online: kein Einrichten-Knopf
  await evaluate(`friendsSplit=false;market={steam:{online:[]},discord:null};friendsCfg.discordOn=false;friendsSig='';buildFriends();true`);
  assert.equal(await evaluate(`friendsEl.querySelectorAll('.fr-setup button').length`), 0);
  // Fenster im Panel: Claude/Lokal und Strata-Knopf nur noch unter „Anzeigen an der Kugel“; Notizblock-Haken schaltet den Notizblock ein
  const rows = await evaluate(`[...document.querySelectorAll('#blockRows label')].map(l=>l.textContent.trim())`);
  assert.equal(rows.includes("Claude-Anzeige") || rows.includes("Lokal-Anzeige") || rows.includes("Strata-Knopf"), false, JSON.stringify(rows));
  await evaluate(`renderBlockRows();const l=[...document.querySelectorAll('#blockRows label')].find(l=>l.textContent.trim()==='Notizblock');const c=l.querySelector('input');c.checked=true;c.dispatchEvent(new Event('change'));true`); await wait(200);
  assert.equal(await evaluate(`$('setNotesOn').checked`), true); assert.equal(config.notesOn, true);
  assert.deepEqual(errors, []);
  console.log("PASS friends setup hint: empty list explains what is missing, button opens Steam/Discord settings, split lists, no duplicate panel switches, panel tick enables block");
  app.exit(0);
}
run().catch(error => { console.error(error.stack); app.exit(1); });
setTimeout(() => app.exit(2), 20000).unref();
