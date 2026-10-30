'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function tree(root){
  if(!fs.existsSync(root))return {exists:false,files:0,digest:hash('missing')};
  const lines=[];
  function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile())lines.push(path.relative(root,file).replace(/\\/g,'/')+' '+hash(fs.readFileSync(file)));}}
  visit(root);return {exists:true,files:lines.length,digest:hash(lines.join('\n'))};
}
const registry=key=>{try{return cp.execFileSync('reg.exe',['query',key,'/s'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).replace(/\r\n/g,'\n');}catch{return '(absent)';}};
const original=path.join(process.env.LOCALAPPDATA,'Programs','Argus');
const profile=path.join(process.env.APPDATA,'argus-desktop');
const result={installation:tree(original),profile:tree(profile),autostartDigest:hash(registry('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')),
  originalUninstallDigest:hash(registry('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\945e4693-f1e6-5452-ad8c-039e56b4ccec'))};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result));
