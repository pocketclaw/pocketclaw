#!/usr/bin/env bash
# ============================================================
# PocketClaw — PC-side Setup Script
# Plug phone via USB, run this, follow prompts. That's it.
#
# Usage:
#   git clone https://github.com/MonteiroRobin/pocketclaw.git
#   cd pocketclaw
#   bash setup.sh
#
# Requires: adb on PATH, USB debugging enabled on phone
# ============================================================

set -e

G='\033[0;32m'  # green
O='\033[0;33m'  # orange
R='\033[0;31m'  # red
N='\033[0m'     # reset
B='\033[1m'     # bold

step() { echo -e "\n${G}>>>${N} ${B}$1${N}"; }
ok()   { echo -e "  ${G}✓${N} $1"; }
warn() { echo -e "  ${O}!${N} $1"; }
fail() { echo -e "  ${R}✗${N} $1"; exit 1; }
ask()  { echo -en "  ${O}?${N} $1"; read -r REPLY; }

# MSYS/Git Bash path conversion fix
export MSYS_NO_PATHCONV=1

echo ""
echo -e "${G}${B}"
echo "  ____            _        _    ____ _"
echo " |  _ \\ ___   ___| | _____| |_ / ___| | __ ___      __"
echo " | |_) / _ \\ / __| |/ / _ \\ __| |   | |/ _\` \\ \\ /\\ / /"
echo " |  __/ (_) | (__|   <  __/ |_| |___| | (_| |\\ V  V /"
echo " |_|   \\___/ \\___|_|\\_\\___|\\__|\\____|_|\\__,_| \\_/\\_/"
echo -e "${N}"
echo -e "  ${O}PC-side installer — plug phone, run this, done.${N}"
echo ""

# -----------------------------------------------------------
# Step 0: Check ADB
# -----------------------------------------------------------
step "Checking ADB connection..."

if ! command -v adb &>/dev/null; then
  fail "adb not found. Install Android SDK Platform Tools and add to PATH."
fi

adb start-server 2>/dev/null

DEVICE=$(adb devices | grep -w "device" | head -1 | cut -f1)
if [ -z "$DEVICE" ]; then
  UNAUTH=$(adb devices | grep "unauthorized" | head -1 | cut -f1)
  if [ -n "$UNAUTH" ]; then
    fail "Phone found ($UNAUTH) but unauthorized. Accept the USB debugging popup on the phone screen."
  fi
  fail "No phone found. Connect via USB and enable USB debugging in Developer Options."
fi
ok "Phone connected: $DEVICE"

# Save stock package list (safety net before any debloat)
step "Saving stock package list..."
adb shell 'pm list packages > /sdcard/packages-stock.txt'
ok "Saved to /sdcard/packages-stock.txt ($(adb shell 'wc -l < /sdcard/packages-stock.txt' | tr -d '\r') packages)"

# -----------------------------------------------------------
# Step 1: Detect Android version, install Termux
# -----------------------------------------------------------
step "Detecting Android version..."

API=$(adb shell getprop ro.build.version.sdk | tr -d '\r\n')
ANDROID=$(adb shell getprop ro.build.version.release | tr -d '\r\n')
MODEL=$(adb shell getprop ro.product.model | tr -d '\r\n')
RAM_KB=$(adb shell cat /proc/meminfo | grep MemTotal | awk '{print $2}')
RAM_MB=$((RAM_KB / 1024))

ok "Model: $MODEL"
ok "Android $ANDROID (API $API)"
ok "RAM: ${RAM_MB} MB"

# Check if Termux is already installed
if adb shell pm list packages 2>/dev/null | grep -q "com.termux"; then
  ok "Termux already installed"
else
  step "Installing Termux..."
  TERMUX_URL=""
  if [ "$API" -le 23 ]; then
    TERMUX_URL="https://github.com/termux/termux-app/releases/download/v0.119.0-beta.3/termux-app_v0.119.0-beta.3+apt-android-5-github-debug_armeabi-v7a.apk"
    ok "Using Termux v0.119.0-beta.3 (Android 5-6)"
  else
    TERMUX_URL="https://github.com/termux/termux-app/releases/download/v0.119.1-beta.1/termux-app_v0.119.1-beta.1+f-droid-repo-debug_universal.apk"
    ok "Using Termux v0.119.1 (Android 7+)"
  fi

  if [ ! -f /tmp/termux.apk ]; then
    echo "  Downloading Termux..."
    curl -L -o /tmp/termux.apk "$TERMUX_URL"
  fi
  adb install -r /tmp/termux.apk
  ok "Termux installed"
fi

# Check if Termux:Boot is installed
if adb shell pm list packages 2>/dev/null | grep -q "com.termux.boot"; then
  ok "Termux:Boot already installed"
else
  step "Installing Termux:Boot..."
  BOOT_URL="https://github.com/termux/termux-boot/releases/download/v0.8.1/termux-boot-app_v0.8.1+github.debug.apk"
  if [ ! -f /tmp/termux-boot.apk ]; then
    echo "  Downloading Termux:Boot..."
    curl -L -o /tmp/termux-boot.apk "$BOOT_URL"
  fi
  adb install -r /tmp/termux-boot.apk
  ok "Termux:Boot installed"
