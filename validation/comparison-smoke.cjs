'use strict';
const {Runner}=require('../build/runner.cjs');
const path=require('node:path');
const fs=require('node:fs');
const root=path.join(__dirname,'comparison-smoke-'+Date.now());
const results=[];
(async()=>{
  for(const mode of ['minimal','argus-no-gpu']) {
    const runner=new Runner({dataRoot:root,executable:path.resolve(__dirname,'../build/dist/win-unpacked/resources/diagnostic-payload/Argus-Startdiagnose.exe')});
    await new Promise((resolve,reject)=>{
      runner.on('state',state=>{
        if(state.status==='stop-failed')reject(Error('Termination failed'));
        else if(!state.active){results.push(state);console.log(JSON.stringify(state));resolve();}
      });
      runner.start(mode);
    });
  }
  fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));
  if(results.some(row=>row.status!=='observed'||!row.windowLoaded||!row.ready||row.dumpConsent))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
