#!/system/bin/sh
# PocketClaw RAM optimizer — run from ADB after boot.
# Relaunches gateway outside Termux cgroup, then kills Termux Dalvik processes.
# Uses kill -9 (NOT am force-stop) to preserve BOOT_COMPLETED for next reboot.
#
# Usage: adb shell sh /data/local/tmp/optimize-ram.sh

PREFIX=/data/data/com.termux/files/usr
LOGPFX="[optimize]"

echo "$LOGPFX Starting RAM optimization..."

# Step 1: Kill existing gateway (if running inside Termux cgroup)
OLD_GW=$(ps | grep openclaw-gateway | grep -v grep | awk '{print $2}')
if [ -n "$OLD_GW" ]; then
    echo "$LOGPFX Killing old gateway (PID $OLD_GW, inside Termux cgroup)..."
    # Kill via run-as (same UID) since adb shell can't kill u0_a96
    run-as com.termux kill -9 $OLD_GW 2>/dev/null
    # Also kill proot parents
    for pid in $(ps | grep -E 'proot|ld-linux' | grep -v grep | awk '{print $2}'); do
        run-as com.termux kill -9 $pid 2>/dev/null
    done
    # Kill start-openclaw bash loops
    for pid in $(ps | grep '/data/data/com.termux/files/usr/bin/bash' | grep -v grep | awk '{print $2}'); do
        PPID=$(ps | grep "^[^ ]* *$pid " | awk '{print $3}')
        # Only kill bash with PPID 1 (daemonized start-openclaw loops)
        if [ "$PPID" = "1" ]; then
            run-as com.termux kill -9 $pid 2>/dev/null
        fi
    done
    sleep 3
    echo "$LOGPFX Old gateway killed."
else
    echo "$LOGPFX No existing gateway found."
fi

# Step 2: Launch gateway via run-as (outside Termux cgroup)
echo "$LOGPFX Launching gateway outside Termux cgroup..."
run-as com.termux sh -c "export LD_LIBRARY_PATH=$PREFIX/lib; export PATH=$PREFIX/bin:\$PATH; nohup start-openclaw > /dev/null 2>&1 &"
echo "$LOGPFX Gateway starting, waiting 20s for load..."
sleep 20

# Verify gateway is up
NEW_GW=$(ps | grep openclaw-gateway | grep -v grep | awk '{print $2}')
if [ -z "$NEW_GW" ]; then
    # Maybe still loading, check for openclaw (without -gateway suffix)
    NEW_GW=$(ps | grep 'openclaw' | grep -v grep | grep -v gateway | awk '{print $2}')
    if [ -z "$NEW_GW" ]; then
        echo "$LOGPFX ERROR: Gateway failed to start!"
        exit 1
    fi
    echo "$LOGPFX Gateway still loading (PID $NEW_GW), waiting 30s more..."
    sleep 30
    NEW_GW=$(ps | grep openclaw-gateway | grep -v grep | awk '{print $2}')
fi
echo "$LOGPFX Gateway running (PID $NEW_GW)."

# Step 3: Kill Termux Dalvik processes with kill -9 (preserves BOOT_COMPLETED)
echo "$LOGPFX Killing Termux Dalvik processes (kill -9, NOT force-stop)..."

TERMUX_PID=$(ps | grep 'com.termux$' | grep -v grep | awk '{print $2}')
BOOT_PID=$(ps | grep 'com.termux.boot' | grep -v grep | awk '{print $2}')

if [ -n "$TERMUX_PID" ]; then
    run-as com.termux kill -9 $TERMUX_PID 2>/dev/null
    echo "$LOGPFX   com.termux (PID $TERMUX_PID) killed."
fi
if [ -n "$BOOT_PID" ]; then
    run-as com.termux kill -9 $BOOT_PID 2>/dev/null
    echo "$LOGPFX   com.termux.boot (PID $BOOT_PID) killed."
fi

sleep 2

# Step 4: Verify results
echo ""
echo "$LOGPFX === RESULTS ==="
echo "Gateway:"
ps | grep openclaw-gateway | grep -v grep || echo "  NOT RUNNING!"
echo ""
echo "Termux processes:"
ps | grep 'com.termux' | grep -v grep || echo "  (none — good!)"
echo ""
echo "RAM:"
grep -E 'MemTotal|MemFree|Buffers|Cached:' /proc/meminfo
TOTAL=$(grep MemTotal /proc/meminfo | awk '{print $2}')
FREE=$(grep MemFree /proc/meminfo | awk '{print $2}')
BUF=$(grep Buffers /proc/meminfo | awk '{print $2}')
CACHE=$(grep '^Cached:' /proc/meminfo | awk '{print $2}')
USED=$(( (TOTAL - FREE - BUF - CACHE) / 1024 ))
echo "Used: ${USED} MB / $((TOTAL / 1024)) MB"
echo ""
echo "$LOGPFX Done. BOOT_COMPLETED preserved for next reboot."
