# PocketClaw — Troubleshooting

Problems that came up more than once and how to fix them.

---

## 1. "The process com.android.phone has stopped"

**Symptom:** Looping dialog on the phone screen after reboot.

**Cause:** `com.android.phone` was `pm disable`'d but `system_server` keeps trying to relaunch it. The process crashes, shows a dialog, respawns, crashes again, dialog again...

**Fix:** Re-enable the package. It only uses 12 MB anyway.
```bash
adb shell /data/local/tmp/dirtycow /data/local/tmp/run-as-payload /system/bin/run-as
sleep 2
adb shell 'echo "pm enable com.android.phone" | /system/bin/run-as'
```

**Quick workaround:** Dismiss the dialog with Back:
```bash
adb shell input keyevent 4
```

---

## 2. Gateway won't start after reboot

**Symptom:** The gateway doesn't respond on port 9000 after a phone reboot.

**Cause:** Termux:Boot didn't fire the script, or the gateway crashed during boot due to memory pressure.

**Fix:**
```bash
# 1. Setup port forwarding
adb forward tcp:8022 tcp:8022
adb forward tcp:9000 tcp:9000

# 2. Start sshd
adb shell 'run-as com.termux sh -c '"'"'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib; export PATH=/data/data/com.termux/files/usr/bin:$PATH; sshd'"'"''

# 3. Start gateway
adb shell 'run-as com.termux sh -c '"'"'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib; export PATH=/data/data/com.termux/files/usr/bin:$PATH; nohup start-openclaw > /data/data/com.termux/files/usr/tmp/openclaw-gateway.log 2>&1 &'"'"''
```

The gateway takes ~70-120 seconds to start.

---

## 3. SSH "Connection closed by remote host"

**Symptom:** `ssh -p 8022 localhost` connects but immediately drops (`kex_exchange_identification: Connection closed`).

**Cause:** sshd crashes on accept — usually OOM'd while the gateway is booting (both are fighting for RAM at the same time).

**Fix:** Wait for the gateway to finish booting (~2 min), then restart sshd:
```bash
adb shell 'run-as com.termux sh -c '"'"'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib; export PATH=/data/data/com.termux/files/usr/bin:$PATH; pkill sshd; sleep 1; sshd'"'"''
```

---

## 4. WiFi loses internet (no default route)

**Symptom:** The phone has an IP (192.168.1.x) but `ping 8.8.8.8` gives "Network is unreachable". `ip route show` has no `default` route.

**Cause:** Android 6's DHCP client drops the gateway during lease renewal. The default route vanishes from the policy routing table (table 1042) but the IP stays assigned.

**Note:** `ip route show` (main table) NEVER shows the gateway on Android 6. That's normal — Android uses policy routing (table 1042). Check with: `ip route show table all | grep default`.

**Permanent fix — static IP:**

Setting a static IP in WiFi settings eliminates the DHCP problem entirely. Through Android settings:
1. Settings > Wi-Fi > Long-press on network > Modify network
2. Advanced options > IP settings > Static
3. IP: `<YOUR_PHONE_IP>`, Gateway: `<YOUR_GATEWAY_IP>`, Prefix: `24`
4. DNS 1: `8.8.8.8`, DNS 2: `8.8.4.4`

**Emergency fix — toggle airplane mode (ADB only):**
```bash
adb shell "settings put global airplane_mode_on 1 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true"
sleep 5
adb shell "settings put global airplane_mode_on 0 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false"
```

**What does NOT work:**
- `svc wifi disable/enable` — the process gets killed (exit 137)
- `settings put global wifi_static_*` — legacy settings, ignored by Android 6
- `ndc`, `wpa_cli`, `cmd connectivity` — permission denied from ADB shell
- Airplane mode from Termux — requires `ACCESS_CONTENT_PROVIDERS_EXTERNALLY`

---

## 5. Dirty COW on app_process32 breaks everything

**Symptom:** After a Dirty COW on `/system/bin/app_process32`, WiFi goes down, apps stop launching, "KERNEL_TUNE_DONE" messages show up in logs.

**Cause:** `app_process32` is used by zygote to fork ALL Android processes. Replacing it prevents Android from creating new processes (DHCP, network manager, etc.).

**Fix:** Reboot. Dirty COW only modifies the page cache, not the disk. A reboot restores the original binary.
```bash
adb reboot
```

**Lesson:** NEVER Dirty COW `app_process32` except for a one-shot immediate execution, and do NOT rely on `drop_caches` to restore it (SELinux blocks that).

---

## 6. SELinux blocks kernel modifications

**Symptom:** `sysctl`, writes to `/sys/module/lowmemorykiller/`, `/proc/sys/vm/swappiness` — all "Permission denied" even with Dirty COW root.

