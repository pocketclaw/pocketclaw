#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw Installer — Local mode v3
# Follows HACKS.md approach: manual proot-distro install from GitHub
# Uses pre-pushed files from /sdcard/pocketclaw/
# Tested on Moto E2 (1GB RAM, Android 6, legacy Termux repos)

set -eE
trap 'echo "ERROR at line $LINENO (exit $?)"' ERR

PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
LOCAL=/sdcard/pocketclaw
LOG="$PREFIX/tmp/pocketclaw-install.log"
# Proot 5.1.0 can't resolve ELF interpreters — must invoke loader explicitly
LOADER=/lib/ld-linux-armhf.so.3

G='\033[0;32m'; O='\033[0;33m'; R='\033[0;31m'; N='\033[0m'; B='\033[1m'

step() { echo -e "\n${G}[$(date +%H:%M:%S)]${N} ${B}$1${N}"; }
ok()   { echo -e "  ${G}✓${N} $1"; }
warn() { echo -e "  ${O}!${N} $1"; }
fail() { echo -e "  ${R}✗${N} $1"; exit 1; }

# Log everything (fresh)
rm -f "$LOG" 2>/dev/null
exec > >(tee -a "$LOG") 2>&1

echo -e "${G}${B}"
echo "  PocketClaw — Local Install v3"
echo -e "${N}"

# Pre-flight
step "Checking environment..."
[ -d "$PREFIX" ] || fail "Not in Termux"
ok "Termux"
[ -d "$LOCAL/scripts" ] || fail "Files not found at $LOCAL/scripts"
ok "Local files found"
[ -f "$LOCAL/proot-distro-master.tar.gz" ] || fail "proot-distro source not found"
ok "proot-distro source"
[ -f "$LOCAL/ubuntu-proot-arm.tar.xz" ] || fail "Ubuntu proot rootfs not found"
ok "Ubuntu proot rootfs (54MB)"
[ -f "$LOCAL/node-v22.12.0-linux-armv7l.tar.xz" ] || fail "Node.js tarball not found"
ok "Node.js tarball"
ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && ok "WiFi" || warn "No WiFi (npm install needs it later)"

MEM_TOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
ok "RAM: ${MEM_TOTAL}MB"

# Step 1: Termux packages (proot binary only, NOT proot-distro from apt)
step "Installing Termux packages..."
apt update -y 2>&1 | tail -3
for p in proot file openssh wget curl; do
  if command -v $p >/dev/null 2>&1; then
    ok "$p (already installed)"
  else
    apt install -y $p 2>&1 | tail -3 && ok "$p" || fail "Failed to install $p"
  fi
done
[ -f "$PREFIX/bin/busybox" ] && ok "busybox (already installed)" || { apt install -y busybox termux-services 2>&1 | tail -3; ok "busybox"; }

# Step 2: Install proot-distro from GitHub (Hack #1)
step "Installing proot-distro from GitHub..."
if command -v proot-distro >/dev/null 2>&1; then
  ok "proot-distro already installed"
