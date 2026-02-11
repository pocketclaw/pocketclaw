#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot auto-start script
# Install: cp boot-openclaw.sh ~/.termux/boot/start-openclaw.sh

# Wait for WiFi to connect
sleep 15

# Start SSH server
sshd

# Start the gateway
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &

echo "Boot complete: sshd + openclaw started"