**Cause:** SELinux enforcing. The `u:r:shell:s0` context (Dirty COW root) has no write access to `sysfs_lowmemorykiller` or `proc`. Even `u:r:zygote:s0` is blocked.

**What's blocked:**
- swappiness (rw-r--r--, needs init context)
- LMK minfree (rw-rw-r--, needs system_server context)
- zram resize (rw-r--r--, needs init context)
- drop_caches
- setenforce

**What works:**
- `pm disable` / `pm enable` (via Dirty COW)
- `am force-stop` (but system services respawn)
- `settings put` (but wifi_static_* ignored by Android 6)

**Fix:** There isn't one on Android 6 without a custom kernel. Switch to postmarketOS (Tier 2) for kernel tuning.

---

## 7. V8 heap OOM vs kernel OOM — don't mix them up

**Symptom:** The gateway crashes at boot with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`.

**How to tell them apart:**
- If the message says `Reached heap limit` — V8 heap is too small
- If `dmesg | grep oom` shows a kill — kernel OOM (not enough physical RAM)

**Gotcha:** During a messy boot (lots of Android processes starting at once), the kernel can put pressure on V8 and trigger a heap OOM even when the heap size is normally fine. Wait for boot to settle down, then restart.

**Optimal V8 heap:** `--max-old-space-size=170` with restart every 6h (cron). Startup peaks ~146 MB, grows ~2 MB/h (memory leak). 150 MB OOMs during startup.

---

## 8. Windows `$PATH` leaking into SSH commands

**Symptom:** Error `export: Files/Microsoft/jdk-17...: is not an identifier` when SSHing with double-quoted commands.

**Cause:** `$PATH` inside a double-quoted SSH command gets expanded by the Windows/MSYS shell BEFORE it's sent to the phone.

**Fix:** Always use single quotes for SSH commands:
```bash
# WRONG
ssh localhost "export PATH=/usr/bin:$PATH"

# RIGHT
ssh localhost 'export PATH=/usr/bin:$PATH'
```

---

## 9. ADB commands on Windows/MSYS

**Symptom:** `adb shell /data/local/tmp/script.sh` — the path gets mangled into a Windows path.

**Fix:** Always prefix with `MSYS_NO_PATHCONV=1`:
```bash
MSYS_NO_PATHCONV=1 adb shell /data/local/tmp/boot-debloat.sh
```

---

## 10. Dirty COW root lost after reboot

**Symptom:** `pm enable/disable` returns "Permission Denial" after a reboot.

**Cause:** Dirty COW modifies the page cache (RAM), not the disk. On reboot, `/system/bin/run-as` reverts to the original.

**Fix:** Re-run Dirty COW before each privileged operation:
```bash
adb shell /data/local/tmp/dirtycow /data/local/tmp/run-as-payload /system/bin/run-as
sleep 2
adb shell 'echo "pm disable com.example.app" | /system/bin/run-as'
```

**Note:** The effects of `pm disable` survive reboots (written to `package-restrictions.xml`). Only the Dirty COW root itself is lost.

---

## 11. Launcher locks the screen / ADB popup hidden behind it

**Symptom:** The PocketClaw launcher covers the entire screen. System dialogs (ADB authorization) appear behind it and can't be reached. Back does nothing. Home loops back to the launcher.

**Cause:** APK v1 used `FLAG_FULLSCREEN` + `Theme.NoTitleBar.Fullscreen` + empty `onBackPressed(){}` while being the HOME launcher. No way out.

**Prevention (APK v2):**
- Status bar stays visible (system dialogs appear on top)
- Triple-tap on "POCKETCLAW" opens Android Settings
- Double-back (2x within 2 seconds) opens the launcher picker
- Red "OPEN SETTINGS" button appears after 5 min of gateway being offline
- ADB kill switch: `adb shell am broadcast -a com.pocketclaw.EXIT`

**Recovery if stuck on APK v1:**

1. **If ADB is authorized:**
   ```bash
   adb uninstall com.pocketclaw.launcher
   ```

2. **If ADB is unauthorized (popup hidden behind launcher):**
   - Factory reset from recovery mode (Power + Volume Down > Recovery > Wipe data)
   - After reset, install APK v2 (which has escape hatches)

3. **If the phone is unresponsive:**
   - Hold Power for 15 seconds to force reboot
   - Plug in USB before the launcher starts
   - `adb uninstall com.pocketclaw.launcher`

**"Never again" rules:**
- Always have an escape hatch in the launcher
- Always keep a backup launcher installed
- Never use `FLAG_FULLSCREEN` on a HOME launcher
- Never leave `onBackPressed(){}` empty
- Boot script with retry loops, not fixed sleeps
