const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onCloseRequest: (cb) => ipcRenderer.on('close-request', cb),
  sendCloseChoice: (choice) => ipcRenderer.send('close-choice', choice),
})
