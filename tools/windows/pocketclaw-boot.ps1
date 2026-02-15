# PocketClaw Boot Autonomy — full post-reboot automation
# Register as Scheduled Task: see Register-PocketClawBoot.ps1
#
# Correct sequence (order matters!):
# 1. Wait for ADB device + boot complete
# 2. Clear com.termux.boot stopped flag (prevents BOOT_COMPLETED loss)
# 3. Run daemon stopper (Dirty COW + kernel tuning) — kills daemons, frees ~80 MB
#    This restarts zygote, which kills all apps including Termux
# 4. Wait for zygote + Termux to restart
# 5. Clear com.termux.boot stopped flag AGAIN (zygote restart can re-set it)
# 6. Simulate BOOT_COMPLETED → triggers Termux boot script → sshd + gateway
# 7. Verify gateway is running
# 8. Set up port forwarding
#
# Why this order: stop-daemons uses Dirty COW to overwrite app_process32,
# which triggers a zygote restart. The zygote restart kills ALL apps. So any
# gateway started before stop-daemons will be killed. We must start the
# gateway AFTER stop-daemons completes.

# Find ADB — try common locations
$adbPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe",
    "adb.exe"
)
$ADB = $null
foreach ($p in $adbPaths) {
    if (Get-Command $p -ErrorAction SilentlyContinue) {
        $ADB = $p
        break
    }
}
if (-not $ADB) {
    Write-Error "ADB not found"
    exit 1
}

$STOPPER = "/data/local/tmp/stop-daemons.sh"
$LOG = "$env:USERPROFILE\pocketclaw-boot.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Tee-Object -FilePath $LOG -Append
}

Log "=== PocketClaw boot automation started ==="

# Step 1: Wait for ADB device (up to 5 minutes)
Log "Step 1: Waiting for device..."
$waited = 0
$maxWait = 300
while ($waited -lt $maxWait) {
    $devices = & $ADB devices 2>$null | Select-String "device$"
    if ($devices) {
        Log "  Device detected"
        break
    }
    Start-Sleep 10
    $waited += 10
    if ($waited % 60 -eq 0) {
        Log "  Still waiting... (${waited}s)"
    }
}

if ($waited -ge $maxWait) {
    Log "FAIL: no device found after ${maxWait}s"
    exit 1
}

# Wait for boot_completed property
Log "  Waiting for sys.boot_completed..."
$bootWait = 0
while ($bootWait -lt 120) {
    $bootComplete = & $ADB shell getprop sys.boot_completed 2>$null
    if ($bootComplete -match "1") {
        Log "  Boot completed"
        break
    }
    Start-Sleep 5
    $bootWait += 5
}

# Step 2: Clear com.termux.boot stopped flag (pre-daemon-stopper)
Log "Step 2: Clearing com.termux.boot stopped flag..."
& $ADB shell "monkey -p com.termux.boot -c android.intent.category.LAUNCHER 1" 2>$null | Out-Null
$stoppedState = & $ADB shell "dumpsys package com.termux.boot" 2>$null | Select-String "stopped="
Log "  $stoppedState"

# Step 3: Run daemon stopper (Dirty COW — takes 1-3 minutes)
Log "Step 3: Running daemon stopper (Dirty COW)..."
Log "  This will restart zygote — all apps will restart"
$output = & $ADB shell "sh $STOPPER" 2>&1
$output | ForEach-Object {
    $line = $_.ToString().Trim()
    if ($line -match "SUCCESS|RESULTS|Daemons after|Kernel after|Zygote PID|Done|FAIL|MISSING") {
        Log "  $line"
    }
}

if ($LASTEXITCODE -eq 0) {
    Log "  Daemon stopper completed"
} else {
    Log "  WARNING: Daemon stopper exit code $LASTEXITCODE"
}

# Step 4: Wait for zygote + Termux to restart after Dirty COW
Log "Step 4: Waiting for zygote + Termux restart..."
Start-Sleep 15

# Wait for Termux process to appear
$termuxWait = 0
while ($termuxWait -lt 60) {
    $termux = & $ADB shell "ps" 2>$null | Select-String "com.termux$"
    if ($termux) {
        Log "  Termux restarted (${termuxWait}s)"
        break
    }
    Start-Sleep 5
    $termuxWait += 5
}
if ($termuxWait -ge 60) {
    Log "  WARNING: Termux not detected, launching manually..."
    & $ADB shell "am start -n com.termux/.app.TermuxActivity" 2>$null | Out-Null
    Start-Sleep 10
}

# Step 5: Clear com.termux.boot stopped flag AGAIN
# The zygote restart from Dirty COW can re-set the stopped flag
Log "Step 5: Clearing com.termux.boot stopped flag (post-restart)..."
& $ADB shell "monkey -p com.termux.boot -c android.intent.category.LAUNCHER 1" 2>$null | Out-Null
Start-Sleep 2
$stoppedState = & $ADB shell "dumpsys package com.termux.boot" 2>$null | Select-String "stopped="
Log "  $stoppedState"

# Step 6: Simulate BOOT_COMPLETED to trigger Termux boot script
# This runs ~/.termux/boot/start-pocketclaw.sh → sshd + crons + gateway
Log "Step 6: Sending BOOT_COMPLETED to com.termux.boot..."
& $ADB shell "am broadcast -a android.intent.action.BOOT_COMPLETED -p com.termux.boot" 2>$null | Out-Null
Log "  Broadcast sent, waiting 60s for gateway startup..."
Start-Sleep 60

# Step 7: Verify gateway is running
Log "Step 7: Verifying gateway..."
$gwProcess = & $ADB shell "ps" 2>$null | Select-String "openclaw-gateway"
if ($gwProcess) {
    $rssKb = ($gwProcess.ToString() -split '\s+')[5]
    $rssMb = [math]::Round([int]$rssKb / 1024)
    Log "  Gateway RUNNING (${rssMb} MB RSS)"
} else {
    Log "  WARNING: Gateway not detected, may need more time"
    Log "  Check: adb shell ps | grep openclaw"
}

# Check sshd
$sshdProcess = & $ADB shell "ps" 2>$null | Select-String "sshd"
if ($sshdProcess) {
    Log "  sshd RUNNING"
} else {
    Log "  WARNING: sshd not detected"
}

# Check RAM
$memFree = & $ADB shell "cat /proc/meminfo" 2>$null | Select-String "MemFree"
$memTotal = & $ADB shell "cat /proc/meminfo" 2>$null | Select-String "MemTotal"
Log "  RAM: $memFree / $memTotal"

# Step 8: Set up port forwarding
Log "Step 8: Port forwarding..."
& $ADB forward tcp:8022 tcp:8022 2>$null
& $ADB forward tcp:9000 tcp:9000 2>$null
Log "  8022->8022 (SSH), 9000->9000 (gateway)"

Log "=== PocketClaw boot automation finished ==="
