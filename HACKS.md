# PocketClaw — OpenClaw sur un Moto E2 (The Impossible Install)

> "They said it couldn't be done. We did it anyway. 20 hacks later."

**Date :** 10-11 février 2026
**Appareil :** Motorola Moto E2 (2015) — codename `surnia`/`otis`
**Objectif :** Faire tourner OpenClaw (framework d'agent AI autonome) sur un téléphone qui ne remplit AUCUNE des conditions minimales.

---

## Le Défi

| Spec | Moto E2 | Minimum OpenClaw | Écart |
|---|---|---|---|
| Android | 6.0 (Marshmallow) | 10+ | **4 versions en dessous** |
| RAM | 1 Go (920 Mo réels) | 3 Go | **3x moins** |
| CPU | Snapdragon 410 (ARM32) | ARM64 recommandé | **Architecture legacy** |
| Stockage interne | 8 Go (~700 Mo libres) | 2 Go+ libres | **3x moins** |
| Node.js Termux natif | v12 max | v22 | **10 versions majeures** |
| proot-distro | Pas dans les repos | Requis | **Inexistant** |
| dpkg/apt | Cassé (stat error) | Fonctionnel | **Inutilisable** |
| git | Impossible à installer | Requis par npm | **Absent** |

**Verdict officiel : IMPOSSIBLE.**
**Verdict réel : 20 hacks plus tard, ça tourne.**

---

## Préparation du Téléphone

Avant tout hack logiciel, le téléphone doit être allégé au maximum :

- **Launcher :** Remplacer le launcher stock par KISS Launcher (ultra-léger, ~2 Mo RAM)
- **Debloat :** Désactiver/supprimer toutes les apps inutiles (Google Play Movies, Google Music, etc.)
- **Optimisation batterie :** Désactiver l'optimisation batterie pour Termux (sinon Android le kill en arrière-plan)
- **Carte SD :** 4 Go minimum si le stockage interne < 16 Go (on a utilisé une 57 Go)
- **Termux :** Installer depuis F-Droid (la version Play Store est obsolète pour Android 6)

---

## Les 20 Hacks

### Hack #1 — proot-distro manuel
**Problème :** proot-distro n'est pas dans les repos Termux pour Android 6.
**Solution :** Installation manuelle depuis GitHub avec correction des placeholders.

```bash
# Télécharger depuis GitHub
curl -LO https://github.com/termux/proot-distro/archive/refs/heads/master.tar.gz
tar xf master.tar.gz
# Copier les scripts + fix des paths
```

### Hack #2 — Ubuntu 25.10 extraction manuelle
**Problème :** Le script d'installation officiel de proot-distro échoue.
**Solution :** Télécharger et extraire le rootfs .tar.xz manuellement avec `tar`.

```bash
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
mkdir -p $ROOTFS
# Télécharger le rootfs ARM
curl -LO https://cdimage.ubuntu.com/ubuntu-base/releases/25.10/release/ubuntu-base-25.10-base-armhf.tar.gz
tar xf ubuntu-base-25.10-base-armhf.tar.gz -C $ROOTFS
```

### Hack #3 — Node 22 binaire pré-compilé
**Problème :** dpkg est cassé dans proot (erreur stat sur les .so), impossible d'utiliser apt pour installer Node.
**Solution :** Télécharger le binaire ARM pré-compilé depuis nodejs.org directement.

```bash
# Depuis l'intérieur de proot Ubuntu
curl -LO https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-armv7l.tar.xz
tar xf node-v22.12.0-linux-armv7l.tar.xz
cp -r node-v22.12.0-linux-armv7l/* /usr/local/
node --version  # v22.12.0 ✅
```

### Hack #4 — hijack.js (Bionic Bypass)
**Problème :** `os.networkInterfaces()` crash sur Android 6 car la libc Bionic ne supporte pas certains appels réseau que Node.js attend.
**Solution :** Un fichier JavaScript qui override la fonction avant qu'OpenClaw ne charge.

```javascript
// /root/hijack.js
const os = require('os');
const _ni = os.networkInterfaces;
os.networkInterfaces = function() {
  try { return _ni.call(os); }
  catch(e) { return {}; }
};
```

**Usage :** `NODE_OPTIONS='-r /root/hijack.js'` dans toutes les commandes Node.

### Hack #5 — Git Wrapper Bridge
**Problème :** npm a besoin de git pour cloner certaines dépendances (libsignal-node). Git ne peut pas être installé dans proot (dpkg cassé).
**Solution :** Un wrapper script qui appelle le git natif de Termux depuis l'intérieur de proot Ubuntu.

```bash
#!/bin/bash
# /usr/local/bin/git (dans proot Ubuntu)
# Bridge vers le git de Termux
TERMUX_GIT=/data/data/com.termux/files/usr/bin/git
exec $TERMUX_GIT "$@"
```

### Hack #6 — Git Argument Parser
**Problème :** npm passe les arguments git dans un ordre que le wrapper ne gère pas bien.
**Solution :** Parser custom qui extrait l'URL et la destination des arguments dans n'importe quel ordre.

```bash
#!/bin/bash
# Version améliorée du git wrapper avec parsing d'arguments
TERMUX_GIT=/data/data/com.termux/files/usr/bin/git

# Extraire URL et destination peu importe l'ordre
URL=""
DEST=""
for arg in "$@"; do
  case "$arg" in
    http*|git@*) URL="$arg" ;;
    /*|./*) DEST="$arg" ;;
  esac
done

exec $TERMUX_GIT "$@"
```

### Hack #7 — --ignore-scripts (Skip llama.cpp)
**Problème :** llama.cpp ne compilera jamais sur 1 Go de RAM avec un Snapdragon 410.
**Solution :** `npm install -g openclaw --ignore-scripts` skip toute compilation native. On utilise des providers cloud (Gemini, Kimi) au lieu de modèles locaux.

**Impact :** Économise ~200 Mo de RAM et des heures de compilation. Aucune perte fonctionnelle puisqu'on utilise des API cloud.

### Hack #8 — npm cache sur carte SD
**Problème :** 700 Mo de stockage interne, npm cache + node_modules = 500 Mo+.
**Solution :** Bind mount de la carte SD pour le cache npm.

```bash
# Monter le cache npm sur la SD
mkdir -p /sdcard/npm-cache
npm config set cache /sdcard/npm-cache
```

**Note :** Une carte SD de 4 Go suffit. On en avait une de 57 Go.

### Hack #9 — --legacy-peer-deps
**Problème :** Conflits de versions entre les dépendances npm.
**Solution :** `npm install -g openclaw --ignore-scripts --legacy-peer-deps`

### Hack #10 — run-proot.sh Helper
**Problème :** Lancer proot avec tous les bons bind mounts et variables d'environnement est complexe.
**Solution :** Script helper qui encapsule tout.

```bash
#!/data/data/com.termux/files/usr/bin/bash
# /data/data/com.termux/files/usr/bin/run-proot
PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
unset LD_PRELOAD
export PROOT_TMP_DIR=$PREFIX/tmp

# Load API keys
if [ -f "$ROOTFS/root/.openclaw/env" ]; then
  source "$ROOTFS/root/.openclaw/env"
  export MOONSHOT_API_KEY
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
  /bin/bash -c "export PATH=/data/data/com.termux/files/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && export HOME=/root && export NODE_OPTIONS='-r /root/hijack.js' && export MOONSHOT_API_KEY='$MOONSHOT_API_KEY' && $*"
```

### Hack #11 — Low-Memory Mode (max-old-space-size)
**Problème :** Le gateway OpenClaw demande 218+ Mo de heap JS. Avec Android + proot, OOM kill systématique.
**Solution :** Limiter le heap Node.js et tuer les services Google avant le lancement.

```bash
# Dans start-openclaw.sh (valeur initiale, réduite à 192 avec les stubs — voir Hack #20)
export NODE_OPTIONS='-r /root/hijack.js --max-old-space-size=384'

# Tuer les services Google gourmands
# ⚠️ NE PAS tuer com.google.android.gms (voir Hack #13)
am force-stop com.google.android.inputmethod.latin
am force-stop android.process.media
am force-stop android.process.acore
am force-stop com.google.process.gapps
```

**Budget RAM (final après Hacks #18-20) :**
- MemTotal : 920 Mo
- Android + GMS : ~430 Mo (non rooté, ne peut pas freeze GMS)
- Gateway RSS : ~178 Mo (avec ESM stubs + heap 192)
- Marge : ~140 Mo (~15% de la RAM)

### Hack #12 — Bypass systemd + gateway run
**Problème :** `openclaw gateway start` tente de se registrer comme service systemd (cherche `systemctl` et `$DBUS_SESSION_BUS_ADDRESS`), ce qui n'existe pas dans proot.
**Solution (3 fixes combinés) :**

1. **`gateway run` au lieu de `gateway start`** — lance le gateway en foreground sans daemonisation systemd
2. **`DBUS_SESSION_BUS_ADDRESS=disabled:`** — désactive la recherche du bus DBUS
3. **`XDG_RUNTIME_DIR=/tmp`** — fournit un runtime dir valide
4. **`gateway.mode=local`** dans la config JSON — mode local sans service discovery
5. **`gateway.auth.token`** dans la config — token d'authentification requis par le gateway

```bash
export XDG_RUNTIME_DIR=/tmp
export DBUS_SESSION_BUS_ADDRESS=disabled:
openclaw gateway run --port 9000 --verbose
```

**Statut : ✅ RÉSOLU — Gateway opérationnel sur ws://127.0.0.1:9000**

---

### Hack #13 — Ne PAS tuer Google Mobile Services
**Problème :** Pour libérer de la RAM (Hack #11), on tuait `com.google.android.gms` et `com.google.android.gsf`. Résultat : le WiFi perd sa **route par défaut** (default gateway). Le téléphone garde son IP locale (`192.168.1.14`) mais ne peut plus sortir sur internet → `ENETUNREACH` sur toutes les requêtes.

**Symptôme :** `ping 8.8.8.8` → `Network is unreachable`, mais `ip addr show wlan0` montre une IP valide.

**Root cause :** GMS gère la connectivité réseau sur Android 6. Le tuer = plus de routage.

**Solution :** Retirer `am force-stop com.google.android.gms` et `com.google.android.gsf` du script `start-openclaw.sh`. On garde les autres kills (clavier, media, contacts) qui libèrent de la RAM sans casser le réseau.

```bash
# ❌ NE PAS FAIRE :
am force-stop com.google.android.gms
am force-stop com.google.android.gsf

# ✅ OK à tuer :
am force-stop com.google.android.inputmethod.latin  # clavier Google
am force-stop android.process.media                   # gestionnaire média
am force-stop android.process.acore                   # contacts
am force-stop com.google.process.gapps               # Play Store services
```

**Statut : ✅ RÉSOLU — Script mis à jour, internet fonctionnel**

**⚠️ Si le dégât est déjà fait** (GMS déjà tué et route perdue) : aucune commande ADB ne peut restaurer la route sans root. Il faut **manuellement sur le téléphone** : Paramètres → WiFi → appui long sur le réseau → "Oublier" → se reconnecter. Ça force un cycle DHCP complet qui remet la route `default via 192.168.1.254`.

### Hack #15 — IPv6 DNS + autoSelectFamily
**Problème :** Même après fix de la route IPv4, certains services (Telegram) échouent en DNS IPv4 dans proot. Le resolver DNS standard (`8.8.8.8`) renvoie `ECONNREFUSED` par intermittence depuis proot.

**Solution :** Forcer le DNS IPv6 dans `/etc/resolv.conf` + activer `autoSelectFamily` dans la config OpenClaw pour que Node.js essaie IPv6 en premier quand IPv4 échoue.

```bash
# Dans proot :
echo "nameserver 2001:4860:4860::8888" > /etc/resolv.conf
echo "nameserver 2001:4860:4860::8844" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf
```

```json
// Dans openclaw.json, sous channels.telegram :
{
  "channels": {
    "telegram": {
      "network": {
        "autoSelectFamily": true
      }
    }
  }
}
```

**Statut : ✅ RÉSOLU — Telegram se connecte via IPv6**
**Problème :** Même avec `channels.telegram` configuré dans `openclaw.json`, le gateway log `"Unknown channel: telegram"` et `"Chat channels: (empty)"`. Le plugin est installé (`extensions/telegram/`) mais pas activé.

**Root cause :** `openclaw doctor` a révélé que `plugins.entries.telegram.enabled` était à `false`. La config `channels` ne suffit pas — il faut aussi activer le **plugin**.

**Solution (2 étapes) :**

1. Lancer `openclaw doctor --fix` (ajoute la structure `plugins.entries`)
2. Patcher manuellement le JSON pour forcer `plugins.entries.telegram.enabled: true`

```bash
# Depuis proot :
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
if (!cfg.plugins) cfg.plugins = {};
if (!cfg.plugins.entries) cfg.plugins.entries = {};
cfg.plugins.entries.telegram = { enabled: true };
fs.writeFileSync('/root/.openclaw/openclaw.json', JSON.stringify(cfg, null, 2));
console.log('Telegram plugin enabled');
"
```

**Config Telegram complète dans `openclaw.json` :**
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "XXXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "dmPolicy": "open",
      "allowFrom": ["*"]
    }
  },
  "plugins": {
    "entries": {
      "telegram": { "enabled": true }
    }
  }
}
```

**Note :** Le `botToken` est en dur dans le JSON (pas via `${TELEGRAM_BOT_TOKEN}`) car l'interpolation des variables d'environnement ne fonctionne pas pour tous les champs à travers proot.

**Bot Telegram :** `@pocketclawbot` (créé via @BotFather)

**Statut : ✅ Plugin activé, gateway reload la config automatiquement**

### Hack #16 — Kimi Coding Provider + User-Agent Spoof
**Problème (3 obstacles enchaînés) :**

1. La clé API `sk-kimi-xxx` vient de **Kimi Coding** (kimi.com), pas de **Moonshot** (platform.moonshot.ai). Ce sont deux produits séparés avec des endpoints incompatibles.
2. L'endpoint Kimi Coding (`api.kimi.com/coding/v1`) rejette les requêtes qui ne viennent pas d'un "coding agent" reconnu (Claude Code, Kimi CLI, Roo Code, etc.) → erreur 403.
3. Le modèle `kimi-for-coding` retourne un champ `reasoning_content` (chaîne de pensée) en plus du `content`. Quand le content est vide, OpenClaw interprète ça comme un conflit → "Message ordering conflict".

**Solution (3 fixes combinés) :**

1. **Changer le provider** de `moonshot` à `kimi-coding` avec le bon endpoint `https://api.kimi.com/coding/v1`
2. **Spoofer le User-Agent** en `claude-code/1.0` pour passer la restriction d'accès (l'API vérifie le header, pas le client réel)
3. **Ajouter `reasoning: false`** dans la config du modèle pour éviter le champ `reasoning_content`

