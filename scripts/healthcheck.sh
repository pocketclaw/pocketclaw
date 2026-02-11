#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw health check — run via cron every 2 minutes
# Checks if the gateway is alive. If not, restarts it.
# Install: echo "*/2 * * * * /data/data/com.termux/files/usr/bin/healthcheck" | crontab -

PREFIX=/data/data/com.termux/files/usr
LOGFILE="$PREFIX/tmp/pocketclaw-healthcheck.log"
PIDFILE="$PREFIX/tmp/pocketclaw-healthcheck.pid"

# Prevent overlapping runs
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0
fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

# Skip check if gateway was recently restarted (give it 5 min to boot on slow devices)
RESTART_MARKER="$PREFIX/tmp/pocketclaw-last-restart"
if [ -f "$RESTART_MARKER" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$RESTART_MARKER" 2>/dev/null || echo 0) ))
  if [ "$AGE" -lt 300 ]; then
    exit 0
  fi
fi

# Check if gateway process exists
if ! pgrep -f "openclaw-gateway" >/dev/null 2>&1 && ! pgrep -f "openclaw gateway run" >/dev/null 2>&1; then
  echo "[$(date)] Gateway process not found. Restarting..." >> "$LOGFILE"
  touch "$RESTART_MARKER"
  restart-gw >> "$LOGFILE" 2>&1
  exit 0
fi

# Check if gateway responds on port 9000 (TCP connect test)
if ! timeout 10 bash -c 'echo > /dev/tcp/127.0.0.1/9000' 2>/dev/null; then
  echo "[$(date)] Gateway not responding on port 9000. Restarting..." >> "$LOGFILE"
  touch "$RESTART_MARKER"
  restart-gw >> "$LOGFILE" 2>&1
  exit 0
fi

# NOTE: GMS kill doesn't work from Termux cron (uid 10001 lacks FORCE_STOP_PACKAGES).
# GMS can only be killed from ADB shell (uid 2000). See start-openclaw.sh for manual commands.

# All good — no output to keep cron quiet
