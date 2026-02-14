#!/system/bin/sh
# Test: can init use run-as to access Termux files?
# vfs_cache_pressure encodes:
#   111 = started
#   200 = run-as works + can access Termux
#   201 = run-as works but cannot access Termux
#   301 = run-as failed
#   400 = proot works via run-as
#   401 = proot failed via run-as
# min_free_kbytes = 3000 + exit code

echo 111 > /proc/sys/vm/vfs_cache_pressure

# Test run-as com.termux
RESULT=$(/system/bin/run-as com.termux ls /data/data/com.termux/files/usr/bin/proot 2>&1)
RC=$?
echo $((3000 + RC)) > /proc/sys/vm/min_free_kbytes

if [ $RC -eq 0 ]; then
  echo 200 > /proc/sys/vm/vfs_cache_pressure
else
  echo 301 > /proc/sys/vm/vfs_cache_pressure
  exit 0
fi

# Test proot via run-as
ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
PROOT=/data/data/com.termux/files/usr/bin/proot
PRESULT=$(/system/bin/run-as com.termux $PROOT --rootfs=$ROOTFS /lib/ld-linux-armhf.so.3 /bin/echo RUNAS-PROOT-OK 2>&1)
PRC=$?
echo $((4000 + PRC)) > /proc/sys/vm/min_free_kbytes

case "$PRESULT" in
  *RUNAS-PROOT-OK*)
    echo 400 > /proc/sys/vm/vfs_cache_pressure
    ;;
  *)
    echo 401 > /proc/sys/vm/vfs_cache_pressure
    ;;
esac
exit 0
