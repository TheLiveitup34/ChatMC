const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const { readFile, createReadStream, statSync, existsSync } = require('fs');
const url = require('url');
const path = require('path');
const { exec } = require('child_process');
const chokidar = require('chokidar');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let fileWatcher = null;
let lastByteOffset = 0;
let lastLogPath = null;

// ── Auto Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`Update available: ${info.version}`);
    mainWindow?.webContents.send('updater-status', {
      type: 'available',
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater-status', {
      type: 'progress',
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Update downloaded: ${info.version}`);
    mainWindow?.webContents.send('updater-status', {
      type: 'downloaded',
      version: info.version,
    });

    // Show native dialog asking to restart
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `ChatMC ${info.version} has been downloaded.`,
      detail: 'Restart now to apply the update, or it will install when you close the app.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto updater error:', err.message);
  });

  // Check on startup, then every 30 minutes
  autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err));
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err));
  }, 30 * 60 * 1000);
}

// ── Log Path Resolution ───────────────────────────────────────────────────────

function findLogInDir(dir, depth = 0) {
  if (depth > 5) return null;
  const logPath = path.join(dir, 'logs', 'latest.log');
  if (existsSync(logPath)) return logPath;
  try {
    const subfolders = require('fs').readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);
    for (const subfolder of subfolders) {
      const found = findLogInDir(path.join(dir, subfolder), depth + 1);
      if (found) return found;
    }
  } catch (e) { }
  return null;
}

function getLogPath() {
  let workingDirs;
  try {
    workingDirs = process.platform === 'win32'
      ? require('child_process').execSync(
        `wmic process where "(name='javaw.exe' or name='java.exe') and commandline like '%minecraft%'" get executablepath`
      ).toString().split('\n').slice(1).map(line => line.trim()).filter(line => line)
      : require('child_process').execSync(`ps -p ${minecraftProcess} -o args=`).toString().trim();
  } catch (e) {
    return null;
  }

  if (!workingDirs || workingDirs.length === 0) {
    console.error('Could not find Minecraft process.');
    return null;
  }

  const defaultMinecraftDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA, '.minecraft')
    : process.platform === 'darwin'
      ? path.join(process.env.HOME, 'Library', 'Application Support', 'minecraft')
      : path.join(process.env.HOME, '.minecraft');

  const activeLogsDirs = [];

  const microsoftLauncherDir = workingDirs.find(dir => dir.includes('Microsoft.'));
  if (microsoftLauncherDir) {
    workingDirs.splice(workingDirs.indexOf(microsoftLauncherDir), 1);
    const msLogPath = path.join(defaultMinecraftDir, 'logs', 'latest.log');
    if (existsSync(msLogPath)) {
      const diff = (new Date() - new Date(statSync(msLogPath).mtime)) / 1000;
      if (diff < 60) activeLogsDirs.push(msLogPath);
    }
  }

  for (const workingDir of workingDirs) {
    let currentDir = path.dirname(workingDir);
    while (currentDir !== path.parse(currentDir).root) {
      const folders = require('fs').readdirSync(currentDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name);
      const instanceFolder = folders.find(f =>
        f.toLowerCase().includes('instance') || f.toLowerCase().includes('profile'));
      if (instanceFolder) {
        const instanceFolderPath = path.join(currentDir, instanceFolder);
        const instanceSubfolders = require('fs').readdirSync(instanceFolderPath, { withFileTypes: true })
          .filter(d => d.isDirectory()).map(d => d.name);
        for (const subfolder of instanceSubfolders) {
          const logPath = findLogInDir(path.join(instanceFolderPath, subfolder));
          if (logPath && existsSync(logPath)) {
            const diff = (new Date() - new Date(statSync(logPath).mtime)) / 1000;
            if (diff < 60) activeLogsDirs.push(logPath);
          }
        }
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  }

  console.log(`Active logs directories: ${activeLogsDirs}`);

  let latestLogPath = null;
  let latestMtime = 0;
  for (const logPath of activeLogsDirs) {
    if (existsSync(logPath)) {
      const mtime = new Date(statSync(logPath).mtime).getTime();
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latestLogPath = logPath;
      }
    }
  }

  if (latestLogPath) {
    console.log(`Found latest.log at: ${latestLogPath}`);
    return latestLogPath;
  }

  console.error('Could not find latest.log file.');
  return null;
}

// ── File Watcher ──────────────────────────────────────────────────────────────

function startWatcher(logPath) {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }

  lastLogPath = logPath;
  lastByteOffset = 0;

  console.log(`Starting watcher on: ${logPath}`);

  fileWatcher = chokidar.watch(logPath, {
    persistent: true,
    usePolling: true,
    interval: 500,
    ignoreInitial: true,
  });

  fileWatcher
    .on('change', () => {
      if (!existsSync(logPath)) return;

      const newSize = statSync(logPath).size;
      if (newSize < lastByteOffset) lastByteOffset = 0;
      if (newSize === lastByteOffset) return;

      const stream = createReadStream(logPath, {
        start: lastByteOffset,
        end: newSize - 1,
        encoding: 'utf-8',
      });

      let chunk = '';
      stream.on('data', (data) => chunk += data);
      stream.on('end', () => {
        lastByteOffset = newSize;
        if (chunk.trim()) {
          mainWindow?.webContents.send('chat-update', chunk);
        }
      });
      stream.on('error', (err) => {
        mainWindow?.webContents.send('chat-error', err.message);
      });
    })
    .on('unlink', () => {
      if (fileWatcher) { fileWatcher.close(); fileWatcher = null; }
      lastByteOffset = 0;
      lastLogPath = null;
      setTimeout(() => pollLogPath(), 1000);
    })
    .on('error', (err) => {
      mainWindow?.webContents.send('chat-error', err.message);
    });
}

// ── Minecraft Polling ─────────────────────────────────────────────────────────

function isMinecraftRunning(callback) {
  const cmd = process.platform === 'win32'
    ? `wmic process where "(name='javaw.exe' or name='java.exe') and commandline like '%minecraft%'" get executablepath`
    : 'pgrep -x java';

  exec(cmd, (err, stdout) => {
    callback(!err && stdout.toLowerCase().includes('java'));
  });
}

function pollLogPath() {
  isMinecraftRunning((isRunning) => {
    if (!isRunning) {
      if (lastLogPath !== null) {
        lastLogPath = null;
        lastByteOffset = 0;
        if (fileWatcher) { fileWatcher.close(); fileWatcher = null; }
        mainWindow?.webContents.send('minecraft-state', { running: false });
      }
      return;
    }

    const logPath = getLogPath();
    if (!logPath) return;

    if (logPath !== lastLogPath) {
      console.log(`Log path changed: ${lastLogPath} → ${logPath}`);
      startWatcher(logPath);
      mainWindow?.webContents.send('minecraft-state', { running: true });

      readFile(logPath, 'utf-8', (err, data) => {
        if (!err) {
          lastByteOffset = statSync(logPath).size;
          mainWindow?.webContents.send('chat-flush', data);
        }
      });
    }
  });
}

function startMinecraftWatcher() {
  pollLogPath();
  setInterval(pollLogPath, 3000);
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('minecraft:watch', () => startMinecraftWatcher());

ipcMain.handle('chat:load', async () => {
  return new Promise((resolve) => {
    const logPath = getLogPath();
    if (!logPath) { resolve(null); return; }
    readFile(logPath, 'utf-8', (err, data) => {
      if (err) { resolve(null); return; }
      lastByteOffset = statSync(logPath).size;
      lastLogPath = logPath;
      resolve(data);
    });
  });
});

ipcMain.handle('chat:watch', () => {
  const logPath = getLogPath();
  if (logPath) startWatcher(logPath);
});

ipcMain.handle('chat:path', () => getLogPath());

ipcMain.handle('shell:open', (_event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('updater:check', () => {
  autoUpdater.checkForUpdates().catch(err => console.error('Manual update check failed:', err));
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true,
  }));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools();
  });

  Menu.setApplicationMenu(null);

  mainWindow.on('closed', () => {
    if (fileWatcher) fileWatcher.close();
    mainWindow = null;
  });

  // Start auto updater only in production builds
  if (app.isPackaged) {
    setupAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});