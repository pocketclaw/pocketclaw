# PocketClaw — Complete Overview of the Work Done

## Overview

**PocketClaw** turns a Moto E2 4G LTE (XT1524, 1 GB RAM, Android 6.0, Snapdragon 410)
into a self-contained AI server powered by OpenClaw, with a native Canvas launcher.

**GitHub repo**: `pocketclaw/pocketclaw`

---

## 1. Current Architecture (v8 — Native Gateway)

```
[Windows PC] ←→ ADB/SSH ←→ [Moto E2]
     |                          |
  Electron Desktop         Termux (native)
  (monitoring/setup)           |
                          node22-icu (58 MB, NDK r26c)
                               |
                          OpenClaw Gateway
                          + hijack.js (--require)
                               |
                          API :9000 / Dashboard :9003
                          + Telegram Bot (@pocketclawbot)
```

**Native stack**: Termux → bash → node22-icu → gateway (4 layers, was 6 with proot)

---

## 2. Commit History (chronological)

| Commit | Description |
|--------|-------------|
| `5433247` | Fix bot shell: export SHELL inside proot |
| `4205b87` | APK v2 anti-brick + boot resilience |
| `d0570bf` | APK v2.2: dashboard redesign, real logs |
| `1f0f346` | Troubleshooting: fix WiFi gateway loss |
| `635a4d9` | Debloat v1 — 70 packages removed |
| `5735436` | Debloat v2 — 144 → 25 packages, swap 87 → 8 MB |
| `a311a4d` | Debloat v3 — 144 → 19 packages, telephony removed |
| `ac172b8` | Debloat v4 — SystemUI halved (86 → 43 MB) |
| `2f2c64e` | Debloat v5 — SystemUI dead, gateway 160 MB heap |
| `e639095` | Add tools, screenshots, proot-distro sources |
| `dc64c1e` | Single process gateway, V8 heap profiling |
| `2b51e54` | Debloat v6 — 13 packages, 393 MB PSS, 450 MB free |
| `070919d` | Launcher v2.5 — floating crab Home button |
| `ada57b0` | Dirty COW daemon stopper + exploit + payload |
| `2a6144a` | Daemon stopper v2 — fork isolation + /proc polling |
| `73e4b21` | Proot diet — 2.1 GB → 967 MB disk |
| `912fd91` | Module stubbing v2 — path-aware interception |
| `63efab4` | Payload v7 — kernel tuning via two-phase Dirty COW |
| `9605354` | **v7: Native node22-icu — proot eliminated, 310 MB** |
| `b68502b` | Lazy loading v3 — on-demand module proxies |
| `5a691ae` | Fix lazy proxy + UV_THREADPOOL_SIZE + compile cache |
| `98d9283` | Update README v8 — lazy proxies, 321 MB total |
| `9dea21c` | Fix reboot — defer gateway until daemons killed |
| `5a07cd8` | Fully autonomous boot |
| `d061051` | Fix boot crash-loop — PID file |
| `225c05d` | Bump V8 heap to 160 MB |
| `ef399cd` | **PocketClaw Ultra** — V8 128 MB, no ICU, Dalvik-free |
| `034e943` | Fix kill-dalvik, revert aggressive V8 settings |
| `fb04a01` | Dynamic V8 heap — 180 MB boot / 150 MB post-boot |
| `8734c6e` | Dead-stub 23 modules — -9 MB RAM |
| `7976326` | Wake lock, Doze bypass, V8 semi-space 1 MB |
| `b465c2a` | **PocketClaw OS v3.0** — hybrid launcher, Canvas tabs, hardware controls |
| `cf36697` | **PocketClaw 3000 Desktop** — Electron app |
| `43bd9f6` | WiFi watchdog v2 — wait-first + backoff |

---

## 3. Main Components

### 3.1 Android Launcher (native APK)

**Files**: `apk/src/com/pocketclaw/launcher/`

| File | Role |
|------|------|
| `LauncherActivity.java` | Main activity, 4 tabs (STATUS/LOGS/KEYS/CTRL), API polling, implements ControlListener |
| `DashboardView.java` | Custom Canvas view, green CRT terminal rendering, everything hand-drawn |
| `CRTRenderer.java` | Drawing primitives — drawBar, drawBorderedRect, drawText, CRT colors |

**Build chain** (without Android Studio):
```
javac -source 1.8 -target 1.8 -classpath android.jar
  → d8 --min-api 23
  → aapt package
  → zipalign -f 4
  → java -jar apksigner.jar sign --ks debug.keystore
```

**Features**:
- 4 tabs: STATUS (TextViews), LOGS/KEYS/CTRL (Canvas DashboardView)
- Polls `/api/status` every 5s
- Hardware sliders (WiFi, Bluetooth, screen brightness, volume)
- Manual JSON parsing (indexOf + substring, no Gson)
- RSS: ~55 MB (no WebView)

### 3.2 UX Improvements v4.0

#### Session 1 — 8 core features

