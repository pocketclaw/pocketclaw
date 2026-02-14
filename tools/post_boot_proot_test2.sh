#!/system/bin/sh
# Init exec test v2 - use sysctl values as communication channel
# vfs_cache_pressure encodes result:
#   111 = script started
#   222 = proot executed successfully
#   333 = proot failed
#   444 = proot ran but output was wrong
#   555 = init cannot access termux dir
# min_free_kbytes encodes proot exit code (1000 + exit_code)

echo 111 > /proc/sys/vm/vfs_cache_pressure

# Test: can we access Termux files?
if [ ! -d /data/data/com.termux/files/usr/bin ]; then
  echo 555 > /proc/sys/vm/vfs_cache_pressure
  exit 0
fi

# Test: exec proot from /data/local/tmp
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
RESULT=$(/data/local/tmp/proot --rootfs=$ROOTFS /lib/ld-linux-armhf.so.3 /bin/echo INITWORKS 2>&1)
RC=$?
echo $((1000 + RC)) > /proc/sys/vm/min_free_kbytes

case "$RESULT" in
  *INITWORKS*)
    echo 222 > /proc/sys/vm/vfs_cache_pressure
    ;;
  *)
    echo 333 > /proc/sys/vm/vfs_cache_pressure
    ;;
esac
exit 0
