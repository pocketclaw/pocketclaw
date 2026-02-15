#!/data/data/com.termux/files/usr/bin/bash
if ! curl -sf --connect-timeout 5 http://localhost:9000/api/status >/dev/null 2>&1; then
  if ! pgrep -f "openclaw" >/dev/null 2>&1; then restart-gw; fi
fi