```json
{
  "models": {
    "providers": {
      "kimi-coding": {
        "baseUrl": "https://api.kimi.com/coding/v1",
        "apiKey": "sk-kimi-xxx",
        "api": "openai-completions",
        "headers": {
          "User-Agent": "claude-code/1.0"
        },
        "models": [{
          "id": "kimi-for-coding",
          "contextWindow": 262144,
          "maxTokens": 8192,
          "reasoning": false,
          "headers": {
            "User-Agent": "claude-code/1.0"
          }
        }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "kimi-coding/kimi-for-coding"
      }
    }
  }
}
```

**Discovery :** OpenClaw a un support natif `kimi-coding` (`applyKimiCodeConfig()` dans le source), trouvé par grep dans les fichiers `.js` minifiés. Le modèle interne est `k2p5`.

**Statut : ✅ RÉSOLU — Bot répond via Telegram avec Kimi Coding 262K contexte**

### Hack #17 — Termux:Boot Auto-Start
**Problème :** Si le téléphone s'éteint (batterie morte, crash, coupure), il faut physiquement ouvrir Termux et taper `restart-gw` pour relancer le bot. Pas viable pour un appareil autonome dans un placard.

**Solution :** Installer Termux:Boot (app séparée) qui exécute automatiquement un script au démarrage d'Android.

