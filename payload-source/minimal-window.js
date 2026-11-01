'use strict';
const {app, BrowserWindow, session} = require('electron');
const diagnostic = require('./startup-diagnostic');
let win;
app.whenReady().then(() => {
  diagnostic.mark('ready', {electron:process.versions.electron, chrome:process.versions.chrome});
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']}, (_request, callback) => callback({cancel:true}));
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  win = new BrowserWindow({width:600,height:400,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.once('ready-to-show', () => diagnostic.mark('window:ready-to-show'));
  win.loadFile(require('node:path').join(__dirname,'minimal-window.html'));
});
app.on('window-all-closed', () => app.quit());
