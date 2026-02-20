#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# PocketClaw OS Installer
# Transforms an old Android phone into an AI agent
#
# Usage (from Termux):
#   curl -sL https://raw.githubusercontent.com/pocketclaw/pocketclaw/main/install.sh | bash
#
# Requires: Android 5+, Termux, WiFi connection
# Tested on: Moto E2 (1GB RAM, Android 6)
# ============================================================

set -e

PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
REPO="https://raw.githubusercontent.com/pocketclaw/pocketclaw/main"

G='\033[0;32m'  # green
O='\033[0;33m'  # orange
R='\033[0;31m'  # red
N='\033[0m'     # reset
B='\033[1m'     # bold

banner() {
  echo ""
  echo -e "${G}${B}"
  echo "  ____            _        _    ____ _"
  echo " |  _ \\ ___   ___| | _____| |_ / ___| | __ ___      __"
  echo " | |_) / _ \\ / __| |/ / _ \\ __| |   | |/ _\` \\ \\ /\\ / /"
  echo " |  __/ (_) | (__|   <  __/ |_| |___| | (_| |\\ V  V /"
  echo " |_|   \\___/ \\___|_|\\_\\___|\\__|\\____|_|\\__,_| \\_/\\_/"
  echo -e "${N}"
  echo -e "  ${O}Turn any old phone into an AI agent${N}"
  echo ""
}

step() { echo -e "\n${G}[$(date +%H:%M:%S)]${N} ${B}$1${N}"; }
ok()   { echo -e "  ${G}✓${N} $1"; }
warn() { echo -e "  ${O}!${N} $1"; }
fail() { echo -e "  ${R}✗${N} $1"; exit 1; }

banner

# -----------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------
step "Checking environment..."

if [ ! -d "$PREFIX" ]; then
  fail "Not running in Termux. Install Termux from F-Droid first."
fi
ok "Termux detected"

# Check storage permission
if [ ! -d /storage/emulated/0 ] || [ ! -r /storage/emulated/0 ]; then
  warn "Storage permission not granted. Run: termux-setup-storage"
fi

# Check WiFi
if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
  ok "WiFi connected"
else
  fail "No internet. Connect to WiFi first."
fi

# RAM check
MEM_TOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
if [ "$MEM_TOTAL" -lt 512 ]; then
  fail "Only ${MEM_TOTAL}MB RAM. Minimum 512MB required."
elif [ "$MEM_TOTAL" -lt 1024 ]; then
  warn "Low RAM (${MEM_TOTAL}MB). Will use aggressive memory settings."
fi
ok "RAM: ${MEM_TOTAL}MB"

# Disk check
DISK_AVAIL=$(stat -f /data 2>/dev/null | grep "Available" | grep -o 'Available: [0-9]*' | grep -o '[0-9]*')
DISK_BSIZE=$(stat -f /data 2>/dev/null | grep "Block size" | grep -o 'Block size: [0-9]*' | grep -o '[0-9]*')
if [ -n "$DISK_AVAIL" ] && [ -n "$DISK_BSIZE" ]; then
  DISK_MB=$(( DISK_AVAIL * DISK_BSIZE / 1024 / 1024 ))
  if [ "$DISK_MB" -lt 800 ]; then
    warn "Low disk (${DISK_MB}MB free). Need ~700MB for install."
  fi
  ok "Disk: ${DISK_MB}MB free"
fi

# -----------------------------------------------------------
# Step 1: Install Termux packages
# -----------------------------------------------------------
step "Installing Termux packages..."

pkg update -y 2>&1 | tail -1
for p in proot-distro openssh wget curl; do
  if ! command -v $p >/dev/null 2>&1; then
    pkg install -y $p 2>&1 | tail -1
    ok "Installed $p"
  else
    ok "$p already installed"
  fi
done

# busybox for cron
if [ ! -f "$PREFIX/bin/applets/crond" ]; then
  pkg install -y busybox termux-services 2>&1 | tail -1
  ok "Installed busybox (cron)"
else
  ok "busybox already installed"
fi

# -----------------------------------------------------------
# Step 2: Install proot Ubuntu
# -----------------------------------------------------------
step "Setting up proot Linux environment..."

if [ -d "$ROOTFS" ]; then
  ok "Ubuntu proot already installed"
else
  proot-distro install ubuntu 2>&1 | tail -5
  ok "Ubuntu proot installed"
fi

# -----------------------------------------------------------
# Step 3: Install Node.js in proot
# -----------------------------------------------------------
step "Installing Node.js 22..."

