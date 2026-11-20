const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tudo', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (data) => ipcRenderer.invoke('tasks:save', data),
  loadChangelog: () => ipcRenderer.invoke('changelog:load'),
  loadSync: () => ipcRenderer.invoke('sync:load'),
  saveSyncConfig: (config) => ipcRenderer.invoke('sync:save-config', config),
  saveSyncState: (state) => ipcRenderer.invoke('sync:save-state', state),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  setReminders: (reminders) => ipcRenderer.send('reminders:set', reminders),
  setAlwaysOnTop: (on) => ipcRenderer.send('prefs:always-on-top', on),
  onAlwaysOnTopChanged: (callback) =>
    ipcRenderer.on('prefs:always-on-top', (_event, on) => callback(on)),
  getLoginItem: () => ipcRenderer.invoke('prefs:login-item'),
  setLoginItem: (on) => ipcRenderer.invoke('prefs:set-login-item', on),
  setToastSound: (on) => ipcRenderer.send('reminders:toast-sound', on),
  onReminderFired: (callback) =>
    ipcRenderer.on('reminder:fired', (_event, id) => callback(id)),
  // The tray menu's Refresh, for when the window is hidden.
  onRefreshRequested: (callback) => ipcRenderer.on('app:refresh', () => callback()),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  cancelUpdate: () => ipcRenderer.send('update:cancel'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateState: (callback) =>
    ipcRenderer.on('update:state', (_event, state) => callback(state))
});
