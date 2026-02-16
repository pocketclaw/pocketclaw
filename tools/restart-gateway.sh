#!/system/bin/sh
P=/data/data/com.termux/files/usr
export PATH="$P/bin:$P/bin/applets:/system/bin:/system/xbin"
export LD_LIBRARY_PATH="$P/lib"
export LD_PRELOAD="$P/lib/libapi23compat.so"
export HOME="$P/var/lib/proot-distro/installed-rootfs/ubuntu/root"
export TMPDIR="$P/tmp"
export SHELL="$P/bin/bash"
mkdir -p "$P/tmp"
/system/bin/setsid "$P/bin/bash" "$P/bin/start-openclaw" > "$P/tmp/openclaw-gateway.log" 2>&1 &
echo "Gateway started (PID $!)"
