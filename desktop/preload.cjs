const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  windowAction:action=>ipcRenderer.invoke('app:window-action',action),
  pairPhone:host=>ipcRenderer.invoke('phone:pair',host),
  stopPhone:()=>ipcRenderer.invoke('phone:stop'),
  pickDirectory:()=>ipcRenderer.invoke('work:pick-directory'),
  signInGoogle:()=>ipcRenderer.invoke('account:google-login'),
  openAuthUrl: url => ipcRenderer.invoke('account:open-auth', url),
  openService: (id, external = false) => ipcRenderer.invoke('service:open', id, external),
  clearService: id => ipcRenderer.invoke('service:clear', id),
  zoom: value => ipcRenderer.invoke('app:zoom', value),
}));
