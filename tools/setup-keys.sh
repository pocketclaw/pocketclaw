#!/usr/bin/env bash
# PocketClaw — First-time API key setup
# Usage:
#   ./setup-keys.sh              # Interactive — asks for each key
#   ./setup-keys.sh env.filled   # From file — pushes a pre-filled env file
#
# Pushes keys to /sdcard/Download/pocketclaw-env via ADB.
# The gateway auto-imports this file on next start.

set -e

ADB="${ADB:-adb}"
DROPPATH="/sdcard/Download/pocketclaw-env"
SSH_PORT=8022

# Colors (if terminal supports them)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; DIM='\033[0;90m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; DIM=''; BOLD=''; NC=''
fi

echo -e "${GREEN}${BOLD}PocketClaw — Key Setup${NC}"
echo ""

# Check ADB
if ! command -v "$ADB" >/dev/null 2>&1; then
  echo "Error: adb not found. Set ADB= or add it to PATH."
  exit 1
fi

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "Error: No device connected. Plug in the phone and enable USB debugging."
  exit 1
fi

echo -e "${DIM}Device: $("$ADB" devices -l | grep -v "^List" | head -1)${NC}"
echo ""

# --- Mode 1: From file ---
if [ -n "$1" ] && [ -f "$1" ]; then
  echo "Pushing keys from: $1"
  "$ADB" push "$1" "$DROPPATH" >/dev/null
  echo -e "${GREEN}Keys pushed to phone.${NC}"
  echo "They will be imported on the next gateway start."
  echo ""

  # Try to restart gateway if SSH is reachable
  if ssh -i ~/.ssh/id_moto -p "$SSH_PORT" -o StrictHostKeyChecking=no -o ConnectTimeout=3 localhost true 2>/dev/null; then
    echo -n "SSH available. Restart gateway now? [Y/n] "
    read -r ans
    if [ "$ans" != "n" ] && [ "$ans" != "N" ]; then
      ssh -i ~/.ssh/id_moto -p "$SSH_PORT" -o StrictHostKeyChecking=no localhost \
        'export PATH=/data/data/com.termux/files/usr/bin:$PATH; restart-gw' 2>/dev/null
      echo -e "${GREEN}Gateway restarting. Give it ~30s to come up.${NC}"
    fi
  else
    echo -e "${DIM}Tip: restart the gateway to pick up the new keys.${NC}"
  fi
  exit 0
fi

# --- Mode 2: Interactive ---
echo "Enter your API keys (press Enter to skip optional ones)."
echo -e "${DIM}Keys are stored on-device only. Never sent anywhere else.${NC}"
echo ""

read_key() {
  local label="$1" var="$2" required="$3"
  if [ "$required" = "required" ]; then
    printf "${BOLD}%s${NC} (required): " "$label"
  else
    printf "%s (optional): " "$label"
  fi
  read -r val
  if [ -n "$val" ]; then
    echo "$var=$val" >> "$TMPENV"
  elif [ "$required" = "required" ]; then
    echo "  Warning: $label is required for the bot to work."
  fi
}

TMPENV=$(mktemp)
trap 'rm -f "$TMPENV"' EXIT

echo -e "${BOLD}AI Provider${NC}"
read_key "Kimi API Key" "KIMI_API_KEY" "required"
echo ""

echo -e "${BOLD}Telegram Bot${NC}"
read_key "Telegram Bot Token" "TELEGRAM_BOT_TOKEN" "required"
echo ""

echo -e "${BOLD}Optional keys${NC}"
read_key "Moonshot API Key (same as Kimi)" "MOONSHOT_API_KEY"
read_key "OpenAI API Key (for voice/Whisper)" "OPENAI_API_KEY"
read_key "Groq API Key (fallback)" "GROQ_API_KEY"
read_key "Discord Bot Token" "DISCORD_BOT_TOKEN"
read_key "PocketClaw Auth Token" "POCKETCLAW_TOKEN"
echo ""

# Check we got something
if [ ! -s "$TMPENV" ]; then
  echo "No keys entered. Aborting."
  exit 1
fi

echo -e "${DIM}--- Keys to push ---${NC}"
# Show names only (not values)
while IFS='=' read -r name _; do
  echo "  $name"
done < "$TMPENV"
echo ""

echo -n "Push these keys to the phone? [Y/n] "
read -r confirm
if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
  echo "Aborted."
  exit 0
fi

# Push via ADB
"$ADB" push "$TMPENV" "$DROPPATH" >/dev/null
echo -e "${GREEN}Keys pushed to phone.${NC}"
echo "The gateway will import them on next start."
echo ""

# Try SSH restart
"$ADB" forward tcp:"$SSH_PORT" tcp:"$SSH_PORT" 2>/dev/null || true
if ssh -i ~/.ssh/id_moto -p "$SSH_PORT" -o StrictHostKeyChecking=no -o ConnectTimeout=3 localhost true 2>/dev/null; then
  echo -n "SSH available. Restart gateway now? [Y/n] "
  read -r ans
  if [ "$ans" != "n" ] && [ "$ans" != "N" ]; then
    ssh -i ~/.ssh/id_moto -p "$SSH_PORT" -o StrictHostKeyChecking=no localhost \
      'export PATH=/data/data/com.termux/files/usr/bin:$PATH; restart-gw' 2>/dev/null
    echo -e "${GREEN}Gateway restarting. Give it ~30s to come up.${NC}"
  fi
else
  echo -e "${DIM}Tip: restart the gateway or reboot the phone to pick up the new keys.${NC}"
fi

echo ""
echo -e "${GREEN}Done! Message your Telegram bot to verify.${NC}"
