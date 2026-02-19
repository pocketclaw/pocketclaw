#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw hardware monitor — logs stats every 5 minutes
# Usage: nohup monitor > /dev/null 2>&1 &
# View:  cat $PREFIX/tmp/pocketclaw-stats.csv
# Stop:  pkill -f monitor.sh

LOGFILE="/data/data/com.termux/files/usr/tmp/pocketclaw-stats.csv"

# Header
if [ ! -f "$LOGFILE" ]; then
  echo "timestamp,mem_total_kb,mem_free_kb,mem_cached_kb,mem_available_kb,swap_used_kb,oc_gateway_rss_kb,oc_parent_rss_kb,gw_cpu_pct,disk_free_mb,battery_pct,battery_temp" > "$LOGFILE"
fi

while true; do
  TS=$(date '+%Y-%m-%d %H:%M:%S')

  # RAM
  MEM_TOTAL=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  MEM_FREE=$(grep MemFree /proc/meminfo | awk '{print $2}')
  MEM_CACHED=$(grep "^Cached:" /proc/meminfo | awk '{print $2}')
  MEM_AVAIL=$((MEM_FREE + MEM_CACHED))
  SWAP_USED=$(awk '/SwapTotal/{t=$2} /SwapFree/{f=$2} END{print t-f}' /proc/meminfo)

  # OpenClaw processes
  OC_GW_RSS=$(ps aux 2>/dev/null | grep 'openclaw-gateway' | grep -v grep | awk '{print $6}' | head -1)
  OC_GW_RSS=${OC_GW_RSS:-0}
  OC_PARENT_RSS=$(ps aux 2>/dev/null | grep 'openclaw' | grep -v gateway | grep -v grep | grep -v bash | awk '{print $6}' | head -1)
  OC_PARENT_RSS=${OC_PARENT_RSS:-0}

  # CPU (snapshot) — proot column removed (native mode, always 0)
  GW_CPU=$(ps aux 2>/dev/null | grep 'openclaw-gateway' | grep -v grep | awk '{print $3}' | head -1)
  GW_CPU=${GW_CPU:-0}

  # Disk (via /proc/partitions or stat -f)
  DISK_FREE=$(stat -f /data 2>/dev/null | awk '/Free/{print int($NF * 4 / 1024)}')
  [ -z "$DISK_FREE" ] && DISK_FREE=$(df /data 2>/dev/null | tail -1 | awk '{print int($4/1024)}')
  DISK_FREE=${DISK_FREE:-0}

  # Battery (via /sys)
  BAT_PCT=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null)
  BAT_PCT=${BAT_PCT:-0}
  BAT_TEMP=$(cat /sys/class/power_supply/battery/temp 2>/dev/null)
  BAT_TEMP=${BAT_TEMP:-0}

  echo "$TS,$MEM_TOTAL,$MEM_FREE,$MEM_CACHED,$MEM_AVAIL,$SWAP_USED,$OC_GW_RSS,$OC_PARENT_RSS,$GW_CPU,$DISK_FREE,$BAT_PCT,$BAT_TEMP" >> "$LOGFILE"

  sleep 300
done
