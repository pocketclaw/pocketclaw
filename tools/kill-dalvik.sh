#!/data/data/com.termux/files/usr/bin/bash
# kill-dalvik.sh — Kill Termux:Boot Dalvik VM to free ~40 MB RAM
# Only kills com.termux.boot (NOT com.termux — cgroup kill cascades to gateway).
#
# MUST use /system/bin/ps (shows all processes including Dalvik VMs).

PS=/system/bin/ps

# Check gateway is alive first
if ! $PS 2>/dev/null | grep -q "openclaw-gateway"; then
  exit 0
fi

# Kill com.termux.boot only (separate package, safe to kill, ~40 MB)
$PS 2>/dev/null | grep "com.termux.boot$" | grep -v grep | while read _USER PID _REST; do
  kill -9 $PID 2>/dev/null
done
