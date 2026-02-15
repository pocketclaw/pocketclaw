#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
find $PREFIX/tmp/openclaw/ -name "*.log" -mtime +1 -delete 2>/dev/null
LOG=$PREFIX/tmp/openclaw-gateway.log
if [ -f "$LOG" ] && [ $(wc -c < "$LOG") -gt 1048576 ]; then
  tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
