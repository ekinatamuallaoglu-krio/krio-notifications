const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('krioDesktop', {
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
})
