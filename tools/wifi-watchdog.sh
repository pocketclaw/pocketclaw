#!/system/bin/sh
# WiFi Watchdog v2 for PocketClaw
# Runs via crond every 2 min. Uses escalating recovery with backoff.
# Must use /system/bin/sh for svc commands

LOG="/sdcard/pocketclaw/wifi-watchdog.log"
FAIL_COUNT_FILE="/data/data/com.termux/files/usr/tmp/wifi-fail-count"
PING1="8.8.8.8"
PING2="1.1.1.1"
MAX_LOG_LINES=200

# Rotate log
if [ -f "$LOG" ]; then
    LINES=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    [ "$LINES" -gt "$MAX_LOG_LINES" ] && { tail -n 100 "$LOG" > "$LOG.tmp"; mv "$LOG.tmp" "$LOG"; }
fi

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }

check_net() {
    ping -c 1 -W 3 $PING1 >/dev/null 2>&1 && return 0
    ping -c 1 -W 3 $PING2 >/dev/null 2>&1 && return 0
    ping -c 1 -W 5 $PING1 >/dev/null 2>&1 && return 0
    return 1
}

# All good — reset fail counter, silent exit
if check_net; then
    [ -f "$FAIL_COUNT_FILE" ] && rm -f "$FAIL_COUNT_FILE"
    exit 0
fi

# Read fail counter (backoff: after 3 consecutive failures, skip runs)
FAILS=0
[ -f "$FAIL_COUNT_FILE" ] && FAILS=$(cat "$FAIL_COUNT_FILE" 2>/dev/null || echo 0)

# Backoff: after 3 failures, only try every 10 min (skip 4 out of 5 cron runs)
if [ "$FAILS" -ge 3 ]; then
    # Only attempt recovery 1 out of 5 runs (~10 min interval)
    SKIP=$(( FAILS % 5 ))
    if [ "$SKIP" -ne 0 ]; then
        echo $(( FAILS + 1 )) > "$FAIL_COUNT_FILE"
        exit 0
    fi
    log "RETRY: attempt after backoff ($FAILS consecutive failures)"
fi

log "WARN: connectivity lost (fail #$((FAILS + 1)))"

# === Attempt 1: Wait and retry (transient drops recover in 10-15s) ===
log "A1: wait 10s"
sleep 10
if check_net; then
    log "OK: transient drop recovered"
    rm -f "$FAIL_COUNT_FILE"
    exit 0
fi

# === Attempt 2: Quick WiFi toggle (3s off) ===
log "A2: svc wifi toggle (3s)"
svc wifi disable 2>/dev/null
sleep 3
svc wifi enable 2>/dev/null
sleep 15
if check_net; then
    log "OK: quick toggle recovered"
    rm -f "$FAIL_COUNT_FILE"
    exit 0
fi

# === Attempt 3: Longer WiFi toggle (15s off, full driver reset) ===
log "A3: svc wifi toggle (15s)"
svc wifi disable 2>/dev/null
sleep 15
svc wifi enable 2>/dev/null
sleep 20
if check_net; then
    log "OK: long toggle recovered"
    rm -f "$FAIL_COUNT_FILE"
    exit 0
fi

# All failed — increment counter, enter backoff
FAILS=$(( FAILS + 1 ))
echo "$FAILS" > "$FAIL_COUNT_FILE"
log "FAIL: all attempts failed (consecutive: $FAILS, next retry in ~10min)"
