'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),boot=fs.readFileSync(path.join(root,'boot.js'),'utf8');
function fixture(t,{legacy='jarvis-desktop',existing=false,failCopy=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'argus-naming-')),old=path.join(dir,legacy),current=path.join(dir,'argus-desktop');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(old,{recursive:true});
 const config={notesText:'Legacy notes',autostart:true,voiceEngine:'jarvis',customPages:[{id:'custom',name:'Notes'}]};
 fs.writeFileSync(path.join(old,'jarvis-config.json'),JSON.stringify(config));fs.writeFileSync(path.join(old,'auth.bin'),'synthetic encrypted bytes');
 if(existing){fs.mkdirSync(current);fs.writeFileSync(path.join(current,'argus-config.json'),JSON.stringify({...config,notesText:'Newer Argus notes'}));fs.writeFileSync(path.join(current,'auth.bin'),'newer synthetic bytes');}
 const env={};let selected;
 const app={getPath:()=>dir,setPath:(_key,value)=>selected=value,exit:()=>assert.fail('unexpected exit')};
 const io={...fs,cpSync:(...args)=>{if(failCopy)throw Error('synthetic denied');return fs.cpSync(...args)}};
 vm.runInNewContext(boot,{require:name=>name==='electron'?{app}:name==='fs'?io:name==='path'?path:name==='./main.js'?{}:assert.fail(name),process:{env},console});
 return {dir,old,current,selected,env,config};
}
for(const legacy of ['jarvis-desktop','Jarvis'])test(`legacy ${legacy} migration preserves settings, notes and credentials`,t=>{
 const f=fixture(t,{legacy});assert.equal(f.selected,f.current);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.current,'argus-config.json'))),f.config);
 assert.equal(fs.readFileSync(path.join(f.current,'auth.bin'),'utf8'),'synthetic encrypted bytes');assert(fs.existsSync(path.join(f.old,'jarvis-config.json')));
});
test('existing Argus data takes priority over an older Jarvis profile without migration marker',t=>{
 const f=fixture(t,{existing:true});assert.equal(f.selected,f.current);assert.equal(JSON.parse(fs.readFileSync(path.join(f.current,'argus-config.json'))).notesText,'Newer Argus notes');assert.equal(fs.readFileSync(path.join(f.current,'auth.bin'),'utf8'),'newer synthetic bytes');
});
test('failed migration retains working legacy profile and original files',t=>{
 const f=fixture(t,{failCopy:true});assert.equal(f.selected,f.old);assert.equal(f.env.ARGUS_OLD_DATA,'1');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.old,'jarvis-config.json'))),f.config);
});
test('Argus bridge exposes every former method; installer/update identities remain compatible',()=>{
 const source=fs.readFileSync(path.join(root,'preload.js'),'utf8');let name,api;
 const ipcRenderer={on:()=>{},invoke:()=>{},send:()=>{}};
 vm.runInNewContext(source,{require:module=>{assert.equal(module,'electron');return {contextBridge:{exposeInMainWorld:(key,value)=>{name=key;api=value}},ipcRenderer}}});
 assert.equal(name,'argus');for(const method of ['getConfig','setConfig','onDiscordSocial','discordSocialState','settingsExport','settingsImport'])assert.equal(typeof api[method],'function',method);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),main=fs.readFileSync(path.join(root,'main.js'),'utf8');
 assert.equal(pkg.name,'argus-desktop');assert.equal(pkg.build.appId,'de.jarvis.desktop');assert.equal(pkg.build.productName,'Argus');assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);
 assert(main.includes('app.setAppUserModelId("de.jarvis.desktop")'));assert(main.includes('app.setLoginItemSettings({ openAtLogin: !!config.autostart })'));
 for(const file of fs.readdirSync(path.join(root,'app/js')))assert(!/window\.jarvis\b/.test(fs.readFileSync(path.join(root,'app/js',file),'utf8')),file);
});