| # | Feature | Page | Details |
|---|---------|------|---------|
| 1 | **Search bar** | KEYS | Filters keys by name, bordered rect with placeholder, clear button, counter |
| 2 | **Force GC** | CTRL | Button POSTs `/api/control/gc`, shows freed MB as a Toast |
| 3 | **Category headers** | KEYS | PROVIDERS / CHANNELS / OTHER based on module type |
| 4 | **V8 Heap monitor** | LOGS | `V8 HEAP: X/YMB` bar with drawBar() + percentage |
| 5 | **Pull-to-refresh** | KEYS | Pull down → fetchKeys + fetchModules, visual indicator |
| 6 | **System Setup** | CTRL | Collapsible section with DEBLOAT / HARDEN / SET AS HOME buttons |
| 7 | **Scroll indicator** | KEYS | Thin green bar on the right edge |
| 8 | **Lazy loading info** | LOGS | `LAZY: X/Y loaded DEAD: Z` line |

#### Session 2 — v4.0 (CRT animations, backend, polish)

**Bugfixes (A1-A7)**:
- A1: Inverted `onResume()` condition fixed (server mode)
- A2: Footer "PROOT" → "NATIVE", heap 150 → 112
- A3: `telegram: true` → dynamic check of module + token
- A4: JSON escaping in `onKeyEdit()` and `onModuleToggle()`
- A5: `"set":` parsing offset fixed
- A6: `nextCrabFrame()` enabled in the timer
- A7: Versions synchronized to v4.0 everywhere (manifest, boot lines, comments)

**Critical UX (B1-B4)**:
- B1: **CRT animations enabled** — `crt.tick(dt)`, `drawScanBeam()`, `drawGlowText()` for titles, `postInvalidateDelayed(33)` for 30fps
- B2: **LOGS scrolling** — vertical scroll + pull-to-refresh on the LOGS page
- B3: **Mini status bar** — `RAM xxx/yyy • BAT% • UP time • GW● TG● KI●` at the top of every page
- B4: **RESTART GATEWAY** — button on CTRL + POST `/api/control/restart` endpoint

**UX polish (B5-B8)**:
- B5: **Flash feedback** — 150ms green overlay on button tap
- B6: **Slider thumb** — white vertical indicator on sliders
- B7: **LOGS filters** — `[ALL] [ERR] [WARN]` buttons at the top of LOGS
- B8: **RAM timeline** — mini line chart (60-point ring buffer, 5 min history)

**Backend hijack.js (C1-C7)**:
- C1: `POST /api/control/restart` — `process.exit(0)` (wrapper restarts)
- C2: **Auth token** — `X-PocketClaw-Token` header or `?token=` param, read from `POCKETCLAW_TOKEN` env
- C4: `GET /api/logs?level=error|warn` — server-side filtering
- C5: `GET /api/logs/stream` — real-time SSE
- C6: `POST /api/logs/clear` — flush the buffer
- C7: `GET /api/history` — 60-entry ring buffer (30s interval, 30 min RAM/heap/RSS history)

**Modified files (sessions 1+2 combined)**:
- `DashboardView.java`: 627 → ~960 lines (+330)
- `LauncherActivity.java`: 1052 → ~1280 lines (+228)
- `CRTRenderer.java`: 270 → 307 lines (+37, drawLineChart)
- `hijack.js`: ~1613 → ~1700 lines (+87, auth + endpoints + history)

### 3.3 hijack.js (Node.js gateway hijacker)

**Path on phone**: `$ROOTFS/root/hijack.js` (loaded via `-r $HIJACK`)

**Capabilities**:
- Monkey-patches `os.networkInterfaces()` (returns WiFi gateway)
- Force GC via `--expose-gc`
- Green CRT dashboard on `:9003/dashboard`
- `/api/status`: RAM, uptime, modules, keys, battery, lazy stats, dynamic telegram status
- V8 heap data: `heap.used` / `heap.limit`
- `/proc` RAM breakdown
- **Auth token**: `X-PocketClaw-Token` / `?token=` (v4.0)
- **Restart endpoint**: `POST /api/control/restart` (v4.0)
- **Log filtering**: `GET /api/logs?level=error|warn` (v4.0)
- **SSE streaming**: `GET /api/logs/stream` (v4.0)
- **History**: `GET /api/history` — RAM/heap/RSS ring buffer (v4.0)
- **Log clear**: `POST /api/logs/clear` (v4.0)

### 3.4 System Scripts (phone)

