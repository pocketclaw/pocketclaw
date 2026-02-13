#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
LOG=$PREFIX/tmp/npm-test.log
LOADER=/lib/ld-linux-armhf.so.3

unset LD_PRELOAD
echo "=== npm install test ===" > "$LOG"
proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  --bind=$PREFIX/tmp:/tmp --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && export HOME=/root && npm install -g openclaw --ignore-scripts --legacy-peer-deps 2>&1" \
  >> "$LOG" 2>&1
echo "=== exit: $? ===" >> "$LOG"
rm -f ~/.bash_profile
