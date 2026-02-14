#!/system/bin/sh
# Init exec test v3 - test execution capabilities
# vfs_cache_pressure encodes:
#   111 = script started
#   200 = can exec proot from /data/local/tmp
#   201 = proot exec FAILED
#   300 = can read /data/local/tmp/
#   301 = cannot read /data/local/tmp/
#   400 = can exec as u0_a96 via run-as
#   401 = run-as failed
# min_free_kbytes encodes exit codes

echo 111 > /proc/sys/vm/vfs_cache_pressure

# Test 1: can init list /data/local/tmp/?
if ls /data/local/tmp/proot > /dev/null 2>&1; then
  echo 300 > /proc/sys/vm/vfs_cache_pressure
else
  echo 301 > /proc/sys/vm/vfs_cache_pressure
  exit 0
fi

# Test 2: can init exec proot --help?
/data/local/tmp/proot --help > /dev/null 2>&1
RC=$?
echo $((2000 + RC)) > /proc/sys/vm/min_free_kbytes

if [ $RC -eq 0 ] || [ $RC -eq 1 ]; then
  echo 200 > /proc/sys/vm/vfs_cache_pressure
else
  echo 201 > /proc/sys/vm/vfs_cache_pressure
fi
exit 0
