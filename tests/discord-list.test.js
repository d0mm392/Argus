"use strict";
const { app, BrowserWindow, session } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert/strict");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "argus-discord-test-"));
app.setPath("userData", root);
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^https?:/.test(d.url) }));
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await w.loadURL("data:text/html,<div id='list'></div><div id='list2'></div>");
  const source = fs.readFileSync(path.join(__dirname, "../app/js/03-freundesliste.js"), "utf8");
  await w.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, "../app/discord-list.js"), "utf8"));
  const result = await w.webContents.executeJavaScript(`
    let market = null, dcVoiceOnly = true, dcAlsoOnline = false, dcOnlyMarked = false, dcMarked = [], noClick = false;
    const lblLayer = document.body, $ = id => document.getElementById(id);
    let markActions; const ctxMenu = (_x,_y,_name,actions) => { markActions=actions; };
    window.jarvis = {setConfig: patch => { if (patch.dcMarked) window.testMarks=patch.dcMarked; }};
    ${source}
    friendsEl = $('list'); friendsEl2 = $('list2');
    (() => {
      const runs = [];
      const voice = { id: '100000000000000001', name: 'Voice nonfriend', voice: 'Room', voiceId: '200000000000000001' };
      const serverOnly = { id: '100000000000000002', name: 'Server only', state: 'online' };
      market = { discord: { servers: [{ id: '300000000000000001', server: 'Fixture', online: [voice, serverOnly] }] } };
      for (const oldVoice of [true, false]) for (const online of [true, false]) for (const marked of [true, false]) {
        dcVoiceOnly = oldVoice; dcAlsoOnline = online; dcOnlyMarked = marked;
        friendsSig = ''; buildFriends();
        runs.push([...friendsEl.querySelectorAll('.f b')].map(x => x.textContent));
      }
      market.discord.servers[0].online = [serverOnly]; friendsSig = ''; buildFriends();
      const empty = friendsEl.querySelectorAll('.f').length;
      market.discord.servers[0].online = [{ ...voice, state: 'offline' }]; friendsSig = ''; buildFriends();
      const offlineVoice = friendsEl.querySelector('.f b')?.textContent;
      bot.guilds = [{ id: '400000000000000001', name: 'Bot server', ch: [{ id: '500000000000000001', name: 'Bot room', people: [voice, { id: '100000000000000003', name: 'Bot nonfriend' }] }] }];
      friendsSig = ''; buildFriends();
      const names = [...friendsEl.querySelectorAll('.f b')].map(x => x.textContent);
      friendsEl.querySelector('.f').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true})); markActions[0][1]();
      const marked = window.testMarks;
      friendsEl.querySelector('.f').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true})); markActions[0][1]();
      return { runs, empty, offlineVoice, bot: names, marked, unmarked:window.testMarks, capability: window.argusDiscordList.capability };
    })()
  `);
  result.runs.forEach((names) => assert.deepEqual(names, ["Voice nonfriend"]));
  assert.equal(result.empty, 0);
  assert.equal(result.offlineVoice, "Voice nonfriend");
  assert.deepEqual(result.bot, ["Voice nonfriend", "Bot nonfriend"]);
  assert.deepEqual(result.marked, ["id:100000000000000001"]);
  assert.deepEqual(result.unmarked, []);
  assert.equal(result.capability.available, false);
  assert.match(result.capability.reason, /Freundesliste/);
  console.log("PASS Discord: all 8 legacy option combinations preserve voice nonfriends and exclude server-only members; empty/status change/bot voice/unavailable source");
  app.exit(0);
}).catch((e) => { console.error(e.stack); app.exit(1); });
setTimeout(() => app.exit(2), 20000).unref();
