'use strict';
const fs = require('fs');
const path = require('path');
let destination;
const run = `${Date.now()}-${process.pid}`;
function mark(event, detail) {
  if (!destination) return;
  try { fs.appendFileSync(destination, JSON.stringify({time:new Date().toISOString(), run, pid:process.pid, uptime:Math.round(process.uptime()*1000), event, detail})+'\n'); } catch {}
}
function init(app, dir) {
  destination = path.join(dir,'startup-markers.jsonl');
  mark('boot');
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
module.exports = {init, mark};
