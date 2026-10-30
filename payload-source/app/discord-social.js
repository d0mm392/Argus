"use strict";
// Credentials never enter config, renderer IPC, argv, logs or friend snapshots.
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
function create({safeStorage,authPath,helperPath,onChange=()=>{},spawnHelper=spawn,io=fs,platform=process.platform,now=Date.now,authTimeout=180000,revokeTimeout=8000}){
 let child=null,sequence=0,timer=null,buffer="",credentials=null,revokeDone=null;
 let state={status:"disconnected",account:null,friends:[],error:""};
 const secure=()=>platform==="win32"&&safeStorage.isEncryptionAvailable();
 const snapshot=()=>structuredClone({...state,available:platform==="win32"&&io.existsSync(helperPath)});
 const publish=patch=>{state={...state,...patch};onChange(snapshot());};
 const erase=()=>{credentials=null;for(const file of [authPath,authPath+".tmp"]){try{io.unlinkSync(file)}catch(e){if(e.code!=="ENOENT")throw Error("credential-delete-failed")}}};
 const stop=()=>{clearTimeout(timer);timer=null;sequence++;if(child){const old=child;child=null;old.stdin?.end();old.kill();}buffer="";};
 const fail=code=>{stop();publish({status:"error",account:null,friends:[],error:code});};
 const send=(command,...values)=>{if(!child?.stdin?.writable)throw Error("helper-unavailable");child.stdin.write([command,...values.map(value=>Buffer.from(value,"utf8").toString("base64"))].join("\t")+"\n");};
 const clearTimer=()=>{clearTimeout(timer);timer=null;};
 const arm=()=>{clearTimer();timer=setTimeout(()=>fail("authorization-timeout"),authTimeout);timer.unref?.();};
 const decode=value=>{if(typeof value!=="string"||value.length>16000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error("invalid-helper-message");return Buffer.from(value,"base64").toString("utf8");};
 const id=value=>typeof value==="string"&&/^\d{15,22}$/.test(value);
 function receive(message){
  if(state.status==="disconnecting"){
   if(message.type==="phase"&&["revoked","revoke-error"].includes(message.value))revokeDone?.(message.value==="revoked");return;
  }
  if(message.type==="tokens"){
   if(!secure())throw Error("secure-storage-unavailable");
   const next={access:decode(message.access64),refresh:decode(message.refresh64),expiresAt:now()+Math.min(604800,Math.max(0,Number(message.expiresIn)||0))*1000};
   if(!next.access||!next.refresh)throw Error("invalid-helper-message");
   const bytes=safeStorage.encryptString(JSON.stringify(next));io.mkdirSync(path.dirname(authPath),{recursive:true});io.writeFileSync(authPath+".tmp",bytes,{mode:0o600});io.renameSync(authPath+".tmp",authPath);credentials=next;
  }else if(message.type==="snapshot"){
   if(!id(message.account?.id)||!Array.isArray(message.friends))throw Error("invalid-helper-message");
   const seen=new Set(),friends=[];
   for(const person of message.friends.slice(0,1000)){if(!id(person?.id)||seen.has(person.id)||!Number.isInteger(person.status))continue;seen.add(person.id);friends.push({id:person.id,name:decode(person.name64).slice(0,128),status:person.status,discordFriend:true});}
   clearTimer();publish({status:"connected",error:"",account:{id:message.account.id,name:decode(message.account.name64).slice(0,128)},friends});
  }else if(message.type==="phase"){
   if(["authorizing","connecting"].includes(message.value))publish({status:message.value,error:""});
   else if(message.value==="connected"){/* Only a validated account snapshot marks the UI connected. */}
   else if(message.value==="cancelled"){stop();publish({status:"disconnected",account:null,friends:[],error:"cancelled"});}
   else if(message.value==="expired"){erase();fail("expired");}
   else if(message.value==="connection-error")fail("connection-error");
   else if(message.value==="authorization-error")fail("authorization-error");
  }
 }
 function launch(){
  if(!secure())throw Error("secure-storage-unavailable");if(!io.existsSync(helperPath))throw Error("runtime-unavailable");
  stop();const generation=sequence;child=spawnHelper(helperPath,["--window-pid",String(process.pid)],{cwd:path.dirname(helperPath),windowsHide:true,stdio:["pipe","pipe","pipe"],shell:false});
  child.stdout.on("data",bytes=>{if(generation!==sequence)return;buffer+=bytes.toString("utf8");if(buffer.length>1024*1024)return fail("invalid-helper-message");let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{receive(JSON.parse(line))}catch{fail("helper-or-storage-error");break}}});
  // Native stderr is deliberately drained, never logged or exposed to the renderer.
  child.stderr.on("data",()=>{});child.on("error",()=>{if(generation===sequence)fail("runtime-unavailable")});
  child.on("exit",()=>{if(generation!==sequence)return;if(revokeDone)revokeDone(false);else fail("connection-error")});arm();
 }
 function connect(){try{erase();try{io.unlinkSync(authPath+".disconnected")}catch(e){if(e.code!=="ENOENT")throw e}publish({status:"authorizing",account:null,friends:[],error:""});launch();send("authorize");}catch{fail(secure()?"runtime-or-storage-error":"secure-storage-unavailable")}return snapshot();}
 function restore(){
  try{if(io.existsSync(authPath+".disconnected")||!io.existsSync(authPath))return snapshot();if(!secure())return fail("secure-storage-unavailable");const saved=JSON.parse(safeStorage.decryptString(io.readFileSync(authPath)));if(typeof saved.access!=="string"||typeof saved.refresh!=="string"||!saved.refresh)throw Error("invalid-store");credentials=saved;publish({status:"connecting",account:null,friends:[],error:""});launch();if(saved.expiresAt>now()+60000)send("restore",saved.access,saved.refresh);else send("refresh",saved.refresh);
  }catch{fail("stored-login-unavailable")}return snapshot();
 }
 function cancel(){if(credentials)return disconnect();try{send("cancel")}catch{}stop();try{erase()}catch{return fail("credential-delete-failed")}publish({status:"disconnected",account:null,friends:[],error:"cancelled"});return snapshot();}
 async function disconnect(){
  let token=credentials?.refresh||credentials?.access;
  if(!token&&io.existsSync(authPath)){try{const saved=JSON.parse(safeStorage.decryptString(io.readFileSync(authPath)));token=saved.refresh||saved.access}catch{}}
  // Data disappears before any network operation; there is no friend disk cache.
  stop();publish({status:"disconnecting",account:null,friends:[],error:""});
  try{io.mkdirSync(path.dirname(authPath),{recursive:true});io.writeFileSync(authPath+".disconnected","1",{mode:0o600});erase()}catch{publish({status:"error",error:"credential-delete-failed"});return snapshot()}
  let revoked=!token;
  if(token)try{
   launch();publish({status:"disconnecting",account:null,friends:[],error:""});
   revoked=await new Promise(resolve=>{const timeout=setTimeout(()=>revokeDone?.(false),revokeTimeout);revokeDone=result=>{clearTimeout(timeout);revokeDone=null;resolve(result)};send("revoke",token);});
  }catch{revoked=false}
  stop();publish({status:"disconnected",account:null,friends:[],error:revoked?"":"revoke-failed"});return snapshot();
 }
 return {connect,restore,cancel,disconnect,snapshot,close:stop};
}
module.exports={create};