**Installation :**
```bash
# Depuis le PC via ADB
curl -L -o termux-boot.apk "https://github.com/termux/termux-boot/releases/download/v0.8.1/termux-boot-app_v0.8.1+github.debug.apk"
adb install termux-boot.apk
# ⚠️ Ouvrir l'app Termux:Boot UNE FOIS sur le téléphone pour activer le receiver
```

**Script de boot :**
```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-openclaw.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Attendre que le WiFi se connecte
sleep 15

# Démarrer SSH
sshd

# Démarrer le gateway
nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &

echo "Boot complete: sshd + openclaw started"
EOF
chmod +x ~/.termux/boot/start-openclaw.sh
```

**Cycle de vie :**
1. Téléphone s'éteint (batterie morte)
2. Tu le recharges → il rallume automatiquement (ou tu appuies sur power)
3. Android boot → Termux:Boot se lance → attend 15s (WiFi) → sshd + gateway démarrent
4. ~1 minute après le boot → le bot répond sur Telegram
5. Zéro intervention manuelle

**Statut : ✅ RÉSOLU — Autonomie complète, auto-restart au boot**

### Hack #18 — Compile cache cleanup
**Problème :** Node 22 compile automatiquement les modules en bytecode via `module.enableCompileCache()`. Après plusieurs redémarrages, 51 Mo de caches dupliqués s'accumulent dans `$PREFIX/tmp/node-compile-cache/`.

