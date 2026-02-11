#!/data/data/com.termux/files/usr/bin/bash
# Clean restart: kill everything, clean locks, start fresh
pkill -9 -f openclaw 2>/dev/null
pkill -9 -f proot 2>/dev/null
sleep 3

ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
rm -f /data/data/com.termux/files/usr/tmp/openclaw-gateway.log

remaining=$(ps | grep -E 'proot|openclaw' | grep -v grep | wc -l)
echo "Remaining processes: $remaining"

echo "Starting gateway..."
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &
echo "PID: $!"
