#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:$PATH"
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp

# API keys are loaded inside proot from /root/.openclaw/env
# NOT passed via command line (visible in ps output = security risk)

termux-wake-lock 2>/dev/null

# NOTE: am force-stop does NOT work from Termux (uid 10001 lacks FORCE_STOP_PACKAGES).
# Process kills only work from ADB shell (uid 2000). Run manually when USB connected:
#   adb shell am force-stop com.google.android.gms       # -270 MB (static IP keeps route)
#   adb shell am force-stop com.termux.boot               # -90 MB
#   adb shell am force-stop com.android.providers.contacts # -43 MB
#   adb shell am force-stop com.android.providers.media    # -41 MB
#   adb shell am force-stop com.google.android.webview     # -41 MB
# The 28 pm-uninstalled packages are the real permanent gain (persist across reboots).

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
