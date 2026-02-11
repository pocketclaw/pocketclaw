# PocketClaw

### Running a modern AI agent on a $0 phone from 2015. 1GB RAM. Android 6. It works.

Turn a retired Android phone into a self-hosted AI assistant accessible via Telegram, powered by [OpenClaw](https://openclaw.ai) and the free Kimi API.

This was built and tested on a **Moto E2 with 1GB of RAM** — the absolute bottom of the barrel. If it runs here, it'll run on anything you have in a drawer.

## What You Get

- A Telegram bot (`@yourbot`) running 24/7 on an old phone
- Kimi K2.5 model (262K context window) - **free tier**
- No cloud server needed, no monthly costs
- Accessible from anywhere via Telegram

## Hardware

| Component | Details |
|-----------|---------|
| Phone | Moto E2 4G LTE (XT1524), ~2015 |
| SoC | Snapdragon 410 (ARM Cortex-A53) |
| RAM | **1 GB** |
| Android | 6.0 Marshmallow |
| Kernel | 3.10.49 armv7l |

**Any Android 5+ phone should work.** This guide was stress-tested on the worst-case scenario: 1GB RAM, a 2015 budget phone, Android 6. If your phone is newer or has more RAM, you'll have an easier time. The gateway just boots faster and you can raise the V8 heap limit.

## Architecture

```
[Telegram] <---> [Kimi API (api.kimi.com)]
     ^                    ^
     |                    |
     +--- [OpenClaw Gateway] ---+
              |
         [proot Ubuntu]
              |
         [Termux]
              |
         [Android Phone]
```

OpenClaw runs inside a proot Ubuntu environment within Termux. It connects to Telegram via long-polling and forwards messages to the Kimi API for inference.

---

## Step-by-Step Setup

### 1. Install Termux

For Android 5-6, you need the legacy `apt-android-5` variant:

- Download Termux **v0.119.0-beta.3** (apt-android-5) from [F-Droid archive](https://f-droid.org/packages/com.termux/) or [GitHub Releases](https://github.com/termux/termux-app/releases)
- For Android 7+: use the latest Termux from F-Droid

> **Do NOT install from Google Play** - the Play Store version is deprecated and broken.

### 2. Set Up Termux Base Packages

```bash
pkg update -y
pkg install -y proot-distro openssh
```

### 3. Install Ubuntu via proot-distro

```bash
proot-distro install ubuntu
```

This installs Ubuntu (25.10 at time of writing) in:
```
$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
```

### 4. Enter Ubuntu and Install Node.js

```bash
proot-distro login ubuntu
```

Inside Ubuntu:

```bash
apt update && apt install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # Should show v22.x
```

### 5. Install OpenClaw

```bash
npm install -g openclaw
openclaw --version   # 2026.2.9 or later
```

Exit the proot shell (`exit`) back to Termux.

### 6. Create the Network Bypass Script

OpenClaw calls `os.networkInterfaces()` which crashes under proot (no `/proc/net` access). We bypass it:

```bash
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
cat > "$ROOTFS/root/hijack.js" << 'EOF'
const os = require("os"); os.networkInterfaces = () => ({});
EOF
```

### 7. Set Up DNS (IPv6)

Android proot may have broken IPv4 routing. Use IPv6 DNS for reliability:

```bash
cat > "$ROOTFS/etc/resolv.conf" << 'EOF'
nameserver 2001:4860:4860::8888
nameserver 2001:4860:4860::8844
EOF
```

### 8. Get Your API Keys

#### Kimi API Key (Free)

1. Go to [kimi.com/code/console](https://www.kimi.com/code/console)
2. Sign up / log in
3. Create an API key (starts with `sk-kimi-...`)

#### Telegram Bot Token

1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts
3. Copy the bot token (format: `1234567890:AAH...`)

### 9. Create the Environment File

```bash
cat > "$ROOTFS/root/.openclaw/env" << EOF
KIMI_API_KEY=sk-kimi-YOUR_KEY_HERE
MOONSHOT_API_KEY=sk-kimi-YOUR_KEY_HERE
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
EOF
chmod 600 "$ROOTFS/root/.openclaw/env"
```

> Both `KIMI_API_KEY` and `MOONSHOT_API_KEY` should be set to the same Kimi key. OpenClaw checks both depending on the provider.

### 10. Create the OpenClaw Configuration

```bash
mkdir -p "$ROOTFS/root/.openclaw"
cat > "$ROOTFS/root/.openclaw/openclaw.json" << 'JSONEOF'
{
  "models": {
    "providers": {
      "kimi-coding": {
        "baseUrl": "https://api.kimi.com/coding/v1",
        "apiKey": "${KIMI_API_KEY}",
        "api": "openai-completions",
        "headers": {
          "User-Agent": "claude-code/1.0"
        },
        "models": [
          {
            "id": "kimi-for-coding",
            "name": "Kimi For Coding",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 262144,
            "maxTokens": 8192,
            "headers": {
              "User-Agent": "claude-code/1.0"
            }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "kimi-coding/kimi-for-coding"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "open",
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "allowFrom": ["*"],
      "groupPolicy": "allowlist",
      "streamMode": "partial",
      "network": {
        "autoSelectFamily": true
      }
    }
  },
  "gateway": {
    "port": 9000,
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "change-me-to-a-random-string"
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
JSONEOF
```

### Critical Configuration Notes

| Setting | Why |
|---------|-----|
| `headers: {"User-Agent": "claude-code/1.0"}` | **Required.** The Kimi Coding API rejects requests without a recognized coding agent User-Agent. Set at both provider AND model level. |
| `plugins.entries.telegram.enabled: true` | **Required.** Without this, the Telegram plugin won't load even if `channels.telegram.enabled` is true. |
| `network.autoSelectFamily: true` | Tells Node.js to try both IPv4 and IPv6 when connecting. |
| `reasoning: false` | Prevents the model from using extended thinking mode. |
| `api: "openai-completions"` | Kimi uses the OpenAI-compatible completions API. |

### 11. Create Helper Scripts

#### `$PREFIX/bin/run-proot` — Run commands inside proot

```bash
cat > "$PREFIX/bin/run-proot" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp

if [ -f "$ROOTFS/root/.openclaw/env" ]; then
  source "$ROOTFS/root/.openclaw/env"
  export MOONSHOT_API_KEY
  export KIMI_API_KEY
fi

proot \
  --link2symlink \
  --kill-on-exit \
  --root-id \
  --rootfs=$ROOTFS \
  --bind=/dev \
  --bind=/proc \
  --bind=/sys \
  --bind=$PREFIX/tmp:/tmp \
  --bind=/storage/emulated/0:/sdcard \
  --cwd=/root \
  /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && export HOME=/root && export NODE_OPTIONS='-r /root/hijack.js' && export MOONSHOT_API_KEY='$MOONSHOT_API_KEY' && export KIMI_API_KEY='$KIMI_API_KEY' && $*"
EOF
chmod +x "$PREFIX/bin/run-proot"
```

#### `$PREFIX/bin/start-openclaw` — Start the gateway

```bash
cat > "$PREFIX/bin/start-openclaw" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp

source "$ROOTFS/root/.openclaw/env" 2>/dev/null
export MOONSHOT_API_KEY
export KIMI_API_KEY
export TELEGRAM_BOT_TOKEN

termux-wake-lock 2>/dev/null

# Free RAM: kill heavy Android processes (do NOT kill com.google.android.gms)
am force-stop com.google.android.inputmethod.latin 2>/dev/null
am force-stop android.process.media 2>/dev/null
am force-stop android.process.acore 2>/dev/null

echo "Starting OpenClaw gateway..."
echo "Port: 9000"

proot \
  --link2symlink \
  --kill-on-exit \
  --root-id \
  --rootfs=$ROOTFS \
  --bind=/dev \
  --bind=/proc \
  --bind=/sys \
  --bind=$PREFIX/tmp:/tmp \
  --bind=/storage/emulated/0:/sdcard \
  --cwd=/root \
  /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    && export HOME=/root \
    && export NODE_OPTIONS='-r /root/hijack.js --max-old-space-size=384' \
    && export MOONSHOT_API_KEY='$MOONSHOT_API_KEY' \
    && export KIMI_API_KEY='$KIMI_API_KEY' \
    && export TELEGRAM_BOT_TOKEN='$TELEGRAM_BOT_TOKEN' \
    && export XDG_RUNTIME_DIR=/tmp \
    && export DBUS_SESSION_BUS_ADDRESS=disabled: \
    && openclaw gateway run --port 9000 --verbose 2>&1"
EOF
chmod +x "$PREFIX/bin/start-openclaw"
```

> **`--max-old-space-size=384`** is critical for 1GB RAM devices. It caps V8 heap to 384MB to prevent OOM kills.

> **Do NOT kill `com.google.android.gms`** — it manages WiFi routing. Killing it permanently breaks IPv4 connectivity until reboot.

#### `$PREFIX/bin/restart-gw` — Clean restart

```bash
cat > "$PREFIX/bin/restart-gw" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
pkill -9 -f openclaw 2>/dev/null
pkill -9 -f proot 2>/dev/null
sleep 3

ROOTFS=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu
rm -f "$ROOTFS/tmp/openclaw/"*.lock 2>/dev/null
rm -f /data/data/com.termux/files/usr/tmp/openclaw-gateway.log

remaining=$(ps | grep -E 'proot|openclaw' | grep -v grep | wc -l)
echo "Remaining processes: $remaining"

echo "Starting gateway..."
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &
echo "PID: $!"
EOF
chmod +x "$PREFIX/bin/restart-gw"
```

### 12. Set Up SSH Access (Optional, Recommended)

Allows managing the phone from a PC:

```bash
# In Termux
sshd
```

On your PC, copy your SSH key:
```bash
# Generate a key (if you don't have one)
ssh-keygen -t ed25519 -f ~/.ssh/id_phone -N ""

# Copy to phone
adb push ~/.ssh/id_phone.pub /sdcard/Download/
# Then in Termux:
cat /sdcard/Download/id_phone.pub >> ~/.ssh/authorized_keys
```

Connect via ADB port forwarding:
```bash
adb forward tcp:8022 tcp:8022
ssh -i ~/.ssh/id_phone -p 8022 localhost
```

Or over WiFi directly (no USB needed):
```bash
# Find phone's IP in Termux: ip addr show wlan0
ssh -i ~/.ssh/id_phone -p 8022 192.168.x.x
```

### 13. Auto-Start on Boot (Standalone Mode)

This is what lets you unplug the phone and leave it running as a headless server.

#### Install Termux:Boot

From a PC with ADB:
```bash
# Download
curl -L -o termux-boot.apk "https://github.com/termux/termux-boot/releases/download/v0.8.1/termux-boot-app_v0.8.1+github.debug.apk"

# Install
adb install termux-boot.apk
```

Or download the APK directly on the phone from [GitHub Releases](https://github.com/termux/termux-boot/releases).

> **Important:** Open the Termux:Boot app once after install. This activates the boot receiver. You only need to do this once.

#### Create the boot script

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-openclaw.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Wait for WiFi to connect
sleep 15

# Start SSH server
sshd

# Start the gateway
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &

echo "Boot complete: sshd + openclaw started"
EOF
chmod +x ~/.termux/boot/start-openclaw.sh
```

Now when the phone reboots (battery dies, power cycle, crash), everything restarts automatically: WiFi connects -> Termux:Boot fires -> sshd + gateway start -> bot is back online. Zero intervention.

### 14. Launch!

From Termux (or SSH):

```bash
restart-gw
```

Wait ~30-60 seconds for the gateway to boot (1GB RAM is slow).

### 15. Quick Test

Open Telegram. Send any message to your bot.

If it replies, **you're done.** The whole stack is working: Termux -> proot -> OpenClaw -> Telegram -> Kimi API -> response.

If you get "Message ordering conflict", send `/new` first to reset the session.

### 16. Unplug and Go

You can now disconnect the phone from your PC. The bot is self-sufficient.

**On any WiFi / hotspot:** The bot uses outbound connections only (long-polling to Telegram, API calls to Kimi). No port forwarding, no fixed IP needed. Connect the phone to any WiFi network or mobile hotspot and it just works.

**Battery life:** With `termux-wake-lock` active and the screen off, expect roughly a full day on a 2000mAh battery. Plug it into any USB charger for permanent operation.

**Take it with you:** The phone works on any internet connection. Home WiFi, hotel WiFi, phone hotspot on the train — as long as it has a network, the bot responds on Telegram.

### 17. Check Logs

```bash
# Gateway stdout
tail -f $PREFIX/tmp/openclaw-gateway.log

# Internal structured logs
tail -f $PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu/tmp/openclaw/openclaw-$(date +%Y-%m-%d).log
```

---

## Troubleshooting

### Bot doesn't respond

1. Check the gateway is running: `ps | grep openclaw`
2. Check logs for errors: `tail -20 $PREFIX/tmp/openclaw-gateway.log`
3. Verify Telegram connectivity:
   ```bash
   run-proot 'node -e "fetch(\"https://api.telegram.org/botYOUR_TOKEN/getMe\").then(r=>r.json()).then(console.log)"'
   ```

### "fetch failed" errors

- Usually a network issue. Check WiFi is connected.
- Reboot the phone if IPv4 routing is broken (common after killing GMS).
- Verify DNS works: `run-proot 'node -e "fetch(\"https://api.kimi.com\").then(r=>console.log(r.status))"'`

### "403 Kimi For Coding is currently only available for Coding Agents"

The `User-Agent: claude-code/1.0` header is not being sent. Ensure it's set at **both** provider and model level in `openclaw.json`.

### "Message ordering conflict"

Send `/new` to the bot to start a fresh session. This happens after gateway restarts when old Telegram updates are still queued.

### Gateway won't start / "already running"

Lock files may be stale. Clean them:
```bash
rm -f $PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu/tmp/openclaw/*.lock
```
Or just use `restart-gw` which handles this automatically.

### Out of memory / phone freezes

- Ensure `--max-old-space-size=384` is set in NODE_OPTIONS
- Kill unnecessary Android apps: `am force-stop <package>`
- **Never kill** `com.google.android.gms` (breaks WiFi)

### Can't kill gateway processes from ADB shell

ADB shell runs as UID `shell` and can't signal Termux processes (different UID). Kill from Termux or SSH instead.

### nohup log is empty

Node.js stdout is fully buffered when piped to a file. Check the internal logs at `/tmp/openclaw/openclaw-*.log` instead.

---

## Gotchas We Discovered

| Gotcha | Details |
|--------|---------|
| **Kimi Coding != Moonshot API** | Keys from `kimi.com/code/console` only work with `api.kimi.com/coding/v1`, NOT `api.moonshot.cn/v1`. They are separate services. |
| **User-Agent gating** | The Kimi Coding API checks `User-Agent` and blocks requests not from recognized coding agents. `claude-code/1.0` works. |
| **Two-flag Telegram enable** | Telegram needs BOTH `channels.telegram.enabled: true` AND `plugins.entries.telegram.enabled: true`. Missing either = no bot. |
| **`openclaw doctor --fix` resets plugins** | Running `doctor --fix` may set `plugins.entries.telegram.enabled: false`. Always check after running it. |
| **`openclaw channels add` is broken** | The CLI command doesn't work for Telegram. Configure directly in `openclaw.json`. |
| **GMS manages WiFi routing** | Killing Google Play Services (`com.google.android.gms`) permanently removes the IPv4 default route until reboot. |
| **proot has no real network stack** | `os.networkInterfaces()` crashes. The `hijack.js` workaround returns `{}`. |
| **IPv6 DNS is more reliable** | Android proot often has broken IPv4 routing. IPv6 DNS (`2001:4860:4860::8888`) works reliably. |
| **Lock files block restart** | OpenClaw creates `/tmp/openclaw/*.lock` files that persist after kill and prevent restart. |

---

## File Layout on Phone

```
$PREFIX = /data/data/com.termux/files/usr
$ROOTFS = $PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu

$PREFIX/bin/
  ├── start-openclaw     # Main launcher script
  ├── restart-gw         # Clean restart script
  └── run-proot          # Run commands inside proot

$ROOTFS/root/
  ├── hijack.js          # os.networkInterfaces() bypass
  └── .openclaw/
      ├── openclaw.json  # Main configuration
      └── env            # API keys (chmod 600)

$ROOTFS/etc/
  └── resolv.conf        # IPv6 DNS servers

$PREFIX/tmp/
  └── openclaw-gateway.log  # Gateway stdout log

$ROOTFS/tmp/openclaw/
  ├── openclaw-YYYY-MM-DD.log  # Internal structured logs
  └── *.lock                    # Gateway lock files
```

---

## Tested With

- Moto E2 4G LTE (XT1524), Android 6.0, 1GB RAM
- Termux v0.119.0-beta.3 (apt-android-5)
- proot-distro with Ubuntu 25.10 (armhf)
- Node.js 22.12.0
- OpenClaw 2026.2.9
- Kimi For Coding API (free tier, 262K context)

---

## License

MIT

## Credits

- [OpenClaw](https://openclaw.ai) - Open-source AI gateway
- [Kimi / Moonshot AI](https://kimi.com) - Free LLM API
- [Termux](https://termux.dev) - Terminal emulator for Android
- [proot-distro](https://github.com/termux/proot-distro) - Linux distribution installer for Termux
