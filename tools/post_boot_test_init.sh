#!/system/bin/sh
# Test: can init domain exec binaries from /data/local/tmp?
OUT=/data/local/tmp/init-exec-test.txt
echo "=== init exec test ===" > $OUT
echo "uid=$(id -u) gid=$(id -g)" >> $OUT
echo "context=$(cat /proc/self/attr/current)" >> $OUT
echo "date=$(date)" >> $OUT

# Test 1: can we exec proot?
echo "" >> $OUT
echo "--- proot test ---" >> $OUT
/data/local/tmp/proot --version >> $OUT 2>&1
echo "proot exit: $?" >> $OUT

# Test 2: can we read Termux files?
echo "" >> $OUT
echo "--- termux access test ---" >> $OUT
ls /data/data/com.termux/files/usr/bin/node >> $OUT 2>&1
echo "ls node exit: $?" >> $OUT

# Test 3: can we exec Termux bash?
echo "" >> $OUT
echo "--- termux bash test ---" >> $OUT
/data/data/com.termux/files/usr/bin/bash --version >> $OUT 2>&1
echo "bash exit: $?" >> $OUT

# Test 4: try proot with rootfs
echo "" >> $OUT
echo "--- proot rootfs test ---" >> $OUT
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
/data/local/tmp/proot --rootfs=$ROOTFS /lib/ld-linux-armhf.so.3 /bin/echo "proot works from init" >> $OUT 2>&1
echo "proot rootfs exit: $?" >> $OUT

# Sysctl tuning (keep existing functionality)
echo 500 > /proc/sys/vm/vfs_cache_pressure
echo 2048 > /proc/sys/vm/min_free_kbytes
echo 3 > /proc/sys/vm/drop_caches

echo "" >> $OUT
echo "=== done ===" >> $OUT
exit 0
