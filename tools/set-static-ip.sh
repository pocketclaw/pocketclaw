#!/system/bin/sh
# Set static IP for WiFi on Moto E2 (540x960) via UI automation
# Usage: adb shell sh /sdcard/pocketclaw/tools/set-static-ip.sh [IP] [GATEWAY] [DNS1] [DNS2]

IP="${1:-192.168.1.100}"
GW="${2:-192.168.1.1}"
DNS1="${3:-8.8.8.8}"
DNS2="${4:-8.8.4.4}"

echo "Setting static IP: $IP gw $GW dns $DNS1 $DNS2"

# Open WiFi settings
am start -a android.settings.WIFI_SETTINGS
sleep 3

# Long-press on first connected network (at y=259)
input swipe 270 259 270 259 1500
sleep 2

# Check if context menu or direct edit dialog appeared
# Tap "Modifier le réseau" area (second option in context menu)
# On some cases it goes directly to edit dialog
DUMP=$(uiautomator dump /dev/tty 2>/dev/null)
if echo "$DUMP" | grep -q "Modifier le réseau"; then
    # Context menu: tap "Modifier le réseau"
    input tap 270 532
    sleep 2
elif echo "$DUMP" | grep -q "Options avancées"; then
    # Already in edit dialog
    :
else
    echo "ERROR: unexpected UI state"
    exit 1
fi

# Check "Options avancées"
input tap 270 392
sleep 1

# Scroll down to reveal IP settings
input swipe 270 420 270 250 300
sleep 1

# Tap DHCP dropdown
input tap 250 416
sleep 1

# Select "Statique"
input tap 250 506
sleep 2

# Scroll down more to see IP fields
input swipe 270 420 270 150 500
sleep 1

# Now use TAB key navigation which selects all text in each field
# First, tap the IP address field
input tap 270 280
sleep 0.3

# Select all with Ctrl+A (keyevent 29 with CTRL meta)
# On Android 6: use triple-tap to select word, but for IP fields
# let's just delete char by char from the end
# Actually, we use MOVE_END + SHIFT+HOME to select all, then type to replace

# For the IP field: tap it, triple-tap to select all, type new value
input tap 270 280
sleep 0.1
input tap 270 280
sleep 0.1
input tap 270 280
sleep 0.3

# Type replacement - selected text should be replaced
input text "$IP"
sleep 0.5

# Move to gateway field via TAB
input keyevent 61
sleep 0.3

# TAB should select all text in gateway field, just type to replace
input text "$GW"
sleep 0.5

# TAB to prefix length field
input keyevent 61
sleep 0.3
input text "24"
sleep 0.5

# TAB to DNS 1
input keyevent 61
sleep 0.3
input text "$DNS1"
sleep 0.5

# TAB to DNS 2
input keyevent 61
sleep 0.3
input text "$DNS2"
sleep 0.5

# Dismiss keyboard
input keyevent 4
sleep 1

# Dump UI to verify before saving
uiautomator dump /sdcard/ui-verify.xml 2>/dev/null
echo "--- Field values ---"
cat /sdcard/ui-verify.xml | grep -oE 'resource-id="com.android.settings:id/(ipaddress|gateway|network_prefix_length|dns1|dns2)"[^/]*' | grep -oE 'resource-id="[^"]*".*text="[^"]*"' 2>/dev/null
echo "---"

# Find and tap "Enregistrer"
# Get bounds from dump
SAVE_BOUNDS=$(cat /sdcard/ui-verify.xml | grep -oP 'text="Enregistrer"[^/]*bounds="\K[^"]*')
if [ -n "$SAVE_BOUNDS" ]; then
    # Parse bounds [x1,y1][x2,y2] and compute center
    X1=$(echo "$SAVE_BOUNDS" | grep -oP '^\[\K[0-9]+')
    Y1=$(echo "$SAVE_BOUNDS" | grep -oP '^\[[0-9]+,\K[0-9]+')
    X2=$(echo "$SAVE_BOUNDS" | grep -oP '\]\[\K[0-9]+')
    Y2=$(echo "$SAVE_BOUNDS" | grep -oP '\]\[[0-9]+,\K[0-9]+')
    CX=$(( (X1 + X2) / 2 ))
    CY=$(( (Y1 + Y2) / 2 ))
    echo "Tapping Enregistrer at ($CX, $CY)"
    input tap $CX $CY
    sleep 2
    echo "Static IP configured successfully!"
else
    echo "ERROR: Could not find Enregistrer button"
    exit 1
fi
