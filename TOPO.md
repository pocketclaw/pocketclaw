# PocketClaw — Topo complet des travaux

## Vue d'ensemble

**PocketClaw** transforme un Moto E2 4G LTE (XT1524, 1 GB RAM, Android 6.0, Snapdragon 410)
en serveur AI autonome via OpenClaw, avec un launcher Canvas natif.

**Repo GitHub** : `pocketclaw/pocketclaw`

---

## 1. Architecture actuelle (v8 — Native Gateway)

```
[PC Windows] ←→ ADB/SSH ←→ [Moto E2]
     |                          |
  Electron Desktop         Termux (natif)
  (monitoring/setup)           |
                          node22-icu (58 MB, NDK r26c)
                               |
                          OpenClaw Gateway
                          + hijack.js (--require)
                               |
                          API :9000 / Dashboard :9003
                          + Telegram Bot (@pocketclawbot)
```

**Stack natif** : Termux → bash → node22-icu → gateway (4 couches, était 6 avec proot)

---

## 2. Historique des commits (chronologique)

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

## 3. Composants principaux

### 3.1 Launcher Android (APK natif)

**Fichiers** : `apk/src/com/pocketclaw/launcher/`

| Fichier | Rôle |
|---------|------|
| `LauncherActivity.java` | Activité principale, 4 onglets (STATUS/LOGS/KEYS/CTRL), polling API, implémente ControlListener |
| `DashboardView.java` | Vue Canvas custom, rendu CRT terminal vert, tout dessiné à la main |
| `CRTRenderer.java` | Primitives de dessin — drawBar, drawBorderedRect, drawText, couleurs CRT |

**Build chain** (sans Android Studio) :
```
javac -source 1.8 -target 1.8 -classpath android.jar
  → d8 --min-api 23
  → aapt package
  → zipalign -f 4
  → java -jar apksigner.jar sign --ks debug.keystore
```

**Caractéristiques** :
- 4 onglets : STATUS (TextViews), LOGS/KEYS/CTRL (Canvas DashboardView)
- Polling `/api/status` toutes les 5s
- Sliders hardware (WiFi, Bluetooth, screen brightness, volume)
- Parsing JSON manuel (indexOf + substring, pas de Gson)
- RSS : ~55 MB (pas de WebView)

### 3.2 Améliorations UX v4.0

#### Session 1 — 8 features de base

| # | Feature | Page | Détails |
|---|---------|------|---------|
| 1 | **Search bar** | KEYS | Filtre les clés par nom, bordered rect avec placeholder, bouton clear, compteur |
| 2 | **Force GC** | CTRL | Bouton POST `/api/control/gc`, affiche MB libérés en Toast |
| 3 | **Category headers** | KEYS | PROVIDERS / CHANNELS / OTHER basé sur le type de module |
| 4 | **V8 Heap monitor** | LOGS | Barre `V8 HEAP: X/YMB` avec drawBar() + pourcentage |
| 5 | **Pull-to-refresh** | KEYS | Tire vers le bas → fetchKeys + fetchModules, indicateur visuel |
| 6 | **System Setup** | CTRL | Section collapsible avec boutons DEBLOAT / HARDEN / SET AS HOME |
| 7 | **Scroll indicator** | KEYS | Fine barre verte sur la droite |
| 8 | **Lazy loading info** | LOGS | Ligne `LAZY: X/Y loaded DEAD: Z` |

#### Session 2 — v4.0 (CRT animations, backend, polish)

**Bugfixes (A1-A7)** :
- A1: `onResume()` condition inversée corrigée (server mode)
- A2: Footer "PROOT" → "NATIVE", heap 150 → 112
- A3: `telegram: true` → check dynamique du module + token
- A4: JSON escaping dans `onKeyEdit()` et `onModuleToggle()`
- A5: Parsing `"set":` offset corrigé
- A6: `nextCrabFrame()` activé dans le timer
- A7: Versions synchronisées à v4.0 partout (manifest, boot lines, comments)

