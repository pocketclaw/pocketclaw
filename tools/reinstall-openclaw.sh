PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp
echo "=== Reinstalling OpenClaw ==="
proot --link2symlink --kill-on-exit --root-id --rootfs=$ROOTFS --bind=/dev --bind=/proc --bind=/sys --bind=$PREFIX/tmp:/tmp --bind=$PREFIX:$PREFIX --bind=/system:/system --cwd=/root /lib/ld-linux-armhf.so.3 /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && npm install -g openclaw --ignore-scripts 2>&1 | tail -10"
echo "=== Running fix-stubs ==="
/data/data/com.termux/files/home/fix-stubs.sh
echo "=== Starting gateway ==="
nohup start-openclaw > $PREFIX/tmp/openclaw-gateway.log 2>&1 &
echo "=== Done ==="
