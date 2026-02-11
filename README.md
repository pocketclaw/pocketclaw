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
[![Any LLM](https://img.shields.io/badge/Any_LLM-OpenAI_compatible-purple.svg)](#-pick-your-ai)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-26A5E4.svg)](https://core.telegram.org/bots)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

**They said it couldn't be done. 20 hacks later, it's running.**

[Setup Guide](#-setup-guide) · [The 20 Hacks](HACKS.md) · [Troubleshooting](#-troubleshooting) · [Contributing](CONTRIBUTING.md)

</div>

---

## The Pitch

You have an old phone in a drawer. It's worthless. Nobody wants it.

We turned it into a **self-hosted AI assistant** that runs 24/7, answers on Telegram, and survives reboots on its own.

No cloud server. No root required. Bring your own AI — free or paid, your choice. Just a mass of hacks and stubbornness.

```
You:     "hey, what's the weather like?"
Bot:     "I'm running on a Moto E2 from 2015 with 1GB of RAM.
          I have no idea what the weather is, but I'm impressed
          I can even answer you right now."
```

## What You Get

- **A Telegram bot** running 24/7 on a phone that belongs in a museum
- **Any AI you want** — works with any OpenAI-compatible provider (see [Pick Your AI](#-pick-your-ai))
- **Voice messages** — send a voice note, get a text reply (via OpenAI Whisper)
- **Fully autonomous** — watchdog + health checks auto-restart on crash or freeze, survives reboots
- **`pocketclaw` CLI** — `start`, `stop`, `restart`, `status`, `logs`, `monitor` from one command
- **RAM-optimized** — runs in 350 MB V8 heap with periodic GC and ESM stubs on hardware that has 1 GB total
- **20 documented hacks** — every impossible problem we hit, and how we solved it

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
│  Telegram    │◄───────►│  Any LLM API    │
│  (you)       │         │  (your choice)  │
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

All connections are **outbound**. The phone calls Telegram and your AI provider — they never call back. This means: any WiFi works, any hotspot works, no port forwarding, no dynamic DNS. Plug it in and forget about it.

---

## 📊 Performance

Running a modern AI gateway on 1 GB RAM requires aggressive optimization. Here's what we measured and tuned:

### Evolution

Every version squeezed more out of the same hardware:

| | **v0** Initial | **v1** Hacks | **v2** Optim | **v3** Stubs |
|---|---|---|---|---|
| **Gateway RSS** | ~224 MB | ~224 MB | 233 MB | **183 MB** |
| **V8 heap** | 384 MB | 384 MB | 384 MB | **350 MB** |
| **Periodic GC** | - | - | 60s, ~11 MB/cycle | 60s, ~11 MB/cycle |
| **ESM stubs** | - | - | - | **9 packages stubbed** |
| **node_modules** | 413 MB | 413 MB | 413 MB | **151 MB** |
| **Disk free** | ~100 MB | ~120 MB | 148 MB | **471 MB** |
| **Crash recovery** | manual | watchdog loop | + healthcheck cron | + healthcheck cron |
| **Monitoring** | - | - | CSV every 5 min | CSV every 5 min |

**Total gains v0 → v3:** -41 MB RSS (-18%), +371 MB disk, -262 MB node_modules (-63%), fully autonomous.

### Memory budget

| Component | RAM | Notes |
|---|---|---|
| Android + GMS | ~430 MB | Not rootable — Google Play Services can't be frozen |
| OpenClaw gateway | ~183 MB | Telegram only, ESM stubs for unused channels/providers |
| V8 heap headroom | ~167 MB | Boot peak needs ~340 MB, then settles to ~183 MB |
| **Total needed** | **~780 MB** | On 920 MB total — 140 MB margin |

### What we tuned

| Optimization | Impact |
|---|---|
| `--max-old-space-size=350` | Caps V8 heap. 256/320 OOM at boot, 350 is the minimum with stubs. |
| `--expose-gc` + periodic GC | Explicit `global.gc()` every 60s frees ~10 MB per cycle |
| ESM stub packages | Replace 9 unused SDKs (Slack, Discord, LINE, WhatsApp, Playwright, AWS Bedrock, Google Gemini) with empty ESM exports. Saves ~40 MB RSS and 262 MB disk. |
| Kill GMS sub-processes at startup | Frees ~50-100 MB temporarily (they respawn slowly) |
| Compile cache | Node 22's bytecode cache, faster cold starts |
| Concurrency limits | `maxConcurrency: 1`, `maxQueueSize: 2` — no parallel requests |
| npm package cleanup | Delete 13 packages with 0 imports (types, build tools, unused SDKs) — saves 262 MB disk |
| npm cache cleanup | Clear `~/.npm/` after installs — saves ~220 MB disk |

### What we tested and ruled out

| Idea | Result |
|---|---|
| V8 startup snapshot (`--build-snapshot`) | Builds OK (5 MB blob) but ESM restore fails: `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` |
| CJS module stubs (block `require()`) | OpenClaw is 100% ESM bundled by Rolldown — 0 CJS `require()` calls to intercept |
| Delete unused npm packages | ESM resolves all imports at link-time, even if code paths are never reached. Deleting *imported* packages breaks boot — stubs are the fix. Packages with 0 imports (types, build tools, unused SDKs) can be safely deleted. |
| Running without proot | Node v22 works via `ld-linux-armhf.so.3` trick, but no RAM savings (same V8 heap) |
| `--optimize-for-size` | Not allowed in `NODE_OPTIONS` (Node 22 restriction) |
| `--jitless` | Works but -6 to -40% CPU perf — not worth it on slow hardware |
| `--lite-mode` | V8 compile-time only, not a runtime flag |
| Bun runtime | No ARM32 build available |

### Monitoring

The `monitor` script logs RAM, CPU, swap, disk, battery every 5 minutes to a CSV. The `logrotate` cron trims everything to 24h. The `healthcheck` cron restarts the gateway if it stops responding.

```
$ pocketclaw status
=== PocketClaw Status ===
Gateway:  RUNNING (PID 12345)
Uptime:   up 3 days, 2:15
RAM:      370MB available / 898MB total
Gateway:  183MB RSS
Swap:     45MB used (swappiness=100)
Disk:     471MB free
Battery:  87%, 31.2°C
Crons:    2 active
```

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
adb push scripts/create-stubs.sh /sdcard/Download/
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

# Create ESM stubs (saves ~40 MB RAM + 262 MB disk)
bash /sdcard/Download/create-stubs.sh

# Install proot files
cp /sdcard/Download/hijack.js $ROOTFS/root/hijack.js
mkdir -p $ROOTFS/root/.openclaw
cp /sdcard/Download/openclaw.example.json $ROOTFS/root/.openclaw/openclaw.json

# Set up IPv6 DNS
printf "nameserver 2001:4860:4860::8888\nnameserver 2001:4860:4860::8844\n" > $ROOTFS/etc/resolv.conf
```

### Step 7 — Get your API keys

**AI Provider API Key:** Pick any provider from the [Pick Your AI](#-pick-your-ai) section below. Get an API key from their dashboard.

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
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY
EOF
chmod 600 $ROOTFS/root/.openclaw/env
```

> **OPENAI_API_KEY is optional** — only needed for voice message transcription (Whisper). The bot works fine without it, you just won't be able to send voice notes.

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

### Step 11 — Harden for 24/7 (recommended)

The phone will sleep with the screen off. These settings keep WiFi and Termux alive in the background:

```bash
# On your PC, via ADB — run once
adb shell settings put global wifi_sleep_policy 2          # WiFi never sleeps
adb shell dumpsys deviceidle whitelist +com.termux         # Exempt Termux from Doze
adb shell dumpsys deviceidle disable                       # Disable Doze entirely
```

> **Don't disable screen sleep.** The phone should go to sleep normally — WiFi stays on, Termux runs in the background, and the watchdog restarts the gateway if it ever crashes.

The `start-openclaw` script includes a **watchdog loop**: if the gateway dies (network error, OOM, etc.), it waits 10 seconds, cleans lock files, and restarts automatically. No manual intervention needed.

---

## 🧠 Pick Your AI

OpenClaw works with **30+ providers** out of the box. Just change the provider, model name, and API key in `openclaw.json`. Model format is always `provider/model-name`.

### Free tier providers (no credit card needed)

| Provider | ID | Free Tier | Best Models | Context |
|---|---|---|---|---|
| **[Google Gemini](https://ai.google.dev/)** | `google` | 1,000 req/day, 250K TPM | Gemini 2.5 Pro/Flash | **1M** |
| **[Groq](https://console.groq.com/)** | `groq` | 500K tokens/day | Llama 4, Qwen3 | 131K |
| **[Cerebras](https://cloud.cerebras.ai/)** | `cerebras` | ~1M tokens/day | Llama 3.3 70B, GLM 4.7 | 128K |
| **[SambaNova](https://cloud.sambanova.ai/)** | custom | 10-30 RPM | Llama 405B | 128K |
| **[OpenRouter](https://openrouter.ai/)** | `openrouter` | Free `:free` models | DeepSeek, Gemini, Llama | Varies |
| **[Mistral](https://console.mistral.ai/)** | `mistral` | 1B tokens/month (2 RPM) | Mistral Small, Pixtral | 128K |
| **[Venice AI](https://venice.ai/)** | `venice` | Free tier available | Llama 3.3 70B | 128K |

### Paid providers

| Provider | ID | Pricing | Best Models | Context |
|---|---|---|---|---|
| **[Anthropic](https://console.anthropic.com/)** | `anthropic` | Pay-per-token | Claude Opus 4.6, Sonnet 4.5 | 200K |
| **[OpenAI](https://platform.openai.com/)** | `openai` | Pay-per-token | GPT-5.2, GPT-5 Mini | 128K |
| **[Kimi Coding](https://kimi.com/code)** | custom | ~$19/month | Kimi K2.5 | 262K |
| **[xAI (Grok)](https://x.ai/api)** | `xai` | $25 free credit then paid | Grok 4, Grok 4 Mini | 131K |
| **[DeepSeek](https://platform.deepseek.com/)** | custom | $0.03-$0.42/M tokens | DeepSeek V3.2, R1 | 128K |
| **[Amazon Bedrock](https://aws.amazon.com/bedrock/)** | `amazon-bedrock` | AWS pricing | Claude, Llama, etc. | Varies |
| **[Google Vertex AI](https://cloud.google.com/vertex-ai)** | `google-vertex` | GCP pricing | Gemini models | 1M |
| **[Z.AI (Zhipu)](https://open.bigmodel.cn/)** | `zai` | Pay-per-token | GLM-4.7, GLM-4.6v | 128K |
| **[MiniMax](https://www.minimax.io/)** | custom | Pay-per-token | MiniMax M2.1 | 128K |

### Local models (free, runs on your network)

| Provider | ID | Setup |
|---|---|---|
| **[Ollama](https://ollama.com/)** | `ollama` | Auto-discovered at `localhost:11434` |
| **[LM Studio](https://lmstudio.ai/)** | custom | `http://localhost:1234/v1` |
| **[vLLM](https://docs.vllm.ai/)** | custom | Any OpenAI-compatible `/v1` endpoint |

> **This guide uses Kimi K2.5** because that's what we stress-tested PocketClaw with. But if you want $0/month, grab a free provider above — **Gemini and Groq** are the easiest to set up. For full privacy, run a local model with Ollama.

---

## ⚙️ Configuration

### Critical settings in `openclaw.json`

| Setting | Why it matters |
|---|---|
| `User-Agent: claude-code/1.0` | **Kimi only.** Kimi API blocks requests without a recognized coding agent header. Not needed for other providers. |
| `plugins.entries.telegram.enabled: true` | **Required.** Without this, Telegram won't load even if `channels.telegram` is configured. |
| `reasoning: false` | Prevents extended thinking mode that can cause empty responses. |
| `network.autoSelectFamily: true` | Enables dual-stack IPv4/IPv6 for better connectivity. |
| `--max-old-space-size=350` | Caps V8 heap to 350 MB. 256/320 OOM at boot, 384 without stubs — 350 works with ESM stubs. |
| `--expose-gc` | Enables `global.gc()`. Combined with hijack.js timer, frees ~10 MB every 60s. |
| `maxConcurrency: 1` | One request at a time. More would OOM on 1 GB RAM. |

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

- Verify `--max-old-space-size=350` is in NODE_OPTIONS
- Kill unnecessary apps: `am force-stop <package>`
- **Never kill** `com.google.android.gms` (breaks WiFi)
</details>

<details>
<summary><b>Gateway crashes with "ENETUNREACH" or "fetch failed"</b></summary>

The phone lost network briefly. The watchdog in `start-openclaw` auto-restarts the gateway after 10 seconds. If it keeps happening:
- Check WiFi is stable
- Verify `wifi_sleep_policy` is set to `2` (never sleep)
- Make sure Doze is disabled: `adb shell dumpsys deviceidle disable`
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
├── HACKS.md                       # The 20 hacks — the full war story
├── CONTRIBUTING.md                 # How to contribute
├── LICENSE                         # MIT
├── config/
│   ├── openclaw.example.json      # Working config (copy & fill in keys)
│   └── env.example                # API key template
└── scripts/
    ├── start-openclaw.sh          # Gateway launcher with watchdog loop
    ├── restart-gw.sh              # Clean kill + restart
    ├── run-proot.sh               # Run commands inside proot
    ├── boot-openclaw.sh           # Termux:Boot auto-start + cron setup
    ├── pocketclaw.sh              # CLI: start/stop/restart/status/logs/monitor
    ├── healthcheck.sh             # Cron: restart gateway if unresponsive (every 2 min)
    ├── logrotate.sh               # Cron: trim logs and CSV to 24h (every hour)
    ├── monitor.sh                 # Background: log RAM/CPU/disk/battery to CSV
    ├── create-stubs.sh            # Replace unused SDKs with ESM stubs (-40 MB RSS, -262 MB disk)
    └── hijack.js                  # Runtime patch: fix os.networkInterfaces + periodic GC
```

### On the phone

```
$PREFIX/bin/
  ├── start-openclaw       # → scripts/start-openclaw.sh
  ├── restart-gw           # → scripts/restart-gw.sh
  ├── run-proot            # → scripts/run-proot.sh
  ├── pocketclaw           # → scripts/pocketclaw.sh
  ├── healthcheck          # → scripts/healthcheck.sh  (cron every 2 min)
  └── logrotate-pc         # → scripts/logrotate.sh    (cron every hour)

$ROOTFS/root/
  ├── hijack.js            # → scripts/hijack.js
  └── .openclaw/
      ├── openclaw.json    # → config/openclaw.example.json (with real keys)
      └── env              # → config/env.example (with real keys)

~/.termux/boot/
  └── start-openclaw.sh   # → scripts/boot-openclaw.sh
```

---

## 🤝 The 20 Hacks

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
| AI Model | Kimi K2.5 (works with [any provider](#-pick-your-ai)) |

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

*A phone from 2015. 1GB of RAM. 20 hacks.*<br>
*If it can run AI, anything can.*

**[Star this repo](https://github.com/MonteiroRobin/pocketclaw)** if you think old phones deserve a second life.

</div>
