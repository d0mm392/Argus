'use strict';
// Usage: node prepare-build.cjs <existing-instrumented-payload-root> <existing-toolchain-project> <empty-build-dir>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [input,toolchain,target]=process.argv.slice(2).map(p=>path.resolve(p));
if(!input||!toolchain||!target)throw Error('Payload, Toolchain und Buildordner erforderlich.');
if(fs.existsSync(target))throw Error('Buildordner existiert bereits; Sicherung nicht ueberschreiben.');
fs.mkdirSync(target,{recursive:true});
for(const name of ['package.json','controller.cjs','runner.cjs','preload.cjs','index.html','ui.js','style.css'])fs.copyFileSync(path.join(__dirname,name),path.join(target,name));
fs.copyFileSync(path.join(input,'resources/app/assets/icon.ico'),path.join(target,'icon.ico'));
const payload=path.join(target,'payload');
fs.cpSync(input,payload,{recursive:true,filter:src=>{
  const relative=path.relative(input,src).replace(/\\/g,'/');
  return !relative.startsWith('diagnose-daten')&&!/^resources\/app(?:\/|$)/.test(relative)&&!/^resources\/app-update\./.test(relative);
}});
const payloadSource=path.join(__dirname,'payload-source');
fs.cpSync(payloadSource,path.join(payload,'resources/app'),{recursive:true});
fs.cpSync(path.join(input,'resources/app/node_modules'),path.join(payload,'resources/app/node_modules'),{recursive:true});
fs.mkdirSync(path.join(target,'node_modules'),{recursive:true});
fs.cpSync(path.join(toolchain,'node_modules/adm-zip'),path.join(target,'node_modules/adm-zip'),{recursive:true});
const digest=Object.fromEntries(['boot.js','main.js','startup-diagnostic.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(payload,'resources/app',name))).digest('hex')]));
fs.writeFileSync(path.join(target,'PAYLOAD-SHA256.json'),JSON.stringify(digest,null,2));
console.log('Build vorbereitet: '+target);
