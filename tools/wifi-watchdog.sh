#!/system/bin/sh
# WiFi Watchdog for PocketClaw
# Runs via crond, detects connectivity loss, resets WiFi
# Must use /system/bin/sh for svc commands (Termux bash can't link system libs)

LOG="/sdcard/pocketclaw/wifi-watchdog.log"
PING_TARGET1="8.8.8.8"
PING_TARGET2="1.1.1.1"
MAX_LOG_LINES=200

# Rotate log if too big
if [ -f "$LOG" ]; then
    LINES=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    if [ "$LINES" -gt "$MAX_LOG_LINES" ]; then
        tail -n 100 "$LOG" > "$LOG.tmp"
        mv "$LOG.tmp" "$LOG"
    fi
fi

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"
}

# Quick connectivity check (2 attempts, 2 targets)
check_net() {
    ping -c 1 -W 3 $PING_TARGET1 >/dev/null 2>&1 && return 0
    ping -c 1 -W 3 $PING_TARGET2 >/dev/null 2>&1 && return 0
    # Second round with longer timeout
    ping -c 1 -W 5 $PING_TARGET1 >/dev/null 2>&1 && return 0
    ping -c 1 -W 5 $PING_TARGET2 >/dev/null 2>&1 && return 0
    return 1
}

# Check if WiFi is even enabled
wifi_enabled() {
    dumpsys wifi 2>/dev/null | grep -q "Wi-Fi is enabled"
}

# Main
if check_net; then
    # All good, silent exit
    exit 0
fi

log "WARN: connectivity lost, starting recovery"

# Attempt 1: quick WiFi toggle (10s off)
log "Attempt 1: svc wifi disable (10s)"
svc wifi disable
sleep 10
svc wifi enable
sleep 15

if check_net; then
    log "OK: recovered after WiFi toggle (attempt 1)"
    exit 0
fi

# Attempt 2: longer WiFi toggle (20s off)
log "Attempt 2: svc wifi disable (20s)"
svc wifi disable
sleep 20
svc wifi enable
sleep 20

if check_net; then
    log "OK: recovered after WiFi toggle (attempt 2)"
    exit 0
fi

# Attempt 3: double toggle (full reset)
log "Attempt 3: double toggle"
svc wifi disable
sleep 5
svc wifi enable
sleep 5
svc wifi disable
sleep 15
svc wifi enable
sleep 25

if check_net; then
    log "OK: recovered after double toggle (attempt 3)"
    exit 0
fi

log "FAIL: all recovery attempts failed, WiFi may need manual intervention"
