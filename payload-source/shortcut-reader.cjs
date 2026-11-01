'use strict';
const cp=require('node:child_process'),net=require('node:net'),crypto=require('node:crypto');
function readShortcuts(paths,{spawn=cp.spawn,kill,mark=()=>{},timeoutMs=15000,env=process.env,executable=process.execPath}={}){
  if(!Array.isArray(paths)||paths.length>1000){mark('apps:worker.result',{complete:false,reason:'limit',count:0});return Promise.resolve({complete:false,claimed:[],reason:'limit'});}
  return new Promise(resolve=>{
    let child,timer,settled=false,reply=null,closed=false,closeCode=null,closeSignal=null,transportEnded=false;
    const sockets=new Set(),token=crypto.randomBytes(32).toString('hex');
    const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);for(const socket of sockets)socket.destroy();try{server.close();}catch{}mark('apps:worker.result',{complete:result.complete,reason:result.reason||'ok',count:result.claimed.length});resolve(result);};
    const terminate=()=>{if(!child?.pid)return;if(kill){kill(child);return;}if(process.platform==='win32')cp.execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000},()=>{});else child.kill();};
    const check=()=>{
      if(!closed)return;
      if(closeCode!==0||closeSignal)return finish({complete:false,claimed:[],reason:'worker-exit'});
      if(reply)return finish({complete:reply.complete,claimed:reply.complete?reply.claimed:[],reason:reply.complete?'ok':'incomplete'});
      if(transportEnded)return finish({complete:false,claimed:[],reason:'protocol'});
    };
    const server=net.createServer(socket=>{
      sockets.add(socket);socket.setEncoding('utf8');let buffer='',authenticated=false;
      socket.setTimeout(2000,()=>{if(!authenticated)socket.destroy();});
      socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
      socket.on('data',chunk=>{
        buffer+=chunk;
        if(buffer.length>(authenticated?1024*1024:128)){socket.destroy();if(authenticated){terminate();finish({complete:false,claimed:[],reason:'output-limit'});}return;}
        let end;
        while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
          if(!authenticated){if(!/^[a-f0-9]{64}$/.test(line)||!crypto.timingSafeEqual(Buffer.from(line),Buffer.from(token))){socket.destroy();return;}authenticated=true;socket.setTimeout(0);mark('apps:worker.transport:authenticated');socket.write(JSON.stringify({paths})+'\n');continue;}
          try{mark('apps:worker.protocol:before');const value=JSON.parse(line);if(reply||typeof value.complete!=='boolean'||!Array.isArray(value.claimed)||value.claimed.length>paths.length||value.claimed.some(id=>typeof id!=='string'||id.length>512))throw Error('protocol');reply=value;mark('apps:worker.protocol:after',{complete:value.complete,count:value.claimed.length});check();}
          catch{terminate();finish({complete:false,claimed:[],reason:'protocol'});}
        }
      });
      socket.on('end',()=>{if(authenticated){transportEnded=true;check();}});
    });
    server.maxConnections=4;server.on('error',()=>{terminate();finish({complete:false,claimed:[],reason:'transport-error'});});
    timer=setTimeout(()=>{mark('apps:worker.timeout');terminate();finish({complete:false,claimed:[],reason:'timeout'});},timeoutMs);
    const pipe=process.platform==='win32'?'\\\\.\\pipe\\argus-diag-shortcut-'+process.pid+'-'+crypto.randomBytes(16).toString('hex'):null;
    const ready=()=>{
      try{mark('apps:worker.spawn:before',{count:paths.length});
        const transport=pipe?{ARGUS_SHORTCUT_PIPE:pipe}:{ARGUS_SHORTCUT_PORT:String(server.address().port)};
        child=spawn(executable,[],{env:{...env,...transport,ARGUS_SHORTCUT_TOKEN:token,ARGUS_SHORTCUT_WORKER:'1'},windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});
        mark('apps:worker.spawn:after',{pid:child.pid||null});child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
        child.once('error',()=>finish({complete:false,claimed:[],reason:'spawn-error'}));
        child.once('exit',(code,signal)=>mark('apps:worker.exit',{code,signal,hex:Number.isInteger(code)?'0x'+(code>>>0).toString(16).toUpperCase().padStart(8,'0'):null}));
        child.once('close',(code,signal)=>{closed=true;closeCode=code;closeSignal=signal;mark('apps:worker.close',{code,signal});check();});
      }catch{terminate();finish({complete:false,claimed:[],reason:'start-error'});}
    };
    try{if(pipe)server.listen(pipe,ready);else server.listen(0,'127.0.0.1',ready);}catch{finish({complete:false,claimed:[],reason:'transport-error'});}
  });
}
module.exports={readShortcuts};
