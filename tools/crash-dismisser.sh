#!/system/bin/sh
# Auto-dismiss "app has stopped" crash dialogs
# Runs as a background loop, taps OK on crash dialogs
# Screen: 540x960 (Moto E2)

LOG=/sdcard/pocketclaw/crash-dismisser.log

while true; do
  # Check if a crash dialog is showing (AppErrorDialog)
  if dumpsys window windows 2>/dev/null | grep -q "mCurrentFocus.*Application Error"; then
    # Tap the OK button (center-bottom of dialog on 540x960 screen)
    input tap 270 580
    echo "$(date '+%H:%M:%S') dismissed crash dialog" >> "$LOG"
  fi
  sleep 3
done