# Check if node exists in proot
if [ -f "$ROOTFS/usr/local/bin/node" ]; then
  NODE_VER=$($ROOTFS/usr/local/bin/node --version 2>/dev/null || echo "unknown")
  ok "Node.js $NODE_VER already installed"
else
  # Detect architecture
  ARCH=$(uname -m)
  case "$ARCH" in
    armv7l|armv7a) NODE_ARCH="armv7l" ;;
    aarch64)       NODE_ARCH="arm64" ;;
    x86_64)        NODE_ARCH="x64" ;;
    *)             fail "Unsupported architecture: $ARCH" ;;
  esac

  NODE_URL="https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-${NODE_ARCH}.tar.xz"
  echo "  Downloading Node.js for $NODE_ARCH..."
  wget -q "$NODE_URL" -O /tmp/node.tar.xz || fail "Download failed"

  echo "  Extracting..."
  proot --link2symlink --root-id --rootfs=$ROOTFS /bin/bash -c \
    "cd /tmp && tar xf /tmp/node.tar.xz && cp -r node-v22.12.0-linux-${NODE_ARCH}/* /usr/local/ && rm -rf node-v22.12.0-linux-*" 2>/dev/null
  rm -f /tmp/node.tar.xz

  # Diet: remove headers (65 MB)
  rm -rf "$ROOTFS/usr/local/include/node/"
  ok "Node.js 22 installed (headers removed to save 65MB)"
fi

# -----------------------------------------------------------
# Step 4: Install OpenClaw
# -----------------------------------------------------------
step "Installing OpenClaw..."

if [ -f "$ROOTFS/data/data/com.termux/files/usr/bin/openclaw" ] || \
   [ -f "$ROOTFS/usr/local/bin/openclaw" ]; then
  ok "OpenClaw already installed"
else
  proot --link2symlink --root-id --rootfs=$ROOTFS \
    --bind=/dev --bind=/proc --bind=/sys \
    --bind=$PREFIX/tmp:/tmp --cwd=/root \
    /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && npm install -g openclaw 2>&1 | tail -3"
  ok "OpenClaw installed"
fi

# -----------------------------------------------------------
# Step 5: Deploy PocketClaw files
# -----------------------------------------------------------
step "Deploying PocketClaw..."

# hijack.js
echo "  Downloading hijack.js..."
wget -q "$REPO/scripts/hijack.js" -O "$ROOTFS/root/hijack.js"
ok "hijack.js (dashboard + setup wizard)"

# Create .openclaw dir
mkdir -p "$ROOTFS/root/.openclaw"

# Minimal config (setup wizard will complete it)
if [ ! -f "$ROOTFS/root/.openclaw/openclaw.json" ]; then
  cat > "$ROOTFS/root/.openclaw/openclaw.json" << 'CONF'
{
  "gateway": { "port": 9000, "mode": "local" },
  "commands": { "native": "auto", "nativeSkills": "auto" },
  "plugins": { "entries": {} },
  "channels": {},
  "models": { "providers": {} },
  "agents": { "defaults": { "model": { "primary": "", "fallbacks": [] }, "maxConcurrent": 1 } }
}
CONF
  ok "Minimal config created (complete setup at /setup)"
else
  ok "Config already exists"
fi

# Empty env file
if [ ! -f "$ROOTFS/root/.openclaw/env" ]; then
  echo "# PocketClaw env — filled by setup wizard" > "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "Env file created"
fi

# -----------------------------------------------------------
# Step 6: Deploy Termux scripts
# -----------------------------------------------------------
step "Installing scripts..."

# Determine heap size based on RAM
if [ "$MEM_TOTAL" -lt 1024 ]; then
  HEAP=170
elif [ "$MEM_TOTAL" -lt 2048 ]; then
  HEAP=256
else
  HEAP=384
fi
ok "V8 heap: ${HEAP}MB (based on ${MEM_TOTAL}MB RAM)"

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
echo "Port: 9000 | Setup: http://localhost:9000/setup"

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
    --cwd=/root \\
    /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \\
      && export HOME=/root \\
      && export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=$HEAP' \\
      && [ -f /root/.openclaw/env ] && . /root/.openclaw/env \\
      && export KIMI_API_KEY MOONSHOT_API_KEY TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN OPENAI_API_KEY GROQ_API_KEY \\
      && export XDG_RUNTIME_DIR=/tmp \\
      && export DBUS_SESSION_BUS_ADDRESS=disabled: \\
      && openclaw gateway run --port 9000 --verbose 2>&1"

  EXIT_CODE=\$?
  echo "[\$(date)] Gateway exited (\$EXIT_CODE). Restarting in 10s..."
  sleep 10
