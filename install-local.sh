#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw Installer — Local mode v2
# Uses pre-pushed files from /sdcard/pocketclaw/
# Does NOT require proot-distro (unavailable in legacy Termux repos)
# Instead: manually sets up Ubuntu rootfs with proot

set -eE
trap 'echo "ERROR at line $LINENO (exit $?)"' ERR

PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
LOCAL=/sdcard/pocketclaw
LOG="$PREFIX/tmp/pocketclaw-install.log"

G='\033[0;32m'; O='\033[0;33m'; R='\033[0;31m'; N='\033[0m'; B='\033[1m'

step() { echo -e "\n${G}[$(date +%H:%M:%S)]${N} ${B}$1${N}"; }
ok()   { echo -e "  ${G}✓${N} $1"; }
warn() { echo -e "  ${O}!${N} $1"; }
fail() { echo -e "  ${R}✗${N} $1"; exit 1; }

# Log everything (fresh log)
rm -f "$LOG" 2>/dev/null
exec > >(tee -a "$LOG") 2>&1

echo -e "${G}${B}"
echo "  PocketClaw — Local Install v2"
echo -e "${N}"

# Pre-flight
step "Checking environment..."
[ -d "$PREFIX" ] || fail "Not in Termux"
ok "Termux"
[ -d "$LOCAL/scripts" ] || fail "Files not found at $LOCAL/scripts. Run 'adb push' first."
ok "Local files found"
[ -f "$LOCAL/ubuntu-base-armhf.tar.gz" ] || fail "Ubuntu rootfs not found. Push ubuntu-base-armhf.tar.gz to $LOCAL/"
ok "Ubuntu rootfs tarball"
[ -f "$LOCAL/node-v22.12.0-linux-armv7l.tar.xz" ] || fail "Node.js tarball not found. Push to $LOCAL/"
ok "Node.js tarball"
ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && ok "WiFi" || warn "No WiFi (npm install will need it later)"

MEM_TOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
ok "RAM: ${MEM_TOTAL}MB"

# Step 1: Termux packages (NO proot-distro — not in legacy repo)
step "Installing Termux packages..."
apt update -y 2>&1 | tail -3
for p in proot openssh wget curl; do
  if command -v $p >/dev/null 2>&1; then
    ok "$p (already installed)"
  else
    if apt install -y $p 2>&1 | tail -3; then
      ok "$p"
    else
      fail "Failed to install $p"
    fi
  fi
done

# busybox
if [ -f "$PREFIX/bin/busybox" ]; then
  ok "busybox (already installed)"
else
  apt install -y busybox termux-services 2>&1 | tail -3
  ok "busybox"
fi

# Step 2: Manual Ubuntu rootfs setup (replaces proot-distro install)
step "Setting up Ubuntu rootfs..."
if [ -d "$ROOTFS/bin" ]; then
  ok "Ubuntu rootfs already exists"
else
  mkdir -p "$ROOTFS"
  echo "  Extracting Ubuntu base (~26MB)..."
  # Use proot --link2symlink to handle hard links (Android fs doesn't support them)
  proot --link2symlink tar xzf "$LOCAL/ubuntu-base-armhf.tar.gz" -C "$ROOTFS" 2>&1 || fail "Failed to extract rootfs"
  ok "Ubuntu rootfs extracted"

  # Set up DNS
  echo "nameserver 8.8.8.8" > "$ROOTFS/etc/resolv.conf"
  echo "nameserver 8.8.4.4" >> "$ROOTFS/etc/resolv.conf"
  ok "DNS configured"

  # Set up basic /etc/hosts
  echo "127.0.0.1 localhost" > "$ROOTFS/etc/hosts"
  ok "hosts configured"

  # Create essential dirs
  mkdir -p "$ROOTFS/root" "$ROOTFS/tmp" "$ROOTFS/proc" "$ROOTFS/sys" "$ROOTFS/dev"
  ok "Essential dirs created"
fi

# Step 3: Node.js 22
step "Installing Node.js 22..."
if [ -f "$ROOTFS/usr/local/bin/node" ]; then
  ok "Node.js already installed"
