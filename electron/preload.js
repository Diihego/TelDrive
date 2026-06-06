const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onCloseRequest: (cb) => ipcRenderer.on('close-request', cb),
  sendCloseChoice: (choice) => ipcRenderer.send('close-choice', choice),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  showItemInFolder: (p) => ipcRenderer.invoke('show-item-in-folder', p),
})
