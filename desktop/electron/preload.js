const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Setup
  checkPayload: () => ipcRenderer.invoke('check-payload'),
  runAll: (keys) => ipcRenderer.invoke('run-all', keys),
  runStep: (num, keys) => ipcRenderer.invoke('run-step', num, keys),
  abort: () => ipcRenderer.invoke('abort'),
  onLog: (cb) => ipcRenderer.on('log', (_e, msg) => cb(msg)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, d) => cb(d)),
  onStepUpdate: (cb) => ipcRenderer.on('step-update', (_e, d) => cb(d)),
  onAborted: (cb) => ipcRenderer.on('aborted', () => cb()),

  // Dashboard
  dashConnect: () => ipcRenderer.invoke('dash-connect'),
  dashConnectSerial: (serial) => ipcRenderer.invoke('dash-connect-serial', serial),
  dashConnectNetwork: (url) => ipcRenderer.invoke('dash-connect-network', url),
  dashRefresh: () => ipcRenderer.invoke('dash-refresh'),
  dashStartPoll: () => ipcRenderer.invoke('dash-start-poll'),
  dashStopPoll: () => ipcRenderer.invoke('dash-stop-poll'),
  dashGetLogs: (lines) => ipcRenderer.invoke('dash-get-logs', lines),
  onDashUpdate: (cb) => ipcRenderer.on('dash-update', (_e, d) => cb(d)),

  // Live log / Shell
  startLiveLog: () => ipcRenderer.invoke('start-live-log'),
  stopLiveLog: () => ipcRenderer.invoke('stop-live-log'),
  onLiveLog: (cb) => ipcRenderer.on('live-log', (_e, line) => cb(line)),
  startShell: () => ipcRenderer.invoke('start-shell'),
  sendShell: (text) => ipcRenderer.invoke('send-shell', text),
  stopShell: () => ipcRenderer.invoke('stop-shell'),
  onShellOutput: (cb) => ipcRenderer.on('shell-output', (_e, data) => cb(data)),
  onShellClosed: (cb) => ipcRenderer.on('shell-closed', () => cb()),

  // Keys
  keysRead: () => ipcRenderer.invoke('keys-read'),
  keysWrite: (keys) => ipcRenderer.invoke('keys-write', keys),

  // Avatar
  pushAvatar: (frames) => ipcRenderer.invoke('push-avatar', frames),
  getSavedDevices: () => ipcRenderer.invoke('get-saved-devices'),
  saveDeviceAvatar: (serial, avatar) => ipcRenderer.invoke('save-device-avatar', serial, avatar),

  // Tools
  toolRun: (cmd) => ipcRenderer.invoke('tool-run', cmd),
  toolRestartGw: () => ipcRenderer.invoke('tool-restart-gw'),
  toolHealthcheck: () => ipcRenderer.invoke('tool-healthcheck'),
  toolPushScripts: () => ipcRenderer.invoke('tool-push-scripts'),
});