done
SCRIPT
chmod 755 "$PREFIX/bin/start-openclaw"
ok "start-openclaw"

# restart-gw
cat > "$PREFIX/bin/restart-gw" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
pkill -9 -f openclaw 2>/dev/null
pkill -9 -f proot 2>/dev/null
sleep 3
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
echo "Starting gateway..."
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &
echo "PID: $!"
SCRIPT
chmod 755 "$PREFIX/bin/restart-gw"
ok "restart-gw"

# healthcheck
cat > "$PREFIX/bin/healthcheck" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
if ! curl -sf --connect-timeout 5 http://localhost:9000/api/status >/dev/null 2>&1; then
  if pgrep -f "openclaw" >/dev/null 2>&1; then
    echo "[healthcheck] Gateway not responding, restarting..."
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

# pocketclaw CLI
echo "  Downloading pocketclaw CLI..."
wget -q "$REPO/scripts/pocketclaw.sh" -O "$PREFIX/bin/pocketclaw"
chmod 755 "$PREFIX/bin/pocketclaw"
ok "pocketclaw CLI"

# -----------------------------------------------------------
# Step 7: Boot script (auto-start on phone boot)
# -----------------------------------------------------------
step "Configuring auto-start..."

mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-pocketclaw.sh << 'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
PREFIX=/data/data/com.termux/files/usr
LOGFILE="$PREFIX/tmp/pocketclaw-boot.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"; }

log "=== BOOT START ==="

# Wait for WiFi with retry (check every 5s, up to 60s)
WIFI_READY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    WIFI_READY=1
    log "WiFi ready after $((i * 5))s"
    break
  fi
  log "WiFi not ready, attempt $i/12..."
  sleep 5
done

if [ "$WIFI_READY" -eq 0 ]; then
  log "WARNING: WiFi not ready after 60s, continuing anyway"
fi

# Start sshd
if sshd 2>/dev/null; then
  log "sshd started"
else
  log "WARNING: sshd failed to start"
fi

# Start crons
CRON_DIR="$PREFIX/var/spool/cron/crontabs"
mkdir -p "$CRON_DIR"
CRONTAB="$CRON_DIR/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/healthcheck" > "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
log "Crons installed"

if [ -f "$PREFIX/bin/applets/crond" ]; then
  $PREFIX/bin/applets/crond -b -c "$CRON_DIR" 2>/dev/null
  log "crond started (busybox)"
else
  crond 2>/dev/null && log "crond started" || log "WARNING: crond not found"
fi

# Start monitor
nohup monitor </dev/null >/dev/null 2>&1 &
log "monitor started (PID $!)"

# Start gateway
nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
log "Gateway started (PID $!)"

log "=== BOOT COMPLETE ==="
BOOT
chmod 755 ~/.termux/boot/start-pocketclaw.sh
ok "Auto-start on boot configured"

# Install crons
CRON_DIR="$PREFIX/var/spool/cron/crontabs"
mkdir -p "$CRON_DIR"
CRONTAB="$CRON_DIR/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/healthcheck" > "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
ok "Crons: healthcheck (2min), logrotate (1hr)"

# -----------------------------------------------------------
# Step 8: Diet — strip proot bloat
# -----------------------------------------------------------
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
ok "Stripped ~200MB of unused system files"

# -----------------------------------------------------------
# Done!
# -----------------------------------------------------------
step "Starting PocketClaw..."

nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
GW_PID=$!

echo ""
echo -e "${G}${B}============================================${N}"
echo -e "${G}${B}  PocketClaw installed successfully!${N}"
echo -e "${G}${B}============================================${N}"
echo ""
echo -e "  Gateway starting (PID: $GW_PID)..."
echo -e "  Wait ~2 minutes for first boot, then open:"
echo ""
echo -e "  ${O}${B}http://localhost:9000/setup${N}"
echo ""
echo -e "  to configure your AI provider and channel."
echo ""
echo -e "  Commands:"
echo -e "    ${G}pocketclaw status${N}   — System stats"
echo -e "    ${G}pocketclaw restart${N}  — Restart gateway"
echo -e "    ${G}pocketclaw logs${N}     — View logs"
echo ""
echo -e "  ${O}From another device on the same WiFi:${N}"
echo -e "  Open http://$(ip addr show wlan0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1):9000/setup"
echo ""
