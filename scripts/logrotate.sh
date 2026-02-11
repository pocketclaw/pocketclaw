#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw log rotation — run via cron every hour
# Deletes OpenClaw logs older than 24h and trims the monitor CSV
# Install: echo "0 * * * * /data/data/com.termux/files/usr/bin/logrotate-pc" | crontab -

PREFIX=/data/data/com.termux/files/usr
OC_LOGS="$PREFIX/tmp/openclaw"
STATS_CSV="$PREFIX/tmp/pocketclaw-stats.csv"
HC_LOG="$PREFIX/tmp/pocketclaw-healthcheck.log"

# Delete OpenClaw logs older than 24 hours
find "$OC_LOGS" -name "*.log" -mmin +1440 -delete 2>/dev/null

# Trim monitor CSV to last 288 entries (~24h at 5min intervals)
if [ -f "$STATS_CSV" ]; then
  LINES=$(wc -l < "$STATS_CSV")
  if [ "$LINES" -gt 300 ]; then
    head -1 "$STATS_CSV" > "$STATS_CSV.tmp"
    tail -288 "$STATS_CSV" >> "$STATS_CSV.tmp"
    mv "$STATS_CSV.tmp" "$STATS_CSV"
  fi
fi

# Trim healthcheck log to last 100 lines
if [ -f "$HC_LOG" ]; then
  LINES=$(wc -l < "$HC_LOG")
  if [ "$LINES" -gt 100 ]; then
    tail -50 "$HC_LOG" > "$HC_LOG.tmp"
    mv "$HC_LOG.tmp" "$HC_LOG"
  fi
fi
