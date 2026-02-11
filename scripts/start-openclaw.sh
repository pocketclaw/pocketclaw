#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:$PATH"
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp

# API keys are loaded inside proot from /root/.openclaw/env
# NOT passed via command line (visible in ps output = security risk)

termux-wake-lock 2>/dev/null

# Free RAM: kill non-essential processes
# NEVER kill com.google.android.gms or com.google.android.gms.persistent (WiFi depends on them)
am force-stop com.google.android.inputmethod.latin 2>/dev/null
am force-stop android.process.media 2>/dev/null
am force-stop android.process.acore 2>/dev/null
am force-stop com.termux.boot 2>/dev/null
am force-stop com.android.providers.calendar 2>/dev/null
am force-stop com.android.providers.contacts 2>/dev/null
am force-stop com.android.providers.media 2>/dev/null
am force-stop com.google.android.webview 2>/dev/null
# Kill GMS sub-processes that don't manage connectivity
am kill com.google.android.gms.unstable 2>/dev/null
am kill com.google.android.gms:snet 2>/dev/null
am kill com.google.android.gms.ui 2>/dev/null
am kill com.google.process.gapps 2>/dev/null

echo "Starting OpenClaw gateway with watchdog..."
echo "Port: 9000"

while true; do
  echo "[$(date)] Gateway starting..."

  # Clean stale lock files before each start
  rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null

  proot \
    --link2symlink \
    --kill-on-exit \
    --root-id \
    --rootfs=$ROOTFS \
    --bind=/dev \
    --bind=/proc \
    --bind=/sys \
    --bind=$PREFIX/tmp:/tmp \
    --bind=/storage/emulated/0:/sdcard \
    --cwd=/root \
    /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
      && export HOME=/root \
      && export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=192' \
      && . /root/.openclaw/env \
      && export MOONSHOT_API_KEY KIMI_API_KEY TELEGRAM_BOT_TOKEN OPENAI_API_KEY \
      && export XDG_RUNTIME_DIR=/tmp \
      && export DBUS_SESSION_BUS_ADDRESS=disabled: \
      && openclaw gateway run --port 9000 --verbose 2>&1"

  EXIT_CODE=$?
  echo "[$(date)] Gateway exited with code $EXIT_CODE. Restarting in 10s..."
  sleep 10
done
