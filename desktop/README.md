# PocketClaw 3000 Desktop

> Pip-Boy style desktop app to setup, monitor, and manage your PocketClaw AI devices.

```
     __       __
    / <`     `> \
   (  / @   @ \  )
    \(  \_-_/  )/
  (\ `-/     \-` /)
   "==/   _   \=="
    .=') [_] (`=.
   ' .='     `=. '
```

## What is this?

PocketClaw 3000 Desktop is an Electron app that transforms your desktop into a command center for PocketClaw devices — old Android phones (Moto E2, 1GB RAM, Android 6) running as dedicated AI companions with Telegram bot, Kimi AI, and auto-start.

**One-click setup**: Plug phone via USB, enter API keys, hit START. The app handles all 8 steps automatically (~20 min).

**Dashboard**: Monitor RAM, disk, battery, gateway status, and live logs from your desktop.

**Remote management**: Connect via USB or network (HTTP) to manage devices even outside your local network.

## Features

### 5 Tabs

| Tab | Description |
|-----|-------------|
| **STAT** | Dashboard with crab avatar, RAM/disk/battery bars, gateway status, live logs |
| **DEVICES** | Fleet inventory — manage multiple PocketClaw phones, click to switch |
| **KEYS** | API key manager (Kimi, Telegram, OpenAI, Groq) — read/write to phone |
| **SETUP** | One-click 8-step automated installer with progress tracking |
| **TOOLS** | Remote commands (restart GW, healthcheck, kill SystemUI, etc.) + interactive shell |

### Highlights

- **Pip-Boy 3000 aesthetic** — CRT green-on-black with scanlines, vignette, scan beam, hardware knobs
- **5 color themes** — Green (classic), Amber (Fallout), Blue (ice), White (monochrome), Pink (neon)
- **8 crustacean avatars** — Crab, Lobster, Shrimp, Hermit, Octopus, Jellyfish, Isopod, King Crab. Select per device, syncs to mobile dashboard
- **USB + Network modes** — Connect via ADB or direct HTTP to gateway URL
- **Auto-reconnect** — Reconnects automatically when connection drops (5 attempts)
- **Live log streaming** — Real-time `tail -f` of gateway logs via ADB
- **Interactive ADB shell** — Run commands directly on the phone from the Tools tab
- **Device persistence** — Saved in `~/.pocketclaw/devices.json`, survives app restarts
- **Real system metrics** — RAM (with Android 6 fallback), disk via `df`, battery via `dumpsys`

## Setup Steps (automated)

| # | Step | What happens |
|---|------|-------------|
| 1 | Detect Phone | `adb devices`, verify model/SDK/RAM |
| 2 | Install APKs | Termux + Termux:Boot + PocketClaw Launcher |
| 3 | Push Files | All payload to `/sdcard/pocketclaw/` |
| 4 | Run Installer | Trigger `install-local.sh` inside Termux |
| 5 | Configure | Forward port 9000, push API keys |
| 6 | Debloat | Remove 124 bloat packages |
| 7 | Harden | Disable animations, wifi sleep, Doze whitelist |
| 8 | Verify | Check gateway responds, show RAM |

## Quick Start

### Prerequisites

- Node.js 18+
- A PocketClaw-compatible phone with USB debugging enabled

### Development

```bash
cd desktop
npm install
npm start
```

### Prepare Payload (first time)

Downloads ADB, APKs, rootfs, Node.js ARM — about 120 MB total:

```bash
npm run prepare-payload
```

### Build

```bash
# Windows
npm run build:win

# macOS (must run on Mac)
npm run build:mac

# Linux
npm run build:linux
```

Output in `build/` — portable app, no installer needed.

## Architecture

```
desktop/
  electron/
    main.js              Main process, IPC handlers
    preload.js           contextBridge API (renderer <-> main)
    setup-engine.js      8-step automated setup logic
    dashboard-engine.js  Phone monitoring, keys, tools, shell
  src/
    index.html           Single-page Pip-Boy UI (5 tabs)
    style.css            CRT aesthetic, 5 themes, all components
    app.js               Renderer logic, avatars, state management
  scripts/
    prepare-payload.sh   Downloads and organizes bundled files
  payload/               Bundled offline (~120 MB, gitignored)
    adb/                 Platform-specific ADB binaries
    apks/                Termux, Termux:Boot, PocketClaw Launcher
    rootfs/              Ubuntu ARM rootfs
    node/                Node.js 22 ARM
    scripts/             OpenClaw scripts
    config/              Gateway config templates
```

## Color Themes

Switch themes using the colored dots in the bottom bar:

- **Green** `#00FF41` — Phosphor green (default, matches CRTRenderer.java)
- **Amber** `#FFB000` — Classic Fallout terminal
- **Blue** `#00BFFF` — Ice cold
- **White** `#E0E0E0` — High contrast monochrome
- **Pink** `#FF69B4` — Neon nights

## Avatar System

8 ASCII art crustaceans, each with 2-frame animation:

| Avatar | Description |
|--------|-------------|
| Crab | The OG PocketClaw mascot |
| Lobster | The Big Red Boss |
| Shrimp | Small but mighty |
| Hermit | Home sweet shell |
| Octopus | Eight arms, one brain |
| Jellyfish | Drift mode engaged |
| Isopod | The deep sea tank |
| King Crab | Crown of thorns |

Changing avatar on desktop pushes to `/sdcard/pocketclaw-crab.txt` on the phone, which the mobile LauncherActivity reads on next frame update.

## Connection Modes

### USB (default)
- Full feature set: setup, tools, keys, shell, avatar sync
- Requires phone connected via USB cable
- Uses ADB for all operations

### Network
- Enter gateway URL (e.g., `http://192.168.1.42:9000`)
- Status monitoring and log viewing work over HTTP
- Some features (push scripts, avatar sync, shell) require USB

## License

Part of the [PocketClaw](https://github.com/MonteiroRobin/pocketclaw) project.
