'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
assert(/^argus-test/i.test(process.env.COMPUTERNAME));
const base='C:\\VMTest\\weather-0.58.30',ud=path.join(process.env.APPDATA,'argus-desktop'),mode=process.argv[2]||'prepare';
const log=s=>{fs.appendFileSync(path.join(base,'progress.log'),s+'\n');console.log(s);};
const ps=code=>cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();
const root=()=>ps("(Get-ItemProperty 'HKCU:\\Software\\945e4693-f1e6-5452-ad8c-039e56b4ccec').InstallLocation");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const read=f=>JSON.parse(fs.readFileSync(path.join(ud,f),'utf8'));
function stop(){try{cp.execFileSync('taskkill.exe',['/IM','Argus.exe','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
async function launch(){
 const child=cp.spawn(path.join(root(),'Argus.exe'),['--remote-debugging-port=9349'],{stdio:'ignore',windowsHide:true});child.unref();
 let target;for(let i=0;i<90;i++){await wait(1000);try{target=(await(await fetch('http://127.0.0.1:9349/json')).json()).find(t=>t.type==='page'&&t.title==='Argus'&&/^http:/.test(t.url));if(target)break;}catch{}}
 assert(target,'renderer ready');
 const WS=require(path.join(root(),'resources/app/node_modules/ws')),ws=new WS(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});let seq=0;
 const ev=expression=>new Promise((resolve,reject)=>{const id=++seq;const listener=raw=>{const m=JSON.parse(raw);if(m.id===id){ws.off('message',listener);if(m.error||m.result.exceptionDetails)reject(Error(JSON.stringify(m)));else resolve(m.result.result.value);}};ws.on('message',listener);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
 assert.equal((await ev('window.argus.getConfig().then(c=>c.version)')),'0.58.30');
 return{ev,close:()=>ws.close(),pid:child.pid};
}
function noUnexpected(label){const items=fs.existsSync(path.join(ud,'crash-pending.json'))?read('crash-pending.json').items:[];assert(!items.some(i=>i.kind==='Unerwartet beendet'),JSON.stringify(items));log('PASS '+label);}
async function main(){
 if(mode==='prepare'){
  stop();cp.execFileSync(path.join(base,'Setup.exe'),['/S'],{windowsHide:true,stdio:'ignore',timeout:300000});stop();
  if(fs.existsSync(ud))fs.renameSync(ud,ud+'.weather30-backup-'+Date.now());fs.mkdirSync(ud,{recursive:true});
  fs.writeFileSync(path.join(ud,'argus-config.json'),JSON.stringify({setupDone:true,autostart:false,autoUpdate:false,crashReport:false,weatherOn:false,wxPlaces:'Berlin;Bonn',memoryOn:false,claudeDesktopLink:false,micOnStart:false,voiceOutput:false,mediaOn:false,steamOn:false,discordOn:false,newsOn:false,sensors:false,notesText:'WEATHER30 PRESERVE'}));
  const app=await launch();assert(fs.existsSync(path.join(ud,'running.flag')));noUnexpected('fresh installed start');
  const ui=await app.ev(`(()=>{wxOn=true;wxData={loc:{city:'Berlin'},data:{cur:{temp:18,feels:17,hum:50,code:0,wind:5,gust:6},hours:[],days:[]},ts:1700000000000,error:'Wetterdienst vorübergehend nicht erreichbar',places:[]};renderWx();return document.getElementById('wxHint').textContent;})()`);
  assert(ui.includes('Veraltete Wetterdaten')&&ui.includes('Stand'));log('PASS installed renderer stale weather timestamp');
  await app.ev('window.argus.quit();true');app.close();await wait(3000);assert(!fs.existsSync(path.join(ud,'running.flag')));log('PASS normal quit removes running marker');
  const killed=await launch();stop();killed.close();assert(fs.existsSync(path.join(ud,'running.flag')));const restarted=await launch();
  assert(read('crash-pending.json').items.some(i=>i.kind==='Unerwartet beendet'));log('PASS forced process termination detected without error log');
  await restarted.ev('window.argus.quit();true');restarted.close();await wait(2000);
  fs.writeFileSync(path.join(ud,'crash-pending.json'),JSON.stringify({items:[],ignored:[]}));
  const c=read('argus-config.json');assert.equal(c.wxPlaces,'Berlin;Bonn');assert(JSON.stringify(c).includes('WEATHER30 PRESERVE'));log('PASS settings and locations retained');
  log('READY system-end tests');
 }else if(mode==='arm-restart'||mode==='arm-shutdown'||mode==='arm-logoff'){
  const a=await launch();noUnexpected('before '+mode);assert(fs.existsSync(path.join(ud,'running.flag')));a.close();log('ARMED '+mode);
  await wait(86400000);
 }else if(mode==='verify'){
  assert(!fs.existsSync(path.join(ud,'running.flag')),'confirmed Windows session end removed marker before next start');
  log('PASS system-end marker removed');const a=await launch();noUnexpected('start after Windows session end');await a.ev('window.argus.quit();true');a.close();await wait(2000);log('VERIFIED');
 }
}
main().catch(e=>{log('FAIL '+e.stack);process.exitCode=1;});
