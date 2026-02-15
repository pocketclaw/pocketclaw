#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:$PREFIX/bin/applets:$PATH"
# Kill gateway processes (node22 running openclaw)
for pid in $(pgrep -f 'openclaw-gateway' 2>/dev/null) $(pgrep -f 'node22-icu.*openclaw' 2>/dev/null) $(pgrep -f 'node22.*openclaw' 2>/dev/null) $(pgrep -f 'start-openclaw' 2>/dev/null); do
  [ "$pid" != "$$" ] && kill -9 "$pid" 2>/dev/null
done
sleep 3
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
rm -f "$ROOTFS/root/.openclaw/tmp/openclaw/"*.lock 2>/dev/null
rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
nohup start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
echo "PID: $!"
