@echo off
rem notify.cmd - play a completion sound (works regardless of ExecutionPolicy)
rem usage: scripts\notify.cmd [done^|error]
setlocal
set "KIND=%~1"
if "%KIND%"=="" set "KIND=done"
set "WAV=C:\Windows\Media\Windows Notify System Generic.wav"
if /I "%KIND%"=="error" set "WAV=C:\Windows\Media\Windows Critical Stop.wav"
if not exist "%WAV%" set "WAV=C:\Windows\Media\notify.wav"
if not exist "%WAV%" set "WAV=C:\Windows\Media\chimes.wav"
if exist "%WAV%" powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object System.Media.SoundPlayer '%WAV%').PlaySync()" >nul 2>nul
if errorlevel 1 powershell -NoProfile -ExecutionPolicy Bypass -Command "[console]::beep(880,150);Start-Sleep -Milliseconds 60;[console]::beep(1320,180)" >nul 2>nul
endlocal
exit /b 0