| Script | Location | Role |
|--------|----------|------|
| `start-openclaw` | `$PREFIX/bin/` | Starts the gateway with NODE_OPTIONS |
| `restart-gw` | `$PREFIX/bin/` | Cleanly kills + restarts the gateway |
| `pocketclaw` | `$PREFIX/bin/` | Main CLI command |
| `start-pocketclaw.sh` | `~/.termux/boot/` | Auto-boot (sshd + crons + monitor + gateway) |
| `stop-daemons.sh` | `/data/local/tmp/` | Daemon stopper + kernel tuning (ADB only) |
| `pocketclaw-boot.ps1` | `%USERPROFILE%\` | Windows auto-boot (ADB → daemon stopper → port forwarding) |

### 3.6 Compat Shims (native ARM32)

| Component | Size | Role |
|-----------|------|------|
| `node22-icu` | 58 MB | Node.js 22, NDK r26c, API 24, small-icu |
| `libapi23compat.so` | 8.4 KB | LD_PRELOAD — 11 missing API 24 symbols |
| `libc++_shared.so` | replaced | NDK r26c version (C++17 filesystem) |

**Shimmed symbols**: in6addr_any, in6addr_loopback, __emutls_get_address, getifaddrs, freeifaddrs, getgrnam_r, getgrgid_r, fseeko64, ftello64, pthread_barrier_{init,wait,destroy}

---

## 4. RAM Optimizations

### Progression

| Version | Total RAM | Key change |
|---------|-----------|------------|
| v1 (proot) | ~500 MB+ | Ubuntu proot + Node 18 |
| v5 | ~393 MB | Debloat v6, 13 packages |
| v7 | ~310 MB | **Proot eliminated**, native node22-icu |
| v8 | ~321 MB | Heap 112 MB, lazy loading v3, daemon stopper |
| v9 (current) | **~305 MB** | Heap 170 MB, setsid + kill-dalvik, Dalvik-free, 6h restart |

### Current RAM Breakdown

| Component | RAM |
|-----------|-----|
| Gateway (node22-icu) | ~190 MB (heap 170, startup peak ~146) |
| system_server | ~72 MB |
| zygote | ~32 MB |
| PocketClaw Launcher | ~39 MB |
| Other Android | ~varies |
| **Total** | **~305 MB** |

### Techniques Applied

- **V8**: `--max-old-space-size=170 --max-semi-space-size=2` (restart every 6h — memory leak ~2 MB/h)
- **Threads**: `UV_THREADPOOL_SIZE=1`
- **Lazy loading**: Proxy-based, 37 interceptable packages, ~8 loaded on-demand
- **Dead stubs**: 23 modules blocked at require()
- **Debloat**: 131 packages debloated (126 uninstalled + 5 disabled), 13 remaining
- **Daemon stopper**: 6 daemons killed (drmserver, qcamerasvr, audiod, media, ppd, atfwd)
- **Kernel tuning**: vfs_cache_pressure=500, min_free_kbytes=2048, drop_caches=3
- **Dirty COW**: Two-phase (post_boot.sh + app_process32) for sysctl + daemon kill

---

## 5. Security / Dirty COW

- **Exploit**: Dirty COW (CVE-2016-5195) on kernel 3.10.49
- **Usage**: Writes post_boot.sh (sysctl) and app_process32 (payload) via race condition
- **Limitation**: Only works from `adb shell` (SELinux blocks untrusted_app)
- **Binaries**: `$PREFIX/bin/{dirtycow,payload,run-as-payload}`

---

## 6. Current State and Known Issues

### Working (v9)
- Native gateway (no proot)
- CRT dashboard on :9000 (4 pages)
- Telegram bot connected
- Auto-boot gateway via Termux Boot
- 4-tab Canvas launcher with 30fps CRT animations
- Google keyboard restored (libjni_keyboarddecoder.so fix)
- Auth token on sensitive endpoints
- SSE log streaming
- RAM/heap/RSS history (30 min)
- Mini status bar on every page
- Scrolling + filters on LOGS
- Restart gateway from CTRL
- GitHub Actions CI (Java + JS syntax check)

### Remaining TODO
- Register `pocketclaw-boot.ps1` as a Windows Scheduled Task
- Delete the proot rootfs (~967 MB to reclaim)
- Deploy Groq fallback (needs GROQ_API_KEY)
- Fix Telegram "/status" conflict
- Consider postmarketOS (only path to < 250 MB)

---

## 7. Key Files — Directory Tree

```
pocketclaw/
├── apk/                          # Android Launcher
│   ├── AndroidManifest.xml
│   ├── build/                    # Compiled APK
│   └── src/com/pocketclaw/launcher/
│       ├── LauncherActivity.java # Activity + ControlListener
│       ├── DashboardView.java    # Custom CRT Canvas
│       └── CRTRenderer.java      # Drawing primitives
├── scripts/
│   ├── hijack.js                # Gateway monkey-patch (canonical — deploy from here)
│   ├── pocketclaw.sh            # CLI: start/stop/restart/status/logs/monitor/gc/modules/heap
│   ├── monitor.sh               # Logging stats every 5 min
│   ├── healthcheck.sh           # Cron: restart gateway if hung
│   └── boot-debloat.sh          # Legacy debloat script
├── tools/
│   ├── dirtycow.c               # Exploit source
│   ├── payload.c                # Daemon killer
│   ├── kernel-tune.c
│   ├── optimize-ram.sh
│   └── ...
├── config/env.example
├── README.md
├── CONTRIBUTING.md
├── TROUBLESHOOTING.md
└── LICENSE
```

---

*Last updated 2026-02-19 — PocketClaw v9 Native Gateway*
