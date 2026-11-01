'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const payload=fs.existsSync(path.join(__dirname,'payload-source'))?path.join(__dirname,'payload-source'):path.join(__dirname,'payload/resources/app');
const {readShortcuts}=require(path.join(payload,'shortcut-reader.cjs'));
function fixture(probe='worker',options={}){
  const events=[],reads=[],workerPaths=[],launches=[],checks=[];let sourceChecks=0,execCalls=0;
  const roots=path.join('C:\\PRIVATE PERSON','Microsoft','Windows','Start Menu','Programs');
  const collision='Collision.Package_8wekyb3d8bbwe!App',valid='Vendor.Package_8wekyb3d8bbwe!App';
  let output=JSON.stringify([{Name:'PRIVATE PROGRAM',AppID:collision},{Name:'PRIVATE OTHER',AppID:valid}]);
  const files={enterDir:()=>!options.incomplete,walkRoot:p=>p,isSvPath:()=>false,
    checkPath:p=>{checks.push(p);if(/\.lnk$/i.test(p))sourceChecks++;return {ok:!options.blocked&&!(options.blockedTarget&&/\.exe$/i.test(p))&&!(options.blockedCwd&&p==='C:\\WORK'),real:p,st:{dev:1,ino:2,size:10,mtimeMs:options.sourceMutated&&/\.lnk$/i.test(p)&&sourceChecks>1?2:1,isDirectory:()=>!!options.targetDirectory&&/\.exe$/i.test(p),isFile:()=>true}};}};
  const disk={existsSync:()=>false,lstatSync:()=>({}),readdirSync:p=>p===roots?[{name:'PRIVATE SHORTCUT.lnk',isDirectory:()=>false,isSymbolicLink:()=>false}]:[]};
  const shell={readShortcutLink:p=>{reads.push(p);if(options.nativeThrow)throw Error('PRIVATE EXCEPTION');return {get appUserModelId(){events.push({event:'test:property-read'});return collision;}};}};
  const diagnostic={enabled:()=>!!options.enableApps,currentPlan:{appsProbe:probe},mark:(event,detail)=>events.push({event,detail}),task:(_name,fn)=>fn()};
  const code=fs.readFileSync(path.join(payload,'actions.js'),'utf8');const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Buffer,console:{log(){},warn(){}},setTimeout:()=>0,clearTimeout,
    process:{platform:'win32',env:{ProgramData:'C:\\PRIVATE PERSON',APPDATA:'C:\\PRIVATE APPDATA',PUBLIC:'C:\\PRIVATE PUBLIC'}},
    require:name=>{
      if(name==='electron')return {shell};if(name==='./startup-diagnostic')return diagnostic;
      if(name==='child_process')return {execFile:(_exe,_args,_options,cb)=>{execCalls++;queueMicrotask(()=>cb(null,output,''));return new EventEmitter();},spawn:(...args)=>{launches.push(args);return {unref(){}};}};
      if(name==='path')return path;if(name==='fs')return disk;if(name==='os')return {homedir:()=> 'C:\\PRIVATE HOME'};
      if(name==='./files')return files;
      if(name==='./shortcut-reader.cjs')return {readShortcuts:async (paths,settings={})=>{workerPaths.push(paths);return settings.operation==='resolve'?{complete:!options.workerFailed,claimed:[],reason:options.workerFailed?'worker-exit':'ok',shortcuts:options.workerFailed?[]:[{target:options.target||'C:\\ALLOWED\\app.exe',args:options.args||'',cwd:options.cwd||''}]}:{complete:!options.workerFailed,claimed:[collision],reason:options.workerFailed?'worker-exit':'ok'};}};
      throw Error('Unexpected dependency '+name);
    }
  },{filename:'actions.js'});
  return {actions:module.exports,events,reads,workerPaths,launches,checks,valid,collision,get execCalls(){return execCalls;},setOutput:value=>{output=value;}};
}
test('callback/parse/walk probes never grant unchecked AppIDs or invoke native shortcut code',async()=>{
  for(const probe of ['callback-only','parse-only','walk-only']){
    const f=fixture(probe);assert.equal((await f.actions._storeApps()).length,0);assert.equal(f.reads.length,0);assert.equal(f.workerPaths.length,0);
    assert.match(await f.actions._launchApp({appId:f.valid,name:'Test'}),/nicht/);assert.equal(f.launches.length,0);
    assert(f.events.some(e=>e.event==='apps:callback:complete'));
    assert.equal(f.events.some(e=>e.event==='apps:json-parse:after'),probe!=='callback-only');
  }
});
test('worker correction keeps collision rejection, checked paths and program-start allowlist',async()=>{
  const f=fixture();const result=await f.actions._storeApps();
  assert.equal(result.length,1);assert.equal(result[0].appId,f.valid);assert.equal(f.reads.length,0);assert.equal(f.workerPaths.length,1);
  assert.equal(f.workerPaths[0].length,1);assert(f.checks.includes(f.workerPaths[0][0]));
  assert.match(await f.actions._launchApp({appId:f.collision,name:'Collision'}),/nicht/);assert.equal(f.launches.length,0);
  assert.equal(await f.actions._launchApp({appId:f.valid}),null);assert.equal(f.launches.length,1);
});
test('worker failure or incomplete/blocked walk refuses all Store-App authorization',async()=>{
  for(const options of [{workerFailed:true},{incomplete:true},{blocked:true}]){
    const f=fixture('worker',options);assert.equal((await f.actions._storeApps()).length,0);
    assert.match(await f.actions._launchApp({appId:f.valid,name:'Test'}),/nicht/);assert.equal(f.launches.length,0);
    if(options.incomplete||options.blocked)assert(f.workerPaths[0].length===0);
  }
});
test('invalid JSON invalidates previously verified IDs; private contents never enter markers',async()=>{
  const f=fixture();await f.actions._storeApps();f.setOutput('{PRIVATE MALFORMED');await f.actions._storeApps();
  assert.match(await f.actions._launchApp({appId:f.valid,name:'Test'}),/nicht/);
  assert(f.events.some(e=>e.event==='apps:json-parse:exception'));
  assert.doesNotMatch(JSON.stringify(f.events),/PRIVATE|Vendor\.Package|Collision\.Package/);
});
test('all shortcut launch reads are isolated and authorization is rechecked',async()=>{
  const valid=fixture();assert.equal(await valid.actions._launchApp({path:'C:\\PRIVATE\\safe.lnk'}),null);
  assert.equal(valid.reads.length,0);assert.equal(valid.workerPaths.length,1);assert.equal(valid.launches.length,1);
  assert.equal(valid.launches[0][0],'C:\\ALLOWED\\app.exe');
  for(const options of [{workerFailed:true},{args:'--execute-file private.cmd'},{target:'C:\\PRIVATE\\bad.cmd'},{blockedTarget:true},{targetDirectory:true},{cwd:'C:\\WORK',blockedCwd:true},{sourceMutated:true}]){
    const f=fixture('worker',options);assert.match(await f.actions._launchApp({path:'C:\\PRIVATE\\safe.lnk'}),/nicht/);
    assert.equal(f.launches.length,0);assert.equal(f.reads.length,0);assert.equal(f.workerPaths.length,1);
  }
});
test('failed background shortcut helper is latched without an automatic restart loop',async()=>{
  const f=fixture('worker',{workerFailed:true,enableApps:true});
  await f.actions._refreshExtra();await f.actions._refreshExtra();
  assert.equal(f.execCalls,1);assert.equal(f.workerPaths.length,1);assert.equal(f.reads.length,0);
});
test('a failed foreground shortcut read invalidates previous Store-App authorization',async()=>{
  const options={};const f=fixture('worker',options);await f.actions._storeApps();options.workerFailed=true;
  assert.match(await f.actions._launchApp({path:'C:\\PRIVATE\\safe.lnk'}),/nicht/);
  assert.match(await f.actions._launchApp({appId:f.valid,name:'Store'}),/nicht/);assert.equal(f.launches.length,0);
  assert(f.events.some(e=>e.event==='apps:authorization-invalidated'));
});
function workerFixture(behavior,timeoutMs=100,options={}){
  const marks=[];let launches=0,kills=0;
  const promise=readShortcuts(['PRIVATE.lnk'],{...options,timeoutMs,mark:(event,detail)=>marks.push({event,detail}),kill:()=>{kills++;},spawn:(_executable,_args,config)=>{
    launches++;const child=new EventEmitter();child.pid=123;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    const net=require('node:net');
    const socket=config.env.ARGUS_SHORTCUT_PIPE?net.connect(config.env.ARGUS_SHORTCUT_PIPE):net.connect(Number(config.env.ARGUS_SHORTCUT_PORT),'127.0.0.1');
    socket.on('error',()=>{});socket.on('connect',()=>socket.write(config.env.ARGUS_SHORTCUT_TOKEN+'\n'));
    socket.once('data',()=>behavior(child,socket));return child;
  }});
  return {promise,marks,get launches(){return launches;},get kills(){return kills;}};
}
test('worker exit 0xFFFF7003 fails closed without retry or parent failure',async()=>{
  const f=workerFixture(child=>{child.emit('exit',0xFFFF7003,null);child.emit('close',0xFFFF7003,null);});
  const result=await f.promise;assert.equal(result.complete,false);assert.equal(result.reason,'worker-exit');assert.deepEqual(result.claimed,[]);assert.equal(f.launches,1);
  assert.equal(f.marks.find(m=>m.event==='apps:worker.exit').detail.hex,'0xFFFF7003');
});
test('worker exit 0 is not completion until close and valid response',async()=>{
  const f=workerFixture((child,socket)=>{child.emit('exit',0,null);socket.end(JSON.stringify({complete:true,claimed:['PRIVATE-ID']})+'\n');child.emit('close',0,null);});
  const result=await f.promise;assert.equal(result.complete,true);assert.deepEqual(result.claimed,['PRIVATE-ID']);assert.doesNotMatch(JSON.stringify(f.marks),/PRIVATE/);
  const bad=workerFixture((child,socket)=>{socket.end('PRIVATE INVALID\n');child.emit('close',0,null);});assert.equal((await bad.promise).reason,'protocol');
});
test('worker is time-limited and is not restarted; excess inputs are refused',async()=>{
  const f=workerFixture(()=>{},10);assert.equal((await f.promise).reason,'timeout');assert.equal(f.launches,1);assert.equal(f.kills,1);
  const result=await readShortcuts(Array(1001).fill('PRIVATE'),{spawn:()=>{throw Error('must not launch');}});assert.equal(result.complete,false);
});
test('local IPC rejects unauthenticated Unicode input without crashing or accepting a forged result',async()=>{
  const net=require('node:net');let rejected=false;
  const result=await readShortcuts([],{timeoutMs:1000,spawn:(_exe,_args,config)=>{
    const child=new EventEmitter();child.pid=123;child.stdout=new PassThrough();child.stderr=new PassThrough();
    const connect=()=>config.env.ARGUS_SHORTCUT_PIPE?net.connect(config.env.ARGUS_SHORTCUT_PIPE):net.connect(Number(config.env.ARGUS_SHORTCUT_PORT),'127.0.0.1');
    const bad=connect();bad.on('error',()=>{});bad.once('connect',()=>bad.end('é'.repeat(64)+'\n'));
    bad.once('close',()=>{rejected=true;const good=connect();good.on('error',()=>{});good.once('connect',()=>good.write(config.env.ARGUS_SHORTCUT_TOKEN+'\n'));
      good.once('data',()=>{good.end(JSON.stringify({complete:true,claimed:[]})+'\n');child.emit('exit',0,null);child.emit('close',0,null);});});return child;
  }});
  assert.equal(rejected,true);assert.equal(result.complete,true);
});
test('launch-resolution protocol validates full fields and rejects incomplete or oversized results',async()=>{
  const invoke=reply=>workerFixture((child,socket)=>{socket.end(JSON.stringify(reply)+'\n');child.emit('exit',0,null);child.emit('close',0,null);},1000,{operation:'resolve'});
  const link={target:'C:\\PRIVATE\\app.exe',args:'',cwd:'C:\\PRIVATE'};
  const valid=invoke({complete:true,claimed:[],shortcuts:[link]});assert.deepEqual((await valid.promise).shortcuts,[link]);assert.doesNotMatch(JSON.stringify(valid.marks),/PRIVATE/);
  const lateCrash=workerFixture((child,socket)=>{socket.end(JSON.stringify({complete:true,claimed:[],shortcuts:[link]})+'\n');setTimeout(()=>{child.emit('exit',0xFFFF7003,null);child.emit('close',0xFFFF7003,null);},20);},1000,{operation:'resolve'});
  const rejected=await lateCrash.promise;assert.equal(rejected.complete,false);assert.equal(rejected.reason,'worker-exit');assert.deepEqual(rejected.claimed,[]);assert.equal(rejected.shortcuts,undefined);
  assert(lateCrash.marks.some(row=>row.event==='apps:worker.protocol:after'));
  for(const reply of [{complete:false,claimed:[],shortcuts:[link]},{complete:true,claimed:[],shortcuts:[{...link,args:42}]},{complete:true,claimed:[],shortcuts:[{...link,target:'x'.repeat(32769)}]}])assert.equal((await invoke(reply).promise).reason,'protocol');
});
