#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
LOG=$PREFIX/tmp/install-git.log
LOADER=/lib/ld-linux-armhf.so.3

unset LD_PRELOAD
echo "=== Installing git inside proot ===" > "$LOG"

# Test 1: try apt-get install git inside proot
echo "--- Test: apt-get install git ---" >> "$LOG"
proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  --bind=$PREFIX/tmp:/tmp --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && export HOME=/root && apt-get update 2>&1 | tail -5 && apt-get install -y git 2>&1 | tail -10" \
  >> "$LOG" 2>&1
echo "exit: $?" >> "$LOG"

echo "" >> "$LOG"
echo "--- Test: which git ---" >> "$LOG"
proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && which git && git --version" \
  >> "$LOG" 2>&1
echo "exit: $?" >> "$LOG"

echo "" >> "$LOG"
echo "--- Test: npm install openclaw ---" >> "$LOG"
proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys \
  --bind=$PREFIX/tmp:/tmp --cwd=/root \
  $LOADER /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin && export HOME=/root && npm install -g openclaw --ignore-scripts --legacy-peer-deps 2>&1" \
  >> "$LOG" 2>&1
echo "exit: $?" >> "$LOG"

echo "=== Done ===" >> "$LOG"
rm -f ~/.bash_profile
