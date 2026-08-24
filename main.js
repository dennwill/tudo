const { app, BrowserWindow, ipcMain, Menu, Tray, screen, shell } = require('electron');
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
    return { todo: [], doing: [], done: [] };
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
    return { todo: [], doing: [], done: [] };
  }
}

function saveTasks(data) {
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
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
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('tasks:load', () => {
  try {
    return loadTasks();
  } catch (err) {
    console.error('tudo: unexpected error loading tasks:', err);
    return { todo: [], doing: [], done: [] };
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
ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:close', () => mainWindow && mainWindow.hide());
ipcMain.on('shell:open-external', (_event, url) => {
  if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) {
    shell.openExternal(url);
  }
});
