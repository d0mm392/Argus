'use strict';
const {app,BrowserWindow,ipcMain,dialog,session} = require('electron');
const path = require('node:path');
const {DiagnosticUpdates}=require('./diagnostic-update.cjs');
const {Runner} = require('./runner.cjs');
app.setName('Argus Startdiagnose');
app.setPath('userData',path.join(app.getPath('appData'),'argus-startdiagnose-controller'));
app.setAppUserModelId('de.argus.startdiagnose.controller');
if (!app.requestSingleInstanceLock()) { app.exit(0); }
else {
  let win,runner,updates,closing=false;
  function trusted(event) { return win && event.sender===win.webContents && event.senderFrame===win.webContents.mainFrame; }
  function send() { if(win&&!win.isDestroyed())win.webContents.send('diagnose:state',runner.snapshot()); }
  app.on('second-instance',()=>{if(win){win.show();win.focus();}});
  app.whenReady().then(()=>{
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    runner = new Runner({dataRoot:app.getPath('userData'),executable:path.join(process.resourcesPath,'diagnostic-payload','Argus-Startdiagnose.exe')});
    runner.on('state',()=>{send();if(updates&&win&&!win.isDestroyed())win.webContents.send('diagnose:update-state',updates.snapshot());});
    win=new BrowserWindow({width:760,height:850,minWidth:580,minHeight:580,resizable:true,title:'Argus Startdiagnose',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.loadFile('index.html');
    updates=new DiagnosticUpdates({app,runner});
    updates.on('state',state=>{if(win&&!win.isDestroyed())win.webContents.send('diagnose:update-state',state);});
    win.webContents.once('did-finish-load',()=>{void updates.check();});
    ipcMain.handle('diagnose:update-state',event=>{if(!trusted(event))throw Error('Nicht erlaubt');return updates.snapshot();});
    ipcMain.handle('diagnose:update-check',event=>{if(!trusted(event))throw Error('Nicht erlaubt');void updates.check();return updates.snapshot();});
    ipcMain.handle('diagnose:update-download',event=>{if(!trusted(event))throw Error('Nicht erlaubt');void updates.download().catch(()=>{});return updates.snapshot();});
    ipcMain.handle('diagnose:update-install',event=>{if(!trusted(event))throw Error('Nicht erlaubt');return updates.install();});
    ipcMain.handle('diagnose:state',event=>{if(!trusted(event))throw Error('Nicht erlaubt');return runner.snapshot();});
    ipcMain.handle('diagnose:start',async (event,mode,dumps)=>{
      if(!trusted(event))throw Error('Nicht erlaubt');
      if(updates.installing)throw Error('Diagnose-Update wird installiert.');
      if(runner.active)throw Error('Es laeuft bereits eine Diagnose.');
      let consent=false;
      if(dumps===true){
        const choice=await dialog.showMessageBox(win,{type:'warning',buttons:['Ohne Dumps zurueck','Ich willige fuer diesen Lauf ein'],defaultId:0,cancelId:0,
          message:'Lokale Speicherabbilder fuer diesen einen Lauf erfassen?',detail:'Nur verwenden, wenn die Vergleichslaeufe nicht ausreichend eingrenzen. Dumps koennen sensible Speicherinhalte wie Zugangsdaten und Nachrichten enthalten. Sie bleiben im isolierten lokalen Laufprofil, werden niemals in den ZIP-Bericht aufgenommen und nicht hochgeladen. Crashpad erfasst nicht jede abrupte Beendigung. Ein fehlender Dump schliesst einen nativen Fehler nicht aus.'});
        if(choice.response!==1)return runner.snapshot();
        consent=true;
      }
      return runner.start(mode,consent);
    });
    ipcMain.handle('diagnose:save',async event=>{
      if(!trusted(event))throw Error('Nicht erlaubt');
      if(!runner.last||(runner.active&&!runner.last.summary.reportReady))throw Error('Bitte zuerst eine Diagnose abschließen.');
      const response=await dialog.showSaveDialog(win,{title:'Diagnosebericht speichern',defaultPath:path.join(app.getPath('desktop'),'Argus-Diagnose-Bericht-'+runner.last.summary.id+'.zip'),filters:[{name:'ZIP-Bericht',extensions:['zip']}],properties:['showOverwriteConfirmation','createDirectory']});
      if(response.canceled)return {canceled:true};
      return {file:runner.exportZip(response.filePath)};
    });
    win.on('close',async event=>{
      if(closing||!runner.active)return;
      event.preventDefault();
      const choice=await dialog.showMessageBox(win,{type:'question',buttons:['Weiter warten','Diagnose beenden'],defaultId:0,cancelId:0,message:'Die Diagnose läuft noch. Soll der Testprozess beendet werden?'});
      if(choice.response===1){try{await runner.stop();closing=true;win.close();}catch(e){dialog.showErrorBox('Testprozess konnte nicht beendet werden',e.message);}}
    });
    // Nur lokaler Status; kein Crashreporter und keine automatischen Uploads.
  }).catch(error=>{dialog.showErrorBox('Diagnoseoberfläche konnte nicht starten',String(error.stack||error));app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
}
