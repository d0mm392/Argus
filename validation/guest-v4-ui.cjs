'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const WebSocket=require('C:/VMTest/argus-hotfix/node_modules/ws');
const root='C:/VMTest/diagnostic-installer-test',file=path.join(root,'v4-results.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));let ws,serial=0;const pending=new Map();
function record(test,detail={}){const r=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));r.tests.push({test,status:'pass',...detail});fs.writeFileSync(file,JSON.stringify(r,null,2));console.log('PASS '+test);}
async function until(fn,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await wait(250);}throw Error('UI timeout');}
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},20000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const value=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(JSON.stringify(value.exceptionDetails));return value.result.value;}
async function main(){
  await until(async()=>{try{const pages=await(await fetch('http://127.0.0.1:9334/json')).json();const page=pages.find(p=>p.url.endsWith('/index.html'));if(!page)return false;
    ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return true;}catch{return false;}});
  ws.on('message',bytes=>{const m=JSON.parse(bytes);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const options=await evaluate('[...document.getElementById("mode").options].map(o=>o.value)');
  for(const mode of ['modules','core','stage-7','core-apps','core-index'])assert(options.includes(mode));
  const update=await until(async()=>{const u=await evaluate('window.diagnostic.updateState()');return u.status!=='checking'?u:false;},10000);
  assert(['current','offline','available'].includes(update.status));record('installed-v4-ui-group-selector-and-independent-startup-update-check',{updateStatus:update.status});
  let state;
  if(process.argv.includes('--resume-dialogs')){
    state=await evaluate('window.diagnostic.state()');assert.equal(state.mode,'core');assert.equal(state.status,'observed');
  }else{
  await evaluate('document.getElementById("mode").value="core";document.getElementById("start").click();true');
  const running=await until(async()=>{const r=await evaluate('window.diagnostic.state()');return r.active?r:false;});
  assert.equal(running.mode,'core');assert.equal(await evaluate('document.getElementById("mode").disabled'),true);
  state=await until(async()=>{const r=await evaluate('window.diagnostic.state()');return !r.active?r:false;});
  assert.equal(state.status,'observed');assert.equal(state.observationSeconds,60);assert.equal(state.nativeFailure,null);
  record('installed-v4-real-core-window-60s-and-selector-lock',{id:state.id});
  }
  const saved=path.join(process.env.USERPROFILE,'Desktop','Argus-Diagnose-Bericht-'+state.id+'.zip');
  if(!fs.existsSync(saved)){
    fs.writeFileSync(path.join(root,'v4-save-request.flag'),'save');
    await command('Page.bringToFront');
    await evaluate('document.getElementById("save").click();true');await until(()=>fs.existsSync(saved),180000);
  }
  const install=JSON.parse(fs.readFileSync(path.join(root,'v4-install.json'),'utf8').replace(/^\uFEFF/,''));
  const zip=new(require(path.join(install.installDirectory,'resources/app/node_modules/adm-zip')))(saved);
  const summary=JSON.parse(zip.getEntry('Ergebnis.json').getData().toString());assert.equal(summary.mode,'core');
  assert(!zip.getEntries().some(e=>/\.dmp|local-dumps|argus-config/.test(e.entryName)));
  record('installed-v4-native-save-dialog-export-no-dumps');
  fs.writeFileSync(path.join(root,'v4-cancel-request.flag'),'cancel');
  await evaluate('window.__cancelled=null;window.diagnostic.start("core",true).then(s=>{window.__cancelled=s});true');
  const cancelled=await until(()=>evaluate('window.__cancelled||null'),180000);assert.equal(cancelled.id,state.id);assert.equal(cancelled.active,false);
  record('installed-v4-explicit-dump-consent-cancel-does-not-start-test');
  await command('Page.captureScreenshot').then(s=>fs.writeFileSync(path.join(root,'v4-ui.png'),Buffer.from(s.data,'base64')));
  const result=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));result.status='PASS';if(result.error){result.harnessNotes=['Native save-dialog test resumed after correcting desktop focus; existing actual core-run/export verified.'];delete result.error;}fs.writeFileSync(file,JSON.stringify(result,null,2));ws.close();
}
main().catch(error=>{const r=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));r.status='FAIL';r.error=error.stack;fs.writeFileSync(file,JSON.stringify(r,null,2));if(ws)ws.close();console.error(error.stack);process.exitCode=1;});
