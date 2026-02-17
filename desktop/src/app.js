// PocketClaw 3000 — Renderer (Pip-Boy Edition v3)
(function () {

  // ═══════════════════════════════════════
  //  CRUSTACEAN AVATAR COLLECTION
  // ═══════════════════════════════════════
  const AVATARS = {
    crab: {
      name: 'CRAB', desc: 'The OG PocketClaw',
      frames: [
        "     __       __\n    / <`     `> \\\n   (  / @   @ \\  )\n    \\(  \\_-_/  )/\n  (\\ `-/     \\-` /)\n   \"==/   _   \\==\"\n    .=') [_] (`=.\n   ' .='     `=. '",
        "    __         __\n   ( <`       `> )\n   (  / @   @ \\  )\n    \\(  \\_-_/  )/\n  (\\ `-/     \\-` /)\n   \"==/   _   \\==\"\n    .=') [_] (`=.\n   ' .='     `=. '"
      ]
    },
    lobster: {
      name: 'LOBSTER', desc: 'The Big Red Boss',
      frames: [
        "  )\\    ||    /(\n   )\\  (oo)  /(\n  (==\\_/||\\_/==)\n       |  |\n      /|/\\|\\\n     / |  | \\\n   /__/|  |\\__\\\n   \\__\\/ \\/__/",
        "   )\\   ||   /(\n  )\\   (oo)   /(\n  (==\\_/||\\_/==)\n       |  |\n      /|/\\|\\\n     / |  | \\\n   /__/|  |\\__\\\n   \\__\\/ \\/__/"
      ]
    },
    shrimp: {
      name: 'SHRIMP', desc: 'Small but mighty',
      frames: [
        "   ||  .---.\n   || / o   \\\n      |  -- |\n       \\   / \n        | |  \n       / / \\ \n      / /   \\\n     (_/   \\_)",
        "    || .---.\n    ||/ o   \\\n      |  -- |\n       \\   / \n        | |  \n       / / \\ \n      / /   \\\n     (_/   \\_)"
      ]
    },
    hermit: {
      name: 'HERMIT', desc: 'Home sweet shell',
      frames: [
        "      .--~~--.\n     / .----. \\\n    | ( @~~@ ) |\n     \\ `----' /\n    __`------'__\n   / <`  \\/  `> \\\n   \\  \\ -- /  /\n    '--.  .--'",
        "      .--~~--.\n     / .----. \\\n    | ( @~~@ ) |\n     \\ `----' /\n    __`------'__\n    / <` \\/ `> \\\n    \\  \\ -- /  /\n     '--.  .--'"
      ]
    },
    octopus: {
      name: 'OCTOPUS', desc: 'Eight arms, one brain',
      frames: [
        "     .-----.\n    / O   O \\\n   |  \\___/  |\n    \\       /\n   __|     |__\n  / / / | \\ \\ \\\n ( ( ( | ) ) )\n  \\_\\_\\|/_/_/",
        "     .-----.\n    / O   O \\\n   |  \\___/  |\n    \\       /\n   __|     |__\n  \\ \\ \\ | / / /\n  ( ( ( | ) ) )\n   /_/_/|\\_\\_\\"
      ]
    },
    jellyfish: {
      name: 'JELLY', desc: 'Drift mode engaged',
      frames: [
        "     .~~~~.\n    / ~  ~ \\\n   (  .  .  )\n    \\  \\/  /\n     '~~~~'\n    | |  | |\n     \\|  |/\n      |  |",
        "     .~~~~.\n    / ~  ~ \\\n   (  .  .  )\n    \\  \\/  /\n     '~~~~'\n     \\|  |/\n    | |  | |\n     `'  '`"
      ]
    },
    isopod: {
      name: 'ISOPOD', desc: 'The deep sea tank',
      frames: [
        "    /======\\\n   / (o)(o) \\\n  |==========|\n  |----------|\n  |==========|\n  |----------|\n   \\========/\n    \\------/",
        "    /======\\\n   / (o)(o) \\\n  |==========|\n  |----------|\n  |==========|\n  |----------|\n   \\========/\n    `------'"
      ]
    },
    kingcrab: {
      name: 'KING', desc: 'Crown of thorns',
      frames: [
        "    _/\\_/\\_\n   / <`   `> \\\n  /  / @ @ \\  \\\n  \\_( \\_V_/ )_/\n //`-/ _ \\-`\\\\\n||  / [_] \\  ||\n \\\\.='   `=.//\n  `='     `='",
        "   _/\\_/\\_\n  / <`   `> \\\n /  / @ @ \\  \\\n  \\_( \\_V_/ )_/\n//`-/  _  \\-`\\\\\n||  / [_] \\  ||\n \\\\.='   `=.//\n  `='     `='"
      ]
    }
  };

  const AVATAR_KEYS = Object.keys(AVATARS);

  // ═══ Theme management ═══
  const savedTheme = localStorage.getItem('pocketclaw-theme') || 'green';
  applyTheme(savedTheme);

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    localStorage.setItem('pocketclaw-theme', theme);
  }

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // ═══ Avatar animation ═══
  let currentAvatarKey = localStorage.getItem('pocketclaw-avatar') || 'crab';
  let crabFrame = 0;

  setInterval(() => {
    crabFrame = 1 - crabFrame;
    const frames = AVATARS[currentAvatarKey]?.frames || AVATARS.crab.frames;
    document.querySelectorAll('.crab-display, .crab-large').forEach(el => {
      el.textContent = frames[crabFrame];
    });
  }, 2000);

  // ═══ Tab switching ═══
  const tabs = document.querySelectorAll('.pip-tab');
  const contents = document.querySelectorAll('.pip-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'stat' || tab.dataset.tab === 'devices') {
        if (!connected) tryConnect();
      }
    });
  });

  // ═══ Connection state ═══
  const connDot = document.getElementById('connDot');
  const connLabel = document.getElementById('connLabel');
  let connected = false;
  let connectionMode = 'usb';
  let currentDevice = null;
  let devices = [];
  let liveLogActive = false;

  function setConnected(state, label) {
    connected = state;
    connDot.classList.toggle('on', state);
    connLabel.classList.toggle('on', state);
    connLabel.textContent = label || (state ? 'CONNECTED' : 'NO SIGNAL');
    document.getElementById('statWelcome').classList.toggle('hidden', state);
    document.getElementById('statConnected').classList.toggle('hidden', !state);
    const badge = document.getElementById('connModeBadge');
    if (badge) badge.textContent = state ? (connectionMode === 'network' ? 'NET' : 'USB') : '';
  }

  async function tryConnect() {
    const r = await window.api.dashConnect();
    handleConnectResult(r);
  }

  async function tryConnectNetwork() {
    const url = document.getElementById('networkUrl').value.trim();
    if (!url) return;
    const statusEl = document.getElementById('networkStatus');
    statusEl.textContent = 'Connecting...';
    statusEl.className = 'network-status';
    const r = await window.api.dashConnectNetwork(url);
    if (r.connected) {
      handleConnectResult(r);
      statusEl.textContent = '';
    } else {
      statusEl.textContent = r.error || 'Connection failed';
      statusEl.className = 'network-status err';
    }
  }

  async function tryConnectSerial(serial) {
    const r = await window.api.dashConnectSerial(serial);
    handleConnectResult(r);
  }

  async function tryConnectSaved(d) {
    let r;
    if (d.mode === 'network' && d.url) {
      r = await window.api.dashConnectNetwork(d.url);
    } else {
      r = await window.api.dashConnectSerial(d.serial);
    }
    handleConnectResult(r);
  }

  function handleConnectResult(r) {
    if (r.connected) {
      connectionMode = r.mode || 'usb';
      setConnected(true, r.serial);
      currentDevice = r;
      updateStatPage(r);
      addDeviceToInventory(r);
      window.api.dashStartPoll();
      refreshLogs();
      // Restore avatar for this device
      const saved = devices.find(x => x.serial === r.serial);
      if (saved && saved.avatar && AVATARS[saved.avatar]) {
        currentAvatarKey = saved.avatar;
        localStorage.setItem('pocketclaw-avatar', currentAvatarKey);
        renderAvatarPicker();
      }
    }
  }

  // ═══════════════════════════════════════
  //  STAT TAB
  // ═══════════════════════════════════════
  function updateStatPage(d) {
    document.getElementById('statDeviceName').textContent =
      (d.product || d.model || 'DEVICE').toUpperCase();
    document.getElementById('statDeviceSub').textContent =
      [d.model, d.sdk ? 'SDK ' + d.sdk : '', 'ARM'].filter(Boolean).join(' | ');

    // Status grid
    setDot('dotGw', d.gatewayOk);
    setDot('dotWifi', true);
    setDot('dotTg', d.gatewayOk);
    setDot('dotKimi', d.gatewayOk);
    document.getElementById('valGw').textContent = d.gatewayOk ? 'ONLINE' : (d.gatewayPid ? 'STARTING' : 'OFFLINE');
    document.getElementById('valWifi').textContent = 'ON';
    document.getElementById('valTg').textContent = d.gatewayOk ? 'LIVE' : '--';
    document.getElementById('valKimi').textContent = d.gatewayOk ? 'OK' : '--';

    // Info
    document.getElementById('valUptime').textContent = d.uptime || '--';
    document.getElementById('valPid').textContent = d.gatewayPid || '--';

    // RAM bar
    const ramPct = d.ramTotal > 0 ? Math.round((d.ramUsed / d.ramTotal) * 100) : 0;
    const ramBar = document.getElementById('barRam');
    ramBar.style.width = ramPct + '%';
    ramBar.classList.remove('warn', 'crit');
    if (ramPct > 85) ramBar.classList.add('crit');
    else if (ramPct > 70) ramBar.classList.add('warn');
    document.getElementById('barRamVal').textContent =
      d.ramUsed + '/' + d.ramTotal + ' MB (' + ramPct + '%)';

    // RAM detail
    const ramDetail = document.getElementById('ramDetail');
    if (ramDetail && d.topProcesses && d.topProcesses.length > 0) {
      ramDetail.innerHTML = '';
      for (const p of d.topProcesses.slice(0, 5)) {
        const row = document.createElement('span');
        row.className = 'ram-proc';
        row.textContent = p.name + ': ' + p.mb + 'MB';
        ramDetail.appendChild(row);
      }
    }

    // Disk bar (real data)
    if (d.diskTotal > 0) {
      const diskPct = Math.round((d.diskUsed / d.diskTotal) * 100);
      document.getElementById('barDisk').style.width = diskPct + '%';
      const diskTotalGb = (d.diskTotal / 1024).toFixed(1);
      const diskUsedGb = (d.diskUsed / 1024).toFixed(1);
      document.getElementById('barDiskVal').textContent = diskUsedGb + '/' + diskTotalGb + ' GB';
    } else {
      document.getElementById('barDisk').style.width = '0%';
      document.getElementById('barDiskVal').textContent = '--';
    }

    // Battery bar
    const battBar = document.getElementById('barBatt');
    const battVal = document.getElementById('barBattVal');
    if (d.battery !== null && d.battery !== undefined) {
      battBar.style.width = d.battery + '%';
      battBar.classList.remove('warn', 'crit', 'charging');
      if (d.batteryCharging) battBar.classList.add('charging');
      else if (d.battery <= 15) battBar.classList.add('crit');
      else if (d.battery <= 30) battBar.classList.add('warn');
      battVal.textContent = d.battery + '%' + (d.batteryCharging ? ' CHG' : '');
    } else {
      battBar.style.width = '0%';
      battVal.textContent = '--';
    }
  }

  function setDot(id, on) {
    const el = document.getElementById(id);
    el.classList.remove('on', 'off');
    el.classList.add(on ? 'on' : 'off');
  }

  async function refreshLogs() {
    if (liveLogActive) return; // live log handles itself
    const logs = await window.api.dashGetLogs(15);
    const el = document.getElementById('statLogScroll');
    el.innerHTML = '';
    if (!logs) return;
    for (const line of logs.split('\n').slice(-15)) {
      if (!line.trim()) continue;
      const p = document.createElement('p');
      p.className = 'log-line' + (line.includes('ERROR') ? ' log-err' : '');
      p.textContent = line.length > 60 ? line.substring(0, 60) : line;
      el.appendChild(p);
    }
    el.scrollTop = 99999;
  }

  // Auto-reconnect handling
  window.api.onDashUpdate(d => {
    if (d.connected) {
      if (d.reconnected) {
        setConnected(true, d.serial || currentDevice?.serial);
      }
      updateStatPage(d);
    } else {
      if (d.reconnecting) {
        connLabel.textContent = 'RECONNECTING' + (d.attempt ? ' (' + d.attempt + ')' : '');
        connLabel.classList.remove('on');
      } else {
        setConnected(false);
      }
    }
  });

  setInterval(() => { if (connected && !liveLogActive) refreshLogs(); }, 10000);

  // ═══ Live Log toggle ═══
  const btnLiveLog = document.getElementById('btnLiveLog');
  btnLiveLog.addEventListener('click', () => {
    liveLogActive = !liveLogActive;
    btnLiveLog.classList.toggle('active', liveLogActive);
    btnLiveLog.textContent = liveLogActive ? 'STOP' : 'LIVE';
    if (liveLogActive) {
      window.api.startLiveLog();
    } else {
      window.api.stopLiveLog();
    }
  });

  window.api.onLiveLog(line => {
    if (!liveLogActive) return;
    const el = document.getElementById('statLogScroll');
    const p = document.createElement('p');
    p.className = 'log-line' + (line.includes('ERROR') ? ' log-err' : '');
    p.textContent = line.length > 60 ? line.substring(0, 60) : line;
    el.appendChild(p);
    // Keep max 200 lines
    while (el.children.length > 200) el.removeChild(el.firstChild);
    el.scrollTop = 99999;
  });

  // ═══ Welcome buttons ═══
  document.getElementById('btnWelcomeConnect').addEventListener('click', tryConnect);
  document.getElementById('btnNetworkConnect').addEventListener('click', tryConnectNetwork);
  document.getElementById('networkUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') tryConnectNetwork();
  });

  // ═══════════════════════════════════════
  //  AVATAR PICKER
  // ═══════════════════════════════════════
  function renderAvatarPicker() {
    const picker = document.getElementById('avatarPicker');
    if (!picker) return;
    picker.innerHTML = '';
    for (const key of AVATAR_KEYS) {
      const av = AVATARS[key];
      const btn = document.createElement('button');
      btn.className = 'avatar-btn' + (key === currentAvatarKey ? ' active' : '');
      btn.title = av.name + ' \u2014 ' + av.desc;
      btn.dataset.avatar = key;

      const preview = av.frames[0].split('\n').slice(0, 3).map(l =>
        l.length > 16 ? l.substring(0, 16) : l
      ).join('\n');
      btn.innerHTML = `<pre class="avatar-preview">${escHtml(preview)}</pre><span class="avatar-name">${av.name}</span>`;

      btn.addEventListener('click', () => selectAvatar(key));
      picker.appendChild(btn);
    }
  }

  async function selectAvatar(key) {
    currentAvatarKey = key;
    localStorage.setItem('pocketclaw-avatar', key);
    crabFrame = 0;
    document.querySelectorAll('.crab-display, .crab-large').forEach(el => {
      el.textContent = AVATARS[key].frames[0];
    });
    document.querySelectorAll('.avatar-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.avatar === key);
    });
    if (currentDevice && currentDevice.serial) {
      await window.api.saveDeviceAvatar(currentDevice.serial, key);
      // Update local device list
      const d = devices.find(x => x.serial === currentDevice.serial);
      if (d) d.avatar = key;
      renderDeviceList();
      // Sync to phone
      const r = await window.api.pushAvatar(AVATARS[key].frames);
      const statusEl = document.getElementById('avatarSyncStatus');
      if (statusEl) {
        statusEl.textContent = r.success ? 'Synced!' : (r.error || 'Sync failed');
        statusEl.className = 'avatar-sync-status ' + (r.success ? 'ok' : 'err');
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
      }
    }
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ═══════════════════════════════════════
  //  DEVICES TAB
  // ═══════════════════════════════════════
  function addDeviceToInventory(d) {
    const serial = d.serial;
    if (!serial) return;
    const existing = devices.find(x => x.serial === serial);
    if (existing) {
      Object.assign(existing, d, { lastSeen: Date.now(), online: true });
    } else {
      devices.push({ ...d, lastSeen: Date.now(), online: true, avatar: currentAvatarKey });
    }
    renderDeviceList();
  }

  function renderDeviceList() {
    const list = document.getElementById('deviceList');
    if (devices.length === 0) {
      list.innerHTML = '<div class="device-empty">No devices registered. Connect a phone to add it.</div>';
      return;
    }
    list.innerHTML = '';
    for (const d of devices) {
      const card = document.createElement('div');
      const isActive = d.serial === currentDevice?.serial;
      card.className = 'device-card' + (isActive ? ' active-device' : '');
      const online = d.online && isActive;
      const ago = d.lastSeen ? timeSince(d.lastSeen) : 'never';
      const av = AVATARS[d.avatar || 'crab'] || AVATARS.crab;
      const miniArt = av.frames[0].split('\n').slice(0, 4).map(l =>
        l.length > 14 ? l.substring(0, 14) : l
      ).join('\n');
      const modeIcon = d.mode === 'network' ? 'NET' : 'USB';

      card.innerHTML = `
        <pre class="dc-avatar">${escHtml(miniArt)}</pre>
        <div class="dc-dot ${online ? 'online' : ''}"></div>
        <div class="dc-info">
          <div class="dc-name">${escHtml((d.product || d.model || 'Device').toUpperCase())}</div>
          <div class="dc-detail">${escHtml(d.model || '?')} | SDK ${escHtml(String(d.sdk || '?'))} | ${d.ramTotal || '?'} MB</div>
          <div class="dc-serial">${escHtml(d.serial)} <span class="dc-mode">${modeIcon}</span></div>
        </div>
        <div class="dc-status ${online ? 'online' : 'offline'}">${online ? 'CONNECTED' : 'Last: ' + ago}</div>
      `;

      // Click to switch device
      if (!isActive) {
        card.addEventListener('click', () => tryConnectSaved(d));
      }

      list.appendChild(card);
    }
  }

  function timeSince(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
  }

  document.getElementById('btnScanDevices').addEventListener('click', tryConnect);

  // Load saved devices
  (async () => {
    try {
      const saved = await window.api.getSavedDevices();
      if (saved && saved.length > 0) {
        for (const d of saved) {
          if (!devices.find(x => x.serial === d.serial)) {
            devices.push({ ...d, online: false });
          }
        }
        renderDeviceList();
      }
    } catch {}
  })();

  // ═══════════════════════════════════════
  //  KEYS TAB
  // ═══════════════════════════════════════
  const keysStatus = document.getElementById('keysStatus');

  document.getElementById('btnReadKeys').addEventListener('click', async () => {
    keysStatus.textContent = 'Reading from device...';
    keysStatus.className = 'keys-status';
    const r = await window.api.keysRead();
    if (r.success) {
      const k = r.keys;
      document.getElementById('mgrKeyKimi').value = k.KIMI_API_KEY || '';
      document.getElementById('mgrKeyTelegram').value = k.TELEGRAM_BOT_TOKEN || '';
      document.getElementById('mgrKeyOpenai').value = k.OPENAI_API_KEY || '';
      document.getElementById('mgrKeyGroq').value = k.GROQ_API_KEY || '';
      updateKeyDots(k);
      keysStatus.textContent = 'Keys loaded from device.';
      keysStatus.className = 'keys-status ok';
    } else {
      keysStatus.textContent = 'Failed: ' + r.error;
      keysStatus.className = 'keys-status err';
    }
  });

  document.getElementById('btnWriteKeys').addEventListener('click', async () => {
    const keys = {
      KIMI_API_KEY: document.getElementById('mgrKeyKimi').value.trim(),
      TELEGRAM_BOT_TOKEN: document.getElementById('mgrKeyTelegram').value.trim(),
      OPENAI_API_KEY: document.getElementById('mgrKeyOpenai').value.trim(),
      GROQ_API_KEY: document.getElementById('mgrKeyGroq').value.trim(),
    };
    keysStatus.textContent = 'Pushing to device...';
    const r = await window.api.keysWrite(keys);
    keysStatus.textContent = r.success ? 'Keys pushed. Restart GW to apply.' : 'Failed: ' + r.error;
    keysStatus.className = 'keys-status ' + (r.success ? 'ok' : 'err');
    if (r.success) updateKeyDots(keys);
  });

  document.getElementById('btnRestartAfterKeys').addEventListener('click', async () => {
    keysStatus.textContent = 'Restarting gateway...';
    await window.api.toolRestartGw();
    keysStatus.textContent = 'Gateway restarted. New keys active.';
    keysStatus.className = 'keys-status ok';
  });

  function updateKeyDots(k) {
    document.getElementById('kfDotKimi').classList.toggle('set', !!k.KIMI_API_KEY);
    document.getElementById('kfDotTg').classList.toggle('set', !!k.TELEGRAM_BOT_TOKEN);
    document.getElementById('kfDotOai').classList.toggle('set', !!k.OPENAI_API_KEY);
    document.getElementById('kfDotGroq').classList.toggle('set', !!k.GROQ_API_KEY);
  }

  // ═══════════════════════════════════════
  //  SETUP TAB
  // ═══════════════════════════════════════
  const setupTerm = document.getElementById('setupTermContent');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const btnStart = document.getElementById('btnStart');
  const btnAbort = document.getElementById('btnAbort');

  function setupAppend(text) {
    const p = document.createElement('p');
    p.className = 'tl';
    if (text.includes('ERROR') || text.includes('FAIL')) p.className += ' err';
    if (text.includes('COMPLETE')) p.className += ' ok';
    p.textContent = text;
    setupTerm.appendChild(p);
    setupTerm.parentElement.scrollTop = setupTerm.parentElement.scrollHeight;
  }

  function updateStep(num, status) {
    const item = document.querySelector(`.ss-step[data-step="${num}"]`);
    if (!item) return;
    item.classList.remove('active', 'done', 'error');
    const dot = item.querySelector('.ss-dot');
    if (status === 'active')  { item.classList.add('active'); dot.textContent = '\u25B8'; }
    else if (status === 'done')   { item.classList.add('done');   dot.textContent = '\u25CF'; }
    else if (status === 'error')  { item.classList.add('error');  dot.textContent = '\u2717'; }
    else dot.textContent = '\u25CB';
  }

  window.api.onLog(msg => setupAppend(msg));
  window.api.onProgress(({ percent, label }) => {
    progressFill.style.width = percent + '%';
    progressLabel.textContent = label || percent + '%';
    if (percent >= 100) progressFill.classList.add('complete');
    else progressFill.classList.remove('complete');
  });
  window.api.onStepUpdate(({ step, status, detail }) => {
    updateStep(step, status);
    if (status === 'error' && detail) setupAppend('> Step ' + step + ' error: ' + detail);
  });
  window.api.onAborted(() => { setupAppend('> === ABORTED ==='); setSetupRunning(false); });

  function setSetupRunning(state) {
    btnStart.disabled = state;
    btnAbort.disabled = !state;
    if (!state) { btnStart.textContent = '[ RETRY ]'; btnStart.disabled = false; }
  }

  btnStart.addEventListener('click', async () => {
    const keys = {
      kimi: document.getElementById('setupKeyKimi').value.trim(),
      telegram: document.getElementById('setupKeyTelegram').value.trim(),
      openai: document.getElementById('setupKeyOpenai').value.trim(),
      groq: document.getElementById('setupKeyGroq').value.trim(),
    };
    setSetupRunning(true);
    progressFill.style.width = '0%';
    progressLabel.textContent = '0%';
    document.querySelectorAll('.ss-step').forEach(s => {
      s.classList.remove('active', 'done', 'error');
      s.querySelector('.ss-dot').textContent = '\u25CB';
    });
    setupTerm.innerHTML = '';
    setupAppend('> PocketClaw 3000 \u2014 Setup initiated...');
    const r = await window.api.runAll(keys);
    setSetupRunning(false);
    if (!r.success) setupAppend('> Failed: ' + r.error);
  });

  btnAbort.addEventListener('click', async () => { setupAppend('> Aborting...'); await window.api.abort(); });

  (async () => {
    const p = await window.api.checkPayload();
    if (!p._allPresent) {
      setupAppend('> WARNING: Payload files missing.');
      for (const [f, ok] of Object.entries(p)) {
        if (f !== '_allPresent' && !ok) setupAppend('>   MISSING: ' + f);
      }
      setupAppend('> Run: npm run prepare-payload');
    }
  })();

  // ═══════════════════════════════════════
  //  TOOLS TAB
  // ═══════════════════════════════════════
  const toolTermContent = document.getElementById('toolTermContent');

  function toolAppend(text) {
    const p = document.createElement('p');
    p.className = 'tl' + (text.includes('ERROR') ? ' err' : '');
    p.textContent = text;
    toolTermContent.appendChild(p);
    document.getElementById('toolTerminal').scrollTop = 99999;
  }

  document.querySelectorAll('.tool-card').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      toolAppend('> Running: ' + cmd + '...');
      let result;
      if (cmd === 'push-scripts') {
        result = await window.api.toolPushScripts();
        toolAppend(result.success !== undefined
          ? (result.success ? '> Pushed ' + (result.count || 0) + ' scripts.' : '> Error: ' + result.error)
          : '> ' + JSON.stringify(result));
      } else {
        result = await window.api.toolRun(cmd);
        if (result.success !== undefined) {
          toolAppend(result.output ? '> ' + result.output : '> Done.');
          if (result.error) toolAppend('> Error: ' + result.error);
        } else {
          toolAppend('> ' + (result || 'Done.'));
        }
      }
    });
  });

  // ═══ Interactive Shell ═══
  let shellActive = false;
  const btnShellToggle = document.getElementById('btnShellToggle');
  const shellTerminal = document.getElementById('shellTerminal');
  const shellInputRow = document.getElementById('shellInputRow');
  const shellContent = document.getElementById('shellContent');
  const shellInput = document.getElementById('shellInput');

  btnShellToggle.addEventListener('click', async () => {
    shellActive = !shellActive;
    btnShellToggle.classList.toggle('active', shellActive);
    btnShellToggle.textContent = shellActive ? '[ CLOSE ]' : '[ OPEN ]';
    shellTerminal.classList.toggle('hidden', !shellActive);
    shellInputRow.classList.toggle('hidden', !shellActive);

    if (shellActive) {
      const r = await window.api.startShell();
      if (r && !r.success) {
        shellAppend('Error: ' + r.error);
        shellActive = false;
        btnShellToggle.textContent = '[ OPEN ]';
        btnShellToggle.classList.remove('active');
      } else {
        shellInput.focus();
      }
    } else {
      await window.api.stopShell();
    }
  });

  shellInput.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const cmd = shellInput.value;
      shellInput.value = '';
      shellAppend('$ ' + cmd);
      await window.api.sendShell(cmd);
    }
  });

  window.api.onShellOutput(data => {
    const lines = data.split('\n');
    for (const line of lines) {
      if (line) shellAppend(line);
    }
  });

  window.api.onShellClosed(() => {
    shellAppend('--- Shell closed ---');
    shellActive = false;
    btnShellToggle.textContent = '[ OPEN ]';
    btnShellToggle.classList.remove('active');
  });

  function shellAppend(text) {
    const p = document.createElement('p');
    p.className = 'tl' + (text.includes('Error') || text.includes('error') ? ' err' : '');
    p.textContent = text;
    shellContent.appendChild(p);
    while (shellContent.children.length > 500) shellContent.removeChild(shellContent.firstChild);
    shellTerminal.scrollTop = 99999;
  }

  // ═══ Init ═══
  renderAvatarPicker();

})();
