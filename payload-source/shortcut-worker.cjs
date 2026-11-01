'use strict';
const {app,shell,crashReporter}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=process.env.ARGUS_DIAGNOSTIC_ROOT;
if(!root||!path.isAbsolute(root)){app.exit(2);return;}
const marker=path.join(root,'shortcut-worker-markers.jsonl');
function mark(event,detail){try{if(!fs.existsSync(marker)||fs.statSync(marker).size<1024*1024)fs.appendFileSync(marker,JSON.stringify({time:new Date().toISOString(),pid:process.pid,event,detail})+'\n');}catch{}}
app.setName('Argus-Diagnose-Verknuepfungsleser');
app.setPath('userData',fs.mkdtempSync(path.join(root,'shortcut-reader-')));
app.setPath('sessionData',app.getPath('userData'));
app.disableHardwareAcceleration();
if(process.env.ARGUS_DIAGNOSTIC_DUMPS==='consented'){
  const dumps=path.join(root,'local-dumps','shortcut-reader-'+process.pid);fs.mkdirSync(dumps,{recursive:true});
  app.setPath('crashDumps',dumps);crashReporter.start({uploadToServer:false,compress:false});mark('worker:dump-enabled');
}
mark('worker:boot');
const files=require('./files');
let input='',processed=false;
const net=require('node:net');
const token=process.env.ARGUS_SHORTCUT_TOKEN||'';
const pipe=process.env.ARGUS_SHORTCUT_PIPE;
const port=Number(process.env.ARGUS_SHORTCUT_PORT);
if(!/^[a-f0-9]{64}$/.test(token)||(!pipe&&(!Number.isInteger(port)||port<1||port>65535))){mark('worker:transport-invalid');app.exit(2);return;}
const socket=pipe?net.connect(pipe):net.connect(port,'127.0.0.1');socket.setEncoding('utf8');
socket.on('error',()=>{mark('worker:transport-error');app.exit(2);});
socket.on('connect',()=>{mark('worker:transport-connected');socket.write(token+'\n');});
socket.on('data',async bytes=>{
  if(processed)return;
  input+=bytes;if(input.length>8*1024*1024){mark('worker:input-limit');app.exit(2);return;}
  const end=input.indexOf('\n');if(end<0)return;processed=true;input=input.slice(0,end);
  let phase='ready';
  try{
    mark('worker:ready:before');await app.whenReady();mark('worker:ready:after');
    phase='parse';mark('worker:input:before',{bytes:Buffer.byteLength(input)});const request=JSON.parse(input);mark('worker:input:after');
    phase='schema';
    if(!Array.isArray(request.paths)||request.paths.length>1000||request.paths.some(p=>typeof p!=='string'))throw Error('input');
    const claimed=new Set();let complete=true;
    for(let index=0;index<request.paths.length;index++){
      phase='path-check';mark('apps:worker.path:before',{index});
      const checked=files.checkPath(request.paths[index],{read:true});
      const ok=checked.ok&&checked.st.isFile()&&/\.lnk$/i.test(checked.real);
      mark('apps:worker.path:after',{index,ok:!!ok});
      if(!ok){complete=false;continue;}
      mark('apps:worker.native:before',{index});
      try{
        const result=shell.readShortcutLink(checked.real);mark('apps:worker.native:return',{index});
        mark('apps:worker.appid:before',{index});const id=result?.appUserModelId;mark('apps:worker.appid:after',{index,hasAppId:!!id});
        if(id){if(typeof id!=='string'||id.length>512)complete=false;else claimed.add(id.toLowerCase());}
      }catch{mark('apps:worker.native:exception',{index});complete=false;}
    }
    mark('worker:complete',{complete,count:claimed.size});
    socket.end(JSON.stringify({complete,claimed:complete?[...claimed]:[]})+'\n',()=>app.exit(0));
  }catch(error){mark('worker:failed',{phase,errorType:['Error','TypeError','SyntaxError','RangeError'].includes(error?.name)?error.name:'Error'});app.exit(2);}
});
