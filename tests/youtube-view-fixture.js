"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm"),Module=require("module");
const {app,WebContentsView,ipcMain,session}=require("electron");
const {setup}=require("./renderer-fixture");
async function setupYoutube({live=false}={}){
 const fixture=await setup(),{window,config,root,profile}=fixture;
 Object.assign(config,{ytFilterOn:live,ytVideoOnly:false});
 const source=fs.readFileSync(path.join(root,"main.js"),"utf8");
 const begin=source.indexOf("const ytPrefs ="),end=source.indexOf("// ---------- Twitch",begin);
 if(begin<0||end<begin)throw Error("YouTube source boundaries changed");
 const sourceRequire=Module.createRequire(path.join(root,"package.json"));
 const context={app,WebContentsView,ipcMain,session,path,fs,URL,fetch,setTimeout,setInterval,clearInterval,console,config,
   win:window,expanded:true,quitting:false,__dirname:root,actions:{hooks:{}},
   require:name=>name.startsWith(".")?sourceRequire(name):name==="@ghostery/adblocker-electron"?require(path.resolve(process.env.ARGUS_TEST_NODE_MODULES||".validation/0.58.24/build/node_modules",name)):sourceRequire(name),
   alive:()=>!window.isDestroyed(),setExpanded:()=>{},logError:error=>fixture.errors.push(String(error.code||error.name)),
   sendUI:(channel,value)=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send(channel,value);},
   saveConfig:()=>fs.writeFileSync(path.join(profile,"youtube-synthetic-config.json"),JSON.stringify(config))
 };
 vm.createContext(context);
 vm.runInContext(source.slice(begin,end)+"\nglobalThis.youtubeTest={open:ytEmbedShow,close:ytEmbedClose,style:ytAlphaAll,view:()=>ytView,filter:()=>ytBlocker,state:()=>ytFilterState};",context);
 const settings=source.indexOf("const SETTABLE ="),settingsEnd=source.indexOf("};",settings);
 const handler=source.indexOf('ipcMain.handle("set-config",'),handlerEnd=source.indexOf("// Befehle wie",handler);
 if(settings<0||settingsEnd<0||handler<0||handlerEnd<0)throw Error("Config source boundaries changed");
 Object.assign(context,{tray:null,watch:null,backgroundPresentationController:null,applyShape:()=>{},writeNotesBackup:()=>{}});
 ipcMain.removeHandler("set-config");
 vm.runInContext(source.slice(settings,settingsEnd+2)+"\n"+source.slice(handler,handlerEnd),context);
 const youtubeSession=session.fromPartition("persist:youtube");
 youtubeSession.on("will-download",event=>event.preventDefault());
 if(!live)youtubeSession.protocol.handle("https",()=>new Response(
  '<!doctype html><html><body style="margin:0;background:#c82a25;color:white"><div id="movie_player"><video></video></div><div id="warning" style="position:fixed;z-index:999999">Fixture warning remains visible</div></body></html>',
  {headers:{"content-type":"text/html"}}));
 return {...fixture,youtube:context.youtubeTest,youtubeSession,context};
}
module.exports={setupYoutube};
