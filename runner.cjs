'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const {StringDecoder} = require('node:string_decoder');

const MAX_BYTES = 1024 * 1024;
const VERSION = '0.58.27-diagnose.2';
function redact(value) {
  return String(value)
    .replace(/C:[\\/]Users[\\/][^\\/\s"<>]+/gi, '%USERPROFILE%')
    .replace(/(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[URL entfernt]')
    .replace(/\b(?:Bearer\s+\S+|(?:ghp|github_pat|sk-ant|sk)-[A-Za-z0-9_-]{12,})/gi, '[Zugangsdaten entfernt]')
    .replace(/((?:password|passwd|token|api[_-]?key|authorization|cookie)\s*[=:]\s*)(?:"[^"]*"|\S+)/gi, '$1[entfernt]');
}
function safeLog(text) {
  return String(text).split(/\r?\n/).map(line => {
    if (/CONSOLE\(|Incoming Payload|WS Open/i.test(line)) return '[Renderer-Konsoleninhalt aus Datenschutzgruenden entfernt]';
    return redact(line).slice(0, 8192);
  }).join('\n');
}
class Runner extends EventEmitter {
  constructor({dataRoot, executable, durationMs = 60000, spawn = cp.spawn, terminate} = {}) {
    super();
    this.root = dataRoot;
    this.executable = executable;
    this.duration = durationMs;
    this.spawn = spawn;
    this.terminate = terminate || (child => new Promise((resolve, reject) => {
      cp.execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true}, (error) => error ? reject(error) : resolve());
    }));
    this.active = false;
    this.last = null;
    this.child = null;
  }
  snapshot() { return this.last ? {...this.last.summary, active:this.active} : {active:false, status:'idle'}; }
  update() { this.emit('state', this.snapshot()); }
  error(step, error, kind = 'collection') {
    const entry = {time:new Date().toISOString(), step, message:redact(error.message || error), stack:redact(error.stack || String(error))};
    this.last.summary[kind === 'start' ? 'startErrors' : 'collectionErrors'].push(entry);
    try { fs.appendFileSync(path.join(this.last.report, kind === 'start' ? 'Startfehler.jsonl' : 'Sammlungsfehler.jsonl'), JSON.stringify(entry)+'\n'); }
    catch (e) { this.last.summary.loggingError = redact(e.message); }
  }
  append(file, text) {
    try {
      const current = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (current >= MAX_BYTES) return;
      fs.appendFileSync(file, Buffer.from(safeLog(text)).subarray(0, MAX_BYTES-current));
    } catch (e) { this.error('Prozessausgabe sammeln: '+path.basename(file),e); }
  }
  capture(stream, file) {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    stream.on('data', chunk => {
      pending += decoder.write(chunk);
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        this.append(file,pending.slice(0,index+1)); pending=pending.slice(index+1);
      }
      if (pending.length > 16384) { this.append(file,'[Ueberlange Ausgabezeile verworfen]\n'); pending=''; }
    });
    stream.on('end', () => { pending += decoder.end(); if (pending) this.append(file,pending); });
    stream.on('error', e => this.error('Ausgabestream: '+path.basename(file),e));
  }
  start() {
    if (this.active) throw Error('Es laeuft bereits ein Diagnoseversuch.');
    this.active = true;
    const id = new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
    const dir = path.join(this.root,'runs',id);
    const report = path.join(dir,'report');
    const profile = path.join(dir,'profile');
    this.last = {dir,report,profile, summary:{version:VERSION,id,started:new Date().toISOString(),status:'starting',freshProfile:true,
      profileDescription:'Frisches isoliertes Diagnoseprofil ohne Originaldaten. Erfolg bestaetigt NICHT das Originalprofil.',
      observationSeconds:this.duration/1000,collectionErrors:[],startErrors:[],exitCode:null,exitSignal:null,controllerStopped:false}};
    try {
      fs.mkdirSync(report,{recursive:true}); fs.mkdirSync(profile,{recursive:true});
      // Keine Originale lesen. Hintergrundmedien, lokale KI-Installationsmigration und Autostart vermeiden.
      fs.writeFileSync(path.join(profile,'argus-config.json'),JSON.stringify({multiUser:1,setupDone:false,autostart:false,crashReport:false,
        mediaOn:false,ollamaOff:false,ollamaOffChecked:2,strataOn:false,voiceEngine:'windows',ytOpen:'',twOpen:'',systemWatch:false}));
      for (const name of ['stdout.log','stderr.log']) fs.writeFileSync(path.join(report,name),'');
      const env = {};
      for (const key of ['SystemRoot','WINDIR','SystemDrive','ComSpec','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramData','USERNAME','COMPUTERNAME']) {
        if (process.env[key]) env[key] = process.env[key];
      }
      env.ARGUS_DIAGNOSTIC_ROOT = profile;
      const args = ['--enable-logging=file','--log-file='+path.join(profile,'electron.log'),'--v=0'];
      // Genau ein Start, kein Fallback/Retry. Keine Shell und keine globalen Prozessnamen verwenden.
      const child = this.spawn(this.executable,args,{cwd:path.dirname(this.executable),env,windowsHide:false,stdio:['ignore','pipe','pipe']});
      this.child = child;
      this.last.summary.pid = child.pid || null;
      if (child.stdout) this.capture(child.stdout,path.join(report,'stdout.log'));
      if (child.stderr) this.capture(child.stderr,path.join(report,'stderr.log'));
      child.on('error', e => { this.last.summary.startError=redact(e.message); this.error('Diagnoseprozess starten',e,'start'); });
      child.once('exit',(code,signal)=>{ this.last.summary.exitCode=code; this.last.summary.exitSignal=signal; });
      child.once('close',()=>this.finish());
      this.timer = setTimeout(async () => {
        this.last.summary.observationCompleted=true;
        if (child.exitCode !== null || child.signalCode !== null) return;
        this.last.summary.controllerStopped=true;
        try { await this.terminate(child); }
        catch(e) { this.error('Testprozess nach Beobachtungszeit beenden',e); this.last.summary.controllerStopped=false; this.finish(true); }
      },this.duration);
      this.last.summary.status='running';
      this.update();
    } catch (e) {
      this.last.summary.startError=redact(e.message);
      this.error('Diagnoseversuch vorbereiten/starten',e,'start');
      this.finish();
    }
    return this.snapshot();
  }
  collect() {
    // Explizite Exportliste, niemals Profilverzeichnisse/Config/Cookies/Dumps kopieren.
    for (const name of ['startup-markers.jsonl','electron.log']) {
      try {
        const source=path.join(this.last.profile,name);
        if (!fs.existsSync(source)) continue;
        const fd=fs.openSync(source,'r');
        let text;
        try { const info=fs.fstatSync(fd);if(!info.isFile())throw Error('Erwartete Protokolldatei ist keine normale Datei.'); const buf=Buffer.alloc(Math.min(info.size,MAX_BYTES)); const size=fs.readSync(fd,buf,0,buf.length,0); text=buf.subarray(0,size).toString('utf8'); }
        finally { fs.closeSync(fd); }
        fs.writeFileSync(path.join(this.last.report,name),safeLog(text));
      } catch(e) { this.error('Sammeln: '+name,e); }
    }
  }
  finish(keepActive = false) {
    if (!this.active || this.finishing) return;
    this.finishing=true;
    clearTimeout(this.timer);
    try {
      this.collect();
      const summary=this.last.summary;
      let events=[];
      try { events=fs.readFileSync(path.join(this.last.report,'startup-markers.jsonl'),'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)); }
      catch(e) { this.error('Startmarkierungen auswerten',e); }
      summary.windowLoaded=events.some(row=>row.event==='window:ready-to-show');
      summary.ready=events.some(row=>row.event==='ready');
      summary.nativeFailure=events.some(row=>['renderer:gone','child:gone'].includes(row.event) && !['clean-exit','killed'].includes(row.detail?.reason));
      summary.status=keepActive?'stop-failed':summary.startError?'start-failed':summary.observationCompleted&&summary.ready&&summary.windowLoaded&&!summary.nativeFailure?'success':'aborted';
      summary.reportReady=true;
      summary.finished=new Date().toISOString();
      fs.writeFileSync(path.join(this.last.report,'Ergebnis.json'),JSON.stringify(summary,null,2));
      fs.writeFileSync(path.join(this.last.report,'Ergebnis.txt'),[
        'Argus Startdiagnose '+VERSION,'Status: '+summary.status,'Start: '+summary.started,'Ende: '+summary.finished,
        summary.profileDescription,'Exitcode: '+summary.exitCode+'; Signal: '+summary.exitSignal,
        'Nach Beobachtungszeit vom Kontrollprozess beendet: '+summary.controllerStopped,
        'Startfehler: '+summary.startErrors.length+'; Sammlungsfehler: '+summary.collectionErrors.length,
        'Nur ausgewaehlte, begrenzte Diagnoseausgaben. URLs/Renderer-Konsoleninhalte werden entfernt.',
        'Keine Profile, Zugangsdaten, Nachrichten oder Speicherabbilder im Bericht. Keine Uploads.',
        'Der Diagnoseumfang weicht vom Originalprofil ab: Medienintegration deaktiviert, lokale KI/Autostart/Updater nicht eingerichtet.'
      ].join('\r\n'));
    } catch(e) { this.error('Ergebnis abschliessen',e); this.last.summary.status='collection-failed'; }
    finally { this.active=keepActive;this.finishing=false;if(!keepActive)this.child=null;this.last.summary.reportReady=true;this.update(); }
  }
  exportZip(destination) {
    if (!this.last || (this.active && !this.last.summary.reportReady)) throw Error('Bitte zuerst die Diagnose abschliessen.');
    const AdmZip=require('adm-zip');
    const zip=new AdmZip();
    const names=['Ergebnis.txt','stdout.log','stderr.log','electron.log','startup-markers.jsonl','Startfehler.jsonl','Sammlungsfehler.jsonl'];
    let count=0;
    try {
      for(const name of names) {
        const file=path.join(this.last.report,name);
        try { if(fs.existsSync(file)) { zip.addFile(name,Buffer.from(safeLog(fs.readFileSync(file,'utf8')))); count++; } }
        catch(e) { this.error('Berichtdatei lesen: '+name,e); }
      }
      // Auch wenn alle Dateizugriffe fehlschlagen, konkrete In-Memory-Fehler exportieren.
      zip.addFile('Ergebnis.json',Buffer.from(JSON.stringify(this.last.summary,null,2)));
      zip.addFile('DATENSCHUTZ.txt',Buffer.from('Frisches Diagnoseprofil, keine Originalprofile, keine Dumps, kein automatischer Upload. Ausgaben begrenzt und gefiltert.\r\n'));
      const temporary=destination+'.partial-'+crypto.randomBytes(4).toString('hex');
      try { zip.writeZip(temporary);fs.renameSync(temporary,destination); }
      catch(e) { try{fs.unlinkSync(temporary);}catch{} throw e; }
      return destination;
    } catch(e) { this.error('Bericht speichern',e);this.update();throw e; }
  }
  async stop() {
    if (this.child && this.child.exitCode===null && this.child.signalCode===null) {
      this.last.summary.controllerStopped=true;
      await this.terminate(this.child);
    }
  }
}
module.exports={Runner,redact,safeLog};
