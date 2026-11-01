'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runner}=require('../build/runner.cjs');
const resume=process.argv.includes('--verify-last');
const root=resume?path.join(__dirname,fs.readdirSync(__dirname).filter(name=>/^full-normal-\d+$/.test(name)).sort().at(-1)):path.join(__dirname,'full-normal-'+Date.now());
const runner=new Runner({dataRoot:root,executable:path.resolve(__dirname,'../build/payload/Argus-Startdiagnose.exe')});
function verify(state){
  if(state.active)return;
  try{
    assert.equal(state.status,'observed');assert.equal(state.version,'0.58.27-diagnose.6');assert.equal(state.hardwareAccelerationDisabled,false);assert([true,null].includes(state.hardwareAccelerationObserved));
    assert.deepEqual(state.plan.groups,['desktop','apps','integrations','local','index','steam','network']);
    assert.equal(state.appDiscovery.callbackCompleted,true);
    const events=fs.readFileSync(path.join(runner.last.report,'startup-markers.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.filter(row=>row.event==='apps:worker.spawn:before').length,1);
    assert(!events.some(row=>row.event==='apps:native-read:before'||row.event==='apps:launch-native:before'));
    runner.exportZip(path.join(root,'full-normal-report.zip'));fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(state,null,2));
    console.log(JSON.stringify({status:'PASS',mode:state.mode,acceleration:state.hardwareAccelerationObserved,worker:state.appDiscovery.workerOutcome}));
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
runner.on('state',verify);
if(resume){
  const dir=path.join(root,'runs',fs.readdirSync(path.join(root,'runs'))[0]);
  const summary=JSON.parse(fs.readFileSync(path.join(dir,'report/Ergebnis.json')));
  runner.last={dir,profile:path.join(dir,'profile'),report:path.join(dir,'report'),summary};verify({...summary,active:false});
}else runner.start('full-normal');
