'use strict';
const {Runner}=require('../build/runner.cjs');
const {plan}=require('../build/diagnostic-plan.cjs');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.join(__dirname,'groups-smoke-'+Date.now());
const modes=['modules','core',...Array.from({length:7},(_,i)=>'stage-'+(i+1)),...['desktop','apps','integrations','local','index','steam','network'].map(g=>'core-'+g)];
const results=[];
async function run(mode){
  const runner=new Runner({dataRoot:root,executable:path.resolve(__dirname,'../build/payload/Argus-Startdiagnose.exe')});
  return new Promise((resolve,reject)=>{
    runner.on('state',state=>{
      if(state.status==='stop-failed')reject(Error(mode+': termination failed'));
      else if(!state.active){try{
        assert.equal(state.status,'observed',mode);assert.equal(state.dumpConsent,false);
        assert.equal(state.ready,true);assert.equal(state.windowLoaded,true);assert.equal(state.observationSeconds,60);
        const events=fs.readFileSync(path.join(runner.last.report,'startup-markers.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
        assert.deepEqual(events.find(row=>row.event==='plan').detail.groups,plan(mode).groups);
        if(mode==='modules')assert(!events.some(row=>row.event==='server:begin'));
        if(!plan(mode).groups.includes('apps'))assert(!events.some(row=>row.event==='task:begin'&&row.detail?.name==='actions.refreshExtra'));
        if(['modules','core','stage-1'].includes(mode))assert(!events.some(row=>row.event==='background:spawn'),'Lower stages must not launch background processes');
        if(plan(mode).groups.includes('index'))assert(events.some(row=>row.event==='task:begin'&&row.detail?.name==='files.build'));
        else assert(!events.some(row=>row.event==='task:begin'&&row.detail?.name==='files.build'));
        results.push(state);fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));
        console.log(mode+': observed 60s; groups='+plan(mode).groups.join(','));resolve();
      }catch(error){reject(error);}}
    });
    runner.start(mode);
  });
}
(async()=>{for(let i=0;i<modes.length;i+=4)await Promise.all(modes.slice(i,i+4).map(run));console.log('PASS '+results.length+' isolated comparison runs');})().catch(error=>{console.error(error.stack);process.exitCode=1;});
