'use strict';
const {app,BrowserWindow,ipcMain,dialog,session} = require('electron');
const path = require('node:path');
const {Runner} = require('./runner.cjs');
app.setName('Argus Startdiagnose');
app.setPath('userData',path.join(app.getPath('appData'),'argus-startdiagnose-controller'));
app.setAppUserModelId('de.argus.startdiagnose.controller');
if (!app.requestSingleInstanceLock()) { app.exit(0); }
else {
  let win,runner,closing=false;
  function trusted(event) { return win && event.sender===win.webContents && event.senderFrame===win.webContents.mainFrame; }
  function send() { if(win&&!win.isDestroyed())win.webContents.send('diagnose:state',runner.snapshot()); }
  app.on('second-instance',()=>{if(win){win.show();win.focus();}});
  app.whenReady().then(()=>{
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    runner = new Runner({dataRoot:app.getPath('userData'),executable:path.join(process.resourcesPath,'diagnostic-payload','Argus-Startdiagnose.exe')});
    runner.on('state',send);
    win=new BrowserWindow({width:680,height:650,minWidth:580,minHeight:580,resizable:true,title:'Argus Startdiagnose',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.loadFile('index.html');
    ipcMain.handle('diagnose:state',event=>{if(!trusted(event))throw Error('Nicht erlaubt');return runner.snapshot();});
    ipcMain.handle('diagnose:start',event=>{if(!trusted(event))throw Error('Nicht erlaubt');return runner.start();});
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
