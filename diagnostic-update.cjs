'use strict';
const {EventEmitter}=require('node:events');
const REPO='d0mm392/Argus';
const APP_ID='de.argus.startdiagnose.controller';
const INSTALL_ID='40b90b90-1a84-48be-9616-3880377de926';
const VERSION=/^\d+\.\d+\.\d+-diagnose\.\d+$/;
function tagFor(version){return 'diagnose-v'+version.replace('-diagnose.','-');}
function validateManifest(manifest,release){
  const m=manifest;
  if(!m||m.schema!==1||m.channel!=='argus-diagnostics'||m.appId!==APP_ID||m.installId!==INSTALL_ID||!VERSION.test(m.version)||release.tag_name!==tagFor(m.version)||release.draft||!release.prerelease)
    throw Error('Unpassende Diagnose-Update-Metadaten.');
  const name='Argus-Diagnose-Setup-'+m.version+'.exe';
  const asset=release.assets.find(a=>a.name===name);
  const expected='https://github.com/'+REPO+'/releases/download/'+release.tag_name+'/'+name;
  if(!asset||m.file?.url!==expected||asset.browser_download_url!==expected||m.file.size!==asset.size||!Number.isSafeInteger(m.file.size)||m.file.size<1||!/^[A-Za-z0-9+/]{86}==$/.test(m.file.sha512))
    throw Error('Ungueltige Diagnose-Datei oder Pruefsumme.');
  return {version:m.version,files:[{url:expected,sha512:m.file.sha512,size:m.file.size}],path:name,sha512:m.file.sha512,releaseDate:release.published_at};
}
async function discover({fetchImpl=fetch,signal,currentVersion,compare}={}){
  const headers={'User-Agent':'Argus-Startdiagnose','Accept':'application/vnd.github+json'};
  async function json(url,limit){
    const response=await fetchImpl(url,{signal,headers});
    if(!response.ok)throw Error('Update-Server antwortet mit HTTP '+response.status+'.');
    if(Number(response.headers.get('content-length'))>limit)throw Error('Update-Metadaten sind zu gross.');
    let text='';for await(const bytes of response.body){text+=Buffer.from(bytes).toString('utf8');if(text.length>limit)throw Error('Update-Metadaten sind zu gross.');}
    return JSON.parse(text);
  }
  const releases=await json('https://api.github.com/repos/'+REPO+'/releases?per_page=100',2*1024*1024);
  if(!Array.isArray(releases))throw Error('Ungueltige Release-Liste.');
  const eligible=releases.filter(r=>!r.draft&&r.prerelease&&/^diagnose-v\d+\.\d+\.\d+-\d+$/.test(r.tag_name)&&r.assets?.some(a=>a.name==='argus-diagnostic-update.json'));
  const versionOf=r=>r.tag_name.replace(/^diagnose-v/,'').replace(/-(\d+)$/,'-diagnose.$1');
  eligible.sort((a,b)=>compare(versionOf(b),versionOf(a)));
  const release=eligible.find(r=>compare(versionOf(r),currentVersion)>0);
  if(!release)return null;
  const asset=release.assets.find(a=>a.name==='argus-diagnostic-update.json');
  const expected='https://github.com/'+REPO+'/releases/download/'+release.tag_name+'/argus-diagnostic-update.json';
  if(asset.browser_download_url!==expected)throw Error('Unpassende Diagnose-Metadatenquelle.');
  return validateManifest(await json(expected,16384),release);
}
class DiagnosticUpdates extends EventEmitter {
  constructor({app,runner,updater,discoverInfo,timeoutMs=5000}={}){
    super();this.app=app;this.runner=runner;this.timeoutMs=timeoutMs;this.busy=false;this.installing=false;
    this.state={status:'idle',currentVersion:app.getVersion(),text:'Diagnose-Updates werden geprueft.'};
    const {NsisUpdater}=updater?{}:require('electron-updater');
    this.updater=updater||new NsisUpdater();
    this.updater.autoDownload=false;this.updater.autoInstallOnAppQuit=false;
    this.updater.allowPrerelease=true;this.updater.allowDowngrade=false;
    this.updater.disableDifferentialDownload=true;this.updater.disableWebInstaller=true;
    this.updater.logger={info(){},warn(){},error(){},debug(){}};
    this.discoverInfo=discoverInfo||((signal)=>discover({signal,currentVersion:app.getVersion(),compare:require('semver').compare}));
    // Use electron-updater's existing NSIS downloader/checksum/install flow with a strict diagnostic provider.
    if(!updater){
      const {Provider}=require('electron-updater/out/providers/Provider');const owner=this;
      class DiagnosticProvider extends Provider {
        constructor(_options,_updater,runtime){super({...runtime,isUseMultipleRangeRequest:false});}
        async getLatestVersion(){if(!owner.info)throw Error('Keine gepruefte Diagnoseversion.');return owner.info;}
        resolveFiles(info){if(info!==owner.info)throw Error('Diagnoseversion wurde veraendert.');return info.files.map(file=>({url:new URL(file.url),info:file}));}
      }
      this.updater.setFeedURL({provider:'custom',updateProvider:DiagnosticProvider});
    }
    this.updater.on('download-progress',p=>this.set({status:'downloading',percent:Math.min(100,Math.max(0,p.percent)),text:'Diagnose-Update wird geladen: '+Math.round(p.percent)+' %'}));
    this.updater.on('update-downloaded',()=>this.set({status:'ready',percent:100,text:'Diagnose-Update ist geprueft. Zum Installieren Test beenden und neu starten.'}));
    this.updater.on('error',()=>{this.installing=false;if(this.state.status!=='checking')this.set({status:'error',text:'Diagnose-Update fehlgeschlagen. Internetverbindung und freien Speicher pruefen; erneut versuchen. Die Diagnose bleibt verfuegbar.'});});
  }
  snapshot(){return {...this.state,installAllowed:!this.runner.active&&!this.busy&&!this.installing};}
  set(value){Object.assign(this.state,value);this.emit('state',this.snapshot());}
  async check(){
    if(this.busy||this.installing||['ready','downloading'].includes(this.state.status))return this.snapshot();
    this.busy=true;this.set({status:'checking',text:'Suche nach Diagnose-Updates ...'});
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),this.timeoutMs);
    try{
      this.info=await Promise.race([this.discoverInfo(abort.signal),new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(Error('Timeout')),{once:true}))]);
      this.set(this.info?{status:'available',version:this.info.version,text:'Neue Diagnoseversion '+this.info.version+' verfuegbar.'}:{status:'current',text:'Diagnoseversion ist aktuell.'});
    }catch{this.set({status:'offline',text:'Diagnose-Updates derzeit nicht erreichbar. Die Diagnose funktioniert auch ohne Internet.'});}
    finally{clearTimeout(timer);this.busy=false;this.emit('state',this.snapshot());}
    return this.snapshot();
  }
  async download(){
    if(this.busy||!this.info||!['available','error'].includes(this.state.status))throw Error('Kein Diagnose-Update zum Laden verfuegbar.');
    this.busy=true;this.set({status:'downloading',percent:0,text:'Diagnose-Update wird geladen ...'});
    try{await this.updater.checkForUpdates();await this.updater.downloadUpdate();}
    catch{this.set({status:'error',text:'Download oder Integritaetspruefung fehlgeschlagen. Bitte erneut versuchen. Die Diagnose bleibt verfuegbar.'});}
    finally{this.busy=false;this.emit('state',this.snapshot());}
    return this.snapshot();
  }
  install(){
    if(this.installing||this.busy||this.runner.active||this.state.status!=='ready')throw Error('Installation erst nach abgeschlossenem Diagnosetest und Download moeglich.');
    this.runner.preserveResults(); // Fail closed if result/export persistence fails.
    this.installing=true;this.set({status:'installing',text:'Ergebnisse gesichert. Diagnose-Update wird installiert ...'});
    this.updater.quitAndInstall(true,true);
    return this.snapshot();
  }
}
module.exports={DiagnosticUpdates,discover,validateManifest,APP_ID,INSTALL_ID,tagFor};