fi

# -----------------------------------------------------------
# Step 2: Open Termux to initialize it
# -----------------------------------------------------------
step "Initializing Termux..."
echo -e "  ${O}>>> Open Termux on the phone if it doesn't open automatically <<<${N}"
adb shell am start -n com.termux/.app.TermuxActivity 2>/dev/null || true
echo "  Waiting 10 seconds for Termux to initialize..."
sleep 10

# Also open Termux:Boot once to activate the boot receiver
adb shell am start -n com.termux.boot/.app.TermuxBootActivity 2>/dev/null || true
sleep 2
ok "Termux initialized"

# -----------------------------------------------------------
# Step 3: Run install.sh inside Termux
# -----------------------------------------------------------
step "Launching PocketClaw installer inside Termux..."

# The install.sh runs inside Termux and sets up everything:
# proot, Node.js, OpenClaw, scripts, boot config, crons, diet
adb shell am start -n com.termux/.app.TermuxActivity 2>/dev/null || true
sleep 2

# Send the install command to Termux via input
# Using am broadcast with RUN_COMMAND for reliability
adb shell am broadcast \
  --user 0 \
  -n com.termux/com.termux.app.RunCommandService \
  -a com.termux.RUN_COMMAND \
  --es com.termux.RUN_COMMAND_PATH '/data/data/com.termux/files/usr/bin/bash' \
  --esa com.termux.RUN_COMMAND_ARGUMENTS '-c,curl -sL https://raw.githubusercontent.com/MonteiroRobin/pocketclaw/main/install.sh | bash' \
  --ez com.termux.RUN_COMMAND_BACKGROUND false 2>/dev/null || {
    # Fallback: type the command via input text
    warn "RUN_COMMAND not available, sending command via input..."
    adb shell input text "curl%s-sL%shttps://raw.githubusercontent.com/MonteiroRobin/pocketclaw/main/install.sh%s|%sbash"
    adb shell input keyevent 66  # Enter
  }

echo ""
echo -e "${G}${B}========================================${N}"
echo -e "${G}${B}  Install is running inside Termux!${N}"
echo -e "${G}${B}========================================${N}"
echo ""
echo -e "  Watch the phone screen for progress."
echo -e "  This takes ${O}10-30 minutes${N} depending on your phone."
echo ""
echo -e "  When it finishes, it will show:"
echo -e "    ${G}Open http://localhost:9000/setup to configure${N}"
echo ""
echo -e "  ${B}Then come back here and press Enter.${N}"
read -r -p "  Press Enter when the install is done... "

# -----------------------------------------------------------
# Step 4: Port forward + Setup wizard
# -----------------------------------------------------------
step "Setting up port forwarding..."
adb forward tcp:9000 tcp:9000
adb forward tcp:8022 tcp:8022
ok "Port 9000 (gateway) and 8022 (SSH) forwarded"

echo ""
echo -e "  ${B}Open this in your browser:${N}"
echo -e "    ${G}http://localhost:9000/setup${N}"
echo ""
echo -e "  Configure your Telegram bot token and AI provider."
ask "Press Enter when setup is done... "

# -----------------------------------------------------------
# Step 5: Install PocketClaw launcher APK
# -----------------------------------------------------------
step "Installing PocketClaw Launcher v2..."

# Build APK if not already built
APK_PATH="apk/build/aligned.apk"
if [ ! -f "$APK_PATH" ]; then
  warn "APK not found at $APK_PATH. Skipping launcher install."
  warn "Build it manually: see apk/README or HACKS.md #32"
else
  adb install -r "$APK_PATH"
  ok "Launcher APK v2 installed (with escape hatches)"
  echo ""
  echo -e "  ${O}On the phone: press Home and select PocketClaw as launcher${N}"
  echo -e "  Escape hatches:"
  echo -e "    - Triple-tap title  → Android Settings"
  echo -e "    - Double-back       → Switch launcher"
  echo -e "    - 5 min offline     → Red OPEN SETTINGS button"
  echo -e "    - ADB kill switch   → adb shell am broadcast -a com.pocketclaw.EXIT"
fi

# -----------------------------------------------------------
# Step 6: Harden for 24/7
# -----------------------------------------------------------
step "Hardening for 24/7 operation..."
adb shell settings put global wifi_sleep_policy 2
ok "WiFi never sleeps"
adb shell dumpsys deviceidle whitelist +com.termux 2>/dev/null || true
ok "Termux exempt from Doze"
adb shell dumpsys deviceidle disable 2>/dev/null || true
ok "Doze disabled"

# -----------------------------------------------------------
# Step 7: Debloat (optional)
# -----------------------------------------------------------
echo ""
echo -e "${O}${B}Optional: Debloat Android to free RAM?${N}"
echo -e "  This disables bloatware (YouTube, Maps, Chrome, etc.)"
echo -e "  Saves ~100-200 MB RAM. Safe to undo."
ask "Run debloat? [y/N] "

