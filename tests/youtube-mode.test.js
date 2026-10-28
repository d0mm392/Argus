"use strict";
const assert=require("node:assert/strict"),fs=require("fs"),path=require("path");
const cp=require("node:child_process");
const {app,BrowserWindow}=require("electron"),{setupYoutube}=require("./youtube-view-fixture");
async function run(){
 const fixture=await setupYoutube(),{window,config,evaluate,evaluateWithValue,wait,errors,screenshot,youtube,profile}=fixture;
 const before=JSON.stringify({pages:config.pages,panelLayout:config.panelLayout});
 await youtube.open("https://www.youtube.com/watch?v=fixture");
 await wait(350);
 assert.equal(BrowserWindow.getAllWindows().length,1,"no external replacement window");
 const view=youtube.view();assert(view);
 await evaluateWithValue(async()=>{
   await openSettingsPanel();const search=document.getElementById("setFind");search.value="Fenster: YouTube";search.dispatchEvent(new Event("input"));return true;
 },null);
 await wait(300);
 const set=async(id,value)=>{await evaluateWithValue(({id,value})=>{
   const input=document.getElementById(id);if(input.type==="checkbox"){input.checked=value;input.dispatchEvent(new Event("change"));}else{input.value=value;input.dispatchEvent(new Event("input"));}return true;
 },{id,value});await wait(80);};
 await set("setYtRound",0);await set("setYtAlpha",100);
 const bounds=view.getBounds();assert(bounds.width>100&&bounds.height>50,"actual view appears inside live preview");
 await screenshot("youtube-square");
 const oldRadius=config.ytRound;
 await set("setYtRound",36);await set("setYtAlpha",0);await set("setYtFrame",false);await set("setYtShadow",true);
 assert.equal(config.ytRound,36);assert.equal(config.ytBackgroundAlpha,0);assert.equal(config.ytFrame,false);assert.equal(config.ytShadow,true);
 assert.equal(await view.webContents.executeJavaScript("getComputedStyle(document.documentElement).opacity"),"1");
 assert.equal(await view.webContents.executeJavaScript("getComputedStyle(document.querySelector('video')).opacity"),"1");
 assert.equal(await view.webContents.executeJavaScript("!!document.getElementById('warning') && getComputedStyle(document.getElementById('warning')).display!=='none'"),true);
 assert.equal(await evaluate("getComputedStyle(document.getElementById('ytAppearancePreview')).opacity"),"1");
 assert.match(await evaluate("getComputedStyle(document.getElementById('ytAppearancePreview')).backgroundColor"),/0\)/);
 await screenshot("youtube-rounded-transparent");
 fs.writeFileSync(path.join(process.env.ARGUS_TEST_ARTIFACTS||profile,"youtube-view-fixture.png"),(await view.webContents.capturePage()).toPNG());
 if(process.platform==="win32")await new Promise((resolve,reject)=>cp.execFile("powershell.exe",["-NoProfile","-File",path.join(__dirname,"capture-test-window.ps1"),"-WindowHandle",String(window.getNativeWindowHandle().readBigUInt64LE()),"-Out",path.join(process.env.ARGUS_TEST_ARTIFACTS||profile,"youtube-native-window.png")],{windowsHide:true,timeout:10000},error=>error?reject(error):resolve()));
 const saved=JSON.parse(fs.readFileSync(path.join(profile,"youtube-synthetic-config.json")));
 assert.equal(saved.ytRound,36);assert.equal(saved.ytBackgroundAlpha,0);
 const loaded=new Promise(resolve=>window.webContents.once("did-finish-load",resolve));window.reload();await loaded;window.webContents.send("expanded",true);await wait(300);
 assert.equal(await evaluate("document.getElementById('setYtRound').value"),"36");assert.equal(await evaluate("document.getElementById('setYtAlpha').value"),"0");
 assert.equal(JSON.stringify({pages:config.pages,panelLayout:config.panelLayout}),before,"appearance controls do not rewrite saved window geometry");
 assert.equal(oldRadius,0);assert.deepEqual(errors,[]);
 youtube.close();console.log("PASS integrated YouTube: one owner window, real WebContentsView preview, square/rounded, background-only alpha, frame/shadow, visible warning, saved settings/reload, geometry preserved");app.exit(0);
}
run().catch(error=>{console.error(error.stack);app.exit(1);});setTimeout(()=>app.exit(2),20000).unref();
