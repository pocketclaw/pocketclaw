#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
LOG=$PREFIX/tmp/proot-test.log

echo "=== Proot Test ===" > "$LOG"
echo "proot version:" >> "$LOG"
proot --version >> "$LOG" 2>&1

echo "" >> "$LOG"
echo "=== Test 1: proot with /bin/bash ===" >> "$LOG"
proot -v 9 --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys --cwd=/root \
  /bin/bash -c "echo WORKS" >> "$LOG" 2>&1

echo "" >> "$LOG"
echo "=== Test 2: proot WITHOUT --link2symlink ===" >> "$LOG"
proot -v 9 --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys --cwd=/root \
  /bin/bash -c "echo WORKS2" >> "$LOG" 2>&1

echo "" >> "$LOG"
echo "=== Test 3: proot with explicit loader ===" >> "$LOG"
proot --link2symlink --root-id --rootfs=$ROOTFS \
  --bind=/dev --bind=/proc --bind=/sys --cwd=/root \
  /lib/ld-linux-armhf.so.3 /bin/bash -c "echo WORKS3" >> "$LOG" 2>&1

echo "" >> "$LOG"
echo "=== Test 4: check files ===" >> "$LOG"
ls -la "$ROOTFS/bin/bash" >> "$LOG" 2>&1
ls -la "$ROOTFS/lib/ld-linux-armhf.so.3" >> "$LOG" 2>&1
file "$ROOTFS/bin/bash" >> "$LOG" 2>&1

echo "=== Done ===" >> "$LOG"
rm -f ~/.bash_profile