if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  step "Debloating Android..."

  # Safe debloat list — tested packages that don't break anything
  DEBLOAT=(
    com.google.android.youtube
    com.google.android.apps.maps
    com.google.android.apps.photos
    com.google.android.apps.docs
    com.google.android.apps.docs.editors.docs
    com.google.android.apps.plus
    com.google.android.apps.books
    com.google.android.apps.magazines
    com.google.android.apps.cloudprint
    com.google.android.music
    com.google.android.videos
    com.google.android.play.games
    com.google.android.gm
    com.google.android.gm.exchange
    com.google.android.talk
    com.google.android.calendar
    com.google.android.gallery3d
    com.google.android.marvin.talkback
    com.google.android.apps.inputmethod.hindi
    com.google.android.inputmethod.korean
    com.google.android.inputmethod.pinyin
    com.google.android.tts
    com.android.chrome
    com.android.mms
    com.android.calculator2
    com.android.dreams.basic
    com.android.wallpapercropper
    com.android.wallpaper.livepicker
    com.android.printspooler
    com.android.facelock
    com.android.bookmarkprovider
    com.android.cellbroadcastreceiver
    com.android.managedprovisioning
    com.motorola.motocare
    com.motorola.motocare.internal
    com.motorola.bug2go
    com.motorola.camera
    com.motorola.MotGallery2
    com.motorola.moodles
    com.motorola.motocit
    com.motorola.motosignature.app
    com.motorola.demo
    com.motorola.fmplayer
    com.motorola.android.fmradio
    com.motorola.audioeffects
    com.motorola.actions
    com.motorola.motodisplay
    com.motorola.motodisplay.env
    com.motorola.bodyguard
    com.motorola.storageoptimizer
    com.motorola.genie
    com.motorola.ccc.devicemanagement
    com.motorola.ccc.checkin
    com.motorola.ccc.mainplm
    com.motorola.ccc.ota
    com.motorola.ccc.notification
    com.motorola.wappushsi
    com.motorola.onetimeinitializer
    com.motorola.setup
    com.motorola.launcherconfig
    com.motorola.context
    com.motorola.android.provisioning
    com.motorola.appdirectedsmsproxy
    com.motorola.contacts.preloadcontacts
    com.motorola.android.settings.modemdebug
    com.motorola.android.settings.diag_mdlog
    com.motorola.android.nativedropboxagent
    com.motorola.android.sepolicyupdate
    com.motorola.bach.modemstats
    com.motorola.motgeofencesvc
    com.motorola.groundloopnoisepreventer
    com.motorola.sensorhub.stml0.updater
    com.motorola.slpc
    com.motorola.slpc_sys
    com.motorola.emaraphoneextns
    com.motorola.android.jvtcmd
    com.motorola.android.dm.service
    com.motorola.coresettingsext
    com.lmi.motorola.rescuesecurity
    com.qualcomm.qcrilmsgtunnel
    com.qualcomm.timeservice
    com.qualcomm.atfwd
    com.google.android.setupwizard
    com.google.android.onetimeinitializer
    com.google.android.configupdater
    com.google.android.feedback
    com.google.android.partnersetup
    com.google.android.backuptransport
    com.google.android.syncadapters.contacts
    com.google.android.googlequicksearchbox
    com.google.android.deskclock
    com.android.providers.partnerbookmarks
    com.android.providers.calllogbackup
    com.android.statementservice
    com.android.backupconfirm
    com.android.sharedstoragebackup
  )

  COUNT=0
  for pkg in "${DEBLOAT[@]}"; do
    if adb shell pm disable-user --user 0 "$pkg" 2>/dev/null | grep -q "disabled"; then
      COUNT=$((COUNT + 1))
    fi
  done
  ok "Disabled $COUNT packages"

  # NEVER disable these (breaks things):
  # com.android.providers.media — storage breaks
  # com.android.systemui — screen goes black
  # com.google.android.gms — WiFi routing breaks
  # com.android.phone — telephony (causes crash dialogs)
  # com.android.providers.settings — brick
  # com.android.defcontainer — can't install APKs

  warn "Kept: providers.media, systemui, gms, phone, settings, defcontainer"
fi

# -----------------------------------------------------------
# Done
# -----------------------------------------------------------
echo ""
echo -e "${G}${B}============================================${N}"
echo -e "${G}${B}  PocketClaw is ready!${N}"
echo -e "${G}${B}============================================${N}"
echo ""
echo -e "  ${B}Your phone is now an AI agent.${N}"
echo ""
echo -e "  Dashboard:    http://localhost:9000/dashboard"
echo -e "  Setup wizard: http://localhost:9000/setup"
echo -e "  SSH:          ssh -p 8022 localhost"
echo ""
echo -e "  ${O}Unplug the phone. Put it in a drawer. It runs on its own.${N}"
echo ""
echo -e "  Escape hatches (if launcher traps you):"
echo -e "    Triple-tap title    → Android Settings"
echo -e "    Double-back         → Switch launcher"
echo -e "    5 min offline       → Red emergency button"
echo -e "    adb shell am broadcast -a com.pocketclaw.EXIT"
echo ""
