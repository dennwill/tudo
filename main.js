const { app, BrowserWindow, ipcMain, Menu, Notification, Tray, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const DATA_FILE = path.join(app.getPath('userData'), 'tudo-data.json');

let mainWindow;
let tray;

function loadTasks() {
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('tudo: failed to read data file:', err);
    return { todo: [], doing: [], onhold: [], done: [] };
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('tudo: data file is corrupted, backing it up and starting fresh:', err);
    try {
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch (backupErr) {
      console.error('tudo: failed to back up corrupted data file:', backupErr);
    }
    return { todo: [], doing: [], onhold: [], done: [] };
  }
}

function saveTasks(data) {
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

// Updates come from the GitHub releases configured in package.json's build.publish
// block; electron-updater downloads the installer and runs it on quit. The
// renderer only ever sees the state object below.
let updateState = { status: 'unknown', current: app.getVersion() };

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setUpdateState(patch) {
  updateState = { status: updateState.status, current: app.getVersion(), ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:state', updateState);
  }
}

autoUpdater.on('update-available', (info) => {
  setUpdateState({ status: 'update-available', latest: info.version });
});
autoUpdater.on('update-not-available', () => {
  setUpdateState({ status: 'latest' });
});
autoUpdater.on('download-progress', (progress) => {
  setUpdateState({
    status: 'downloading',
    latest: updateState.latest,
    percent: Math.round(progress.percent),
  });
});
autoUpdater.on('update-downloaded', (info) => {
  setUpdateState({ status: 'ready', latest: info.version });
});
autoUpdater.on('error', (err) => {
  console.error('tudo: update error:', err ? err.message : err);
  setUpdateState({ status: 'unknown' });
});

async function checkForUpdate() {
  // electron-updater needs the packaged app-update.yml, so `npm start` always
  // reports "unknown" rather than erroring on every launch.
  if (!app.isPackaged) {
    setUpdateState({ status: 'unknown' });
    return updateState;
  }
  setUpdateState({ status: 'checking' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('tudo: update check failed:', err.message);
    setUpdateState({ status: 'unknown' });
  }
  return updateState;
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: 760,
    height: 480,
    x: workAreaSize.width - 780,
    y: 40,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) return;

  tray = new Tray(iconPath);
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        if (!mainWindow) return;
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    },
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: true,
      click: (item) => mainWindow && mainWindow.setAlwaysOnTop(item.checked)
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('tudo');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

app.whenReady().then(() => {
  // Windows will not show a toast unless the process claims an AppUserModelID
  // that matches a Start Menu shortcut. The installer creates one from
  // build.appId in package.json, so this has to be the same string - without it
  // reminders are silently dropped, and always are when running from source.
  if (process.platform === 'win32') app.setAppUserModelId('com.tudo.app');

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/*
 * Reminders.
 *
 * The renderer owns the tasks, but a hidden window is this app's normal state
 * and Chromium throttles a hidden window's timers, so the renderer only hands
 * over the pending reminders and the main process does the waiting and the
 * notifying. Anything whose time passed while the app was shut fires on the
 * next launch instead.
 */

// setTimeout's ceiling; anything further out is picked up on a later launch.
const MAX_TIMEOUT = 2 ** 31 - 1;
let reminderTimers = [];
// Keyed by id *and* time, so moving a reminder arms it again but a re-send of
// the same one does not fire it twice.
const firedReminders = new Set();
const reminderKey = (reminder) => `${reminder.id}@${reminder.at}`;

function showReminder(reminder) {
  firedReminders.add(reminderKey(reminder));

  if (Notification.isSupported()) {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const notification = new Notification({
      title: reminder.title,
      body: reminder.body || 'Reminder',
      ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    });
    notification.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.show();
      mainWindow.focus();
    });
    notification.show();
  }

  // Lets the board record that this one has gone off, so a relaunch is quiet.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder:fired', reminder.id);
  }
}

function scheduleReminders(reminders) {
  for (const timer of reminderTimers) clearTimeout(timer);
  reminderTimers = [];

  const now = Date.now();
  const missed = [];

  for (const reminder of reminders) {
    if (!reminder || typeof reminder.id !== 'string' || firedReminders.has(reminderKey(reminder))) continue;

    const at = Date.parse(reminder.at);
    if (Number.isNaN(at)) continue;

    const delay = at - now;
    if (delay <= 0) missed.push(reminder);
    else if (delay <= MAX_TIMEOUT) reminderTimers.push(setTimeout(() => showReminder(reminder), delay));
  }

  // After the loop, because each of these sends the renderer a message that
  // comes straight back as another reminders:set.
  for (const reminder of missed) showReminder(reminder);
}

ipcMain.on('reminders:set', (_event, reminders) => {
  if (!Array.isArray(reminders)) return;
  scheduleReminders(reminders);
});

ipcMain.handle('tasks:load', () => {
  try {
    return loadTasks();
  } catch (err) {
    console.error('tudo: unexpected error loading tasks:', err);
    return { todo: [], doing: [], onhold: [], done: [] };
  }
});
ipcMain.handle('tasks:save', (_event, data) => {
  try {
    saveTasks(data);
    return { ok: true };
  } catch (err) {
    console.error('tudo: failed to save tasks:', err);
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('update:check', async () => {
  await checkForUpdate();
  return updateState;
});
ipcMain.on('update:download', () => {
  if (updateState.status !== 'update-available') return;
  setUpdateState({ status: 'downloading', latest: updateState.latest, percent: 0 });
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('tudo: update download failed:', err.message);
    setUpdateState({ status: 'unknown' });
  });
});
ipcMain.on('update:install', () => {
  if (updateState.status !== 'ready') return;
  // The tray keeps the app alive when windows close, so tear it down first.
  if (tray) tray.destroy();
  autoUpdater.quitAndInstall();
});
ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:close', () => mainWindow && mainWindow.hide());
ipcMain.on('shell:open-external', (_event, url) => {
  if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) {
    shell.openExternal(url);
  }
});
