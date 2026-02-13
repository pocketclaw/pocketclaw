PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp
proot --link2symlink --kill-on-exit --root-id --rootfs=$ROOTFS --bind=/dev --bind=/proc --bind=/sys --bind=$PREFIX/tmp:/tmp --bind=$PREFIX:$PREFIX --bind=/system:/system --cwd=/root /lib/ld-linux-armhf.so.3 /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /data/data/com.termux/files/usr/lib/node_modules/openclaw && npm install --ignore-scripts 2>&1 | tail -30" | tee $PREFIX/tmp/npm-restore.log
