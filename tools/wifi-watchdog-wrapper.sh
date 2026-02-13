#!/data/data/com.termux/files/usr/bin/bash
# Wrapper for wifi-watchdog.sh — handles lock file to prevent overlapping runs
LOCK=/data/data/com.termux/files/usr/tmp/wifi-watchdog.lock

if [ -f "$LOCK" ]; then
  LOCK_AGE=$(( $(date +%s) - $(cat "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -lt 300 ]; then
    exit 0
  fi
fi

echo $(date +%s) > "$LOCK"
/system/bin/sh /sdcard/pocketclaw/tools/wifi-watchdog.sh
rm -f "$LOCK"
