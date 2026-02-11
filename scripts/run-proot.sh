#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp

if [ -f "$ROOTFS/root/.openclaw/env" ]; then
  source "$ROOTFS/root/.openclaw/env"
  export MOONSHOT_API_KEY
  export KIMI_API_KEY
fi

proot \
  --link2symlink \
  --kill-on-exit \
  --root-id \
  --rootfs=$ROOTFS \
  --bind=/dev \
  --bind=/proc \
  --bind=/sys \
  --bind=$PREFIX/tmp:/tmp \
  --bind=/storage/emulated/0:/sdcard \
  --cwd=/root \
  /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && export HOME=/root && export NODE_OPTIONS='-r /root/hijack.js' && export MOONSHOT_API_KEY='$MOONSHOT_API_KEY' && export KIMI_API_KEY='$KIMI_API_KEY' && $*"
