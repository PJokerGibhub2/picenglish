@echo off
rem ---------------------------------------------------------------------------
rem codex.cmd - run a Codex task brief from docs\codex\tasks and save the result
rem
rem usage:  scripts\codex.cmd tasks\T1-audio-download.md
rem         scripts\codex.cmd tasks\T1-audio-download.md gpt-6.1-sol
rem
rem output: docs\codex\results\<name>.md    (last message from Codex)
rem         docs\codex\results\<name>.log   (full stdout/stderr)
rem plays a chime when finished.
rem ---------------------------------------------------------------------------
setlocal enabledelayedexpansion
set "ROOT=%~dp0.."
set "TASK=%~1"
set "MODEL=%~2"
if "%MODEL%"=="" set "MODEL=gpt-6.1-sol"
if "%TASK%"=="" (
  echo usage: scripts\codex.cmd tasks\TASKFILE.md [model]
  exit /b 2
)

set "TASKFILE=%ROOT%\%TASK%"
if not exist "%TASKFILE%" set "TASKFILE=%TASK%"
if not exist "%TASKFILE%" (
  echo error: task file not found: %TASK%
  exit /b 2
)

for %%F in ("%TASKFILE%") do set "NAME=%%~nF"
set "OUTDIR=%ROOT%\docs\codex\results"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"
set "OUT=%OUTDIR%\%NAME%.md"
set "LOG=%OUTDIR%\%NAME%.log"

set "CODEX=%USERPROFILE%\.codex\plugins\.plugin-appserver\codex.exe"
if not exist "%CODEX%" set "CODEX=%LOCALAPPDATA%\OpenAI\Codex\bin\2993767bd1dfb009\codex.exe"

echo [codex] task=%NAME% model=%MODEL%
echo [codex] brief=%TASKFILE%
"%CODEX%" exec -C "%ROOT%" --approve-for-me --skip-git-repo-check ^
  -m "%MODEL%" --color never -o "%OUT%" - < "%TASKFILE%" > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
echo [codex] exit=%RC%
if exist "%OUT%" echo [codex] result=%OUT%
if exist "%LOG%" echo [codex] log=%LOG%

rem chime: done or error
if "%RC%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object System.Media.SoundPlayer 'C:\Windows\Media\Windows Notify System Generic.wav').PlaySync()" >nul 2>nul
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object System.Media.SoundPlayer 'C:\Windows\Media\Windows Critical Stop.wav').PlaySync()" >nul 2>nul
)
endlocal & exit /b %RC%
