#!/system/bin/sh
OUT=/dev/kmsg
echo "PCTEST: starting uid=$(id -u)" > $OUT
echo "PCTEST: context=$(cat /proc/self/attr/current)" > $OUT
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
echo "PCTEST: trying proot" > $OUT
/data/local/tmp/proot --rootfs=$ROOTFS /lib/ld-linux-armhf.so.3 /bin/echo "INIT-PROOT-OK" > /data/local/tmp/init-proot-result.txt 2>&1
echo "PCTEST: proot exit=$?" > $OUT
echo "init-was-here" > /data/local/tmp/init-write-test.txt 2>/dev/null
echo "PCTEST: write exit=$?" > $OUT
echo 501 > /proc/sys/vm/vfs_cache_pressure
echo "PCTEST: done" > $OUT
exit 0
