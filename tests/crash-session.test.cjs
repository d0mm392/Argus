'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'argus-crash-'));
  delete require.cache[require.resolve('../crash')]; const crash=require('../crash');
  t.after(()=>{crash.clean();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,crash,log:path.join(dir,'error.log'),marker:path.join(dir,'running.flag')};
}
test('confirmed session end removes marker, subsequent start has no warning', t=>{
  const f=fixture(t);f.crash.init(f.dir,f.log);assert(fs.existsSync(f.marker));f.crash.clean();f.crash.init(f.dir,f.log);assert.equal(f.crash.pending().length,0);
});
test('process kill without errors remains detectable, old weather errors excluded',t=>{
  const f=fixture(t),now=Date.now();fs.writeFileSync(f.marker,JSON.stringify({started:now-3600000,heartbeat:now}));
  fs.writeFileSync(f.log,`${new Date(now-1800000).toISOString()} api.open-meteo.com 503\nold stack\n`);
  f.crash.init(f.dir,f.log);assert.equal(f.crash.pending().length,1);assert(!f.crash.pending()[0].stack.includes('503'));
});
test('log context bounded on both sides, continuation lines belong to their timestamp',t=>{
  const f=fixture(t),now=Date.now();fs.writeFileSync(f.marker,JSON.stringify({started:now-3600000,heartbeat:now}));
  fs.writeFileSync(f.log,`${new Date(now-30000).toISOString()} OLD\nold stack\n[${new Date(now).toISOString()}] NEAR\nnear stack\n${new Date(now+60000).toISOString()} FUTURE\nfuture stack\n`);
  f.crash.init(f.dir,f.log);const s=f.crash.pending()[0].stack;assert(s.includes('NEAR'));assert(s.includes('near stack'));assert(!s.includes('OLD'));assert(!s.includes('FUTURE'));
});
test('legacy running marker reports unknown interruption without historical cause',t=>{
  const f=fixture(t);fs.writeFileSync(f.marker,String(Date.now()-3600000));f.crash.init(f.dir,f.log);assert.equal(f.crash.pending().length,1);
});
test('damaged running marker does not hide an interrupted process',t=>{
  const f=fixture(t);fs.writeFileSync(f.marker,'{"started":');f.crash.init(f.dir,f.log);assert.equal(f.crash.pending().length,1);
});
const history=(f,items)=>fs.writeFileSync(path.join(f.dir,'crash-history.json'),JSON.stringify(items));
const pendingFile=(f,items)=>fs.writeFileSync(path.join(f.dir,'crash-pending.json'),JSON.stringify({items,ignored:[]}));
const LEGACY={t:'2026-11-02T15:39:09.303Z',kind:'Unerwartet beendet',msg:'Argus wurde beim letzten Mal nicht normal beendet.',stack:'2026-11-02T13:25:32.469Z Error: api.open-meteo.com antwortet mit 503',sig:'x'};
test('already copied legacy report is not shown again, history and backup stay',t=>{
  const f=fixture(t),h=[{id:'a',t:new Date().toISOString(),title:'Fehlerbericht',state:'kopiert',text:'### Unerwartet beendet (2026-11-02T15:39:09.303Z)\nalt'}];
  history(f,h);pendingFile(f,[LEGACY]);f.crash.init(f.dir,f.log,null,'9.9.9');
  assert.equal(f.crash.pending().length,0);assert.equal(f.crash.history().length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'crash-pending.before-0.58.31.json'))).items.length,1);
});
test('open legacy report names no event version and does not present old weather errors',t=>{
  const f=fixture(t);pendingFile(f,[LEGACY]);f.crash.init(f.dir,f.log,null,'9.9.9');
  const r=f.crash.build({version:'9.9.9'});assert(r.text.includes('Ereigniszeitpunkt: nicht erfasst'));assert(r.text.includes('Bericht erstellt mit Argus 9.9.9'));assert(!r.text.includes('open-meteo'));
});
test('marker carries the version of the run; event and current version stay separate',t=>{
  const f=fixture(t);f.crash.init(f.dir,f.log,null,'1.0.0');assert.equal(JSON.parse(fs.readFileSync(f.marker)).version,'1.0.0');
  delete require.cache[require.resolve('../crash')];const next=require('../crash');next.init(f.dir,f.log,null,'2.0.0');t.after(()=>next.clean());
  const r=next.build({version:'2.0.0'});assert(r.text.includes('Ereigniszeitpunkt: 1.0.0'));assert(r.text.includes('Bericht erstellt mit Argus 2.0.0'));
});
test('handled network errors next to an interruption are not attached',t=>{
  const f=fixture(t),now=Date.now();fs.writeFileSync(f.marker,JSON.stringify({started:now-3600000,heartbeat:now,version:'1'}));
  fs.writeFileSync(f.log,`${new Date(now-2000).toISOString()} Error: api.open-meteo.com antwortet mit 503\n    at get\n${new Date(now-1000).toISOString()} TypeError: real failure\n    at x\n`);
  f.crash.init(f.dir,f.log,null,'2');const s=f.crash.pending()[0].stack;assert(!s.includes('open-meteo'));assert(s.includes('real failure'));
});
test('every unclean end is recorded, even with an open report or an ignored signature',t=>{
  const f=fixture(t),now=Date.now();pendingFile(f,[{...LEGACY,msg:'Der vorherige Argus-Lauf wurde ohne bestätigtes reguläres Ende unterbrochen. Die Ursache ist unbekannt.'}]);
  fs.writeFileSync(f.marker,JSON.stringify({started:now-9000,heartbeat:now-1000,version:'1'}));f.crash.init(f.dir,f.log,null,'2');assert.equal(f.crash.pending().length,2);
  f.crash.build({version:'2'});f.crash.clear(true);assert.equal(f.crash.pending().length,0);
  fs.writeFileSync(f.marker,JSON.stringify({started:now-9000,heartbeat:now-500,version:'2'}));f.crash.init(f.dir,f.log,null,'2');assert.equal(f.crash.pending().length,1);
});
test('confirming clears only what was shown; a new error stays open',t=>{
  const f=fixture(t);f.crash.init(f.dir,f.log,null,'2');f.crash.add('Fehler A','a');f.crash.build({version:'2'});f.crash.add('Fehler B','b');f.crash.clear();
  assert.deepEqual(f.crash.pending().map(x=>x.kind),['Fehler B']);
});
test('copy then send keeps one history entry with the furthest state',t=>{
  const f=fixture(t);f.crash.init(f.dir,f.log,null,'2');f.crash.add('Fehler A','a');const r=f.crash.build({version:'2'});
  f.crash.archive(r.title,r.text,'kopiert');f.crash.archive(r.title,r.text,'gesendet');f.crash.archive(r.title,r.text,'kopiert');
  const l=f.crash.history();assert.equal(l.length,1);assert.equal(l[0].state,'gesendet');
});
test('old history entries open with a note and stay unchanged on disk',t=>{
  const f=fixture(t),text='Argus 0.58.30 · Windows\n\n### Unerwartet beendet (2026-11-02T15:39:09.303Z)\nalt';
  history(f,[{id:'a',t:new Date().toISOString(),title:'x',state:'kopiert',text}]);f.crash.init(f.dir,f.log,null,'2');
  assert(f.crash.view('a').text.startsWith('Hinweis:'));assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'crash-history.json')))[0].text,text);
});