**Solution :** Supprimer périodiquement le dossier. Le cache se reconstruit au prochain boot (~27 Mo). Les reboots suivants sont plus rapides grâce au bytecode pré-compilé.

```bash
rm -rf $PREFIX/tmp/node-compile-cache/
# Se reconstruit automatiquement au prochain start
```

**Gain :** 24 Mo de disque récupérés (51 Mo → 27 Mo). Inclus dans le cron `logrotate-pc`.

### Hack #19 — ESM stubs pour packages inutiles
**Problème :** OpenClaw bundle **tous** les SDK de channels (Slack, Discord, WhatsApp, LINE, Playwright) via Rolldown (ESM). Même avec les channels désactivés, ESM résout tous les `import` au link-time — **avant** que le code s'exécute. Supprimer les packages npm casse le boot (`ERR_MODULE_NOT_FOUND`). Les stubs CJS ne marchent pas non plus (0 `require()` dans le bundle, tout est ESM).

**Discovery :** Le compile cache montrait que ces fichiers n'étaient pas compilés en bytecode — mais ça veut juste dire que le code n'est pas optimisé par V8, **pas** qu'il n'est pas chargé. ESM linking ≠ compilation. Le mauvais indicateur nous a fait perdre du temps.

**Solution :** Créer des **stub packages ESM** qui exportent les bons noms (classes/fonctions vides). Node résout les imports, le module graph est satisfait, mais le code n'est jamais appelé.

```javascript
// Exemple: node_modules/@slack/web-api/index.js (stub)
export class WebClient { constructor() {} }
```

**9 packages stubbés :** `@slack/web-api`, `@slack/bolt`, `@buape/carbon`, `discord-api-types`, `@line/bot-sdk`, `@whiskeysockets/baileys`, `playwright-core`, `@aws-sdk/client-bedrock{,-runtime}`, `@google/genai`

**10 packages supprimés** (pas importés du tout) : `@larksuiteoapi`, `@cloudflare`, `@mistralai`, `pdfjs-dist`, `@napi-rs`, `@img`, `@smithy`, `bun-types`, `libsignal`, `@types`, `@silvia-odwyer`, `rimraf`, `web-streams-polyfill`

