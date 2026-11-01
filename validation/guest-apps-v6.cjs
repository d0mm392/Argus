'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base='C:/VMTest/diagnostic-installer-test';
const info=JSON.parse(fs.readFileSync(path.join(base,'v6-install.json'),'utf8').replace(/^\uFEFF/,''));
const app=path.join(info.installDirectory,'resources/app'),payload=path.join(info.installDirectory,'resources/diagnostic-payload');
const {Runner}=require(path.join(app,'runner.cjs'));
const {readShortcuts}=require(path.join(payload,'resources/app/shortcut-reader.cjs'));
const root=path.join(process.env.APPDATA,'argus-startdiagnose-controller');
const report={status:'RUNNING',tests:[],runs:[],installerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'Setup-v6.exe'))).digest('hex')};
const file=path.join(base,'v6-results.json');const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
function pass(test,detail={}){report.tests.push({test,status:'pass',...detail});save();}
(async()=>{
  save();const data=fs.mkdtempSync(path.join(root,'v6-helper-check-'));const env={};
  for(const key of ['SystemRoot','WINDIR','SystemDrive','ComSpec','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramData'])if(process.env[key])env[key]=process.env[key];
  env.ARGUS_DIAGNOSTIC_ROOT=data;env.ARGUS_USERDATA=data;
  const options={env,executable:path.join(payload,'Argus-Startdiagnose.exe')},input=[path.join(base,'shortcut-fixture-v6/safe-test.lnk')];
  assert.equal((await readShortcuts(input,options)).complete,true);
  const resolved=await readShortcuts(input,{...options,operation:'resolve'});
  assert.equal(resolved.complete,true);assert.equal(resolved.shortcuts.length,1);assert.match(resolved.shortcuts[0].target,/notepad\.exe$/i);assert.equal(resolved.shortcuts[0].args,'');
  const markers=fs.readFileSync(path.join(data,'shortcut-worker-markers.jsonl'),'utf8');assert.match(markers,/apps:worker.appid:after/);assert.match(markers,/apps:worker.target:after/);assert.doesNotMatch(markers,/[A-Z]:[\\/]|\.lnk|notepad/);
  pass('real-helper-collision-and-launch-resolution-with-private-markers');
  const observed=[];let starts=0;
  const failed=await readShortcuts(input,{...options,operation:'resolve',mark:(event,detail)=>observed.push({event,detail}),spawn:(_exe,_args,config)=>{starts++;return cp.spawn(process.execPath,['-e','setTimeout(()=>process.exit(-36861),100)'],config);}});
  assert.equal(failed.complete,false);assert.equal(starts,1);assert.equal(observed.find(e=>e.event==='apps:worker.exit').detail.hex,'0xFFFF7003');
  pass('controlled-helper-failure-rejects-launch-result-without-retry');
  assert.doesNotMatch(fs.readFileSync(path.join(payload,'resources/app/actions.js'),'utf8'),/\.readShortcutLink\s*\(/);
  assert.match(fs.readFileSync(path.join(app,'index.html'),'utf8'),/value="full-normal"/);
  pass('all-native-shortcut-calls-confined-to-worker');
  const runner=new Runner({dataRoot:root,executable:path.join(payload,'Argus-Startdiagnose.exe')});
  await new Promise((resolve,reject)=>{
    runner.on('state',state=>{if(state.active)return;try{
      assert.equal(state.status,'observed');assert.equal(state.version,'0.58.27-diagnose.6');assert.equal(state.observationSeconds,60);
      assert.equal(state.hardwareAccelerationDisabled,false);assert([true,null].includes(state.hardwareAccelerationObserved));
      assert.deepEqual(state.plan.groups,['desktop','apps','integrations','local','index','steam','network']);assert.equal(state.appDiscovery.callbackCompleted,true);
      const events=fs.readFileSync(path.join(runner.last.report,'startup-markers.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(events.filter(e=>e.event==='apps:worker.spawn:before').length,1);assert(!events.some(e=>e.event==='apps:native-read:before'||e.event==='apps:launch-native:before'));
      const zip=path.join(runner.last.dir,'VM-Gesamtlauf.zip');runner.exportZip(zip);const AdmZip=require(path.join(app,'node_modules/adm-zip'));const exported=new AdmZip(zip);
      assert(exported.getEntry('shortcut-worker-markers.jsonl'));assert(!exported.getEntries().some(e=>/\.dmp|local-dumps|argus-config/.test(e.entryName)));
      report.runs.push(state);pass('full-argus-60s-normal-acceleration-policy-and-export');resolve();
    }catch(error){reject(error);}});runner.start('full-normal');
  });
  report.status='PASS';save();
})().catch(error=>{report.status='FAIL';report.error=error.stack;save();process.exitCode=1;});
