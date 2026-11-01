'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const packed=path.join(base,'build/dist/win-unpacked/resources');
for(const name of ['controller.cjs','runner.cjs','preload.cjs','index.html','ui.js','style.css'])
  assert.equal(hash(path.join(base,'source',name)),hash(path.join(packed,'app',name)),name);
const metadata=JSON.parse(fs.readFileSync(path.join(packed,'app/package.json')));
assert.equal(metadata.version,'0.58.27-diagnose.3');assert.equal(metadata.main,'controller.cjs');
for(const name of ['boot.js','main.js','startup-diagnostic.js','minimal-window.js','minimal-window.html'])
  assert.equal(hash(path.join(base,'source/payload-source',name)),hash(path.join(packed,'diagnostic-payload/resources/app',name)),name);
const AdmZip=require('../build/node_modules/adm-zip');
const zip=new AdmZip();zip.addLocalFolder(path.join(base,'source'));
const sourceName='Argus-Diagnose-Source-0.58.27-diagnose.3.zip';
zip.writeZip(path.join(base,'artifacts',sourceName));
const installerName='Argus-Diagnose-Setup-0.58.27-diagnose.3.exe';
fs.copyFileSync(path.join(base,'build/dist',installerName),path.join(base,'artifacts',installerName));
fs.copyFileSync(path.join(base,'ANLEITUNG.txt'),path.join(base,'artifacts/ANLEITUNG-diagnose.3.txt'));
fs.copyFileSync(path.join(base,'source/INSTRUMENTIERUNG.md'),path.join(base,'artifacts/INSTRUMENTIERUNG-diagnose.3.md'));
const names=[installerName,sourceName,'ANLEITUNG-diagnose.3.txt','INSTRUMENTIERUNG-diagnose.3.md'];
fs.writeFileSync(path.join(base,'artifacts/SHA256-diagnose.3.txt'),names.map(name=>hash(path.join(base,'artifacts',name))+'  '+name).join('\r\n')+'\r\n');
console.log('Lokale Artefakte abgeglichen und bereitgestellt. Keine Veroeffentlichung.');
