#!/data/data/com.termux/files/usr/bin/bash
# kill-dalvik.sh — Kill Termux:Boot Dalvik VM to free ~40 MB RAM
# Safe: only kills com.termux.boot (not com.termux itself).
#
# WHY NOT kill com.termux?
# Android's AMS uses cgroups: killing com.termux Dalvik cascade-kills ALL
# processes in its cgroup (gateway, crond, bash — everything). The gateway
# cannot survive this. Only an external restart (via ADB) can recover.
# com.termux.boot is a SEPARATE package so killing it is safe.
#
# MUST use /system/bin/ps (shows all processes including Dalvik VMs).
# Termux's ps (procps) without flags only shows current-TTY processes.

PS=/system/bin/ps

# Check gateway is alive first (OpenClaw sets process.title = "openclaw-gateway")
if ! $PS 2>/dev/null | grep -q "openclaw-gateway"; then
  exit 0  # gateway not running, don't kill anything
fi

# Kill com.termux.boot Dalvik only (safe — separate package, ~40 MB)
# /system/bin/ps format: USER PID PPID VSIZE RSS WCHAN PC NAME
$PS 2>/dev/null | grep "com.termux.boot$" | grep -v grep | while read _USER PID _REST; do
  kill -9 $PID 2>/dev/null
done
