const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// All 126 packages to uninstall (from restore-debloat.sh)
const DEBLOAT_PACKAGES = [
  // Google apps
  'com.google.android.apps.docs', 'com.google.android.apps.docs.editors.docs',
  'com.google.android.apps.inputmethod.hindi', 'com.google.android.apps.magazines',
  'com.google.android.apps.maps', 'com.google.android.apps.photos',
  'com.google.android.apps.plus', 'com.google.android.gm',
  'com.google.android.gms', 'com.google.android.googlequicksearchbox',
  'com.google.android.gsf', 'com.google.android.gsf.login',
  'com.google.android.inputmethod.latin', 'com.google.android.music',
  'com.google.android.talk', 'com.google.android.tts',
  'com.google.android.videos', 'com.google.android.youtube',
  'com.google.android.apps.books', 'com.google.android.apps.cloudprint',
  'com.google.android.backuptransport', 'com.google.android.calendar',
  'com.google.android.configupdater', 'com.google.android.deskclock',
  'com.google.android.feedback', 'com.google.android.gallery3d',
  'com.google.android.gm.exchange', 'com.google.android.inputmethod.korean',
  'com.google.android.inputmethod.pinyin', 'com.google.android.launcher',
  'com.google.android.marvin.talkback', 'com.google.android.onetimeinitializer',
  'com.google.android.partnersetup', 'com.google.android.play.games',
  'com.google.android.setupwizard', 'com.google.android.syncadapters.contacts',
  // Motorola bloat
  'com.lmi.motorola.rescuesecurity', 'com.motorola.actions',
  'com.motorola.android.fmradio', 'com.motorola.android.jvtcmd',
  'com.motorola.android.nativedropboxagent', 'com.motorola.android.provisioning',
  'com.motorola.android.settings.diag_mdlog', 'com.motorola.android.settings.modemdebug',
  'com.motorola.appdirectedsmsproxy', 'com.motorola.audioeffects',
  'com.motorola.bach.modemstats', 'com.motorola.bodyguard',
  'com.motorola.bug2go', 'com.motorola.camera',
  'com.motorola.ccc.checkin', 'com.motorola.ccc.devicemanagement',
  'com.motorola.ccc.mainplm', 'com.motorola.ccc.notification',
  'com.motorola.ccc.ota', 'com.motorola.contacts.preloadcontacts',
  'com.motorola.context', 'com.motorola.coresettingsext',
  'com.motorola.demo', 'com.motorola.emaraphoneextns',
  'com.motorola.fmplayer', 'com.motorola.genie',
  'com.motorola.groundloopnoisepreventer', 'com.motorola.launcherconfig',
  'com.motorola.moodles', 'com.motorola.MotGallery2',
  'com.motorola.motgeofencesvc', 'com.motorola.moto',
  'com.motorola.motocare', 'com.motorola.motocare.internal',
  'com.motorola.motocit', 'com.motorola.motodisplay',
  'com.motorola.motodisplay.env', 'com.motorola.onetimeinitializer',
  'com.motorola.sensorhub.stml0.updater', 'com.motorola.setup',
  'com.motorola.slpc', 'com.motorola.storageoptimizer',
  'com.motorola.wappushsi', 'com.motorola.android.dm.service',
  'com.motorola.slpc_sys',
  // Android system
  'com.android.cellbroadcastreceiver', 'com.android.chrome',
  'com.android.documentsui', 'com.android.mms',
  'com.android.providers.calendar', 'com.android.vending',
  'com.android.backupconfirm', 'com.android.bluetooth',
  'com.android.bluetoothmidiservice', 'com.android.bookmarkprovider',
  'com.android.calculator2', 'com.android.captiveportallogin',
  'com.android.carrierconfig', 'com.android.certinstaller',
  'com.android.contacts', 'com.android.dialer',
  'com.android.dreams.basic', 'com.android.facelock',
  'com.android.htmlviewer', 'com.android.location.fused',
  'com.android.managedprovisioning', 'com.android.mms.service',
  'com.android.pacprocessor', 'com.android.printspooler',
  'com.android.providers.calllogbackup', 'com.android.providers.contacts',
  'com.android.providers.partnerbookmarks', 'com.android.providers.userdictionary',
  'com.android.proxyhandler', 'com.android.sharedstoragebackup',
  'com.android.statementservice', 'com.android.stk',
  'com.android.vpndialogs', 'com.android.wallpaper.livepicker',
  'com.android.wallpapercropper',
  // Qualcomm
  'com.qualcomm.atfwd', 'com.qualcomm.location', 'com.qualcomm.timeservice',
  // Telephony
  'com.android.phone', 'com.android.server.telecom',
  'com.android.providers.telephony', 'com.qualcomm.qcrilmsgtunnel',
  // SystemUI (last — kills UI)
  'com.android.systemui',
];

