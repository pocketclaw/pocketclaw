# Register PocketClaw boot script as a Windows Scheduled Task
# Run this script once (elevated) to set up auto-run on Windows login

$taskName = "PocketClaw Boot"
$scriptPath = "$env:USERPROFILE\pocketclaw-boot.ps1"

# Remove existing task if any
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Auto-runs PocketClaw daemon stopper when phone is connected" `
    -RunLevel Highest

Write-Host "Registered '$taskName' scheduled task"
Write-Host "It will run on login and execute daemon stopper when phone is detected"
Write-Host "Log file: $env:USERPROFILE\pocketclaw-boot.log"