else
  cd "$PREFIX/tmp"
  tar xf "$LOCAL/proot-distro-master.tar.gz" 2>/dev/null
  cd proot-distro-master
  # Fix placeholders and install
  sed -e "s|@TERMUX_APP_PACKAGE@|com.termux|g" \
      -e "s|@TERMUX_PREFIX@|$PREFIX|g" \
      -e "s|@TERMUX_HOME@|/data/data/com.termux/files/home|g" \
      ./proot-distro.sh > "$PREFIX/bin/proot-distro"
  chmod 700 "$PREFIX/bin/proot-distro"
  # Install distro plugins
  mkdir -p "$PREFIX/etc/proot-distro"
  cp ./distro-plugins/*.sh "$PREFIX/etc/proot-distro/" 2>/dev/null
  chmod 600 "$PREFIX/etc/proot-distro/"*.sh 2>/dev/null
  cd "$PREFIX/tmp"
  rm -rf proot-distro-master
  ok "proot-distro installed from GitHub"
fi

# Step 3: Extract proot-distro Ubuntu rootfs (pre-configured for proot)
step "Setting up Ubuntu rootfs..."
if [ -d "$ROOTFS/bin" ]; then
  ok "Ubuntu rootfs already exists"
else
  # Clean any partial previous attempt
  rm -rf "$ROOTFS" 2>/dev/null
  mkdir -p "$ROOTFS"
  echo "  Extracting proot-distro rootfs (~54MB compressed)..."
  echo "  (This takes a few minutes on old hardware...)"
  proot --link2symlink tar xf "$LOCAL/ubuntu-proot-arm.tar.xz" --strip-components=1 -C "$ROOTFS" 2>&1 || true
  # mknod errors for /dev/* are expected (proot binds /dev from host)
  [ -d "$ROOTFS/usr/bin" ] || fail "Rootfs extraction failed (no usr/bin)"
  ok "Ubuntu rootfs extracted"

  # Reverse usrmerge for old proot 5.1.107 compatibility
  # Old proot can't resolve symlink chains (/bin -> usr/bin)
  # Fix: move real dirs from /usr/{bin,lib,sbin} to /{bin,lib,sbin}, reverse symlinks
  echo "  Fixing usrmerge for old proot..."
  for d in bin lib sbin; do
    if [ -L "$ROOTFS/$d" ]; then
      rm "$ROOTFS/$d"
      mv "$ROOTFS/usr/$d" "$ROOTFS/$d"
      ln -s "/$d" "$ROOTFS/usr/$d"
    fi
  done
  # Old proot can't follow symlinks for ELF interpreter resolution
  # Replace /lib/ld-linux-armhf.so.3 symlink with actual file
  if [ -L "$ROOTFS/lib/ld-linux-armhf.so.3" ]; then
    TARGET=$(readlink "$ROOTFS/lib/ld-linux-armhf.so.3")
    cp "$ROOTFS/lib/$TARGET" "$ROOTFS/lib/ld-linux-armhf.so.3.tmp"
    rm "$ROOTFS/lib/ld-linux-armhf.so.3"
    mv "$ROOTFS/lib/ld-linux-armhf.so.3.tmp" "$ROOTFS/lib/ld-linux-armhf.so.3"
    chmod 755 "$ROOTFS/lib/ld-linux-armhf.so.3"
  fi
  ok "Usrmerge reversed (proot compat)"

  # Set up DNS
  echo "nameserver 8.8.8.8" > "$ROOTFS/etc/resolv.conf"
  echo "nameserver 8.8.4.4" >> "$ROOTFS/etc/resolv.conf"
  ok "DNS configured"
fi

# Step 4: Node.js 22 (Hack #3)
step "Installing Node.js 22..."
if [ -f "$ROOTFS/usr/local/bin/node" ]; then
  ok "Node.js already installed"
else
  echo "  Extracting Node.js 22 into rootfs..."
  # Extract using Termux tar (supports xz), then copy into rootfs
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
# Use direct proot with explicit loader (proot 5.1.0 can't resolve ELF interpreters)
unset LD_PRELOAD
NODE_TEST=$(proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && node --version 2>&1" 2>&1) || true
echo "  node test: $NODE_TEST"
if echo "$NODE_TEST" | grep -q "^v"; then
  ok "Node.js $NODE_TEST"
else
  fail "Node.js doesn't work inside proot: $NODE_TEST"
fi

# Step 5: OpenClaw
step "Installing OpenClaw..."
OC_CHECK=$(proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && which openclaw 2>/dev/null" 2>/dev/null) || true
if [ -n "$OC_CHECK" ]; then
  ok "OpenClaw already installed"
else
  echo "  Installing via npm (this takes a few minutes)..."
  proot --link2symlink --root-id --rootfs=$ROOTFS \
    --bind=/dev --bind=/proc --bind=/sys \
    --bind=$PREFIX/tmp:/tmp --cwd=/root \
    $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && npm install -g openclaw --ignore-scripts --legacy-peer-deps 2>&1 | tail -5" \
    || fail "OpenClaw install failed"
  ok "OpenClaw installed"
fi

# Step 6: Deploy files
step "Deploying PocketClaw files..."

cp "$LOCAL/scripts/hijack.js" "$ROOTFS/root/hijack.js"
ok "hijack.js"

mkdir -p "$ROOTFS/root/.openclaw"

if [ -f "$LOCAL/config/openclaw.example.json" ] && [ ! -f "$ROOTFS/root/.openclaw/openclaw.json" ]; then
  cp "$LOCAL/config/openclaw.example.json" "$ROOTFS/root/.openclaw/openclaw.json"
  ok "openclaw.json (from example)"
fi

if [ -f "$LOCAL/config/env" ]; then
  cp "$LOCAL/config/env" "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "API keys restored from backup"
else
  echo "# PocketClaw env" > "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "Empty env file"
fi

# Step 7: Scripts
step "Installing scripts..."

HEAP=192
[ "$MEM_TOTAL" -ge 2048 ] && HEAP=384
[ "$MEM_TOTAL" -ge 1024 ] && [ "$MEM_TOTAL" -lt 2048 ] && HEAP=256
ok "V8 heap: ${HEAP}MB"

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
    --bind=/dev --bind=/proc --bind=/sys \\
    --bind=\$PREFIX/tmp:/tmp \\
    --bind=/storage/emulated/0:/sdcard \\
    --cwd=/root \\
    /lib/ld-linux-armhf.so.3 /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \\
      && export HOME=/root && export SHELL=/bin/bash \\
      && export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=$HEAP' \\
      && [ -f /root/.openclaw/env ] && . /root/.openclaw/env \\
      && export KIMI_API_KEY MOONSHOT_API_KEY TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN OPENAI_API_KEY GROQ_API_KEY \\
      && export XDG_RUNTIME_DIR=/tmp && export DBUS_SESSION_BUS_ADDRESS=disabled: \\
      && openclaw gateway run --port 9000 --verbose 2>&1"
  echo "[\$(date)] Gateway exited. Restarting in 10s..."
  sleep 10
done
SCRIPT
chmod 755 "$PREFIX/bin/start-openclaw"
ok "start-openclaw (heap=${HEAP}MB)"

[ -f "$LOCAL/scripts/pocketclaw.sh" ] && cp "$LOCAL/scripts/pocketclaw.sh" "$PREFIX/bin/pocketclaw" && chmod 755 "$PREFIX/bin/pocketclaw" && ok "pocketclaw CLI"

cat > "$PREFIX/bin/restart-gw" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
pkill -9 -f openclaw 2>/dev/null; pkill -9 -f proot 2>/dev/null; sleep 3
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &
echo "PID: $!"
SCRIPT
chmod 755 "$PREFIX/bin/restart-gw"
ok "restart-gw"

cat > "$PREFIX/bin/healthcheck" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
if ! curl -sf --connect-timeout 5 http://localhost:9000/api/status >/dev/null 2>&1; then
  if ! pgrep -f "openclaw" >/dev/null 2>&1; then restart-gw; fi
fi
SCRIPT
chmod 755 "$PREFIX/bin/healthcheck"
ok "healthcheck"

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

# Step 8: Boot script
step "Configuring auto-start..."
mkdir -p ~/.termux/boot
[ -f "$LOCAL/scripts/boot-openclaw.sh" ] && cp "$LOCAL/scripts/boot-openclaw.sh" ~/.termux/boot/start-pocketclaw.sh
chmod 755 ~/.termux/boot/start-pocketclaw.sh
ok "Boot script installed"

CRON_DIR="$PREFIX/var/spool/cron/crontabs"
mkdir -p "$CRON_DIR"
CRONTAB="$CRON_DIR/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/healthcheck" > "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
ok "Crons installed"

# Step 9: Diet
step "Optimizing disk usage..."
for d in usr/share/locale usr/share/doc usr/share/man usr/share/i18n \
         usr/lib/python3* usr/lib/systemd usr/share/perl5 usr/share/info \
         usr/share/bash-completion usr/share/lintian usr/share/polkit-1 \
         usr/share/iso-codes usr/share/xml usr/share/zsh usr/share/gdb \
         usr/share/python* usr/share/gcc usr/share/dbus-1 \
         usr/share/common-licenses usr/share/pixmaps usr/share/sgml \
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
echo -e "  Wait ~2 min then open:"
echo -e "  ${O}http://localhost:9000/setup${N}"
echo ""
echo -e "  Install log: $LOG"
echo ""
