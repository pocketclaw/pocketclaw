#!/data/data/com.termux/files/usr/bin/bash
# kill-dalvik.sh — Kill Termux Dalvik VMs to free ~40-90 MB RAM
# Safe: only kills if gateway is already running in a detached session

PREFIX=/data/data/com.termux/files/usr

# Check gateway is alive first
if ! ps 2>/dev/null | grep -q "openclaw-gateway"; then
  exit 0  # gateway not running, don't kill anything
fi

# Kill com.termux and com.termux.boot Dalvik VMs
for PROC in "com.termux$" "com.termux.boot$"; do
  PID=$(ps 2>/dev/null | grep "$PROC" | grep -v grep | awk '{print $2}')
  if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null
  fi
done
