const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tudo', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (data) => ipcRenderer.invoke('tasks:save', data),
  loadSync: () => ipcRenderer.invoke('sync:load'),
  saveSyncConfig: (config) => ipcRenderer.invoke('sync:save-config', config),
  saveSyncState: (state) => ipcRenderer.invoke('sync:save-state', state),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  setReminders: (reminders) => ipcRenderer.send('reminders:set', reminders),
  onReminderFired: (callback) =>
    ipcRenderer.on('reminder:fired', (_event, id) => callback(id)),
  // The tray menu's Refresh, for when the window is hidden.
  onRefreshRequested: (callback) => ipcRenderer.on('app:refresh', () => callback()),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateState: (callback) =>
    ipcRenderer.on('update:state', (_event, state) => callback(state))
});
