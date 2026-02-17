@echo off
:: PocketClaw Wake Lock — Disables Doze mode when phone is connected via USB
:: Run at Windows startup or manually after plugging in the phone.
:: Cost: 0 MB RAM (vs 48 MB for termux-wake-lock)

:loop
adb devices 2>nul | findstr /C:"device" >nul 2>nul
if %ERRORLEVEL%==0 (
    adb shell "dumpsys deviceidle disable" >nul 2>nul
    echo [%date% %time%] Doze disabled
    goto :done
)
echo Waiting for phone...
timeout /t 5 /noretry >nul
goto :loop

:done
:: Keep checking every 5 min in case phone reboots
:monitor
timeout /t 300 /noretry >nul
adb shell "dumpsys deviceidle disable" >nul 2>nul
goto :monitor
