'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const WebSocket=require('C:/VMTest/argus-hotfix/node_modules/ws');
const root='C:/VMTest/diagnostic-installer-test';
const bridge=process.argv[2]||root;
const results=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ws,serial=0;
const pending=new Map();
async function connect(){
  for(let i=0;i<30;i++){
    try{
      const pages=await(await fetch('http://127.0.0.1:9334/json')).json();
      const page=pages.find(p=>p.url.endsWith('/index.html'));
      if(!page)throw Error('page not ready');
      ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
      ws.on('message',raw=>{const message=JSON.parse(raw.toString());if(pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);}});
      return;
    }catch(e){if(i===29)throw e;await wait(500);}
  }
}
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP Timeout: '+method));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const reply=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails));return reply.result.value;}
async function state(){return evaluate('window.diagnostic.state()');}
async function until(predicate,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const value=await predicate();if(value)return value;await wait(300);}throw Error('Timeout beim Warten auf UI/Ergebnis');}
async function screenshot(name){try{await command('Page.enable');await command('Page.bringToFront');const result=await command('Page.captureScreenshot');fs.writeFileSync(path.join(root,name),Buffer.from(result.data,'base64'));if(bridge!==root)fs.copyFileSync(path.join(root,name),path.join(bridge,name));}catch(e){results.push({test:name,status:'screenshot-unavailable',reason:e.message});}}
async function saveReport(label,expected){
  const s=await state();
  const desktop=path.join(process.env.USERPROFILE,'Desktop');
  const file=path.join(desktop,'Argus-Diagnose-Bericht-'+s.id+'.zip');
  fs.writeFileSync(path.join(bridge,'save-request.flag'),label);
  await evaluate('document.getElementById("save").click(); true');
  await until(()=>fs.existsSync(file),30000);
  const install=JSON.parse(fs.readFileSync(path.join(root,'install.json'),'utf8').replace(/^\uFEFF/,''));
  const AdmZip=require(path.join(install.installDirectory,'resources/app/node_modules/adm-zip'));
  const zip=new AdmZip(file);
  const summary=JSON.parse(zip.getEntry('Ergebnis.json').getData().toString());
  assert.equal(summary.status,expected);assert.equal(summary.freshProfile,true);
  assert.ok(zip.getEntry('stdout.log'));assert.ok(zip.getEntry('stderr.log'));
  assert.ok(!zip.getEntries().some(e=>/\.dmp$|argus-config|Cookies|messages|profile\//i.test(e.entryName)));
  fs.copyFileSync(file,path.join(root,label+'.zip'));
  if(bridge!==root)fs.copyFileSync(file,path.join(bridge,label+'.zip'));
  results.push({test:label+'-native-save-dialog-desktop-export',status:'pass',entries:zip.getEntries().map(e=>e.entryName),resultStatus:summary.status});
}
async function main(){
  const progress=message=>fs.appendFileSync(path.join(bridge,'progress.txt'),new Date().toISOString()+' '+message+'\n');
  progress('test-start');
  const data=path.join(process.env.APPDATA,'argus-startdiagnose-controller/runs');
  const initialRuns=fs.existsSync(data)?fs.readdirSync(data).length:0;
  await connect();progress('CDP-connected');assert.equal((await state()).status,'idle');
  await screenshot('ui-ready.png');
  await evaluate('document.getElementById("start").click(); true');
  progress('first-click');
  await until(async()=>{const s=await state();return s.active&&s.pid?s:false;});
  assert.equal(await evaluate('document.getElementById("start").disabled'),true);
  const parallel=await evaluate('window.diagnostic.start().then(()=>"unexpected",()=>"rejected")');assert.equal(parallel,'rejected');
  const success=await until(async()=>{const s=await state();return !s.active?s:false;});
  assert.equal(success.status,'success');assert.ok(success.windowLoaded);assert.ok(success.observationCompleted);assert.equal(success.observationSeconds,60);
  assert.equal(success.collectionErrors.length,0);results.push({test:'normal-user-success-60s-and-concurrency-guard',status:'pass',exitCode:success.exitCode});
  progress('success');
  await screenshot('ui-success.png');await saveReport('success-report','success');
  progress('success-exported');
  await evaluate('document.getElementById("start").click(); true');
  const running=await until(async()=>{const s=await state();return s.active&&s.pid?s:false;});
  await wait(2000);cp.execFileSync('taskkill.exe',['/PID',String(running.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  const aborted=await until(async()=>{const s=await state();return !s.active?s:false;});
  assert.equal(aborted.status,'aborted');assert.notEqual(aborted.exitCode,null);assert.notEqual(aborted.exitCode,0);
  assert.ok(await evaluate('!document.getElementById("save").disabled'));
  await screenshot('ui-aborted.png');await saveReport('aborted-report','aborted');
  const stableId=aborted.id;await wait(1500);assert.equal((await state()).id,stableId);
  results.push({test:'forced-child-abort-controller-survives-no-auto-retry',status:'pass',exitCode:aborted.exitCode});
  const runs=fs.readdirSync(data);assert.equal(runs.length-initialRuns,2);
  results.push({test:'exactly-two-physical-attempts-for-two-button-presses',status:'pass',attempts:runs.length-initialRuns});
  fs.writeFileSync(path.join(root,'ui-results.json'),JSON.stringify({status:'PASS',results},null,2));
  if(bridge!==root)fs.copyFileSync(path.join(root,'ui-results.json'),path.join(bridge,'ui-results.json'));
  fs.writeFileSync(path.join(root,'tests-finished.flag'),'ok');
  fs.writeFileSync(path.join(bridge,'tests-finished.flag'),'ok');
  ws.close();console.log('PASS '+results.length+' UI/Integrationspruefungen');
}
main().catch(async e=>{fs.writeFileSync(path.join(root,'ui-results.json'),JSON.stringify({status:'FAIL',error:e.stack,results},null,2));if(bridge!==root)fs.copyFileSync(path.join(root,'ui-results.json'),path.join(bridge,'ui-results.json'));try{await screenshot('ui-failure.png');}catch{}fs.writeFileSync(path.join(bridge,'tests-finished.flag'),'failed');fs.writeFileSync(path.join(root,'tests-finished.flag'),'failed');if(ws)ws.close();console.error(e.stack);process.exitCode=1;});
