#!/data/data/com.termux/files/usr/bin/bash
# Fix git + reinstall OpenClaw following HACKS.md (Hacks #5, #6, #7, #8, #9, #19)
# Then deploy scripts, create stubs, configure crons, start gateway.
# Follows the same sequence as install-local.sh steps 5-9.
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
LOADER=/lib/ld-linux-armhf.so.3
LOG=$PREFIX/tmp/fix-install.log
LOCAL=/sdcard/pocketclaw

G='\033[0;32m'; R='\033[0;31m'; N='\033[0m'; B='\033[1m'
ok()   { echo -e "  ${G}✓${N} $1"; }
fail() { echo -e "  ${R}✗${N} $1"; exit 1; }

rm -f "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo -e "${G}${B}  PocketClaw — Fix & Install${N}"

# Step 1: Install git in Termux (Hack #5 dependency)
echo -e "\n${B}Installing git in Termux...${N}"
command -v git >/dev/null 2>&1 && ok "git already installed" || {
  apt install -y git 2>&1 | tail -3 && ok "git installed" || fail "git install failed"
}

# Step 2: Git wrapper inside proot (Hack #5 + #6)
# Rewrites SSH/git+ssh URLs to HTTPS (npm uses SSH for git deps like libsignal-node)
# Termux binaries need /system bound for Android linker
echo -e "\n${B}Creating git wrapper (Hack #5+6)...${N}"
cat > "$ROOTFS/usr/local/bin/git" << 'WRAPPER'
#!/bin/bash
# Hack #5+6 — Git Wrapper Bridge + SSH→HTTPS URL Rewriter
# Force HTTPS (no SSH in proot)
ARGS=$(echo "$@" | sed 's|git+ssh://git@github.com|https://github.com|g; s|ssh://git@github.com|https://github.com|g; s|git@github.com:|https://github.com/|g')
TERMUX_PREFIX=/data/data/com.termux/files/usr
export LD_LIBRARY_PATH=$TERMUX_PREFIX/lib
exec $TERMUX_PREFIX/bin/git $ARGS
WRAPPER
chmod 755 "$ROOTFS/usr/local/bin/git"
ok "git wrapper with SSH→HTTPS rewrite"

# Step 3: npm cache in rootfs (not SD — FAT32 breaks git object writes)
echo -e "\n${B}Configuring npm cache...${N}"
mkdir -p "$ROOTFS/root/.npm-cache"
ok "npm cache dir in rootfs"

# Step 4: Install OpenClaw (Hack #7 + #9)
echo -e "\n${B}Installing OpenClaw via npm...${N}"
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp
proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  --bind=$PREFIX/tmp:/tmp \
  --bind=$PREFIX:$PREFIX \
  --bind=/system:/system \
  --bind=/storage/emulated/0:/sdcard \
  --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && export HOME=/root && npm config set cache /root/.npm-cache && npm install -g openclaw --ignore-scripts --legacy-peer-deps 2>&1" \
  && ok "OpenClaw installed" || fail "OpenClaw install failed"

