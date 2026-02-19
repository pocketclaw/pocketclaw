#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
export PATH="$PREFIX/bin:$PATH"
# API 23 compat shim (provides in6addr_any, __emutls, getgrnam_r, pthread_barrier, etc.)
export LD_PRELOAD="$PREFIX/lib/libapi23compat.so"

# npm-installed openclaw (has dist/ build output)
OPENCLAW_DIR="$PREFIX/lib/node_modules/openclaw"
# Config still in proot rootfs (will migrate later)
OPENCLAW_HOME="$ROOTFS/root/.openclaw"
HIJACK="$ROOTFS/root/hijack.js"

# Wake-lock removed — healthcheck timer in hijack.js keeps WiFi alive
# termux-wake-lock 2>/dev/null

echo "Starting PocketClaw gateway (native node22)..."

while true; do
  echo "[$(date)] Gateway starting..."
  rm -f "$OPENCLAW_HOME/tmp/openclaw/"*.lock 2>/dev/null
  rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
  rm -f "$PREFIX/tmp/openclaw/"*.lock 2>/dev/null

  # Auto-import keys from /sdcard/Download/pocketclaw-env (first setup via adb push)
  DROPFILE="/sdcard/Download/pocketclaw-env"
  if [ -f "$DROPFILE" ]; then
    echo "[$(date)] Importing keys from $DROPFILE..."
    mkdir -p "$OPENCLAW_HOME"
    cp "$DROPFILE" "$OPENCLAW_HOME/env"
    chmod 600 "$OPENCLAW_HOME/env"
    rm -f "$DROPFILE"
    echo "[$(date)] Keys imported and drop file removed."
  fi

  # Source API keys
  if [ -f "$OPENCLAW_HOME/env" ]; then
    . "$OPENCLAW_HOME/env"
    export KIMI_API_KEY MOONSHOT_API_KEY TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN OPENAI_API_KEY GROQ_API_KEY POCKETCLAW_TOKEN
  fi

  # Set env for openclaw
  export HOME="$ROOTFS/root"
  export SHELL="$PREFIX/bin/bash"
  # OPENCLAW_NO_RESPAWN=1 removed: it causes gateway to exit instead of staying alive
  export XDG_RUNTIME_DIR="$PREFIX/tmp"
  export DBUS_SESSION_BUS_ADDRESS=disabled:
  export TMPDIR="$PREFIX/tmp"

  # UV_THREADPOOL_SIZE=1 reduces libuv threads from 4 to 1 (saves thread stacks)
  # NODE_COMPILE_CACHE caches V8 bytecode to disk (faster restarts)
  export UV_THREADPOOL_SIZE=1
  export NODE_COMPILE_CACHE="$PREFIX/tmp/v8-cache"
  mkdir -p "$NODE_COMPILE_CACHE" 2>/dev/null
  export ANDROID_DATA=/data
  export ANDROID_ROOT=/system
  # Heap 150 MB — can't go lower (old space uses ~133 MB steady state, 140 OOMs after ~1h)
  # --initial-old-space-size=32 crashes node22-icu (unsupported flag)
  HEAP=150
  export NODE_OPTIONS="-r $HIJACK --expose-gc --no-warnings --max-old-space-size=$HEAP --max-semi-space-size=1"
  echo "[$(date)] V8 heap: ${HEAP}MB"

  # Run gateway natively — no proot!
  # node22 (no ICU) CANNOT work: OpenClaw uses Unicode regex \p{L} which requires ICU
  node22-icu "$OPENCLAW_DIR/openclaw.mjs" gateway run --port 9000 --verbose 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Gateway exited with code $EXIT_CODE. Restarting in 10s..."
  sleep 10
done
