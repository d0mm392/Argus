const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('diagnostic',{
  state:()=>ipcRenderer.invoke('diagnose:state'),
  start:()=>ipcRenderer.invoke('diagnose:start'),
  save:()=>ipcRenderer.invoke('diagnose:save'),
  onState:callback=>ipcRenderer.on('diagnose:state',(_event,state)=>callback(state))
});
