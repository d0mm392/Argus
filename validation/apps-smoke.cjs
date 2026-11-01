'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runner}=require('../build/runner.cjs');
const root=path.join(__dirname,'apps-smoke-'+Date.now());const results=[];
async function run(mode){
  const runner=new Runner({dataRoot:root,executable:path.resolve(__dirname,'../build/payload/Argus-Startdiagnose.exe')});
  return new Promise((resolve,reject)=>{
    runner.on('state',state=>{
      if(state.status==='stop-failed')return reject(Error('termination failed'));
      if(state.active)return;
      try{
        assert.equal(state.status,'observed',mode);assert.equal(state.observationSeconds,60);assert.equal(state.appDiscovery.callbackCompleted,true);
        const events=fs.readFileSync(path.join(runner.last.report,'startup-markers.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
        const has=name=>events.some(row=>row.event===name);
        assert(has('apps:callback:enter'));assert(has('apps:resolve:after'));
        if(mode==='apps-callback')assert(!has('apps:json-parse:before'));
        if(['apps-callback','apps-parse','apps-walk'].includes(mode)){assert(!has('apps:native-read:before'));assert(!has('apps:worker.spawn:before'));}
        if(mode==='apps-worker'){
          assert(state.appDiscovery.workerOutcome);assert(['ok','incomplete'].includes(state.appDiscovery.workerOutcome.reason),'Worker transport/native completion must succeed locally');
          assert.equal(state.appDiscovery.workerExit.code,0);assert(fs.existsSync(path.join(runner.last.report,'shortcut-worker-markers.jsonl')));
          const worker=fs.readFileSync(path.join(runner.last.report,'shortcut-worker-markers.jsonl'),'utf8');assert.match(worker,/worker:complete/);
          assert.doesNotMatch(worker,/[A-Z]:[\\/]|\.lnk|appUserModelId|PRIVATE/);
        }
        runner.exportZip(path.join(runner.last.dir,'Testbericht.zip'));
        results.push(state);fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));
        console.log(mode+': '+state.status+'; worker='+JSON.stringify(state.appDiscovery.workerOutcome));resolve();
      }catch(error){reject(error);}
    });runner.start(mode);
  });
}
(async()=>{for(const modes of [['apps-parse','apps-walk','apps-worker'],['apps-callback']])await Promise.all(modes.map(run));console.log('PASS '+results.length+' focused runs');})().catch(error=>{console.error(error.stack);process.exitCode=1;});
