# PocketClaw — Troubleshooting

Problèmes rencontrés plusieurs fois et leurs solutions.

---

## 1. "Le processus com.android.phone s'est interrompu"

**Symptôme :** Dialog en boucle sur l'écran du téléphone après reboot.

**Cause :** `com.android.phone` est `pm disable` mais `system_server` le relance quand même. Le process crash → dialog → respawn → crash → dialog...

**Solution :** Re-enable le package. Il consomme 12 MB de toute façon.
```bash
adb shell /data/local/tmp/dirtycow /data/local/tmp/run-as-payload /system/bin/run-as
sleep 2
adb shell 'echo "pm enable com.android.phone" | /system/bin/run-as'
```

**Workaround temporaire :** Fermer le dialog avec Back :
```bash
adb shell input keyevent 4
```

---

## 2. Gateway ne démarre pas après reboot

**Symptôme :** Le gateway ne répond pas sur le port 9000 après un reboot du téléphone.

**Cause :** Termux:Boot n'a pas lancé le script, ou le gateway a crashé pendant le boot (pression mémoire).

**Solution :**
```bash
# 1. Setup port forwarding
adb forward tcp:8022 tcp:8022
adb forward tcp:9000 tcp:9000

# 2. Start sshd
adb shell 'run-as com.termux sh -c '"'"'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib; export PATH=/data/data/com.termux/files/usr/bin:$PATH; sshd'"'"''

# 3. Start gateway
adb shell 'run-as com.termux sh -c '"'"'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib; export PATH=/data/data/com.termux/files/usr/bin:$PATH; nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &'"'"''
```

Le gateway met ~70-120 secondes à démarrer.

---

## 3. SSH "Connection closed by remote host"

**Symptôme :** `ssh -p 8022 localhost` se connecte mais ferme immédiatement (`kex_exchange_identification: Connection closed`).

**Cause :** sshd crash à l'accept — souvent OOM pendant le boot du gateway (les deux consomment beaucoup de RAM en même temps).

**Solution :** Attendre que le gateway finisse de booter (~2 min), puis relancer sshd :
```bash
adb shell 'run-as com.termux sh -c '"'"'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib; export PATH=/data/data/com.termux/files/usr/bin:$PATH; pkill sshd; sleep 1; sshd'"'"''
```

---

## 4. WiFi perd la connexion internet (pas de route par défaut)

**Symptôme :** Le téléphone a une IP (192.168.1.x) mais `ping 8.8.8.8` → "Network is unreachable". `ip route` ne montre pas de route `default`.

