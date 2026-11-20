const { app, BrowserWindow, ipcMain, Menu, Notification, Tray, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { CancellationToken } = require('builder-util-runtime');
const path = require('path');
const fs = require('fs');

// Everything the app saves - the tasks, the sync settings, and the page's own
// storage (theme, sound, columns...) - lives under %APPDATA%\tudo. Pinned here so
// it can never follow the working directory or the install folder, which is not
// writable under Program Files. Same folder the default name gave, so nothing moves.
const USER_DATA_DIR = path.join(app.getPath('appData'), 'tudo');
app.setPath('userData', USER_DATA_DIR);

// Only one copy may run. Chromium keeps its storage (where the page's preferences
// live) locked to the process that opened it, so a second copy would read none of
// them and show the defaults, and would add a second tray icon. This has to come
// before anything below touches a file. The copy that does not get the lock hands
// over to the first one (see 'second-instance') and leaves.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.exit(0);

const DATA_FILE = path.join(USER_DATA_DIR, 'tudo-data.json');
// Sync keeps its own file, so the tasks file stays exactly as it always was
// (and still opens in an older version, or on the phone).
const SYNC_FILE = path.join(USER_DATA_DIR, 'tudo-sync.json');
// Whether there was a saved board when the app started, read before anything can
// write one. It tells someone updating from someone opening the app for the first
// time, who has nothing to be told has changed (see changelog.js).
const hadDataAtLaunch = fs.existsSync(DATA_FILE);

let mainWindow;
let tray;
let trayMenu;
// The window starts on top; the page tells us if its settings say otherwise.
let alwaysOnTop = true;

// A file another process has open (antivirus, a backup tool, a copy of the app
// still shutting down) can refuse a read for a moment. Wait a little and try again.
const TRANSIENT_FS_ERRORS = new Set(['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE']);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Returns the file's text, or null if there is no such file. Anything else that
// goes wrong is thrown: "I could not read it" must never look like "it is empty",
// or the defaults would be saved over what is really there.
function readFileStrict(file) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fs.readFileSync(file, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      if (attempt >= 4 || !TRANSIENT_FS_ERRORS.has(err.code)) throw err;
      sleepSync(50 * (attempt + 1));
    }
  }
}

function backUpCorrupt(file) {
  try {
    fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
  } catch (backupErr) {
    console.error('tudo: failed to back up corrupted file:', backupErr);
  }
}

// Writes through a temporary file so a crash cannot leave half a file behind.
function writeFileAtomic(file, text) {
  const tmpFile = `${file}.tmp`;
  fs.writeFileSync(tmpFile, text);
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmpFile, file);
      return;
    } catch (err) {
      if (attempt >= 4 || !TRANSIENT_FS_ERRORS.has(err.code)) throw err;
      sleepSync(50 * (attempt + 1));
    }
  }
}

// Throws if the file is there but cannot be read. A file that is not valid JSON is
// kept aside as a backup and treated as empty.
function loadSyncFile() {
  const raw = readFileStrict(SYNC_FILE);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.error('tudo: sync file is corrupted, backing it up:', err);
    backUpCorrupt(SYNC_FILE);
    return {};
  }
}

// config (key, server, on/off) and state (what has been synced) are saved on
// different schedules, so each write keeps the other half as it found it. If the
// file cannot be read this throws instead of writing the patch on its own, which
// would drop the other half (the key!).
function updateSyncFile(patch) {
  writeFileAtomic(SYNC_FILE, JSON.stringify({ ...loadSyncFile(), ...patch }, null, 2));
}

const emptyTasks = () => ({ todo: [], doing: [], onhold: [], done: [], events: [] });

// Set when the saved board exists but could not be read. Until it is read, saving
// is refused: the page would otherwise write its empty board over the real one.
let tasksUnreadable = false;

function loadTasks() {
  let raw;
  try {
    raw = readFileStrict(DATA_FILE);
  } catch (err) {
    console.error('tudo: failed to read data file, leaving it untouched:', err);
    tasksUnreadable = true;
    return emptyTasks();
  }
  tasksUnreadable = false;
  if (raw === null) return emptyTasks();

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('tudo: data file is corrupted, backing it up and starting fresh:', err);
    backUpCorrupt(DATA_FILE);
    return emptyTasks();
  }
}

