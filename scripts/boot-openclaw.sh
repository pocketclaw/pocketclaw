#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot auto-start script
# Install: cp boot-openclaw.sh ~/.termux/boot/start-openclaw.sh

PREFIX=/data/data/com.termux/files/usr

# Wait for WiFi to connect
sleep 15

# NOTE: boot-debloat requires ADB shell (Dirty COW can't open /system/bin/run-as from Termux).
# After reboot with USB connected, run: adb shell /data/local/tmp/boot-debloat.sh

# Start SSH server
sshd

# Install cron jobs (healthcheck every 2 min, log rotation every hour)
(crontab -l 2>/dev/null | grep -v healthcheck | grep -v logrotate-pc; \
  echo "*/2 * * * * $PREFIX/bin/healthcheck"; \
  echo "0 * * * * $PREFIX/bin/logrotate-pc") | crontab -

# Start cron daemon
crond 2>/dev/null

# Start the hardware monitor
nohup monitor </dev/null >/dev/null 2>&1 &

# Start the gateway
nohup start-openclaw > $PREFIX/tmp/openclaw-gateway.log 2>&1 &

echo "Boot complete: sshd + crons + monitor + openclaw started"
