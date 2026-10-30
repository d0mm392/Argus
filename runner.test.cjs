'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter,once}=require('node:events');
const {PassThrough}=require('node:stream');
const {Runner,safeLog}=require('./runner.cjs');
function fixture(options={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'argus-controller-test-'));
  let launches=0,child;
  const runner=new Runner({dataRoot:root,executable:path.join(root,'Payload with spaces','Argus-Startdiagnose.exe'),durationMs:10000,
    spawn:(_exe,_args,config)=>{launches++;child=new EventEmitter();child.pid=12345;child.exitCode=null;child.signalCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();child.config=config;return child;},
    terminate:async target=>{target.exitCode=1;target.emit('exit',1,null);target.stdout.end();target.stderr.end();target.emit('close',1,null);},...options});
  const exit=(code=42)=>{child.exitCode=code;child.emit('exit',code,null);child.stdout.end();child.stderr.end();child.emit('close',code,null);};
  const mark=()=>fs.writeFileSync(path.join(runner.last.profile,'startup-markers.jsonl'),'{"event":"ready"}\n{"event":"window:ready-to-show"}\n');
  return {runner,root,exit,mark,get child(){return child;},get launches(){return launches;}};
}
test('one launch per click; concurrent attempts rejected; early native exit leaves export possible',()=>{
  const f=fixture();f.runner.start();assert.throws(()=>f.runner.start(),/bereits/);assert.equal(f.launches,1);
  f.mark();f.exit(-36861);assert.equal(f.runner.snapshot().status,'aborted');assert.equal(f.runner.snapshot().exitCode,-36861);assert.equal(f.runner.active,false);
  f.runner.exportZip(path.join(f.root,'report.zip'));assert.ok(fs.existsSync(path.join(f.root,'report.zip')));assert.equal(f.launches,1);
});
test('successful observation stops only own child once and records fresh-profile limitation',async()=>{
  let killed=0;
  const f=fixture({durationMs:15});const terminate=f.runner.terminate;f.runner.terminate=async child=>{killed++;assert.equal(child.pid,12345);return terminate(child);};
  f.runner.start();f.mark();
  await new Promise(resolve=>f.runner.on('state',state=>{if(!state.active)resolve();}));
  assert.equal(f.runner.snapshot().status,'success');assert.equal(killed,1);assert.equal(f.launches,1);
  assert.match(f.runner.snapshot().profileDescription,/NICHT/);
});
test('collection failure retains other logs and export contains no profiles/dumps/config/messages',()=>{
  const f=fixture();f.runner.start();f.mark();
  fs.mkdirSync(path.join(f.runner.last.profile,'electron.log'));
  fs.writeFileSync(path.join(f.runner.last.profile,'private.dmp'),'NEVER EXPORT');
  fs.writeFileSync(path.join(f.runner.last.profile,'messages.json'),'NEVER EXPORT');
  f.child.stdout.write('http://private.example/?token=secret\n');
  f.child.stderr.write('[INFO:CONSOLE(1)] "PRIVATE MESSAGE"\n');
  f.exit();assert.ok(f.runner.snapshot().collectionErrors.length>0);
  const destination=path.join(f.root,'output.zip');f.runner.exportZip(destination);
  const zip=new (require('adm-zip'))(destination);
  assert.ok(zip.getEntry('startup-markers.jsonl'));assert.ok(zip.getEntry('Sammlungsfehler.jsonl'));
  assert.ok(!zip.getEntries().some(e=>/profile|config|messages|\.dmp/.test(e.entryName)));
  for(const entry of zip.getEntries())assert.doesNotMatch(entry.getData().toString(),/PRIVATE MESSAGE|private\.example|NEVER EXPORT/);
});
test('spawn errors are separate from collection errors; no restart',()=>{
  let launches=0;const f=fixture({spawn:()=>{launches++;throw Error('spawn denied');}});
  const state=f.runner.start();assert.equal(state.status,'start-failed');assert.equal(launches,1);
  assert.equal(state.startErrors.length,1);assert.ok(fs.existsSync(path.join(f.runner.last.report,'Startfehler.jsonl')));
});
test('redaction across stream chunks and failed exports preserve existing report',()=>{
  const f=fixture();f.runner.start();f.mark();
  f.child.stderr.write('https://sec');f.child.stderr.write('ret.example/path\n');f.exit();
  assert.doesNotMatch(fs.readFileSync(path.join(f.runner.last.report,'stderr.log'),'utf8'),/secret\.example/);
  fs.writeFileSync(path.join(f.root,'blocked'),'file, not a directory');
  assert.throws(()=>f.runner.exportZip(path.join(f.root,'blocked','out.zip')));
  assert.ok(fs.existsSync(path.join(f.runner.last.report,'startup-markers.jsonl')));
  assert.equal(f.launches,1);
  assert.doesNotMatch(safeLog('C:\\Users\\PrivatePerson\\file Authorization=abc\n'),/PrivatePerson|=abc/);
});
test('termination failure remains exportable but blocks new attempts',async()=>{
  const f=fixture({durationMs:10,terminate:async()=>{throw Error('termination denied');}});
  f.runner.start();f.mark();
  await new Promise(resolve=>f.runner.on('state',state=>{if(state.reportReady)resolve();}));
  assert.equal(f.runner.snapshot().status,'stop-failed');assert.equal(f.runner.active,true);
  assert.throws(()=>f.runner.start(),/bereits/);
  f.runner.exportZip(path.join(f.root,'termination-error.zip'));
  assert.ok(fs.existsSync(path.join(f.root,'termination-error.zip')));f.exit();
});
