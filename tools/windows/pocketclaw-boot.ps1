# PocketClaw Boot Autonomy — runs daemon stopper when phone is detected
# Register as Scheduled Task: see Register-PocketClawBoot.ps1
#
# Flow:
# 1. Wait for ADB device
# 2. Run daemon stopper (Dirty COW + kernel tuning)
# 3. Set up port forwarding
# 4. Exit (one-shot per boot)

$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$STOPPER = "/data/local/tmp/stop-daemons.sh"
$LOG = "$env:USERPROFILE\pocketclaw-boot.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Tee-Object -FilePath $LOG -Append
}

Log "PocketClaw boot script started"

# Wait for device (up to 5 minutes)
$waited = 0
$maxWait = 300
while ($waited -lt $maxWait) {
    $devices = & $ADB devices 2>$null | Select-String "device$"
    if ($devices) {
        Log "Device detected"
        break
    }
    Start-Sleep 10
    $waited += 10
    if ($waited % 60 -eq 0) {
        Log "Waiting for device... (${waited}s)"
    }
}

if ($waited -ge $maxWait) {
    Log "Timeout: no device found after ${maxWait}s"
    exit 1
}

# Wait for boot to complete (device might be in early boot)
Log "Waiting for boot completion..."
$bootWait = 0
while ($bootWait -lt 120) {
    $bootComplete = & $ADB shell getprop sys.boot_completed 2>$null
    if ($bootComplete -match "1") {
        Log "Boot completed"
        break
    }
    Start-Sleep 5
    $bootWait += 5
}

# Extra wait for Termux boot to finish starting the gateway
Log "Waiting 30s for Termux boot..."
Start-Sleep 30

# Run daemon stopper
Log "Running daemon stopper..."
$output = & $ADB shell "sh $STOPPER" 2>&1
$output | ForEach-Object { Log "  $_" }

if ($LASTEXITCODE -eq 0) {
    Log "Daemon stopper completed successfully"
} else {
    Log "Daemon stopper failed (exit: $LASTEXITCODE)"
}

# Set up port forwarding
Log "Setting up port forwarding..."
& $ADB forward tcp:8022 tcp:8022 2>$null
& $ADB forward tcp:9000 tcp:9000 2>$null
Log "Port forwarding: 8022->8022, 9000->9000"

# Verify gateway
Start-Sleep 5
try {
    $status = Invoke-WebRequest -Uri "http://127.0.0.1:9000/api/status" -TimeoutSec 5 -UseBasicParsing
    $json = $status.Content | ConvertFrom-Json
    Log "Gateway status: $($json.gateway.status), RAM: $($json.ram.used)/$($json.ram.total) MB"
} catch {
    Log "Gateway not responding (may need more time)"
}

Log "PocketClaw boot script finished"