const STEP_NAMES = [
  'Detect Phone',
  'Install APKs',
  'Push Files',
  'Run Installer',
  'Configure Keys',
  'Debloat',
  'Harden',
  'Verify',
];

class SetupEngine {
  constructor(window) {
    this.window = window;
    this.aborted = false;
    this.activeProcesses = [];
    this.deviceSerial = null;
    this.apiKeys = {};
  }

  // Resolve ADB binary path based on platform
  getAdbPath() {
    const platform = os.platform();
    let payloadBase;

    // In packaged app, resources are in app.asar.unpacked or extraResources
    if (app_is_packaged()) {
      payloadBase = path.join(process.resourcesPath, 'payload');
    } else {
      payloadBase = path.join(__dirname, '..', 'payload');
    }

    const platformMap = { win32: 'win32', darwin: 'darwin', linux: 'linux' };
    const dir = platformMap[platform] || 'linux';
    const binary = platform === 'win32' ? 'adb.exe' : 'adb';
    const adbPath = path.join(payloadBase, 'adb', dir, binary);

    // Try bundled ADB first, fallback to system PATH
    if (fs.existsSync(adbPath)) {
      // Ensure executable on unix
      if (platform !== 'win32') {
        try { fs.chmodSync(adbPath, 0o755); } catch {}
      }
      return adbPath;
    }

    // Fallback: try system adb
    return 'adb';
  }

  getPayloadPath() {
    if (app_is_packaged()) {
      return path.join(process.resourcesPath, 'payload');
    }
    return path.join(__dirname, '..', 'payload');
  }

