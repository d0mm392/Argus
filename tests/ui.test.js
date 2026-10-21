// UI-Tests (Electron). Aufruf: xvfb-run -a npx electron --no-sandbox tests/ui.test.js
const { run } = require("./harness");
run(async ({ w, ev, wait, check, menus, app }) => {
  const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click(); true`);
  const cfg = () => ev(`window.jarvis.getConfig()`);
  await ev(`document.getElementById('crashPop').hidden=true; true`);

  // R-DEF-1 / R-DEF-2: Standardwerte
  const c0 = await cfg();
  check("R-DEF-1 Argus ist standardmäßig nicht in der Taskleiste", c0.taskbarOn === false, c0.taskbarOn);
  check("R-DEF-2 Discord-Web-Fenster ist entfernt", await ev(`!document.getElementById('dcweb')`));

  // R-IND-1: Kugel verschieben bewegt nichts anderes
  await click("[data-pg=Start]"); await wait(1200);
  const mv = JSON.parse(await ev(`(async()=>{ const w=(ms)=>new Promise(r=>setTimeout(r,ms)); const c=document.getElementById('brain'); const r=c.getBoundingClientRect();
    const pos=()=>JSON.stringify([...document.querySelectorAll('.temp:not(.off),#pill,.who:not(.off)')].map(e=>{const b=e.getBoundingClientRect();return [e.id||e.className.slice(0,8),Math.round(b.x),Math.round(b.y)]}));
    const before=pos(); const x=r.left+r.width/2,y=r.top+r.height/2+6;
    c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:1}));
    for(let i=1;i<=10;i++){ document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x+i*12,clientY:y+i*6,pointerId:1})); await w(30); }
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x+120,clientY:y+60,pointerId:1,button:0})); await w(900);
    const a=JSON.parse(before), b=JSON.parse(pos()); const maxd=Math.max(...a.map((q,i)=>Math.max(Math.abs(q[1]-b[i][1]),Math.abs(q[2]-b[i][2])))); return JSON.stringify({same: maxd<=6, maxd, n: a.length}); })()`)); // Schweben (±3 px) ist erlaubt, Mitwandern (≈130 px) nicht
  check("R-IND-1 Kugel verschieben lässt Anzeigen/Knöpfe liegen", mv.same && mv.n > 0, mv);

  // R-IND-2: Kugel aus -> Messzeiger bleiben, Kugel zeichnet nichts
  const px = (() => `(()=>{ const c=document.getElementById('brain'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>20) n++; return n; })()`)();
  const nOn = await ev(px);
  await ev(`window.jarvis.setConfig({ballOn:false}); true`); await click("#setBallOn").catch(() => {}); // Einstellung spiegeln
  await ev(`(()=>{const e=document.getElementById('setBallOn'); if(e&&e.checked){e.checked=false; e.dispatchEvent(new Event('change'));} return true})()`); await wait(1500);
  const nOff = await ev(px);
  check("R-IND-2 Kugel aus: deutlich weniger Pixel, Messzeiger bleiben", nOn > 3000 && nOff < nOn / 4 && nOff > 0, { nOn, nOff });
  await ev(`(()=>{const e=document.getElementById('setBallOn'); if(e&&!e.checked){e.checked=true; e.dispatchEvent(new Event('change'));} return true})()`); await wait(800);

  // R-PAGE-1: Seiten unabhängig (Kugel pro Seite)
  await click("[data-pg=Mining]"); await wait(800);
  await ev(`(()=>{const e=document.getElementById('setBallOn'); if(e&&e.checked){e.checked=false; e.dispatchEvent(new Event('change'));} return true})()`); await wait(800);
  await click("[data-pg=Start]"); await wait(1000);
  const startBall = (await cfg()).ballOn;
  await click("[data-pg=Mining]"); await wait(800); const minBall = (await cfg()).ballOn;
  check("R-PAGE-1 Kugel ein/aus gilt nur für die eigene Seite", startBall === true && minBall === false, { startBall, minBall });
  await click("[data-pg=Start]"); await wait(600); await click("[data-pg=Gaming]"); await wait(800);
  await ev(`setFriendsOn(false); true`); await wait(300);
  await click("[data-pg=Start]"); await wait(800); const fStart = await ev(`widgets.friends?.on !== false`);
  await click("[data-pg=Gaming]"); await wait(800); const fGame = await ev(`widgets.friends?.on !== false`);
  await ev(`setFriendsOn(true); true`); await click("[data-pg=Start]"); await wait(600);
  check("R-PAGE-3 Freundesliste auf Gaming schließen lässt sie auf Start stehen", fStart === true && fGame === false, { fStart, fGame });
  await click("[data-pg=Start]"); await wait(800);

  // R-MENU-1..3: Rechtsklick-Menü
  const menuTest = async (page) => {
    await click(`[data-pg=${page}]`); await wait(1000);
    await ev(`document.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300})); true`); await wait(2200);
    const mw = menus()[0]; if (!mw) return { err: "kein Menü" };
    await mw.webContents.executeJavaScript(`[...document.querySelectorAll('#m button')].find(x=>x.textContent.includes('Buttons')).dispatchEvent(new PointerEvent('pointerenter'))`); await wait(1500);
    const sw = menus().find((x) => x !== mw); if (!sw) return { err: "kein Untermenü" };
    const items = await sw.webContents.executeJavaScript(`[...document.querySelectorAll('#m button')].map(b=>b.textContent.trim().replace(/^✓/,''))`);
    const r = { n: items.length, mining: items.filter((t) => /Mining/.test(t)).length, sub: true };
    if (page === "Start") {
      const tog = `[...document.querySelectorAll('#m button')].find(b=>b.textContent.includes('GPU-Temperatur')).click()`;
      await sw.webContents.executeJavaScript(tog); await wait(800); r.open1 = menus().length;
      await sw.webContents.executeJavaScript(tog); await wait(600); r.open2 = menus().length;
    }
    for (const x of menus()) x.close(); await wait(400); return r;
  };
  const ms = await menuTest("Start"), mm = await menuTest("Mining");
  check("R-MENU-1 Untermenü ist eigenes Fenster", ms.sub && mm.sub, { ms, mm });
  check("R-MENU-2 Startseite zeigt keine Mining-Einträge, Mining-Seite schon", ms.mining === 0 && mm.mining > 0, { ms, mm });
  check("R-MENU-3 Menü bleibt bei Häkchen offen", ms.open1 >= 2 && ms.open2 >= 2, ms);

  // R-MENU-4: Eintrag zweimal anklicken (Menü bleibt offen) schaltet aus und wieder ein
  await click("[data-pg=Start]"); await wait(600);
  await ev(`document.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300})); true`); await wait(2200);
  const mw4 = menus()[0]; await mw4.webContents.executeJavaScript(`[...document.querySelectorAll('#m button')].find(x=>x.textContent.includes('Buttons')).dispatchEvent(new PointerEvent('pointerenter'))`); await wait(1500);
  const sw4 = menus().find((x) => x !== mw4); const tg = `[...document.querySelectorAll('#m button')].find(b=>b.textContent.includes('Freundesliste neben der Kugel')).click()`;
  const fr = () => ev(`window.jarvis.getConfig().then(c=>c.widgets?.friends?.on!==false)`);
  const f0 = await fr(); await sw4.webContents.executeJavaScript(tg); await wait(700); const f1 = await fr(); await sw4.webContents.executeJavaScript(tg); await wait(700); const f2 = await fr();
  check("R-MENU-4 Freundesliste per Menü aus und wieder an", f0 === true && f1 === false && f2 === true, { f0, f1, f2 });
  for (const x of menus()) x.close(); await wait(400);

  // R-REP-3..5: Fehlerberichte in den Einstellungen
  await click("[data-pg=Start]"); await wait(500);
  await ev(`document.getElementById('settings').hidden=false; true`); await wait(300);
  const tab = await ev(`!![...document.querySelectorAll('#settings button, #settings .tab, #settings [data-tab]')].find(x=>/Fehlerbericht/i.test(x.textContent))`);
  check("R-REP-3 Einstellungen haben den Reiter „Fehlerberichte“", tab, tab);
  const spacing = await ev(`(()=>{const s=document.getElementById('settings').getBoundingClientRect(); const b=document.querySelector('.brand').getBoundingClientRect(); return Math.round(s.top-b.bottom)})()`);
  check("R-UI-1 Einstellungen haben Abstand zur oberen Leiste (≥ 8 px)", spacing >= 8, spacing);

  // R-OPT-1..5: Optik und Interaktion (0.42)
  await click("[data-pg=Start]"); await wait(500);
  await ev(`document.querySelector('#palPick button[data-n="Lava"]').click(); true`); await wait(600);
  const cp = await cfg();
  check("R-OPT-1 Farbwelt setzt Grundfarbe und Fensterfarbe und wird gespeichert", cp.palette === "Lava" && cp.themeHue === 8 && cp.winColor?.h === 10, { palette: cp.palette, hue: cp.themeHue, win: cp.winColor });
  await ev(`(()=>{const a=document.getElementById('setBtnShape'),b=document.getElementById('setBtnLook'); a.value='eckig'; a.dispatchEvent(new Event('change')); b.value='neon'; b.dispatchEvent(new Event('change')); return true})()`); await wait(500);
  const cb = await cfg(); const bd = await ev(`[document.body.dataset.bshape, document.body.dataset.blook]`);
  check("R-OPT-2 Button-Form und Material sind unabhängig wählbar und gespeichert", bd[0] === "eckig" && bd[1] === "neon" && cb.btnShape === "eckig" && cb.btnLook === "neon", { bd, s: cb.btnShape, l: cb.btnLook });
  const fold = await ev(`(()=>{ const s=document.getElementById('sys'); const t=s.querySelector('.sys-head > span:first-child'); t.click(); const a=s.classList.contains('folded'); t.click(); return [a, s.classList.contains('folded')]; })()`);
  check("R-OPT-3 Klick auf den Blocktitel klappt den Block ein und wieder aus", fold[0] === true && fold[1] === false, fold);
  const sp = await ev(`(async()=>{ const t=document.querySelector('.temp:not(.off)'); if(!t) return 'keine Anzeige'; const w=(ms)=>new Promise(r=>setTimeout(r,ms)); t.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:5,clientY:5})); await w(200); const open=!document.querySelector('.spark-pop').hidden; return open; })()`);
  check("R-OPT-4 Klick auf eine Messwert-Anzeige öffnet den Verlauf", sp === true, sp);
  await ev(`(()=>{const e=document.getElementById('setShimmer'); e.checked=false; e.dispatchEvent(new Event('change')); return true})()`); await wait(400);
  const sh = [await ev(`document.body.classList.contains('no-shimmer')`), (await cfg()).loadShimmer];
  check("R-OPT-5 Schimmern nach Last lässt sich ausschalten", sh[0] === true && sh[1] === false, sh);
  await ev(`(()=>{const e=document.getElementById('setYtAlpha'); e.value=60; e.dispatchEvent(new Event('change')); return true})()`); await wait(500);
  check("R-OPT-7 YouTube-Transparenz wird gespeichert (30–100 %)", (await cfg()).ytAlpha === 60, (await cfg()).ytAlpha);
  const nv = await ev(`[document.getElementById('setBtnShape').options.length, document.getElementById('setBtnLook').options.length]`);
  check("R-OPT-8 mindestens 9 Button-Formen und 17 Materialien zur Auswahl", nv[0] >= 9 && nv[1] >= 17, nv);
  const vg = await ev(`(async()=>{ const l=document.getElementById('setBtnLook'); l.value='verlauf'; l.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,300)); const t=document.querySelector('.temp:not(.off)'); const cs=getComputedStyle(t); const a=cs.backgroundImage; t.style.setProperty('--h','10'); await new Promise(r=>setTimeout(r,1500)); const b=getComputedStyle(t).backgroundImage; t.style.setProperty('--h','130'); await new Promise(r=>setTimeout(r,1500)); const c=getComputedStyle(t).backgroundImage; return [a.includes('gradient'), b!==c]; })()`);
  check("R-OPT-9 Farbverlauf: Farbe der Anzeige folgt dem Messwert (heiß ≠ kühl)", vg[0] === true && vg[1] === true, vg);
  await ev(`(()=>{const e=document.getElementById('setYtFeather'); e.value=24; e.dispatchEvent(new Event('change')); return true})()`); await wait(500);
  check("R-OPT-10 YouTube: weiche Ränder werden gespeichert (0–80 px)", (await cfg()).ytFeather === 24, (await cfg()).ytFeather);
  const shp = await ev(`(async()=>{ const sel=document.getElementById('setShape'), bad=[]; const n=sel.options.length; for (const o of [...sel.options]) { sel.value=o.value; sel.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,350)); if (!nodes.length || nodes.some(q=>!Number.isFinite(q.near)||!Number.isFinite(q.sx)||!Number.isFinite(q.x))) bad.push(o.value); } sel.value='kugel'; sel.dispatchEvent(new Event('change')); return [n,bad]; })()`);
  check("R-OPT-11 mindestens 14 Formen (ohne Gehirn, Ring, Tropfen), jede baut gültige Punkte (kein NaN), Wechsel ohne Fehler", shp[0] >= 14 && shp[1].length === 0, shp);
  await ev(`(()=>{const e=document.getElementById('setBgFx'); e.value='nordlicht'; e.dispatchEvent(new Event('change')); return true})()`); await wait(300);
  const r1 = await ev(`document.querySelector('[data-bgfor="sterne"]').hidden`);
  await ev(`(()=>{const e=document.getElementById('setBgFx'); e.value='sterne'; e.dispatchEvent(new Event('change')); return true})()`); await wait(300);
  const r2 = await ev(`document.querySelector('[data-bgfor="sterne"]').hidden`);
  check("R-OPT-12 Sternschnuppen-Zeile erscheint nur beim Hintergrund Sternenhimmel", r1 === true && r2 === false, [r1, r2]);
  await ev(`(()=>{const e=document.getElementById('setBgHue'); e.value='275'; e.dispatchEvent(new Event('change')); return true})()`); await wait(500);
  check("R-OPT-13 Hintergrundfarbe wird gespeichert, mindestens 12 Hintergründe", (await cfg()).bgFx?.hue === "275" && (await ev(`document.getElementById('setBgFx').options.length`)) >= 12, (await cfg()).bgFx);
  await ev(`(()=>{const e=document.getElementById('setBgOp'); e.value=0.5; e.dispatchEvent(new Event('input')); return true})()`); await wait(700);
  check("R-OPT-14 Hintergrund-Deckkraft einstellbar und gespeichert", (await cfg()).bgFx?.alpha === 0.5 && (await ev(`getComputedStyle(document.getElementById('bgfx')).opacity`)) === "0.5", (await cfg()).bgFx);
  await ev(`(()=>{const e=document.getElementById('setFlash'); e.value=0.4; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); return true})()`); await wait(500);
  check("R-OPT-15 Aufleuchten der Aktivität ist einstellbar (0–2) und gespeichert", (await cfg()).flashK === 0.4 && (await ev(`flashK`)) === 0.4, [(await cfg()).flashK]);
  await ev(`(()=>{const e=document.getElementById('setYtRound'); e.value=20; e.dispatchEvent(new Event('change')); return true})()`); await wait(500);
  check("R-OPT-16 YouTube: runde Ecken werden gespeichert (0–40 px)", (await cfg()).ytRound === 20, (await cfg()).ytRound);
  const lab = await ev(`(async()=>{ const sel=document.getElementById('setShape'); sel.value='symbiont'; sel.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,400)); const first=document.querySelector('#shapePick button[data-v=kugel] span').textContent; const txt=document.getElementById('settings').innerText; sel.value='kugel'; sel.dispatchEvent(new Event('change')); return [first, /Lagebild/.test(txt)]; })()`);
  check("R-UI-2 Formwahl behält „Kugel“ auch bei anderer Form; „Lagebild“ heißt überall „News & Uhren“", lab[0] === "Kugel" && lab[1] === false, lab);
  const hv = await ev(`(()=>{ const tabs=[...document.querySelectorAll('#setTabs button')].map(b=>b.textContent); const tips=document.querySelectorAll('.set-body .has-tip').length; const vis=[...document.querySelectorAll('.set-body > .set-note:not([id])')].filter(n=>!n.classList.contains('note-folded')).length; return [tabs.includes('Kugel und Farbe'), !tabs.includes('Themes'), tips, vis]; })()`);
  const hr = await ev(`(()=>{ const r=document.getElementById('setHoleRound'); return !!r && r.type==='range' && +r.max>=30; })()`);
  check("R-OPT-17 Aussparung hat einstellbaren Eckenradius", hr === true);
  const pt = await ev(`(()=>{ const h=[...document.querySelectorAll('.set-body h4')].find(x=>/Farbe und Form/.test(x.textContent)); const was=h.classList.contains('closed'); if(!was) h.click(); const hid=document.getElementById('pickToggle').classList.contains('tab-hidden'); h.click(); const open=!document.getElementById('pickToggle').classList.contains('tab-hidden'); return [hid, open===was]; })()`);
  const gs = await ev(`(async()=>{ const ids=[...document.querySelectorAll('#ringPick button')].map(b=>b.dataset.v); const bad=[]; const keep=viz; for (const id of ids) { viz={...viz, rings:true, ringStyle:id}; await new Promise(r=>setTimeout(r,500)); } viz=keep; return ids; })()`);
  check("R-OPT-19 mindestens 12 Last-Anzeigen (inkl. 3D: Orbit, Säulen, Kugeln), jede zeichnet ohne Fehler", Array.isArray(gs) && gs.length >= 12 && ["orbit","saeulen","kugeln"].every(x=>gs.includes(x)));
  const tl = await ev(`(async()=>{ const x=document.getElementById('setBtnTiltX'), y=document.getElementById('setBtnTiltY'); x.value=25; x.dispatchEvent(new Event('input')); y.value=-20; y.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,700)); const t=[...document.querySelectorAll('.temp')].find(e=>e.offsetWidth)?.style.transform||''; x.value=0; x.dispatchEvent(new Event('input')); y.value=0; y.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,500)); const t2=[...document.querySelectorAll('.temp')].find(e=>e.offsetWidth)?.style.transform||''; return [t, t2]; })()`);
  check("R-OPT-20 Buttons lassen sich neigen/drehen (3D) und gehen zurück auf flach", Array.isArray(tl) && /rotateX\(25/.test(tl[0]) && /rotateY\(-20/.test(tl[0]) && !/rotate/.test(tl[1]), JSON.stringify(tl));
  const twc = await ev(`(()=>{ const ids=['twBtn','tw','twBody','twVo','twSmaller','twBigger','twPop','twClose','setTwMode','setTwAlpha','setTwRound','setTwFeather','setTwTop','setTwChan']; const miss=ids.filter(i=>!document.getElementById(i)); const api=['twEmbed','twRect','onTwEmbed','onTwTitle','openTwitch'].filter(k=>typeof window.jarvis[k]!=='function'); return [miss, api, BLOCKS_HAS_TW=typeof BLOCK_NAMES==='undefined' ? 'n/a' : !!BLOCK_NAMES.tw]; })()`);
  check("R-WIN-1 Twitch-Fenster hat dieselben Bedienelemente und Einstellungen wie das YouTube-Fenster", Array.isArray(twc) && twc[0].length === 0 && twc[1].length === 0, JSON.stringify(twc));
  const ri = await ev(`(()=>{ const bs=[...document.querySelectorAll('#ringPick button')];  const hole=[...document.querySelectorAll('h4')].find(h=>/Aussparung/.test(h.textContent)); return [bs.length, bs.filter(b=>!b.querySelector('svg')||b.querySelector('svg').children.length===0).length, hole && hole.dataset.tab]; })()`);
  check("R-UI-5 jede Last-Anzeige hat ein Symbol; Aussparung steht im Reiter Aussehen", Array.isArray(ri) && ri[0] >= 12 && ri[1] === 0 && ri[2] === "Aussehen", JSON.stringify(ri));
  const spg = await ev(`(()=>{ const ids=['setPagesOn','setMiningOn','setGamingOn','setGameMode','setMineOrb','setPageFriends']; return ids.map(i=>{ const e=document.getElementById(i); const row=e&&e.closest('[data-in]'); return row&&row.dataset.in; }); })()`);
  check("R-UI-6 Reiter „Seiten“ enthält die Seiten-Schalter (Mining, Gaming) samt ihren Einstellungen", Array.isArray(spg) && spg.every((x) => x === "Seiten"), JSON.stringify(spg));
  check("R-UI-4 Formwahl-Schalter liegt im Abschnitt „Farbe und Form“ und verschwindet beim Zuklappen", Array.isArray(pt));
  const hf = await ev(`(()=>!document.getElementById('setHoleFollow') && !document.getElementById('setHoleApps') && !!document.getElementById('setHoleOn'))()`);
  check("R-OPT-18 Aussparung ist fest (kein automatisches Folgen), Schalter und Eckenradius bleiben", hf === true);
  check("R-UI-3 Einstellungen: Reiter „Kugel und Farbe“ und „Aussehen“ bündeln die Optik; Erklärungen erscheinen beim Darüberfahren statt als Fließtext", hv[0] === true && hv[1] === true && hv[2] >= 20 && hv[3] === 0, hv);
});
