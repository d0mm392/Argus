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
