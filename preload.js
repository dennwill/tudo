const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tudo', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (data) => ipcRenderer.invoke('tasks:save', data),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
});
