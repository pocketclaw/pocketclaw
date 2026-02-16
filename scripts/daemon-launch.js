// daemon-launch.js — starts start-openclaw as a detached daemon
const { spawn } = require('child_process');
const fs = require('fs');

const PREFIX = '/data/data/com.termux/files/usr';
const logFile = PREFIX + '/tmp/openclaw-gateway.log';

var out = fs.openSync(logFile, 'a');

var child = spawn(PREFIX + '/bin/bash', [PREFIX + '/bin/start-openclaw'], {
  detached: true,
  stdio: ['ignore', out, out],
  env: {
    LD_LIBRARY_PATH: PREFIX + '/lib',
    LD_PRELOAD: PREFIX + '/lib/libapi23compat.so',
    PATH: PREFIX + '/bin',
    HOME: PREFIX + '/var/lib/proot-distro/installed-rootfs/ubuntu/root',
    SHELL: PREFIX + '/bin/bash',
    TMPDIR: PREFIX + '/tmp',
    ANDROID_DATA: '/data',
    ANDROID_ROOT: '/system',
    PREFIX: PREFIX
  }
});

child.unref();
fs.writeFileSync(PREFIX + '/tmp/start-openclaw.pid', '' + child.pid);
console.log('Watchdog daemon launched, PID: ' + child.pid);
process.exit(0);
