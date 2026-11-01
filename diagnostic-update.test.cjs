'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {DiagnosticUpdates,validateManifest,discover,APP_ID,INSTALL_ID}=require('./diagnostic-update.cjs');
function pair(){
  const version='0.58.27-diagnose.4',tag='diagnose-v0.58.27-4';
  const name='Argus-Diagnose-Setup-'+version+'.exe',url='https://github.com/d0mm392/Argus/releases/download/'+tag+'/'+name;
  const manifest={schema:1,channel:'argus-diagnostics',appId:APP_ID,installId:INSTALL_ID,version,file:{url,size:1234,sha512:Buffer.alloc(64,1).toString('base64')}};
  const release={tag_name:tag,prerelease:true,draft:false,assets:[{name,size:1234,browser_download_url:url},{name:'argus-diagnostic-update.json',browser_download_url:'https://github.com/d0mm392/Argus/releases/download/'+tag+'/argus-diagnostic-update.json'}]};
  return {manifest,release};
}
function fixture(options={}){
  const calls=[];const updater=new EventEmitter();updater.checkForUpdates=async()=>calls.push('check');
  updater.downloadUpdate=async()=>{calls.push('download');updater.emit('download-progress',{percent:42});updater.emit('update-downloaded');};
  updater.quitAndInstall=(silent,relaunch)=>calls.push(['install',silent,relaunch]);
  const runner={active:false,preserveResults:()=>calls.push('preserve')};
  const app={getVersion:()=> '0.58.27-diagnose.3'};
  const updates=new DiagnosticUpdates({app,runner,updater,discoverInfo:async()=>validateManifest(...Object.values(pair())),...options});
  return {updater,runner,updates,calls};
}
test('only explicitly labelled matching diagnostic releases and installers pass validation',()=>{
  const {manifest,release}=pair();assert.equal(validateManifest(manifest,release).version,manifest.version);
  for(const mutate of [m=>m.appId='de.argus.desktop',m=>m.installId='normal',m=>m.channel='stable',m=>m.version='0.58.28',m=>m.file.url='https://evil.test/setup.exe',m=>m.file.sha512='bad']){
    const copy=structuredClone(manifest);mutate(copy);assert.throws(()=>validateManifest(copy,release));
  }
  assert.throws(()=>validateManifest(manifest,{...release,prerelease:false}));
  assert.throws(()=>validateManifest(manifest,{...release,draft:true}));
});
test('startup timeout is bounded, offline never takes the diagnostic runner lock',async()=>{
  let aborted=false;
  const f=fixture({timeoutMs:20,discoverInfo:signal=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))});
  const promise=f.updates.check();assert.equal(f.runner.active,false);
  await promise;assert.equal(f.updates.snapshot().status,'offline');assert.equal(aborted,true);assert.equal(f.updates.busy,false);
});
test('download proceeds while test runs; installation blocked; persistence strictly precedes restart',async()=>{
  const f=fixture();await f.updates.check();assert.equal(f.updates.snapshot().status,'available');
  f.runner.active=true;await f.updates.download();assert.equal(f.updates.snapshot().status,'ready');
  assert.equal(f.updater.autoInstallOnAppQuit,false);assert.equal(f.updater.autoDownload,false);
  assert.throws(()=>f.updates.install(),/abgeschlossenem/);assert(!f.calls.includes('preserve'));
  f.runner.active=false;f.updates.install();assert.deepEqual(f.calls.slice(-2),['preserve',['install',true,true]]);
});
test('failed download/checksum leaves runner available and allows retry',async()=>{
  const f=fixture();await f.updates.check();f.updater.downloadUpdate=async()=>{throw Error('ERR_CHECKSUM_MISMATCH');};
  await f.updates.download();assert.equal(f.updates.snapshot().status,'error');assert.equal(f.runner.active,false);assert.equal(f.updates.busy,false);
  assert.throws(()=>f.updates.install());
});
test('persistence failure prevents installer launch',async()=>{
  const f=fixture();await f.updates.check();await f.updates.download();
  f.runner.preserveResults=()=>{throw Error('disk full');};assert.throws(()=>f.updates.install(),/disk full/);
  assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='install'));assert.equal(f.updates.installing,false);
});
test('discovery ignores newer normal releases and rejects untrusted metadata sources',async()=>{
  const {manifest,release}=pair();const requests=[];
  const fetchImpl=async url=>{requests.push(url);return new Response(JSON.stringify(url.includes('api.github.com')?[{...release,tag_name:'v999.0.0',prerelease:false},release]:manifest));};
  const result=await discover({fetchImpl,currentVersion:'0.58.27-diagnose.3',compare:require('semver').compare});
  assert.equal(result.version,manifest.version);assert.equal(requests.length,2);
  release.assets[1].browser_download_url='https://untrusted.test/update.json';
  await assert.rejects(()=>discover({fetchImpl,currentVersion:'0.58.27-diagnose.3',compare:require('semver').compare}),/Metadatenquelle/);
});
