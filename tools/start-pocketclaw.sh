#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot auto-start script for PocketClaw
# Install: cp start-pocketclaw.sh ~/.termux/boot/start-pocketclaw.sh

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

# Start SSH server
if sshd 2>/dev/null; then
  log "sshd started"
else
  log "WARNING: sshd failed to start"
fi

# Install cron jobs (healthcheck every 2 min, log rotation every hour)
CRON_DIR="$PREFIX/var/spool/cron/crontabs"
mkdir -p "$CRON_DIR"
CRONTAB="$CRON_DIR/$(whoami)"
echo "*/2 * * * * $PREFIX/bin/wifi-watchdog" > "$CRONTAB"
echo "*/2 * * * * $PREFIX/bin/healthcheck" >> "$CRONTAB"
echo "0 * * * * $PREFIX/bin/logrotate-pc" >> "$CRONTAB"
log "Crons installed"

# Start cron daemon
if [ -f "$PREFIX/bin/applets/crond" ]; then
  $PREFIX/bin/applets/crond -b -c "$CRON_DIR" 2>/dev/null
  log "crond started (busybox)"
else
  crond 2>/dev/null && log "crond started" || log "WARNING: crond not found"
fi

# Start the hardware monitor
nohup monitor </dev/null >/dev/null 2>&1 &
log "monitor started (PID $!)"

# Start the gateway
nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
log "Gateway started (PID $!)"

# Wait for gateway to be up
sleep 30

# Kill SystemUI (uninstalled but may respawn as zombie)
(while true; do am force-stop com.android.systemui 2>/dev/null; sleep 60; done) &
log "SystemUI killer started (PID $!)"

# NOTE: Do NOT force-stop com.termux.boot — it sets the "stopped" flag
# which prevents BOOT_COMPLETED broadcast on next reboot = bot won't auto-start

# Kill dormant services (first pass)
am force-stop com.android.settings 2>/dev/null
am force-stop com.android.keychain 2>/dev/null
am force-stop com.android.externalstorage 2>/dev/null
am force-stop com.android.defcontainer 2>/dev/null
am force-stop com.android.providers.downloads 2>/dev/null
am force-stop com.android.providers.downloads.ui 2>/dev/null
am force-stop com.google.android.packageinstaller 2>/dev/null
am force-stop com.google.android.webview 2>/dev/null
am force-stop com.motorola.android.providers.settings 2>/dev/null
log "Dormant services force-stopped (9 packages)"

# Repeat dormant kills every 5 min (they respawn)
(while true; do
  sleep 300
  am force-stop com.android.settings 2>/dev/null
  am force-stop com.android.keychain 2>/dev/null
  am force-stop com.android.externalstorage 2>/dev/null
done) &
log "Dormant killer loop started (PID $!)"

log "=== BOOT COMPLETE ==="
