#!/system/bin/sh
# PocketClaw kernel tuning - injected via Dirty COW
echo 500 > /proc/sys/vm/vfs_cache_pressure
echo 2048 > /proc/sys/vm/min_free_kbytes
echo 3 > /proc/sys/vm/drop_caches
exit 0
