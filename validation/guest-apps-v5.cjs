'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base='C:/VMTest/diagnostic-installer-test';
const info=JSON.parse(fs.readFileSync(path.join(base,'v5-install.json'),'utf8').replace(/^\uFEFF/,''));
const app=path.join(info.installDirectory,'resources/app'),payload=path.join(info.installDirectory,'resources/diagnostic-payload');
const {Runner}=require(path.join(app,'runner.cjs'));
const {readShortcuts}=require(path.join(payload,'resources/app/shortcut-reader.cjs'));
const root=path.join(process.env.APPDATA,'argus-startdiagnose-controller');
const report={status:'RUNNING',tests:[],runs:[],installerSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'Setup-v5.exe'))).digest('hex')};
const file=path.join(base,'v5-results.json');
function save(){fs.writeFileSync(file,JSON.stringify(report,null,2));}
function pass(test,detail={}){report.tests.push({test,status:'pass',...detail});save();}
async function run(mode){
  const runner=new Runner({dataRoot:root,executable:path.join(payload,'Argus-Startdiagnose.exe')});
  return new Promise((resolve,reject)=>{runner.on('state',state=>{if(state.status==='stop-failed')return reject(Error('stop-failed'));if(state.active)return;
    try{assert.equal(state.version,'0.58.27-diagnose.5');assert.equal(state.status,'observed');assert.equal(state.observationSeconds,60);assert.equal(state.appDiscovery.callbackCompleted,true);
      const events=fs.readFileSync(path.join(runner.last.report,'startup-markers.jsonl'),'utf8');assert.match(events,/apps:callback:enter/);assert.match(events,/apps:json-parse:after/);
      assert.doesNotMatch(events,/PRIVATE|safe-test\.lnk/);
      if(mode!=='apps-worker'){assert.doesNotMatch(events,/apps:native-read:before|apps:worker.spawn:before/);}else assert(state.appDiscovery.workerOutcome);
      const zip=path.join(runner.last.dir,'VM-Bericht.zip');runner.exportZip(zip);
      const AdmZip=require(path.join(app,'node_modules/adm-zip'));const exported=new AdmZip(zip);
      assert(exported.getEntry('Ergebnis.json'));assert(!exported.getEntries().some(e=>/\.dmp|local-dumps|argus-config/.test(e.entryName)));
      if(mode==='apps-worker'&&fs.existsSync(path.join(runner.last.report,'shortcut-worker-markers.jsonl')))assert(exported.getEntry('shortcut-worker-markers.jsonl'));
      report.runs.push(state);pass(mode+'-60s-and-private-export');resolve();
    }catch(error){reject(error);}});runner.start(mode);});
}
(async()=>{
  save();
  const data=fs.mkdtempSync(path.join(root,'v5-worker-check-'));const env={};
  for(const key of ['SystemRoot','WINDIR','SystemDrive','ComSpec','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramData'])if(process.env[key])env[key]=process.env[key];
  env.ARGUS_DIAGNOSTIC_ROOT=data;env.ARGUS_USERDATA=data;
  const response=await readShortcuts([path.join(base,'shortcut-fixture-v5/safe-test.lnk')],{executable:path.join(payload,'Argus-Startdiagnose.exe'),env});
  assert.equal(response.complete,true);
  const markers=fs.readFileSync(path.join(data,'shortcut-worker-markers.jsonl'),'utf8');
  assert.match(markers,/apps:worker.native:before/);assert.match(markers,/apps:worker.native:return/);assert.match(markers,/apps:worker.appid:after/);
  assert.doesNotMatch(markers,/[A-Z]:[\\/]|\.lnk|notepad/);pass('real-electron-helper-native-read-and-private-markers');
  const observed=[];
  const crash=await readShortcuts(['unused'],{env,mark:(event,detail)=>observed.push({event,detail}),spawn:(_exe,_args,options)=>cp.spawn(process.execPath,['-e','setTimeout(()=>process.exit(-36861),100)'],options)});
  assert.equal(crash.complete,false);assert.deepEqual(crash.claimed,[]);assert.equal(observed.find(row=>row.event==='apps:worker.exit').detail.hex,'0xFFFF7003');
  pass('controlled-helper-exit-FFFF7003-survives-in-parent-and-fails-closed');
  await Promise.all(['apps-parse','apps-walk','apps-worker'].map(run));
  report.status='PASS';save();
})().catch(error=>{report.status='FAIL';report.error=error.stack;save();process.exitCode=1;});
