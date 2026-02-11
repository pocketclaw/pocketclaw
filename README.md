<div align="center">

```
 ██████╗  ██████╗  ██████╗██╗  ██╗███████╗████████╗ ██████╗██╗      █████╗ ██╗    ██╗
 ██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝██╔════╝██║     ██╔══██╗██║    ██║
 ██████╔╝██║   ██║██║     █████╔╝ █████╗     ██║   ██║     ██║     ███████║██║ █╗ ██║
 ██╔═══╝ ██║   ██║██║     ██╔═██╗ ██╔══╝     ██║   ██║     ██║     ██╔══██║██║███╗██║
 ██║     ╚██████╔╝╚██████╗██║  ██╗███████╗   ██║   ╚██████╗███████╗██║  ██║╚███╔███╔╝
 ╚═╝      ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝
```

**A modern AI agent running on a $0 phone from 2015.**<br>
**1GB RAM. Android 6. Snapdragon 410. It works.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Android 5+](https://img.shields.io/badge/Android-5%2B-green.svg)](https://www.android.com)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.2.9-blue.svg)](https://openclaw.ai)
[![Kimi K2.5](https://img.shields.io/badge/Kimi_K2.5-262K_context-purple.svg)](https://kimi.com)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-26A5E4.svg)](https://core.telegram.org/bots)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

**They said it couldn't be done. 17 hacks later, it's running.**

[Setup Guide](#-setup-guide) · [The 17 Hacks](HACKS.md) · [Troubleshooting](#-troubleshooting) · [Contributing](CONTRIBUTING.md)

</div>

---

## The Pitch

You have an old phone in a drawer. It's worthless. Nobody wants it.

We turned it into a **self-hosted AI assistant** that runs 24/7, answers on Telegram, uses a 262K context window, costs $0/month, and survives reboots on its own.

No cloud server. No subscription. No root required. Just a mass of hacks and stubborness.

```
You:     "hey, what's the weather like?"
Bot:     "I'm running on a Moto E2 from 2015 with 1GB of RAM.
          I have no idea what the weather is, but I'm impressed
          I can even answer you right now."
```

## What You Get

- **A Telegram bot** running 24/7 on a phone that belongs in a museum
- **Kimi K2.5** — 262K context window, free tier, zero cost
- **Fully autonomous** — auto-restarts on boot, works on any WiFi
- **17 documented hacks** — every impossible problem we hit, and how we solved it

## The Hardware

This was stress-tested on the **absolute worst-case scenario**:

| | Spec | Required | Actual | Gap |
|---|---|---|---|---|
| **RAM** | 3 GB | 1 GB | **3x under** |
| **Android** | 10+ | 6.0 | **4 versions behind** |
| **CPU** | ARM64 | ARM32 | **Wrong architecture** |
| **Node.js** | v22 | v12 max (native) | **10 major versions** |

If it runs on a Moto E2 from 2015, **it runs on anything you own.**

> Got a phone from 2018+? You'll have a *much* easier time. The guide still applies, just with fewer hacks needed.

## Architecture

```
┌─────────────┐         ┌─────────────────┐
│  Telegram    │◄───────►│  Kimi API       │
│  (you)       │         │  (free, 262K)   │
└──────┬───────┘         └────────┬────────┘
       │                          │
       └──────────┬───────────────┘
                  │
        ┌─────────▼──────────┐
        │  OpenClaw Gateway  │
        │  (port 9000)       │
        ├────────────────────┤
        │  proot Ubuntu      │
        │  Node.js 22        │
        ├────────────────────┤
        │  Termux            │
        ├────────────────────┤
        │  Android Phone     │
        │  (in a drawer)     │
        └────────────────────┘
```

All connections are **outbound**. The phone calls Telegram and Kimi — they never call back. This means: any WiFi works, any hotspot works, no port forwarding, no dynamic DNS. Plug it in and forget about it.

---

## 🚀 Setup Guide

### Prerequisites

- An Android 5+ phone (any brand, any condition)
- WiFi connection
- 10 minutes of patience (30 min on 1GB RAM devices)

### Step 1 — Install Termux

| Android Version | What to Install |
|---|---|
| 5-6 | Termux **v0.119.0-beta.3** `apt-android-5` from [GitHub Releases](https://github.com/termux/termux-app/releases) |
| 7+ | Latest Termux from [F-Droid](https://f-droid.org/packages/com.termux/) |

> **Do NOT install from Google Play** — the Play Store version is deprecated.

### Step 2 — Base packages

```bash
pkg update -y
pkg install -y proot-distro openssh
```

### Step 3 — Install Ubuntu

```bash
proot-distro install ubuntu
```

### Step 4 — Install Node.js

```bash
proot-distro login ubuntu
```

Inside Ubuntu:
```bash
apt update && apt install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # v22.x
exit
```

### Step 5 — Install OpenClaw

```bash
proot-distro login ubuntu
npm install -g openclaw
exit
```

### Step 6 — Deploy PocketClaw files

Clone this repo on your PC and push files to the phone:

```bash
# On your PC
git clone https://github.com/MonteiroRobin/pocketclaw.git
cd pocketclaw

# Push scripts to the phone
adb push scripts/hijack.js /sdcard/Download/
adb push scripts/start-openclaw.sh /sdcard/Download/
adb push scripts/restart-gw.sh /sdcard/Download/
adb push scripts/run-proot.sh /sdcard/Download/
adb push scripts/boot-openclaw.sh /sdcard/Download/
adb push config/openclaw.example.json /sdcard/Download/
adb push config/env.example /sdcard/Download/
```

Then in Termux:
```bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu

# Install scripts
cp /sdcard/Download/start-openclaw.sh $PREFIX/bin/start-openclaw
cp /sdcard/Download/restart-gw.sh $PREFIX/bin/restart-gw
cp /sdcard/Download/run-proot.sh $PREFIX/bin/run-proot
chmod +x $PREFIX/bin/start-openclaw $PREFIX/bin/restart-gw $PREFIX/bin/run-proot

# Install proot files
cp /sdcard/Download/hijack.js $ROOTFS/root/hijack.js
mkdir -p $ROOTFS/root/.openclaw
cp /sdcard/Download/openclaw.example.json $ROOTFS/root/.openclaw/openclaw.json

# Set up IPv6 DNS
printf "nameserver 2001:4860:4860::8888\nnameserver 2001:4860:4860::8844\n" > $ROOTFS/etc/resolv.conf
```

### Step 7 — Get your API keys

**Kimi API Key (free):**
1. Go to [kimi.com/code/console](https://www.kimi.com/code/console)
2. Create an API key (`sk-kimi-...`)

**Telegram Bot Token:**
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. `/newbot` → follow prompts → copy the token

### Step 8 — Configure

```bash
# Create the env file with your real keys
cat > $ROOTFS/root/.openclaw/env << EOF
KIMI_API_KEY=sk-kimi-YOUR_ACTUAL_KEY
MOONSHOT_API_KEY=sk-kimi-YOUR_ACTUAL_KEY
TELEGRAM_BOT_TOKEN=1234567890:YOUR_ACTUAL_TOKEN
EOF
chmod 600 $ROOTFS/root/.openclaw/env
```

### Step 9 — Launch

```bash
restart-gw
```

Wait 30-60 seconds. Then open Telegram and message your bot.

**If it replies, you're done.** 🎉

### Step 10 — Auto-start on boot (optional)

Install [Termux:Boot](https://github.com/termux/termux-boot/releases) and set up auto-start:

```bash
# Install via ADB from PC
curl -L -o termux-boot.apk "https://github.com/termux/termux-boot/releases/download/v0.8.1/termux-boot-app_v0.8.1+github.debug.apk"
adb install termux-boot.apk
# Open the app ONCE on the phone to activate it
```

```bash
# In Termux: install boot script
mkdir -p ~/.termux/boot
cp /sdcard/Download/boot-openclaw.sh ~/.termux/boot/start-openclaw.sh
chmod +x ~/.termux/boot/start-openclaw.sh
```

Now unplug the phone. Put it in a drawer. It restarts everything on its own after a reboot.

---

## ⚙️ Configuration

### Critical settings in `openclaw.json`

| Setting | Why it matters |
|---|---|
| `User-Agent: claude-code/1.0` | **Required.** Kimi API blocks requests without a recognized coding agent header. Must be set at both provider AND model level. |
| `plugins.entries.telegram.enabled: true` | **Required.** Without this, Telegram won't load even if `channels.telegram` is configured. |
| `reasoning: false` | Prevents extended thinking mode that can cause empty responses. |
| `network.autoSelectFamily: true` | Enables dual-stack IPv4/IPv6 for better connectivity. |
| `--max-old-space-size=384` | Caps V8 heap to 384MB. Critical for 1GB RAM devices. |

See [`config/openclaw.example.json`](config/openclaw.example.json) for the full working configuration.

---

## 🔧 Troubleshooting

<details>
<summary><b>Bot doesn't respond</b></summary>

1. Check processes: `ps | grep openclaw`
2. Check logs: `tail -20 $PREFIX/tmp/openclaw-gateway.log`
3. Test Telegram: `run-proot 'node -e "fetch(\"https://api.telegram.org/botTOKEN/getMe\").then(r=>r.json()).then(console.log)"'`
</details>

<details>
<summary><b>"fetch failed" errors</b></summary>

Network issue. Check WiFi. If IPv4 routing is broken, reboot the phone.
**Never kill `com.google.android.gms`** — it manages WiFi routing on Android.
</details>

<details>
<summary><b>"403 Kimi For Coding is currently only available for Coding Agents"</b></summary>

The `User-Agent: claude-code/1.0` header is missing. Set it at **both** provider and model level in `openclaw.json`.
</details>

<details>
<summary><b>"Message ordering conflict"</b></summary>

Send `/new` to the bot. This resets the session after gateway restarts.
</details>

<details>
<summary><b>Gateway won't start / "already running"</b></summary>

Stale lock files. Use `restart-gw` (handles cleanup automatically) or manually:
```bash
rm -f $ROOTFS/tmp/openclaw/*.lock
```
</details>

<details>
<summary><b>Out of memory / phone freezes</b></summary>

- Verify `--max-old-space-size=384` is in NODE_OPTIONS
- Kill unnecessary apps: `am force-stop <package>`
- **Never kill** `com.google.android.gms` (breaks WiFi)
</details>

<details>
<summary><b>Can't kill processes from ADB shell</b></summary>

ADB runs as UID `shell`, can't signal Termux processes. Kill from Termux or SSH instead.
</details>

---

## 📂 Project Structure

```
pocketclaw/
├── README.md                      # You are here
├── HACKS.md                       # The 17 hacks — the full war story
├── CONTRIBUTING.md                 # How to contribute
├── LICENSE                         # MIT
├── config/
│   ├── openclaw.example.json      # Working config (copy & fill in keys)
│   └── env.example                # API key template
└── scripts/
    ├── start-openclaw.sh          # Gateway launcher
    ├── restart-gw.sh              # Clean kill + restart
    ├── run-proot.sh               # Run commands inside proot
    ├── boot-openclaw.sh           # Termux:Boot auto-start
    └── hijack.js                  # os.networkInterfaces() bypass
```

### On the phone

```
$PREFIX/bin/
  ├── start-openclaw       # → scripts/start-openclaw.sh
  ├── restart-gw           # → scripts/restart-gw.sh
  └── run-proot            # → scripts/run-proot.sh

$ROOTFS/root/
  ├── hijack.js            # → scripts/hijack.js
  └── .openclaw/
      ├── openclaw.json    # → config/openclaw.example.json (with real keys)
      └── env              # → config/env.example (with real keys)

~/.termux/boot/
  └── start-openclaw.sh   # → scripts/boot-openclaw.sh
```

---

## 🤝 The 17 Hacks

Every single problem we hit — and the hack that fixed it. From proot crashes to User-Agent spoofing to discovering that killing Google Play Services permanently breaks WiFi.

**[Read the full story →](HACKS.md)**

---

## Tested With

| Component | Version |
|---|---|
| Phone | Moto E2 4G LTE (XT1524), 2015 |
| Android | 6.0 Marshmallow |
| RAM | 1 GB |
| Termux | v0.119.0-beta.3 (apt-android-5) |
| proot-distro | Ubuntu 25.10 (armhf) |
| Node.js | 22.12.0 |
| OpenClaw | 2026.2.9 |
| Model | Kimi For Coding (K2.5, 262K context) |

---

## Contributing

Got it running on a different phone? Found a better hack? Want to add support for another AI provider?

**[See CONTRIBUTING.md →](CONTRIBUTING.md)**

---

## License

MIT — do whatever you want with it.

---

<div align="center">

**Built with stubbornness on a mass of impossible constraints.**

*A phone from 2015. 1GB of RAM. 17 hacks. $0 spent.*<br>
*If it can run AI, anything can.*

**[Star this repo](https://github.com/MonteiroRobin/pocketclaw)** if you think old phones deserve a second life.

</div>