# Step 5: Verify OpenClaw
echo -e "\n${B}Verifying OpenClaw...${N}"
OC_CHECK=$(proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  --bind=$PREFIX/tmp:/tmp \
  --bind=$PREFIX:$PREFIX \
  --bind=/system:/system \
  --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && which openclaw 2>/dev/null && openclaw --version 2>/dev/null" 2>/dev/null) || true
if [ -n "$OC_CHECK" ]; then
  ok "OpenClaw: $OC_CHECK"
else
  # Check if binary exists directly
  if [ -f "$ROOTFS/usr/local/bin/openclaw" ]; then
    ok "OpenClaw binary exists at /usr/local/bin/openclaw"
  else
    echo "  ! OpenClaw binary not at expected path (continuing anyway — npm install succeeded)"
    ls "$ROOTFS/usr/local/bin/" 2>&1 | head -20
  fi
fi

# Step 6: ESM stubs (Hack #19) — saves ~262MB disk + 40MB RAM
# IMPORTANT: stubs must be at HOST $PREFIX path, not $ROOTFS path
# (--bind=$PREFIX:$PREFIX shadows rootfs stubs with real packages)
echo -e "\n${B}Creating ESM stubs (Hack #19)...${N}"
if [ -f "$LOCAL/tools/fix-stubs.sh" ]; then
  bash "$LOCAL/tools/fix-stubs.sh" && ok "ESM stubs created (HOST path)" || fail "fix-stubs.sh failed"
elif [ -f "$LOCAL/scripts/create-stubs.sh" ]; then
  bash "$LOCAL/scripts/create-stubs.sh" && ok "ESM stubs created" || fail "create-stubs.sh failed"
else
  fail "No stub script found"
fi

# Step 7: Deploy files
echo -e "\n${B}Deploying PocketClaw files...${N}"

# hijack.js
[ -f "$LOCAL/scripts/hijack.js" ] && cp "$LOCAL/scripts/hijack.js" "$ROOTFS/root/hijack.js" && ok "hijack.js"

# Config
mkdir -p "$ROOTFS/root/.openclaw"
[ -f "$LOCAL/config/openclaw.example.json" ] && [ ! -f "$ROOTFS/root/.openclaw/openclaw.json" ] && \
  cp "$LOCAL/config/openclaw.example.json" "$ROOTFS/root/.openclaw/openclaw.json" && ok "openclaw.json"
if [ -f "$LOCAL/config/env" ]; then
  cp "$LOCAL/config/env" "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "API keys restored"
else
  echo "# PocketClaw env" > "$ROOTFS/root/.openclaw/env"
  chmod 600 "$ROOTFS/root/.openclaw/env"
  ok "Empty env file (add keys later)"
fi

# Step 8: Install scripts (from install-local.sh step 7)
echo -e "\n${B}Installing scripts...${N}"

MEM_TOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
HEAP=192
[ "$MEM_TOTAL" -ge 2048 ] && HEAP=384
[ "$MEM_TOTAL" -ge 1024 ] && [ "$MEM_TOTAL" -lt 2048 ] && HEAP=256
ok "V8 heap: ${HEAP}MB (RAM: ${MEM_TOTAL}MB)"

# start-openclaw: generate with explicit loader (proot 5.1.0)
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
    --bind=\$PREFIX:\$PREFIX \\
    --bind=/system:/system \\
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
ok "start-openclaw (heap=${HEAP}MB, explicit loader)"

# pocketclaw CLI
[ -f "$LOCAL/scripts/pocketclaw.sh" ] && cp "$LOCAL/scripts/pocketclaw.sh" "$PREFIX/bin/pocketclaw" && chmod 755 "$PREFIX/bin/pocketclaw" && ok "pocketclaw CLI"

# restart-gw
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

# healthcheck
cat > "$PREFIX/bin/healthcheck" << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
if ! curl -sf --connect-timeout 5 http://localhost:9000/api/status >/dev/null 2>&1; then
  if ! pgrep -f "openclaw" >/dev/null 2>&1; then restart-gw; fi
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

# Step 9: Boot + crons (from install-local.sh step 8)
echo -e "\n${B}Configuring auto-start...${N}"
mkdir -p ~/.termux/boot
[ -f "$LOCAL/scripts/boot-openclaw.sh" ] && cp "$LOCAL/scripts/boot-openclaw.sh" ~/.termux/boot/start-pocketclaw.sh && chmod 755 ~/.termux/boot/start-pocketclaw.sh && ok "Boot script"

CRON_DIR="$PREFIX/var/spool/cron/crontabs"
mkdir -p "$CRON_DIR"
CRONTAB="$CRON_DIR/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/healthcheck" > "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
ok "Crons installed"

# Step 10: Start gateway
echo -e "\n${B}Starting gateway...${N}"
nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
GW_PID=$!

echo ""
echo -e "${G}${B}============================================${N}"
echo -e "${G}${B}  PocketClaw installed!${N}"
echo -e "${G}${B}============================================${N}"
echo ""
echo -e "  Gateway PID: $GW_PID"
echo -e "  Wait ~2 min then open:"
echo -e "  http://localhost:9000/setup"
echo ""
rm -f ~/.bash_profile