**Causes possibles :**
- DHCP lease expiré sans renouvellement
- Un process réseau Android a crashé
- Dirty COW sur `app_process32` a cassé le fork de zygote (voir #5)

**Solution :** Toggle WiFi :
```bash
adb shell svc wifi disable
sleep 3
adb shell svc wifi enable
```

Si ça ne marche pas → reboot :
```bash
adb reboot
```

---

## 5. Dirty COW sur app_process32 casse tout

**Symptôme :** Après un Dirty COW sur `/system/bin/app_process32`, le WiFi tombe, les apps ne lancent plus, des messages "KERNEL_TUNE_DONE" apparaissent dans les logs.

**Cause :** `app_process32` est utilisé par zygote pour forker TOUS les process Android. Le remplacer empêche Android de créer de nouveaux process (DHCP, network manager, etc.).

**Solution :** Reboot. Dirty COW ne modifie que le page cache, pas le disque. Un reboot restaure le binaire original.
```bash
adb reboot
```

**Leçon :** Ne JAMAIS Dirty COW sur `app_process32` sauf pour une exécution unique immédiate, et ne PAS compter sur `drop_caches` pour restaurer (SELinux bloque).

---

## 6. SELinux bloque les modifications kernel

**Symptôme :** `sysctl`, écriture dans `/sys/module/lowmemorykiller/`, `/proc/sys/vm/swappiness` → "Permission denied" même avec Dirty COW root.

**Cause :** SELinux enforcing. Le contexte `u:r:shell:s0` (Dirty COW root) n'a pas write sur `sysfs_lowmemorykiller` ni `proc`. Même `u:r:zygote:s0` est bloqué.

**Ce qui est bloqué :**
- swappiness (rw-r--r--, need init context)
- LMK minfree (rw-rw-r--, need system_server context)
- zram resize (rw-r--r--, need init context)
- drop_caches
- setenforce

**Ce qui marche :**
- `pm disable` / `pm enable` (via Dirty COW)
- `am force-stop` (mais les services system respawnent)
- `settings put` (mais wifi_static_* ignoré par Android 6)

**Solution :** Aucune sur Android 6 sans custom kernel. Passer à postmarketOS (Tier 2) pour le kernel tuning.

---

## 7. V8 heap OOM vs kernel OOM — ne pas confondre

**Symptôme :** Le gateway crash au boot avec `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`.

**Diagnostic :**
- Si le message contient `Reached heap limit` → V8 heap trop petit
- Si `dmesg | grep oom` montre un kill → kernel OOM (pas assez de RAM physique)

**Piège :** Pendant un boot chaotique (beaucoup de process Android démarrent en même temps), le kernel peut faire pression sur V8 et provoquer un heap OOM même si le heap est normalement suffisant. **Ne pas augmenter le heap** — c'est une régression (128→256 = +128 MB gaspillés). Attendre que le boot se stabilise et relancer.

**V8 heap optimal :** `--max-old-space-size=128` (stable, testé). 96 = OOM, 256 = régression.

---

## 8. `$PATH` Windows dans les commandes SSH

**Symptôme :** Erreur `export: Files/Microsoft/jdk-17...: is not an identifier` quand on fait un SSH avec des double-quotes.

**Cause :** `$PATH` dans une commande SSH entre double-quotes est expandé par le shell Windows/MSYS AVANT l'envoi au téléphone.

**Solution :** Toujours utiliser des single-quotes pour les commandes SSH :
```bash
# MAUVAIS
ssh localhost "export PATH=/usr/bin:$PATH"

# BON
ssh localhost 'export PATH=/usr/bin:$PATH'
```

---

## 9. ADB commands sur Windows/MSYS

**Symptôme :** `adb shell /data/local/tmp/script.sh` → chemin transformé en path Windows.

**Solution :** Toujours préfixer avec `MSYS_NO_PATHCONV=1` :
```bash
MSYS_NO_PATHCONV=1 adb shell /data/local/tmp/boot-debloat.sh
```

---

## 10. Dirty COW root perdu après reboot

**Symptôme :** `pm enable/disable` retourne "Permission Denial" après un reboot.

**Cause :** Dirty COW modifie le page cache (RAM), pas le disque. Au reboot, `/system/bin/run-as` revient à l'original.

**Solution :** Re-run Dirty COW avant chaque opération privilegiée :
```bash
adb shell /data/local/tmp/dirtycow /data/local/tmp/run-as-payload /system/bin/run-as
sleep 2
adb shell 'echo "pm disable com.example.app" | /system/bin/run-as'
```

**Note :** Les effets de `pm disable` persistent au reboot (écrits dans `package-restrictions.xml`). Seul le root Dirty COW est perdu.

---

## 11. Launcher bloque l'écran / popup ADB cachée

**Symptôme :** Le launcher PocketClaw couvre tout l'écran. Les dialogs système (autorisation ADB) apparaissent derrière et sont inaccessibles. Back ne fait rien. Home boucle sur le launcher.

**Cause :** APK v1 utilisait `FLAG_FULLSCREEN` + `Theme.NoTitleBar.Fullscreen` + `onBackPressed(){}` vide tout en étant HOME launcher. Aucune sortie possible.

**Prévention (APK v2) :**
- Status bar visible (dialogs système apparaissent par-dessus)
- Triple-tap sur "POCKETCLAW" ouvre les Paramètres Android
- Double-back (2x en 2 secondes) ouvre le sélecteur de launcher
- Bouton rouge "OPEN SETTINGS" apparaît après 5 min de gateway offline
- Kill switch ADB : `adb shell am broadcast -a com.pocketclaw.EXIT`

**Récupération si bloqué sur APK v1 :**

1. **Si ADB est autorisé :**
   ```bash
   adb uninstall com.pocketclaw.launcher
   ```

2. **Si ADB unauthorized (popup cachée derrière le launcher) :**
   - Factory reset depuis le recovery mode (Power + Volume Bas → Recovery → Wipe data)
   - Après le reset, installer APK v2 (avec escape hatches)

3. **Si le téléphone ne répond plus :**
   - Power 15 secondes pour forcer le reboot
   - Connecter USB avant que le launcher se lance
   - `adb uninstall com.pocketclaw.launcher`

**Règles "never again" :**
- Toujours un escape hatch dans le launcher
- Toujours un second launcher installé en backup
- Jamais `FLAG_FULLSCREEN` sur un HOME launcher
- Jamais `onBackPressed(){}` vide
- Boot script avec retry loops, pas de sleeps fixes