**UX critique (B1-B4)** :
- B1: **Animations CRT activées** — `crt.tick(dt)`, `drawScanBeam()`, `drawGlowText()` pour titres, `postInvalidateDelayed(33)` pour 30fps
- B2: **Scroll LOGS** — scroll vertical + pull-to-refresh sur la page LOGS
- B3: **Mini-status bar** — `RAM xxx/yyy • BAT% • UP time • GW● TG● KI●` en haut de chaque page
- B4: **RESTART GATEWAY** — bouton sur CTRL + endpoint POST `/api/control/restart`

**UX polish (B5-B8)** :
- B5: **Flash feedback** — overlay vert 150ms au tap sur les boutons
- B6: **Slider thumb** — indicateur vertical blanc sur les sliders
- B7: **Filtres LOGS** — boutons `[ALL] [ERR] [WARN]` en haut de LOGS
- B8: **RAM timeline** — mini line chart (ring buffer 60 points, 5 min d'historique)

**Backend hijack.js (C1-C7)** :
- C1: `POST /api/control/restart` — `process.exit(0)` (wrapper relance)
- C2: **Auth token** — `X-PocketClaw-Token` header ou `?token=` param, lu depuis `POCKETCLAW_TOKEN` env
- C4: `GET /api/logs?level=error|warn` — filtrage côté serveur
- C5: `GET /api/logs/stream` — SSE temps réel
- C6: `POST /api/logs/clear` — vider le buffer
- C7: `GET /api/history` — ring buffer 60 entries (30s interval, 30 min d'historique RAM/heap/RSS)

**Fichiers modifiés (cumul sessions 1+2)** :
- `DashboardView.java` : 627 → ~960 lignes (+330)
- `LauncherActivity.java` : 1052 → ~1280 lignes (+228)
- `CRTRenderer.java` : 270 → 307 lignes (+37, drawLineChart)
- `hijack.js` : ~1613 → ~1700 lignes (+87, auth + endpoints + history)

### 3.3 hijack.js (Node.js gateway hijacker)

**Chemin téléphone** : `$ROOTFS/root/hijack.js` (chargé via `-r $HIJACK`)

**Fonctionnalités** :
- Monkey-patch `os.networkInterfaces()` (retourne WiFi gateway)
- Force GC via `--expose-gc`
- Dashboard CRT vert sur `:9003/dashboard`
- `/api/status` : RAM, uptime, modules, keys, battery, lazy stats, telegram status dynamique
- V8 heap data : `heap.used` / `heap.limit`
- `/proc` RAM breakdown
- **Auth token** : `X-PocketClaw-Token` / `?token=` (v4.0)
- **Restart endpoint** : `POST /api/control/restart` (v4.0)
- **Log filtering** : `GET /api/logs?level=error|warn` (v4.0)
- **SSE streaming** : `GET /api/logs/stream` (v4.0)
- **History** : `GET /api/history` — ring buffer RAM/heap/RSS (v4.0)
- **Log clear** : `POST /api/logs/clear` (v4.0)

### 3.4 Scripts système (téléphone)

| Script | Emplacement | Rôle |
|--------|-------------|------|
| `start-openclaw` | `$PREFIX/bin/` | Lance le gateway avec NODE_OPTIONS |
| `restart-gw` | `$PREFIX/bin/` | Kill + restart gateway proprement |
| `pocketclaw` | `$PREFIX/bin/` | Commande principale |
| `start-pocketclaw.sh` | `~/.termux/boot/` | Auto-boot (sshd + crons + monitor + gateway) |
| `stop-daemons.sh` | `/data/local/tmp/` | Daemon stopper + kernel tuning (ADB only) |
| `pocketclaw-boot.ps1` | `%USERPROFILE%\` | Windows auto-boot (ADB → daemon stopper → port forwarding) |

### 3.6 Compat shims (natif ARM32)

| Composant | Taille | Rôle |
|-----------|--------|------|
| `node22-icu` | 58 MB | Node.js 22, NDK r26c, API 24, small-icu |
| `libapi23compat.so` | 8.4 KB | LD_PRELOAD — 11 symbols API 24 manquants |
| `libc++_shared.so` | remplacé | NDK r26c version (C++17 filesystem) |

**Symbols shimmés** : in6addr_any, in6addr_loopback, __emutls_get_address, getifaddrs, freeifaddrs, getgrnam_r, getgrgid_r, fseeko64, ftello64, pthread_barrier_{init,wait,destroy}

---

## 4. Optimisations RAM

### Évolution

| Version | RAM totale | Changement clé |
|---------|-----------|----------------|
| v1 (proot) | ~500 MB+ | Ubuntu proot + Node 18 |
| v5 | ~393 MB | Debloat v6, 13 packages |
| v7 | ~310 MB | **Proot éliminé**, node22-icu natif |
| v8 (actuel) | **~321 MB** | Heap 112 MB, lazy loading v3, daemon stopper |

### Détail RAM actuel

| Composant | RAM |
|-----------|-----|
| Gateway (node22-icu) | ~155 MB (heap 112, live 105) |
| system_server | ~97 MB |
| zygote | ~63 MB |
| PocketClaw Launcher | ~55 MB |
| Autres Android | ~variable |
| **Total** | **~321 MB** |

### Techniques appliquées

- **V8** : `--max-old-space-size=112 --max-semi-space-size=2`
- **Threads** : `UV_THREADPOOL_SIZE=1`
- **Lazy loading** : Proxy-based, 37 packages interceptables, ~8 chargés on-demand
- **Dead stubs** : 23 modules bloqués au require()
- **Debloat** : 64+ packages Android désactivés, 13 restants
- **Daemon stopper** : 6 daemons tués (drmserver, qcamerasvr, audiod, media, ppd, atfwd)
- **Kernel tuning** : vfs_cache_pressure=500, min_free_kbytes=2048, drop_caches=3
- **Dirty COW** : Two-phase (post_boot.sh + app_process32) pour sysctl + daemon kill

---

## 5. Sécurité / Dirty COW

- **Exploit** : Dirty COW (CVE-2016-5195) sur kernel 3.10.49
- **Usage** : Écrit post_boot.sh (sysctl) et app_process32 (payload) via race condition
- **Limitation** : Fonctionne uniquement depuis `adb shell` (SELinux bloque untrusted_app)
- **Binaires** : `$PREFIX/bin/{dirtycow,payload,run-as-payload}`

---

## 6. État actuel et problèmes connus

### Fonctionnel (v4.0)
- Gateway native (pas de proot)
- Dashboard CRT sur :9003 (4 pages)
- Telegram bot connecté
- Auto-boot gateway via Termux Boot
- Launcher Canvas 4 onglets avec animations CRT 30fps
- Desktop Electron (commité)
- Clavier Google restauré (libjni_keyboarddecoder.so fix)
- Auth token sur les endpoints sensibles
- SSE streaming des logs
- Historique RAM/heap/RSS (30 min)
- Mini-status bar sur chaque page
- Scroll + filtres sur LOGS
- Restart gateway depuis CTRL
- CI GitHub Actions (Java + JS syntax check)

### TODO restant
- Register `pocketclaw-boot.ps1` en Scheduled Task Windows
- Supprimer le rootfs proot (~967 MB à récupérer)
- Déployer fallback Groq (besoin GROQ_API_KEY)
- Fix conflit Telegram "/status"
- Considérer postmarketOS (seule voie vers < 250 MB)

---

## 7. Fichiers clés — Arborescence

```
pocketclaw/
├── apk/                          # Launcher Android
│   ├── AndroidManifest.xml
│   ├── build/                    # APK compilé
│   └── src/com/pocketclaw/launcher/
│       ├── LauncherActivity.java # Activité + ControlListener
│       ├── DashboardView.java    # Canvas CRT custom
│       └── CRTRenderer.java      # Primitives dessin
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

*Mis à jour le 2026-02-18 — PocketClaw v4.0 Native Gateway*
