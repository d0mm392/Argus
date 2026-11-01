const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('diagnostic',{
  updateState:()=>ipcRenderer.invoke('diagnose:update-state'),
  updateCheck:()=>ipcRenderer.invoke('diagnose:update-check'),
  updateDownload:()=>ipcRenderer.invoke('diagnose:update-download'),
  updateInstall:()=>ipcRenderer.invoke('diagnose:update-install'),
  onUpdate:callback=>ipcRenderer.on('diagnose:update-state',(_event,state)=>callback(state)),
  state:()=>ipcRenderer.invoke('diagnose:state'),
  start:(mode,dumps)=>ipcRenderer.invoke('diagnose:start',mode,dumps),
  save:()=>ipcRenderer.invoke('diagnose:save'),
  onState:callback=>ipcRenderer.on('diagnose:state',(_event,state)=>callback(state))
});