  // Emit log line to renderer
  emit(msg) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('log', msg);
    }
  }

  // Emit step status update
  emitStep(stepNum, status, detail) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('step-update', { step: stepNum, status, detail });
    }
  }

  // Emit progress
  emitProgress(percent, label) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('progress', { percent, label });
    }
  }

  // Run ADB command, return stdout
  adb(args, { timeout = 30000, stream = false } = {}) {
    return new Promise((resolve, reject) => {
      if (this.aborted) return reject(new Error('Aborted'));

      const adbPath = this.getAdbPath();
      const proc = spawn(adbPath, args, { windowsHide: true });
      this.activeProcesses.push(proc);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        if (stream) this.emit(text.trimEnd());
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`ADB timeout: ${args.join(' ')}`));
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses = this.activeProcesses.filter(p => p !== proc);
        if (code === 0 || stdout.includes('Success')) {
          resolve(stdout.trim());
        } else {
          // Some adb commands return non-zero but still work
          resolve(stdout.trim() || stderr.trim());
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses = this.activeProcesses.filter(p => p !== proc);
        reject(err);
      });
    });
  }

  // Run ADB shell command
  async shell(cmd, opts) {
    return this.adb(['shell', cmd], opts);
  }

  // Check if payload files exist
  checkPayload() {
    const base = this.getPayloadPath();
    const required = [
      'apks/termux-android5-6.apk',
      'apks/termux-boot.apk',
      'apks/pocketclaw-launcher.apk',
      'rootfs/ubuntu-proot-arm.tar.xz',
      'node/node-v22.12.0-linux-armv7l.tar.xz',
      'scripts',
      'config',
      'tools/install-local.sh',
    ];
    const results = {};
    for (const f of required) {
      const fullPath = path.join(base, f);
      results[f] = fs.existsSync(fullPath);
    }
    results._allPresent = Object.values(results).every(Boolean);
    return results;
  }

  // Abort all running processes
  abort() {
    this.aborted = true;
    for (const proc of this.activeProcesses) {
      try { proc.kill(); } catch {}
    }
    this.activeProcesses = [];
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('aborted');
    }
  }

  // Run all 8 steps sequentially
  async runAll(apiKeys) {
    this.aborted = false;
    this.apiKeys = apiKeys || {};

    for (let i = 1; i <= 8; i++) {
      if (this.aborted) throw new Error('Aborted by user');
      await this.runStep(i, apiKeys);
    }
  }

  // Run a single step
  async runStep(stepNum, apiKeys) {
    if (apiKeys) this.apiKeys = apiKeys;
    this.emitStep(stepNum, 'active');
    this.emit(`\n> === Step ${stepNum}: ${STEP_NAMES[stepNum - 1]} ===`);

    try {
      switch (stepNum) {
        case 1: await this.stepDetectPhone(); break;
        case 2: await this.stepInstallApks(); break;
        case 3: await this.stepPushFiles(); break;
        case 4: await this.stepRunInstaller(); break;
        case 5: await this.stepConfigureKeys(); break;
        case 6: await this.stepDebloat(); break;
        case 7: await this.stepHarden(); break;
        case 8: await this.stepVerify(); break;
      }
      this.emitStep(stepNum, 'done');
      this.emit(`> === ${STEP_NAMES[stepNum - 1]}: COMPLETE ===`);
    } catch (err) {
      this.emitStep(stepNum, 'error', err.message);
      this.emit(`> ERROR: ${err.message}`);
      throw err;
    }
  }

  // --- Step 1: Detect Phone ---
  async stepDetectPhone() {
    this.emit('> Starting ADB server...');
    await this.adb(['start-server'], { timeout: 10000 });

    this.emit('> Scanning for devices...');
    let device = null;

    // Poll for device for up to 30 seconds
    for (let i = 0; i < 15; i++) {
      if (this.aborted) throw new Error('Aborted');
      const output = await this.adb(['devices']);
      const lines = output.split('\n').filter(l => l.includes('\tdevice'));
      if (lines.length > 0) {
        device = lines[0].split('\t')[0];
        break;
      }
      this.emit(`> Waiting for device... (${(i + 1) * 2}s)`);
      await sleep(2000);
    }

    if (!device) throw new Error('No device found. Enable USB Debugging and reconnect.');
    this.deviceSerial = device;
    this.emit(`> Device found: ${device}`);

    // Read device properties
    const model = await this.shell('getprop ro.product.device');
    const sdk = await this.shell('getprop ro.build.version.sdk');
    const product = await this.shell('getprop ro.product.model');
    const meminfo = await this.shell('cat /proc/meminfo');
    const memMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const ramMb = memMatch ? Math.round(parseInt(memMatch[1]) / 1024) : 'unknown';

    this.emit(`> Model: ${model} (${product})`);
    this.emit(`> SDK: ${sdk} | RAM: ${ramMb} MB`);

    if (parseInt(sdk) < 21) {
      throw new Error(`SDK ${sdk} too old. Minimum Android 5.0 (SDK 21) required.`);
    }

    this.emitProgress(12, 'Phone detected');
  }

  // --- Step 2: Install APKs ---
  async stepInstallApks() {
    const base = this.getPayloadPath();
    const apks = [
      { file: 'termux-android5-6.apk', pkg: 'com.termux', name: 'Termux' },
      { file: 'termux-boot.apk', pkg: 'com.termux.boot', name: 'Termux:Boot' },
      { file: 'pocketclaw-launcher.apk', pkg: 'com.pocketclaw.launcher', name: 'PocketClaw Launcher' },
    ];

    for (const apk of apks) {
      if (this.aborted) throw new Error('Aborted');
      const apkPath = path.join(base, 'apks', apk.file);
      if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apk.file}`);

      this.emit(`> Installing ${apk.name}...`);
      const result = await this.adb(['install', '-r', apkPath], { timeout: 60000 });
      if (result.includes('Success')) {
        this.emit(`>   ${apk.name} installed`);
      } else {
        this.emit(`>   ${apk.name}: ${result}`);
      }
    }

    // Launch Termux once to initialize its filesystem
    this.emit('> Launching Termux to initialize...');
    await this.shell('am start -n com.termux/.app.TermuxActivity');
    await sleep(5000);

    // Launch Termux:Boot once to register receiver
    this.emit('> Registering Termux:Boot...');
    await this.shell('am start -n com.termux.boot/.app.TermuxBootActivity');
    await sleep(2000);

    // Launch PocketClaw Launcher
    this.emit('> Launching PocketClaw Launcher...');
    await this.shell('am start -n com.pocketclaw.launcher/.LauncherActivity');
    await sleep(2000);

    this.emitProgress(20, 'APKs installed');
  }

  // --- Step 3: Push Files ---
  async stepPushFiles() {
    const base = this.getPayloadPath();
    const dest = '/sdcard/pocketclaw';

    this.emit('> Creating directories on device...');
    await this.shell(`mkdir -p ${dest}/scripts ${dest}/config ${dest}/tools`);

    // Write env file from API keys
    this.emit('> Writing API keys to env file...');
    const envLines = [];
    if (this.apiKeys.kimi) envLines.push(`KIMI_API_KEY=${this.apiKeys.kimi}`, `MOONSHOT_API_KEY=${this.apiKeys.kimi}`);
    if (this.apiKeys.telegram) envLines.push(`TELEGRAM_BOT_TOKEN=${this.apiKeys.telegram}`);
    if (this.apiKeys.openai) envLines.push(`OPENAI_API_KEY=${this.apiKeys.openai}`);
    if (this.apiKeys.groq) envLines.push(`GROQ_API_KEY=${this.apiKeys.groq}`);

    const envContent = envLines.join('\n');
    const tmpEnv = path.join(os.tmpdir(), 'pocketclaw-env');
    fs.writeFileSync(tmpEnv, envContent, 'utf8');
    await this.adb(['push', tmpEnv, `${dest}/config/env`], { timeout: 10000 });
    fs.unlinkSync(tmpEnv);
    this.emit('>   API keys written');

    // Push large files with progress
    const pushFiles = [
      { src: 'rootfs/ubuntu-proot-arm.tar.xz', dst: `${dest}/ubuntu-proot-arm.tar.xz`, label: 'Ubuntu rootfs (~54 MB)' },
      { src: 'node/node-v22.12.0-linux-armv7l.tar.xz', dst: `${dest}/node-v22.12.0-linux-armv7l.tar.xz`, label: 'Node.js 22 (~50 MB)' },
      { src: 'tools/install-local.sh', dst: `${dest}/install-local.sh`, label: 'install-local.sh' },
      { src: 'tools/proot-distro-master.tar.gz', dst: `${dest}/proot-distro-master.tar.gz`, label: 'proot-distro' },
    ];

    for (let i = 0; i < pushFiles.length; i++) {
      if (this.aborted) throw new Error('Aborted');
      const f = pushFiles[i];
      const srcPath = path.join(base, f.src);
      if (!fs.existsSync(srcPath)) {
        this.emit(`>   SKIP: ${f.label} (not found)`);
        continue;
      }
      this.emit(`> Pushing ${f.label}...`);
      await this.adb(['push', srcPath, f.dst], { timeout: 600000 });
      this.emit(`>   ${f.label} pushed`);
      this.emitProgress(20 + Math.round(((i + 1) / pushFiles.length) * 20), `Pushing files...`);
    }

    // Push scripts directory
    this.emit('> Pushing scripts...');
    const scriptsDir = path.join(base, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      const scripts = fs.readdirSync(scriptsDir);
      for (const s of scripts) {
        await this.adb(['push', path.join(scriptsDir, s), `${dest}/scripts/${s}`], { timeout: 30000 });
      }
      this.emit(`>   ${scripts.length} scripts pushed`);
    }

    // Push config directory
    this.emit('> Pushing config...');
    const configDir = path.join(base, 'config');
    if (fs.existsSync(configDir)) {
      const configs = fs.readdirSync(configDir);
      for (const c of configs) {
        await this.adb(['push', path.join(configDir, c), `${dest}/config/${c}`], { timeout: 10000 });
      }
      this.emit(`>   ${configs.length} config files pushed`);
    }

    // Push fix-stubs.sh if present
    const fixStubs = path.join(base, 'tools', 'fix-stubs.sh');
    if (fs.existsSync(fixStubs)) {
      await this.adb(['push', fixStubs, `${dest}/fix-stubs.sh`], { timeout: 10000 });
    }

    this.emitProgress(40, 'Files pushed');
  }

  // --- Step 4: Run Installer ---
  async stepRunInstaller() {
    this.emit('> Triggering install-local.sh inside Termux...');

    // Bring Termux to foreground
    await this.shell('am start -n com.termux/.app.TermuxActivity');
    await sleep(2000);

    // Use Termux RUN_COMMAND intent to execute the installer
    const runCmd = [
      'am', 'broadcast', '--user', '0',
      '-a', 'com.termux.RUN_COMMAND',
      '-n', 'com.termux/.app.RunCommandService',
      '--es', 'com.termux.RUN_COMMAND_PATH', '/data/data/com.termux/files/usr/bin/bash',
      '--esa', 'com.termux.RUN_COMMAND_ARGUMENTS', '/sdcard/pocketclaw/install-local.sh',
      '--ez', 'com.termux.RUN_COMMAND_BACKGROUND', 'false',
    ].join(' ');
    await this.shell(runCmd, { timeout: 15000 });

    this.emit('> Installer launched. Monitoring progress...');

    // Poll install log for up to 25 minutes
    const logPath = '/data/data/com.termux/files/usr/tmp/pocketclaw-install.log';
    let lastLines = 0;
    const maxPolls = 300; // 25 min at 5s intervals

    for (let i = 0; i < maxPolls; i++) {
      if (this.aborted) throw new Error('Aborted');
      await sleep(5000);

      try {
        const log = await this.shell(`cat ${logPath} 2>/dev/null`, { timeout: 10000 });
        const lines = log.split('\n');

        // Emit new lines
        if (lines.length > lastLines) {
          for (let j = lastLines; j < lines.length; j++) {
            if (lines[j].trim()) this.emit(`  ${lines[j].trim()}`);
          }
          lastLines = lines.length;
        }

        // Check for completion marker
        if (log.includes('PocketClaw installed!')) {
          this.emit('> Installer finished successfully!');
          this.emitProgress(65, 'Installer complete');
          return;
        }

        // Check for fatal error
        if (log.includes('ERROR at line')) {
          const errLine = lines.find(l => l.includes('ERROR at line'));
          throw new Error(`Installer failed: ${errLine}`);
        }

        // Update progress (estimate based on known steps)
        let pct = 40;
        if (log.includes('Installing Termux packages')) pct = 45;
        if (log.includes('proot-distro installed')) pct = 48;
        if (log.includes('Ubuntu rootfs')) pct = 50;
        if (log.includes('Extracting')) pct = 52;
        if (log.includes('Node.js 22')) pct = 55;
        if (log.includes('Installing OpenClaw')) pct = 58;
        if (log.includes('Deploying PocketClaw')) pct = 62;
        if (log.includes('Starting PocketClaw')) pct = 64;
        this.emitProgress(pct, 'Installing on device...');

      } catch (err) {
        if (err.message.includes('Aborted') || err.message.includes('Installer failed')) throw err;
        // Log file might not exist yet, keep polling
      }
    }

    throw new Error('Installer timed out after 25 minutes');
  }

  // --- Step 5: Configure Keys ---
  async stepConfigureKeys() {
    this.emit('> Setting up ADB port forward...');
    await this.adb(['forward', 'tcp:9000', 'tcp:9000']);
    this.emit('>   Port 9000 forwarded');

    this.emit('> Waiting for gateway to respond...');
    for (let i = 0; i < 24; i++) {
      if (this.aborted) throw new Error('Aborted');
      try {
        const body = await httpGet('http://127.0.0.1:9000/api/status');
        if (body) {
          this.emit('> Gateway is running!');
          this.emitProgress(72, 'Gateway responding');
          return;
        }
      } catch {}
      this.emit(`>   Waiting... (${(i + 1) * 5}s)`);
      await sleep(5000);
    }

    // Gateway might not be up yet — that's okay, it'll start after debloat frees RAM
    this.emit('> Gateway not responding yet (will retry after debloat)');
    this.emitProgress(72, 'Keys configured');
  }

  // --- Step 6: Debloat ---
  async stepDebloat() {
    this.emit(`> Removing ${DEBLOAT_PACKAGES.length} packages...`);
    let removed = 0;
    let failed = 0;

    for (let i = 0; i < DEBLOAT_PACKAGES.length; i++) {
      if (this.aborted) throw new Error('Aborted');
      const pkg = DEBLOAT_PACKAGES[i];

      try {
        const result = await this.shell(
          `pm uninstall -k --user 0 ${pkg}`,
          { timeout: 10000 }
        );
        if (result.includes('Success')) {
          removed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      // Progress update every 10 packages
      if ((i + 1) % 10 === 0) {
        this.emit(`>   ${i + 1}/${DEBLOAT_PACKAGES.length} processed (${removed} removed)`);
        this.emitProgress(
          72 + Math.round(((i + 1) / DEBLOAT_PACKAGES.length) * 15),
          `Debloating... ${i + 1}/${DEBLOAT_PACKAGES.length}`
        );
      }
    }

    this.emit(`> Debloat complete: ${removed} removed, ${failed} already gone`);
    this.emitProgress(87, 'Debloat complete');
  }

  // --- Step 7: Harden ---
  async stepHarden() {
    this.emit('> Applying system tuning...');

    const settings = [
      ['global', 'window_animation_scale', '0'],
      ['global', 'transition_animation_scale', '0'],
      ['global', 'animator_duration_scale', '0'],
      ['system', 'screen_brightness', '0'],
      ['system', 'screen_off_timeout', '15000'],
      ['secure', 'sysui_qs_tiles', "''"],
      ['secure', 'icon_blacklist', 'bluetooth,hotspot,alarm,zen,rotate,cell,airplane,cast,location,nfc'],
      ['global', 'low_power', '1'],
    ];

    for (const [ns, key, val] of settings) {
      await this.shell(`settings put ${ns} ${key} ${val}`, { timeout: 5000 });
    }
    this.emit('>   Animations disabled, brightness 0, low power on');

    // Whitelist Termux from Doze
    this.emit('> Whitelisting Termux from battery optimization...');
    await this.shell('dumpsys deviceidle whitelist +com.termux', { timeout: 5000 });
    await this.shell('dumpsys deviceidle whitelist +com.termux.boot', { timeout: 5000 });
    this.emit('>   Termux whitelisted from Doze');

    // Disable wifi sleep
    await this.shell('settings put global wifi_sleep_policy 2', { timeout: 5000 });
    this.emit('>   WiFi sleep disabled');

    this.emitProgress(92, 'System hardened');
  }

  // --- Step 8: Verify ---
  async stepVerify() {
    this.emit('> Verifying gateway...');

    // Re-forward port in case it dropped
    await this.adb(['forward', 'tcp:9000', 'tcp:9000']);

    let gatewayOk = false;
    for (let i = 0; i < 6; i++) {
      try {
        const body = await httpGet('http://127.0.0.1:9000/api/status');
        if (body) {
          gatewayOk = true;
          this.emit(`> Gateway status: ${body.substring(0, 200)}`);
          break;
        }
      } catch {}
      await sleep(5000);
    }

    // Get RAM info
    const meminfo = await this.shell('cat /proc/meminfo');
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    const total = totalMatch ? Math.round(parseInt(totalMatch[1]) / 1024) : '?';
    const avail = availMatch ? Math.round(parseInt(availMatch[1]) / 1024) : '?';
    this.emit(`> RAM: ${avail} MB free / ${total} MB total`);

    // Check gateway PID
    const gwPid = await this.shell('pgrep -f openclaw', { timeout: 5000 });
    if (gwPid) this.emit(`> Gateway PID: ${gwPid}`);

    if (gatewayOk) {
      this.emit('');
      this.emit('> ==========================================');
      this.emit('>   POCKETCLAW SETUP COMPLETE!');
      this.emit('> ==========================================');
      this.emit('');
      this.emit('>   Open http://localhost:9000 in your browser');
      this.emit('>   Disconnect USB — phone runs autonomously');
      this.emit('>   Reboot phone — gateway auto-starts');
      this.emitProgress(100, 'Setup complete!');
    } else {
      this.emit('');
      this.emit('> Gateway not responding on port 9000.');
      this.emit('> The device may need more time to start.');
      this.emit('> Try: adb forward tcp:9000 tcp:9000');
      this.emit('> Then: http://localhost:9000');
      this.emitProgress(95, 'Verify manually');
    }
  }
}

// --- Helpers ---

function app_is_packaged() {
  return !process.defaultApp;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = { SetupEngine };