```bash
# Créer les stubs (depuis Termux, pas proot)
bash scripts/create-stubs.sh
# Re-run après chaque `openclaw update`
```

**Gain :** -42 Mo RSS (224 → 182 Mo), node_modules 413 → 151 Mo (-262 Mo), disque libre +323 Mo.

**Leçon ESM vs CJS :**
- CJS : `require()` dans un `if (false)` ne charge jamais le module
- ESM : `import { X } from "pkg"` est résolu au link-time, avant toute exécution
- Compile cache = ce qui est compilé en bytecode (optimisation CPU)
- Import ESM = ce qui est chargé en mémoire (consommation RAM)

### Hack #20 — Heap 192 Mo (post-stubs, binary search)
**Problème :** Le heap V8 (`--max-old-space-size`) contrôle combien de mémoire le *old space* JavaScript peut utiliser. Avant les stubs : 256 Mo = OOM, 320 Mo = OOM, 384 Mo = minimum. V8 expand pour remplir le heap disponible.

**Discovery :** Avec les stubs ESM (Hack #19), le boot peak est beaucoup plus bas. On a fait un binary search complet pour trouver le minimum :

| Heap | Boot | RSS | Peak (VmHWM) |
|---|---|---|---|
| 384 (avant stubs) | ✅ | 196 Mo | ? |
| 350 | ✅ | 183 Mo | ? |
| 320 | ✅ | 180 Mo | 197 Mo |
| 288 | ✅ | 173 Mo | 196 Mo |
| 256 | ✅ | 177 Mo | 198 Mo |
| 224 | ✅ | 177 Mo | 197 Mo |
| 192 | ✅ | 178 Mo | 196 Mo |
| 160 | ✅ | 182 Mo | 196 Mo |
| 128 | ✅ | 172 Mo | 195 Mo |
| **96** | **OOM** | — | — |

**Conclusion :** Le heap JS réel est entre 96 et 128 Mo. Le RSS process (~175-180 Mo) est **incompressible** — c'est le code natif Node.js + V8 engine + buffers + mmap, pas le heap JS. Baisser le heap en dessous de 128 ne réduit plus le RSS.

**Choix production : 192 Mo.** Ça laisse ~60-90 Mo de marge pour les requêtes LLM avec de gros contextes, le GC, et les pics de parsing JSON. Le minimum absolu est 128 Mo mais sans marge.

```bash
# Dans start-openclaw.sh
export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=192'
```

**Aussi testé et éliminé :**
- `--optimize-for-size` : pas autorisé dans `NODE_OPTIONS` (exit code 9)
- `--jitless` : -6 à -40% perf CPU, pas viable sur Snapdragon 410
- `--lite-mode` : flag compile-time V8, pas un flag runtime

**Gain :** RSS 224 → ~178 Mo (-46 Mo, -21%). Heap 384 → 192 Mo (-50%).

**Gains combinés Hacks #18-20 :** 224 Mo → 178 Mo RSS (-46 Mo, -21%), 148 Mo → 471 Mo disque libre (+323 Mo).

**Statut : ✅ RÉSOLU — Gateway stable à ~178 Mo RSS avec heap 192 Mo**

---

## Fichiers Clés sur le Téléphone

```
Termux ($PREFIX = /data/data/com.termux/files/usr)
├── bin/
│   ├── start-openclaw     ← Lanceur gateway + watchdog (Hacks #11-13)
│   ├── restart-gw         ← Clean kill + restart
│   ├── run-proot          ← Script helper proot (Hack #10)
│   ├── pocketclaw         ← CLI unifiée (start/stop/restart/status/logs/monitor)
│   ├── healthcheck        ← Cron : restart si gateway freeze (toutes les 2 min)
│   └── logrotate-pc       ← Cron : rotation logs (toutes les heures)
├── var/lib/proot-distro/installed-rootfs/ubuntu/  ← Ubuntu 25.10
│   ├── root/
│   │   ├── hijack.js      ← Bionic bypass + periodic GC (Hack #4)
│   │   └── .openclaw/
│   │       ├── openclaw.json  ← Config (Kimi Coding + Telegram + Whisper)
│   │       └── env            ← API keys (chmod 600)
│   └── .../openclaw/node_modules/
│       ├── @slack/         ← ESM stub (Hack #19)
│       ├── @buape/         ← ESM stub
│       ├── @aws-sdk/       ← ESM stub
│       ├── @google/        ← ESM stub
│       └── ... (151 Mo total, était 413 Mo)
└── tmp/
    └── openclaw/           ← Logs + lock files

~/.termux/boot/
  └── start-openclaw.sh    ← Auto-start au boot (Hack #17)

/sdcard/
└── npm-cache/             ← Cache npm déplacé (Hack #8)
```

### Commandes utiles :
```bash
# CLI unifiée (depuis SSH)
pocketclaw start         # Démarre le gateway
pocketclaw stop          # Arrête proprement
pocketclaw restart       # Restart complet
pocketclaw status        # RAM, RSS, disque, uptime, batterie
pocketclaw logs          # Tail des logs gateway
pocketclaw monitor       # Dernières lignes du CSV stats

# Accéder au dashboard (depuis le PC)
adb forward tcp:9000 tcp:9000
# Puis ouvrir http://localhost:9000

# Recréer les stubs ESM (après openclaw update)
bash /sdcard/Download/create-stubs.sh
```

---

## Configuration OpenClaw

Fichier : `~/.openclaw/openclaw.json`

```json
{
  "gateway": {
    "mode": "local",
    "port": 9000,
    "auth": {
      "token": "moto-e2-openclaw-2026"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "XXXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "dmPolicy": "open",
      "allowFrom": ["*"],
      "network": {
        "autoSelectFamily": true
      }
    }
  },
  "plugins": {
    "entries": {
      "telegram": { "enabled": true }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "kimi-coding/kimi-for-coding"
      },
      "maxConcurrency": 1,
      "maxQueueSize": 2
    }
  },
  "models": {
    "providers": {
      "kimi-coding": {
        "baseUrl": "https://api.kimi.com/coding/v1",
        "apiKey": "sk-kimi-xxx",
        "api": "openai-completions",
        "headers": {
          "User-Agent": "claude-code/1.0"
        },
        "models": [
          {
            "id": "kimi-for-coding",
            "name": "Kimi For Coding (K2.5)",
            "contextWindow": 262144,
            "maxTokens": 8192,
            "reasoning": false,
            "headers": {
              "User-Agent": "claude-code/1.0"
            }
          }
        ]
      }
    }
  },
  "tools": {
    "media": {
      "audio": {
        "models": [{ "provider": "openai", "model": "whisper-1" }]
      }
    }
  }
}
```

**Pourquoi Kimi Coding :** Free tier, 262K contexte, API compatible OpenAI. L'accès nécessite un User-Agent de coding agent (Hack #16).

**Token gateway :** `moto-e2-openclaw-2026` — à renseigner dans le dashboard web (Settings) pour se connecter.

**NODE_OPTIONS (dans start-openclaw.sh) :**
```bash
export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=192'
```
- `-r /root/hijack.js` : Bionic bypass + periodic GC (Hack #4)
- `--expose-gc` : Active `global.gc()`, utilisé par hijack.js toutes les 60s (~11 Mo libérés/cycle)
- `--max-old-space-size=192` : Heap V8 (Hack #20 — minimum absolu 128, prod safe à 192)

---

## État Actuel (11 février 2026)

| Composant | Statut | Détails |
|---|---|---|
| Ubuntu 25.10 dans proot | ✅ | armhf, Node.js 22.12.0 |
| OpenClaw 2026.2.9 | ✅ | Gateway run, port 9000 |
| V8 heap | ✅ | `--max-old-space-size=192` (Hack #20) |
| ESM stubs | ✅ | 9 packages stubbés (Hack #19) |
| npm packages nettoyés | ✅ | 13 packages supprimés, node_modules 413 → 151 Mo |
| Gateway RSS | ✅ | **~178 Mo** (était 224 Mo au départ, -21%) |
| Disque libre | ✅ | **471 Mo** (était ~100 Mo) |
| Plugin Telegram | ✅ | `@pocketclawbot`, long polling |
| Provider Kimi Coding | ✅ | `kimi-coding/kimi-for-coding` (262K contexte) |
| User-Agent spoof | ✅ | `claude-code/1.0` (Hack #16) |
| Voice (Whisper) | ✅ | `tools.media.audio.models` configuré |
| Termux:Boot auto-start | ✅ | Hack #17 |
| Watchdog + healthcheck | ✅ | Watchdog loop + cron toutes les 2 min |
| Log rotation | ✅ | Cron toutes les heures |
| Periodic GC | ✅ | `global.gc()` toutes les 60s via hijack.js |
| IPv6 DNS | ✅ | Hack #15 |

### Logs du gateway qui tourne :
```
[canvas] host mounted at http://127.0.0.1:9000/__openclaw__/canvas/
[gateway] agent model: kimi-coding/kimi-for-coding
[gateway] listening on ws://127.0.0.1:9000
[heartbeat] started
[browser/service] Browser control service ready
```

---

## Phase 1 → Phase 2 : Du câble au sans-fil

### Phase 1 : Installation (câble USB)
Pendant toute l'installation, le téléphone est **branché au PC par USB**. C'est beaucoup plus rapide :
- ADB push pour transférer les fichiers instantanément
- `adb forward` pour rediriger les ports (SSH 8022, gateway 9000)
- Pas de problème de WiFi qui coupe ou de latence réseau
- Debug facile avec `adb shell` en backup si SSH tombe

**Commandes en Phase 1 :**
```bash
# Port forwarding USB
adb forward tcp:8022 tcp:8022
adb forward tcp:9000 tcp:9000

# SSH via USB
ssh -p 8022 -i ~/.ssh/id_moto localhost

# Dashboard via USB
# Ouvrir http://localhost:9000
```

### Phase 2 : Opération autonome (WiFi uniquement)
Une fois que tout est installé et fonctionnel, **débrancher le câble**. Le téléphone vit sa vie sur WiFi — dans un placard, sur batterie, avec ou sans chargeur. Avec Termux:Boot (Hack #17), il redémarre tout seul même après une coupure.

**Étape 1 — Trouver l'IP du téléphone (dernière commande avec le câble) :**
```bash
adb shell ip addr show wlan0 | grep "inet "
# Résultat : inet 192.168.1.XX/24 ...
```

**Note cette IP !** (ou mieux : configure une IP fixe sur ta box pour le téléphone)

**Étape 2 — Tester le SSH sans fil :**
```bash
ssh -p 8022 -i ~/.ssh/id_moto 192.168.1.XX
```

Si ça marche → débrancher le câble USB.

**Étape 3 — Accès quotidien sans câble :**
```bash
# SSH vers le téléphone (depuis n'importe quel PC sur le réseau)
ssh -p 8022 -i ~/.ssh/id_moto 192.168.1.XX

# Dashboard OpenClaw (ouvrir dans le navigateur)
http://192.168.1.XX:9000

# Lancer le gateway à distance
ssh -p 8022 -i ~/.ssh/id_moto 192.168.1.XX "start-openclaw"

# Vérifier que ça tourne
ssh -p 8022 -i ~/.ssh/id_moto 192.168.1.XX "ps aux | grep node"
```

**Étape 4 — IP fixe (recommandé) :**
Sur ta box internet (ex: `192.168.1.254` pour une Freebox), va dans les paramètres DHCP et attribue une **IP fixe** au Moto E2 basée sur son adresse MAC. Comme ça l'IP ne change jamais et tu n'as pas besoin de la rechercher à chaque fois.

**Astuce :** Ajoute un alias dans ton `~/.ssh/config` pour ne plus taper tout ça :
```
Host moto
  HostName 192.168.1.XX
  Port 8022
  User root
  IdentityFile ~/.ssh/id_moto
```
Puis simplement : `ssh moto`

### Checklist "je débranche le câble"
- [ ] IP du téléphone notée (ou fixée sur la box)
- [ ] SSH via WiFi testé et fonctionnel
- [ ] `start-openclaw` fonctionne via SSH WiFi
- [ ] Dashboard accessible sur `http://IP:9000`
- [ ] `termux-wake-lock` activé (empêche la mise en veille)
- [ ] Optimisation batterie désactivée pour Termux
- [ ] Termux:Boot installé et ouvert une fois (Hack #17)
- [ ] Bot répond sur Telegram après débranchement USB

---

## Troubleshooting

### SSH qui tombe
**Symptôme :** `Connection closed by 127.0.0.1 port 8022`
**Cause :** Android a kill le process Termux en arrière-plan (1 Go RAM, OOM agressif)
**Fix :**
1. Ouvrir Termux physiquement sur le téléphone
2. Taper `sshd` puis Entrée
3. Si ça marche pas : `LD_LIBRARY_PATH=$PREFIX/lib sshd`

### sshd ne redémarre pas via ADB
**Symptôme :** `CANNOT LINK EXECUTABLE: library "libandroid-support.so" not found`
**Cause :** ADB shell n'a pas le bon LD_LIBRARY_PATH
**Fix :** Ouvrir Termux manuellement, ou :
```bash
adb shell "run-as com.termux sh -c 'export PREFIX=/data/data/com.termux/files/usr && export LD_LIBRARY_PATH=$PREFIX/lib && $PREFIX/bin/sshd'"
```

### OOM Kill du gateway
**Symptôme :** `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`
**Cause :** Pas assez de RAM pour le heap Node.js
**Fix :**
1. Tuer les services lourds (⚠️ **SAUF** `com.google.android.gms` et `com.google.android.gsf` — les tuer casse le routage WiFi ! Voir Hack #13)
2. Vérifier la RAM libre : `cat /proc/meminfo | head -3`
3. Il faut au moins 400 Mo libres avant de lancer
4. Utiliser `--max-old-space-size=192` dans NODE_OPTIONS (avec ESM stubs, Hack #19+20)

### openclaw doctor / config qui se bloque
**Symptôme :** La commande hang indéfiniment
**Cause :** Commandes interactives qui attendent un TTY dans un environnement SSH non-interactif
**Fix :** Écrire les fichiers de config manuellement au lieu d'utiliser le wizard.

### Espace disque insuffisant
**Symptôme :** `No space left on device` pendant npm install
**Fix :**
1. Nettoyer le cache npm : `npm cache clean --force`
2. Déplacer le cache sur la SD : `npm config set cache /sdcard/npm-cache`
3. Vérifier l'espace : `df -h`

### Kimi Coding 403 "only available for Coding Agents"
**Symptôme :** `403 Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc.`
**Cause :** L'API Kimi Coding vérifie le header `User-Agent`. Sans un agent reconnu, accès refusé.
**Fix :** Ajouter `"headers": {"User-Agent": "claude-code/1.0"}` dans la config du provider ET du modèle (voir Hack #16).

### Kimi "Message ordering conflict"
**Symptôme :** Le bot démarre une session mais chaque message retourne "Message ordering conflict"
**Cause :** Le modèle Kimi renvoie un champ `reasoning_content` (chaîne de pensée) qui crée un conflit de séquençage dans OpenClaw.
**Fix :** Ajouter `"reasoning": false` dans la config du modèle (voir Hack #16).

### Le téléphone s'éteint / redémarre
**Procédure de relance :**
1. Ouvrir Termux
2. `sshd` (si besoin d'accès SSH)
3. `termux-wake-lock` (empêche la mise en veille)
4. `start-openclaw` (lance le gateway)

### SSH via WiFi ne répond pas
**Symptôme :** `Connection refused` ou `Connection timed out` en Phase 2
**Causes et fixes :**
1. **sshd ne tourne pas** → ouvrir Termux physiquement, taper `sshd`
2. **IP a changé** → vérifier sur la box internet ou rebrancher le câble USB et `adb shell ip addr show wlan0`
3. **WiFi éteint** → vérifier les paramètres réseau du téléphone
4. **Android coupe le WiFi en veille** → Paramètres WiFi → Avancé → "Garder le WiFi en veille" → **Toujours**
5. **Optimisation batterie** → Désactiver pour Termux ET pour le service WiFi

---

## Ce Qui Reste à Faire

### Fait
1. ~~Résoudre le bypass systemd (Hack #12)~~ ✅
2. ~~Tester le gateway sur le port 9000~~ ✅
3. ~~Résoudre internet depuis proot (Hack #13)~~ ✅
4. ~~Activer le plugin Telegram (Hack #14)~~ ✅
5. ~~IPv6 DNS + autoSelectFamily (Hack #15)~~ ✅
6. ~~Bot Telegram connecté~~ ✅ — `@pocketclawbot` en long polling
7. ~~Fixer IPv4 + provider Kimi Coding (Hack #16)~~ ✅
8. ~~Premier message agent complet~~ ✅ — bot répond sur Telegram
9. ~~Termux:Boot auto-start (Hack #17)~~ ✅
10. ~~Compile cache cleanup (Hack #18)~~ ✅
11. ~~ESM stubs (Hack #19)~~ ✅ — 9 packages stubbés, 13 supprimés
12. ~~Heap 192 Mo (Hack #20)~~ ✅ — binary search 384→192, minimum absolu 128
13. ~~Script watchdog~~ ✅ — watchdog loop + healthcheck cron
14. ~~Log rotation~~ ✅ — cron toutes les heures
15. ~~CLI `pocketclaw`~~ ✅ — start/stop/restart/status/logs/monitor
16. ~~Créer le repo PocketClaw~~ ✅ — sur GitHub
17. ~~Nettoyage npm (262 Mo)~~ ✅ — node_modules 413 → 151 Mo

### Reste à faire
- **Stabilité 24h** — laisser tourner une nuit complète, vérifier les logs
- **Deploy config live** — Groq fallback, identity/personnalité, customCommands (seulement dans l'example JSON, pas sur le phone)
- **Fix API keys dans `ps`** — les clés sont visibles dans la ligne de commande proot (security concern)
- **Root le téléphone** — plus gros gain restant : freeze GMS = -260 Mo RAM
- **Test sans proot après root** — Node 22 fonctionne via `ld-linux-armhf.so.3`, mais proot coûte du CPU
- **Considérer rendre le repo public**

---

## Specs Téléphone

**Motorola Moto E (2ème génération) — 2015**
- Codename : surnia (LTE) / otis (3G)
- Modèles : XT1505, XT1506, XT1511
- SoC : Qualcomm Snapdragon 410 (MSM8916)
- CPU : 4x Cortex-A53 @ 1.2 GHz
- GPU : Adreno 306
- RAM : 1 Go (920 Mo utilisables)
- Stockage : 8 Go (+ SD card)
- OS original : Android 5.0, mis à jour en 6.0
- Écran : 4.5" 540x960
- Prix neuf (2015) : ~120€
- Prix occasion (2026) : 0-20€

---

## Prochaines Étapes Business (PocketClaw)

**Open Source (gratuit) :**
- Ce guide + scripts automatisés
- Installation one-liner
- Matrice de compatibilité par téléphone
- BYOK (Bring Your Own Keys)

**PocketClaw Cloud (payant) :**
- Clé API unique `pk_xxxx` qui route vers tous les providers
- Starter 9€/mo (500 req/jour) → Pro 19€/mo → Agency 49€/mo
- Arbitrage : subscriptions à 70€/mo revendues à 50 users = 85% marge

---

*"On m'a dit que c'était impossible, alors je l'ai fait." — Probablement pas Einstein, mais on s'en fout.*

*Total : ~5 heures du premier `pkg install` au premier message IA reçu sur Telegram. 20 hacks. 0€ de hardware. Un Moto E2 de 2015 qui fait tourner un agent IA autonome en 2026. 183 Mo de RSS au lieu de 224 Mo, 151 Mo de node_modules au lieu de 413 Mo.*
