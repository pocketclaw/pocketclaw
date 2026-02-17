const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

class DashboardEngine {
  constructor(window) {
    this.window = window;
    this.pollTimer = null;
    this.connected = false;
    this.deviceSerial = null;
    this.connectionMode = 'usb';
    this.networkUrl = null;
    this.savedDevices = [];
    this.logProc = null;          // live log streaming process
    this.shellProc = null;        // interactive shell process
    this.reconnectAttempts = 0;
    this.maxReconnect = 5;
    this.loadSavedDevices();
  }

  // --- Saved devices persistence ---
  get savedDevicesPath() {
    const dir = path.join(os.homedir(), '.pocketclaw');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'devices.json');
  }

  loadSavedDevices() {
    try {
      if (fs.existsSync(this.savedDevicesPath)) {
        this.savedDevices = JSON.parse(fs.readFileSync(this.savedDevicesPath, 'utf-8'));
      }
    } catch { this.savedDevices = []; }
  }

  saveSavedDevices() {
    try {
      fs.writeFileSync(this.savedDevicesPath, JSON.stringify(this.savedDevices, null, 2));
    } catch {}
  }

  saveDevice(serial, data) {
    const idx = this.savedDevices.findIndex(d => d.serial === serial);
    const entry = { serial, ...data, lastSeen: Date.now() };
    if (idx >= 0) Object.assign(this.savedDevices[idx], entry);
    else this.savedDevices.push(entry);
    this.saveSavedDevices();
  }

  getSavedDevices() { return this.savedDevices; }

  getAdbPath() {
    const platform = os.platform();
    let base;
    if (!process.defaultApp) {
      base = path.join(process.resourcesPath, 'payload');
    } else {
      base = path.join(__dirname, '..', 'payload');
    }
    const dir = { win32: 'win32', darwin: 'darwin', linux: 'linux' }[platform] || 'linux';
    const bin = platform === 'win32' ? 'adb.exe' : 'adb';
    const p = path.join(base, 'adb', dir, bin);
    if (fs.existsSync(p)) {
      if (platform !== 'win32') try { fs.chmodSync(p, 0o755); } catch {}
      return p;
    }
    return 'adb';
  }

  adb(args, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.getAdbPath(), args, { windowsHide: true });
      let out = '', err = '';
      proc.stdout.on('data', d => out += d);
      proc.stderr.on('data', d => err += d);
      const t = setTimeout(() => { proc.kill(); reject(new Error('ADB timeout')); }, timeout);
      proc.on('close', () => { clearTimeout(t); resolve(out.trim()); });
      proc.on('error', e => { clearTimeout(t); reject(e); });
    });
  }

  shell(cmd, timeout) { return this.adb(['shell', cmd], timeout); }

  emit(event, data) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(event, data);
    }
  }

  // ============================================
  //  USB CONNECTION
  // ============================================
  async connect() {
    this.connectionMode = 'usb';
    try {
      await this.adb(['start-server'], 10000);
      const out = await this.adb(['devices']);
      const lines = out.split('\n').filter(l => l.includes('\tdevice'));
      if (lines.length === 0) {
        this.connected = false;
        return { connected: false, error: 'No device found' };
      }
      this.deviceSerial = lines[0].split('\t')[0];
      this.connected = true;
      this.reconnectAttempts = 0;
      await this.adb(['forward', 'tcp:9000', 'tcp:9000']).catch(() => {});

      const info = await this.getDeviceInfo();
      this.saveDevice(this.deviceSerial, { ...info, mode: 'usb' });
      return { connected: true, serial: this.deviceSerial, mode: 'usb', ...info };
    } catch (e) {
      this.connected = false;
      return { connected: false, error: e.message };
    }
  }

  // Connect to a specific serial (for multi-device switching)
  async connectSerial(serial) {
    this.connectionMode = 'usb';
    try {
      await this.adb(['start-server'], 10000);
      const out = await this.adb(['devices']);
      const lines = out.split('\n').filter(l => l.includes('\tdevice'));
      const match = lines.find(l => l.startsWith(serial));
      if (!match) {
        return { connected: false, error: 'Device ' + serial + ' not found' };
      }
      this.deviceSerial = serial;
      this.connected = true;
      this.reconnectAttempts = 0;
      await this.adb(['-s', serial, 'forward', 'tcp:9000', 'tcp:9000']).catch(() => {});

      const info = await this.getDeviceInfo();
      this.saveDevice(serial, { ...info, mode: 'usb' });
      return { connected: true, serial, mode: 'usb', ...info };
    } catch (e) {
      this.connected = false;
      return { connected: false, error: e.message };
    }
  }

  // ============================================
  //  NETWORK CONNECTION
  // ============================================
  async connectNetwork(url) {
    this.connectionMode = 'network';
    this.networkUrl = url.replace(/\/+$/, '');
    try {
      const body = await httpGet(this.networkUrl + '/api/status', 8000);
      const status = JSON.parse(body);
      this.connected = true;
      this.reconnectAttempts = 0;
      this.deviceSerial = status.serial || url;

      const info = {
        model: status.model || '?',
        product: status.product || status.model || '?',
        sdk: status.sdk || '?',
        ramTotal: status.ramTotal || 0,
        ramAvail: status.ramAvail || 0,
        ramUsed: status.ramUsed || 0,
        diskTotal: status.diskTotal || 0,
        diskUsed: status.diskUsed || 0,
        battery: status.battery || null,
        batteryCharging: status.batteryCharging || false,
        topProcesses: status.topProcesses || [],
        gatewayPid: status.pid || status.gatewayPid || null,
        gatewayOk: true,
        uptime: status.uptime || '?',
      };

      this.saveDevice(this.deviceSerial, { ...info, mode: 'network', url: this.networkUrl });
      return { connected: true, serial: this.deviceSerial, mode: 'network', ...info };
    } catch (e) {
      this.connected = false;
      return { connected: false, error: 'Cannot reach gateway: ' + e.message };
    }
  }

  // ============================================
  //  DEVICE INFO (USB mode, full data)
  // ============================================
  async getDeviceInfo() {
    const [model, product, sdk, meminfo, gwPid, uptime, dfOut, batteryOut] = await Promise.all([
      this.shell('getprop ro.product.device').catch(() => '?'),
      this.shell('getprop ro.product.model').catch(() => '?'),
      this.shell('getprop ro.build.version.sdk').catch(() => '?'),
      this.shell('cat /proc/meminfo').catch(() => ''),
      this.shell('pgrep -f openclaw').catch(() => ''),
      this.shell('cat /proc/uptime').catch(() => ''),
      this.shell('df /data 2>/dev/null || df').catch(() => ''),
      this.shell('dumpsys battery 2>/dev/null').catch(() => ''),
    ]);

    // --- RAM (with Android 6 fallback) ---
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    const freeMatch = meminfo.match(/MemFree:\s+(\d+)/);
    const buffersMatch = meminfo.match(/Buffers:\s+(\d+)/);
    const cachedMatch = meminfo.match(/Cached:\s+(\d+)/);

    const ramTotal = totalMatch ? Math.round(parseInt(totalMatch[1]) / 1024) : 0;
    let ramAvail;
    if (availMatch) {
      ramAvail = Math.round(parseInt(availMatch[1]) / 1024);
    } else {
      const free = freeMatch ? parseInt(freeMatch[1]) : 0;
      const buffers = buffersMatch ? parseInt(buffersMatch[1]) : 0;
      const cached = cachedMatch ? parseInt(cachedMatch[1]) : 0;
      ramAvail = Math.round((free + buffers + cached) / 1024);
    }
    const ramUsed = ramTotal - ramAvail;

    // --- Disk ---
    let diskTotal = 0, diskUsed = 0;
    try {
      // df output: Filesystem 1K-blocks Used Available Use% Mounted
      const dfLines = dfOut.split('\n').filter(l => l.includes('/data') || l.includes('/storage'));
      if (dfLines.length > 0) {
        const parts = dfLines[0].trim().split(/\s+/);
        if (parts.length >= 4) {
          diskTotal = Math.round(parseInt(parts[1]) / 1024); // MB
          diskUsed = Math.round(parseInt(parts[2]) / 1024);
        }
      }
    } catch {}

    // --- Battery ---
    let battery = null, batteryCharging = false;
    try {
      const levelMatch = batteryOut.match(/level:\s*(\d+)/);
      const statusMatch = batteryOut.match(/status:\s*(\d+)/);
      if (levelMatch) battery = parseInt(levelMatch[1]);
      // status: 2=charging, 5=full
      if (statusMatch) batteryCharging = statusMatch[1] === '2' || statusMatch[1] === '5';
    } catch {}

    // --- Uptime ---
    const uptimeSec = uptime ? Math.round(parseFloat(uptime.split(' ')[0])) : 0;
    const uptimeStr = uptimeSec > 0
      ? `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`
      : '?';

    // --- Gateway ---
    let gatewayOk = false;
    try {
      const body = await httpGet('http://127.0.0.1:9000/api/status');
      gatewayOk = !!body;
    } catch {}

    // --- Top RAM consumers ---
    let topProcesses = [];
    try {
      const psOut = await this.shell(
        "ps -eo rss,args 2>/dev/null | sort -rn | head -8 | awk '{print $1, $2}'"
      );
      if (psOut) {
        for (const line of psOut.split('\n')) {
          const m = line.trim().match(/^(\d+)\s+(.+)$/);
          if (m) {
            const rss = Math.round(parseInt(m[1]) / 1024);
            const proc = m[2].split('/').pop().split(' ')[0];
            if (rss > 0 && proc !== 'ps') topProcesses.push({ name: proc, mb: rss });
          }
        }
      }
    } catch {}

    return {
      model, product, sdk,
      ramTotal, ramAvail, ramUsed,
      diskTotal, diskUsed,
      battery, batteryCharging,
      topProcesses,
      gatewayPid: gwPid || null,
      gatewayOk,
      uptime: uptimeStr,
    };
  }

  // ============================================
  //  REFRESH (auto-reconnect on failure)
  // ============================================
  async refresh() {
    if (!this.connected) {
      // Auto-reconnect logic
      if (this.reconnectAttempts >= this.maxReconnect) {
        this.emit('dash-update', { connected: false, reconnecting: false });
        return { connected: false, error: 'Max reconnect attempts reached' };
      }
      this.reconnectAttempts++;
      this.emit('dash-update', { connected: false, reconnecting: true, attempt: this.reconnectAttempts });

      if (this.connectionMode === 'network' && this.networkUrl) {
        const r = await this.connectNetwork(this.networkUrl);
        if (r.connected) { this.emit('dash-update', { connected: true, reconnected: true, ...r }); }
        return r;
      }
      const conn = await this.connect();
      if (conn.connected) { this.emit('dash-update', { connected: true, reconnected: true, ...conn }); }
      return conn;
    }

    try {
      let info;
      if (this.connectionMode === 'network') {
        const body = await httpGet(this.networkUrl + '/api/status', 8000);
        const status = JSON.parse(body);
        info = {
          model: status.model || '?',
          product: status.product || status.model || '?',
          sdk: status.sdk || '?',
          ramTotal: status.ramTotal || 0,
          ramAvail: status.ramAvail || 0,
          ramUsed: status.ramUsed || 0,
          diskTotal: status.diskTotal || 0,
          diskUsed: status.diskUsed || 0,
          battery: status.battery || null,
          batteryCharging: status.batteryCharging || false,
          topProcesses: status.topProcesses || [],
          gatewayPid: status.pid || null,
          gatewayOk: true,
          uptime: status.uptime || '?',
        };
      } else {
        info = await this.getDeviceInfo();
      }
      this.reconnectAttempts = 0;
      this.emit('dash-update', { connected: true, serial: this.deviceSerial, mode: this.connectionMode, ...info });
      return { connected: true, ...info };
    } catch (e) {
      this.connected = false;
      this.emit('dash-update', { connected: false, reconnecting: true });
      return { connected: false, error: e.message };
    }
  }

  // ============================================
  //  POLLING
  // ============================================
  startPolling(intervalMs = 10000) {
    this.stopPolling();
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  stop() {
    this.stopPolling();
    this.stopLiveLog();
    this.stopShell();
  }

  // ============================================
  //  LOGS
  // ============================================
  async getLogs(lines = 50) {
    if (!this.connected) return '';
    try {
      if (this.connectionMode === 'network') {
        const body = await httpGet(this.networkUrl + '/api/logs?lines=' + lines, 8000);
        return body;
      }
      return await this.shell(
        `tail -${lines} /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>/dev/null`,
        10000
      );
    } catch { return ''; }
  }

  // --- Live log streaming ---
  startLiveLog() {
    if (this.connectionMode !== 'usb' || this.logProc) return;
    try {
      this.logProc = spawn(this.getAdbPath(), [
        'shell', 'tail', '-f', '/data/data/com.termux/files/usr/tmp/openclaw-gateway.log'
      ], { windowsHide: true });

      this.logProc.stdout.on('data', data => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          this.emit('live-log', line);
        }
      });
      this.logProc.on('close', () => { this.logProc = null; });
      this.logProc.on('error', () => { this.logProc = null; });
    } catch {}
  }

  stopLiveLog() {
    if (this.logProc) { this.logProc.kill(); this.logProc = null; }
  }

  // ============================================
  //  INTERACTIVE SHELL (ADB)
  // ============================================
  startShell() {
    if (this.connectionMode !== 'usb' || this.shellProc) return;
    try {
      this.shellProc = spawn(this.getAdbPath(), ['shell'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.shellProc.stdout.on('data', data => {
        this.emit('shell-output', data.toString());
      });
      this.shellProc.stderr.on('data', data => {
        this.emit('shell-output', data.toString());
      });
      this.shellProc.on('close', () => {
        this.shellProc = null;
        this.emit('shell-closed');
      });
      this.shellProc.on('error', () => {
        this.shellProc = null;
        this.emit('shell-closed');
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  sendShellInput(text) {
    if (this.shellProc && this.shellProc.stdin.writable) {
      this.shellProc.stdin.write(text + '\n');
      return true;
    }
    return false;
  }

  stopShell() {
    if (this.shellProc) { this.shellProc.kill(); this.shellProc = null; }
  }

  // ============================================
  //  KEY MANAGEMENT
  // ============================================
  async readKeys() {
    if (!this.connected) await this.connect();
    if (this.connectionMode === 'network') {
      return { success: false, error: 'Key reading requires USB connection', keys: {} };
    }
    try {
      const envPath = '/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/root/.openclaw/env';
      const raw = await this.shell(`cat ${envPath} 2>/dev/null`);
      const keys = {};
      for (const line of raw.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)$/);
        if (m) keys[m[1]] = m[2];
      }
      return { success: true, keys };
    } catch (e) {
      return { success: false, error: e.message, keys: {} };
    }
  }

  async writeKeys(keys) {
    if (!this.connected) await this.connect();
    if (this.connectionMode === 'network') {
      return { success: false, error: 'Key writing requires USB connection' };
    }
    try {
      const lines = [];
      if (keys.KIMI_API_KEY) { lines.push(`KIMI_API_KEY=${keys.KIMI_API_KEY}`); lines.push(`MOONSHOT_API_KEY=${keys.KIMI_API_KEY}`); }
      if (keys.TELEGRAM_BOT_TOKEN) lines.push(`TELEGRAM_BOT_TOKEN=${keys.TELEGRAM_BOT_TOKEN}`);
      if (keys.OPENAI_API_KEY) lines.push(`OPENAI_API_KEY=${keys.OPENAI_API_KEY}`);
      if (keys.GROQ_API_KEY) lines.push(`GROQ_API_KEY=${keys.GROQ_API_KEY}`);

      const content = lines.join('\\n');
      const envPath = '/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/root/.openclaw/env';
      await this.shell(`echo -e '${content}' > ${envPath} && chmod 600 ${envPath}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ============================================
  //  AVATAR SYNC
  // ============================================
  async pushAvatar(avatarFrames) {
    if (!this.connected || this.connectionMode !== 'usb') {
      return { success: false, error: 'Avatar sync requires USB connection' };
    }
    try {
      const content = avatarFrames.join('\n---\n');
      const tmpFile = path.join(os.tmpdir(), 'pocketclaw-crab.txt');
      fs.writeFileSync(tmpFile, content, 'utf-8');
      await this.adb(['push', tmpFile, '/sdcard/pocketclaw-crab.txt'], 10000);
      try { fs.unlinkSync(tmpFile); } catch {}
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ============================================
  //  TOOLS
  // ============================================
  async runTool(cmd) {
    if (!this.connected) await this.connect();
    if (this.connectionMode === 'network') {
      return 'Tool commands require USB connection';
    }
    const PREFIX = '/data/data/com.termux/files/usr';
    const tools = {
      'restart-gw': `${PREFIX}/bin/restart-gw`,
      'healthcheck': `${PREFIX}/bin/healthcheck`,
      'start-openclaw': `nohup ${PREFIX}/bin/start-openclaw > ${PREFIX}/tmp/openclaw-gateway.log 2>&1 &`,
      'stop-gw': 'pkill -f openclaw 2>/dev/null; pkill -f proot 2>/dev/null',
      'kill-systemui': 'am force-stop com.android.systemui',
      'wake-lock': 'termux-wake-lock',
      'ssh-start': 'sshd',
      'reboot': 'reboot',
    };

    const shellCmd = tools[cmd] || cmd;
    return this.shell(shellCmd, 30000);
  }

  // ============================================
  //  PUSH SCRIPTS
  // ============================================
  async pushScripts() {
    if (!this.connected) await this.connect();
    if (this.connectionMode === 'network') {
      return { success: false, error: 'Push requires USB connection' };
    }
    const base = !process.defaultApp
      ? path.join(process.resourcesPath, 'payload')
      : path.join(__dirname, '..', 'payload');

    const scriptsDir = path.join(base, 'scripts');
    if (!fs.existsSync(scriptsDir)) return { success: false, error: 'No scripts in payload' };

    const dest = '/sdcard/pocketclaw/scripts';
    await this.shell(`mkdir -p ${dest}`);

    const files = fs.readdirSync(scriptsDir);
    for (const f of files) {
      await this.adb(['push', path.join(scriptsDir, f), `${dest}/${f}`], 30000);
    }
    return { success: true, count: files.length };
  }
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = { DashboardEngine };