else
  echo "  Extracting Node.js 22 (~25MB)..."
  # Extract Node.js using Termux's tar (supports xz), directly into rootfs
  # Don't use proot for this — Ubuntu's minimal tar may not support xz
  mkdir -p "$PREFIX/tmp/node-extract"
  proot --link2symlink tar xf "$LOCAL/node-v22.12.0-linux-armv7l.tar.xz" -C "$PREFIX/tmp/node-extract" 2>&1 \
    || fail "Failed to extract Node.js"
  cp -r "$PREFIX/tmp/node-extract/node-v22.12.0-linux-armv7l"/* "$ROOTFS/usr/local/" 2>&1 \
    || fail "Failed to copy Node.js to rootfs"
  rm -rf "$PREFIX/tmp/node-extract"
  rm -rf "$ROOTFS/usr/local/include/node/"
  ok "Node.js 22 installed"
fi

# Verify node works inside proot
step "Verifying Node.js..."

# Debug: check rootfs contents
echo "  Checking rootfs..."
ls "$ROOTFS/bin/bash" >/dev/null 2>&1 && ok "/bin/bash exists" || warn "/bin/bash missing"
ls "$ROOTFS/usr/local/bin/node" >/dev/null 2>&1 && ok "node binary exists" || warn "node binary missing"
ls "$ROOTFS/lib/ld-linux-armhf.so.3" >/dev/null 2>&1 && ok "dynamic linker exists" || warn "dynamic linker missing"

echo "  Testing proot bash..."
BASH_TEST=$(proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  /bin/bash -c "echo proot-ok" 2>&1) || true
echo "  proot bash test: $BASH_TEST"

echo "  Testing node..."
NODE_VERSION=$(proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && node --version 2>&1" 2>&1) || true
echo "  node result: $NODE_VERSION"

if echo "$NODE_VERSION" | grep -q "^v"; then
  ok "Node.js $NODE_VERSION"
else
  warn "Node.js may have issues but continuing anyway"
  echo "  (Will verify during OpenClaw install)"
fi

echo "  Testing npm..."
NPM_VERSION=$(proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && npm --version 2>&1" 2>&1) || true
echo "  npm result: $NPM_VERSION"

if echo "$NPM_VERSION" | grep -q "^[0-9]"; then
  ok "npm $NPM_VERSION"
else
  warn "npm may have issues but continuing anyway"
fi

# Step 4: OpenClaw
step "Installing OpenClaw..."
if proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && which openclaw" >/dev/null 2>&1; then
  ok "OpenClaw already installed"
else
  echo "  Installing via npm (this takes a few minutes)..."
  proot --link2symlink --root-id --rootfs=$ROOTFS \
    --bind=/dev --bind=/proc --bind=/sys \
    --bind=$PREFIX/tmp:/tmp --cwd=/root \
    /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && npm install -g openclaw 2>&1 | tail -5" \
    || fail "OpenClaw install failed"
  ok "OpenClaw installed"
fi

# Step 5: Deploy files
step "Deploying PocketClaw files..."

cp "$LOCAL/scripts/hijack.js" "$ROOTFS/root/hijack.js"
ok "hijack.js"

mkdir -p "$ROOTFS/root/.openclaw"

# Config
if [ -f "$LOCAL/config/openclaw.example.json" ] && [ ! -f "$ROOTFS/root/.openclaw/openclaw.json" ]; then
  cp "$LOCAL/config/openclaw.example.json" "$ROOTFS/root/.openclaw/openclaw.json"
  ok "openclaw.json (from example)"
fi

# Env (API keys)
if [ -f "$LOCAL/config/env" ]; then
  cp "$LOCAL/config/env" "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "API keys restored from backup"
else
  echo "# PocketClaw env" > "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "Empty env file"
fi

# Step 6: Scripts
step "Installing scripts..."

HEAP=128
[ "$MEM_TOTAL" -ge 2048 ] && HEAP=384
[ "$MEM_TOTAL" -ge 1024 ] && [ "$MEM_TOTAL" -lt 2048 ] && HEAP=256
ok "V8 heap: ${HEAP}MB"

# start-openclaw
cat > "$PREFIX/bin/start-openclaw" << SCRIPT
#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
export PATH="\$PREFIX/bin:\$PATH"
ROOTFS=\$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=\$PREFIX/tmp

termux-wake-lock 2>/dev/null

echo "Starting PocketClaw gateway..."
while true; do
  echo "[\$(date)] Gateway starting..."
  rm -f "\$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null

  proot \\
    --link2symlink \\
    --kill-on-exit \\
    --root-id \\
    --rootfs=\$ROOTFS \\
    --bind=/dev \\
    --bind=/proc \\
    --bind=/sys \\
    --bind=\$PREFIX/tmp:/tmp \\
    --bind=/storage/emulated/0:/sdcard \\
    --cwd=/root \\
    /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \\
      && export HOME=/root \\
      && export SHELL=/bin/bash \\
      && export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=$HEAP' \\
      && [ -f /root/.openclaw/env ] && . /root/.openclaw/env \\
      && export KIMI_API_KEY MOONSHOT_API_KEY TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN OPENAI_API_KEY GROQ_API_KEY \\
      && export XDG_RUNTIME_DIR=/tmp \\
      && export DBUS_SESSION_BUS_ADDRESS=disabled: \\
      && openclaw gateway run --port 9000 --verbose 2>&1"

  echo "[\$(date)] Gateway exited. Restarting in 10s..."
  sleep 10
done
SCRIPT
chmod 755 "$PREFIX/bin/start-openclaw"
ok "start-openclaw (heap=${HEAP}MB)"

# pocketclaw CLI
if [ -f "$LOCAL/scripts/pocketclaw.sh" ]; then
  cp "$LOCAL/scripts/pocketclaw.sh" "$PREFIX/bin/pocketclaw" && chmod 755 "$PREFIX/bin/pocketclaw"
  ok "pocketclaw CLI"
fi

# restart-gw
cat > "$PREFIX/bin/restart-gw" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
pkill -9 -f openclaw 2>/dev/null
pkill -9 -f proot 2>/dev/null
sleep 3
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &
echo "PID: $!"
SCRIPT
chmod 755 "$PREFIX/bin/restart-gw"
ok "restart-gw"

# healthcheck
cat > "$PREFIX/bin/healthcheck" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
if ! curl -sf --connect-timeout 5 http://localhost:9000/api/status >/dev/null 2>&1; then
  if ! pgrep -f "openclaw" >/dev/null 2>&1; then
    restart-gw
  fi
fi
SCRIPT
chmod 755 "$PREFIX/bin/healthcheck"
ok "healthcheck"

# logrotate
cat > "$PREFIX/bin/logrotate-pc" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
find $PREFIX/tmp/openclaw/ -name "*.log" -mtime +1 -delete 2>/dev/null
LOG=$PREFIX/tmp/openclaw-gateway.log
if [ -f "$LOG" ] && [ $(wc -c < "$LOG") -gt 1048576 ]; then
  tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
SCRIPT
chmod 755 "$PREFIX/bin/logrotate-pc"
ok "logrotate"

# Step 7: Boot script
step "Configuring auto-start..."
mkdir -p ~/.termux/boot
if [ -f "$LOCAL/scripts/boot-openclaw.sh" ]; then
  cp "$LOCAL/scripts/boot-openclaw.sh" ~/.termux/boot/start-pocketclaw.sh
else
  # Inline boot script with WiFi retry
  cat > ~/.termux/boot/start-pocketclaw.sh << 'BOOTSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:$PATH"
LOG="$PREFIX/tmp/pocketclaw-boot.log"
exec >> "$LOG" 2>&1
echo "=== Boot $(date) ==="

termux-wake-lock 2>/dev/null
echo "[$(date)] Wake lock acquired"

# WiFi retry loop
for i in $(seq 1 12); do
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    echo "[$(date)] WiFi ready (attempt $i)"
    break
  fi
  echo "[$(date)] WiFi not ready (attempt $i/12)..."
  sleep 5
done

sshd 2>/dev/null && echo "[$(date)] sshd started" || echo "[$(date)] sshd failed (non-critical)"

nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
echo "[$(date)] Gateway started (PID: $!)"

# Cron
mkdir -p "$PREFIX/var/spool/cron/crontabs"
CRONTAB="$PREFIX/var/spool/cron/crontabs/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/healthcheck" > "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
crond 2>/dev/null && echo "[$(date)] crond started" || echo "[$(date)] crond failed"
echo "=== Boot complete ==="
BOOTSCRIPT
fi
chmod 755 ~/.termux/boot/start-pocketclaw.sh
ok "Boot script installed"

# Crons
CRON_DIR="$PREFIX/var/spool/cron/crontabs"
mkdir -p "$CRON_DIR"
CRONTAB="$CRON_DIR/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/healthcheck" > "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
ok "Crons installed"

# Step 8: Diet (strip bloat from rootfs)
step "Optimizing disk usage..."
for d in usr/share/locale usr/share/doc usr/share/man usr/share/i18n \
         usr/lib/python3.13 usr/lib/python3 usr/lib/systemd \
         usr/lib/arm-linux-gnueabihf/gconv usr/lib/arm-linux-gnueabihf/perl-base \
         usr/lib/arm-linux-gnueabihf/systemd usr/lib/arm-linux-gnueabihf/security \
         usr/share/perl5 usr/share/info usr/share/bash-completion usr/share/lintian \
         usr/share/polkit-1 usr/share/iso-codes usr/share/xml usr/share/zsh \
         usr/share/gdb usr/share/python3 usr/share/python-apt usr/share/gcc \
         usr/share/dbus-1 usr/share/common-licenses usr/share/pixmaps usr/share/sgml \
         usr/lib/polkit-1 usr/lib/girepository-1.0; do
  rm -rf "$ROOTFS/$d" 2>/dev/null
done
ok "Stripped rootfs bloat"

# Start!
step "Starting PocketClaw..."
nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
GW_PID=$!

echo ""
echo -e "${G}${B}============================================${N}"
echo -e "${G}${B}  PocketClaw installed!${N}"
echo -e "${G}${B}============================================${N}"
echo ""
echo -e "  Gateway PID: $GW_PID"
echo -e "  Gateway starting... wait ~2 min then open:"
echo -e "  ${O}http://localhost:9000/setup${N}"
echo ""
echo -e "  Logs: $PREFIX/tmp/openclaw-gateway.log"
echo -e "  Install log: $LOG"
echo ""