function saveTasks(data) {
  if (tasksUnreadable) {
    throw new Error('the saved tasks could not be read, so they were left as they are');
  }
  writeFileAtomic(DATA_FILE, JSON.stringify(data, null, 2));
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
  // A last report can arrive after a cancel: it must not bring the bar back.
  if (updateState.status !== 'downloading') return;
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
    alwaysOnTop,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // A reminder's sound is played by the page, often with nobody having touched
      // it since it opened, which Chromium would otherwise refuse to play.
      autoplayPolicy: 'no-user-gesture-required',
      // Closing the window only hides it, and sync keeps its connection in the
      // page. Chromium would slow a hidden page's timers to a crawl, and with
      // them the reconnecting and the heartbeat.
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// `fromTray` is for a change made in the tray menu, which the page has to hear
// about so that its setting (and what is remembered) follows; one that came from
// the page needs no echo.
function setAlwaysOnTop(on, fromTray = false) {
  alwaysOnTop = on === true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(alwaysOnTop);
    if (fromTray) mainWindow.webContents.send('prefs:always-on-top', alwaysOnTop);
  }
  const item = trayMenu && trayMenu.getMenuItemById('always-on-top');
  if (item) item.checked = alwaysOnTop;
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
      // Syncs and re-checks everything without opening the window.
      label: 'Refresh',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:refresh');
      }
    },
    {
      id: 'always-on-top',
      label: 'Always on top',
      type: 'checkbox',
      checked: alwaysOnTop,
      // The settings menu has the same switch, so it is told when this one moves.
      click: (item) => setAlwaysOnTop(item.checked, true)
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  trayMenu = menu;
  tray.setToolTip('tudo');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// Someone started the app again while it was already running (from the Start menu,
// say, after it came up with Windows). Bring the window we have back, rather than
// opening a second one.
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

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
// Whether the toast makes its own sound. The sounds on offer in the settings menu
// are played by the page, so the toast keeps quiet unless "System default" is
// the one chosen; otherwise the two would play over each other.
let toastSound = true;

function showReminder(reminder) {
  firedReminders.add(reminderKey(reminder));

  if (Notification.isSupported()) {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const notification = new Notification({
      title: reminder.title,
      body: reminder.body || 'Reminder',
      silent: !toastSound,
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

ipcMain.on('prefs:always-on-top', (_event, on) => setAlwaysOnTop(on));

// Starting with the computer. The setting lives in the system, not in the app's
// own files, so it is read back from there. It is only offered for an installed
// app: from source it would register Electron itself as the thing to start.
function loginItemState() {
  const supported = app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
  return { supported, enabled: supported && app.getLoginItemSettings().openAtLogin === true };
}

ipcMain.handle('prefs:login-item', () => loginItemState());
ipcMain.handle('prefs:set-login-item', (_event, on) => {
  if (loginItemState().supported) {
    try {
      app.setLoginItemSettings({ openAtLogin: on === true });
    } catch (err) {
      console.error('tudo: failed to change the start-with-computer setting:', err);
    }
  }
  return loginItemState();
});

ipcMain.on('reminders:toast-sound', (_event, on) => {
  toastSound = on === true;
});

ipcMain.on('reminders:set', (_event, reminders) => {
  if (!Array.isArray(reminders)) return;
  scheduleReminders(reminders);
});

ipcMain.handle('tasks:load', () => {
  try {
    return loadTasks();
  } catch (err) {
    console.error('tudo: unexpected error loading tasks:', err);
    return { todo: [], doing: [], onhold: [], done: [], events: [] };
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
// The release notes, for the window that shows what changed. The file ships with the app.
ipcMain.handle('changelog:load', () => {
  let markdown = '';
  try {
    markdown = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf-8');
  } catch (err) {
    console.error('tudo: failed to read the changelog:', err);
  }
  return { version: app.getVersion(), markdown, hadData: hadDataAtLaunch };
});
ipcMain.handle('sync:load', () => {
  let saved;
  try {
    saved = loadSyncFile();
  } catch (err) {
    console.error('tudo: failed to read sync settings:', err);
    saved = {};
  }
  return {
    config: saved.config && typeof saved.config === 'object' ? saved.config : null,
    state: saved.state && typeof saved.state === 'object' ? saved.state : null,
  };
});
ipcMain.handle('sync:save-config', (_event, config) => {
  if (!config || typeof config !== 'object') return { ok: false };
  try {
    updateSyncFile({
      config: {
        enabled: config.enabled === true,
        url: typeof config.url === 'string' ? config.url : '',
        key: typeof config.key === 'string' ? config.key : '',
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('tudo: failed to save sync settings:', err);
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('sync:save-state', (_event, state) => {
  if (!state || typeof state !== 'object') return { ok: false };
  try {
    updateSyncFile({ state });
    return { ok: true };
  } catch (err) {
    console.error('tudo: failed to save sync state:', err);
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('update:check', async () => {
  await checkForUpdate();
  return updateState;
});
// The download under way, so it can be stopped.
let downloadToken = null;

ipcMain.on('update:download', () => {
  if (updateState.status !== 'update-available') return;
  setUpdateState({ status: 'downloading', latest: updateState.latest, percent: 0 });

  const token = new CancellationToken();
  downloadToken = token;
  autoUpdater
    .downloadUpdate(token)
    .catch((err) => {
      // Stopping it was the person's choice, not a failure; the cancel has already
      // put things back.
      if (token.cancelled) return;
      console.error('tudo: update download failed:', err.message);
      setUpdateState({ status: 'unknown' });
    })
    .finally(() => {
      if (downloadToken === token) downloadToken = null;
    });
});
ipcMain.on('update:cancel', () => {
  if (updateState.status !== 'downloading' || !downloadToken) return;
  downloadToken.cancel();
  downloadToken = null;
  // Back to where it was before the download began: the update is still on offer,
  // for whenever they change their mind again.
  setUpdateState({ status: 'update-available', latest: updateState.latest });
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
