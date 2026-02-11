#!/data/data/com.termux/files/usr/bin/bash
# PocketClaw CLI — unified control for the gateway
# Usage: pocketclaw [start|stop|restart|status|logs|monitor]

PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
GW_LOG="$PREFIX/tmp/openclaw-gateway.log"
STATS_CSV="$PREFIX/tmp/pocketclaw-stats.csv"

case "${1:-help}" in

  start)
    if pgrep -f "openclaw-gateway" >/dev/null 2>&1; then
      echo "Gateway already running (PID $(pgrep -f openclaw-gateway | head -1))"
      exit 0
    fi
    echo "Starting gateway..."
    nohup start-openclaw > "$GW_LOG" 2>&1 &
    echo "PID: $!"
    echo "Logs: pocketclaw logs"
    ;;

  stop)
    echo "Stopping gateway..."
    pkill -f openclaw 2>/dev/null
    pkill -f proot 2>/dev/null
    sleep 2
    remaining=$(pgrep -f "openclaw|proot" | wc -l)
    if [ "$remaining" -gt 0 ]; then
      pkill -9 -f openclaw 2>/dev/null
      pkill -9 -f proot 2>/dev/null
    fi
    echo "Stopped."
    ;;

  restart)
    restart-gw
    ;;

  status)
    echo "=== PocketClaw Status ==="
    echo

    # Gateway
    GW_PID=$(pgrep -f "openclaw-gateway" | head -1)
    if [ -n "$GW_PID" ]; then
      echo "Gateway:  RUNNING (PID $GW_PID)"
    else
      echo "Gateway:  DOWN"
    fi

    # Uptime
    echo "Uptime:   $(uptime | sed 's/.*up /up /' | sed 's/,  load.*//')"

    # RAM
    MEM_TOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
    MEM_FREE=$(awk '/MemFree/{print int($2/1024)}' /proc/meminfo)
    MEM_CACHED=$(awk '/^Cached:/{print int($2/1024)}' /proc/meminfo)
    MEM_AVAIL=$((MEM_FREE + MEM_CACHED))
    echo "RAM:      ${MEM_AVAIL}MB available / ${MEM_TOTAL}MB total (${MEM_FREE}MB free + ${MEM_CACHED}MB cached)"

    # OpenClaw RAM — from API procs list (avoids /proc visibility issues)
    GW_RSS=$(curl -s --connect-timeout 2 http://localhost:9000/api/status 2>/dev/null | grep -o '"n":"openclaw-gateway","m":[0-9]*' | grep -o '[0-9]*$')
    if [ -n "$GW_RSS" ]; then
      echo "Gateway:  ${GW_RSS}MB RSS"
    fi

    # Swap
    SWAP_USED=$(awk '/SwapTotal/{t=$2} /SwapFree/{f=$2} END{print int((t-f)/1024)}' /proc/meminfo)
    SWAPPINESS=$(cat /proc/sys/vm/swappiness)
    echo "Swap:     ${SWAP_USED}MB used (swappiness=$SWAPPINESS)"

    # Disk — parse stat -f (Termux df gives human-readable, unusable by awk)
    STAT_OUT=$(stat -f /data 2>/dev/null)
    DISK_BSIZE=$(echo "$STAT_OUT" | grep "Block size" | grep -o 'Block size: [0-9]*' | grep -o '[0-9]*')
    DISK_AVAIL=$(echo "$STAT_OUT" | grep "Available" | grep -o 'Available: [0-9]*' | grep -o '[0-9]*')
    if [ -n "$DISK_AVAIL" ] && [ -n "$DISK_BSIZE" ]; then
      DISK_FREE=$(( DISK_AVAIL * DISK_BSIZE / 1024 / 1024 ))
    else
      DISK_FREE="?"
    fi
    echo "Disk:     ${DISK_FREE}MB free"

    # Battery
    BAT_PCT=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null || echo "?")
    BAT_TEMP_RAW=$(cat /sys/class/power_supply/battery/temp 2>/dev/null || echo "?")
    if [ "$BAT_TEMP_RAW" != "?" ]; then
      BAT_TEMP_INT=$((BAT_TEMP_RAW / 10))
      BAT_TEMP_DEC=$((BAT_TEMP_RAW % 10))
      echo "Battery:  ${BAT_PCT}%, ${BAT_TEMP_INT}.${BAT_TEMP_DEC}°C"
    else
      echo "Battery:  ${BAT_PCT}%"
    fi

    # Crons
    echo
    CRON_COUNT=$(crontab -l 2>/dev/null | grep -v "^#" | grep -c "." 2>/dev/null || echo "0")
    echo "Crons:    $CRON_COUNT active"
    ;;

  logs)
    if [ -f "$GW_LOG" ]; then
      tail -${2:-30} "$GW_LOG"
    else
      echo "No gateway log found."
    fi
    ;;

  monitor)
    if [ -f "$STATS_CSV" ]; then
      echo "=== Last 10 stats (every 5 min) ==="
      head -1 "$STATS_CSV"
      tail -${2:-10} "$STATS_CSV"
    else
      echo "No monitor data found. Start with: nohup monitor &"
    fi
    ;;

  help|*)
    echo "PocketClaw — AI agent on a phone"
    echo
    echo "Usage: pocketclaw <command>"
    echo
    echo "Commands:"
    echo "  start     Start the gateway"
    echo "  stop      Stop the gateway"
    echo "  restart   Clean restart"
    echo "  status    System stats (RAM, CPU, battery, gateway)"
    echo "  logs [n]  Show last n gateway log lines (default 30)"
    echo "  monitor [n]  Show last n monitor entries (default 10)"
    ;;
esac
