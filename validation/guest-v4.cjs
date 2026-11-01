'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root='C:/VMTest/diagnostic-installer-test';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const resultFile=path.join(root,'v4-results.json');
const results=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8').replace(/^\uFEFF/,'')): {tests:[]};
function record(test,detail={}){results.tests.push({test,status:'pass',...detail});fs.writeFileSync(resultFile,JSON.stringify(results,null,2));console.log('PASS '+test);}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function observe(runner,mode){return new Promise((resolve,reject)=>{runner.on('state',state=>{if(state.status==='stop-failed')reject(Error('stop failed'));else if(!state.active)resolve(state);});runner.start(mode);});}
async function baseline(){
  const install=JSON.parse(fs.readFileSync(path.join(root,'v4-install.json'),'utf8').replace(/^\uFEFF/,''));
  const {Runner}=require(path.join(install.installDirectory,'resources/app/runner.cjs'));
  const dataRoot=path.join(process.env.APPDATA,'argus-startdiagnose-controller');
  const runner=new Runner({dataRoot,executable:path.join(install.installDirectory,'resources/diagnostic-payload/Argus-Startdiagnose.exe')});
  const state=await observe(runner,'minimal');assert.equal(state.status,'observed');
  const report=path.join(process.env.USERPROFILE,'Desktop','Diagnose-v3-vor-Update.zip');runner.exportZip(report);
  results.preservedFiles=[report,path.join(runner.last.report,'Ergebnis.json'),path.join(runner.last.report,'startup-markers.jsonl')].map(file=>({file,sha256:hash(file)}));
  record('official-v3-installed-runtime-60s-and-report-before-upgrade',{version:state.version,id:state.id});
}
async function harness(){
  const {app,BrowserWindow}=require('electron');app.setName('Argus Startdiagnose');
  app.setPath('userData',path.join(process.env.APPDATA,'argus-startdiagnose-controller'));
  await app.whenReady();const win=new BrowserWindow({show:false});
  const {DiagnosticUpdates,discover}=require('./diagnostic-update.cjs');
  const {Runner}=require('./runner.cjs');const {compare}=require('semver');
  const installation=JSON.parse(fs.readFileSync(path.join(root,'v4-install.json'),'utf8').replace(/^\uFEFF/,''));
  const runner=new Runner({dataRoot:app.getPath('userData'),executable:path.join(installation.installDirectory,'resources/diagnostic-payload/Argus-Startdiagnose.exe')});
  const installer=path.join(root,'Setup-v4.exe');
  const version='0.58.27-diagnose.4',tag='diagnose-v0.58.27-4',name='Argus-Diagnose-Setup-'+version+'.exe';
  const url='https://github.com/d0mm392/Argus/releases/download/'+tag+'/'+name;
  const release={tag_name:tag,draft:false,prerelease:true,published_at:new Date().toISOString(),assets:[{name,browser_download_url:url,size:fs.statSync(installer).size},{name:'argus-diagnostic-update.json',browser_download_url:'https://github.com/d0mm392/Argus/releases/download/'+tag+'/argus-diagnostic-update.json'}]};
  const manifest={schema:1,channel:'argus-diagnostics',appId:'de.argus.startdiagnose.controller',installId:'40b90b90-1a84-48be-9616-3880377de926',version,file:{url,size:fs.statSync(installer).size,sha512:crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64')}};
  const fixtureFetch=async requested=>new Response(JSON.stringify(requested.includes('api.github.com')?[{...release,tag_name:'v999.0.0',prerelease:false},release]:manifest));
  // Local fixture transport only. No production switches, no changes to machine protection/network settings.
  const updates=new DiagnosticUpdates({app,runner,timeoutMs:150,discoverInfo:signal=>new Promise(()=>{})});
  const started=Date.now();const offlinePromise=updates.check();
  const diagnostic=observe(runner,'minimal');
  await offlinePromise;assert.equal(updates.state.status,'offline');assert(Date.now()-started<2000);assert(runner.active);
  record('offline-check-timeout-does-not-block-real-diagnostic',{elapsedMs:Date.now()-started});
  const state=await diagnostic;assert.equal(state.status,'observed');
  updates.timeoutMs=5000;
  updates.discoverInfo=signal=>discover({signal,fetchImpl:fixtureFetch,currentVersion:app.getVersion(),compare});
  await updates.check();assert.equal(updates.state.status,'available');assert.equal(updates.state.version,version);
  record('only-labelled-diagnostic-new-version-discovered-normal-release-ignored');
  let transport='error',requests=0,progress=0;
  const server=require('node:http').createServer((request,response)=>{
    requests++;
    if(transport==='error'){response.writeHead(503);response.end('fixture download error');return;}
    if(transport==='corrupt'){response.writeHead(200,{'Content-Length':65536});response.end(Buffer.alloc(65536,7));return;}
    response.writeHead(200,{'Content-Length':fs.statSync(installer).size});
    const stream=fs.createReadStream(installer,{highWaterMark:256*1024});
    stream.on('data',chunk=>{stream.pause();response.write(chunk,()=>setTimeout(()=>stream.resume(),2));});
    stream.on('end',()=>response.end());response.on('close',()=>stream.destroy());
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  updates.updater.netSession.webRequest.onBeforeRequest({urls:['https://github.com/d0mm392/Argus/releases/download/'+tag+'/*']},(_details,callback)=>callback({redirectURL:'http://127.0.0.1:'+server.address().port+'/installer.exe'}));
  updates.on('state',state=>{if(state.status==='downloading'&&state.percent>0)progress++;});
  await updates.download();assert.equal(updates.state.status,'error');assert.throws(()=>updates.install());
  record('real-electron-updater-http-download-failure-does-not-enable-install');
  transport='corrupt';await updates.download();assert.equal(updates.state.status,'error');assert.throws(()=>updates.install());
  record('real-electron-updater-rejects-corrupt-installer-sha512');
  transport='success';const observation=observe(runner,'minimal');
  await updates.download();assert.equal(updates.state.status,'ready');assert(runner.active);assert.throws(()=>updates.install());
  assert(progress>0);assert.equal(updates.updater.autoInstallOnAppQuit,false);
  record('real-download-progress-and-active-test-installation-lock',{progressEvents:progress,downloadRequests:requests});
  const completed=await observation;assert.equal(completed.status,'observed');
  const report=path.join(runner.last.report,'Ergebnis.json');
  results.preservedFiles.push({file:report,sha256:hash(report)});
  const exportFile=path.join(runner.last.dir,'Bericht-'+runner.last.summary.id+'.zip');
  const originalPreserve=runner.preserveResults.bind(runner);runner.preserveResults=()=>{originalPreserve();assert(fs.existsSync(exportFile));record('all-results-persist-before-real-nsis-restart',{exportFile});};
  record('real-nsis-production-updater-ready-to-upgrade-installed-v3',{installerSHA256:hash(installer),harnessVersion:app.getVersion(),targetVersion:version});
  results.upgradeHarness='Production updater code runs in a separate packaged v3-version VM harness because official diagnose.3 had no updater. It upgrades the official v3 installation to v4 with the actual v4 NSIS installer. No test switches shipped.';
  fs.writeFileSync(resultFile,JSON.stringify(results,null,2));
  server.close();win.destroy();updates.install();
}
if(process.versions.electron)harness().catch(error=>{results.status='FAIL';results.error=error.stack;fs.writeFileSync(resultFile,JSON.stringify(results,null,2));require('electron').app.exit(1);});
else baseline().catch(error=>{results.status='FAIL';results.error=error.stack;fs.writeFileSync(resultFile,JSON.stringify(results,null,2));console.error(error);process.exitCode=1;});
