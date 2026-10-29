"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
test('actual Main IPC guard limits personal Discord state to the trusted top-level local UI',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');const start=source.indexOf('function trustedDiscordFrame('),end=source.indexOf('function startDiscordSocial()',start);assert(start>=0&&end>start);
 const mainFrame={url:'http://127.0.0.1:12345/'},contents={mainFrame},context={URL,win:{webContents:contents},discordUiOrigin:'http://127.0.0.1:12345'};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 assert(context.trustedDiscordFrame(contents,mainFrame));
 assert.equal(context.trustedDiscordFrame({},mainFrame),false);
 assert.equal(context.trustedDiscordFrame(contents,{url:mainFrame.url}),false,'same-origin iframe is not trusted');
 for(const url of ['https://discord.com/','http://127.0.0.1:12346/','http://127.0.0.1:12345/other','file:///app/index.html']){mainFrame.url=url;assert.equal(context.trustedDiscordFrame(contents,mainFrame),false,url)}
});
