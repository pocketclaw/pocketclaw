#!/data/data/com.termux/files/usr/bin/bash
# Healthcheck: restart if gateway HTTP fails (process alive but hung = also restart)
if ! curl -sf --connect-timeout 5 --max-time 10 http://localhost:9000/api/status >/dev/null 2>&1; then
  # HTTP failed — check if process exists
  if ! pgrep -f "openclaw-gateway" >/dev/null 2>&1; then
    # Process dead, restart
    restart-gw
  else
    # Process alive but not responding (hung) — give it one more chance
    sleep 5
    if ! curl -sf --connect-timeout 5 --max-time 10 http://localhost:9000/api/status >/dev/null 2>&1; then
      echo "[healthcheck] Gateway hung, restarting..."
      restart-gw
    fi
  fi
fi
