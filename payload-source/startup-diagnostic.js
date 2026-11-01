'use strict';
const fs = require('fs');
const path = require('path');
let destination;
const currentPlan=require('./diagnostic-plan.cjs').plan(process.env.ARGUS_DIAGNOSTIC_MODE || 'argus');
function enabled(group){return currentPlan.groups.includes(group);}
function group(name,fn){if(!enabled(name)){mark('group:skipped',name);return;}return task('group:'+name,fn);}
let sequence=0;
function task(name,fn){
  const id=++sequence;mark('task:begin',{id,name});
  try{
    const value=fn();mark('task:return',{id,name,promise:!!value&&typeof value.then==='function'});
    if(value&&typeof value.then==='function')value.then(()=>mark('task:resolved',{id,name}),()=>mark('task:rejected',{id,name}));
    return value;
  }catch(error){mark('task:throw',{id,name});throw error;}
}
const run = `${Date.now()}-${process.pid}`;
function mark(event, detail) {
  if (!destination) return;
  try { fs.appendFileSync(destination, JSON.stringify({time:new Date().toISOString(), run, pid:process.pid, uptime:Math.round(process.uptime()*1000), event, detail})+'\n'); } catch {}
}
function init(app, dir) {
  destination = path.join(dir,'startup-markers.jsonl');
  mark('boot');
  mark('plan',{...currentPlan,electron:process.versions.electron,node:process.versions.node});
  // Record deferred call sites without arguments, URLs, command lines or user paths.
  for(const kind of ['setTimeout','setInterval']){
    const original=global[kind];
    global[kind]=function(fn,delay,...args){
      const stack=new Error().stack.split('\n').slice(2);
      const site=stack.find(line=>line.includes(__dirname+path.sep)&&!line.includes('node_modules')&&!line.includes('startup-diagnostic.js'));
      if(!site||typeof fn!=='function')return original(fn,delay,...args);
      const origin=site.trim().split(/[\\/]/).at(-1).replace(/\)$/,'');
      const id=++sequence;let ticks=0;mark('timer:scheduled',{id,kind,delay,origin,callback:fn.name||'anonymous'});
      return original(function(...values){
        ticks++;if(ticks<=2||ticks%600===0)return task('timer:'+id+':'+origin,()=>fn.apply(this,values));
        return fn.apply(this,values);
      },delay,...args);
    };
  }
  const childProcess=require('node:child_process');
  for(const method of ['spawn','execFile']){
    const original=childProcess[method];
    childProcess[method]=function(executable,...args){
      const id=++sequence;mark('background:spawn',{id,method,executable:path.basename(String(executable)).slice(0,80)});
      try{const child=original.call(this,executable,...args);
        child.once('spawn',()=>mark('background:started',{id,pid:child.pid}));
        child.once('error',()=>mark('background:error',{id}));
        child.once('exit',(code,signal)=>mark('background:exit',{id,code,signal}));return child;
      }catch(error){mark('background:throw',{id});throw error;}
    };
  }
  const Module=require('node:module');const originalLoad=Module._load;const seen=new Set();
  Module._load=function(request,parent,isMain){
    const local=parent?.filename?.startsWith(__dirname+path.sep)&&!parent.filename.includes('node_modules')&&request.startsWith('.');
    const name=local?path.basename(request):null;
    if(local&&!seen.has(name)){seen.add(name);return task('module:'+name,()=>originalLoad.apply(this,arguments));}
    return originalLoad.apply(this,arguments);
  };
  const originalNative=Module._extensions['.node'];
  Module._extensions['.node']=function(module,file){return task('native:'+path.basename(file),()=>originalNative(module,file));};
  process.on('exit', code => mark('process:exit', code));
  process.on('uncaughtExceptionMonitor', () => mark('exception'));
  // Bestehende Fehlerbehandlung bleibt verantwortlich; keine Fehlertexte oder URLs sammeln.
  for (const event of ['before-quit','will-quit','window-all-closed']) app.on(event, () => mark(event));
  for (const method of ['quit','exit']) {
    const original = app[method].bind(app);
    app[method] = (...args) => { mark('app:'+method, method === 'exit' ? args[0] : undefined); return original(...args); };
  }
  app.on('child-process-gone', (_e,d) => mark('child:gone',{type:d.type,reason:d.reason,exitCode:d.exitCode}));
  app.on('web-contents-created', (_e,wc) => {
    const id = wc.id;
    mark('contents:created', id);
    for(const event of ['dom-ready','did-finish-load','destroyed','unresponsive','responsive']) wc.on(event,()=>mark('contents:'+event,id));
    wc.on('did-fail-load',(_e,code,_description,_url,isMainFrame)=>mark('contents:load-failed',{id,code,isMainFrame}));
    wc.on('render-process-gone',(_e,d)=>mark('renderer:gone',{id,reason:d.reason,exitCode:d.exitCode}));
  });
  const timer = setInterval(()=>mark('heartbeat'),1000); timer.unref();
}
module.exports = {init, mark,enabled,group,task,currentPlan};
