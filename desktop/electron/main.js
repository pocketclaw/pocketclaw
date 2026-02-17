const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SetupEngine } = require('./setup-engine');
const { DashboardEngine } = require('./dashboard-engine');

let mainWindow;
let setup;
let dashboard;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1020,
    height: 740,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#000A00',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000A00', symbolColor: '#00FF41', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  setup = new SetupEngine(mainWindow);
  dashboard = new DashboardEngine(mainWindow);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (setup) setup.abort();
  if (dashboard) dashboard.stop();
  app.quit();
});

// --- Setup IPC ---
ipcMain.handle('check-payload', () => setup.checkPayload());
ipcMain.handle('run-all', async (_e, keys) => {
  try { await setup.runAll(keys); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('run-step', async (_e, num, keys) => {
  try { await setup.runStep(num, keys); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('abort', () => { setup.abort(); return { success: true }; });

// --- Dashboard IPC ---
ipcMain.handle('dash-connect', () => dashboard.connect());
ipcMain.handle('dash-connect-serial', (_e, serial) => dashboard.connectSerial(serial));
ipcMain.handle('dash-connect-network', (_e, url) => dashboard.connectNetwork(url));
ipcMain.handle('dash-refresh', () => dashboard.refresh());
ipcMain.handle('dash-start-poll', () => { dashboard.startPolling(); return true; });
ipcMain.handle('dash-stop-poll', () => { dashboard.stopPolling(); return true; });
ipcMain.handle('dash-get-logs', (_, lines) => dashboard.getLogs(lines));

// --- Live log / Shell IPC ---
ipcMain.handle('start-live-log', () => { dashboard.startLiveLog(); return true; });
ipcMain.handle('stop-live-log', () => { dashboard.stopLiveLog(); return true; });
ipcMain.handle('start-shell', () => dashboard.startShell());
ipcMain.handle('send-shell', (_e, text) => dashboard.sendShellInput(text));
ipcMain.handle('stop-shell', () => { dashboard.stopShell(); return true; });

// --- Keys IPC ---
ipcMain.handle('keys-read', () => dashboard.readKeys());
ipcMain.handle('keys-write', (_, keys) => dashboard.writeKeys(keys));

// --- Avatar IPC ---
ipcMain.handle('push-avatar', (_e, frames) => dashboard.pushAvatar(frames));
ipcMain.handle('get-saved-devices', () => dashboard.getSavedDevices());
ipcMain.handle('save-device-avatar', (_e, serial, avatar) => {
  const dev = dashboard.savedDevices.find(d => d.serial === serial);
  if (dev) { dev.avatar = avatar; dashboard.saveSavedDevices(); }
  return { success: true };
});

// --- Tools IPC ---
ipcMain.handle('tool-run', async (_e, cmd) => {
  try { return { success: true, output: await dashboard.runTool(cmd) }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('tool-restart-gw', () => dashboard.runTool('restart-gw'));
ipcMain.handle('tool-healthcheck', () => dashboard.runTool('healthcheck'));
ipcMain.handle('tool-push-scripts', () => dashboard.pushScripts());
